import { isExtensionContext, type ModelRecord } from "../core/types";
import {
  KISS_AI_RPC_CHANNEL,
  nextRpcId,
  type AiRpcProgress,
  type AiRpcRequest,
  type AiRpcResponse,
  type AiRpcService,
  type AiRpcStreamEvent,
  type ModelImportTaskResult,
  type RpcChannelEnvelope,
  type ServiceSessionState,
} from "./rpc";
import { getInPageRuntimeManager, type RuntimeManager } from "./runtimeManager";

export interface RequestHooks {
  onProgress?: (progress: AiRpcProgress) => void;
  onStream?: (stream: AiRpcStreamEvent) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RuntimeHostAdapter {
  ensure(): Promise<void>;
  close(): Promise<void>;
  cancel(requestId: string, reason?: string): void;
  request<TReq, TRes>(
    request: AiRpcRequest<TReq>,
    hooks?: RequestHooks
  ): Promise<TRes>;
  isAvailable(): Promise<boolean>;
  onModelBroadcast(cb: (id: string, record: ModelRecord) => void): () => void;
  onServiceState(cb: (state: ServiceSessionState) => void): () => void;
  waitForImportTask(
    taskId: string,
    modelId: string,
    timeoutMs?: number
  ): Promise<ModelImportTaskResult>;
  cancelImportWaiter(taskId: string): void;
  getPendingCount(): number;
  onPendingChange(cb: (count: number) => void): () => void;
}

interface PendingRpc {
  id: string;
  resolve: (val: any) => void;
  reject: (err: Error) => void;
  hooks?: RequestHooks;
  timeoutMs: number;
  strictDeadline: boolean;
  timer: ReturnType<typeof setTimeout>;
  cleanupSignal?: () => void;
}

interface PendingImportWaiter {
  taskId: string;
  modelId: string;
  resolve: (val: ModelImportTaskResult) => void;
  reject: (err: Error) => void;
  timeoutMs: number;
  timer: ReturnType<typeof setTimeout>;
}

const ALL_AI_SERVICES: AiRpcService[] = [
  "decision",
  "asr",
  "ocr",
  "llm",
  "vlm",
  "tts",
];

export interface ChromiumOffscreenHostOptions {
  defaultTimeoutMs?: number;
  channelFactory?: (name: string) => BroadcastChannel;
  ensureOffscreenFn?: () => Promise<void>;
  closeOffscreenFn?: () => Promise<void>;
}

/**
 * Chrome / Edge MV3 扩展模式下的 Offscreen Runtime Host 适配器（文档 §4 & §5.2）。
 * 具备完整的 RPC 结束路径：
 * - 每个 pending 请求均设超时计时器（流式/进度回调时自动续期看门狗）；
 * - 收到响应、发送失败、超时、取消或 Offscreen 关闭时统一清理 timer + Map 并结算 Promise；
 * - 宿主关闭/崩溃时立即拒绝所有进行中请求并使客户端就绪状态失效，旧请求绝不自动重发；
 * - 宿主重建后，新发起的请求自动通过 ensure() 恢复执行。
 */
export class ChromiumOffscreenHost implements RuntimeHostAdapter {
  private channel: BroadcastChannel | null = null;
  private pending = new Map<string, PendingRpc>();
  private importWaiters = new Map<string, PendingImportWaiter>();
  private pingWaiters = new Map<
    string,
    { resolve: (alive: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private modelListeners = new Set<(id: string, record: ModelRecord) => void>();
  private serviceListeners = new Set<(state: ServiceSessionState) => void>();
  private pendingListeners = new Set<(count: number) => void>();
  private ensuring: Promise<void> | null = null;
  private closing: Promise<void> | null = null;
  private closeConfirmation: (() => void) | null = null;
  private readonly defaultTimeoutMs: number;
  private readonly channelFactory: (name: string) => BroadcastChannel;
  private readonly customEnsureFn?: () => Promise<void>;
  private readonly customCloseFn?: () => Promise<void>;

  constructor(options: ChromiumOffscreenHostOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.channelFactory =
      options.channelFactory ?? ((name) => new BroadcastChannel(name));
    this.customEnsureFn = options.ensureOffscreenFn;
    this.customCloseFn = options.closeOffscreenFn;
  }

  getPendingCount(): number {
    return this.pending.size + this.importWaiters.size;
  }

  onPendingChange(cb: (count: number) => void): () => void {
    this.pendingListeners.add(cb);
    cb(this.getPendingCount());
    return () => { this.pendingListeners.delete(cb); };
  }

  private notifyPending(): void {
    for (const cb of this.pendingListeners) {
      try { cb(this.getPendingCount()); } catch { /* 隔离订阅者异常 */ }
    }
  }

  private getChannel(): BroadcastChannel {
    if (!this.channel) {
      const ch = this.channelFactory(KISS_AI_RPC_CHANNEL);
      ch.onmessage = (e: MessageEvent<RpcChannelEnvelope>) => {
        this.handleEnvelope(e.data);
      };
      this.channel = ch;
    }
    return this.channel;
  }

  private settlePending(
    id: string,
    outcome: { ok: true; value: any } | { ok: false; error: Error }
  ): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    this.notifyPending();
    clearTimeout(p.timer);
    p.cleanupSignal?.();
    if (outcome.ok) {
      p.resolve(outcome.value);
    } else {
      p.reject(outcome.error);
    }
  }

  private settleImportWaiter(
    taskId: string,
    outcome:
      | { ok: true; value: ModelImportTaskResult }
      | { ok: false; error: Error }
  ): void {
    const w = this.importWaiters.get(taskId);
    if (!w) return;
    this.importWaiters.delete(taskId);
    this.notifyPending();
    clearTimeout(w.timer);
    if (outcome.ok) {
      w.resolve(outcome.value);
    } else {
      w.reject(outcome.error);
    }
  }

  private refreshImportTimersForModel(modelId: string): void {
    for (const w of this.importWaiters.values()) {
      if (w.modelId !== modelId) continue;
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        this.settleImportWaiter(w.taskId, {
          ok: false,
          error: new Error(
            `REQUEST_TIMEOUT: 模型导入等待超时 (${w.timeoutMs}ms)`
          ),
        });
      }, w.timeoutMs);
    }
  }

