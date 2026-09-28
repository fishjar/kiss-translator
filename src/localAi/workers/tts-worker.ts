import {
  StyleTextToSpeech2Model,
  AutoTokenizer,
  PreTrainedTokenizer,
  Tensor,
  type DataType,
  type DeviceType,
} from "@huggingface/transformers";
import * as ort from "onnxruntime-web/webgpu";
import { phonemize as espeakng } from "phonemizer";
import {
  AUDIO8_DEFAULT_REF_TEXT,
  AUDIO8_IM_END_ID,
  AUDIO8_MAX_SEQ_LEN,
  AUDIO8_NUM_CODEBOOKS,
  AUDIO8_SAMPLE_RATE,
  AUDIO8_SEMANTIC_BEGIN_ID,
  buildAudio8Prompt,
  extractAudio8PromptColumn,
  patchOnnxBf16ToFp32,
  parseNpyInt64,
  sampleAudio8Semantic,
  sampleAudio8Token,
  updateFastCacheSlice,
  updateSlowCacheSlice,
  type NpyInt64Matrix,
} from "../core/audio8TtsOnnx";
import { getAudio8Voice } from "../core/audio8PresetVoices";
import {
  KOKORO_VOICES,
  PIPER_VOICES,
  getPiperVoiceByDir,
} from "../core/catalog";
import {
  splitTtsSentences,
  voiceStyleOffset,
  zhTextToPhonemes,
} from "../core/ttsG2p";
import type { TtsLoadSpec } from "../core/types";
import {
  ORT_WASM_PATHS,
  buildOpfsIndex,
  getCurrentOpfsIndex,
  initTransformersOpfsBridge,
  setOpfsModelDir,
} from "./ortOpfsBridge";

const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;
// 模型单句上限 510 token（含 2 pad）；phoneme 串每字符约 1 token，留余量硬切
const MAX_PHONEME_CHARS = 508;

initTransformersOpfsBridge();

// ---------- 英文 g2p（移植 kokoro.js phonemize.js；espeak WASM 在 phonemizer 包内） ----------

// 按正则切分但保留分隔符（标点段原样保留，文本段送去音素化）
function splitKeep(text: string, regex: RegExp): { match: boolean; text: string }[] {
  const result: { match: boolean; text: string }[] = [];
  let prev = 0;
  for (const match of text.matchAll(regex)) {
    const fullMatch = match[0]!;
    const idx = match.index ?? 0;
    if (prev < idx) {
      result.push({ match: false, text: text.slice(prev, idx) });
    }
    if (fullMatch.length > 0) {
      result.push({ match: true, text: fullMatch });
    }
    prev = idx + fullMatch.length;
  }
  if (prev < text.length) {
    result.push({ match: false, text: text.slice(prev) });
  }
  return result;
}

function splitNum(match: string): string {
  if (match.includes(".")) {
    return match;
  }
  if (match.includes(":")) {
    const parts = match.split(":").map(Number);
    const h = parts[0]!;
    const m = parts[1] ?? 0;
    if (m === 0) return `${h} o'clock`;
    if (m < 10) return `${h} oh ${m}`;
    return `${h} ${m}`;
  }
  const year = parseInt(match.slice(0, 4), 10);
  if (year < 1100 || year % 1000 < 10) return match;
  const left = match.slice(0, 2);
  const right = parseInt(match.slice(2, 4), 10);
  const suffix = match.endsWith("s") ? "s" : "";
  if (year % 1000 >= 100 && year % 1000 <= 999) {
    if (right === 0) return `${left} hundred${suffix}`;
    if (right < 10) return `${left} oh ${right}${suffix}`;
  }
  return `${left} ${right}${suffix}`;
}

