import type { ASRSegment, ASRWord } from "./types";

const SAMPLE_RATE = 16000;
const FRAME_LEN = 400; // 25ms @ 16kHz
const FRAME_SHIFT = 160; // 10ms @ 16kHz
const FFT_SIZE = 512;
const NUM_BINS = FFT_SIZE / 2 + 1; // 257
const NUM_MELS = 80;
const LFR_M = 7;
const LFR_N = 6;
const LFR_DIM = NUM_MELS * LFR_M; // 560
// 每个 LFR 帧对应的物理时长：6 * 10ms = 60ms = 0.06s
export const LFR_FRAME_SECONDS = (FRAME_SHIFT * LFR_N) / SAMPLE_RATE;
const PREEMPH_COEFF = 0.97;
const EPSILON = 1.1920928955078125e-7;

export interface SenseVoiceCmvn {
  negMean: Float32Array;
  invStddev: Float32Array;
}

/**
 * 解析 FunASR am.mvn（Kaldi Nnet <AddShift> 与 <Rescale> 560 维向量）
 */
export function parseAmMvn(text: string): SenseVoiceCmvn {
  const bracketRe = /\[\s*([^\]]+)\s*\]/g;
  const arrays: Float32Array[] = [];
  let m: RegExpExecArray | null;
  while ((m = bracketRe.exec(text)) !== null) {
    const nums = m[1]!
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => !Number.isNaN(n));
    if (nums.length === LFR_DIM) {
      arrays.push(new Float32Array(nums));
    }
  }
  if (arrays.length < 2) {
    throw new Error(
      `am.mvn 解析失败：期望 2 个 ${LFR_DIM} 维向量，实际找到 ${arrays.length} 个`
    );
  }
  return {
    negMean: arrays[0]!,
    invStddev: arrays[1]!,
  };
}

function hzToMel(hz: number): number {
  return 1127.0 * Math.log(1.0 + hz / 700.0);
}

let cachedHamming: Float32Array | null = null;
let cachedMelBins: { offset: number; weights: Float32Array }[] | null = null;
let cachedBitRev: Uint16Array | null = null;
let cachedCos: Float32Array | null = null;
let cachedSin: Float32Array | null = null;

function getHammingWindow(): Float32Array {
  if (cachedHamming) return cachedHamming;
  const win = new Float32Array(FRAME_LEN);
  const factor = (2.0 * Math.PI) / (FRAME_LEN - 1);
  for (let i = 0; i < FRAME_LEN; i++) {
    win[i] = 0.54 - 0.46 * Math.cos(factor * i);
  }
  cachedHamming = win;
  return win;
}

function getMelFilterbank(): { offset: number; weights: Float32Array }[] {
  if (cachedMelBins) return cachedMelBins;
  const lowMel = hzToMel(20.0);
  const highMel = hzToMel(SAMPLE_RATE / 2);
  const melStep = (highMel - lowMel) / (NUM_MELS + 1);
  const fftBinWidth = SAMPLE_RATE / FFT_SIZE;

  const bins: { offset: number; weights: Float32Array }[] = [];
  for (let b = 0; b < NUM_MELS; b++) {
    const leftMel = lowMel + b * melStep;
    const centerMel = lowMel + (b + 1) * melStep;
    const rightMel = lowMel + (b + 2) * melStep;

    let firstIdx = -1;
    let lastIdx = -1;
    const tempWeights: number[] = [];

    for (let k = 0; k < NUM_BINS; k++) {
      const freq = k * fftBinWidth;
      const mel = hzToMel(freq);
      if (mel > leftMel && mel < rightMel) {
        const weight =
          mel <= centerMel
            ? (mel - leftMel) / (centerMel - leftMel)
            : (rightMel - mel) / (rightMel - centerMel);
        if (firstIdx === -1) firstIdx = k;
        lastIdx = k;
        tempWeights.push(weight);
      }
    }
    if (firstIdx === -1) {
      bins.push({ offset: 0, weights: new Float32Array(0) });
    } else {
      bins.push({
        offset: firstIdx,
        weights: new Float32Array(tempWeights),
      });
    }
  }
  cachedMelBins = bins;
  return bins;
}

