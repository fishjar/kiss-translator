export type Mirror = "hf-mirror" | "huggingface" | "modelscope";

export type ModelTask =
  | "doc-layout"
  | "decision"
  | "asr"
  | "ocr-detection"
  | "ocr-recognition"
  | "ocr-vlm"
  | "llm"
  | "tts";

export type ModelRuntime =
  | "transformers"
  | "onnx"
  | "paddleocr"
  | "wllama"
  | "piper";

export type ModelFormat = "onnx" | "gguf" | "json" | "binary" | "tar";

export type Backend = "webgpu" | "wasm";

export interface ModelFile {
  path: string;
  size: number;
  sha256?: string;
  // 远端文件名与本地不同时指定下载源路径；缺省同 path
  remotePath?: string;
}

export interface ModelManifest {
  id: string;
  name: string;
  version: string;
  task: ModelTask;
  runtime: ModelRuntime;
  format: ModelFormat;
  backend: Backend[];
  languages?: string[];
  multilingual?: boolean;
  // 词级时间戳模型（decoder 导出 cross_attentions，词时间戳为 cross-attention
  // 对齐精确值而非段内插值）
  wordTimestamps?: boolean;
  size: number;
  files: ModelFile[];
  source: string;
  revision?: string;
  license?: string;
  // ModelScope 仓库路径与 HF 不同时指定（如 tencent/ vs Tencent-Hunyuan/）
  modelscopeSource?: string;
  dir: string;
  // 自定义下载基址（PaddleX 官方 CDN 等非 HF 来源）；缺省走镜像 + source 的 HF 布局
  base?: string;
}

export type ModelState =
  | "not-installed"
  | "queued"
  | "downloading"
  | "paused"
  | "verifying"
  | "installed"
  | "error";

export interface FileState {
  state: ModelState;
  downloaded: number;
  speed?: number;
  etaSeconds?: number | null;
  error?: string;
}

export interface ModelRecord {
  manifest: ModelManifest;
  state: ModelState;
  files: Record<string, FileState>;
  downloadedAt?: number;
  lastUsedAt?: number;
  error?: string;
}

export interface DeviceProfile {
  webgpu: boolean;
  webgpuShaderF16?: boolean;
  webgpuAdapter?: string;
  webgpuError?: string;
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
  wasmSimd: boolean;
  wasmSimdError?: string;
  sharedArrayBuffer: boolean;
  webnn: boolean;
  deviceMemoryGB?: number;
  cpuCores?: number;
  browser: string;
  platform: string;
}

export interface Settings {
  inferenceCacheEnabled: boolean;
  inferenceCacheMB: number;
  inferenceCacheDays: number;
  mirror: Mirror;
  autoUnloadMinutes: number;
  exclusiveResourceMode: boolean;
  residentMemoryBudgetMB: number;
  maxImageFileMB: number;
  maxImageEdge: number;
  maxAudioFileMB: number;
  maxAsrMinutes: number;
  maxTtsCharacters: number;
}

export const INPUT_LIMIT_KEYS = [
  "maxImageFileMB", "maxImageEdge", "maxAudioFileMB", "maxAsrMinutes", "maxTtsCharacters",
] as const;

export interface InputAdjustment {
  kind: "image" | "audio" | "text";
  original: number;
  processed: number;
  message: string;
}

export const DEFAULT_SETTINGS: Settings = {
  inferenceCacheEnabled: true,
  inferenceCacheMB: 256,
  inferenceCacheDays: 30,
  mirror: "hf-mirror",
  autoUnloadMinutes: 10,
  exclusiveResourceMode: true,
  residentMemoryBudgetMB: 0,
  maxImageFileMB: 10,
  maxImageEdge: 1536,
  maxAudioFileMB: 50,
  maxAsrMinutes: 5,
  maxTtsCharacters: 1000,
};

export const MIRROR_BASES: Record<Mirror, string> = {
  "hf-mirror": "https://hf-mirror.com",
  huggingface: "https://huggingface.co",
  modelscope: "https://modelscope.cn",
};

