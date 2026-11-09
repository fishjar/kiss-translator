import {
  pipeline,
  type DataType,
  type DeviceType,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web";
import type { ASRSegment, ASRWord, AsrLoadSpec } from "../core/types";
import { buildWordSegments, type RawWord } from "../core/asrSegments";
import { mapAsrLanguage } from "../core/asrLanguages";
import { resolveWhisperLanguage, type LanguageDetection } from "../core/whisperLanguage";
import { readFile } from "../core/opfs";
import {
  decodeSenseVoiceCtc,
  extractSenseVoiceFeatures,
  mapSenseVoiceLanguageId,
  parseAmMvn,
  splitAudioOnSilence,
  type SenseVoiceCmvn,
} from "../core/senseVoice";
import {
  ORT_WASM_PATHS,
  initTransformersOpfsBridge,
  setOpfsModelDir,
} from "./ortOpfsBridge";
import { Converter as T2CN } from "opencc-js/t2cn";
import { Converter as CN2T } from "opencc-js/cn2t";

// 简繁转换：whisper 只有 <|zh|> 一个中文 token，输出偏繁体，
// 简繁由 OpenCC 后处理（t2cn: 繁→简，cn2t: 简→繁）
const toSimplified = T2CN({ from: "tw", to: "cn" });
const toTraditional = CN2T({ from: "cn", to: "tw" });

const SAMPLE_RATE = 16000;

initTransformersOpfsBridge();
if (ort.env.wasm) {
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  ort.env.wasm.numThreads = 1;
}

type InMsg =
  | ({ type: "load" } & AsrLoadSpec)
  | { type: "transcribe"; audio: Float32Array; language: string }
  | { type: "unload" };

type OutMsg =
  | {
      type: "progress";
      status?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }
  | { type: "ready" }
  | ({
      type: "result";
      segments: ASRSegment[];
      elapsedMs: number;
      durationSeconds: number;
    } & LanguageDetection)
  | { type: "error"; message: string };

function post(msg: OutMsg): void {
  (self as unknown as Worker).postMessage(msg);
}

type Transcriber = {
  (
    audio: Float32Array,
    opts: Record<string, unknown>
  ): Promise<WhisperOutput>;
  dispose?: () => void;
  tokenizer?: unknown;
};

const CJK_DETECT = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/;

// word 模式下 _decode_asr 依赖生成流内的语言 token 决定 CJK 分词方式；
// 显式传 language 时流内无语言 token（last_language=null），CJK 文本会按
// 英文空格分词退化为「整段一个词」。这里包一层：语言未知且文本含 CJK 时
// 按 chinese 走 Unicode 逐词分词（保留逐 token 的 DTW 精确时间戳）。
function patchWordTimestampsCjk(tk: unknown): void {
  const t = tk as {
    combineTokensIntoWords?: (
      tokens: number[],
      language?: string
    ) => unknown;
    decode?: (ids: number[]) => string;
  };
  if (typeof t?.combineTokensIntoWords !== "function" || !t.decode) return;
  const orig = t.combineTokensIntoWords;
  t.combineTokensIntoWords = function (
    this: unknown,
    tokens: number[],
    language?: string
  ) {
    let lang = language;
    if (!lang) {
      try {
        if (CJK_DETECT.test(t.decode!(tokens))) lang = "chinese";
      } catch {
        // 解码失败保持原行为
      }
    }
    return orig.call(this, tokens, lang);
  };
}

let transcriber: Transcriber | null = null;
let currentRuntime: "transformers" | "onnx" = "transformers";
let currentMultilingual = true;
let currentWordTimestamps = false;

let svSession: ort.InferenceSession | null = null;
let svCmvn: SenseVoiceCmvn | null = null;
let svTokens: string[] | null = null;

function disposeTranscriber(): void {
  if (transcriber) {
    try {
      transcriber.dispose?.();
    } catch {
      // 忽略释放失败
    }
    transcriber = null;
  }
  if (svSession) {
    try {
      void svSession.release();
    } catch {
      // 忽略释放失败
    }
    svSession = null;
  }
  svCmvn = null;
  svTokens = null;
}

async function doLoad(spec: AsrLoadSpec): Promise<void> {
  disposeTranscriber();
  currentRuntime = spec.runtime === "onnx" ? "onnx" : "transformers";
  currentMultilingual = spec.multilingual;
  currentWordTimestamps = spec.wordTimestamps;

  if (currentRuntime === "onnx") {
    post({ type: "progress", status: "读取本地配置与词表 (OPFS)…" });
    const [mvnBuf, tokensBuf] = await Promise.all([
      readFile(`${spec.dir}/am.mvn`),
      readFile(`${spec.dir}/tokens.json`),
    ]);
    const dec = new TextDecoder("utf-8");
    svCmvn = parseAmMvn(dec.decode(mvnBuf));
    svTokens = JSON.parse(dec.decode(tokensBuf)) as string[];

    post({
      type: "progress",
      status: "读取本地模型文件 (OPFS)",
      file: "model_quant.onnx",
    });
    const modelBuf = await readFile(`${spec.dir}/model_quant.onnx`);
    const ep = spec.device === "webgpu" ? "webgpu" : "wasm";
    post({
      type: "progress",
      status: `初始化 SenseVoice ORT 会话 (${ep})…`,
    });
    try {
      svSession = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
        executionProviders: [ep],
      });
    } catch (err) {
      if (ep === "webgpu") {
        // WebGPU 若因动态量化节点不支持失败，自动回退 WASM 保证可用
        post({
          type: "progress",
          status: "WebGPU 初始化回退至 WASM…",
        });
        svSession = await ort.InferenceSession.create(new Uint8Array(modelBuf), {
          executionProviders: ["wasm"],
        });
      } else {
        throw err;
      }
    }
    return;
  }

  setOpfsModelDir(spec.dir);
  post({ type: "progress", status: "加载本地模型文件 (OPFS)" });
  transcriber = (await pipeline("automatic-speech-recognition", spec.source, {
    dtype: spec.dtype as DataType,
    device: spec.device as DeviceType,
    progress_callback: (p: {
      status?: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => {
      post({
        type: "progress",
        status: p.status,
        file: p.file,
        progress: p.progress,
        loaded: p.loaded,
        total: p.total,
      });
    },
  })) as Transcriber;
  if (spec.wordTimestamps) patchWordTimestampsCjk(transcriber.tokenizer);
}

type WhisperChunk = { timestamp: [number, number | null] | null; text: string };
type WhisperOutput = { text: string; chunks: WhisperChunk[] };

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/;

// 分词：CJK 每字一个词，其它按空白切分
function splitWords(text: string): string[] {
  const tokens: string[] = [];
  const re = /([\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af])|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const t = m[1] ?? m[2] ?? "";
    if (t.trim().length > 0) tokens.push(t);
  }
  return tokens;
}

