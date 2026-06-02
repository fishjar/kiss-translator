/**
 * 智能断句算法 - 从 YouTube JSON 到字幕断句
 * 基于 subtitle_generator.py 的 JavaScript 实现
 */

// 算法默认参数
const DEFAULT_PARAMS = {
  maxDurationMs: 7000,
  maxWords: 30,
  sensitivity: 2.0,
  punctuationBreakBonus: 2.5,
  commaBreakBonus: 1.0,
  capitalBreakBonus: 0.5,
  minBoundaryScore: 1.2,
  minSentenceWords: 4,
  minSentenceDurationMs: 500,
  forceBreakOnPunctuation: true,
  forcePunctuationMinWords: 6,
  forcePunctuationMinDurationMs: 2000,
};

// 零宽字符（U+200B~U+200D、U+FEFF），个别 YouTube 轨用它做占位 seg
const ZERO_WIDTH_RE = new RegExp("[\\u200B-\\u200D\\uFEFF]", "g");

/**
 * Word 类 - 单词对象
 */
class Word {
  constructor(text, startMs, endMs) {
    this.text = text;
    this.startMs = startMs;
    this.endMs = endMs;
  }

  get stripped() {
    return this.text.trim();
  }

  get endsWithSentencePunc() {
    return (
      this.stripped.endsWith(".") ||
      this.stripped.endsWith("?") ||
      this.stripped.endsWith("!")
    );
  }

  get endsWithComma() {
    return this.stripped.endsWith(",");
  }

  get startsWithCapital() {
    const s = this.stripped;
    return s && s[0] === s[0].toUpperCase();
  }

  get isAllCaps() {
    const s = this.stripped;
    return s && s.length >= 2 && s === s.toUpperCase();
  }

  get startsWithArrow() {
    return this.text.startsWith(">>");
  }
}

/**
 * WordGap 类 - 单词间隔
 */
class WordGap {
  constructor(
    gapMs,
    prevWord,
    nextWord,
    isYoutubeBreak,
    isSameEvent,
    gapIndex
  ) {
    this.gapMs = gapMs;
    this.prevWord = prevWord;
    this.nextWord = nextWord;
    this.isYoutubeBreak = isYoutubeBreak;
    this.isSameEvent = isSameEvent;
    this.gapIndex = gapIndex;
  }
}

/**
 * GapStats 类 - 间隔统计信息
 */
class GapStats {
  constructor(
    mean,
    median,
    std,
    minVal,
    maxVal,
    p25,
    p50,
    p75,
    p90,
    p95,
    mad,
    robustSigma
  ) {
    this.mean = mean;
    this.median = median;
    this.std = std;
    this.minVal = minVal;
    this.maxVal = maxVal;
    this.p25 = p25;
    this.p50 = p50;
    this.p75 = p75;
    this.p90 = p90;
    this.p95 = p95;
    this.mad = mad;
    this.robustSigma = robustSigma || mad * 1.4826;
  }
}

/**
 * SubtitleSentence 类 - 字幕句子
 */
class SubtitleSentence {
  constructor(words, startMs, endMs, index) {
    this.words = words || [];
    this.startMs = startMs || 0;
    this.endMs = endMs || 0;
    this.index = index || 0;
  }

  get text() {
    const parts = [];
    for (const w of this.words) {
      const txt = w.text;
      if (txt === "\n") continue;
      if (!parts.length) {
        parts.push(txt.trimStart());
      } else if (txt.startsWith(" ")) {
        parts.push(txt);
      } else {
        parts.push(" " + txt);
      }
    }
    return parts.join("").trim();
  }

  get durationMs() {
    return this.endMs - this.startMs;
  }
}

/**
 * 解析 YouTube JSON 数据
 * @param {Object} data - YouTube JSON 数据
 * @returns {Object} { words, gaps }
 */
