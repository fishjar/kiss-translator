/**
 * 智能断句算法 - 从 YouTube 歌词/字幕 JSON 到结构化断句
 * 基于 Python 字幕生成器 (subtitle_generator.py) 的 JavaScript 等价实现。
 *
 * 核心设计：
 * YouTube 的自动生成字幕（ASR）通常只有连续的单词和单词时间戳，没有句尾标点或分句。
 * 本算法通过统计学分析单词与单词之间的时间间隔（Gap），结合语言学边界特征（如首字母大写、句尾标点符号），
 * 以及时间间隔的中位数绝对偏差（MAD）和 Z-Score 统计算法，来自动判定最合理的句子边界，从而重构出语义通顺的分句。
 */

// 算法评分机制的默认参数配置
const DEFAULT_PARAMS = {
  maxDurationMs: 7000, // 单个句子的最大时长上限（毫秒），超时强制截断
  maxWords: 30, // 单个句子的最大单词数上限，超长强制截断
  sensitivity: 2.0, // 对停顿时间的评分灵敏度系数（Z-Score 的加权系数）
  punctuationBreakBonus: 2.5, // 句尾标点（.?!）断句的评分加分
  commaBreakBonus: 1.0, // 逗号（,）断句的评分加分
  capitalBreakBonus: 0.5, // 下一单词首字母大写（可能代表新句子起始）的加分
  minBoundaryScore: 1.2, // 判定为断句边界的最小累加评分阈值
  minSentenceWords: 4, // 单个句子的最小单词数限制，防止句子过碎
  minSentenceDurationMs: 500, // 单个句子的最小时长限制（毫秒）
  forceBreakOnPunctuation: true, // 在标点符号处是否启用硬性条件强制断句
  forcePunctuationMinWords: 6, // 标点符号硬断句的最小单词数要求
  forcePunctuationMinDurationMs: 2000, // 标点符号硬断句的最小时长要求
};

/**
 * Word 类 - 单词对象
 * 封装单个单词的文本内容及其在时间轴上的起止时间
 */
class Word {
  constructor(text, startMs, endMs) {
    this.text = text; // 单词文本（可能包含空格及前后标点）
    this.startMs = startMs; // 该单词开始播放的时间（毫秒）
    this.endMs = endMs; // 该单词结束播放的时间（毫秒）
  }

  // 获取清洗首尾空白后的单词文本
  get stripped() {
    return this.text.trim();
  }

  // 判断单词尾部是否带有英文的句尾结束标点符号
  get endsWithSentencePunc() {
    return (
      this.stripped.endsWith(".") ||
      this.stripped.endsWith("?") ||
      this.stripped.endsWith("!")
    );
  }

  // 判断单词尾部是否带有逗号
  get endsWithComma() {
    return this.stripped.endsWith(",");
  }

  // 判断单词是否为首字母大写（常用于指示一个新句子的开始）
  get startsWithCapital() {
    const s = this.stripped;
    return s && s[0] === s[0].toUpperCase();
  }

  // 判断单词是否全部大写（如专有名词或缩写，排除单字母大写如 "I"）
  get isAllCaps() {
    const s = this.stripped;
    return s && s.length >= 2 && s === s.toUpperCase();
  }

  // 判断是否以 ">>" 箭头开头（YouTube 自动字幕中常用来代表说话人切换）
  get startsWithArrow() {
    return this.text.startsWith(">>");
  }
}

/**
 * WordGap 类 - 单词间隔对象
 * 封装两个相邻单词之间的时间间隔和结构关联性
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
    this.gapMs = gapMs; // 前后两个单词间的时间间隔（毫秒）
    this.prevWord = prevWord; // 前一个单词实例
    this.nextWord = nextWord; // 后一个单词实例
    this.isYoutubeBreak = isYoutubeBreak; // 是否落在 YouTube 原始的物理换行位置上
    this.isSameEvent = isSameEvent; // 这两个单词是否属于 YouTube 同一个 Event 组
    this.gapIndex = gapIndex; // 该间隔在整片字幕中的索引位置
  }
}

/**
 * GapStats 类 - 间隔统计信息
 * 存储整篇字幕时间间隔（Gaps）的一系列统计指标，用于自适应阈值计算
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
    this.mean = mean; // 均值
    this.median = median; // 中位数
    this.std = std; // 标准差
    this.minVal = minVal; // 最小值
    this.maxVal = maxVal; // 最大值
    this.p25 = p25; // 25% 分位数
    this.p50 = p50; // 50% 分位数（等于中位数）
    this.p75 = p75; // 75% 分位数
    this.p90 = p90; // 90% 分位数
    this.p95 = p95; // 95% 分位数
    this.mad = mad; // 中位数绝对偏差 (Median Absolute Deviation)
    // 稳健标准差 (Robust Sigma)。在存在大量极值/噪点时，常规标准差 std 会严重失真。
    // 使用中位数绝对偏差 (MAD) 乘以 1.4826 作为标准差的稳健估计（正态分布下等价）
    this.robustSigma = robustSigma || mad * 1.4826;
  }
}

/**
 * SubtitleSentence 类 - 字幕句子对象
 * 封装由多个单词重构而成的完整单行字幕句子
 */