function flipMoney(match: string): string {
  const bill = match[0] === "$" ? "dollar" : "pound";
  if (isNaN(Number(match.slice(1)))) {
    return `${match.slice(1)} ${bill}s`;
  }
  if (!match.includes(".")) {
    const suffix = match.slice(1) === "1" ? "" : "s";
    return `${match.slice(1)} ${bill}${suffix}`;
  }
  const [b, c] = match.slice(1).split(".");
  const d = parseInt((c ?? "").padEnd(2, "0"), 10);
  const coins =
    match[0] === "$" ? (d === 1 ? "cent" : "cents") : d === 1 ? "penny" : "pence";
  return `${b} ${bill}${b === "1" ? "" : "s"} and ${d} ${coins}`;
}

function pointNum(match: string): string {
  const [a, b] = match.split(".");
  return `${a} point ${(b ?? "").split("").join(" ")}`;
}

function normalizeText(text: string): string {
  return (
    text
      // 1. 引号与括号
      .replace(/[‘’]/g, "'")
      .replace(/«/g, "“")
      .replace(/»/g, "”")
      .replace(/[“”]/g, '"')
      .replace(/\(/g, "«")
      .replace(/\)/g, "»")
      // 2. 少见标点
      .replace(/、/g, ", ")
      .replace(/。/g, ". ")
      .replace(/！/g, "! ")
      .replace(/，/g, ", ")
      .replace(/：/g, ": ")
      .replace(/；/g, "; ")
      .replace(/？/g, "? ")
      // 3. 空白归一
      .replace(/[^\S\n]/g, " ")
      .replace(/  +/, " ")
      .replace(/(?<=\n) +(?=\n)/g, "")
      // 4. 缩写
      .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
      .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
      .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
      .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
      .replace(/\betc\.(?! [A-Z])/gi, "etc")
      // 5. 口语词
      .replace(/\b(y)eah?\b/gi, "$1e'a")
      // 6. 数字与货币
      .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum)
      .replace(/(?<=\d),(?=\d)/g, "")
      .replace(
        /[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi,
        flipMoney
      )
      .replace(/\d*\.\d+/g, pointNum)
      .replace(/(?<=\d)-(?=\d)/g, " to ")
      .replace(/(?<=\d)S/g, " S")
      // 7. 所有格
      .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
      .replace(/(?<=X')S\b/g, "s")
      // 8. 连字符缩写
      .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
      .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
      // 9. 去首尾空白
      .trim()
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PUNCTUATION = ';:,.!?\u00A1\u00BF\u2014\u2026\u201C\u00AB\u00BB\u201D(){}[]';
const PUNCTUATION_PATTERN = new RegExp(`(\\s*[${escapeRegExp(PUNCTUATION)}]+\\s*)+`, "g");

// 英文文本 → phoneme 串（保留标点；lang: a=美式 en-us, b=英式 en）
async function phonemizeEn(text: string, language: "a" | "b"): Promise<string> {
  const sections = splitKeep(normalizeText(text), PUNCTUATION_PATTERN);
  const lang = language === "a" ? "en-us" : "en";
  const ps = (
    await Promise.all(
      sections.map(async ({ match, text }) =>
        match ? text : (await espeakng(text, lang)).join(" ")
      )
    )
  ).join("");
  let processed = ps
    // kokoro 发音修正
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?\u00A1\u00BF\u2014\u2026\u201C\u00AB\u00BB\u201D ]|$)/g, "z");
  if (language === "a") {
    processed = processed.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di");
  }
  return processed.trim();
}

// ---------------------------------------------------------------

type InMsg =
  | ({ type: "load" } & TtsLoadSpec)
  | { type: "synthesize"; text: string; voice: string; speed: number }
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
  | {
      type: "result";
      audio: Float32Array;
      elapsedMs: number;
      sampleRate: number;
    }
  | { type: "error"; message: string };

function post(msg: OutMsg, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

type KokoroModel = {
  (inputs: { input_ids: Tensor; style: Tensor; speed: Tensor }): Promise<{
    waveform: Tensor;
  }>;
  dispose?: () => void;
};

let model: KokoroModel | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
const voiceCache = new Map<string, Float32Array>();

type PiperCfg = {
  audio?: { sample_rate?: number };
  inference?: { noise_scale?: number; length_scale?: number; noise_w?: number };
  phoneme_id_map?: Record<string, number[]>;
};

type PiperModel = {
  session: ort.InferenceSession;
  cfg: PiperCfg;
  voiceId: string;
  sampleRate: number;
  idMap: Map<string, number>;
};

type Audio8Model = {
  slowSession: ort.InferenceSession;
  fastSession: ort.InferenceSession;
  decoderSession: ort.InferenceSession;
  tokenizer: PreTrainedTokenizer;
  referenceCodes: NpyInt64Matrix;
  referenceText: string;
  sampleRate: number;
};

let piperModel: PiperModel | null = null;
let audio8Model: Audio8Model | null = null;

function disposeModel(): void {
  if (model) {
    try {
      void model.dispose?.();
    } catch {
      // 忽略释放失败
    }
    model = null;
  }
  tokenizer = null;
  voiceCache.clear();
  if (piperModel) {
    try {
      piperModel.session.release();
    } catch {
      // 忽略释放失败
    }
    piperModel = null;
  }
  if (audio8Model) {
    const a = audio8Model;
    audio8Model = null;
    try {
      void a.slowSession.release();
      void a.fastSession.release();
      void a.decoderSession.release();
    } catch {
      // 忽略释放失败
    }
  }
}

async function loadVoiceBin(voiceId: string): Promise<Float32Array> {
  const cached = voiceCache.get(voiceId);
  if (cached) return cached;
  const idx = await getCurrentOpfsIndex();
  const handle = idx.get(`voices/${voiceId}.bin`);
  if (!handle) {
    throw new Error(`缺少音色文件：${voiceId}.bin（请到模型中心下载）`);
  }
  const file = await handle.getFile();
  const buf = await file.arrayBuffer();
  const arr = new Float32Array(buf);
  voiceCache.set(voiceId, arr);
  return arr;
}

async function doAudio8Load(spec: TtsLoadSpec): Promise<void> {
  post({ type: "progress", status: "加载本地 Audio8 模型文件 (OPFS)…" });
  const idx = await buildOpfsIndex(spec.dir);
  const readBytes = async (rel: string): Promise<Uint8Array> => {
    const h = idx.get(rel);
    if (!h) {
      throw new Error(`缺少 Audio8 模型文件：${rel}（请到模型中心下载）`);
    }
    const f = await h.getFile();
    return new Uint8Array(await f.arrayBuffer());
  };

  let referenceText = AUDIO8_DEFAULT_REF_TEXT;
  let sampleRate = AUDIO8_SAMPLE_RATE;
  const rmHandle = idx.get("runtime_manifest.json");
  if (rmHandle) {
    try {
      const rmJson = JSON.parse(
        await (await rmHandle.getFile()).text()
      ) as Record<string, unknown>;
      if (typeof rmJson.reference_text === "string" && rmJson.reference_text) {
        referenceText = rmJson.reference_text;
      }
      if (typeof rmJson.sample_rate === "number" && rmJson.sample_rate > 0) {
        sampleRate = rmJson.sample_rate;
      }
    } catch {
      // 忽略 manifest 解析异常，使用默认值
    }
  }

  post({ type: "progress", status: "加载分词器与参考音色编码…" });
  const [tokBytes, refBytes] = await Promise.all([
    readBytes("tokenizer/tokenizer.json"),
    readBytes("reference_codes.npy"),
  ]);
  const tokJson = JSON.parse(new TextDecoder().decode(tokBytes));
  const tok = new PreTrainedTokenizer(tokJson, {});
  const referenceCodes = parseNpyInt64(refBytes);

  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  ort.env.wasm.numThreads = 1;

  post({ type: "progress", status: "创建慢速自回归会话 slow_ar_int8.onnx…" });
  const [slowOnnx, slowData] = await Promise.all([
    readBytes("slow_ar_int8.onnx"),
    readBytes("slow_ar_int8.onnx.data"),
  ]);
  const slowSession = await ort.InferenceSession.create(slowOnnx, {
    executionProviders: ["wasm"],
    externalData: [{ path: "slow_ar_int8.onnx.data", data: slowData }],
  });

  post({ type: "progress", status: "创建快速码本会话 fast_ar_int8.onnx…" });
  const [fastOnnx, fastData] = await Promise.all([
    readBytes("fast_ar_int8.onnx"),
    readBytes("fast_ar_int8.onnx.data"),
  ]);
  const patchedFastOnnx = patchOnnxBf16ToFp32(fastOnnx);
  const fastSession = await ort.InferenceSession.create(patchedFastOnnx, {
    executionProviders: ["wasm"],
    externalData: [{ path: "fast_ar_int8.onnx.data", data: fastData }],
  });

  post({
    type: "progress",
    status: "创建音频声码器会话 codec_decoder_fp16.onnx…",
  });
  const [decOnnx, decData] = await Promise.all([
    readBytes("codec_decoder_fp16.onnx"),
    readBytes("codec_decoder_fp16.onnx.data"),
  ]);
  const decoderSession = await ort.InferenceSession.create(decOnnx, {
    executionProviders: ["wasm"],
    externalData: [{ path: "codec_decoder_fp16.onnx.data", data: decData }],
  });

  audio8Model = {
    slowSession,
    fastSession,
    decoderSession,
    tokenizer: tok,
    referenceCodes,
    referenceText,
    sampleRate,
  };
}

async function doPiperLoad(spec: TtsLoadSpec): Promise<void> {
  const voice = getPiperVoiceByDir(spec.dir);
  if (!voice) throw new Error(`未知 Piper 音色目录：${spec.dir}`);
  post({ type: "progress", status: "加载本地模型文件 (OPFS)" });
  const idx = await buildOpfsIndex(spec.dir);
  const onnxHandle = idx.get(`${voice.id}.onnx`);
  const jsonHandle = idx.get(`${voice.id}.onnx.json`);
  if (!onnxHandle || !jsonHandle) {
    throw new Error(
      `缺少 Piper 模型文件：${voice.id}.onnx / ${voice.id}.onnx.json（请到模型中心导入）`
    );
  }
  const [onnxFile, jsonFile] = await Promise.all([
    onnxHandle.getFile(),
    jsonHandle.getFile(),
  ]);
  const [onnxBuf, jsonText] = await Promise.all([
    onnxFile.arrayBuffer(),
    jsonFile.text(),
  ]);
  const cfg = JSON.parse(jsonText) as PiperCfg;
  post({ type: "progress", status: "创建推理会话 (WASM)" });
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(onnxBuf, {
    executionProviders: ["wasm"],
  });
  const idMap = new Map<string, number>();
  for (const [k, v] of Object.entries(cfg.phoneme_id_map ?? {})) {
    idMap.set(k, v[0]!);
  }
  piperModel = {
    session,
    cfg,
    voiceId: voice.id,
    sampleRate: cfg.audio?.sample_rate ?? voice.sampleRate,
    idMap,
  };
}

async function doLoad(spec: TtsLoadSpec): Promise<void> {
  disposeModel();
  setOpfsModelDir(spec.dir);
  if (spec.engine === "audio8") {
    await doAudio8Load(spec);
    return;
  }
  if (spec.engine === "piper") {
    await doPiperLoad(spec);
    return;
  }
  post({ type: "progress", status: "加载本地模型文件 (OPFS)" });
  const onProgress = (p: {
    status?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }): void => {
    post({
      type: "progress",
      status: p.status,
      file: p.file,
      progress: p.progress,
      loaded: p.loaded,
      total: p.total,
    });
  };
  const [m, tok] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(spec.source, {
      dtype: "q8" as DataType,
      device: spec.device as DeviceType,
      progress_callback: onProgress,
    }),
    AutoTokenizer.from_pretrained(spec.source),
  ]);
  model = m as unknown as KokoroModel;
  tokenizer = tok;
}

