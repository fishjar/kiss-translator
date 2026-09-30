import type { ASRSegment, AsrLoadSpec } from "./types";
import { nextRpcId } from "../runtime/rpc";
import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { TASK_PRIORITY } from "../runtime/taskScheduler";

export interface AsrProgress {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface TranscribeResult {
  segments: ASRSegment[];
  elapsedMs: number;
  durationSeconds: number;
}

/**
 * ASR 客户端（基于 RuntimeHostAdapter RPC）：
 * 携带 sessionVersion 并在模型被切换或 RuntimePool 淘汰时使就绪状态失效。
 */
export class AsrClient {
  onProgress: ((p: AsrProgress) => void) | null = null;
  onStateChange: ((ready: boolean, reason?: string) => void) | null = null;
  private isLoaded = false;
  private currentVersion: number | null = null;
  private currentModelId: string | null = null;
  private activeTranscribeReqId: string | null = null;
  private readonly host: RuntimeHostAdapter;
  private unsubState: (() => void) | null = null;

  constructor(host: RuntimeHostAdapter = runtimeHost) {
    this.host = host;
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "asr") return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "ASR 模型已被卸载或淘汰"
              : `ASR 模型已切换（当前为 ${st.modelId}）`;
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

  async load(spec: AsrLoadSpec): Promise<void> {
    const res = await this.host.request<
      AsrLoadSpec,
      { ok: boolean; modelId?: string; sessionVersion?: number }
    >(
      {
        id: nextRpcId("asr-load"),
        service: "asr",
        method: "load",
        payload: spec,
        priority: TASK_PRIORITY.ASR,
      },
      {
        onProgress: (p) => {
          this.onProgress?.({
            status: p.status,
            file: p.file,
            progress: p.progress,
            loaded: p.loaded,
            total: p.total,
          });
        },
      }
    );
    this.currentVersion = res.sessionVersion ?? 1;
    this.currentModelId = res.modelId ?? spec.dir;
    this.isLoaded = true;
    this.onStateChange?.(true);
  }

  async transcribe(
    audio: Float32Array,
    language: string
  ): Promise<TranscribeResult> {
    if (this.currentVersion === null) throw new Error("模型尚未加载");
    const reqId = nextRpcId("asr-transcribe");
    this.activeTranscribeReqId = reqId;
    try {
      return await this.host.request<
        { audio: Float32Array; language: string },
        TranscribeResult
      >(
        {
          id: reqId,
          service: "asr",
          method: "transcribe",
          payload: { audio, language },
          priority: TASK_PRIORITY.ASR,
          options: {
            sessionVersion: this.currentVersion,
            modelId: this.currentModelId ?? undefined,
          },
        },
        {
          onProgress: (p) => {
            this.onProgress?.({
              status: p.status,
              file: p.file,
              progress: p.progress,
              loaded: p.loaded,
              total: p.total,
            });
          },
        }
      );
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
      if (this.activeTranscribeReqId === reqId) {
        this.activeTranscribeReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activeTranscribeReqId) {
      this.host.cancel(
        this.activeTranscribeReqId,
        "REQUEST_CANCELLED: 用户已中止识别"
      );
      this.activeTranscribeReqId = null;
    }
  }

  dispose(): void {
    this.isLoaded = false;
    this.currentVersion = null;
    this.currentModelId = null;
    this.unsubState?.();
    this.unsubState = null;
    void this.host
      .request({
        id: nextRpcId("asr-dispose"),
        service: "asr",
        method: "dispose",
        payload: {},
      })
      .catch(() => undefined);
  }
}