class SubtitleSentence {
  constructor(words, startMs, endMs, index) {
    this.words = words || []; // 组成句子的单词对象数组
    this.startMs = startMs || 0; // 句子开始播放时间（毫秒）
    this.endMs = endMs || 0; // 句子结束播放时间（毫秒）
    this.index = index || 0; // 句子在段落中的序号位置
  }

  // 拼接单词，重构并输出符合正常英文排版空格规则的整句字符串
  get text() {
    const parts = [];
    for (const w of this.words) {
      const txt = w.text;
      if (txt === "\n") continue;
      if (!parts.length) {
        // 第一项去除前导空格
        parts.push(txt.trimStart());
      } else if (txt.startsWith(" ")) {
        // 单词自带前导空格，直接追加
        parts.push(txt);
      } else {
        // 补上空格以符合单词间留白规则
        parts.push(" " + txt);
      }
    }
    return parts.join("").trim();
  }

  // 获取该句子的总持续时间（毫秒）
  get durationMs() {
    return this.endMs - this.startMs;
  }
}

/**
 * 解析 YouTube 原始的 JSON 格式字幕数据
 * 将层级复杂的 events / segs 结构展平，提取出单词序列并建立单词间的时间间隔序列。
 *
 * @param {Object} data - YouTube 原始字幕的 JSON 数据 (json3 格式)
 * @returns {Object} { words, gaps, wordEventIds } 单词数组、间隔数组以及每个单词对应的事件 ID 数组
 */
function parseYoutubeData(data) {
  const events = data.events || [];
  const words = [];
  const wordEventIds = [];
  let eventIdx = 0;

  // 1. 收集并清洗所有有效的单词，确定每个单词的绝对起止时间轴
  for (const event of events) {
    const tStart = event.tStartMs || 0;
    const tDuration = event.dDurationMs || 0;
    const tEnd = tStart + tDuration;
    const segs = event.segs || [];
    const isAppend = event.aAppend === 1;

    // 空的 segs 直接跳过
    if (!segs.length) {
      eventIdx++;
      continue;
    }

    // 单独的换行事件跳过，但需要保留其时间用于换行边界检测
    if (isAppend && segs.length === 1 && segs[0].utf8 === "\n") {
      eventIdx++;
      continue;
    }

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const text = seg.utf8 || "";
      if (!text || text === "\n") continue;

      const offset = seg.tOffsetMs || 0;
      const wordStart = tStart + offset;

      let wordEnd;
      if (i + 1 < segs.length) {
        // 同一事件下，当前单词的结束时间约等于下一个单词的开始时间
        const nextOffset = segs[i + 1].tOffsetMs || 0;
        wordEnd = tStart + nextOffset;
      } else {
        // 事件中的最后一个单词，以整个 Event 的结束时间为准
        wordEnd = tEnd;
      }

      words.push(new Word(text, wordStart, wordEnd));
      wordEventIds.push(eventIdx); // 记录该单词属于第几个 Event，用于后续分析是否在同事件内
    }
    eventIdx++;
  }

  // 2. 收集 YouTube 原始自动字幕产生的换行事件发生的时间点
  const youtubeBreakTimes = [];
  for (const event of events) {
    const isAppend = event.aAppend === 1;
    const segs = event.segs || [];
    if (isAppend && segs.length === 1 && segs[0].utf8 === "\n") {
      youtubeBreakTimes.push(event.tStartMs || 0);
    }
  }

  // 3. 计算相邻单词之间的时间差，封装为 WordGap 实例
  const gaps = [];
  for (let i = 0; i < words.length - 1; i++) {
    const wPrev = words[i];
    const wNext = words[i + 1];
    let gapMs = wNext.startMs - wPrev.startMs;
    if (gapMs < 0) gapMs = 0; // 容错处理

    // 判断这两个单词之间是否穿插了 YouTube 的物理换行时间点
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
        wordEventIds[i] === wordEventIds[i + 1], // 判断是否属于同一个 Event 事件
        i
      )
    );
  }

  return { words, gaps, wordEventIds };
}

