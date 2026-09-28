import { PaddleOCR, type OcrResult } from "@paddleocr/paddleocr-js";
import { LocalModelManager } from "../core/modelManager";
import { CATALOG, OCR_GROUPS, getCatalogModel } from "../core/catalog";
import { readFile } from "../core/opfs";
import { loadSettings } from "../core/settings";
import type {
  ASRSegment,
  AsrLoadSpec,
  ChatMessage,
  JevLoadSpec,
  LlmLoadSpec,
  LlmOnnxLoadSpec,
  Mirror,
  ModelRecord,
  OcrLoadSpec,
  TtsLoadSpec,
} from "../core/types";
import type {
  DecisionQuestions,
  DecisionResult,
  DecisionState,
} from "../core/jev";
import { ORT_WASM_PATHS } from "../workers/ortAssets";
import { createLocalWorker } from "./workerUrls";
import {
  nextRpcId,
  type AiRpcProgress,
  type AiRpcRequest,
  type AiRpcResponse,
  type AiRpcService,
  type AiRpcStreamEvent,
  type ModelImportTaskResult,
  type ServiceSessionState,
} from "./rpc";
import { RuntimePool } from "./runtimePool";
import { TASK_PRIORITY, TaskScheduler } from "./taskScheduler";

type OcrInstance = Awaited<ReturnType<typeof PaddleOCR.create>>;

export interface WorkerFactories {
  createJevWorker?: () => Worker;
  createAsrWorker?: () => Worker;
  createLlmWorker?: (runtime: "wllama" | "onnx") => Worker;
  createTtsWorker?: () => Worker;
  createOcrInstance?: (spec: OcrLoadSpec) => Promise<OcrInstance>;
}

export interface RuntimeEventCallbacks {
  onProgress?: (progress: AiRpcProgress) => void;
  onStream?: (stream: AiRpcStreamEvent) => void;
  onModelBroadcast?: (id: string, record: ModelRecord) => void;
  onModelImportResult?: (result: ModelImportTaskResult) => void;
  onServiceState?: (state: ServiceSessionState) => void;
  workerFactories?: WorkerFactories;
  maxResidentModels?: number;
  llmStopGraceMs?: number;
}

/**
 * 统一本地 AI Runtime 宿主管理器（运行于 offscreen.html 或 InPageRuntimeHost）。
 * 统一管理：
 * 1. ModelManager + RuntimePool + TaskScheduler + 全部 Dedicated Workers
 * 2. 每个服务的当前 modelId 与单调递增 sessionVersion（防止跨页面共用服务时模型状态失真）
 * 3. 活跃推理任务的真实执行层停止/终止（LLM 发送 stop 并在超时后回退 terminate；不可中断 Worker 直接 terminate 重建）
 */
export class RuntimeManager {
  readonly modelManager: LocalModelManager;
  readonly pool: RuntimePool;
  readonly scheduler = new TaskScheduler(1);

  private callbacks: RuntimeEventCallbacks;
  private factories: WorkerFactories;
  private llmStopGraceMs: number;

  // 每个服务的会话版本状态（解决多页面共用服务及 RuntimePool 淘汰时的状态失真）
  private sessions = new Map<AiRpcService, ServiceSessionState>();
  private versionCounter = 0;

  // JEV Worker 状态
  private jevWorker: Worker | null = null;
  private jevLoadWaiter: {
    resolve: (info: { backend: "webgpu" | "wasm" }) => void;
    reject: (e: Error) => void;
  } | null = null;
  private jevPredictWaiters = new Map<
    string,
    { resolve: (r: DecisionResult) => void; reject: (e: Error) => void }
  >();
  private activeJevReqId: string | null = null;

  // ASR Worker 状态
  private asrWorker: Worker | null = null;
  private asrLoadWaiter: {
    resolve: () => void;
    reject: (e: Error) => void;
  } | null = null;
  private asrTranscribeWaiter: {
    resolve: (r: {
      segments: ASRSegment[];
      elapsedMs: number;
      durationSeconds: number;
    }) => void;
    reject: (e: Error) => void;
  } | null = null;
  private activeAsrReqId: string | null = null;

  // OCR 状态
  private ocrInstance: OcrInstance | null = null;
  private ocrBlobUrls: string[] = [];
  private ocrActiveWaiter: {
    reject: (e: Error) => void;
  } | null = null;

  // LLM Worker 状态
  private llmWorker: Worker | null = null;
  private llmWorkerRuntime: "wllama" | "onnx" | null = null;
  private llmLoadWaiter: {
    resolve: (info: { backend: "webgpu" | "cpu" }) => void;
    reject: (e: Error) => void;
  } | null = null;
  private llmChatWaiter: {
    resolve: (r: {
      text: string;
      elapsedMs: number;
      tokensPerSecond?: number;
      aborted?: boolean;
    }) => void;
    reject: (e: Error) => void;
  } | null = null;
  private activeLlmReqId: string | null = null;
  private activeLlmChatReqId: string | null = null;
  private childRequests = new Map<string, string>();
  private cancelledRequests = new Set<string>();

  // TTS Worker 状态
  private ttsWorker: Worker | null = null;
  private ttsLoadWaiter: {
    resolve: () => void;
    reject: (e: Error) => void;
  } | null = null;
  private ttsSynthWaiter: {
    resolve: (r: {
      audio: Float32Array;
      elapsedMs: number;
      sampleRate: number;
    }) => void;
    reject: (e: Error) => void;
  } | null = null;
  private activeTtsReqId: string | null = null;

  constructor(callbacks: RuntimeEventCallbacks = {}) {
    this.callbacks = callbacks;
    this.factories = callbacks.workerFactories ?? {};
    this.pool = new RuntimePool(callbacks.maxResidentModels ?? 4);
    this.llmStopGraceMs = callbacks.llmStopGraceMs ?? 250;
    this.modelManager = new LocalModelManager("hf-mirror");
    this.modelManager.subscribe((id, rec) => {
      this.callbacks.onModelBroadcast?.(id, rec);
    });
    void loadSettings()
      .then((s) => this.modelManager.setMirror(s.mirror))
      .catch(() => undefined);
  }

  setCallbacks(callbacks: RuntimeEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    if (callbacks.workerFactories) {
      this.factories = callbacks.workerFactories;
    }
  }

