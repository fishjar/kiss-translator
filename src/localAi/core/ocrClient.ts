import type { InputAdjustment } from "./types";
import type { ModelTarget } from "./modelTarget";
import type { OcrLoadSpec } from "./types";
import { nextRpcId } from "../runtime/rpc";
import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { TASK_PRIORITY } from "../runtime/taskScheduler";

export interface OcrLine {
  text: string;
  score: number;
  poly: [number, number][];
}

export interface OcrImageResult {
  inputAdjustments?: InputAdjustment[];
  width: number;
  height: number;
  items: OcrLine[];
  detMs: number;
  recMs: number;
  totalMs: number;
  backend: string;
  detProvider: string;
  recProvider: string;
}

export interface OcrLoadInfo {
  detProvider: string;
  recProvider: string;
  modelId?: string;
  sessionVersion?: number;
}

export function ocrBackendLabel(
  actual: OcrLoadInfo | null,
  requested: "webgpu" | "wasm"
): string {
  if (!actual) return requested === "webgpu" ? "WebGPU" : "WASM";
  const detGpu = actual.detProvider.toLowerCase().includes("webgpu");
  const recGpu = actual.recProvider.toLowerCase().includes("webgpu");
  if (detGpu && recGpu) return "WebGPU";
  if (detGpu || recGpu) {
    return `混合 (det=${actual.detProvider}, rec=${actual.recProvider})`;
  }
  return requested === "wasm" ? "WASM" : "CPU 回退";
}

/**
 * OCR 客户端（基于 RuntimeHostAdapter RPC）：
 * 携带 sessionVersion 并在模型被切换或 RuntimePool 淘汰时使就绪状态失效。
 */
export class OcrClient {
  cacheMode: "default" | "refresh" | "off" = "default";
  onProgress: ((status: string) => void) | null = null;
  onStateChange: ((ready: boolean, reason?: string) => void) | null = null;
  private isLoaded = false;
  private currentVersion: number | null = null;
  private currentModelId: string | null = null;
  private activeRecognizeReqId: string | null = null;
  private readonly host: RuntimeHostAdapter;
  private unsubState: (() => void) | null = null;

  constructor(host: RuntimeHostAdapter = runtimeHost) {
    this.host = host;
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "ocr") return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "OCR 模型已被卸载或淘汰"
              : `OCR 模型已切换（当前为 ${st.modelId}）`;
          this.onStateChange?.(false, reason);
        }
      }
    });
  }

  async load(spec: OcrLoadSpec, target?: ModelTarget): Promise<OcrLoadInfo> {
    const info = await this.host.request<
      OcrLoadSpec & Partial<ModelTarget>,
      OcrLoadInfo
    >(
      {
        id: nextRpcId("ocr-load"),
        service: "ocr",
        method: "load",
        payload: target
          ? {
              ...spec,
              modelRef: target.modelRef,
              loadSpec: { ...spec, ...target.loadSpec },
            }
          : spec,
        priority: TASK_PRIORITY.OCR,
      },
      {
        onProgress: (p) => {
          if (p.status) this.onProgress?.(p.status);
        },
      }
    );
    this.currentVersion = info.sessionVersion ?? 1;
    this.currentModelId = info.modelId ?? `${spec.detName}+${spec.recName}`;
    this.isLoaded = true;
    this.onStateChange?.(true);
    return info;
  }

  async recognize(
    blob: Blob,
    signal?: AbortSignal,
    target?: ModelTarget,
    onProgress?: (status: string) => void,
    deadlineAt?: number
  ): Promise<OcrImageResult> {
    if (!target && this.currentVersion === null)
      throw new Error("模型尚未加载");
    const reqId = nextRpcId("ocr-recognize");
    this.activeRecognizeReqId = reqId;
    try {
      const result = await this.host.request<{ blob: Blob }, OcrImageResult>(
        {
          id: reqId,
          deadlineMs: deadlineAt === undefined
            ? undefined : Math.max(1, deadlineAt - Date.now()),
          service: "ocr",
          method: "recognize",
          payload: { blob, ...target },
          priority: TASK_PRIORITY.OCR,
          options: {
            cacheMode: target?.cacheMode || this.cacheMode,
            sessionVersion: target
              ? undefined
              : (this.currentVersion ?? undefined),
            modelId: this.currentModelId ?? undefined,
          },
        },
        { signal, onProgress: (p) => { if (p.status) { this.onProgress?.(p.status); onProgress?.(p.status); } } }
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
      if (this.activeRecognizeReqId === reqId) {
        this.activeRecognizeReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activeRecognizeReqId) {
      this.host.cancel(
        this.activeRecognizeReqId,
        "REQUEST_CANCELLED: 用户已中止文字识别"
      );
      this.activeRecognizeReqId = null;
    }
  }

  async unload(): Promise<void> {
    await this.host.request({
      id: nextRpcId("ocr-unload"),
      service: "ocr",
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