/**
 * 线性插值法计算排序数组的分位数
 *
 * @param {Array<number>} sortedData - 已按升序排列的数值数组
 * @param {number} p - 目标分位数，取值范围 (0 - 100)
 * @returns {number} 对应的分位数值
 */
function percentile(sortedData, p) {
  if (!sortedData.length) return 0;
  const k = ((sortedData.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sortedData[Math.floor(k)];
  return sortedData[f] * (c - k) + sortedData[c] * (k - f); // 线性插值
}

/**
 * 根据单词间隔序列计算出一系列的统计学描述指标
 *
 * @param {Array<WordGap>} gaps - 单词间隔数组
 * @param {Set<number>} [excludeValues=null] - 可选。需要排除计算的特定时间间隔值集合
 * @returns {GapStats} 间隔统计指标对象
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

  // A. 计算算术平均值 (Mean)
  const mean = values.reduce((sum, val) => sum + val, 0) / n;

  // B. 计算中位数 (Median)
  const median = percentile(values, 50);

  // C. 计算样本标准差 (Standard Deviation)
  let std = 0;
  if (n >= 2) {
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    std = Math.sqrt(variance);
  }

  // D. 记录最大/最小值
  const minVal = values[0];
  const maxVal = values[n - 1];

  // E. 计算分位数 (25%, 75%, 90%, 95%)
  const p25 = percentile(values, 25);
  const p50 = median;
  const p75 = percentile(values, 75);
  const p90 = percentile(values, 90);
  const p95 = percentile(values, 95);

  // F. 计算中位数绝对偏差 (MAD)
  // MAD = median(|x_i - median(X)|)
  const absDevs = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDevs.length ? percentile(absDevs, 50) : 0;

  // 稳健标准差 robustSigma = MAD * 1.4826
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
 * 检测 YouTube 自动字幕中由于算法默认对齐填充而产生的“默认时间差”（Default Fill Values）
 *
 * 在 YouTube 自动字幕的某些片段中，segs 的 tOffsetMs 常使用默认固定时间间隔填充（如 30ms、100ms 等），而非真实说话停顿。
 * 这样的时间差在同一个 Event 事件内部会非常频繁地高频出现，但极少出现在跨 Event 的交界处。
 * 这些并不是真正的停顿，在 Z-Score 评分时如果不加以处理，会导致虚假断句。本方法侦测这些值以便后续对其评分进行衰减。
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

  // 若同事件单词总量太少，统计学上无显著性，不执行侦测
  if (totalSameEvents < 10) return suspiciousValues;

  for (const [val, count] of sameEventCounts) {
    const freqSame = count / totalSameEvents;
    // 计算该间隔值在跨事件边界出现的频率
    const freqCross = crossEventValues.has(val)
      ? withEvent.filter((e) => !e.isSameEvent && e.gapMs === val).length /
        Math.max(withEvent.filter((e) => !e.isSameEvent).length, 1)
      : 0;

    // 如果一个时间差在同事件内频繁出现（>= 8%），但在跨事件处极少出现（< 2%），说明是 YouTube 渲染器的对齐填充值
    if (freqSame >= 0.08 && freqCross < 0.02) {
      suspiciousValues.add(val);
    }
  }

  return suspiciousValues;
}

/**
 * 核心评分函数：评估相邻单词间的时间间隔 (WordGap) 应当被判定为断句边界的累加评分。
 * 得分越高，说明在此处断句的概率越大。
 *
 * 机制：
 * 1. 语言学特征评分（句末标点、逗号、首字母大写）
 * 2. 统计学特征评分（计算该 Gap 偏离正常说话间隔均值的程度：同时计算经典 Z-Score 和稳健 Z-Score 并取二者最小值，乘灵敏度）
 * 3. 统计分位数分段奖励（落入大分位数区间说明停顿极其反常，加分；对于同事件内的填充噪声实施衰减降权）
 * 4. YouTube 字幕轨道物理边界特征评分（跨事件/原始换行加分，同事件扣分）
 */
function computeBoundaryScore(gap, stats, params) {
  if (gap.gapMs <= 0) return -100; // 时间重叠或无间隔，绝不断句

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

  // ==========================================
  // A. 语言学特征评估 (Linguistic Features)
  // ==========================================

  // 1. 如果前一个单词结尾本身带有句末标点符号，说明语义已经结束，高额加分
  if (prev.endsWithSentencePunc) {
    score += punctuationBreakBonus;
  }

  // 2. 如果前一个单词结尾是逗号，说明有短暂语义停顿，中额加分
  if (prev.endsWithComma) {
    score += commaBreakBonus;
  }

  // 3. 如果后一个单词是首字母大写且非缩写，很有可能是新句子的开头，轻微加分
  if (next.startsWithCapital && !next.isAllCaps) {
    score += capitalBreakBonus;
  }

  // 4. 双重增强：句尾标点 + 首字母大写组合出现
  if (prev.endsWithSentencePunc && next.startsWithCapital && !next.isAllCaps) {
    score += punctuationBreakBonus * 0.4;
  }

  // ==========================================
  // B. 时间统计特征评估 (Timing Features)
  // ==========================================

  let zClassical = 0; // 经典 Z-Score：度量数据点偏离平均值的标准差倍数
  let zRobust = 0; // 稳健 Z-Score：度量数据点偏离中位数的稳健标准差 (Robust Sigma) 倍数

  if (stats.std > 0) {
    zClassical = (gapVal - stats.mean) / stats.std;
  }
  if (stats.robustSigma > 0) {
    zRobust = (gapVal - stats.median) / stats.robustSigma;
  }

  // 采用经典和稳健 Z-Score 的较小值，以防止局部的极端超大停顿导致 Z-Score 计算失真
  const zScore = Math.min(zClassical, zRobust);
  // 仅在 Gap 大于中位数（即 Z-Score > 0）时计入停顿评分，乘以灵敏度参数
  score += Math.max(0, zScore) * sensitivity;

  // 针对 YouTube 物理对齐的填充噪音进行衰减系数计算 (dampen)
  const treatAsDefault =
    defaultFillValues && defaultFillValues.has(gapVal) && gap.isSameEvent;
  const dampen = treatAsDefault ? 0.4 : 1.0;

  // 根据停顿落在统计分位数中的区间，进行阶梯式分段奖励加分
  if (gapVal >= stats.p75) score += 0.5 * dampen;
  if (gapVal >= stats.p90) score += 1.0 * dampen;
  if (gapVal >= stats.p95) score += 1.5 * dampen;

  // 物理时间轴绝对静默停顿加权奖励
  if (gapVal >= 500) score += 0.3;
  if (gapVal >= 800) score += 0.5;
  if (gapVal >= 1500) score += 1.0;
  if (gapVal >= 3000) score += 1.5;

  // ==========================================
  // C. YouTube 结构特征评估 (Structure Features)
  // ==========================================

  // 1. 如果该间隔本身是 YouTube 原始字幕的换行处，说明原始断句在此，加分
  if (gap.isYoutubeBreak) {
    score += 0.8;
  }

  // 2. 如果前后的单词分属两个不同的事件 (Event)，说明时间跨度较大，增加断句概率；反之，如果在同一个 Event 内，则扣分以促使句子连贯
  if (!gap.isSameEvent) {
    score += 0.3;
  } else {
    score -= 1.0;
  }

  return score;
}

/**
 * 搜寻句子的边界索引列表
 *
 * @param {Array<Word>} words - 单词数组
 * @param {Array<WordGap>} gaps - 单词间隔数组
 * @param {GapStats} stats - 描述统计指标
 * @param {Object} params - 阈值及约束参数
 * @returns {Array<number>} 判定为断句的单词右边界索引列表
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

  // 计算每一个 Gap 的边界得分
  const scores = gaps.map((g) => computeBoundaryScore(g, stats, params));
  const boundaryIndices = [];
  let sentenceStartIdx = 0;
  let bestBreakSinceStart = -1;
  let bestBreakScore = -Infinity;

  for (let i = 0; i < gaps.length; i++) {
    const score = scores[i];
    const prev = gaps[i].prevWord;
    const next = gaps[i].nextWord;
    // 计算当前句子如果在此处截断，总的时长和单词量
    const currentDuration = next.endMs - words[sentenceStartIdx].startMs;
    const currentWordCount = i + 1 - sentenceStartIdx + 1;

    // 1. 强制断句规则一：遇到说话人切换标识 ">>"，且当前句子已满足最小句子字数/时间阈值
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

    // 2. 强制断句规则二：句末标点 + 紧跟首字母大写，且句子单词数和时间均超过了标点硬截断下限，且剩余单词量足够成句
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

    // 在滑窗移动中，跟踪当前句子范围内得分最高的“最佳候选断句点”
    const potentialDuration = words[i].endMs - words[sentenceStartIdx].startMs;
    if (
      score > bestBreakScore &&
      i - sentenceStartIdx + 1 > 0 &&
      potentialDuration >= minSentenceDurationMs
    ) {
      bestBreakScore = score;
      bestBreakSinceStart = i;
    }

    // 3. 硬性超限约束：如果句子的时长或单词总数超过了设定上限 (maxDurationMs / maxWords)，必须强行断句
    let forceBreak = false;
    if (currentDuration >= maxDurationMs || currentWordCount >= maxWords) {
      forceBreak = true;
    }

    if (forceBreak) {
      // 强行断句时，优先选择之前记录的最佳候选断句点；如果没有，则只能在当前位置截断
      const breakAt = bestBreakSinceStart >= 0 ? bestBreakSinceStart : i;
      boundaryIndices.push(breakAt + 1);
      sentenceStartIdx = breakAt + 1;
      bestBreakSinceStart = -1;
      bestBreakScore = -Infinity;
      continue;
    }

    // 4. 正常判断：若句子长度过短，即使得分高也不允许在此处截断，继续滑窗累加
    if (currentWordCount < minSentenceWords) {
      continue;
    }

    // 5. 得分判定：若当前 Gap 得分超过断句最低阈值
    if (score >= minBoundaryScore) {
      let effectiveThreshold = minBoundaryScore;

      // 同一 Event 内部断句要从严，提高得分门槛为 1.5 倍
      if (gaps[i].isSameEvent) {
        effectiveThreshold = minBoundaryScore * 1.5;
      }

      // 如果有标点但字数未达硬断句下限，暂时不予以自动触发
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

  // 数组去重并升序排序返回
  return Array.from(new Set(boundaryIndices)).sort((a, b) => a - b);
}

/**
 * 启发式合并：将过度断句导致单词数极少的短句，向上合并到前一个句子中
 *
 * @param {Array<Word>} words - 原始单词序列
 * @param {Array<number>} boundaryIndices - 已算出的候选边界列表
 * @param {Object} params - 阈值参数
 * @returns {Array<number>} 经过短句合并整理后的边界列表
 */
function mergeShortSentences(words, boundaryIndices, params) {
  const { minSentenceWords, maxDurationMs } = params;
  const maxMergeGapMs = 3000; // 合并的最大静默间隔时间（毫秒），停顿太大不予合并

  let prevBoundary = 0;
  const merged = [];

  for (let i = 0; i < boundaryIndices.length; i++) {
    const b = boundaryIndices[i];
    const currentWords = b - prevBoundary;

    // 如果当前分句的单词量小于最小单词数限制，并且前面已经有句子了
    if (currentWords < minSentenceWords && merged.length) {
      const nextIsArrow = b < words.length && words[b].startsWithArrow;

      // 在没有说话人切换的前提下，如果两个分句之间时间停顿较小，且合并后的总时长未超上限，则执行合并
      if (!nextIsArrow) {
        const gapMs =
          prevBoundary > 0
            ? words[b].startMs - words[prevBoundary - 1].endMs
            : 0;
        const newStart = merged.length >= 2 ? merged[merged.length - 2] : 0;
        const combinedDuration = words[b - 1].endMs - words[newStart].startMs;

        if (gapMs <= maxMergeGapMs && combinedDuration <= maxDurationMs) {
          merged.pop(); // 弹出前一个边界，等于撤销了上一次的断句
          prevBoundary = merged.length ? merged[merged.length - 1] : 0;
          continue;
        }
      }
    }
    merged.push(b);
    prevBoundary = b;
  }

  // 收尾处理：检查全片末尾遗留下的尾巴短句
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
        merged.pop(); // 撤销最后一个边界，将其合并到前一个句子
      }
    }
  }

  return merged;
}

