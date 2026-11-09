import { pinyin } from "pinyin-pro";

// Kokoro v1 中文 G2P：汉字 → 拼音（pinyin-pro，内置多音字/一不变调）→ IPA + 声调箭头。
// 映射表参照 misaki (hexgrad) pinyin_to_ipa；输出只含模型词表字符
// （声调直接用箭头 →↗↓↘，避免 IPA 声调序列与组合变音符号被 tokenizer 剥离）。

// 声调号 → 箭头（0 为轻声，无标记）
const TONE_ARROW = ["", "\u2192", "\u2197", "\u2193", "\u2198"];

// 声母 → IPA（多候选取第一个）
const INITIAL_MAP: Record<string, string> = {
  b: "p",
  p: "p\u02B0",
  m: "m",
  f: "f",
  d: "t",
  t: "t\u02B0",
  n: "n",
  l: "l",
  g: "k",
  k: "k\u02B0",
  h: "x",
  zh: "\u0288\u0282",
  ch: "\u0288\u0282\u02B0",
  sh: "\u0282",
  r: "\u027B",
  z: "\u02A6",
  c: "\u02A6\u02B0",
  s: "s",
  j: "\u02A8",
  q: "\u02A8\u02B0",
  x: "\u0255",
};

// 舌尖元音：zh/ch/sh/r 与 z/c/s 后的 i 实际读 ɨ
const APICAL_INITIALS = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);

// 韵母 → IPA（"0" 为声调位置）
const FINAL_MAP: Record<string, string> = {
  a: "a0",
  ai: "ai0",
  an: "a0n",
  ang: "a0\u014B",
  ao: "au0",
  e: "\u02640",
  ei: "ei0",
  en: "\u02590n",
  eng: "\u02590\u014B",
  er: "\u025A0",
  i: "i0",
  ia: "ja0",
  ian: "j\u025B0n",
  iang: "ja0\u014B",
  iao: "jau0",
  in: "i0n",
  ing: "i0\u014B",
  iu: "jou0",
  iou: "jou0",
  iong: "j\u028A0\u014B",
  o: "wo0",
  ou: "ou0",
  ong: "\u028A0\u014B",
  u: "u0",
  ua: "wa0",
  uai: "wai0",
  uan: "wa0n",
  ui: "wei0",
  uei: "wei0",
  un: "w\u02590n",
  uen: "w\u02590n",
  uang: "wa0\u014B",
  ueng: "w\u02590\u014B",
  uo: "wo0",
  "\u00FC": "y0",
  "\u00FCe": "\u0265e0",
  "\u00FCuan": "\u0265\u025B0n",
  "\u00FCn": "y0n",
};

// 零声母归一：y/w 不是声母，归一为标准韵母（pypinyin strict 同行为）
const ZERO_INITIAL_FINALS: Record<string, string> = {
  yi: "i",
  ye: "ie",
  yao: "iao",
  yin: "in",
  ying: "ing",
  yong: "iong",
  ya: "ia",
  yan: "ian",
  yang: "iang",
  wo: "uo",
  wa: "ua",
  wai: "uai",
  wan: "uan",
  wang: "uang",
  wen: "uen",
  wu: "u",
  weng: "ueng",
  yu: "\u00FC",
  yue: "\u00FCe",
  yuan: "\u00FCuan",
  yun: "\u00FCn",
};

// 鼻音自成音节（嗯/唔等）
const SYLLABIC_MAP: Record<string, string> = {
  m: "m0",
  n: "n0",
  ng: "\u014B0",
};

// 单个拼音音节（如 "ni3"）→ Kokoro phoneme 串；无法识别返回空串。
export function pinyinSyllableToPhonemes(syl: string): string {
  const m = /^([a-z\u00FC]+)([0-4])?$/.exec(syl);
  if (!m) return "";
  const body = m[1]!;
  const tone = m[2] ? Number(m[2]) : 0;
  const arrow = TONE_ARROW[tone] ?? "";
  const applyTone = (seq: string) => seq.replace("0", arrow);

  const syllabic = SYLLABIC_MAP[body];
  if (syllabic) return applyTone(syllabic);

  let ini = "";
  let fin = body;
  for (const len of [2, 1]) {
    const head = body.slice(0, len);
    if (INITIAL_MAP[head] !== undefined && body.length > len) {
      ini = head;
      fin = body.slice(len);
      break;
    }
  }
  if (ini === "") fin = ZERO_INITIAL_FINALS[body] ?? body;
  // j/q/x 后的 u 实为 ü（pinyin-pro 输出 u/ue/uan/un，需归一为 ü 系列）
  if (ini === "j" || ini === "q" || ini === "x") fin = fin.replace(/^u/, "\u00FC");

  let finSeq: string | undefined;
  if (fin === "i" && ini !== "" && APICAL_INITIALS.has(ini)) finSeq = "\u02680";
  else finSeq = FINAL_MAP[fin];
  if (finSeq === undefined) return "";
  const iniIpa = ini !== "" ? (INITIAL_MAP[ini] ?? "") : "";
  return iniIpa + applyTone(finSeq);
}

// 中文文本 → 空格分隔的 phoneme 串（pinyin-pro 默认 MaxProbability 分词，多音字带上下文）。
export function zhTextToPhonemes(text: string): string {
  const syls = pinyin(text, { toneType: "num" });
  return syls
    .split(/\s+/)
    .map((s) => s.trim())
    .map(pinyinSyllableToPhonemes)
    .filter((s) => s.length > 0)
    .join(" ");
}

// 按句切分（保留标点，供逐句合成；模型单句上限 510 token）。
export function splitTtsSentences(text: string): string[] {
  return text
    .split(/(?<=[\u3002\uFF01\uFF1F\uFF1B\u2026.!?;])|\n+/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// style 向量偏移：按 token 数（含 2 个 pad）在音色表内定位（上限 509 行 × 256 维）。
export function voiceStyleOffset(numTokens: number): number {
  return Math.min(Math.max(numTokens - 2, 0), 509) * 256;
}