function parseYoutubeData(data) {
  const events = data.events || [];
  const words = [];
  const wordEventIds = [];
  let eventIdx = 0;

  // 收集所有单词和事件信息
  for (const event of events) {
    const tStart = event.tStartMs || 0;
    const tDuration = event.dDurationMs || 0;
    const tEnd = tStart + tDuration;
    const segs = event.segs || [];
    const isAppend = event.aAppend === 1;

    if (!segs.length) {
      eventIdx++;
      continue;
    }

    if (isAppend && segs.length === 1 && segs[0].utf8 === "\n") {
      eventIdx++;
      continue;
    }

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const text = (seg.utf8 || "").replace(ZERO_WIDTH_RE, "");
      if (!text.trim()) continue;

      const offset = seg.tOffsetMs || 0;
      const wordStart = tStart + offset;

      let wordEnd;
      if (i + 1 < segs.length) {
        const nextOffset = segs[i + 1].tOffsetMs || 0;
        wordEnd = tStart + nextOffset;
      } else {
        wordEnd = tEnd;
      }

      words.push(new Word(text, wordStart, wordEnd));
      wordEventIds.push(eventIdx);
    }
    eventIdx++;
  }

  // 收集 YouTube 换行时间点
  const youtubeBreakTimes = [];
  for (const event of events) {
    const isAppend = event.aAppend === 1;
    const segs = event.segs || [];
    if (isAppend && segs.length === 1 && segs[0].utf8 === "\n") {
      youtubeBreakTimes.push(event.tStartMs || 0);
    }
  }

  // 创建单词间隔
  const gaps = [];
  for (let i = 0; i < words.length - 1; i++) {
    const wPrev = words[i];
    const wNext = words[i + 1];
    let gapMs = wNext.startMs - wPrev.startMs;
    if (gapMs < 0) gapMs = 0;

    let isYtBreak = false;
    for (const ytTime of youtubeBreakTimes) {
      if (wPrev.startMs <= ytTime && ytTime <= wNext.startMs) {
        isYtBreak = true;
        break;
      }
    }

    gaps.push(
      new WordGap(
        gapMs,
        wPrev,
        wNext,
        isYtBreak,
        wordEventIds[i] === wordEventIds[i + 1],
        i
      )
    );
  }

  return { words, gaps, wordEventIds };
}

/**
 * 计算分位数
 * @param {Array<number>} sortedData - 排序后的数组
 * @param {number} p - 分位数 (0-100)
 * @returns {number}
 */