/**
 * 兜底均匀分割：如果某单句话由于缺乏停顿和标点导致持续时间依然极长，
 * 采用按单词量均匀平分的策略切分为数个子分句
 *
 * @param {SubtitleSentence} sentence - 需要切分的超长句子实例
 * @param {number} maxDurationMs - 最大时长阈值
 * @returns {Array<SubtitleSentence>} 切分后的子分句数组
 */
function splitLongSentence(sentence, maxDurationMs) {
  const words = sentence.words;
  const n = words.length;
  if (n <= 1) return [sentence];

  const totalDur = sentence.durationMs;
  const numParts = Math.ceil(totalDur / maxDurationMs); // 计算出需要切成几份
  const wordsPerPart = Math.ceil(n / numParts); // 每份分配的单词数

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
 * 组装并构建字幕句子列表，同时修正时间轴重叠现象
 *
 * @param {Array<Word>} words - 单词数组
 * @param {Array<number>} boundaryIndices - 边界索引数组
 * @param {Object} params - 算法参数
 * @returns {Array<SubtitleSentence>} 字幕句子数组
 */
function buildSubtitleSentences(words, boundaryIndices, params) {
  const { maxDurationMs } = params;
  const sentences = [];

  // 将起点 0 和各边界点、终点合并为分段分割点数组
  const splitPoints = [0, ...boundaryIndices];
  if (splitPoints[splitPoints.length - 1] < words.length) {
    splitPoints.push(words.length);
  }

  // 1. 切片构建基础句子
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const startIdx = splitPoints[i];
    const endIdx = splitPoints[i + 1];
    const sw = words.slice(startIdx, endIdx);

    if (!sw.length) continue;

    const startMs = sw[0].startMs;
    const endMs = sw[sw.length - 1].endMs;

    sentences.push(new SubtitleSentence(sw, startMs, endMs, sentences.length));
  }

  // 2. 超长句再切分兜底
  const finalSentences = [];
  for (const sent of sentences) {
    if (sent.durationMs <= maxDurationMs) {
      finalSentences.push(sent);
    } else {
      finalSentences.push(...splitLongSentence(sent, maxDurationMs));
    }
  }

  // 3. 时间重叠修正：若前一句的结束时间大于后一句的开始时间，强行剪切前一句的结束时间与后一句对齐
  for (let i = 0; i < finalSentences.length - 1; i++) {
    const nextStart = finalSentences[i + 1].startMs;
    if (finalSentences[i].endMs > nextStart) {
      finalSentences[i].endMs = nextStart;
    }
  }

  // 4. 对切分整合后的句子重新编排序号
  for (let i = 0; i < finalSentences.length; i++) {
    finalSentences[i].index = i;
  }

  return finalSentences;
}

