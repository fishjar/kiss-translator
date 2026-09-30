import type { InputAdjustment } from "./types";
import type { ModelTarget } from "./modelTarget";
import type { ChatMessage, LlmLoadSpec, LlmOnnxLoadSpec } from "./types";
import { nextRpcId } from "../runtime/rpc";
import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { TASK_PRIORITY } from "../runtime/taskScheduler";

type LlmSpec = LlmLoadSpec | LlmOnnxLoadSpec;

export interface LlmChatResult {
  inputAdjustments?: InputAdjustment[];
  text: string;
  elapsedMs: number;
  tokensPerSecond?: number;
  aborted?: boolean;
}

export interface LlmLoadInfo {
  backend: "webgpu" | "cpu";
  modelId?: string;
  sessionVersion?: number;
}

export function backendLabel(
  actual: "webgpu" | "cpu" | null,
  requested: "webgpu" | "wasm"
): string {
  if (actual === "webgpu") return "WebGPU";
  if (requested === "wasm") return "WASM";
  return "CPU 回退";
}

/**
 * LLM 客户端（基于 RuntimeHostAdapter RPC）：
 * - 记录加载成功时的 sessionVersion 与 modelId；
 * - 推理时携带 sessionVersion，防止与 OCR VLM 等共用 LLM 服务时发生模型状态失真；
 * - 监听宿主 service-state 广播，在模型被切换或被 RuntimePool 淘汰时自动使就绪状态失效。
 */
export class LlmClient {
  onProgress: ((status: string) => void) | null = null;
  onStateChange: ((ready: boolean, reason?: string) => void) | null = null;
  private isLoaded = false;
  private isLoading = false;
  private currentVersion: number | null = null;
  private currentModelId: string | null = null;
  private activeChatReqId: string | null = null;
  private readonly host: RuntimeHostAdapter;
  private unsubState: (() => void) | null = null;

  constructor(host: RuntimeHostAdapter = runtimeHost) {
    this.host = host;
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "llm") return;
      // 当前客户端自身正在执行 load() 时忽略 loading 状态广播，避免误报“模型已切换”
      if (this.isLoading) return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "模型已被淘汰或卸载，请重新加载"
              : `模型已切换（当前为 ${st.modelId}），请重新加载`;
          this.onStateChange?.(false, reason);
        }
      }
    });
  }

  get loaded(): boolean {
    return this.isLoaded;
  }

  get sessionVersion(): number | null {
    return this.currentVersion;
  }

  async load(spec: LlmSpec, target?: ModelTarget): Promise<LlmLoadInfo> {
    this.isLoading = true;
    try {
      const info = await this.host.request<
        LlmSpec & Partial<ModelTarget>,
        LlmLoadInfo
      >(
        {
          id: nextRpcId("llm-load"),
          service: "llm",
          method: "load",
          payload: target
            ? {
                ...spec,
                modelRef: target.modelRef,
                loadSpec: { ...spec, ...target.loadSpec },
              }
            : spec,
          priority: TASK_PRIORITY.LLM,
        },
        {
          onProgress: (p) => {
            this.onProgress?.(p.status ?? "加载中");
          },
        }
      );
      this.currentVersion = info.sessionVersion ?? 1;
      this.currentModelId = info.modelId ?? spec.dir;
      this.isLoaded = true;
      this.onStateChange?.(true);
      return info;
    } finally {
      this.isLoading = false;
    }
  }

  async chat(
    messages: ChatMessage[],
    maxTokens: number,
    onToken: (text: string) => void,
    _transfer?: Transferable[],
    target?: ModelTarget,
    signal?: AbortSignal
  ): Promise<LlmChatResult> {
    if (!target && this.currentVersion === null) {
      throw new Error("模型尚未加载");
    }
    const reqId = nextRpcId("llm-chat");
    this.activeChatReqId = reqId;
    const hasImages = messages.some((m) => m.images && m.images.length > 0);
    try {
      const result = await this.host.request<
        { messages: ChatMessage[]; maxTokens: number },
        LlmChatResult
      >(
        {
          id: reqId,
          service: "llm",
          method: "chat",
          payload: { messages, maxTokens, ...target },
          priority: TASK_PRIORITY.LLM,
          options: {
            sessionVersion: target
              ? undefined
              : (this.currentVersion ?? undefined),
            modelId: this.currentModelId ?? undefined,
          },
        },
        {
          timeoutMs: hasImages ? 300_000 : undefined,
          signal,
          onProgress: (p) => {
            if (p.status) this.onProgress?.(p.status);
          },
          onStream: (ev) => {
            if (ev.type === "token") {
              onToken(ev.text);
            }
          },
        }
      );
      if (target) {
        const info = result as typeof result & {
          modelId?: string;
          sessionVersion?: number;
        };
        this.currentModelId = info.modelId ?? null;
        this.currentVersion = info.sessionVersion ?? null;
        this.isLoaded = this.currentVersion !== null;
        this.onStateChange?.(this.isLoaded);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("MODEL_SWITCHED") ||
        msg.includes("MODEL_UNLOADED") ||
        msg.includes("HOST_CLOSED")
      ) {
        this.isLoaded = false;
        this.onStateChange?.(false, msg);
      }
      throw err;
    } finally {
      if (this.activeChatReqId === reqId) {
        this.activeChatReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activeChatReqId) {
      this.host.cancel(
        this.activeChatReqId,
        "REQUEST_CANCELLED: 用户已停止生成"
      );
    }
    void this.host
      .request({
        id: nextRpcId("llm-stop"),
        service: "llm",
        method: "stop",
        payload: {},
      })
      .catch(() => undefined);
  }

  async unload(): Promise<void> {
    await this.host.request({
      id: nextRpcId("llm-unload"),
      service: "llm",
      method: "unload",
      payload: {},
    });
    this.isLoaded = false;
    this.currentVersion = null;
    this.currentModelId = null;
    this.onStateChange?.(false);
  }

  dispose(): void {
    this.unsubState?.();
    this.unsubState = null;
    void this.unload().catch(() => undefined);
  }
}