  private refreshPendingTimer(id: string): void {
    const p = this.pending.get(id);
    if (!p || p.strictDeadline) return;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      this.onRequestTimeout(id, p.timeoutMs);
    }, p.timeoutMs);
  }

  private onRequestTimeout(id: string, timeoutMs: number): void {
    const reason = `REQUEST_TIMEOUT: Offscreen RPC 请求超时 (${timeoutMs}ms)`;
    try {
      this.getChannel().postMessage({
        kind: "cancel",
        id,
        reason,
      } satisfies RpcChannelEnvelope);
    } catch {
      // 忽略通道发送失败
    }
    this.settlePending(id, { ok: false, error: new Error(reason) });
  }

  private handleHostClosed(reason = "Offscreen 运行时宿主已关闭"): void {
    // 1. 清理所有 ping 等待器
    for (const [id, w] of this.pingWaiters.entries()) {
      clearTimeout(w.timer);
      this.pingWaiters.delete(id);
      w.resolve(false);
    }
    // 2. 拒绝并清理所有进行中的 pending 请求（不自动重发）
    const err = new Error(`HOST_CLOSED: ${reason}，进行中的请求已中断`);
    for (const id of [...this.pending.keys()]) {
      this.settlePending(id, { ok: false, error: err });
    }
    // 2b. 拒绝并清理所有进行中的模型导入等待任务（避免导入界面在 Offscreen 关闭后无限等待）
    const importErr = new Error(
      `HOST_CLOSED: ${reason}，进行中的模型导入已中断`
    );
    for (const taskId of [...this.importWaiters.keys()]) {
      this.settleImportWaiter(taskId, { ok: false, error: importErr });
    }
    // 3. 广播全部服务已卸载，使所有客户端与 UI 的就绪状态立即失效
    for (const service of ALL_AI_SERVICES) {
      const state: ServiceSessionState = {
        service,
        modelId: null,
        sessionVersion: -1,
        state: "unloaded",
        reason,
      };
      for (const fn of this.serviceListeners) {
        try {
          fn(state);
        } catch {
          // 忽略监听器异常
        }
      }
    }
  }

  private handleEnvelope(env: RpcChannelEnvelope | undefined): void {
    if (!env || typeof env !== "object") return;
    switch (env.kind) {
      case "pong": {
        const w = this.pingWaiters.get(env.id);
        if (w) {
          clearTimeout(w.timer);
          this.pingWaiters.delete(env.id);
          w.resolve(true);
        }
        break;
      }
      case "progress": {
        const p = this.pending.get(env.progress.id);
        if (p) {
          this.refreshPendingTimer(env.progress.id);
          p.hooks?.onProgress?.(env.progress);
        }
        break;
      }
      case "stream": {
        const p = this.pending.get(env.stream.id);
        if (p) {
          this.refreshPendingTimer(env.stream.id);
          p.hooks?.onStream?.(env.stream);
        }
        break;
      }
      case "response": {
        if (!this.pending.has(env.response.id)) break;
        if (env.response.ok) {
          this.settlePending(env.response.id, {
            ok: true,
            value: env.response.result,
          });
        } else {
          const code = env.response.error?.code;
          const msg =
            env.response.error?.message || "Offscreen RPC 执行失败";
          const fullMsg = code ? `${code}: ${msg}` : msg;
          this.settlePending(env.response.id, {
            ok: false,
            error: new Error(fullMsg),
          });
        }
        break;
      }
      case "service-state": {
        for (const fn of this.serviceListeners) {
          try {
            fn(env.state);
          } catch {
            // 忽略监听器异常
          }
        }
        break;
      }
      case "host-closed": {
        this.closeConfirmation?.();
        this.handleHostClosed(env.reason);
        break;
      }
      case "model-broadcast": {
        this.refreshImportTimersForModel(env.id);
        for (const fn of this.modelListeners) {
          try {
            fn(env.id, env.record);
          } catch {
            // 忽略监听器异常
          }
        }
        break;
      }
      case "model-import-result": {
        const res = env.result;
        if (res.ok) {
          this.settleImportWaiter(res.taskId, { ok: true, value: res });
        } else {
          this.settleImportWaiter(res.taskId, {
            ok: false,
            error: new Error(res.error || "模型导入失败"),
          });
        }
        break;
      }
    }
  }

  private pingOffscreen(timeoutMs = 800): Promise<boolean> {
    const ch = this.getChannel();
    const id = nextRpcId("ping");
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        this.pingWaiters.delete(id);
        resolve(false);
      }, timeoutMs);
      this.pingWaiters.set(id, {
        resolve,
        timer,
      });
      try {
        ch.postMessage({ kind: "ping", id } satisfies RpcChannelEnvelope);
      } catch {
        clearTimeout(timer);
        this.pingWaiters.delete(id);
        resolve(false);
      }
    });
  }

  private async createOffscreenDirectlyOrViaSw(): Promise<void> {
    if (this.customEnsureFn) {
      await this.customEnsureFn();
      return;
    }
    if (typeof chrome !== "undefined" && chrome.offscreen?.createDocument) {
      const url = chrome.runtime.getURL("offscreen.html");
      if ("getContexts" in chrome.runtime) {
        const contexts = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
          documentUrls: [url],
        });
        if (contexts.length > 0) return;
      } else if (await chrome.offscreen.hasDocument?.()) {
        return;
      }
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: [chrome.offscreen.Reason.WORKERS],
          justification:
            "Host local AI workers for ASR, OCR, translation, TTS, LLM and decision inference.",
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("Only a single offscreen") ||
          msg.includes("already exists")
        ) {
          return;
        }
      }
    }
    await chrome.runtime.sendMessage({
      action: "local_ai_host", args: { action: "ensure" },
    });
  }

  async ensure(): Promise<void> {
    // 状态订阅会立即请求刷新；等旧宿主关闭完再创建，避免关闭/重建互相覆盖。
    if (this.closing) await this.closing;
    if (await this.pingOffscreen(250)) return;
    if (!this.ensuring) {
      this.ensuring = (async () => {
        await this.createOffscreenDirectlyOrViaSw();
        for (let i = 0; i < 15; i++) {
          if (await this.pingOffscreen(350)) return;
        }
        throw new Error("Offscreen Runtime Host 启动超时");
      })().finally(() => {
        this.ensuring = null;
      });
    }
    await this.ensuring;
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = Promise.resolve().then(async () => {
      this.handleHostClosed("Offscreen 宿主已主动关闭");
      if (this.customCloseFn) { await this.customCloseFn(); return; }
      // closeDocument 可能先于 pagehide 广播完成；新请求必须等旧宿主通知落定。
      let finish: (confirmed: boolean) => void = () => {};
      const confirmation = this.channel ? new Promise<boolean>(resolve => {
        const timer = setTimeout(() => finish(false), 1000);
        finish = confirmed => { clearTimeout(timer); this.closeConfirmation = null; resolve(confirmed); };
        this.closeConfirmation = () => finish(true);
      }) : Promise.resolve(true);
      try {
        let direct = false;
        if (typeof chrome !== "undefined" && chrome.offscreen?.closeDocument) {
          try { await chrome.offscreen.closeDocument(); direct = true; } catch { /* 改由后台关闭 */ }
        }
        if (!direct && typeof chrome !== "undefined" && chrome.runtime?.sendMessage)
          await chrome.runtime.sendMessage({ action: "local_ai_host", args: { action: "close" } });
        if (!await confirmation) throw new Error("HOST_CLOSED: 宿主关闭确认超时");
      } finally { finish(false); }
    }).finally(() => { this.closing = null; });
    return this.closing;
  }

  cancel(
    requestId: string,
    reason = "REQUEST_CANCELLED: 请求已取消"
  ): void {
    try {
      this.getChannel().postMessage({
        kind: "cancel",
        id: requestId,
        reason,
      } satisfies RpcChannelEnvelope);
    } catch {
      // 忽略发送失败
    }
    this.settlePending(requestId, { ok: false, error: new Error(reason) });
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensure();
      return true;
    } catch {
      return false;
    }
  }

  async request<TReq, TRes>(
    request: AiRpcRequest<TReq>,
    hooks?: RequestHooks
  ): Promise<TRes> {
    if (hooks?.signal?.aborted) {
      throw new Error("REQUEST_CANCELLED: 请求已取消");
    }
    await this.ensure();
    const ch = this.getChannel();
    const strictDeadline = typeof request.deadlineMs === "number" && request.deadlineMs > 0;
    const timeoutMs =
      request.deadlineMs ?? hooks?.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.onRequestTimeout(request.id, timeoutMs);
      }, timeoutMs);

      let cleanupSignal: (() => void) | undefined;
      if (hooks?.signal) {
        const onAbort = () => {
          this.cancel(request.id, "REQUEST_CANCELLED: 请求已取消");
        };
        hooks.signal.addEventListener("abort", onAbort, { once: true });
        cleanupSignal = () =>
          hooks.signal?.removeEventListener("abort", onAbort);
      }

      this.pending.set(request.id, {
        id: request.id,
        resolve,
        reject,
        hooks,
        timeoutMs,
        strictDeadline,
        timer,
        cleanupSignal,
      });
      this.notifyPending();

      try {
        ch.postMessage({
          kind: "request",
          request,
        } satisfies RpcChannelEnvelope);
      } catch (err) {
        const sendErr =
          err instanceof Error
            ? err
            : new Error(`RPC 发送失败: ${String(err)}`);
        this.settlePending(request.id, { ok: false, error: sendErr });
      }
    });
  }

  onModelBroadcast(cb: (id: string, record: ModelRecord) => void): () => void {
    this.getChannel();
    this.modelListeners.add(cb);
    return () => this.modelListeners.delete(cb);
  }

  onServiceState(cb: (state: ServiceSessionState) => void): () => void {
    this.getChannel();
    this.serviceListeners.add(cb);
    return () => this.serviceListeners.delete(cb);
  }

  waitForImportTask(
    taskId: string,
    modelId: string,
    timeoutMs = Math.max(this.defaultTimeoutMs, 600_000)
  ): Promise<ModelImportTaskResult> {
    this.getChannel();
    return new Promise<ModelImportTaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleImportWaiter(taskId, {
          ok: false,
          error: new Error(
            `REQUEST_TIMEOUT: 模型导入等待超时 (${timeoutMs}ms)`
          ),
        });
      }, timeoutMs);
      this.importWaiters.set(taskId, {
        taskId,
        modelId,
        resolve,
        reject,
        timeoutMs,
        timer,
      });
      this.notifyPending();
    });
  }

  cancelImportWaiter(taskId: string): void {
    const w = this.importWaiters.get(taskId);
    if (!w) return;
    this.importWaiters.delete(taskId);
    this.notifyPending();
    clearTimeout(w.timer);
  }
}