  getSessionState(service: AiRpcService): ServiceSessionState {
    return (
      this.sessions.get(service) ?? {
        service,
        modelId: null,
        sessionVersion: 0,
        state: "unloaded",
      }
    );
  }

  private beginLoadSession(
    service: AiRpcService,
    modelId: string
  ): ServiceSessionState {
    const prev = this.sessions.get(service);
    const nextVersion = ++this.versionCounter;
    const reason =
      prev && prev.modelId && prev.modelId !== modelId
        ? `模型已切换为 ${modelId}`
        : undefined;
    const state: ServiceSessionState = {
      service,
      modelId,
      sessionVersion: nextVersion,
      state: "loading",
      ...(reason ? { reason } : {}),
    };
    this.sessions.set(service, state);
    this.callbacks.onServiceState?.(state);
    return state;
  }

  private commitLoadSession(
    service: AiRpcService,
    modelId: string,
    sessionVersion: number
  ): ServiceSessionState {
    const cur = this.sessions.get(service);
    if (cur && cur.sessionVersion !== sessionVersion) {
      return cur;
    }
    const state: ServiceSessionState = {
      service,
      modelId,
      sessionVersion,
      state: "ready",
    };
    this.sessions.set(service, state);
    this.callbacks.onServiceState?.(state);
    return state;
  }

  private invalidateSession(
    service: AiRpcService,
    reason = "模型已卸载或被淘汰"
  ): ServiceSessionState {
    const nextVersion = ++this.versionCounter;
    const state: ServiceSessionState = {
      service,
      modelId: null,
      sessionVersion: nextVersion,
      state: "unloaded",
      reason,
    };
    this.sessions.set(service, state);
    this.callbacks.onServiceState?.(state);
    return state;
  }

  private assertSessionVersion(
    service: AiRpcService,
    expectedVersion?: number
  ): ServiceSessionState {
    const cur = this.sessions.get(service);
    if (!cur || cur.state === "unloaded" || !cur.modelId) {
      const detail = cur?.reason || "模型尚未加载或已被淘汰";
      throw new Error(`MODEL_UNLOADED: ${detail}，请重新加载模型`);
    }
    if (
      expectedVersion !== undefined &&
      cur.sessionVersion !== expectedVersion
    ) {
      throw new Error(
        `MODEL_SWITCHED: 模型已切换（当前为 ${cur.modelId}），请重新加载模型`
      );
    }
    return cur;
  }

  cancelRequest(
    requestId: string,
    reason = "REQUEST_CANCELLED: 任务已取消"
  ): boolean {
    const childId = this.childRequests.get(requestId);
    if (childId) {
      this.cancelledRequests.add(requestId);
      return this.scheduler.cancel(childId, reason);
    }
    return this.scheduler.cancel(requestId, reason);
  }