// 段内按字符长度线性插值出词级时间轴（模型未导出 cross-attention，无法取精确词级时间）
function interpolateWords(text: string, start: number, end: number): ASRWord[] {
  const tokens = splitWords(text);
  if (tokens.length === 0) return [];
  const totalLen = tokens.reduce((s, t) => s + t.length, 0);
  const span = Math.max(0, end - start);
  let cursor = start;
  return tokens.map((t) => {
    const w = Math.max(0.02, (t.length / totalLen) * span);
    const s = cursor;
    cursor += w;
    return { text: t, start: r3(s), end: r3(Math.min(end, cursor)) };
  });
}

// 段落时间戳来自 whisper 输出的时间戳 token（精确）；词级时间为段内插值（近似）。
// word 模式：chunks 为平铺词流，词时间戳来自 cross-attention 对齐（精确），
// 按静音间隙重组为段。
function buildSegments(
  out: WhisperOutput,
  durationSeconds: number,
  language: string | undefined,
  wordTimestamps: boolean
): ASRSegment[] {
  if (wordTimestamps) {
    const raw: RawWord[] = (out.chunks ?? []).map((c) => ({
      text: c.text ?? "",
      timestamp: c.timestamp ?? null,
    }));
    const segments = buildWordSegments(raw, durationSeconds, language);
    if (segments.length > 0) return segments;
    if ((out.text ?? "").trim()) {
      return [
        {
          id: "seg-0",
          timingSource: "audio-chunk",
          text: (out.text ?? "").trim(),
          start: 0,
          end: r3(durationSeconds),
          language,
        },
      ];
    }
    return [];
  }
  const segments: ASRSegment[] = (out.chunks ?? [])
    .map((c, i) => {
      const text = (c.text ?? "").trim();
      const start = r3(c.timestamp?.[0] ?? 0);
      const end = r3(c.timestamp?.[1] ?? durationSeconds);
      return {
        id: `seg-${i}`,
        timingSource: c.timestamp?.[0] != null && c.timestamp?.[1] != null ? "asr" as const : "audio-chunk" as const,
        text,
        start,
        end,
        words: interpolateWords(text, start, end),
        wordsTimingSource: "estimated" as const,
        language,
      };
    })
    .filter((s) => s.text.length > 0);
  // 兜底：无 chunks 时整段
  if (segments.length === 0 && (out.text ?? "").trim()) {
    const text = (out.text ?? "").trim();
    const start = 0;
    const end = r3(durationSeconds);
    segments.push({
      id: "seg-0",
      timingSource: "audio-chunk",
      text,
      start,
      end,
      words: interpolateWords(text, start, end),
      wordsTimingSource: "estimated",
      language,
    });
  }
  return segments;
}

