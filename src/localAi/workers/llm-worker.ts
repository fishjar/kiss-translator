// 发布包的 main 指向不存在的 index.js，直接深引 ESM 构建产物
// eslint-disable-next-line import/no-unresolved
import {
  Wllama,
  WllamaAbortError,
  type ChatCompletionMessage,
} from "@wllama/wllama/esm/index.js";
// wllama 默认从 CDN 拉取 wasm，改为本地构建产物
// eslint-disable-next-line import/no-unresolved
import wasmUrl from "@wllama/wllama/esm/wasm/wllama.wasm?url";
import type { ChatMessage, LlmLoadSpec } from "../core/types";

type InMsg =
  | ({ type: "load" } & LlmLoadSpec)
  | { type: "chat"; messages: ChatMessage[]; maxTokens: number }
  | { type: "stop" }
  | { type: "unload" };

type OutMsg =
  | { type: "progress"; status?: string }
  | { type: "ready"; backend: "webgpu" | "cpu" }
  | { type: "token"; text: string }
  | {
      type: "done";
      text: string;
      elapsedMs: number;
      tokensPerSecond?: number;
      aborted?: boolean;
    }
  | { type: "error"; message: string };

function post(msg: OutMsg): void {
  (self as unknown as Worker).postMessage(msg);
}

// 单个 Wllama 实例贯穿 worker 生命周期；
// exit() 会 terminate 内部推理 worker 并置空 proxy，再次 loadModel 安全。
let wllama: Wllama | null = null;
let aborter: AbortController | null = null;

// 收集 loadModel 期间的 llama.cpp 日志，用于判定实际生效的推理后端。
// WebGPU 生效时会分配 "WebGPU model buffer"；否则全部落到 "CPU model buffer"。
// （adapter 缺 shader-f16 等特性时 wllama 会静默回退 CPU，无告警日志）
let loadLog: string[] = [];

function logLine(...args: unknown[]): void {
  if (loadLog.length >= 4000) return;
  loadLog.push(
    args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
  );
}

const loadLogger = {
  debug: logLine,
  log: logLine,
  warn: logLine,
  error: logLine,
};

function ensureEngine(): Wllama {
  if (!wllama) {
    wllama = new Wllama({ default: wasmUrl }, { logger: loadLogger });
  }
  return wllama;
}

function detectBackend(): "webgpu" | "cpu" {
  return loadLog.some((l) => /WebGPU model buffer/i.test(l))
    ? "webgpu"
    : "cpu";
}

async function doLoad(spec: LlmLoadSpec): Promise<"webgpu" | "cpu"> {
  const engine = ensureEngine();
  loadLog = [];
  if (engine.isModelLoaded()) {
    post({ type: "progress", status: "卸载旧模型…" });
    await engine.exit();
  }
  post({ type: "progress", status: "从 OPFS 读取 GGUF…" });
  let dir = await navigator.storage.getDirectory();
  for (const part of spec.dir.split("/")) {
    dir = await dir.getDirectoryHandle(part, { create: false });
  }
  const handle = await dir.getFileHandle(spec.file);
  const file = await handle.getFile();
  const blobs: Blob[] = [file];
  let totalBytes = file.size;
  if (spec.mmprojFile) {
    const mmHandle = await dir.getFileHandle(spec.mmprojFile);
    const mmFile = await mmHandle.getFile();
    // wllama 按 general.architecture=="clip" 自动分离 mmproj
    blobs.push(mmFile);
    totalBytes += mmFile.size;
  }
  post({
    type: "progress",
    status: `加载模型 (${(totalBytes / 1048576).toFixed(0)} MB) → ${
      spec.device === "webgpu" ? "WebGPU" : "WASM"
    }…`,
  });
  await engine.loadModel(
    blobs,
    {
      n_ctx: spec.nCtx,
      // n_gpu_layers>0 时请求 WebGPU；adapter 不满足要求（如缺 shader-f16）会静默回退纯 CPU
      n_gpu_layers: spec.device === "webgpu" ? 99999 : 0,
      ...(spec.mmprojFile ? { image_max_tokens: 256 } : {}),
    }
  );
  return detectBackend();
}

