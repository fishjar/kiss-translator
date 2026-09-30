import type { TtsLoadSpec } from "./types";
import { nextRpcId } from "../runtime/rpc";
import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { TASK_PRIORITY } from "../runtime/taskScheduler";

export interface TtsProgress {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export interface SynthesizeResult {
  audio: Float32Array;
  elapsedMs: number;
  sampleRate: number;
}

/**
 * TTS 客户端（基于 RuntimeHostAdapter RPC）：
 * 携带 sessionVersion 并在模型被切换或 RuntimePool 淘汰时使就绪状态失效。
 */
export class TtsClient {
  onProgress: ((p: TtsProgress) => void) | null = null;
  onStateChange: ((ready: boolean, reason?: string) => void) | null = null;
  private isLoaded = false;
  private currentVersion: number | null = null;
  private currentModelId: string | null = null;
  private activeSynthReqId: string | null = null;
  private readonly host: RuntimeHostAdapter;
  private unsubState: (() => void) | null = null;

  constructor(host: RuntimeHostAdapter = runtimeHost) {
    this.host = host;
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "tts") return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "TTS 模型已被卸载或淘汰"
              : `TTS 模型已切换（当前为 ${st.modelId}）`;
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

  async load(spec: TtsLoadSpec): Promise<void> {
    const res = await this.host.request<
      TtsLoadSpec,
      { ok: boolean; modelId?: string; sessionVersion?: number }
    >(
      {
        id: nextRpcId("tts-load"),
        service: "tts",
        method: "load",
        payload: spec,
        priority: TASK_PRIORITY.TTS,
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

  async synthesize(
    text: string,
    voice: string,
    speed: number
  ): Promise<SynthesizeResult> {
    if (this.currentVersion === null) throw new Error("模型尚未加载");
    const reqId = nextRpcId("tts-synth");
    this.activeSynthReqId = reqId;
    try {
      return await this.host.request<
        { text: string; voice: string; speed: number },
        SynthesizeResult
      >({
        id: reqId,
        service: "tts",
        method: "synthesize",
        payload: { text, voice, speed },
        priority: TASK_PRIORITY.TTS,
        options: {
          sessionVersion: this.currentVersion,
          modelId: this.currentModelId ?? undefined,
        },
      });
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
      if (this.activeSynthReqId === reqId) {
        this.activeSynthReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activeSynthReqId) {
      this.host.cancel(
        this.activeSynthReqId,
        "REQUEST_CANCELLED: 用户已中止语音合成"
      );
      this.activeSynthReqId = null;
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
        id: nextRpcId("tts-dispose"),
        service: "tts",
        method: "dispose",
        payload: {},
      })
      .catch(() => undefined);
  }
}