/**
 * 智能分句算法主函数入口。
 * 接收 YouTube 原始 ASR json3 数据，通过统计学及语言学特征进行分句，
 * 并输出符合标准 VTT 转换数据结构的双语字幕数组。
 *
 * @param {Object} data - YouTube 原生 TimedText JSON 字幕数据
 * @param {Object} [params={}] - 覆盖默认算法评分参数的参数集
 * @returns {Array<Object>} 包含 { text, start, end } 形式的格式化分句字幕列表
 */
export function intelligentSentenceBreak(data, params = {}) {
  const mergedParams = { ...DEFAULT_PARAMS, ...params };

  // 1. 将复杂的 Timedtext JSON 扁平化，解析为结构清晰的单词 (words) 及单词差 (gaps) 数组
  const { words, gaps, wordEventIds } = parseYoutubeData(data);
  if (!words.length) return [];

  // 2. 侦测 YouTube 为了对齐波形而自动填充的伪间隔时间差，用于在计算均值/标准差时进行降噪排除
  const defaultFillValues = detectDefaultFillValues(words, gaps, wordEventIds);

  // 3. 计算本视频中说话时间差的一系列自适应统计学指标，排除检测出的默认伪填充值
  const stats = computeGapStats(
    gaps,
    defaultFillValues.size ? defaultFillValues : null
  );

  // 4. 将侦测出的 defaultFillValues 包装传入评分参数
  const finalParams = {
    ...mergedParams,
    defaultFillValues: defaultFillValues.size ? defaultFillValues : null,
  };

  // 5. 扫描单词队列，根据语言学加分和 Z-Score 统计算法寻找最合理的分句断句边界索引
  let boundaryIndices = findSentenceBoundaries(words, gaps, stats, finalParams);

  // 6. 启发式合并：将过度断句的极碎短句向上合并以提升字幕语义完整度
  boundaryIndices = mergeShortSentences(words, boundaryIndices, finalParams);

  // 7. 组装单词子区间，修正时间重叠，最终输出 SubtitleSentence 句子数组
  const sentences = buildSubtitleSentences(words, boundaryIndices, finalParams);

  // 8. 转换为标准统一的内部双语字幕格式，回传供翻译引擎使用
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
