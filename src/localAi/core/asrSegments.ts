import type { ASRSegment, ASRWord } from "./types";

// word 模式（return_timestamps: 'word'）下 pipeline 输出的 chunks 是平铺词流：
// 每个词 { text, timestamp: [start, end] }，时间戳来自 cross-attention 对齐。
export interface RawWord {
  text: string;
  timestamp: [number | null, number | null] | null;
}

export interface GroupedSegment {
  start: number;
  end: number;
  words: ASRWord[];
}

const CJK = /[\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]/;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

// 词间拼接：任一侧为 CJK 则不加空格（中文逐词无空格），否则加空格（英文）。
export function joinWordsText(words: string[]): string {
  let out = "";
  for (let i = 0; i < words.length; i++) {
    const cur = words[i]!;
    if (i > 0) {
      const prevTrimmed = words[i - 1]!.replace(/\s+$/, "");
      const curTrimmed = cur.replace(/^\s+/, "");
      const prevEndsCJK =
        prevTrimmed.length > 0 && CJK.test(prevTrimmed.slice(-1));
      const curStartsCJK =
        curTrimmed.length > 0 && CJK.test(curTrimmed.slice(0, 1));
      if (!prevEndsCJK && !curStartsCJK) out += " ";
    }
    out += cur;
  }
  return out;
}

// 句末标点（必断）与从句标点（条件断）：whisper 的标点通常附着在前一个词上
// （如「して。」），也可能是独立 token（如单独的「。」），两种都要处理。
const CLOSERS = ["'", '"', "\u2019", "\u201d", "」", "』", "）", "】", "\\]"];
const SENT_END = new RegExp(`[。！？!.?…]+[${CLOSERS.join("")}]*$`);
const CLAUSE_END = new RegExp(`[、，,;；:：]+[${CLOSERS.join("")}]*$`);
const PUNCT_ONLY =
  /^[。！？!?…、，,;；:："'“”‘’「」『』（）()\[\]【】]+$/;

export interface GroupOptions {
  /** 段时长超过该值强制断段（无标点可用时兜底） */
  maxSegmentSeconds?: number;
  /** 出现从句标点且段时长达到该值时断段 */
  clauseSplitSeconds?: number;
}

// 把词流切成段。规则（按词顺序判断）：
// 1. 词间静音间隙 > gapThresholdSeconds → 断段；
// 2. 词以句末标点（。！？.!?…）结尾 → 断段；
// 3. 词以从句标点（、，,;；）结尾且段时长 ≥ clauseSplitSeconds → 断段；
// 4. 段时长 ≥ maxSegmentSeconds → 强制断段。
export function groupWordsIntoSegments(
  words: RawWord[],
  durationSeconds: number,
  gapThresholdSeconds = 0.5,
  opts: GroupOptions = {}
): GroupedSegment[] {
  const maxSegmentSeconds = opts.maxSegmentSeconds ?? 15;
  const clauseSplitSeconds = opts.clauseSplitSeconds ?? 3;
  const valid = words.filter(
    (w) =>
      (w.text ?? "").trim().length > 0 &&
      !!w.timestamp &&
      w.timestamp[0] != null
  );
  if (valid.length === 0) return [];

  const segs: GroupedSegment[] = [];
  let cur: GroupedSegment | null = null;
  const close = () => {
    if (cur) {
      segs.push(cur);
      cur = null;
    }
  };
  for (const w of valid) {
    const text = w.text.trim();
    const s = r3(w.timestamp![0]!);
    const e = r3(w.timestamp![1] ?? s);
    if (cur && s - cur.end > gapThresholdSeconds) close();
    if (!cur) {
      cur = { start: s, end: e, words: [{ text, start: s, end: e }] };
    } else {
      if (e > cur.end) cur.end = e;
      cur.words.push({ text, start: s, end: e });
    }
    const seg = cur!;
    const dur = seg.end - seg.start;
    if (PUNCT_ONLY.test(text)) {
      // 独立标点 token：前面没有词时不单独成段（避免只有标点的空段）
      if (seg.words.length > 1) {
        if (SENT_END.test(text)) close();
        else if (dur >= clauseSplitSeconds && CLAUSE_END.test(text)) close();
      }
    } else if (SENT_END.test(text)) {
      close();
    } else if (dur >= clauseSplitSeconds && CLAUSE_END.test(text)) {
      close();
    } else if (dur >= maxSegmentSeconds) {
      close();
    }
  }
  close();

  // 时间戳裁剪到音频时长内
  for (const sg of segs) {
    sg.start = Math.max(0, Math.min(sg.start, durationSeconds));
    sg.end = Math.max(sg.start, Math.min(sg.end, durationSeconds));
    for (const w of sg.words) {
      w.start = Math.max(0, Math.min(w.start, durationSeconds));
      w.end = Math.max(w.start, Math.min(w.end, durationSeconds));
    }
  }
  return segs;
}

// word 模式：平铺词流 → 段落（文本按 CJK/拉丁规则拼接，词时间戳为精确值）。
export function buildWordSegments(
  words: RawWord[],
  durationSeconds: number,
  language: string | undefined = undefined,
  gapThresholdSeconds = 0.5,
  opts: GroupOptions = {}
): ASRSegment[] {
  return groupWordsIntoSegments(
    words,
    durationSeconds,
    gapThresholdSeconds,
    opts
  ).map(
    (sg, i) => ({
      id: `seg-${i}`,
      text: joinWordsText(sg.words.map((w) => w.text)),
      start: sg.start,
      end: sg.end,
      words: sg.words,
      language,
    })
  );
}