function hardSplit(s: string, max: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

async function doSynthesize(
  text: string,
  voiceId: string,
  speed: number
): Promise<Float32Array> {
  const m = model;
  const tok = tokenizer;
  if (!m || !tok) throw new Error("模型尚未加载");
  const voice = KOKORO_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`未知音色：${voiceId}`);

  const sentences = splitTtsSentences(text);
  if (sentences.length === 0) throw new Error("文本为空");
  const voiceBin = await loadVoiceBin(voiceId);

  const parts: Float32Array[] = [];
  for (const sentence of sentences) {
    // 中文按音色语言码走拼音 g2p；英文走 espeak
    const phonemes =
      voice.lang === "z"
        ? zhTextToPhonemes(sentence)
        : await phonemizeEn(sentence, voice.lang);
    if (!phonemes) continue;
    for (const chunk of hardSplit(phonemes, MAX_PHONEME_CHARS)) {
      const { input_ids } = tok(chunk, { truncation: true });
      const numTokens = input_ids.dims.at(-1) ?? 0;
      const offset = voiceStyleOffset(numTokens);
      const styleData = voiceBin.slice(offset, offset + STYLE_DIM);
      const out = await m({
        input_ids,
        style: new Tensor("float32", styleData, [1, STYLE_DIM]),
        speed: new Tensor("float32", [speed], [1]),
      });
      parts.push(
        new Float32Array(out.waveform.data as unknown as ArrayBufferLike)
      );
    }
  }
  if (parts.length === 0) throw new Error("没有可合成的内容");

  const total = parts.reduce((s, p) => s + p.length, 0);
  const audio = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    audio.set(p, o);
    o += p.length;
  }
  return audio;
}

