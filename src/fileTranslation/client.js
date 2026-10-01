import {
  FILE_CHANNEL,
  FILE_PROTOCOL,
  IMAGE_CHUNK_BYTES,
  fileError,
} from "./protocol";

export class FileTranslationClient {
  constructor(target = window) {
    this.target = target;
    this.pending = new Map();
    this.listeners = new Set();
    this.available = new Map();
    this.receive = this.receive.bind(this);
    target.addEventListener("message", this.receive);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(event) {
    this.listeners.forEach((listener) => listener(event));
  }
  post(message) {
    this.target.postMessage(
      { channel: FILE_CHANNEL, direction: "web", ...this.bridge, ...message },
      this.target.location.origin
    );
  }

  receive({ source, origin, data }) {
    if (
      source !== this.target ||
      origin !== this.target.location.origin ||
      data?.channel !== FILE_CHANNEL ||
      data.direction !== "extension"
    )
      return;
    if (data.type === "available") {
      this.available.set(data.extensionId, {
        extensionId: data.extensionId,
        bridgeId: data.bridgeId,
      });
      return;
    }
    if (
      data.extensionId !== this.bridge?.extensionId ||
      data.bridgeId !== this.bridge?.bridgeId
    )
      return;
    if (data.type === "disconnected") {
      this.disconnect(fileError("DISCONNECTED", "扩展连接已断开，请重新连接"));
      return;
    }
    if (
      data.type === "contextChanged" &&
      data.sessionId === this.session?.sessionId
    ) {
      this.notify({ type: "contextChanged" });
      return;
    }
    if (data.type !== "response") return;
    const request = this.pending.get(data.requestId);
    if (!request) return;
    this.pending.delete(data.requestId);
    request.cleanup();
    if (data.error)
      request.reject(fileError(data.error.code, data.error.message));
    else request.resolve(data.result);
  }

  async connect(extensionId) {
    if (this.session) return this.session;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.available.clear();
      this.post({ type: "discover" });
      await new Promise((resolve) => {
        this.discoveryTimer = setTimeout(resolve, 500);
        this.finishDiscovery = resolve;
      });
      if (this.disposed) throw fileError("DISCONNECTED", "页面已关闭");
      const bridges = [...this.available.values()];
      if (!bridges.length)
        throw fileError(
          "EXTENSION_MISSING",
          "未连接兼容扩展，请安装或更新 Edge、Chrome 或 Firefox 扩展"
        );
      if (!extensionId && bridges.length > 1) {
        const error = fileError(
          "MULTIPLE_EXTENSIONS",
          "检测到多个扩展，请选择连接对象"
        );
        error.extensions = bridges.map((bridge) => bridge.extensionId);
        throw error;
      }
      this.bridge = bridges.find(
        (bridge) => !extensionId || bridge.extensionId === extensionId
      );
      if (!this.bridge) throw fileError("EXTENSION_MISSING", "所选扩展不可用");
      const session = await this.request("handshake", {}, { timeoutMs: 10000 });
      if (
        session?.protocolVersion !== FILE_PROTOCOL ||
        session.extensionId !== this.bridge.extensionId ||
        typeof session.sessionId !== "string" ||
        !session.sessionId
      ) {
        this.post({ type: "disconnect" });
        throw fileError(
          "INCOMPATIBLE_PROTOCOL",
          "扩展与网页协议不兼容，请更新扩展"
        );
      }
      this.session = session;
      this.heartbeat = setInterval(
        () =>
          this.request("ping", {}, { timeoutMs: 10000 }).catch((error) =>
            this.disconnect(error)
          ),
        20000
      );
      this.notify({ type: "connected", session: this.session });
      return this.session;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  request(method, params = {}, { signal, timeoutMs = 300000 } = {}) {
    if (signal?.aborted)
      return Promise.reject(new DOMException("已取消", "AbortError"));
    if (this.disposed || (!this.session && method !== "handshake"))
      return Promise.reject(fileError("DISCONNECTED", "请先连接扩展"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.post({
          type: "request",
          request: {
            requestId: crypto.randomUUID(),
            sessionId: this.session?.sessionId,
            method: "cancel",
            params: { requestId },
          },
        });
      };
      const abort = () => {
        cancel();
        this.pending.delete(requestId);
        cleanup();
        reject(new DOMException("已取消", "AbortError"));
      };
      const timer = setTimeout(() => {
        cancel();
        this.pending.delete(requestId);
        cleanup();
        reject(fileError("REQUEST_TIMEOUT", "扩展请求超时，已取消"));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      this.pending.set(requestId, { resolve, reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      this.post({
        type: "request",
        request: {
          requestId,
          protocolVersion: FILE_PROTOCOL,
          sessionId: this.session?.sessionId,
          method,
          params,
        },
      });
    });
  }

  disconnect(error = fileError("DISCONNECTED", "扩展连接已断开")) {
    this.post({ type: "disconnect" });
    clearInterval(this.heartbeat);
    this.pending.forEach((request) => {
      request.cleanup();
      request.reject(error);
    });
    this.pending.clear();
    this.session = null;
    this.notify({ type: "disconnected", error });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.discoveryTimer);
    this.finishDiscovery?.();
    this.disconnect();
    this.listeners.clear();
    this.target.removeEventListener("message", this.receive);
  }

  async recognize(file, serviceId, signal) {
    const { uploadId } = await this.request(
      "uploadBegin",
      { size: file.size, type: file.type },
      { signal }
    );
    try {
      let sequence = 0;
      for (let offset = 0; offset < file.size; offset += IMAGE_CHUNK_BYTES) {
        if (signal?.aborted) throw new DOMException("已取消", "AbortError");
        const bytes = new Uint8Array(
          await file.slice(offset, offset + IMAGE_CHUNK_BYTES).arrayBuffer()
        );
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await this.request(
          "uploadChunk",
          { uploadId, sequence: sequence++, data: btoa(binary) },
          { signal }
        );
      }
      return await this.request(
        "recognizeImage",
        { uploadId, serviceId },
        { signal }
      );
    } finally {
      if (this.session)
        this.request("cancel", { uploadId }, { timeoutMs: 10000 }).catch(
          () => {}
        );
    }
  }
}

let client;
export function getFileClient() {
  if (!client || client.disposed) client = new FileTranslationClient();
  return client;
}

export function translateFileText(text, scene, _setting, signal, context = {}) {
  return getFileClient()
    .request(
      "translateText",
      { text, kind: context.kind || "txt", scene },
      { signal }
    )
    .then((result) => result.text);
}

if (module.hot)
  module.hot.dispose(() => {
    client?.dispose();
    client = null;
  });
