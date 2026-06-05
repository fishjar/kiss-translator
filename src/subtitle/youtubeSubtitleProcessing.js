import {
  OPT_LANGS_TO_CODE,
  OPT_TRANS_MICROSOFT,
  OPT_LANGS_SPEC_DEFAULT,
} from "../config";
import { logger } from "../libs/log.js";
import { intelligentSentenceBreak } from "./sentenceBreaker.js";

/**
 * YouTube 字幕文本处理层。
 * 只负责语言映射、timedtext 事件清洗、展平、切块和内置断句，不发起 AI 请求，也不触碰页面 DOM。
 */

/**
 * 将 YouTube 字幕语言编码映射为项目翻译 API 使用的源语言编码。
 *
 * @param {string} lang YouTube timedtext 语言编码。
 * @returns {string} 项目内部识别的语言编码，无法识别时返回 auto。
 */
export function getFromLang(lang) {
  if (lang === "zh") {
    return "zh-CN";
  }

  return (
    OPT_LANGS_SPEC_DEFAULT.get(lang) ||
    OPT_LANGS_SPEC_DEFAULT.get(lang.slice(0, 2)) ||
    OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang) ||
    OPT_LANGS_TO_CODE[OPT_TRANS_MICROSOFT].get(lang.slice(0, 2)) ||
    "auto"
  );
}

/**
 * 清洗 YouTube timedtext 字幕片段中的 HTML 标签、零宽污染和多余空白。
 *
 * @param {string} [utf8=""] 原始 utf8 字幕片段文本。
 * @returns {string} 可展示和断句的纯文本。
 */
export function cleanTimedText(utf8 = "") {
  return (
    String(utf8)
      .replace(/<[^>]+>/g, "")
      // 当前异常 timedtext 中实际污染字幕的是 U+200B 零宽空格。
      // 这里只移除 U+200B，避免误删 U+200C/U+200D 等对部分语言文字成形有意义的字符。
      .replace(/\u200B/g, "")
      .trim()
      .replace(/\s+/g, " ")
  );
}

/**
 * 规范化 YouTube json3 events。
 * 保留断行控制事件和时间断点，同时清洗可见文本并去除重复字幕。
 *
 * @param {Array<object>} [events=[]] YouTube 原始 json3 events。
 * @returns {Array<object>} 规范化后的 events。
 */
export function normalizeTimedTextEvents(events = []) {
  const normalizedEvents = [];
  let lastVisibleEventKey = "";

  events.forEach((event) => {
    const { segs = [], tStartMs = 0, dDurationMs = 0 } = event || {};

    // YouTube 会用 aAppend + "\n" 标记原始字幕断行；统计断句模式会读取这个信号。
    // 因此这类控制事件必须原样保留，不能被“空文本清理”误删。
    if (event?.aAppend === 1 && segs.length === 1 && segs[0]?.utf8 === "\n") {
      normalizedEvents.push(event);
      lastVisibleEventKey = "";
      return;
    }

    const normalizedSegs = segs.map((seg) => ({
      ...seg,
      utf8: cleanTimedText(seg?.utf8),
    }));
    const visibleSegs = normalizedSegs.filter((seg) => seg.utf8);

    // 清洗后没有可见文本的 seg 仍可能携带 tOffsetMs 断点。
    // 这些断点会被 genFlatEvents 用来截断前一个可见片段，直接丢弃会让字幕粘连。
    // 因此这里只清理文本内容，不改变原始 seg 的时间结构。
    if (!visibleSegs.length) {
      normalizedEvents.push({
        ...event,
        segs: normalizedSegs,
      });
      lastVisibleEventKey = "";
      return;
    }

    const visibleText = visibleSegs
      .map((seg) => seg.utf8)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const eventKey = `${tStartMs}|${dDurationMs}|${visibleText}`;

    // 部分 json3 timedtext 会把同一字幕用两套 pPenId 样式连续输出两遍。
    // 去重键只使用时间和可见文本，避免格式层差异污染字幕内容。
    if (eventKey === lastVisibleEventKey) return;

    normalizedEvents.push({
      ...event,
      segs: normalizedSegs,
    });
    lastVisibleEventKey = eventKey;
  });

  return normalizedEvents;
}