  async handleRequest(
    req: AiRpcRequest,
    localHooks?: {
      onProgress?: (p: AiRpcProgress) => void;
      onStream?: (s: AiRpcStreamEvent) => void;
    }
  ): Promise<AiRpcResponse> {
    const t0 = performance.now();
    const emitProgress = (p: Omit<AiRpcProgress, "id">) => {
      const full: AiRpcProgress = { id: req.id, ...p };
      localHooks?.onProgress?.(full);
      this.callbacks.onProgress?.(full);
    };
    const emitStream = (s: Omit<AiRpcStreamEvent, "id">) => {
      const full: AiRpcStreamEvent = { id: req.id, ...s };
      localHooks?.onStream?.(full);
      this.callbacks.onStream?.(full);
    };

    try {
      const { result, queueMs, inferenceMs } = await this.dispatch(
        req,
        emitProgress,
        emitStream
      );
      return {
        id: req.id,
        ok: true,
        result,
        usage: {
          queueMs,
          inferenceMs,
          totalMs: Math.round((performance.now() - t0) * 10) / 10,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const codeMatch = /^([A-Z_]+):\s*(.*)$/.exec(message);
      return {
        id: req.id,
        ok: false,
        error: {
          code: codeMatch?.[1] ?? "INFERENCE_FAILED",
          message: codeMatch?.[2] ?? message,
        },
      };
    }
  }

  private async dispatch(
    req: AiRpcRequest,
    emitProgress: (p: Omit<AiRpcProgress, "id">) => void,
    emitStream: (s: Omit<AiRpcStreamEvent, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    switch (req.service) {
      case "model":
        return { result: await this.handleModel(req) };
      case "decision":
        return this.handleDecision(req, emitProgress);
      case "asr":
        return this.handleAsr(req, emitProgress);
      case "ocr":
        return this.handleOcr(req, emitProgress);
      case "llm":
        return this.handleLlm(req, emitProgress, emitStream);
      case "translation":
        return this.handleLocalTranslation(req, emitProgress, emitStream);
      case "tts":
        return this.handleTts(req, emitProgress);
      case "runtime":
        return { result: await this.handleRuntime(req) };
      default:
        throw new Error(`未知服务: ${req.service}`);
    }
  }

  private async ensureLlmModel(
    modelRef: string,
    parentReqId: string,
    priority?: number,
    emitProgress?: (p: Omit<AiRpcProgress, "id">) => void,
    emitStream?: (s: Omit<AiRpcStreamEvent, "id">) => void
  ): Promise<ServiceSessionState> {
    await this.modelManager.init();
    const model = getCatalogModel(modelRef);
    if (
      !model ||
      model.task !== "llm" ||
      this.modelManager.get(modelRef)?.state !== "installed"
    ) {
      throw new Error("MODEL_NOT_INSTALLED: 本地大模型未安装");
    }
    const file = model.files[0];
    if (!file) throw new Error("MODEL_LOAD_FAILED: 模型文件缺失");

    const current = this.sessions.get("llm");
    if (
      current?.modelId !== model.dir ||
      current.state === "unloaded" ||
      !this.llmWorker
    ) {
      const device =
        model.backend.includes("webgpu") &&
        (navigator as Navigator & { gpu?: unknown }).gpu
          ? "webgpu"
          : "wasm";
      const spec: LlmLoadSpec | LlmOnnxLoadSpec =
        model.runtime === "wllama"
          ? {
              runtime: "wllama",
              dir: model.dir,
              file: file.path,
              device,
              nCtx: 2048,
            }
          : {
              runtime: "onnx",
              source: model.source,
              dir: model.dir,
              device,
              dtype:
                model.files
                  .find((item) => item.path.endsWith(".onnx"))
                  ?.path.match(/model_(.+)\.onnx$/)?.[1] ?? "q4f16",
            };
      const loadId = `${parentReqId}-load`;
      this.childRequests.set(parentReqId, loadId);
      try {
        const loaded = await this.handleLlm(
          {
            id: loadId,
            service: "llm",
            method: "load",
            payload: spec,
            priority,
          },
          emitProgress || (() => {}),
          emitStream || (() => {})
        );
        const session = this.sessions.get("llm");
        if (!loaded.result || !session) {
          throw new Error("MODEL_LOAD_FAILED: 本地模型加载失败");
        }
        return session;
      } finally {
        this.childRequests.delete(parentReqId);
      }
    }
    return current;
  }

  private async handleLocalTranslation(
    req: AiRpcRequest,
    emitProgress: (p: Omit<AiRpcProgress, "id">) => void,
    emitStream: (s: Omit<AiRpcStreamEvent, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    const { modelRef, text, fromLang, toLang } = req.payload as {
      modelRef: string;
      text: string;
      fromLang: string;
      toLang: string;
    };
    try {
      const session = await this.ensureLlmModel(
        modelRef,
        req.id,
        req.priority,
        emitProgress,
        emitStream
      );
      if (this.cancelledRequests.has(req.id)) {
        throw new Error("REQUEST_CANCELLED: 用户已取消");
      }
      const chatId = `${req.id}-chat`;
      this.childRequests.set(req.id, chatId);
      const prompt = `Translate the following ${fromLang || "auto"} text into ${toLang}. Preserve placeholders and markup. Output only the translation.\n\n${text}`;
      const chat = await this.handleLlm(
        {
          id: chatId,
          service: "llm",
          method: "chat",
          payload: {
            messages: [{ role: "user", content: prompt }],
            maxTokens: 2048,
          },
          priority: req.priority,
          options: { sessionVersion: session?.sessionVersion },
        },
        emitProgress,
        emitStream
      );
      return {
        result: (chat.result as { text: string }).text,
        queueMs: chat.queueMs,
        inferenceMs: chat.inferenceMs,
      };
    } finally {
      this.childRequests.delete(req.id);
      this.cancelledRequests.delete(req.id);
    }
  }

  // -------------------- ModelManager 服务 --------------------
  private async handleModel(req: AiRpcRequest): Promise<unknown> {
    await this.modelManager.init();
    const p = (req.payload ?? {}) as Record<string, any>;
    switch (req.method) {
      case "init":
      case "list":
        return {
          records: this.modelManager.list(),
          mirror: this.modelManager.getMirror(),
        };
      case "setMirror":
        this.modelManager.setMirror(p.mirror as Mirror);
        return { ok: true };
      case "download":
        return this.modelManager.startDownload(p.id as string);
      case "pause":
        await this.modelManager.pause(p.id as string);
        return { record: this.modelManager.get(p.id as string) };
      case "cancel":
        await this.modelManager.cancel(p.id as string);
        return { record: this.modelManager.get(p.id as string) };
      case "remove":
        await this.modelManager.remove(p.id as string);
        return { record: this.modelManager.get(p.id as string) };
      case "importFiles": {
        const taskId = (p.taskId as string | undefined) || req.id;
        return this.modelManager.startImportFiles(
          p.id as string,
          p.files as { name: string; file: File }[],
          taskId,
          (result) => {
            this.callbacks.onModelImportResult?.(result);
          }
        );
      }
      case "storageStats":
        return await this.modelManager.storageStats();
      default:
        throw new Error(`未知 model 方法: ${req.method}`);
    }
  }

  // -------------------- Runtime 控制服务 --------------------
  private async handleRuntime(req: AiRpcRequest): Promise<unknown> {
    const p = (req.payload ?? {}) as Record<string, any>;
    switch (req.method) {
      case "status":
        return {
          pool: this.pool.list(),
          scheduler: this.scheduler.stats(),
          sessions: Object.fromEntries(this.sessions.entries()),
        };
      case "cancel":
        return {
          cancelled: this.cancelRequest(
            p.requestId as string,
            (p.reason as string | undefined) ?? "REQUEST_CANCELLED: 任务已取消"
          ),
        };
      case "evictOne": {
        const evicted = await this.pool.evictOne(
          p.excludeKey as string | undefined
        );
        return { evicted };
      }
      default:
        throw new Error(`未知 runtime 方法: ${req.method}`);
    }
  }

  // -------------------- JEV / Decision 服务 (P0) --------------------
  private ensureJevWorker(): Worker {
    if (!this.jevWorker) {
      const w = this.factories.createJevWorker
        ? this.factories.createJevWorker()
        : createLocalWorker("jev");
      this.jevWorker = w;
      w.onmessage = (e: MessageEvent) => {
        if (this.jevWorker !== w) return;
        const data = e.data as {
          type: string;
          id?: string;
          status?: string;
          backend?: "webgpu" | "wasm";
          result?: DecisionResult;
          message?: string;
        };
        if (data.type === "progress" && this.activeJevReqId) {
          this.callbacks.onProgress?.({
            id: this.activeJevReqId,
            type: "loading",
            status: data.status,
            message: data.status,
          });
        } else if (data.type === "ready") {
          this.jevLoadWaiter?.resolve({
            backend: data.backend === "wasm" ? "wasm" : "webgpu",
          });
          this.jevLoadWaiter = null;
        } else if (data.type === "result" && data.id) {
          const waiter = this.jevPredictWaiters.get(data.id);
          if (waiter && data.result) {
            this.jevPredictWaiters.delete(data.id);
            waiter.resolve(data.result);
          }
        } else if (data.type === "error") {
          const err = new Error(data.message || "JEV worker error");
          if (data.id && this.jevPredictWaiters.has(data.id)) {
            this.jevPredictWaiters.get(data.id)?.reject(err);
            this.jevPredictWaiters.delete(data.id);
          } else {
            this.jevLoadWaiter?.reject(err);
            this.jevLoadWaiter = null;
          }
        }
      };
      w.onerror = (e) => {
        if (this.jevWorker !== w) return;
        const err = new Error(e.message || "JEV worker crashed");
        this.jevLoadWaiter?.reject(err);
        this.jevLoadWaiter = null;
        for (const waiter of this.jevPredictWaiters.values()) {
          waiter.reject(err);
        }
        this.jevPredictWaiters.clear();
      };
    }
    return this.jevWorker;
  }

  private async handleDecision(
    req: AiRpcRequest,
    emitProgress: (p: Omit<AiRpcProgress, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    if (req.method === "load") {
      const spec = req.payload as JevLoadSpec;
      const session = this.beginLoadSession("decision", spec.modelId);
      await this.pool.ensureCapacity("decision");
      const w = this.ensureJevWorker();
      this.activeJevReqId = req.id;
      this.pool.register({
        key: "decision",
        service: "decision",
        modelId: spec.modelId,
        state: "loading",
        pinned: true, // 文档 §11：Laya/JEV 常驻内存
        unloadFn: () => {
          this.invalidateSession("decision", "JEV 模型已被卸载或淘汰");
          this.disposeJev();
        },
      });
      const scheduled = await this.scheduler.schedule(
        () =>
          new Promise<{ backend: "webgpu" | "wasm" }>((resolve, reject) => {
            this.jevLoadWaiter?.reject(new Error("JEV 模型加载被新请求取代"));
            this.jevLoadWaiter = { resolve, reject };
            w.postMessage({ type: "load", ...spec });
          }),
        {
          id: req.id,
          priority: TASK_PRIORITY.DECISION,
          deadlineMs: req.deadlineMs,
          onCancel: (reason) => {
            this.invalidateSession("decision", reason);
            this.disposeJev(reason);
            void this.pool.unload("decision");
          },
        }
      );
      this.commitLoadSession("decision", spec.modelId, session.sessionVersion);
      this.pool.markState("decision", "ready");
      emitProgress({ type: "running", status: "就绪" });
      return {
        result: {
          ...scheduled.value,
          modelId: spec.modelId,
          sessionVersion: session.sessionVersion,
        },
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "predict") {
      const { state, questions } = req.payload as {
        state: DecisionState;
        questions: DecisionQuestions;
      };
      this.assertSessionVersion("decision", req.options?.sessionVersion);
      this.pool.touch("decision");
      const subId = nextRpcId("jev");
      const scheduled = await this.scheduler.schedule(
        () => {
          this.assertSessionVersion("decision", req.options?.sessionVersion);
          const w = this.ensureJevWorker();
          return new Promise<DecisionResult>((resolve, reject) => {
            this.jevPredictWaiters.set(subId, { resolve, reject });
            w.postMessage({ type: "predict", id: subId, state, questions });
          });
        },
        {
          id: req.id,
          priority: req.priority ?? TASK_PRIORITY.DECISION,
          deadlineMs: req.deadlineMs,
          onCancel: (reason) => {
            // 不可中断的单次前向 Worker：直接终止并重建 Worker，释放 GPU 槽位
            this.invalidateSession(
              "decision",
              "JEV 推理已取消或超时，请重新加载模型"
            );
            this.disposeJev(reason);
            void this.pool.unload("decision");
          },
        }
      );
      return {
        result: scheduled.value,
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "unload" || req.method === "dispose") {
      this.invalidateSession("decision", "JEV 模型已卸载");
      await this.pool.unload("decision");
      this.disposeJev();
      return { result: { ok: true } };
    }

    throw new Error(`未知 decision 方法: ${req.method}`);
  }

  private disposeJev(reason = "JEV 客户端已卸载"): void {
    const err = new Error(reason);
    this.jevLoadWaiter?.reject(err);
    this.jevLoadWaiter = null;
    for (const waiter of this.jevPredictWaiters.values()) {
      waiter.reject(err);
    }
    this.jevPredictWaiters.clear();
    this.jevWorker?.terminate();
    this.jevWorker = null;
  }

  // -------------------- ASR 服务 (P1) --------------------
  private ensureAsrWorker(): Worker {
    if (!this.asrWorker) {
      const w = this.factories.createAsrWorker
        ? this.factories.createAsrWorker()
        : createLocalWorker("asr");
      this.asrWorker = w;
      w.onmessage = (e: MessageEvent) => {
        if (this.asrWorker !== w) return;
        const data = e.data;
        if (data.type === "progress" && this.activeAsrReqId) {
          this.callbacks.onProgress?.({
            id: this.activeAsrReqId,
            type: "loading",
            status: data.status,
            file: data.file,
            progress: data.progress,
            loaded: data.loaded,
            total: data.total,
          });
        } else if (data.type === "ready") {
          this.asrLoadWaiter?.resolve();
          this.asrLoadWaiter = null;
        } else if (data.type === "result") {
          this.asrTranscribeWaiter?.resolve({
            segments: data.segments ?? [],
            elapsedMs: data.elapsedMs ?? 0,
            durationSeconds: data.durationSeconds ?? 0,
          });
          this.asrTranscribeWaiter = null;
        } else if (data.type === "error") {
          const err = new Error(data.message || "ASR worker error");
          this.asrLoadWaiter?.reject(err);
          this.asrLoadWaiter = null;
          this.asrTranscribeWaiter?.reject(err);
          this.asrTranscribeWaiter = null;
        }
      };
      w.onerror = (e) => {
        if (this.asrWorker !== w) return;
        const err = new Error(e.message || "ASR worker crashed");
        this.asrLoadWaiter?.reject(err);
        this.asrLoadWaiter = null;
        this.asrTranscribeWaiter?.reject(err);
        this.asrTranscribeWaiter = null;
      };
    }
    return this.asrWorker;
  }

  private async handleAsr(
    req: AiRpcRequest,
    _emitProgress: (p: Omit<AiRpcProgress, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    if (req.method === "load") {
      const spec = req.payload as AsrLoadSpec;
      const session = this.beginLoadSession("asr", spec.dir);
      await this.pool.ensureCapacity("asr");
      const w = this.ensureAsrWorker();
      this.activeAsrReqId = req.id;
      this.pool.register({
        key: "asr",
        service: "asr",
        modelId: spec.dir,
        state: "loading",
        pinned: false,
        unloadFn: () => {
          this.invalidateSession("asr", "ASR 模型已被淘汰或卸载");
          this.disposeAsr();
        },
      });
      const scheduled = await this.scheduler.schedule(
        () =>
          new Promise<void>((resolve, reject) => {
            this.asrLoadWaiter?.reject(new Error("模型加载已被新请求取代"));
            this.asrLoadWaiter = { resolve, reject };
            w.postMessage({ type: "load", ...spec });
          }),
        {
          id: req.id,
          priority: TASK_PRIORITY.ASR,
          deadlineMs: req.deadlineMs,
          onCancel: (reason) => {
            this.invalidateSession("asr", reason);
            this.disposeAsr(reason);
            void this.pool.unload("asr");
          },
        }
      );
      this.commitLoadSession("asr", spec.dir, session.sessionVersion);
      this.pool.markState("asr", "ready");
      return {
        result: {
          ok: true,
          modelId: spec.dir,
          sessionVersion: session.sessionVersion,
        },
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "transcribe") {
      const { audio, language } = req.payload as {
        audio: Float32Array;
        language: string;
      };
      this.assertSessionVersion("asr", req.options?.sessionVersion);
      if (!this.asrWorker) throw new Error("MODEL_UNLOADED: 模型尚未加载");
      this.pool.setPinned("asr", true);
      try {
        const scheduled = await this.scheduler.schedule(
          () => {
            this.assertSessionVersion("asr", req.options?.sessionVersion);
            return new Promise<{
              segments: ASRSegment[];
              elapsedMs: number;
              durationSeconds: number;
            }>((resolve, reject) => {
              this.asrTranscribeWaiter?.reject(
                new Error("语音识别已被新请求取代")
              );
              this.asrTranscribeWaiter = { resolve, reject };
              const copy = new Float32Array(audio);
              this.asrWorker?.postMessage(
                { type: "transcribe", audio: copy, language },
                [copy.buffer as ArrayBuffer]
              );
            });
          },
          {
            id: req.id,
            priority: TASK_PRIORITY.ASR,
            deadlineMs: req.deadlineMs,
            onCancel: (reason) => {
              this.invalidateSession(
                "asr",
                "ASR 识别已取消或超时，请重新加载模型"
              );
              this.disposeAsr(reason);
              void this.pool.unload("asr");
            },
          }
        );
        return {
          result: scheduled.value,
          queueMs: scheduled.queueMs,
          inferenceMs: scheduled.inferenceMs,
        };
      } finally {
        this.pool.setPinned("asr", false);
        this.pool.markState("asr", "idle");
      }
    }

    if (req.method === "dispose") {
      this.invalidateSession("asr", "ASR 模型已卸载");
      await this.pool.unload("asr");
      this.disposeAsr();
      return { result: { ok: true } };
    }

    throw new Error(`未知 asr 方法: ${req.method}`);
  }

  private disposeAsr(reason = "推理客户端已销毁"): void {
    const err = new Error(reason);
    this.asrLoadWaiter?.reject(err);
    this.asrLoadWaiter = null;
    this.asrTranscribeWaiter?.reject(err);
    this.asrTranscribeWaiter = null;
    this.asrWorker?.terminate();
    this.asrWorker = null;
  }

  // -------------------- OCR 服务 (P2) --------------------
  private async handleOcr(
    req: AiRpcRequest,
    emitProgress: (p: Omit<AiRpcProgress, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    if (req.method === "load") {
      const rawSpec = req.payload as Partial<OcrLoadSpec> & {
        detModelId?: string;
        recModelId?: string;
      };
      const group = OCR_GROUPS.find(
        (g) =>
          g.detName === rawSpec.detName ||
          g.recName === rawSpec.recName ||
          (rawSpec.detModelId &&
            (g.detId === rawSpec.detModelId || g.id === rawSpec.detModelId)) ||
          (rawSpec.detDir &&
            (g.detId.includes(rawSpec.detDir) || rawSpec.detDir.includes(g.id)))
      );
      const detManifest = rawSpec.detModelId
        ? getCatalogModel(rawSpec.detModelId)
        : group
          ? getCatalogModel(group.detId)
          : CATALOG.find(
              (m) => m.task === "ocr-detection" && m.dir === rawSpec.detDir
            );
      const recManifest = rawSpec.recModelId
        ? getCatalogModel(rawSpec.recModelId)
        : group
          ? getCatalogModel(group.recId)
          : CATALOG.find(
              (m) => m.task === "ocr-recognition" && m.dir === rawSpec.recDir
            );

      const spec: OcrLoadSpec = {
        detDir: rawSpec.detDir || detManifest?.dir || "",
        detFile: rawSpec.detFile || detManifest?.files[0]?.path || "",
        detName: rawSpec.detName || group?.detName || detManifest?.id || "",
        recDir: rawSpec.recDir || recManifest?.dir || "",
        recFile: rawSpec.recFile || recManifest?.files[0]?.path || "",
        recName: rawSpec.recName || group?.recName || recManifest?.id || "",
        device: rawSpec.device || "wasm",
      };
      const modelId = `${spec.detName}+${spec.recName}`;
      const session = this.beginLoadSession("ocr", modelId);
      await this.pool.ensureCapacity("ocr");
      this.pool.register({
        key: "ocr",
        service: "ocr",
        modelId,
        state: "loading",
        pinned: false,
        unloadFn: () => {
          this.invalidateSession("ocr", "OCR 模型已被淘汰或卸载");
          void this.disposeOcr();
        },
      });
      const scheduled = await this.scheduler.schedule(
        async () => {
          emitProgress({ type: "loading", status: "读取本地模型 (OPFS)…" });
          await this.disposeOcr();
          if (this.factories.createOcrInstance) {
            this.ocrInstance = await this.factories.createOcrInstance(spec);
          } else {
            emitProgress({ type: "loading", status: "下载/解析模型 tar…" });
            const [detBuf, recBuf] = await Promise.all([
              readFile(`${spec.detDir}/${spec.detFile}`),
              readFile(`${spec.recDir}/${spec.recFile}`),
            ]);
            const detUrl = URL.createObjectURL(new Blob([detBuf]));
            const recUrl = URL.createObjectURL(new Blob([recBuf]));
            this.ocrBlobUrls.push(detUrl, recUrl);
            emitProgress({ type: "loading", status: "初始化推理引擎…" });
            this.ocrInstance = await PaddleOCR.create({
              worker: {
                createWorker: () =>
                  createLocalWorker("ocr"),
              },
              initialize: true,
              textDetectionModelName: spec.detName,
              textDetectionModelAsset: { url: detUrl },
              textRecognitionModelName: spec.recName,
              textRecognitionModelAsset: { url: recUrl },
              ortOptions: {
                backend: spec.device === "webgpu" ? "webgpu" : "wasm",
                wasmPaths: ORT_WASM_PATHS as any,
              },
            });
            for (const u of this.ocrBlobUrls) URL.revokeObjectURL(u);
            this.ocrBlobUrls = [];
          }
          const summary = this.ocrInstance.getInitializationSummary();
          const info = {
            detProvider: summary?.detProvider ?? spec.device,
            recProvider: summary?.recProvider ?? spec.device,
          };
          if (summary) {
            emitProgress({
              type: "running",
              status: `就绪 (det=${summary.detProvider}, rec=${summary.recProvider}, ${Math.round(summary.elapsedMs)}ms)`,
            });
          }
          return info;
        },
        {
          id: req.id,
          priority: TASK_PRIORITY.OCR,
          deadlineMs: req.deadlineMs,
          onCancel: async (reason) => {
            this.invalidateSession("ocr", reason);
            await this.disposeOcr(reason);
            await this.pool.unload("ocr");
          },
        }
      );
      this.commitLoadSession("ocr", modelId, session.sessionVersion);
      this.pool.markState("ocr", "ready");
      return {
        result: {
          ...scheduled.value,
          modelId,
          sessionVersion: session.sessionVersion,
        },
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "recognize") {
      const { blob } = req.payload as { blob: Blob };
      this.assertSessionVersion("ocr", req.options?.sessionVersion);
      if (!this.ocrInstance) throw new Error("MODEL_UNLOADED: 模型尚未加载");
      this.pool.touch("ocr");
      const scheduled = await this.scheduler.schedule(
        async () => {
          this.assertSessionVersion("ocr", req.options?.sessionVersion);
          const results: OcrResult[] = await new Promise<OcrResult[]>(
            (resolve, reject) => {
              this.ocrActiveWaiter = { reject };
              this.ocrInstance!.predict(blob).then(resolve, reject);
            }
          ).finally(() => {
            this.ocrActiveWaiter = null;
          });
          const r = results[0];
          if (!r) throw new Error("无识别结果");
          return {
            width: r.image.width,
            height: r.image.height,
            items: r.items.map((it) => ({
              text: it.text,
              score: it.score,
              poly: it.poly as [number, number][],
            })),
            detMs: r.metrics.detMs,
            recMs: r.metrics.recMs,
            totalMs: r.metrics.totalMs,
            backend: r.runtime.requestedBackend,
            detProvider: r.runtime.detProvider,
            recProvider: r.runtime.recProvider,
          };
        },
        {
          id: req.id,
          priority: TASK_PRIORITY.OCR,
          deadlineMs: req.deadlineMs,
          onCancel: async (reason) => {
            this.invalidateSession(
              "ocr",
              "OCR 识别已取消或超时，请重新加载模型"
            );
            await this.disposeOcr(reason);
            await this.pool.unload("ocr");
          },
        }
      );
      this.pool.markState("ocr", "idle");
      return {
        result: scheduled.value,
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "dispose") {
      this.invalidateSession("ocr", "OCR 模型已卸载");
      await this.pool.unload("ocr");
      await this.disposeOcr();
      return { result: { ok: true } };
    }

    throw new Error(`未知 ocr 方法: ${req.method}`);
  }

  private async disposeOcr(reason = "OCR 客户端已销毁"): Promise<void> {
    this.ocrActiveWaiter?.reject(new Error(reason));
    this.ocrActiveWaiter = null;
    const inst = this.ocrInstance;
    this.ocrInstance = null;
    for (const u of this.ocrBlobUrls) URL.revokeObjectURL(u);
    this.ocrBlobUrls = [];
    if (inst) await inst.dispose().catch(() => {});
  }

  // -------------------- LLM 服务 (P4) --------------------
  private ensureLlmWorker(runtime: "wllama" | "onnx"): Worker {
    if (!this.llmWorker || this.llmWorkerRuntime !== runtime) {
      if (this.llmWorker) {
        this.disposeLlm();
      }
      const w = this.factories.createLlmWorker
        ? this.factories.createLlmWorker(runtime)
        : runtime === "onnx"
          ? createLocalWorker("llm-onnx")
          : createLocalWorker("llm");
      this.llmWorker = w;
      this.llmWorkerRuntime = runtime;
      w.onmessage = (e: MessageEvent) => {
        if (this.llmWorker !== w) return;
        const data = e.data;
        if (data.type === "progress" && this.activeLlmReqId) {
          this.callbacks.onProgress?.({
            id: this.activeLlmReqId,
            type: "loading",
            status: data.status ?? "加载中",
          });
        } else if (data.type === "ready") {
          this.llmLoadWaiter?.resolve({
            backend: data.backend === "webgpu" ? "webgpu" : "cpu",
          });
          this.llmLoadWaiter = null;
        } else if (data.type === "token" && this.activeLlmReqId) {
          this.callbacks.onStream?.({
            id: this.activeLlmReqId,
            type: "token",
            text: data.text ?? "",
          });
        } else if (data.type === "done") {
          this.llmChatWaiter?.resolve({
            text: data.text ?? "",
            elapsedMs: data.elapsedMs ?? 0,
            tokensPerSecond: data.tokensPerSecond,
            aborted: data.aborted,
          });
          this.llmChatWaiter = null;
        } else if (data.type === "error") {
          const err = new Error(data.message || "LLM worker error");
          this.llmLoadWaiter?.reject(err);
          this.llmLoadWaiter = null;
          this.llmChatWaiter?.reject(err);
          this.llmChatWaiter = null;
        }
      };
      w.onerror = (e) => {
        if (this.llmWorker !== w) return;
        const err = new Error(e.message || "LLM worker crashed");
        this.llmLoadWaiter?.reject(err);
        this.llmLoadWaiter = null;
        this.llmChatWaiter?.reject(err);
        this.llmChatWaiter = null;
      };
    }
    return this.llmWorker;
  }

  private async handleLlm(
    req: AiRpcRequest,
    _emitProgress: (p: Omit<AiRpcProgress, "id">) => void,
    _emitStream: (s: Omit<AiRpcStreamEvent, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    if (req.method === "load") {
      const spec = req.payload as LlmLoadSpec | LlmOnnxLoadSpec;
      const modelId = spec.dir;
      const session = this.beginLoadSession("llm", modelId);
      // 若有正在执行的生成任务，通过调度器取消它，由现有 onCancel 先发 stop 并等待 Worker 返回 done（超宽限期则 terminate）；
      // 绝不直接拒绝 llmChatWaiter 提前推进队列，确保旧任务真正停止并释放调度槽位后才开始新模型加载。
      if (this.activeLlmChatReqId) {
        this.scheduler.cancel(
          this.activeLlmChatReqId,
          "MODEL_SWITCHED: 正在切换或重新加载模型，当前生成已中止"
        );
      }
      const scheduled = await this.scheduler.schedule(
        async () => {
          await this.pool.ensureCapacity("llm");
          const w = this.ensureLlmWorker(spec.runtime);
          this.activeLlmReqId = req.id;
          this.pool.register({
            key: "llm",
            service: "llm",
            modelId,
            state: "loading",
            pinned: false,
            unloadFn: () => {
              this.invalidateSession("llm", "LLM 模型已被淘汰或卸载");
              this.disposeLlm();
            },
          });
          return await new Promise<{ backend: "webgpu" | "cpu" }>(
            (resolve, reject) => {
              this.llmLoadWaiter?.reject(new Error("模型加载已被新请求取代"));
              this.llmLoadWaiter = { resolve, reject };
              w.postMessage({ type: "load", ...spec });
            }
          );
        },
        {
          id: req.id,
          priority: TASK_PRIORITY.LLM,
          deadlineMs: req.deadlineMs,
          onCancel: (reason) => {
            this.invalidateSession("llm", reason);
            this.disposeLlm(reason);
            void this.pool.unload("llm");
          },
        }
      );
      this.commitLoadSession("llm", modelId, session.sessionVersion);
      this.pool.markState("llm", "ready");
      return {
        result: {
          ...scheduled.value,
          modelId,
          sessionVersion: session.sessionVersion,
        },
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "chat") {
      const { messages, maxTokens, modelRef } = req.payload as {
        messages: ChatMessage[];
        maxTokens: number;
        modelRef?: string;
      };
      let sessionVersionToCheck = req.options?.sessionVersion;
      if (modelRef) {
        const session = await this.ensureLlmModel(
          modelRef,
          req.id,
          req.priority,
          _emitProgress,
          _emitStream
        );
        if (this.cancelledRequests.has(req.id)) {
          throw new Error("REQUEST_CANCELLED: 用户已取消");
        }
        if (sessionVersionToCheck === undefined) {
          sessionVersionToCheck = session.sessionVersion;
        }
      }
      this.assertSessionVersion("llm", sessionVersionToCheck);
      if (!this.llmWorker) throw new Error("MODEL_UNLOADED: 模型尚未加载");
      this.pool.touch("llm");
      const scheduled = await this.scheduler.schedule(
        () => {
          this.assertSessionVersion("llm", sessionVersionToCheck);
          this.activeLlmReqId = req.id;
          this.activeLlmChatReqId = req.id;
          return new Promise<{
            text: string;
            elapsedMs: number;
            tokensPerSecond?: number;
            aborted?: boolean;
          }>((resolve, reject) => {
            this.llmChatWaiter?.reject(new Error("对话请求已被新请求取代"));
            this.llmChatWaiter = {
              resolve: (val) => {
                if (this.activeLlmChatReqId === req.id) {
                  this.activeLlmChatReqId = null;
                }
                resolve(val);
              },
              reject: (err) => {
                if (this.activeLlmChatReqId === req.id) {
                  this.activeLlmChatReqId = null;
                }
                reject(err);
              },
            };
            this.llmWorker?.postMessage({ type: "chat", messages, maxTokens });
          });
        },
        {
          id: req.id,
          priority: TASK_PRIORITY.LLM,
          deadlineMs: req.deadlineMs,
          onCancel: async (reason) => {
            // 先向可中断的 LLM Worker 发送 stop，等待短暂宽限期确认停止；
            // 若在宽限期内未收到 done（如处于不可中断的预填充阶段），则直接 terminate 并使会话失效。
            if (!this.llmChatWaiter) return;
            this.llmWorker?.postMessage({ type: "stop" });
            await new Promise<void>((resolve) => {
              const timer = setTimeout(() => {
                if (this.llmChatWaiter) {
                  if (
                    this.sessions.get("llm")?.sessionVersion ===
                    req.options?.sessionVersion
                  ) {
                    this.invalidateSession(
                      "llm",
                      "LLM 任务强制终止，请重新加载模型"
                    );
                    void this.pool.unload("llm");
                  }
                  this.disposeLlm(reason);
                }
                resolve();
              }, this.llmStopGraceMs);

              const origWaiter = this.llmChatWaiter;
              if (!origWaiter) {
                clearTimeout(timer);
                resolve();
                return;
              }
              this.llmChatWaiter = {
                resolve: (val) => {
                  clearTimeout(timer);
                  origWaiter.resolve(val);
                  resolve();
                },
                reject: (err) => {
                  clearTimeout(timer);
                  origWaiter.reject(err);
                  resolve();
                },
              };
            });
          },
        }
      );
      this.pool.markState("llm", "idle");
      return {
        result: scheduled.value,
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "stop") {
      if (this.activeLlmChatReqId) {
        this.scheduler.cancel(
          this.activeLlmChatReqId,
          "REQUEST_CANCELLED: 用户已停止生成"
        );
      } else {
        this.llmWorker?.postMessage({ type: "stop" });
      }
      return { result: { ok: true } };
    }

    if (req.method === "dispose") {
      this.invalidateSession("llm", "LLM 模型已卸载");
      await this.pool.unload("llm");
      this.disposeLlm();
      return { result: { ok: true } };
    }

    throw new Error(`未知 llm 方法: ${req.method}`);
  }

  private disposeLlm(reason = "推理客户端已销毁"): void {
    const err = new Error(reason);
    this.llmLoadWaiter?.reject(err);
    this.llmLoadWaiter = null;
    this.llmChatWaiter?.reject(err);
    this.llmChatWaiter = null;
    this.activeLlmChatReqId = null;
    this.llmWorker?.terminate();
    this.llmWorker = null;
    this.llmWorkerRuntime = null;
  }

  // -------------------- TTS 服务 (P3) --------------------
  private ensureTtsWorker(): Worker {
    if (!this.ttsWorker) {
      const w = this.factories.createTtsWorker
        ? this.factories.createTtsWorker()
        : createLocalWorker("tts");
      this.ttsWorker = w;
      w.onmessage = (e: MessageEvent) => {
        if (this.ttsWorker !== w) return;
        const data = e.data;
        if (data.type === "progress" && this.activeTtsReqId) {
          this.callbacks.onProgress?.({
            id: this.activeTtsReqId,
            type: "loading",
            status: data.status,
            file: data.file,
            progress: data.progress,
            loaded: data.loaded,
            total: data.total,
          });
        } else if (data.type === "ready") {
          this.ttsLoadWaiter?.resolve();
          this.ttsLoadWaiter = null;
        } else if (data.type === "result") {
          this.ttsSynthWaiter?.resolve({
            audio: data.audio ?? new Float32Array(0),
            elapsedMs: data.elapsedMs ?? 0,
            sampleRate: data.sampleRate ?? 24000,
          });
          this.ttsSynthWaiter = null;
        } else if (data.type === "error") {
          const err = new Error(data.message || "TTS worker error");
          this.ttsLoadWaiter?.reject(err);
          this.ttsLoadWaiter = null;
          this.ttsSynthWaiter?.reject(err);
          this.ttsSynthWaiter = null;
        }
      };
      w.onerror = (e) => {
        if (this.ttsWorker !== w) return;
        const err = new Error(e.message || "TTS worker crashed");
        this.ttsLoadWaiter?.reject(err);
        this.ttsLoadWaiter = null;
        this.ttsSynthWaiter?.reject(err);
        this.ttsSynthWaiter = null;
      };
    }
    return this.ttsWorker;
  }

  private async handleTts(
    req: AiRpcRequest,
    _emitProgress: (p: Omit<AiRpcProgress, "id">) => void
  ): Promise<{ result: unknown; queueMs?: number; inferenceMs?: number }> {
    if (req.method === "load") {
      const spec = req.payload as TtsLoadSpec;
      const session = this.beginLoadSession("tts", spec.dir);
      await this.pool.ensureCapacity("tts");
      const w = this.ensureTtsWorker();
      this.activeTtsReqId = req.id;
      this.pool.register({
        key: "tts",
        service: "tts",
        modelId: spec.dir,
        state: "loading",
        pinned: false,
        unloadFn: () => {
          this.invalidateSession("tts", "TTS 模型已被淘汰或卸载");
          this.disposeTts();
        },
      });
      const scheduled = await this.scheduler.schedule(
        () =>
          new Promise<void>((resolve, reject) => {
            this.ttsLoadWaiter?.reject(new Error("模型加载已被新请求取代"));
            this.ttsLoadWaiter = { resolve, reject };
            w.postMessage({ type: "load", ...spec });
          }),
        {
          id: req.id,
          priority: TASK_PRIORITY.TTS,
          deadlineMs: req.deadlineMs,
          onCancel: (reason) => {
            this.invalidateSession("tts", reason);
            this.disposeTts(reason);
            void this.pool.unload("tts");
          },
        }
      );
      this.commitLoadSession("tts", spec.dir, session.sessionVersion);
      this.pool.markState("tts", "ready");
      return {
        result: {
          ok: true,
          modelId: spec.dir,
          sessionVersion: session.sessionVersion,
        },
        queueMs: scheduled.queueMs,
        inferenceMs: scheduled.inferenceMs,
      };
    }

    if (req.method === "synthesize") {
      const { text, voice, speed } = req.payload as {
        text: string;
        voice: string;
        speed: number;
      };
      this.assertSessionVersion("tts", req.options?.sessionVersion);
      if (!this.ttsWorker) throw new Error("MODEL_UNLOADED: 模型尚未加载");
      this.pool.setPinned("tts", true);
      try {
        const scheduled = await this.scheduler.schedule(
          () => {
            this.assertSessionVersion("tts", req.options?.sessionVersion);
            return new Promise<{
              audio: Float32Array;
              elapsedMs: number;
              sampleRate: number;
            }>((resolve, reject) => {
              this.ttsSynthWaiter?.reject(new Error("语音合成已被新请求取代"));
              this.ttsSynthWaiter = { resolve, reject };
              this.ttsWorker?.postMessage({
                type: "synthesize",
                text,
                voice,
                speed,
              });
            });
          },
          {
            id: req.id,
            priority: TASK_PRIORITY.TTS,
            deadlineMs: req.deadlineMs,
            onCancel: (reason) => {
              this.invalidateSession(
                "tts",
                "TTS 合成已取消或超时，请重新加载模型"
              );
              this.disposeTts(reason);
              void this.pool.unload("tts");
            },
          }
        );
        return {
          result: scheduled.value,
          queueMs: scheduled.queueMs,
          inferenceMs: scheduled.inferenceMs,
        };
      } finally {
        this.pool.setPinned("tts", false);
        this.pool.markState("tts", "idle");
      }
    }

    if (req.method === "dispose") {
      this.invalidateSession("tts", "TTS 模型已卸载");
      await this.pool.unload("tts");
      this.disposeTts();
      return { result: { ok: true } };
    }

    throw new Error(`未知 tts 方法: ${req.method}`);
  }

  private disposeTts(reason = "推理客户端已销毁"): void {
    const err = new Error(reason);
    this.ttsLoadWaiter?.reject(err);
    this.ttsLoadWaiter = null;
    this.ttsSynthWaiter?.reject(err);
    this.ttsSynthWaiter = null;
    this.ttsWorker?.terminate();
    this.ttsWorker = null;
  }
}

let inPageSingleton: RuntimeManager | null = null;
export function getInPageRuntimeManager(): RuntimeManager {
  if (!inPageSingleton) {
    inPageSingleton = new RuntimeManager();
  }
  return inPageSingleton;
}
