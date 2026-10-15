import {
  runtimeHost,
  type RuntimeHostAdapter,
} from "../runtime/runtimeHostAdapter";
import { nextRpcId } from "../runtime/rpc";
import { DOC_MODEL_ID } from "./catalog";
import type { DocLoadSpec, LayoutResult } from "./docLayout";
import type { ModelTarget } from "./modelTarget";

export class DocClient {
  cacheMode: "default" | "refresh" | "off" = "default";
  public onProgress?: (status: string) => void;
  public onStateChange?: (ready: boolean, reason?: string) => void;
  private isLoaded = false;
  private currentVersion: number | null = null;
  private activeAnalyzeReqId: string | null = null;
  private unsubState: (() => void) | null = null;

  constructor(private host: RuntimeHostAdapter = runtimeHost) {
    this.unsubState = this.host.onServiceState((st) => {
      if (st.service !== "doc") return;
      if (
        this.currentVersion !== null &&
        st.sessionVersion !== this.currentVersion
      ) {
        if (this.isLoaded) {
          this.isLoaded = false;
          const reason =
            st.state === "unloaded"
              ? st.reason || "DOC 模型已被卸载或淘汰"
              : `DOC 模型已切换（当前为 ${st.modelId}）`;
          this.onStateChange?.(false, reason);
        }
      }
    });
  }

  async load(
    options: Partial<DocLoadSpec> = {},
    target?: ModelTarget,
    signal?: AbortSignal
  ) {
    try {
      const result = await this.host.request(
        {
          id: nextRpcId("doc-load"),
          service: "doc",
          method: "load",
          payload: {
            modelRef: target?.modelRef || DOC_MODEL_ID,
            loadSpec: { ...options, ...target?.loadSpec },
          },
        },
        {
          signal,
          onProgress: (p) => {
            if (p.status) this.onProgress?.(p.status);
          },
        }
      );
      this.isLoaded = true;
      this.onStateChange?.(true);
      return result;
    } catch (err) {
      this.isLoaded = false;
      this.onStateChange?.(
        false,
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  }

  async analyze(
    blob: Blob,
    options: { modelId?: string; device?: string; cacheMode?: "default" | "refresh" | "off" } = {},
    signal?: AbortSignal
  ): Promise<LayoutResult> {
    const reqId = nextRpcId("doc-analyze");
    this.activeAnalyzeReqId = reqId;
    try {
      const result = await this.host.request<any, LayoutResult>(
        {
          id: reqId,
          service: "doc",
          method: "analyze",
          options: { cacheMode: options.cacheMode || this.cacheMode },
          payload: {
            blob,
            modelRef: options.modelId || DOC_MODEL_ID,
            loadSpec: { device: options.device || "wasm" },
          },
        },
        {
          signal,
          onProgress: (p) => {
            if (p.status) this.onProgress?.(p.status);
          },
        }
      );
      if (!this.isLoaded) {
        this.isLoaded = true;
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
      if (this.activeAnalyzeReqId === reqId) {
        this.activeAnalyzeReqId = null;
      }
    }
  }

  stop(): void {
    if (this.activeAnalyzeReqId) {
      this.host.cancel(
        this.activeAnalyzeReqId,
        "REQUEST_CANCELLED: 用户已中止版面分析"
      );
      this.activeAnalyzeReqId = null;
    }
  }

  async unload(): Promise<void> {
    await this.host.request({
      id: nextRpcId("doc-unload"),
      service: "doc",
      method: "unload",
      payload: {},
    });
    this.isLoaded = false;
    this.currentVersion = null;
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
}