/**
 * 将 YouTube events 格式的原始字幕流展平为按单词或词组标记起止时间的数组。
 *
 * @param {Array<object>} [events=[]] 规范化后的 YouTube json3 events。
 * @returns {Array<object>} 展平后的字幕事件流。
 */
export function genFlatEvents(events = []) {
  const segments = [];
  let buffer = null;

  events.forEach(({ segs = [], tStartMs = 0, dDurationMs = 0 }) => {
    segs.forEach(({ utf8 = "", tOffsetMs = 0 }, j) => {
      const text = cleanTimedText(utf8);
      const start = tStartMs + tOffsetMs;
      if (!text) {
        if (buffer) {
          if (!buffer.end || buffer.end > start) {
            buffer.end = start;
          }
          if (buffer.end > buffer.start) {
            segments.push(buffer);
          }
          buffer = null;
        }
        return;
      }

      if (buffer) {
        if (!buffer.end || buffer.end > start) {
          buffer.end = start;
        }
        if (buffer.end > buffer.start) {
          segments.push(buffer);
        }
        buffer = null;
      }

      buffer = {
        text,
        start,
      };

      if (j === segs.length - 1) {
        buffer.end = tStartMs + dDurationMs;
      }
    });
  });

  if (buffer) {
    if (buffer.end > buffer.start) {
      segments.push(buffer);
    }
  }

  return segments.filter(
    (s) => s && typeof s.start === "number" && s.end > s.start
  );
}

/**
 * 判断字幕行是否存在过多异常长行。
 * 长行占比过高时，视为源字幕排版质量较差，应停止自动合并分段。
 *
 * @param {Array<object>} lines 待检测的字幕行数组。
 * @param {number} [lengthThreshold=200] 判定为长行的字符数阈值。
 * @param {number} [percentageThreshold=0.1] 长行占比阈值。
 * @returns {boolean} 字幕质量较差时返回 true。
 */
export function isQualityPoor(
  lines,
  lengthThreshold = 200,
  percentageThreshold = 0.1
) {
  if (lines.length === 0) return false;
  const longLinesCount = lines.filter(
    (line) => line.text.length > lengthThreshold
  ).length;
  logger.debug("Youtube Provider: quality check", {
    longLinesCount,
    totalLines: lines.length,
    percentage: longLinesCount / lines.length,
  });
  return longLinesCount / lines.length > percentageThreshold;
}

/**
 * 核心断句分行状态机算法，主要用于英文和欧系空格分隔语系。
 *
 * @param {object} [param0={}] 参数对象。
 * @param {Array<object>} param0.flatEvents 展平后的字幕事件流。
 * @param {boolean} [param0.usePause=false] 是否启用弱暂停和逻辑连词辅助断行。
 * @param {number} [param0.timeout=1000] 单词间静音间隔断行阈值，单位毫秒。
 * @param {number} [param0.maxWords=15] 单行最大单词数。
 * @param {number} [param0.maxDurationMs=10000] 单行最大持续时间，单位毫秒。
 * @returns {Array<object>} 分行后的字幕条目。
 */