/**
 * 网页模式（vite.web.ts）或测试环境下的同进程 RuntimeHost 实现。
 * 直接调用本地 RuntimeManager 单例，与 Offscreen 共享 100% 相同的调度与 Worker 体系。
 */
export class InPageRuntimeHost implements RuntimeHostAdapter {
  private modelListeners = new Set<(id: string, record: ModelRecord) => void>();
  private serviceListeners = new Set<(state: ServiceSessionState) => void>();
  private pendingListeners = new Set<(count: number) => void>();
  private pending = new Map<
    string,
    {
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      cleanupSignal?: () => void;
    }
  >();
  private importWaiters = new Map<string, PendingImportWaiter>();
  private bound = false;
  private customManager?: RuntimeManager;
  private readonly defaultTimeoutMs: number;

  constructor(options?: {
    manager?: RuntimeManager;
    defaultTimeoutMs?: number;
  }) {
    this.customManager = options?.manager;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 120_000;
  }

  getPendingCount(): number {
    return this.pending.size + this.importWaiters.size;
  }

  onPendingChange(cb: (count: number) => void): () => void {
    this.pendingListeners.add(cb);
    cb(this.getPendingCount());
    return () => { this.pendingListeners.delete(cb); };
  }

  private notifyPending(): void {
    for (const cb of this.pendingListeners) {
      try { cb(this.getPendingCount()); } catch { /* 隔离订阅者异常 */ }
    }
  }

