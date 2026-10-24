import type { ModelRecord, Settings } from "../core/types";

export const KISS_AI_RPC_CHANNEL = "kiss-ai-runtime-rpc";

export type AiRpcService =
  | "doc"
  | "decision"
  | "asr"
  | "ocr"
  | "translation"
  | "vlm"
  | "llm"
  | "tts"
  | "embedding"
  | "model"
  | "runtime";

export type AiErrorCode =
  | "INPUT_LIMIT_EXCEEDED"
  | "INPUT_INVALID"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_DOWNLOAD_FAILED"
  | "MODEL_HASH_MISMATCH"
  | "MODEL_LOAD_FAILED"
  | "MODEL_SWITCHED"
  | "MODEL_UNLOADED"
  | "HOST_CLOSED"
  | "WEBGPU_UNAVAILABLE"
  | "WEBGPU_DEVICE_LOST"
  | "RESOURCE_BUDGET_EXCEEDED"
  | "OUT_OF_MEMORY"
  | "INFERENCE_FAILED"
  | "INVALID_DECISION_SCHEMA"
  | "TOKEN_LIMIT_EXCEEDED"
  | "REQUEST_CANCELLED"
  | "REQUEST_TIMEOUT"
  | "UNKNOWN_ERROR";

export interface ServiceSessionState {
  service: AiRpcService;
  modelId: string | null;
  sessionVersion: number;
  state: "unloaded" | "loading" | "ready" | "idle" | "unloading";
  reason?: string;
  busy?: boolean;
  backend?: string;
  loadSpec?: Record<string, unknown>;
  settings?: Settings;
}

export interface AiRpcRequest<T = unknown> {
  id: string;
  service: AiRpcService;
  method: string;
  payload: T;
  priority?: number;
  deadlineMs?: number;
  diagnostic?: { taskId?: string; attempt?: number };
  options?: {
    signalId?: string;
    modelId?: string;
    backend?: string;
    sessionVersion?: number;
    cacheMode?: "default" | "refresh" | "off";
  };
}

export interface AiRpcResponse<T = unknown> {
  id: string;
  ok: boolean;
  result?: T;
  error?: {
    code: AiErrorCode | string;
    message: string;
    retryable?: boolean;
  };
  usage?: {
    cacheHit?: boolean;
    queueMs?: number;
    loadMs?: number;
    inferenceMs?: number;
    totalMs?: number;
  };
}

export interface AiRpcProgress {
  id: string;
  type: "queued" | "downloading" | "verifying" | "loading" | "running";
  progress?: number;
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
  message?: string;
}

export interface AiRpcStreamEvent {
  id: string;
  type: "token";
  text: string;
}

export interface ModelImportTaskResult {
  taskId: string;
  modelId: string;
  ok: boolean;
  imported?: number;
  record?: ModelRecord;
  error?: string;
}

export type RpcChannelEnvelope =
  | { kind: "ping"; id: string }
  | { kind: "pong"; id: string }
  | { kind: "request"; request: AiRpcRequest }
  | { kind: "cancel"; id: string; reason?: string }
  | { kind: "response"; response: AiRpcResponse }
  | { kind: "progress"; progress: AiRpcProgress }
  | { kind: "stream"; stream: AiRpcStreamEvent }
  | { kind: "service-state"; state: ServiceSessionState }
  | { kind: "host-closed"; reason?: string }
  | { kind: "model-broadcast"; id: string; record: ModelRecord }
  | { kind: "model-import-result"; result: ModelImportTaskResult };

let seq = 0;
export function nextRpcId(prefix = "rpc"): string {
  seq = (seq + 1) % 1_000_000_000;
  return `${prefix}-${Date.now()}-${seq}`;
}