async function transcribeSenseVoice(
  audio: Float32Array,
  language: string
): Promise<{
  segments: ASRSegment[];
  elapsedMs: number;
  durationSeconds: number;
  language?: string;
}> {
  if (!svSession || !svCmvn || !svTokens) {
    throw new Error("SenseVoice 模型尚未加载");
  }
  const t0 = performance.now();
  const langId = mapSenseVoiceLanguageId(language);
  // 14 = withitn（开启自动标点与逆文本正则化）
  const textnormId = 14;
  const { convert } = mapAsrLanguage(language);
  const toScript: ((s: string) => string) | null =
    convert === "t2s" ? toSimplified : convert === "s2t" ? toTraditional : null;

  const chunks = splitAudioOnSilence(audio, SAMPLE_RATE, 25, 15);
  const allSegments: ASRSegment[] = [];

  for (const chunk of chunks) {
    const { features, numFrames } = extractSenseVoiceFeatures(
      chunk.samples,
      svCmvn
    );
    const speechTensor = new ort.Tensor("float32", features, [
      1,
      numFrames,
      560,
    ]);
    const lenTensor = new ort.Tensor(
      "int32",
      new Int32Array([numFrames]),
      [1]
    );
    const langTensor = new ort.Tensor("int32", new Int32Array([langId]), [1]);
    const normTensor = new ort.Tensor(
      "int32",
      new Int32Array([textnormId]),
      [1]
    );

    try {
      const out = await svSession.run({
        speech: speechTensor,
        speech_lengths: lenTensor,
        language: langTensor,
        textnorm: normTensor,
      });
      const logitsTensor = out["ctc_logits"] ?? Object.values(out)[0];
      if (!logitsTensor) {
        throw new Error("SenseVoice ONNX 输出缺少 ctc_logits");
      }
      const dims = logitsTensor.dims;
      const numOutFrames = Number(dims[1] ?? 0);
      const vocabSize = Number(dims[2] ?? svTokens.length);
      const logitsData = logitsTensor.data as Float32Array;
      const offsetSec = chunk.startSample / SAMPLE_RATE;
      const chunkDurSec = chunk.samples.length / SAMPLE_RATE;

      const decoded = decodeSenseVoiceCtc(
        logitsData,
        numOutFrames,
        vocabSize,
        svTokens,
        offsetSec,
        chunkDurSec,
        toScript
      );
      for (const seg of decoded.segments) {
        allSegments.push({
          ...seg,
          id: `seg-${allSegments.length}`,
        });
      }
      for (const t of Object.values(out)) {
        t?.dispose?.();
      }
    } finally {
      speechTensor.dispose?.();
      lenTensor.dispose?.();
      langTensor.dispose?.();
      normTensor.dispose?.();
    }
  }

  const elapsedMs = Math.round(performance.now() - t0);
  const durationSeconds = audio.length / SAMPLE_RATE;
  return { segments: allSegments, elapsedMs, durationSeconds,
    language: allSegments.find(segment => segment.language)?.language };
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  chain = chain.then(async () => {
    try {
      if (msg.type === "load") {
        await doLoad(msg);
        post({ type: "ready" });
      } else if (msg.type === "transcribe") {
        if (currentRuntime === "onnx") {
          post({
            type: "progress",
            status: `开始 SenseVoice 语音识别 (${(msg.audio.length / SAMPLE_RATE).toFixed(1)}s 音频)…`,
          });
          const res = await transcribeSenseVoice(msg.audio, msg.language);
          post({ type: "result", ...res });
          return;
        }
        const t = transcriber;
        if (!t) throw new Error("模型尚未加载");
        const t0 = performance.now();
        // UI 语言值 → whisper 语言 + 简繁后处理（映射见 asrLanguages.ts）
        if (currentMultilingual && !mapAsrLanguage(msg.language).whisper)
          post({ type: "progress", status: "Detecting audio language…" });
        const { whisper: whisperLanguage, convert, ...detected } =
          await resolveWhisperLanguage(t, msg.audio, msg.language, currentMultilingual);
        if (detected.languagePending) {
          post({ type: "result", segments: [], elapsedMs: Math.round(performance.now() - t0),
            durationSeconds: msg.audio.length / SAMPLE_RATE, ...detected });
          return;
        }
        const toScript: ((s: string) => string) | null =
          convert === "t2s" ? toSimplified : convert === "s2t" ? toTraditional : null;
        const opts: Record<string, unknown> = {
          chunk_length_s: 30,
          stride_length_s: 5,
          // word 模式需模型导出 cross_attentions（timestamped 仓库），
          // 由库内置 cross-attention 对齐产出精确词时间戳；否则段级 + 段内插值
          return_timestamps: currentWordTimestamps ? "word" : true,
        };
        // 多语言模型需显式指定语言/任务；英文专用模型不可传（会抛错）
        if (currentMultilingual) {
          opts.language = whisperLanguage;
          opts.task = "transcribe";
        }
        const out = await t(msg.audio, opts);
        // 简繁转换作用于全文与各段文本（buildSegments 之前）
        if (toScript) {
          out.text = toScript(out.text ?? "");
          for (const chunk of out.chunks ?? []) {
            chunk.text = toScript(chunk.text ?? "");
          }
        }
        const elapsedMs = Math.round(performance.now() - t0);
        const durationSeconds = msg.audio.length / SAMPLE_RATE;
        const segments = buildSegments(
          out,
          durationSeconds,
          msg.language || undefined,
          currentWordTimestamps
        );
        post({ type: "result", segments, elapsedMs, durationSeconds,
          language: currentMultilingual ? whisperLanguage || undefined : "en", ...detected });
      } else if (msg.type === "unload") {
        disposeTranscriber();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", message });
    }
  });
};