// ---------- Piper（新版 1.0.0 ONNX 签名：input/input_lengths/scales[/sid] → output 波形） ----------

function buildPiperInputs(
  session: ort.InferenceSession,
  ids: number[],
  cfg: PiperCfg,
  speed: number
): Record<string, ort.Tensor> {
  const inf = cfg.inference ?? {};
  const noiseScale = inf.noise_scale ?? 0.667;
  const lengthScale = (inf.length_scale ?? 1) / speed;
  const noiseW = inf.noise_w ?? 0.8;
  const i64 = (arr: number[], shape: number[]) =>
    new ort.Tensor("int64", BigInt64Array.from(arr, (n) => BigInt(n)), shape);
  const inputs: Record<string, ort.Tensor> = {};
  for (const meta of session.inputMetadata) {
    const n = meta.name;
    if (n === "input") inputs[n] = i64(ids, [1, ids.length]);
    else if (n === "input_lengths") inputs[n] = i64([ids.length], [1]);
    else if (n === "scales")
      inputs[n] = new ort.Tensor(
        "float32",
        Float32Array.from([noiseScale, lengthScale, noiseW]),
        [3]
      );
    else if (n === "sid" || n === "speaker_id") inputs[n] = i64([0], [1]);
    else throw new Error(`未知 Piper 模型输入：${n}`);
  }
  return inputs;
}