  private settleImportWaiter(
    taskId: string,
    outcome:
      | { ok: true; value: ModelImportTaskResult }
      | { ok: false; error: Error }
  ): void {
    const w = this.importWaiters.get(taskId);
    if (!w) return;
    this.importWaiters.delete(taskId);
    this.notifyPending();
    clearTimeout(w.timer);
    if (outcome.ok) {
      w.resolve(outcome.value);
    } else {
      w.reject(outcome.error);
    }
  }

  private refreshImportTimersForModel(modelId: string): void {
    for (const w of this.importWaiters.values()) {
      if (w.modelId !== modelId) continue;
      clearTimeout(w.timer);
      w.timer = setTimeout(() => {
        this.settleImportWaiter(w.taskId, {
          ok: false,
          error: new Error(
            `REQUEST_TIMEOUT: 模型导入等待超时 (${w.timeoutMs}ms)`
          ),
        });
      }, w.timeoutMs);
    }
  }

  private ensureManager(): RuntimeManager {
    const mgr = this.customManager ?? getInPageRuntimeManager();
    if (!this.bound) {
      this.bound = true;
      mgr.modelManager.subscribe((id, rec) => {
        this.refreshImportTimersForModel(id);
        for (const fn of this.modelListeners) {
          try {
            fn(id, rec);
          } catch {
            // 忽略异常
          }
        }
      });
      mgr.setCallbacks({
        onServiceState: (state) => {
          for (const fn of this.serviceListeners) {
            try {
              fn(state);
            } catch {
              // 忽略异常
            }
          }
        },
        onModelImportResult: (res) => {
          if (res.ok) {
            this.settleImportWaiter(res.taskId, { ok: true, value: res });
          } else {
            this.settleImportWaiter(res.taskId, {
              ok: false,
              error: new Error(res.error || "模型导入失败"),
            });
          }
        },
      });
    }
    return mgr;
  }