// ModelScope 的仓库布局与 HF 不同：/models/<org>/<repo>/resolve/master/<path>（分支 master）
function mirrorTail(mirror: Mirror, source: string, path: string): string {
  if (mirror === "modelscope") return `/models/${source}/resolve/master/${path}`;
  return `/${source}/resolve/main/${path}`;
}

export const isExtensionContext: boolean =
  typeof globalThis.chrome !== "undefined" &&
  Boolean((globalThis.chrome as { runtime?: { id?: string } } | undefined)?.runtime?.id);

export function fileUrl(
  mirror: Mirror,
  source: string,
  path: string,
  base?: string,
  revision?: string
): string {
  if (base) {
    // 自定义基址：扩展内直接请求；web 走 dev proxy（该源无 CORS 头）
    const full = `${base.replace(/\/$/, "")}/${path}`;
    if (isExtensionContext) return full;
    const u = new URL(full);
    return `/proxy/${u.host}${u.pathname}`;
  }
  if (revision && mirror === "modelscope") throw new Error("此固定版本模型不支持 ModelScope，请选择 Hugging Face 或 hf-mirror");
  const tail = revision ? `/${source}/resolve/${revision}/${path}` : mirrorTail(mirror, source, path);
  if (isExtensionContext) return `${MIRROR_BASES[mirror]}${tail}`;
  return `/proxy/${new URL(MIRROR_BASES[mirror]).host}${tail}`;
}

// 加载 ASR 模型所需的最小参数（由 UI 依据 catalog manifest 构造）。
export interface AsrLoadSpec {
  runtime?: "transformers" | "onnx";
  source: string;
  dir: string;
  device: string;
  dtype: string;
  multilingual: boolean;
  // 词级时间戳模型（whisper-base-timestamped / sensevoice-small）：词时间戳为精确值
  wordTimestamps: boolean;
}

// 加载 LLM 模型所需的最小参数（由 UI 依据 catalog manifest 构造）。
// mmprojFile：VLM 多模态投影文件（如 clip 架构 GGUF），wllama 按架构自动分离。
export interface LlmLoadSpec {
  runtime: "wllama";
  dir: string;
  file: string;
  mmprojFile?: string;
  device: "webgpu" | "wasm";
  nCtx: number;
}

// 加载 ONNX LLM 模型所需的最小参数（transformers.js + ORT 运行时）。
export interface LlmOnnxLoadSpec {
  runtime: "onnx";
  source: string;
  dir: string;
  device: "webgpu" | "wasm";
  dtype: string;
  // ONNX 主文件外部数据块数（>2GB 模型拆分为 _data/_data_1）
  externalDataChunks?: number;
}

// 加载 TTS 模型所需的最小参数（由 UI 依据 catalog manifest 构造）。
export interface TtsLoadSpec {
  engine: "kokoro" | "audio8" | "piper";
  source: string;
  dir: string;
  device: "webgpu" | "wasm";
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  // VLM 图像输入（wllama 消息 {type:'image',data}），跨 worker 需 transfer
  images?: ArrayBuffer[];
}

// 加载 OCR 模型组所需的最小参数（det+rec 成对，由 UI 依据 catalog 模型组构造）。
export interface OcrLoadSpec {
  detDir: string;
  detFile: string;
  detName: string;
  recDir: string;
  recFile: string;
  recName: string;
  device: "webgpu" | "wasm";
}

export interface ASRWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface ASRSegment {
  timingSource?: "asr" | "audio-chunk";
  id: string;
  text: string;
  start: number;
  end: number;
  words?: ASRWord[];
  wordsTimingSource?: "estimated";
  language?: string;
  emotion?: string;
  event?: string;
}

// 加载 JEV (Laya) 决策模型所需的最小参数。
export interface JevLoadSpec {
  modelId: string;
  source: string;
  dir: string;
  modelFile: string;
  tokenizerFile: string;
  tokenizerConfigFile?: string;
  configFile: string;
  device: "webgpu" | "wasm";
}