function ensureFftTables(): void {
  if (cachedBitRev && cachedCos && cachedSin) return;
  const bits = Math.log2(FFT_SIZE);
  const rev = new Uint16Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    let x = i;
    let y = 0;
    for (let j = 0; j < bits; j++) {
      y = (y << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = y;
  }
  const cos = new Float32Array(FFT_SIZE / 2);
  const sin = new Float32Array(FFT_SIZE / 2);
  for (let i = 0; i < FFT_SIZE / 2; i++) {
    const angle = (-2.0 * Math.PI * i) / FFT_SIZE;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
  }
  cachedBitRev = rev;
  cachedCos = cos;
  cachedSin = sin;
}

function computePowerSpectrum512(
  re: Float32Array,
  im: Float32Array,
  power: Float32Array
): void {
  ensureFftTables();
  const rev = cachedBitRev!;
  const cos = cachedCos!;
  const sin = cachedSin!;

  for (let i = 0; i < FFT_SIZE; i++) {
    const j = rev[i]!;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }

  for (let size = 2; size <= FFT_SIZE; size <<= 1) {
    const half = size >> 1;
    const step = FFT_SIZE / size;
    for (let i = 0; i < FFT_SIZE; i += size) {
      for (let j = 0; j < half; j++) {
        const k = j * step;
        const wr = cos[k]!;
        const wi = sin[k]!;
        const idx1 = i + j;
        const idx2 = idx1 + half;
        const tr = wr * re[idx2]! - wi * im[idx2]!;
        const ti = wr * im[idx2]! + wi * re[idx2]!;
        re[idx2] = re[idx1]! - tr;
        im[idx2] = im[idx1]! - ti;
        re[idx1] = re[idx1]! + tr;
        im[idx1] = im[idx1]! + ti;
      }
    }
  }

  for (let k = 0; k < NUM_BINS; k++) {
    const r = re[k]!;
    const m = im[k]!;
    power[k] = r * r + m * m;
  }
}

/**
 * 提取 SenseVoiceSmall 输入特征：
 * 1. 16kHz PCM * 32768
 * 2. Kaldi 80 维 FBank (25ms 帧长, 10ms 帧移, Hamming 窗, 预加重 0.97, 去直流)
 * 3. LFR (lfr_m=7, lfr_n=6) 拼接为 560 维
 * 4. CMVN 均值方差归一化
 */
export function extractSenseVoiceFeatures(
  audio: Float32Array,
  cmvn: SenseVoiceCmvn
): { features: Float32Array; numFrames: number } {
  const paddedAudio =
    audio.length >= FRAME_LEN
      ? audio
      : (() => {
          const buf = new Float32Array(FRAME_LEN);
          buf.set(audio);
          return buf;
        })();

  const numFbankFrames =
    Math.floor((paddedAudio.length - FRAME_LEN) / FRAME_SHIFT) + 1;
  const fbank = new Float32Array(numFbankFrames * NUM_MELS);
  const hamming = getHammingWindow();
  const melBins = getMelFilterbank();
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const power = new Float32Array(NUM_BINS);
  const frameBuf = new Float32Array(FRAME_LEN);

  for (let m = 0; m < numFbankFrames; m++) {
    const start = m * FRAME_SHIFT;
    let sum = 0;
    for (let i = 0; i < FRAME_LEN; i++) {
      const v = paddedAudio[start + i]! * 32768.0;
      frameBuf[i] = v;
      sum += v;
    }
    const mean = sum / FRAME_LEN;
    for (let i = 0; i < FRAME_LEN; i++) {
      frameBuf[i] = frameBuf[i]! - mean;
    }
    for (let i = FRAME_LEN - 1; i >= 1; i--) {
      frameBuf[i] = frameBuf[i]! - PREEMPH_COEFF * frameBuf[i - 1]!;
    }
    frameBuf[0] = frameBuf[0]! * (1.0 - PREEMPH_COEFF);

    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME_LEN; i++) {
      re[i] = frameBuf[i]! * hamming[i]!;
    }

    computePowerSpectrum512(re, im, power);

    const outBase = m * NUM_MELS;
    for (let b = 0; b < NUM_MELS; b++) {
      const { offset, weights } = melBins[b]!;
      let energy = 0;
      for (let j = 0; j < weights.length; j++) {
        energy += weights[j]! * power[offset + j]!;
      }
      fbank[outBase + b] = Math.log(Math.max(energy, EPSILON));
    }
  }

  // LFR (lfr_m=7, lfr_n=6)：首帧左填充 3 次，尾部不足时重复末帧
  const leftPad = Math.floor((LFR_M - 1) / 2); // 3
  const numLfrFrames = Math.ceil(numFbankFrames / LFR_N);
  const features = new Float32Array(numLfrFrames * LFR_DIM);
  const { negMean, invStddev } = cmvn;

  for (let i = 0; i < numLfrFrames; i++) {
    const outRow = i * LFR_DIM;
    for (let k = 0; k < LFR_M; k++) {
      const paddedIdx = i * LFR_N + k;
      const srcFrame = Math.min(
        numFbankFrames - 1,
        Math.max(0, paddedIdx - leftPad)
      );
      const srcBase = srcFrame * NUM_MELS;
      const dstBase = outRow + k * NUM_MELS;
      for (let d = 0; d < NUM_MELS; d++) {
        const col = k * NUM_MELS + d;
        features[dstBase + d] =
          (fbank[srcBase + d]! + negMean[col]!) * invStddev[col]!;
      }
    }
  }

  return { features, numFrames: numLfrFrames };
}

