import { isNonSpeechSegment } from "./subtitleTextClassification.js";

const NO_SPACE_LANGUAGES = ["zh", "ja", "ko", "th", "lo", "km", "my"];

// 指标统一保留两位小数，避免 CLI 和浏览器因浮点尾差产生不必要的差异。
const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * ratio) - 1;
  return sorted[Math.max(0, index)];
};

const summarize = (values) => ({
  average: round(
    values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : 0
  ),
  p95: percentile(values, 0.95),
  max: values.length ? Math.max(...values) : 0,
});

/** 根据语言书写方式生成覆盖校验 token，中文等无空格语言按 Unicode 字符比较。 */
const tokenize = (text, isNoSpace) => {
  const normalized = String(text || "").toLowerCase();
  if (isNoSpace) return Array.from(normalized.replace(/\s+/g, ""));
  return normalized.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) || [];
};

const tokenCounts = (texts, isNoSpace) => {
  const counts = new Map();
  for (const token of tokenize((texts || []).join(" "), isNoSpace)) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
};

/** 用多重集合比较原始文本与结果文本，分别统计遗漏和重复 token。 */
const compareCoverage = (flatEvents, cues, isNoSpace) => {
  const source = tokenCounts(
    flatEvents.map((item) => item.text),
    isNoSpace
  );
  const result = tokenCounts(
    cues.map((item) => item.text),
    isNoSpace
  );
  let sourceTokenCount = 0;
  let missingTextCount = 0;
  let duplicatedTextCount = 0;

  for (const [token, count] of source) {
    sourceTokenCount += count;
    missingTextCount += Math.max(0, count - (result.get(token) || 0));
  }
  for (const [token, count] of result) {
    duplicatedTextCount += Math.max(0, count - (source.get(token) || 0));
  }

  return {
    textCoveragePercent: sourceTokenCount
      ? round(((sourceTokenCount - missingTextCount) / sourceTokenCount) * 100)
      : 100,
    missingTextCount,
    duplicatedTextCount,
  };
};

/**
 * 计算 CLI 和 Playground 共用的字幕断句结构及可读性指标。
 */
export function buildSegmentationMetrics({
  rawEvents = [],
  canonicalEvents = [],
  flatEvents = [],
  cues = [],
  fromLang = "auto",
  processingMs = 0,
  filteredNonSpeechCount = 0,
  ai = null,
} = {}) {
  const safeCues = Array.isArray(cues) ? cues : [];
  const charLengths = safeCues.map((cue) => String(cue.text || "").length);
  const wordLengths = safeCues.map(
    (cue) =>
      String(cue.text || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
  );
  const durations = safeCues.map((cue) =>
    Math.max(0, Number(cue.end) - Number(cue.start))
  );
  const sourceStart = flatEvents[0]?.start || 0;
  const sourceEnd = flatEvents[flatEvents.length - 1]?.end || sourceStart;
  const isNoSpace = NO_SPACE_LANGUAGES.some((lang) =>
    String(fromLang).startsWith(lang)
  );

  let emptyCueCount = 0;
  let overlapCount = 0;
  let nonMonotonicCount = 0;
  let invalidCueCount = 0;
  let coveredDurationMs = 0;

  safeCues.forEach((cue, index) => {
    if (!String(cue.text || "").trim()) emptyCueCount += 1;
    const duration = Number(cue.end) - Number(cue.start);
    if (
      !Number.isFinite(Number(cue.start)) ||
      !Number.isFinite(Number(cue.end)) ||
      duration <= 0
    ) {
      invalidCueCount += 1;
    }
    if (Number.isFinite(duration) && duration > 0)
      coveredDurationMs += duration;
    if (index > 0) {
      const previous = safeCues[index - 1];
      if (Number(cue.start) < Number(previous.start)) nonMonotonicCount += 1;
      if (Number(cue.start) < Number(previous.end)) overlapCount += 1;
    }
  });

  const coverage = compareCoverage(flatEvents, safeCues, isNoSpace);
  const warnings = {
    tooLongTextCount: safeCues.filter((cue, index) =>
      isNoSpace ? charLengths[index] > 30 : wordLengths[index] > 15
    ).length,
    tooLongDurationCount: durations.filter((duration) => duration > 10000)
      .length,
    fragmentCount: safeCues.filter(
      (cue, index) =>
        wordLengths[index] < 2 &&
        durations[index] < 500 &&
        !isNonSpeechSegment(cue.text)
    ).length,
    nonSpeechCueCount: safeCues.filter((cue) => isNonSpeechSegment(cue.text))
      .length,
  };

  const metrics = {
    processingMs: round(processingMs),
    rawEventCount: rawEvents.length,
    canonicalEventCount: canonicalEvents.length,
    flatEventCount: flatEvents.length,
    // 这是预处理阶段主动排除的片段数量，不属于可读性错误。
    filteredNonSpeechCount: Math.max(0, Number(filteredNonSpeechCount) || 0),
    cueCount: safeCues.length,
    sourceDurationMs: Math.max(0, sourceEnd - sourceStart),
    coveredDurationMs,
    ...coverage,
    emptyCueCount,
    invalidCueCount,
    overlapCount,
    nonMonotonicCount,
    chars: summarize(charLengths),
    words: summarize(wordLengths),
    durationMs: summarize(durations),
    warnings,
  };

  if (ai) metrics.ai = ai;
  return metrics;
}

export function getSegmentationMetricErrors(metrics = {}) {
  const errors = [];
  if (metrics.invalidCueCount) errors.push("invalid-cue");
  if (metrics.emptyCueCount) errors.push("empty-cue");
  if (metrics.overlapCount) errors.push("overlap");
  if (metrics.nonMonotonicCount) errors.push("non-monotonic");
  if (metrics.missingTextCount) errors.push("missing-text");
  if (metrics.duplicatedTextCount) errors.push("duplicated-text");
  if (metrics.warnings?.nonSpeechCueCount) errors.push("non-speech-leaked");
  return errors;
}