async function doPiperSynthesize(
  text: string,
  voiceId: string,
  speed: number
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const p = piperModel;
  if (!p) throw new Error("模型尚未加载");
  const voice = PIPER_VOICES.find((v) => v.id === voiceId);
  if (!voice) throw new Error(`未知音色：${voiceId}`);
  if (voice.id !== p.voiceId) {
    throw new Error(
      `音色 ${voice.id} 未加载（当前已加载 ${p.voiceId}），请到模型卡片选择并加载`
    );
  }
  const sentences = splitTtsSentences(text);
  if (sentences.length === 0) throw new Error("文本为空");

  const parts: Float32Array[] = [];
  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const tokens = await espeakng(sentence, voice.espeak);
    const ids: number[] = [];
    for (const tok of tokens) {
      for (const ch of tok) {
        const id = p.idMap.get(ch);
        if (id !== undefined) ids.push(id);
      }
    }
    if (ids.length === 0) continue;
    const res = await p.session.run(buildPiperInputs(p.session, ids, p.cfg, speed));
    const out = res[p.session.outputNames[0]!];
    if (!out) throw new Error("Piper 模型无输出");
    parts.push(new Float32Array(out.data as unknown as ArrayBufferLike));
  }
  if (parts.length === 0) throw new Error("没有可合成的内容");

  const total = parts.reduce((s, x) => s + x.length, 0);
  const audio = new Float32Array(total);
  let o = 0;
  for (const x of parts) {
    audio.set(x, o);
    o += x.length;
  }
  return { audio, sampleRate: p.sampleRate };
}