// CPU 回退模式下，27 层 NaViT/CLIP 视觉编码器对大图（>5000 patches）存在 O(N^2) 注意力瓶颈，
// 单张截图 prefill 可耗时 15 分钟以上。将最长边缩放至 560px（28 的整数倍，约 100~196 视觉 token）
// 可将视觉注意力计算量降低约 100 倍，使 CPU 回退模式下也能在数秒至数十秒内出字。
async function downscaleImageForCpuIfNeeded(
  buf: ArrayBuffer,
  maxSide = 560
): Promise<ArrayBuffer> {
  if (
    typeof createImageBitmap === "undefined" ||
    typeof OffscreenCanvas === "undefined"
  ) {
    return buf;
  }
  try {
    const bmp = await createImageBitmap(new Blob([buf]));
    const { width, height } = bmp;
    if (width <= maxSide && height <= maxSide) {
      bmp.close();
      return buf;
    }
    const scale = maxSide / Math.max(width, height);
    // 对齐到 28 (patch_size 14 * merge_size 2) 的整数倍，最少 28px
    const targetW = Math.max(28, Math.round((width * scale) / 28) * 28);
    const targetH = Math.max(28, Math.round((height * scale) / 28) * 28);
    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return buf;
    }
    ctx.drawImage(bmp, 0, 0, targetW, targetH);
    bmp.close();
    const outBlob = await canvas.convertToBlob({ type: "image/png" });
    return await outBlob.arrayBuffer();
  } catch {
    return buf;
  }
}

// 把 core ChatMessage 映射为 wllama OAI 兼容消息；
// images 非空时将 image 置于 text 之前，使 mediaMarker 落在文本提示词前缀位（如 <image>document parsing.）。
function toWllamaMessages(messages: ChatMessage[]): ChatCompletionMessage[] {
  return messages.map((m): ChatCompletionMessage => {
    if (m.role === "user" && m.images && m.images.length > 0) {
      return {
        role: "user",
        content: [
          ...m.images.map((data) => ({ type: "image" as const, data })),
          { type: "text", text: m.content },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function doChat(
  messages: ChatMessage[],
  maxTokens: number
): Promise<void> {
  const engine = wllama;
  if (!engine || !engine.isModelLoaded()) throw new Error("模型尚未加载");
  aborter = new AbortController();
  const t0 = performance.now();
  let full = "";
  let tps: number | undefined;
  const isCpu = detectBackend() === "cpu";
  const preparedMessages: ChatMessage[] = isCpu
    ? await Promise.all(
        messages.map(async (m) => {
          if (m.role === "user" && m.images && m.images.length > 0) {
            post({
              type: "progress",
              status: "CPU 模式：缩放图像分辨率以加速视觉编码…",
            });
            const scaled = await Promise.all(
              m.images.map((img) => downscaleImageForCpuIfNeeded(img, 560))
            );
            return { ...m, images: scaled };
          }
          return m;
        })
      )
    : messages;
  try {
    await engine.createChatCompletion({
      messages: toWllamaMessages(preparedMessages),
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: true,
      abortSignal: aborter.signal,
      onData: (chunk) => {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          post({ type: "token", text: delta });
        }
        const t = chunk.timings?.predicted_per_second;
        if (t) tps = t;
      },
    });
    post({
      type: "done",
      text: full,
      elapsedMs: Math.round(performance.now() - t0),
      tokensPerSecond: tps,
    });
  } catch (err) {
    if (err instanceof WllamaAbortError) {
      post({
        type: "done",
        text: full,
        elapsedMs: Math.round(performance.now() - t0),
        tokensPerSecond: tps,
        aborted: true,
      });
    } else {
      throw err;
    }
  } finally {
    aborter = null;
  }
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  // stop 不进串行链：立即中止进行中的生成
  if (msg.type === "stop") {
    aborter?.abort();
    return;
  }
  chain = chain.then(async () => {
    try {
      if (msg.type === "load") {
        const backend = await doLoad(msg);
        post({ type: "ready", backend });
      } else if (msg.type === "chat") {
        await doChat(msg.messages, msg.maxTokens);
      } else if (msg.type === "unload") {
        if (wllama) {
          await wllama.exit().catch(() => {
            // 忽略释放失败
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", message });
    }
  });
};