/**
 * UI 语言值映射到 SenseVoiceSmall 的 lid_dict 整数 ID：
 * auto: 0, zh: 3, en: 4, yue: 7, ja: 11, ko: 12, nospeech: 13
 */
export function mapSenseVoiceLanguageId(uiLang: string): number {
  switch (uiLang) {
    case "zh-hans":
    case "zh-hant":
    case "chinese":
    case "zh":
      return 3;
    case "english":
    case "en":
      return 4;
    case "cantonese":
    case "yue":
      return 7;
    case "japanese":
    case "ja":
      return 11;
    case "korean":
    case "ko":
      return 12;
    default:
      return 0; // auto
  }
}

const EMOTION_LABELS: Record<string, string> = {
  "<|HAPPY|>": "😊 开心",
  "<|SAD|>": "😢 悲伤",
  "<|ANGRY|>": "😠 愤怒",
  "<|FEARFUL|>": "😨 恐惧",
  "<|DISGUSTED|>": "🤢 厌恶",
  "<|SURPRISED|>": "😲 惊讶",
};

const EVENT_LABELS: Record<string, string> = {
  "<|Laughter|>": "😄 笑声",
  "<|Applause|>": "👏 掌声",
  "<|BGM|>": "🎵 背景音乐",
  "<|Cry|>": "😭 哭声",
  "<|Cough|>": "😷 咳嗽",
  "<|Sneeze|>": "🤧 喷嚏",
  "<|Sing|>": "🎤 歌声",
};

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const SENTENCE_END_PUNCT = /^[。！？!?；;]+$/;
const ATTACH_PUNCT = /^[，。！？、；：）》」』】,.!?;:)\]}'"”’%]+$/;

export interface DecodedSenseVoiceChunk {
  segments: ASRSegment[];
  detectedLanguage?: string;
  emotion?: string;
  event?: string;
}

/**
 * 解码单个音频切片的 SenseVoice CTC logits，产出带精确字词时间轴的 ASRSegment[]
 */