export function processSubtitles({
  flatEvents,
  usePause = false,
  timeout = 1000,
  maxWords = 15,
  maxDurationMs = 10000,
} = {}) {
  // REVIEW: pause 连词词库仍然硬编码为英文单词。
  // 对西语、法语、德语等其他空格分隔语言，逻辑连词切分支持仍有局限。
  const groupedPauseWords = {
    1: new Set([
      "actually",
      "also",
      "although",
      "and",
      "anyway",
      "as",
      "basically",
      "because",
      "but",
      "eventually",
      "frankly",
      "honestly",
      "hopefully",
      "however",
      "if",
      "instead",
      "it's",
      "just",
      "let's",
      "like",
      "literally",
      "maybe",
      "meanwhile",
      "nevertheless",
      "nonetheless",
      "now",
      "okay",
      "or",
      "otherwise",
      "perhaps",
      "personally",
      "probably",
      "right",
      "since",
      "so",
      "suddenly",
      "that's",
      "then",
      "there's",
      "therefore",
      "though",
      "thus",
      "unless",
      "until",
      "well",
      "while",
    ]),
  };

  const sentences = [];
  let currentBuffer = [];
  let bufferWordCount = 0;

  const flushBuffer = () => {
    if (currentBuffer.length > 0) {
      sentences.push({
        text: currentBuffer
          .map((s) => s.text)
          .join(" ")
          .trim(),
        start: currentBuffer[0].start,
        end: currentBuffer[currentBuffer.length - 1].end,
      });
    }
    currentBuffer = [];
    bufferWordCount = 0;
  };

  flatEvents.forEach((segment) => {
    if (!segment.text) return;

    const lastSegment = currentBuffer[currentBuffer.length - 1];

    if (lastSegment) {
      const isEndOfSentence = /[.?!…\])]$/.test(lastSegment.text);
      const isPauseOfSentence = /[,]$/.test(lastSegment.text);
      const isTimeout = segment.start - lastSegment.end > timeout;
      const isDurationExceeded =
        segment.start - currentBuffer[0].start >= maxDurationMs;
      const isWordLimitExceeded =
        (usePause || isPauseOfSentence) && bufferWordCount >= maxWords;
      const startsWithSign = /^[[(♪]/.test(segment.text);
      const startsWithPauseWord =
        usePause &&
        groupedPauseWords["1"].has(segment.text.toLowerCase().split(" ")[0]) &&
        currentBuffer.length > 1;

      if (
        isEndOfSentence ||
        isTimeout ||
        isDurationExceeded ||
        isWordLimitExceeded ||
        startsWithSign ||
        startsWithPauseWord
      ) {
        flushBuffer();
      }
    }

    currentBuffer.push(segment);
    bufferWordCount += segment.text.split(/\s+/).length;
  });

  flushBuffer();

  return sentences;
}

/**
 * 基础字幕格式化处理函数，支持按语言特性自适应分段。
 *
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {string} lang 字幕源语言代码。
 * @param {object} [options={}] 格式化配置。
 * @param {number} [options.longSentenceThreshold=120] 超长句二次切分阈值。
 * @returns {Array<object>} 格式化后的字幕条目。
 */
export function formatSubtitles(
  flatEvents,
  lang,
  { longSentenceThreshold = 120 } = {}
) {
  if (!flatEvents?.length) return [];

  const noSpaceLanguages = ["zh", "ja", "ko", "th", "lo", "km", "my"];

  if (noSpaceLanguages.some((l) => lang?.startsWith(l))) {
    const subtitles = [];

    if (isQualityPoor(flatEvents, 5, 0.5)) {
      return flatEvents;
    }

    let currentLine = null;
    const MAX_LENGTH = 30;

    for (const segment of flatEvents) {
      if (segment.text) {
        if (!currentLine) {
          currentLine = {
            text: segment.text,
            start: segment.start,
            end: segment.end,
          };
        } else {
          currentLine.text += segment.text;
          currentLine.end = segment.end;
        }

        if (currentLine.text.length >= MAX_LENGTH) {
          subtitles.push(currentLine);
          currentLine = null;
        }
      } else if (currentLine) {
        subtitles.push(currentLine);
        currentLine = null;
      }
    }

    if (currentLine) {
      subtitles.push(currentLine);
    }

    return subtitles;
  }

  let subtitles = processSubtitles({ flatEvents });

  const result = [];
  for (const sub of subtitles) {
    if (sub.text.length > longSentenceThreshold) {
      const subEvents = flatEvents.filter(
        (e) => e.start >= sub.start && e.start < sub.end
      );
      if (subEvents.length > 1) {
        logger.debug(
          "Youtube Provider: re-processing long sentence with pause",
          {
            length: sub.text.length,
            text: sub.text.slice(0, 50) + "...",
          }
        );
        const reProcessed = processSubtitles({
          flatEvents: subEvents,
          usePause: true,
        });
        result.push(...reProcessed);
      } else {
        result.push(sub);
      }
    } else {
      result.push(sub);
    }
  }
  subtitles = result;

  return subtitles;
}