  async ensure(): Promise<void> {
    this.ensureManager();
  }

  async close(): Promise<void> {
    const reason = "Runtime 宿主已主动关闭";
    const err = new Error(`HOST_CLOSED: ${reason}，进行中的请求已中断`);
    for (const [id, p] of [...this.pending.entries()]) {
      clearTimeout(p.timer);
      p.cleanupSignal?.();
      this.pending.delete(id);
      this.notifyPending();
      this.ensureManager().cancelRequest(id, err.message);
      p.reject(err);
    }
    const importErr = new Error(
      `HOST_CLOSED: ${reason}，进行中的模型导入已中断`
    );
    for (const taskId of [...this.importWaiters.keys()]) {
      this.settleImportWaiter(taskId, { ok: false, error: importErr });
    }
    for (const service of ALL_AI_SERVICES) {
      const state: ServiceSessionState = {
        service,
        modelId: null,
        sessionVersion: -1,
        state: "unloaded",
        reason,
      };
      for (const fn of this.serviceListeners) {
        try {
          fn(state);
        } catch {
          // 忽略
        }
      }
    }
  }

  cancel(
    requestId: string,
    reason = "REQUEST_CANCELLED: 请求已取消"
  ): void {
    const p = this.pending.get(requestId);
    if (p) {
      clearTimeout(p.timer);
      p.cleanupSignal?.();
      this.pending.delete(requestId);
      this.notifyPending();
      p.reject(new Error(reason));
    }
    this.ensureManager().cancelRequest(requestId, reason);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async request<TReq, TRes>(
    request: AiRpcRequest<TReq>,
    hooks?: RequestHooks
  ): Promise<TRes> {
    if (hooks?.signal?.aborted) {
      throw new Error("REQUEST_CANCELLED: 请求已取消");
    }
    const mgr = this.ensureManager();
    const timeoutMs =
      request.deadlineMs ?? hooks?.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<TRes>((resolve, reject) => {
      const settle = (
        outcome: { ok: true; val: TRes } | { ok: false; err: Error }
      ) => {
        const entry = this.pending.get(request.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        entry.cleanupSignal?.();
        this.pending.delete(request.id);
        this.notifyPending();
        if (outcome.ok) resolve(outcome.val);
        else reject(outcome.err);
      };

      const timer = setTimeout(() => {
        const reason = `REQUEST_TIMEOUT: 请求超时 (${timeoutMs}ms)`;
        mgr.cancelRequest(request.id, reason);
        settle({ ok: false, err: new Error(reason) });
      }, timeoutMs);

      let cleanupSignal: (() => void) | undefined;
      if (hooks?.signal) {
        const onAbort = () => {
          const reason = "REQUEST_CANCELLED: 请求已取消";
          mgr.cancelRequest(request.id, reason);
          settle({ ok: false, err: new Error(reason) });
        };
        hooks.signal.addEventListener("abort", onAbort, { once: true });
        cleanupSignal = () =>
          hooks.signal?.removeEventListener("abort", onAbort);
      }

      this.pending.set(request.id, { reject, timer, cleanupSignal });
      this.notifyPending();

      void mgr
        .handleRequest(request, {
          onProgress: hooks?.onProgress,
          onStream: hooks?.onStream,
        })
        .then((res: AiRpcResponse) => {
          if (!res.ok) {
            const code = res.error?.code;
            const msg = res.error?.message || "Runtime 执行失败";
            settle({
              ok: false,
              err: new Error(code ? `${code}: ${msg}` : msg),
            });
          } else {
            settle({ ok: true, val: res.result as TRes });
          }
        })
        .catch((err) => {
          settle({
            ok: false,
            err: err instanceof Error ? err : new Error(String(err)),
          });
        });
    });
  }

  onModelBroadcast(cb: (id: string, record: ModelRecord) => void): () => void {
    this.modelListeners.add(cb);
    if (this.customManager) {
      this.ensureManager();
    } else if (!isExtensionContext) {
      queueMicrotask(() => this.ensureManager());
    }
    return () => this.modelListeners.delete(cb);
  }

  onServiceState(cb: (state: ServiceSessionState) => void): () => void {
    this.serviceListeners.add(cb);
    if (this.customManager) {
      this.ensureManager();
    } else if (!isExtensionContext) {
      queueMicrotask(() => this.ensureManager());
    }
    return () => this.serviceListeners.delete(cb);
  }

  waitForImportTask(
    taskId: string,
    modelId: string,
    timeoutMs = Math.max(this.defaultTimeoutMs, 600_000)
  ): Promise<ModelImportTaskResult> {
    this.ensureManager();
    return new Promise<ModelImportTaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settleImportWaiter(taskId, {
          ok: false,
          error: new Error(
            `REQUEST_TIMEOUT: 模型导入等待超时 (${timeoutMs}ms)`
          ),
        });
      }, timeoutMs);
      this.importWaiters.set(taskId, {
        taskId,
        modelId,
        resolve,
        reject,
        timeoutMs,
        timer,
      });
      this.notifyPending();
    });
  }

  cancelImportWaiter(taskId: string): void {
    const w = this.importWaiters.get(taskId);
    if (!w) return;
    this.importWaiters.delete(taskId);
    this.notifyPending();
    clearTimeout(w.timer);
  }
}

function isOffscreenDocumentSelf(): boolean {
  try {
    return (
      typeof globalThis.location !== "undefined" &&
      globalThis.location.pathname.endsWith("/offscreen.html")
    );
  } catch {
    return false;
  }
}

export const runtimeHost: RuntimeHostAdapter =
  isExtensionContext && !isOffscreenDocumentSelf()
    ? typeof chrome !== "undefined" && Boolean((chrome as any).offscreen?.createDocument)
      ? new ChromiumOffscreenHost()
      : new ChromiumOffscreenHost({
          // Firefox MV2 loads the same RPC host in its persistent background page.
          ensureOffscreenFn: async () => {},
          closeOffscreenFn: async () => {},
        })
    : new InPageRuntimeHost();

(globalThis as any).__kissRuntimeHost = runtimeHost;
