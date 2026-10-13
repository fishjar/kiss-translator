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
    if (data.type === "available" && this.finishDiscovery) {
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
      this.disconnect(
        fileError("DISCONNECTED", "扩展连接已断开，请重新连接"),
        true
      );
      return;
    }
    if (
      data.type === "contextChanged" &&
      data.sessionId === this.session?.sessionId
    ) {
      this.notify({ type: "contextChanged" });
      return;
    }
    if (data.type === "progress") {
      if (data.sessionId === this.session?.sessionId)
        this.pending.get(data.requestId)?.onProgress?.(data.progress);
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

  async connect(extensionId, { reconnecting = false } = {}) {
    if (this.session) return this.session;
    if (this.connecting) return this.connecting;
    if (this.disposed) throw fileError("DISCONNECTED", "页面已关闭");
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAt = null;
    this.notify({ type: "connecting", reconnecting: reconnecting || !!this.reconnectAttempts });
    this.reconnectEnabled = true;
    if (!reconnecting && extensionId) this.reconnectExtensionId = extensionId;
    extensionId = extensionId || this.reconnectExtensionId;
    const version = this.connectionVersion || 0;
    const checkConnection = () => {
      if (this.disposed || version !== (this.connectionVersion || 0))
        throw fileError("DISCONNECTED", "连接已取消");
    };
    const attempt = (async () => {
      this.available.clear();
      this.bridge = null;
      await new Promise((resolve) => {
        this.discoveryTimer = setTimeout(resolve, 500);
        this.finishDiscovery = resolve;
        this.post({ type: "discover" });
      });
      checkConnection();
      this.finishDiscovery = null;
      const bridges = [...this.available.values()];
      if (!bridges.length)
        throw fileError(
          "EXTENSION_MISSING",
          "未连接兼容扩展，请安装或更新 Edge、Chrome 或 Firefox 扩展"
        );
      const selected = bridges.find((bridge) => bridge.extensionId === extensionId);
      if (!selected && bridges.length > 1) {
        const error = fileError(
          "MULTIPLE_EXTENSIONS",
          "检测到多个扩展，请选择连接对象"
        );
        error.extensions = bridges.map((bridge) => bridge.extensionId);
        throw error;
      }
      this.bridge = selected || bridges[0];
      const session = await this.request("handshake", {}, { timeoutMs: 10000 });
      checkConnection();
      if (
        session?.protocolVersion !== FILE_PROTOCOL ||
        session.extensionId !== this.bridge.extensionId ||
        typeof session.sessionId !== "string" ||
        !session.sessionId
      ) {
        throw fileError(
          "INCOMPATIBLE_PROTOCOL",
          "扩展与网页协议不兼容，请更新扩展"
        );
      }
      this.session = session;
      this.reconnectExtensionId = session.extensionId;
      this.reconnectEnabled = true;
      this.reconnectAttempts = 0;
      this.heartbeat = setInterval(() => {
        const currentSession = this.session;
        this.request("ping", {}, { timeoutMs: 10000 }).catch((error) => {
          if (currentSession && this.session === currentSession)
            this.disconnect(error, true);
        });
      }, 20000);
      this.notify({ type: "connected", session: this.session, reconnecting });
      return this.session;
    })().catch((error) => {
      if (!this.disposed && version === (this.connectionVersion || 0)) {
        // A silent port can still be present in the content script. Release it
        // before discovery so the next attempt opens a fresh backend connection.
        this.post({ type: "disconnect" });
        this.bridge = null;
        this.finishDiscovery = null;
        clearTimeout(this.discoveryTimer);
        if (["MULTIPLE_EXTENSIONS", "INCOMPATIBLE_PROTOCOL"].includes(error.code))
          this.reconnectEnabled = false;
        this.notify({ type: "reconnectFailed", error });
        this.scheduleReconnect();
      }
      throw error;
    }).finally(() => {
      if (this.connecting === attempt) this.connecting = null;
    });
    this.connecting = attempt;
    return attempt;
  }

  request(method, params = {}, { signal, timeoutMs = 300000, onProgress } = {}) {
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
      this.pending.set(requestId, { resolve, reject, cleanup, onProgress });
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

  scheduleReconnect() {
    if (!this.reconnectEnabled || this.disposed || this.reconnectTimer) return;
    const delay = Math.min(
      1000 * 2 ** Math.min(this.reconnectAttempts || 0, 5),
      30000
    );
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    this.reconnectAt = Date.now() + delay;
    const version = this.connectionVersion || 0;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAt = null;
      if (!this.reconnectEnabled || this.disposed) return;
      this.notify({ type: "reconnecting" });
      try {
        await this.connect(this.reconnectExtensionId, { reconnecting: true });
      } catch (error) {
        if (this.disposed || version !== (this.connectionVersion || 0)) return;
        this.scheduleReconnect();
      }
    }, delay);
    this.notify({ type: "reconnectScheduled", reconnectAt: this.reconnectAt });
  }

  disconnect(
    error = fileError("DISCONNECTED", "扩展连接已断开"),
    reconnect = false
  ) {
    this.connectionVersion = (this.connectionVersion || 0) + 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAt = null;
    clearTimeout(this.discoveryTimer);
    this.finishDiscovery?.();
    this.finishDiscovery = null;
    this.connecting = null;
    if (!reconnect) this.reconnectEnabled = false;
    this.post({ type: "disconnect" });
    clearInterval(this.heartbeat);
    this.pending.forEach((request) => {
      request.cleanup();
      request.reject(error);
    });
    this.pending.clear();
    this.session = null;
    this.bridge = null;
    this.notify({ type: "disconnected", error });
    if (reconnect) this.scheduleReconnect();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.discoveryTimer);
    this.finishDiscovery?.();
    this.disconnect();
    this.listeners.clear();
    this.target.removeEventListener("message", this.receive);
  }

  recognize(file, selection, signal, options = {}) {
    return this.uploadImage(file, "recognizeImage", {
      serviceId: selection?.apiSlug,
      capability: selection?.capability,
      taskMode: options.taskMode || "doc",
      promptSlug: options.promptSlug || "",
      requireCoordinates: options.requireCoordinates === true,
      cacheMode: options.cacheMode,
    }, signal, options.onProgress);
  }

  analyzeLayout(file, modelId, device, signal, serviceId, cacheMode) {
    return this.uploadImage(
      file,
      "analyzeLayout",
      { modelId, device, ...(serviceId && { serviceId }), ...(cacheMode && { cacheMode }) },
      signal
    );
  }

  async uploadImage(file, method, params, signal, onProgress) {
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
      return await this.request(method, { uploadId, ...params }, { signal, onProgress });
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
      { text, kind: context.kind || "txt", scene, cacheMode: context.cacheMode },
      { signal }
    )
    .then((result) => result.text);
}

if (module.hot)
  module.hot.dispose(() => {
    client?.dispose();
    client = null;
  });