function percentile(sortedData, p) {
  if (!sortedData.length) return 0;
  const k = ((sortedData.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sortedData[Math.floor(k)];
  return sortedData[f] * (c - k) + sortedData[c] * (k - f);
}

/**
 * 计算间隔统计信息
 * @param {Array<WordGap>} gaps
 * @returns {GapStats}
 */
function computeGapStats(gaps, excludeValues = null) {
  const values = [];
  for (const g of gaps) {
    if (excludeValues === null || !excludeValues.has(g.gapMs)) {
      values.push(g.gapMs);
    }
  }
  values.sort((a, b) => a - b);
  const n = values.length;

  if (n === 0) {
    return new GapStats(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  // 均值
  const mean = values.reduce((sum, val) => sum + val, 0) / n;

  // 中位数
  const median = percentile(values, 50);

  // 标准差
  let std = 0;
  if (n >= 2) {
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    std = Math.sqrt(variance);
  }

  // 最小值/最大值
  const minVal = values[0];
  const maxVal = values[n - 1];

  // 各种分位数
  const p25 = percentile(values, 25);
  const p50 = median;
  const p75 = percentile(values, 75);
  const p90 = percentile(values, 90);
  const p95 = percentile(values, 95);

  // 中位数绝对偏差 (MAD)
  const absDevs = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDevs.length ? percentile(absDevs, 50) : 0;

  const robustSigma = mad * 1.4826;

  return new GapStats(
    mean,
    median,
    std,
    minVal,
    maxVal,
    p25,
    p50,
    p75,
    p90,
    p95,
    mad,
    robustSigma
  );
}

/**
 * 检测 YouTube JSON 中的默认 tOffsetMs 填充值
 *
 * YouTube 的某些 seg 中, tOffsetMs 使用的是默认值而非测量值。
 * 这样的 gap 在同 event 内频繁出现, 却几乎不出现在跨 event 之处,
 * 并非真实停顿, 需要侦测出来并加以衰减。
 */
function detectDefaultFillValues(words, gaps, wordEventIds) {
  const withEvent = [];
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i];
    const sameEvent = wordEventIds[i] === wordEventIds[i + 1];
    withEvent.push({
      gapMs: g.gapMs,
      isSameEvent: sameEvent,
    });
  }

  const sameEventCounts = new Map();
  const crossEventValues = new Set();

  for (const item of withEvent) {
    if (item.isSameEvent) {
      sameEventCounts.set(
        item.gapMs,
        (sameEventCounts.get(item.gapMs) || 0) + 1
      );
    } else {
      crossEventValues.add(item.gapMs);
    }
  }

  const totalSameEvents = withEvent.filter((e) => e.isSameEvent).length;
  const suspiciousValues = new Set();

  if (totalSameEvents < 10) return suspiciousValues;

  for (const [val, count] of sameEventCounts) {
    const freqSame = count / totalSameEvents;
    const freqCross = crossEventValues.has(val)
      ? withEvent.filter((e) => !e.isSameEvent && e.gapMs === val).length /
        Math.max(withEvent.filter((e) => !e.isSameEvent).length, 1)
      : 0;

    if (freqSame >= 0.08 && freqCross < 0.02) {
      suspiciousValues.add(val);
    }
  }

  return suspiciousValues;
}

/**
 * 计算边界分数
 * @param {WordGap} gap
 * @param {GapStats} stats
 * @param {Object} params
 * @returns {number}
 */
function computeBoundaryScore(gap, stats, params) {
  if (gap.gapMs <= 0) return -100;

  const {
    sensitivity,
    punctuationBreakBonus,
    commaBreakBonus,
    capitalBreakBonus,
    defaultFillValues,
  } = params;

  let score = 0;
  const gapVal = gap.gapMs;
  const prev = gap.prevWord;
  const next = gap.nextWord;

  // A. 语言学特征
  if (prev.endsWithSentencePunc) {
    score += punctuationBreakBonus;
  }

  if (prev.endsWithComma) {
    score += commaBreakBonus;
  }

  if (next.startsWithCapital && !next.isAllCaps) {
    score += capitalBreakBonus;
  }

  if (prev.endsWithSentencePunc && next.startsWithCapital && !next.isAllCaps) {
    score += punctuationBreakBonus * 0.4;
  }

  // B. 时间统计特征（双 Z-Score：classical + robust 取最小）
  let zClassical = 0;
  let zRobust = 0;
  if (stats.std > 0) {
    zClassical = (gapVal - stats.mean) / stats.std;
  }
  if (stats.robustSigma > 0) {
    zRobust = (gapVal - stats.median) / stats.robustSigma;
  }
  const zScore = Math.min(zClassical, zRobust);
  score += Math.max(0, zScore) * sensitivity;

  // 分位数加分（对同事件内的默认填充值进行衰减）
  const treatAsDefault =
    defaultFillValues && defaultFillValues.has(gapVal) && gap.isSameEvent;
  const dampen = treatAsDefault ? 0.4 : 1.0;

  if (gapVal >= stats.p75) score += 0.5 * dampen;
  if (gapVal >= stats.p90) score += 1.0 * dampen;
  if (gapVal >= stats.p95) score += 1.5 * dampen;

  if (gapVal >= 500) score += 0.3;
  if (gapVal >= 800) score += 0.5;
  if (gapVal >= 1500) score += 1.0;
  if (gapVal >= 3000) score += 1.5;

  // C. YouTube 结构特征
  if (gap.isYoutubeBreak) {
    score += 0.8;
  }

  if (!gap.isSameEvent) {
    score += 0.3;
  } else {
    score -= 1.0;
  }

  return score;
}

/**
 * 查找句子边界
 * @param {Array<Word>} words
 * @param {Array<WordGap>} gaps
 * @param {GapStats} stats
 * @param {Object} params
 * @returns {Array<number>} - 边界索引列表
 */
function findSentenceBoundaries(words, gaps, stats, params) {
  if (!words.length || !gaps.length) return [];

  const {
    maxDurationMs,
    maxWords,
    minBoundaryScore,
    minSentenceWords,
    minSentenceDurationMs,
    forceBreakOnPunctuation,
    forcePunctuationMinWords,
    forcePunctuationMinDurationMs,
  } = params;

  const scores = gaps.map((g) => computeBoundaryScore(g, stats, params));
  const boundaryIndices = [];
  let sentenceStartIdx = 0;
  let bestBreakSinceStart = -1;
  let bestBreakScore = -Infinity;

  for (let i = 0; i < gaps.length; i++) {
    const score = scores[i];
    const prev = gaps[i].prevWord;
    const next = gaps[i].nextWord;
    const currentDuration = next.endMs - words[sentenceStartIdx].startMs;
    const currentWordCount = i + 1 - sentenceStartIdx + 1;

    // 1. >> 箭头强制断句
    if (next.startsWithArrow) {
      if (
        currentDuration >= Math.min(minSentenceDurationMs, 100) &&
        currentWordCount >= minSentenceWords
      ) {
        boundaryIndices.push(i + 1);
        sentenceStartIdx = i + 1;
        bestBreakSinceStart = -1;
        bestBreakScore = -Infinity;
        continue;
      }
    }

    // 2. 句末标点 + 大写开头强制断句
    const mandatoryPunctuationBreak =
      forceBreakOnPunctuation &&
      prev.endsWithSentencePunc &&
      next.startsWithCapital &&
      !next.isAllCaps &&
      currentWordCount >=
        Math.max(forcePunctuationMinWords, minSentenceWords) &&
      currentDuration >= forcePunctuationMinDurationMs &&
      words.length - (i + 1) >= minSentenceWords;

    if (mandatoryPunctuationBreak) {
      boundaryIndices.push(i + 1);
      sentenceStartIdx = i + 1;
      bestBreakSinceStart = -1;
      bestBreakScore = -Infinity;
      continue;
    }

    // 跟踪最佳断句点
    const potentialDuration = words[i].endMs - words[sentenceStartIdx].startMs;
    if (
      score > bestBreakScore &&
      i - sentenceStartIdx + 1 > 0 &&
      potentialDuration >= minSentenceDurationMs
    ) {
      bestBreakScore = score;
      bestBreakSinceStart = i;
    }

    // 3. 硬约束触发断句
    let forceBreak = false;
    if (currentDuration >= maxDurationMs || currentWordCount >= maxWords) {
      forceBreak = true;
    }

    if (forceBreak) {
      const breakAt = bestBreakSinceStart >= 0 ? bestBreakSinceStart : i;
      boundaryIndices.push(breakAt + 1);
      sentenceStartIdx = breakAt + 1;
      bestBreakSinceStart = -1;
      bestBreakScore = -Infinity;
      continue;
    }

    // 4. 正常判断
    if (currentWordCount < minSentenceWords) {
      continue;
    }

    if (score >= minBoundaryScore) {
      let effectiveThreshold = minBoundaryScore;
      if (gaps[i].isSameEvent) {
        effectiveThreshold = minBoundaryScore * 1.5;
      }

      if (
        prev.endsWithSentencePunc &&
        currentWordCount < forcePunctuationMinWords
      ) {
        effectiveThreshold = Infinity;
      }

      if (score >= effectiveThreshold) {
        boundaryIndices.push(i + 1);
        sentenceStartIdx = i + 1;
        bestBreakSinceStart = -1;
        bestBreakScore = -Infinity;
      }
    }
  }

  return Array.from(new Set(boundaryIndices)).sort((a, b) => a - b);
}

/**
 * 合并过短句
 * @param {Array<Word>} words
 * @param {Array<number>} boundaryIndices
 * @param {Object} params
 * @returns {Array<number>}
 */
function mergeShortSentences(words, boundaryIndices, params) {
  const { minSentenceWords, maxDurationMs } = params;
  const maxMergeGapMs = 3000;

  let prevBoundary = 0;
  const merged = [];

  for (let i = 0; i < boundaryIndices.length; i++) {
    const b = boundaryIndices[i];
    const currentWords = b - prevBoundary;

    if (currentWords < minSentenceWords && merged.length) {
      const nextIsArrow = b < words.length && words[b].startsWithArrow;
      if (!nextIsArrow) {
        const gapMs =
          prevBoundary > 0
            ? words[b].startMs - words[prevBoundary - 1].endMs
            : 0;
        const newStart = merged.length >= 2 ? merged[merged.length - 2] : 0;
        const combinedDuration = words[b - 1].endMs - words[newStart].startMs;

        if (gapMs <= maxMergeGapMs && combinedDuration <= maxDurationMs) {
          merged.pop();
          prevBoundary = merged.length ? merged[merged.length - 1] : 0;
          continue;
        }
      }
    }
    merged.push(b);
    prevBoundary = b;
  }

  // 处理尾部
  const lastWords = words.length - prevBoundary;
  if (lastWords < minSentenceWords && merged.length >= 1) {
    const lastBoundary = merged[merged.length - 1];
    const tailWord = lastBoundary < words.length ? words[lastBoundary] : null;
    if (!tailWord || !tailWord.startsWithArrow) {
      const gapMs =
        lastBoundary > 0
          ? words[lastBoundary].startMs - words[lastBoundary - 1].endMs
          : 0;
      const newStart = merged.length >= 2 ? merged[merged.length - 2] : 0;
      const combinedDuration =
        words[words.length - 1].endMs - words[newStart].startMs;

      if (gapMs <= maxMergeGapMs && combinedDuration <= maxDurationMs) {
        merged.pop();
      }
    }
  }

  return merged;
}

/**
 * 将长句分割
 * @param {SubtitleSentence} sentence
 * @param {number} maxDurationMs
 * @returns {Array<SubtitleSentence>}
 */
function splitLongSentence(sentence, maxDurationMs) {
  const words = sentence.words;
  const n = words.length;
  if (n <= 1) return [sentence];

  const totalDur = sentence.durationMs;
  const numParts = Math.ceil(totalDur / maxDurationMs);
  const wordsPerPart = Math.ceil(n / numParts);

  const parts = [];
  for (let i = 0; i < n; i += wordsPerPart) {
    const chunk = words.slice(i, i + wordsPerPart);
    if (chunk.length) {
      parts.push(
        new SubtitleSentence(
          chunk,
          chunk[0].startMs,
          chunk[chunk.length - 1].endMs,
          parts.length
        )
      );
    }
  }
  return parts;
}

/**
 * 构建字幕句子
 * @param {Array<Word>} words
 * @param {Array<number>} boundaryIndices
 * @param {Object} params
 * @returns {Array<SubtitleSentence>}
 */
function buildSubtitleSentences(words, boundaryIndices, params) {
  const { maxDurationMs } = params;
  const sentences = [];

  const splitPoints = [0, ...boundaryIndices];
  if (splitPoints[splitPoints.length - 1] < words.length) {
    splitPoints.push(words.length);
  }

  for (let i = 0; i < splitPoints.length - 1; i++) {
    const startIdx = splitPoints[i];
    const endIdx = splitPoints[i + 1];
    const sw = words.slice(startIdx, endIdx);

    if (!sw.length) continue;

    const startMs = sw[0].startMs;
    const endMs = sw[sw.length - 1].endMs;

    sentences.push(new SubtitleSentence(sw, startMs, endMs, sentences.length));
  }

  // 处理过长的句子
  const finalSentences = [];
  for (const sent of sentences) {
    if (sent.durationMs <= maxDurationMs) {
      finalSentences.push(sent);
    } else {
      finalSentences.push(...splitLongSentence(sent, maxDurationMs));
    }
  }

  // 防止重叠
  for (let i = 0; i < finalSentences.length - 1; i++) {
    const nextStart = finalSentences[i + 1].startMs;
    if (finalSentences[i].endMs > nextStart) {
      finalSentences[i].endMs = nextStart;
    }
  }

  // 重新编号
  for (let i = 0; i < finalSentences.length; i++) {
    finalSentences[i].index = i;
  }

  return finalSentences;
}

/**
 * 主函数 - 执行智能断句
 * @param {Object} data - YouTube JSON 数据
 * @param {Object} params - 算法参数 (可选)
 * @returns {Array<Object>} 字幕列表
 */
export function intelligentSentenceBreak(data, params = {}) {
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  // 1. 解析数据
  const { words, gaps, wordEventIds } = parseYoutubeData(data);
  if (!words.length) return [];

  // 2. 检测 YouTube 默认 tOffsetMs 填充值
  const defaultFillValues = detectDefaultFillValues(words, gaps, wordEventIds);

  // 3. 计算统计信息（排除检测到的默认填充值）
  const stats = computeGapStats(
    gaps,
    defaultFillValues.size ? defaultFillValues : null
  );

  // 4. 将 defaultFillValues 注入参数以传递给评分函数
  const finalParams = {
    ...mergedParams,
    defaultFillValues: defaultFillValues.size ? defaultFillValues : null,
  };

  // 5. 查找边界
  let boundaryIndices = findSentenceBoundaries(words, gaps, stats, finalParams);

  // 6. 合并过短句
  boundaryIndices = mergeShortSentences(words, boundaryIndices, finalParams);

  // 7. 构建句子
  const sentences = buildSubtitleSentences(words, boundaryIndices, finalParams);

  // 8. 转换为标准格式
  return sentences.map((s) => ({
    text: s.text,
    start: s.startMs,
    end: s.endMs,
  }));
}

export {
  DEFAULT_PARAMS,
  Word,
  WordGap,
  GapStats,
  SubtitleSentence,
  parseYoutubeData,
  computeGapStats,
  computeBoundaryScore,
  findSentenceBoundaries,
  mergeShortSentences,
  buildSubtitleSentences,
  detectDefaultFillValues,
};