export function decodeSenseVoiceCtc(
  logits: Float32Array,
  numOutFrames: number,
  vocabSize: number,
  tokens: string[],
  offsetSeconds = 0,
  chunkDurationSeconds = 0,
  scriptConverter?: ((s: string) => string) | null
): DecodedSenseVoiceChunk {
  // 1. 逐帧 argmax + CTC 连续去重并去 blank (id=0)
  const rawSteps: { id: number; token: string; frame: number }[] = [];
  let prevId = -1;
  for (let t = 0; t < numOutFrames; t++) {
    const base = t * vocabSize;
    let bestId = 0;
    let bestVal = logits[base] ?? -Infinity;
    for (let v = 1; v < vocabSize; v++) {
      const val = logits[base + v]!;
      if (val > bestVal) {
        bestVal = val;
        bestId = v;
      }
    }
    if (bestId !== 0 && bestId !== prevId) {
      rawSteps.push({
        id: bestId,
        token: tokens[bestId] ?? "",
        frame: t,
      });
    }
    prevId = bestId;
  }

  let detectedLanguage: string | undefined;
  let emotion: string | undefined;
  let event: string | undefined;

  // 2. 分离控制标签 (<|...|>) 与正文 token，并将帧号映射为真实音频时间（前 4 帧为 query 前缀）
  const words: ASRWord[] = [];
  for (const step of rawSteps) {
    const tok = step.token;
    if (!tok || tok === "<unk>" || tok === "<s>" || tok === "</s>") continue;
    if (tok.startsWith("<|") && tok.endsWith("|>")) {
      if (EMOTION_LABELS[tok]) {
        emotion = EMOTION_LABELS[tok];
      } else if (EVENT_LABELS[tok]) {
        event = EVENT_LABELS[tok];
      } else if (
        tok === "<|zh|>" ||
        tok === "<|en|>" ||
        tok === "<|yue|>" ||
        tok === "<|ja|>" ||
        tok === "<|ko|>"
      ) {
        detectedLanguage = tok.slice(2, -2);
      }
      continue;
    }

    const acousticFrame = Math.max(0, step.frame - 4);
    const start = r3(offsetSeconds + acousticFrame * LFR_FRAME_SECONDS);
    const end = r3(
      Math.min(
        offsetSeconds +
          (chunkDurationSeconds > 0
            ? chunkDurationSeconds
            : (acousticFrame + 1) * LFR_FRAME_SECONDS),
        offsetSeconds + (acousticFrame + 1) * LFR_FRAME_SECONDS
      )
    );

    const startsNewWord = tok.startsWith("▁");
    const cleanPiece = tok.replace(/^▁+/, "");
    if (!cleanPiece) continue;
    const finalPiece = scriptConverter
      ? scriptConverter(cleanPiece)
      : cleanPiece;

    if (words.length === 0) {
      words.push({ text: finalPiece, start, end });
      continue;
    }

    const prevWord = words[words.length - 1]!;
    const isAlphaSubword =
      !startsNewWord &&
      /^[a-zA-Z']+$/.test(finalPiece) &&
      /[a-zA-Z']$/.test(prevWord.text);
    const isDigitContinuation =
      !startsNewWord &&
      /^[0-9.]+$/.test(finalPiece) &&
      /[0-9]$/.test(prevWord.text);

    if (ATTACH_PUNCT.test(finalPiece) || isAlphaSubword || isDigitContinuation) {
      prevWord.text += finalPiece;
      prevWord.end = Math.max(prevWord.end, end);
    } else {
      const needSpace =
        /[a-zA-Z0-9]$/.test(prevWord.text) &&
        /^[a-zA-Z0-9]/.test(finalPiece);
      words.push({
        text: needSpace ? ` ${finalPiece}` : finalPiece,
        start,
        end,
      });
    }
  }

  if (words.length === 0) {
    return { segments: [], detectedLanguage, emotion, event };
  }

  // 3. 按句末标点或长静音间隙 (>0.65s) 切分为段落 ASRSegment[]
  const segments: ASRSegment[] = [];
  let curWords: ASRWord[] = [];

  const flushSegment = () => {
    if (curWords.length === 0) return;
    const text = curWords.map((w) => w.text).join("").trim();
    if (text) {
      const segWords = curWords.map((w) => ({
        ...w,
        text: w.text.trim() || w.text,
      }));
      segments.push({
        id: `seg-${segments.length}`,
        text,
        start: segWords[0]!.start,
        end: segWords[segWords.length - 1]!.end,
        words: segWords,
        language: detectedLanguage,
        emotion,
        event,
      });
    }
    curWords = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (curWords.length > 0) {
      const prev = curWords[curWords.length - 1]!;
      const gap = w.start - prev.end;
      if (gap > 0.65 && curWords.length >= 2) {
        flushSegment();
      }
    }
    curWords.push(w);
    const trimmed = w.text.trim();
    const lastChar = trimmed.slice(-1);
    if (SENTENCE_END_PUNCT.test(lastChar)) {
      flushSegment();
    }
  }
  flushSegment();

  return { segments, detectedLanguage, emotion, event };
}

/**
 * 将长音频按静音点切分为 <= maxChunkSeconds 的片段（避免单次推理过长并保持时间戳连续）
 */
export function splitAudioOnSilence(
  audio: Float32Array,
  sampleRate = SAMPLE_RATE,
  maxChunkSeconds = 25,
  minChunkSeconds = 15
): { startSample: number; samples: Float32Array }[] {
  const maxSamples = Math.floor(maxChunkSeconds * sampleRate);
  const minSamples = Math.floor(minChunkSeconds * sampleRate);
  if (audio.length <= maxSamples) {
    return [{ startSample: 0, samples: audio }];
  }

  const chunks: { startSample: number; samples: Float32Array }[] = [];
  const winSize = Math.floor(0.1 * sampleRate); // 100ms 能量窗
  const stepSize = Math.floor(0.02 * sampleRate); // 20ms 步进

  let cursor = 0;
  while (cursor < audio.length) {
    const remaining = audio.length - cursor;
    if (remaining <= maxSamples) {
      chunks.push({
        startSample: cursor,
        samples: audio.subarray(cursor),
      });
      break;
    }

    const searchStart = cursor + minSamples;
    const searchEnd = cursor + maxSamples - winSize;
    let bestSplit = cursor + maxSamples;
    let minEnergy = Infinity;

    for (let pos = searchStart; pos <= searchEnd; pos += stepSize) {
      let energy = 0;
      for (let i = 0; i < winSize; i++) {
        const s = audio[pos + i]!;
        energy += s * s;
      }
      if (energy < minEnergy) {
        minEnergy = energy;
        bestSplit = pos + (winSize >> 1);
      }
    }

    chunks.push({
      startSample: cursor,
      samples: audio.subarray(cursor, bestSplit),
    });
    cursor = bestSplit;
  }

  return chunks;
}
