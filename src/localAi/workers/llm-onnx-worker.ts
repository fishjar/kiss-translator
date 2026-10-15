// ONNX LLM / VLM 推理 worker（transformers.js + onnxruntime-web）。
// 模型文件经 ortOpfsBridge 的 env.fetch 桥接读自本地 OPFS。
import {
  AutoProcessor,
  AutoTokenizer,
  GlmOcrForConditionalGeneration,
  InterruptableStoppingCriteria,
  pipeline,
  RawImage,
  TextStreamer,
  type DataType,
  type DeviceType,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web";
import {
  buildPaddleOcrVlPatches,
  buildPaddleOcrVlPrompt,
  PADDLE_OCR_VL_EOS_TOKEN_ID,
  PADDLE_OCR_VL_HIDDEN_SIZE,
  PADDLE_OCR_VL_IMAGE_TOKEN_ID,
  smartResizePaddleOcrVl,
  splicePaddleOcrVlImageEmbeds,
} from "../core/paddleOcrVlOnnx";
import type { ChatMessage, LlmOnnxLoadSpec } from "../core/types";
import {
  getCurrentOpfsIndex,
  initTransformersOpfsBridge,
  ORT_WASM_PATHS,
  setOpfsModelDir,
} from "./ortOpfsBridge";

type InMsg =
  | ({ type: "load" } & LlmOnnxLoadSpec)
  | { type: "chat"; messages: ChatMessage[]; maxTokens: number; temperature?: number }
  | { type: "stop" }
  | { type: "unload" };

type OutMsg =
  | { type: "progress"; status?: string }
  | { type: "ready"; backend: "webgpu" | "wasm" }
  | { type: "token"; text: string }
  | {
      type: "done";
      text: string;
      elapsedMs: number;
      tokensPerSecond?: number;
      aborted?: boolean;
    }
  | { type: "unloaded" }
  | { type: "error"; message: string };

function post(msg: OutMsg): void {
  (self as unknown as Worker).postMessage(msg);
}

function friendly(message: string): string {
  // q4f16 大图在 32 位 wasm（4 GiB 上限）建会话即 OOM；给出可操作的提示
  if (message.includes("std::bad_alloc")) {
    return "WASM 后端内存不足（32 位 wasm 4 GiB 上限）：本机 WebGPU 不支持 f16，且该 ONNX 模型过大无法用 WASM 运行。请更换支持 f16 的 GPU（WebGPU），或改用 GGUF 版模型。";
  }
  return message;
}

initTransformersOpfsBridge();
ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
ort.env.wasm.numThreads = 1;

interface PaddleOcrVlSessions {
  tokenizer: PreTrainedTokenizer;
  visionSession: ort.InferenceSession;
  embeddingSession: ort.InferenceSession;
  decoderSession: ort.InferenceSession;
}

let generator: TextGenerationPipeline | null = null;
let vlmModel: PreTrainedModel | null = null;
let vlmProcessor: Processor | null = null;
let paddleVl: PaddleOcrVlSessions | null = null;
const stoppingCriteria = new InterruptableStoppingCriteria();
let stopRequested = false;

async function disposeGenerator(): Promise<void> {
  const g = generator, m = vlmModel, p = paddleVl;
  generator = null; vlmModel = null; vlmProcessor = null; paddleVl = null;
  const results = await Promise.allSettled([g?.dispose(), m?.dispose(), p?.visionSession.release(), p?.embeddingSession.release(), p?.decoderSession.release()]);
  const failure = results.find((r) => r.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function isGlmOcrModel(source: string): boolean {
  return /glm-ocr/i.test(source);
}

function isPaddleOcrVlOnnxModel(source: string): boolean {
  return /paddleocr-vl/i.test(source);
}

async function readOpfsModelBytes(relPath: string): Promise<Uint8Array> {
  const idx = await getCurrentOpfsIndex();
  const handle = idx.get(relPath);
  if (!handle) {
    throw new Error(`本地模型缺少文件：${relPath}（请到模型中心下载）`);
  }
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

async function createOrtSessionWithFallback(
  bytes: Uint8Array,
  preferredDevice: "webgpu" | "wasm"
): Promise<{ session: ort.InferenceSession; backend: "webgpu" | "wasm" }> {
  const eps: ("webgpu" | "wasm")[] =
    preferredDevice === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
  for (const ep of eps) {
    try {
      const session = await ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
      });
      return { session, backend: ep };
    } catch {
      try {
        const session = await ort.InferenceSession.create(bytes, {
          executionProviders: [ep],
          graphOptimizationLevel: "disabled",
        });
        return { session, backend: ep };
      } catch {
        // 继续尝试下一个执行后端
      }
    }
  }
  throw new Error("无法创建 ONNX Runtime 推理会话");
}

async function doLoad(spec: LlmOnnxLoadSpec): Promise<"webgpu" | "wasm"> {
  if (generator || vlmModel || paddleVl) {
    post({ type: "progress", status: "卸载旧模型…" });
    await disposeGenerator();
  }
  setOpfsModelDir(spec.dir);
  let device = spec.device as DeviceType;
  // f16 模型（q4f16）依赖 WebGPU shader-f16 特性；缺失时 ORT 会在运行时逐节点
  // 回退并反复重跑整图，推理实际卡死。这里加载前探测并直接改用 WASM 后端。
  if (device === "webgpu" && String(spec.dtype).includes("f16")) {
    const nav = navigator as Navigator & {
      gpu?: {
        requestAdapter?: () => Promise<{
          features: ReadonlySet<string>;
        } | null>;
      };
    };
    let hasF16 = false;
    try {
      const adapter = (await nav.gpu?.requestAdapter?.()) ?? null;
      hasF16 = adapter?.features.has("shader-f16") ?? false;
    } catch {
      hasF16 = false;
    }
    if (!hasF16) {
      post({
        type: "progress",
        status: "本机 WebGPU 不支持 f16（缺 shader-f16），回退 WASM (CPU) 后端…",
      });
      device = "wasm";
    }
  }
  const progressCallback = (p: {
    status?: string;
    file?: string;
    progress?: number;
  }) => {
    const pct = p.progress ? ` ${(Math.round(p.progress * 100))}%` : "";
    post({
      type: "progress",
      status: `${p.status ?? "加载"}${p.file ? `: ${p.file}` : ""}${pct}`,
    });
  };
  post({ type: "progress", status: "加载本地模型文件 (OPFS)…" });
  const baseOpts: Record<string, unknown> = {
    dtype: spec.dtype as DataType,
    device,
    progress_callback: progressCallback,
  };
  if (spec.externalDataChunks) {
    baseOpts.use_external_data_format = spec.externalDataChunks;
  }
  if (isPaddleOcrVlOnnxModel(spec.source)) {
    const preferred = device === "webgpu" ? "webgpu" : "wasm";
    post({ type: "progress", status: "加载分词器 tokenizer…" });
    const tokenizer = await AutoTokenizer.from_pretrained(spec.source, {
      progress_callback: progressCallback,
    });
    post({
      type: "progress",
      status: "加载视觉编码器 vision_encoder_q8.onnx…",
    });
    const visionBytes = await readOpfsModelBytes("onnx/vision_encoder_q8.onnx");
    const { session: visionSession, backend: visionBackend } =
      await createOrtSessionWithFallback(visionBytes, preferred);

    post({ type: "progress", status: "加载词嵌入模型 embedding.onnx…" });
    const embedBytes = await readOpfsModelBytes("onnx/embedding.onnx");
    const { session: embeddingSession } = await createOrtSessionWithFallback(
      embedBytes,
      visionBackend
    );

    post({ type: "progress", status: "加载语言解码器 decoder_q8.onnx…" });
    const decoderBytes = await readOpfsModelBytes("onnx/decoder_q8.onnx");
    const { session: decoderSession, backend: decBackend } =
      await createOrtSessionWithFallback(decoderBytes, visionBackend);

    paddleVl = {
      tokenizer,
      visionSession,
      embeddingSession,
      decoderSession,
    };
    return decBackend;
  }
  if (isGlmOcrModel(spec.source)) {
    // GLM-OCR 的各 ONNX 子模型（embed_tokens / decoder / vision_encoder）
    // 均带有独立的 .onnx_data 外部数据文件，必须显式启用外部数据支持，
    // 否则 transformers.js 不会加载 .onnx_data，导致 ORT 报 Module.MountedFiles 错误。
    baseOpts.use_external_data_format = true;
    vlmProcessor = await AutoProcessor.from_pretrained(spec.source, {
      progress_callback: progressCallback,
    });
    try {
      vlmModel = await GlmOcrForConditionalGeneration.from_pretrained(
        spec.source,
        baseOpts
      );
    } catch {
      post({
        type: "progress",
        status: "建会话失败，关闭图优化重试…",
      });
      vlmModel = await GlmOcrForConditionalGeneration.from_pretrained(
        spec.source,
        {
          ...baseOpts,
          session_options: { graphOptimizationLevel: "disabled" },
        }
      );
    }
    return device === "webgpu" ? "webgpu" : "wasm";
  }
  try {
    generator = await pipeline("text-generation", spec.source, baseOpts);
  } catch {
    // 个别模型会触发 ORT 图变换 bug（如 LayerNorm 融合引用悬空），
    // 关闭会话图优化后重试一次。
    post({
      type: "progress",
      status: "建会话失败，关闭图优化重试…",
    });
    generator = await pipeline("text-generation", spec.source, {
      ...baseOpts,
      session_options: { graphOptimizationLevel: "disabled" },
    });
  }
  return device === "webgpu" ? "webgpu" : "wasm";
}

async function doChat(
  messages: ChatMessage[],
  maxTokens: number,
  temperature?: number
): Promise<void> {
  stoppingCriteria.reset();
  stopRequested = false;
  const t0 = performance.now();
  let full = "";
  let tokenCount = 0;

  if (paddleVl) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) throw new Error("消息列表为空");
    const imgBuf = lastMsg.images?.[0];
    if (!imgBuf) throw new Error("PaddleOCR-VL 需要提供输入图像");

    const bmp = await createImageBitmap(new Blob([imgBuf]));
    const resized = smartResizePaddleOcrVl(bmp.height, bmp.width);
    const canvas = new OffscreenCanvas(resized.width, resized.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      throw new Error("无法创建 OffscreenCanvas 2D 上下文");
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, resized.width, resized.height);
    bmp.close();
    const rgba = ctx.getImageData(0, 0, resized.width, resized.height).data;

    const { pixelValues, dims, gridThw, numMergedTokens } =
      buildPaddleOcrVlPatches(rgba, resized.width, resized.height);

    post({
      type: "progress",
      status: `视觉编码中 (${resized.width}×${resized.height}, ${numMergedTokens} 视觉 token)…`,
    });

    const visionOut = await paddleVl.visionSession.run({
      pixel_values: new ort.Tensor("float32", pixelValues, dims),
      image_grid_thw: new ort.Tensor(
        "int64",
        new BigInt64Array([
          BigInt(gridThw[0]),
          BigInt(gridThw[1]),
          BigInt(gridThw[2]),
        ]),
        [1, 3]
      ),
    });
    const imageEmbedsTensor =
      visionOut.image_embeds ?? Object.values(visionOut)[0];
    if (!imageEmbedsTensor) throw new Error("视觉编码器未返回有效输出张量");
    const imageEmbeds = imageEmbedsTensor.data as Float32Array;

    const promptStr = buildPaddleOcrVlPrompt(lastMsg.content, numMergedTokens);
    const encoded = paddleVl.tokenizer(promptStr, {
      add_special_tokens: false,
      return_tensor: false,
    }) as { input_ids: number[] | bigint[] | (number | bigint)[][] };
    const rawIds = Array.isArray(encoded.input_ids[0])
      ? (encoded.input_ids[0] as (number | bigint)[])
      : (encoded.input_ids as (number | bigint)[]);
    const seqLen = rawIds.length;
    const inputIdsBigInt = new BigInt64Array(seqLen);
    for (let i = 0; i < seqLen; i++) {
      inputIdsBigInt[i] = BigInt(rawIds[i] ?? 0);
    }

    const embedOut = await paddleVl.embeddingSession.run({
      input_ids: new ort.Tensor("int64", inputIdsBigInt, [1, seqLen]),
    });
    const textEmbedsTensor = embedOut.embeddings ?? Object.values(embedOut)[0];
    if (!textEmbedsTensor) throw new Error("词嵌入模型未返回有效输出张量");
    const textEmbeds = textEmbedsTensor.data as Float32Array;

    const mergedEmbeds = splicePaddleOcrVlImageEmbeds(
      textEmbeds,
      inputIdsBigInt,
      imageEmbeds,
      PADDLE_OCR_VL_IMAGE_TOKEN_ID,
      PADDLE_OCR_VL_HIDDEN_SIZE
    );

    post({ type: "progress", status: "生成文档解析内容…" });

    const NUM_LAYERS = 18;
    const kvCache: Record<string, ort.Tensor> = {};
    for (let l = 0; l < NUM_LAYERS; l++) {
      kvCache[`past_key_values.${l}.key`] = new ort.Tensor(
        "float32",
        new Float32Array(0),
        [1, 2, 0, 128]
      );
      kvCache[`past_key_values.${l}.value`] = new ort.Tensor(
        "float32",
        new Float32Array(0),
        [1, 2, 0, 128]
      );
    }

    const generatedIds: number[] = [];
    const eosId =
      typeof paddleVl.tokenizer.eos_token_id === "number"
        ? paddleVl.tokenizer.eos_token_id
        : PADDLE_OCR_VL_EOS_TOKEN_ID;
    let nextTokenId = 0;

    for (let step = 0; step < maxTokens; step++) {
      if (stopRequested) break;

      let curEmbedsTensor: ort.Tensor;
      let totalSeqLen: number;

      if (step === 0) {
        curEmbedsTensor = new ort.Tensor("float32", mergedEmbeds, [
          1,
          seqLen,
          PADDLE_OCR_VL_HIDDEN_SIZE,
        ]);
        totalSeqLen = seqLen;
      } else {
        const stepEmbedOut = await paddleVl.embeddingSession.run({
          input_ids: new ort.Tensor(
            "int64",
            new BigInt64Array([BigInt(nextTokenId)]),
            [1, 1]
          ),
        });
        const stepEmbedTensor =
          stepEmbedOut.embeddings ?? Object.values(stepEmbedOut)[0];
        if (!stepEmbedTensor) throw new Error("词嵌入解码步未返回有效张量");
        curEmbedsTensor = new ort.Tensor(
          "float32",
          stepEmbedTensor.data as Float32Array,
          [1, 1, PADDLE_OCR_VL_HIDDEN_SIZE]
        );
        totalSeqLen = seqLen + step;
      }

      const attnMask = new BigInt64Array(totalSeqLen);
      attnMask.fill(1n);

      const decOut = await paddleVl.decoderSession.run({
        inputs_embeds: curEmbedsTensor,
        attention_mask: new ort.Tensor("int64", attnMask, [1, totalSeqLen]),
        ...kvCache,
      });

      for (let l = 0; l < NUM_LAYERS; l++) {
        const presentK = decOut[`present.${l}.key`];
        const presentV = decOut[`present.${l}.value`];
        if (presentK) kvCache[`past_key_values.${l}.key`] = presentK;
        if (presentV) kvCache[`past_key_values.${l}.value`] = presentV;
      }

      const logitsTensor = decOut.logits ?? Object.values(decOut)[0];
      if (!logitsTensor) throw new Error("解码器未返回 logits 张量");
      const logitsData = logitsTensor.data as Float32Array;
      const vocabSize = logitsTensor.dims[2] ?? 103424;
      const curStepLen = logitsTensor.dims[1] ?? 1;
      const lastLogitsOffset = (curStepLen - 1) * vocabSize;

      let bestId = 0;
      let bestVal = -Infinity;
      for (let v = 0; v < vocabSize; v++) {
        const val = logitsData[lastLogitsOffset + v] ?? -Infinity;
        if (val > bestVal) {
          bestVal = val;
          bestId = v;
        }
      }

      if (
        bestId === PADDLE_OCR_VL_EOS_TOKEN_ID ||
        bestId === eosId ||
        bestId === 100273
      ) {
        break;
      }

      nextTokenId = bestId;
      generatedIds.push(bestId);
      tokenCount++;

      const decodedSoFar = paddleVl.tokenizer.decode(generatedIds, {
        skip_special_tokens: true,
      });
      if (
        decodedSoFar.length > full.length &&
        !decodedSoFar.endsWith("\uFFFD")
      ) {
        const delta = decodedSoFar.slice(full.length);
        full = decodedSoFar;
        post({ type: "token", text: delta });
      }
    }

    // Flush 尾部可能剩余的解码字符
    if (generatedIds.length > 0) {
      const finalDecoded = paddleVl.tokenizer.decode(generatedIds, {
        skip_special_tokens: true,
      });
      if (finalDecoded.length > full.length) {
        const delta = finalDecoded.slice(full.length);
        full = finalDecoded;
        post({ type: "token", text: delta });
      }
    }
  } else if (vlmModel && vlmProcessor) {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) throw new Error("消息列表为空");
    const imgBuf = lastMsg.images?.[0];
    const rawImg = imgBuf ? await RawImage.fromBlob(new Blob([imgBuf])) : null;
    const conversation = [
      {
        role: "user",
        content: [
          ...(rawImg ? [{ type: "image" }] : []),
          { type: "text", text: lastMsg.content },
        ],
      },
    ];
    const prompt = String(
      vlmProcessor.apply_chat_template(conversation, {
        add_generation_prompt: true,
        tokenize: false,
      })
    );
    const inputs = await (
      vlmProcessor as unknown as (
        text: string,
        images?: RawImage
      ) => Promise<Record<string, unknown>>
    )(prompt, rawImg ?? undefined);
    const streamer = new TextStreamer(vlmProcessor.tokenizer!, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (t: string) => {
        full += t;
        tokenCount++;
        post({ type: "token", text: t });
      },
    });
    await (
      vlmModel as unknown as {
        generate: (opts: Record<string, unknown>) => Promise<unknown>;
      }
    ).generate({
      ...inputs,
      max_new_tokens: maxTokens,
      do_sample: false,
      streamer,
      stopping_criteria: stoppingCriteria,
    });
  } else {
    const g = generator;
    if (!g) throw new Error("模型尚未加载");
    const streamer = new TextStreamer(g.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (t: string) => {
        full += t;
        tokenCount++;
        post({ type: "token", text: t });
      },
    });
    await g(
      messages.map((m) => ({ role: m.role, content: m.content })),
      {
        max_new_tokens: maxTokens,
        do_sample: temperature !== undefined && temperature > 0,
        ...(temperature !== undefined && temperature > 0 ? { temperature } : {}),
        streamer,
        stopping_criteria: stoppingCriteria,
      }
    );
  }

  const elapsedMs = Math.round(performance.now() - t0);
  const tokensPerSecond =
    elapsedMs > 0 && tokenCount > 0
      ? Math.round((tokenCount * 10000) / elapsedMs) / 10
      : undefined;
  post({
    type: "done",
    text: full,
    elapsedMs,
    tokensPerSecond,
    aborted: stopRequested,
  });
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === "stop") {
    stopRequested = true;
    stoppingCriteria.interrupt();
    return;
  }
  chain = chain.then(async () => {
    try {
      if (msg.type === "load") {
        const backend = await doLoad(msg);
        post({ type: "ready", backend });
      } else if (msg.type === "chat") {
        await doChat(msg.messages, msg.maxTokens, msg.temperature);
      } else if (msg.type === "unload") {
        await disposeGenerator();
        post({ type: "unloaded" });
      }
    } catch (err) {
      post({
        type: "error",
        message: friendly(err instanceof Error ? err.message : String(err)),
      });
    }
  });
};