// ---------- Audio8 TTS 0.1B ONNX INT8（DualAR + FP16 44.1kHz Codec） ----------

async function doAudio8Synthesize(
  text: string,
  voiceId: string,
  speed: number
): Promise<{ audio: Float32Array; sampleRate: number }> {
  const a = audio8Model;
  if (!a) throw new Error("Audio8 模型尚未加载");

  const sentences = splitTtsSentences(text);
  if (sentences.length === 0) throw new Error("文本为空");

  const preset = voiceId && voiceId !== "default" ? getAudio8Voice(voiceId) : null;
  const refCodes = preset?.codes ?? a.referenceCodes;
  const refText = preset?.referenceText ?? a.referenceText;

  const encodeText = (s: string): number[] =>
    a.tokenizer.encode(s, { add_special_tokens: false });

  const parts: Float32Array[] = [];

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;
    const { prompt, promptLen } = buildAudio8Prompt(
      encodeText,
      sentence,
      refText,
      refCodes
    );
    if (promptLen >= AUDIO8_MAX_SEQ_LEN) {
      throw new Error(
        `单句提示词长度 (${promptLen}) 超过上下文上限 (${AUDIO8_MAX_SEQ_LEN})`
      );
    }

    const cacheKeys = new Float32Array(24 * 1 * 2 * 2048 * 64);
    const cacheValues = new Float32Array(24 * 1 * 2 * 2048 * 64);
    const convStates = new Float32Array(24 * 1 * 896 * 4);
    const ssmStates = new Float32Array(24 * 1 * 24 * 32 * 64);

    const runSlowStep = async (
      col: BigInt64Array,
      position: number
    ): Promise<{ logits: Float32Array; hidden: Float32Array }> => {
      const out = await a.slowSession.run({
        codes: new ort.Tensor("int64", col, [1, 11, 1]),
        position: new ort.Tensor(
          "int64",
          new BigInt64Array([BigInt(position)]),
          [1]
        ),
        cache_keys: new ort.Tensor(
          "float32",
          cacheKeys,
          [24, 1, 2, 2048, 64]
        ),
        cache_values: new ort.Tensor(
          "float32",
          cacheValues,
          [24, 1, 2, 2048, 64]
        ),
        conv_states: new ort.Tensor("float32", convStates, [24, 1, 896, 4]),
        ssm_states: new ort.Tensor("float32", ssmStates, [24, 1, 24, 32, 64]),
      });
      const keyDelta = out.key_delta?.data as Float32Array | undefined;
      const valDelta = out.value_delta?.data as Float32Array | undefined;
      const nextConv = out.next_conv_states?.data as Float32Array | undefined;
      const nextSsm = out.next_ssm_states?.data as Float32Array | undefined;
      if (keyDelta) updateSlowCacheSlice(cacheKeys, keyDelta, position);
      if (valDelta) updateSlowCacheSlice(cacheValues, valDelta, position);
      if (nextConv) convStates.set(nextConv);
      if (nextSsm) ssmStates.set(nextSsm);
      return {
        logits: (out.logits?.data as Float32Array) ?? new Float32Array(4097),
        hidden: (out.hidden?.data as Float32Array) ?? new Float32Array(512),
      };
    };

    let logits: Float32Array = new Float32Array(4097);
    let hidden: Float32Array = new Float32Array(512);

    // 1. Slow AR Prefill
    for (let pos = 0; pos < promptLen; pos++) {
      const col = extractAudio8PromptColumn(prompt, promptLen, pos);
      const stepRes = await runSlowStep(col, pos);
      logits = stepRes.logits;
      hidden = stepRes.hidden;
    }

    // 2. DualAR 逐帧自回归解码
    const maxNewTokens = Math.min(512, AUDIO8_MAX_SEQ_LEN - promptLen);
    const previous: number[] = [];
    const frames: BigInt64Array[] = [];

    for (let step = 0; step < maxNewTokens; step++) {
      const semantic = sampleAudio8Semantic(logits, previous);
      if (semantic === AUDIO8_IM_END_ID) {
        break;
      }
      previous.push(semantic);
      if (previous.length > 10) {
        previous.shift();
      }

      const fastCacheKeys = [
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
      ];
      const fastCacheValues = [
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
        new Float32Array(1 * 2 * 10 * 64),
      ];

      const runFastStep = async (
        tokenId: number,
        useSlowHidden: boolean,
        fastPos: number
      ): Promise<Float32Array> => {
        const fastOut = await a.fastSession.run({
          slow_hidden: new ort.Tensor("float32", hidden, [1, 1, 512]),
          token_id: new ort.Tensor(
            "int64",
            new BigInt64Array([BigInt(tokenId)]),
            [1, 1]
          ),
          use_slow_hidden: new ort.Tensor(
            "bool",
            new Uint8Array([useSlowHidden ? 1 : 0]),
            [1]
          ),
          input_pos: new ort.Tensor(
            "int64",
            new BigInt64Array([BigInt(fastPos)]),
            [1]
          ),
          cache_key_0: new ort.Tensor(
            "float32",
            fastCacheKeys[0]!,
            [1, 2, 10, 64]
          ),
          cache_value_0: new ort.Tensor(
            "float32",
            fastCacheValues[0]!,
            [1, 2, 10, 64]
          ),
          cache_key_1: new ort.Tensor(
            "float32",
            fastCacheKeys[1]!,
            [1, 2, 10, 64]
          ),
          cache_value_1: new ort.Tensor(
            "float32",
            fastCacheValues[1]!,
            [1, 2, 10, 64]
          ),
          cache_key_2: new ort.Tensor(
            "float32",
            fastCacheKeys[2]!,
            [1, 2, 10, 64]
          ),
          cache_value_2: new ort.Tensor(
            "float32",
            fastCacheValues[2]!,
            [1, 2, 10, 64]
          ),
          cache_key_3: new ort.Tensor(
            "float32",
            fastCacheKeys[3]!,
            [1, 2, 10, 64]
          ),
          cache_value_3: new ort.Tensor(
            "float32",
            fastCacheValues[3]!,
            [1, 2, 10, 64]
          ),
        });
        for (let l = 0; l < 4; l++) {
          const kd = fastOut[`key_delta_${l}`]?.data as
            | Float32Array
            | undefined;
          const vd = fastOut[`value_delta_${l}`]?.data as
            | Float32Array
            | undefined;
          if (kd) updateFastCacheSlice(fastCacheKeys[l]!, kd, fastPos);
          if (vd) updateFastCacheSlice(fastCacheValues[l]!, vd, fastPos);
        }
        return (
          (fastOut.logits?.data as Float32Array) ?? new Float32Array(4096)
        );
      };

      await runFastStep(0, true, 0);
      const firstCode = semantic - AUDIO8_SEMANTIC_BEGIN_ID;
      const frame = new BigInt64Array(AUDIO8_NUM_CODEBOOKS);
      frame[0] = BigInt(firstCode);
      let curToken = firstCode;

      for (let fastPos = 1; fastPos < AUDIO8_NUM_CODEBOOKS; fastPos++) {
        const fastLogits = await runFastStep(curToken, false, fastPos);
        curToken = sampleAudio8Token(fastLogits);
        frame[fastPos] = BigInt(curToken);
      }

      frames.push(frame);
      if (step + 1 >= maxNewTokens) break;

      const nextCol = new BigInt64Array(AUDIO8_NUM_CODEBOOKS + 1);
      nextCol[0] = BigInt(semantic);
      for (let cb = 0; cb < AUDIO8_NUM_CODEBOOKS; cb++) {
        nextCol[cb + 1] = frame[cb] ?? 0n;
      }
      const nextSlow = await runSlowStep(nextCol, promptLen + step);
      logits = nextSlow.logits;
      hidden = nextSlow.hidden;
    }

    if (frames.length === 0) continue;

    // 3. Codec Decoder 一次性还原波形
    const T = frames.length;
    const codesData = new BigInt64Array(AUDIO8_NUM_CODEBOOKS * T);
    for (let cb = 0; cb < AUDIO8_NUM_CODEBOOKS; cb++) {
      for (let t = 0; t < T; t++) {
        codesData[cb * T + t] = frames[t]?.[cb] ?? 0n;
      }
    }
    const decOut = await a.decoderSession.run({
      codes: new ort.Tensor("int64", codesData, [1, AUDIO8_NUM_CODEBOOKS, T]),
    });
    const audioTensor = decOut.audio ?? Object.values(decOut)[0];
    if (audioTensor) {
      parts.push(
        new Float32Array(audioTensor.data as unknown as ArrayBufferLike)
      );
    }
  }

  if (parts.length === 0) throw new Error("Audio8 未生成有效语音帧");

  const total = parts.reduce((s, x) => s + x.length, 0);
  let audio = new Float32Array(total);
  let o = 0;
  for (const x of parts) {
    audio.set(x, o);
    o += x.length;
  }

  // 若设置了倍速，使用线性插值缩放波形长度并保持标准 44.1kHz 采样率
  if (Math.abs(speed - 1) > 0.01 && speed > 0) {
    const newLen = Math.max(1, Math.round(audio.length / speed));
    const resampled = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * speed;
      const i0 = Math.floor(srcIdx);
      const i1 = Math.min(audio.length - 1, i0 + 1);
      const frac = srcIdx - i0;
      resampled[i] =
        (audio[i0] ?? 0) * (1 - frac) + (audio[i1] ?? 0) * frac;
    }
    audio = resampled;
  }

  return { audio, sampleRate: a.sampleRate };
}

let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  chain = chain.then(async () => {
    try {
      if (msg.type === "load") {
        await doLoad(msg);
        post({ type: "ready" });
      } else if (msg.type === "synthesize") {
        const t0 = performance.now();
        const r = audio8Model
          ? await doAudio8Synthesize(msg.text, msg.voice, msg.speed)
          : piperModel
            ? await doPiperSynthesize(msg.text, msg.voice, msg.speed)
            : {
                audio: await doSynthesize(msg.text, msg.voice, msg.speed),
                sampleRate: SAMPLE_RATE,
              };
        const elapsedMs = Math.round(performance.now() - t0);
        post(
          {
            type: "result",
            audio: r.audio,
            elapsedMs,
            sampleRate: r.sampleRate,
          },
          [r.audio.buffer]
        );
      } else if (msg.type === "unload") {
        disposeModel();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "error", message });
    }
  });
};
