import type { ModelTarget } from "./modelTarget";
import type { JevLoadSpec } from "./types";
import type {
  DecisionEngine,
  DecisionQuestions,
  DecisionResult,
  DecisionState,
} from "./jev";
import { nextRpcId } from "../runtime/rpc";
import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { TASK_PRIORITY } from "../runtime/taskScheduler";

export interface JevLoadInfo {
  backend: "webgpu" | "wasm";
  modelId?: string;
  sessionVersion?: number;
}

/**
 * JEV (Laya System-1 Decision Engine) 客户端：
 * 实现统一 DecisionEngine 接口，携带 sessionVersion 并监听宿主状态变化。
 */
export class JevClient implements DecisionEngine {
  cacheMode: "default" | "refresh" | "off" = "default";
  onProgress: ((status: string) => void) | null = null;
  onStateChange: ((ready: boolean, reason?: string) => void) | null = null;
  private isLoaded = false;
  private currentVersion: number | null = null;
  private currentModelId: string | null = null;
  private activePredictReqId: string | null = null;
  private readonly host: RuntimeHostAdapter;
  private unsubState: (() => void) | null = null;

  constructor(host: RuntimeHostAdapter = runtimeHost) {
    this.host = host;
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "decision") return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "JEV 模型已被卸载或淘汰"
              : `JEV 模型已切换（当前为 ${st.modelId}）`;
          this.onStateChange?.(false, reason);
        }
      }
    });
  }

  async load(spec: JevLoadSpec, target?: ModelTarget): Promise<JevLoadInfo> {
    const info = await this.host.request<
      JevLoadSpec & Partial<ModelTarget>,
      JevLoadInfo
    >(
      {
        id: nextRpcId("jev-load"),
        service: "decision",
        method: "load",
        payload: target
          ? {
              ...spec,
              modelRef: target.modelRef,
              loadSpec: { ...spec, ...target.loadSpec },
            }
          : spec,
        priority: TASK_PRIORITY.DECISION,
      },
      {
        onProgress: (p) => {
          if (p.status) this.onProgress?.(p.status);
        },
      }
    );
    this.currentVersion = info.sessionVersion ?? 1;
    this.currentModelId = info.modelId ?? spec.modelId;
    this.isLoaded = true;
    this.onStateChange?.(true);
    return info;
  }

  async predict(
    state: DecisionState,
    questions: DecisionQuestions,
    target?: ModelTarget
  ): Promise<DecisionResult> {
    if (!target && this.currentVersion === null)
      throw new Error("JEV 模型尚未加载");
    const reqId = nextRpcId("jev-predict");
    this.activePredictReqId = reqId;
    try {
      const result = await this.host.request<
        { state: DecisionState; questions: DecisionQuestions },
        DecisionResult
      >({
        id: reqId,
        service: "decision",
        method: "predict",
        payload: { state, questions, ...target },
        priority: TASK_PRIORITY.DECISION,
        options: {
          cacheMode: target?.cacheMode || this.cacheMode,
          sessionVersion: target
            ? undefined
            : (this.currentVersion ?? undefined),
          modelId: this.currentModelId ?? undefined,
        },
      }, { onProgress: (p) => { if (p.status) this.onProgress?.(p.status); } });
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
      if (this.activePredictReqId === reqId) {
        this.activePredictReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activePredictReqId) {
      this.host.cancel(
        this.activePredictReqId,
        "REQUEST_CANCELLED: 用户已中止 JEV 推理"
      );
      this.activePredictReqId = null;
    }
  }

  async unload(): Promise<void> {
    await this.host.request({
      id: nextRpcId("jev-unload"),
      service: "decision",
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

  get loaded(): boolean {
    return this.isLoaded;
  }

  get sessionVersion(): number | null {
    return this.currentVersion;
  }
}