/**
 * 基于启发式统计算法提取字幕分句。
 *
 * @param {Array<object>} events 清洗后的 YouTube json3 events。
 * @returns {Array<object>|null} 统计算法生成的字幕条目，异常时返回 null。
 */
export function algorithmicSegment(events) {
  try {
    const algorithmicSubtitles = intelligentSentenceBreak({ events });
    return algorithmicSubtitles.map((sub) => ({
      text: sub.text,
      start: sub.start,
      end: sub.end,
      translation: "",
    }));
  } catch (error) {
    logger.info("Youtube Provider: Error in algorithmic segmentation", error);
    return null;
  }
}

/**
 * 内置兜底断句方法。
 * 根据配置选择统计断句或内置规则断句。
 *
 * @param {Array<object>} events 清洗后的 YouTube json3 events。
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {string} fromLang 字幕源语言代码。
 * @param {object} [setting={}] 字幕处理配置。
 * @returns {Array<object>} 格式化后的字幕条目。
 */
export function builtinSegment(events, flatEvents, fromLang, setting = {}) {
  const { useAlgorithmBreaker } = setting;

  if (useAlgorithmBreaker === "statistical") {
    logger.info("Youtube Provider: Sentence break mode: STATISTICAL");
    const result = algorithmicSegment(events);
    if (result?.length) return result;
    logger.info("Youtube Provider: Statistical segmentation returned empty");
    return [];
  }

  logger.info("Youtube Provider: Sentence break mode: RULE");
  return formatSubtitles(flatEvents, fromLang, {
    longSentenceThreshold: setting.longSentenceThreshold,
  });
}

/**
 * 将展平字幕流按文本长度切分为适合 AI 分批处理的块。
 *
 * @param {Array<object>} flatEvents 展平后的字幕事件流。
 * @param {number} [chunkLength=1000] 目标分块字符数。
 * @returns {Array<Array<object>>} 字幕事件分块。
 */
export function splitEventsIntoChunks(flatEvents, chunkLength = 1000) {
  if (!flatEvents || flatEvents.length === 0) {
    return [];
  }

  const eventChunks = [];
  let currentChunk = [];
  let currentChunkTextLength = 0;
  const MAX_CHUNK_LENGTH = chunkLength + 500;
  const PAUSE_THRESHOLD_MS = 1000;

  for (let i = 0; i < flatEvents.length; i++) {
    const event = flatEvents[i];
    currentChunk.push(event);
    currentChunkTextLength += event.text.length;

    const isLastEvent = i === flatEvents.length - 1;
    if (isLastEvent) {
      continue;
    }

    let shouldSplit = false;

    if (currentChunkTextLength >= MAX_CHUNK_LENGTH) {
      shouldSplit = true;
    } else if (currentChunkTextLength >= chunkLength) {
      const isEndOfSentence = /[.?!…\])]$/.test(event.text);
      const nextEvent = flatEvents[i + 1];
      const pauseDuration = nextEvent.start - event.end;
      if (isEndOfSentence || pauseDuration > PAUSE_THRESHOLD_MS) {
        shouldSplit = true;
      }
    }

    if (shouldSplit) {
      eventChunks.push(currentChunk);
      currentChunk = [];
      currentChunkTextLength = 0;
    }
  }

  if (currentChunk.length > 0) {
    eventChunks.push(currentChunk);
  }

  return eventChunks;
}
