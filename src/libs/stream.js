/**
 * @file stream.js
 * @description 流式翻译响应处理模块。包含 SSE 流数据拆包、XML/JSON/行协议的流式解析、异步队列桥接以及实时打字机渲染的解析辅助方法。
 */

import { JSONParser } from "@streamparser/json";
import {
  OPT_TRANS_OPENAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_EPHONEAI,
} from "../config";
import {
  normalizeTranslationItem,
  parseLineTranslationSegments,
  parseXmlTranslationSegments,
} from "./aiResponseParser";

/**
 * 创建 Server-Sent Events (SSE) 协议数据流解析器
 * 自动处理 TCP 拆包、粘包和 Buffer 状态，每次追加字符 chunk 时，生成器会解析并 yield 出有效的 data 字符串。
 * @returns {Function} 生成器函数，接收文本块 chunk 字符并 yield 解析出的 data 数据。
 */
export const createSSEParser = () => {
  let buffer = "";

  return function* (chunk = "") {
    buffer += chunk;
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const frame = buffer.slice(0, boundaryIndex);
      // SSE 以空行作为一帧结束；未结束的尾部片段必须留在 buffer 等下一块数据补齐。
      buffer = buffer.slice(boundaryIndex + 2);

      const dataLines = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;

        let data = line.slice(5);
        if (data.startsWith(" ")) data = data.slice(1);
        dataLines.push(data);
      }

      if (dataLines.length) {
        const data = dataLines.join("\n");
        if (data.trim() !== "[DONE]") {
          yield data;
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }
  };
};

/**
 * 创建异步队列，用于在事件/回调 API 与 ES6 异步生成器 (Async Generator) 之间提供异步迭代桥接。
 * 允许在生产者（如 SSE 监听器回调）和消费者（如 for await...of 循环）之间同步数据。
 * @returns {Object} 队列操作对象，包含 push、finish、error 以及迭代器 iterate。
 */
export const createAsyncQueue = () => {
  const queue = [];
  let resolve = null;
  let done = false;
  let error = null;

  return {
    // 将数据压入队列，并激活等待消费的 Promise
    push: (data) => {
      queue.push(data);
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    // 标记队列写入完毕，通知消费者迭代结束
    finish: () => {
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    // 标记出错，中途强行中断迭代
    error: (e) => {
      error = e;
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    // 消费者调用的异步迭代器，可使用 for await (const item of queue.iterate()) 形式消费
    async *iterate() {
      const setResolve = (r) => {
        resolve = r;
      };
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift();
        } else if (!done) {
          await new Promise(setResolve); // 无数据时挂起等待 push 或 finish
        }
      }
      if (error) throw error;
    },
  };
};

/**
 * 从不同大语言模型流式响应的原始 JSON 结构中，精准提取当前文本增量 (Delta Content)
 * @param {Object} json 解析后的 SSE JSON 数据
 * @param {string} apiType API 引擎类型
 * @returns {string} 字符增量，无增量则返回空字符串 ""
 */
export function getStreamDelta(json, apiType) {
  switch (apiType) {
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_DEEPSEEK:
    case OPT_TRANS_OPENCODEGO:
    case OPT_TRANS_SILICONFLOW:
    case OPT_TRANS_XIAOMIMIMO:
    case OPT_TRANS_ALIYUNBAILIAN:
    case OPT_TRANS_CEREBRAS:
    case OPT_TRANS_ZAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_OLLAMA:
    case OPT_TRANS_EPHONEAI:
      // OpenAI 兼容协议的大模型 delta 提取逻辑
      return json.choices?.[0]?.delta?.content || "";
    case OPT_TRANS_GEMINI: {
      // 谷歌原生 Gemini API 的 delta 提取逻辑 (排除思维链思考过程)
      const parts = json.candidates?.[0]?.content?.parts;
      return (
        (Array.isArray(parts) ? parts.find((p) => !p.thought) : undefined)
          ?.text || ""
      );
    }
    case OPT_TRANS_CLAUDE:
      // Anthropic Claude 格式 delta 提取逻辑
      if (json.type === "content_block_delta") {
        return json.delta?.text || "";
      }
      return "";
    default:
      return "";
  }
}

/**
 * 核心逻辑：从流式响应的文本中（随着大模型源源不断输出），即时抽取出已匹配完成的网页翻译段落。
 * 兼容两种非 JSON 序列化的极速传输协议：XML 包裹协议与“管道符+换行”行协议。
 * @param {string} content 当前累计接收到的流式文本
 * @param {Set<number>} processedIds 已处理并上屏的段落 ID 集合 (用于去重，防重复上屏)
 * @yields {{ id: number, translation: [string, string] }} 解析出的段落 ID、译文及语种
 */
export function* parseStreamingSegments(content, processedIds) {
  if (!content) return;

  // 1. 尝试解析 XML 格式：<t id="0" sourceLanguage="en">译文</t>
  // XML/LINE 的具体字符串解析规则与非流式共用，流式层只负责 processedIds 去重和增量 yield。
  const xmlSegments = parseXmlTranslationSegments(content);
  if (xmlSegments.length > 0) {
    for (const { id, translation } of xmlSegments) {
      if (!processedIds.has(id)) {
        processedIds.add(id);
        yield { id, translation };
      }
    }
    return;
  }

  // 2. 尝试解析 Line 协议格式：ID | 译文文本
  // 流式累积文本的最后一行可能还没接收完整，因此必须只解析完整行。
  for (const { id, translation } of parseLineTranslationSegments(content, {
    requireCompleteLine: true,
  })) {
    if (!processedIds.has(id)) {
      processedIds.add(id);
      yield { id, translation };
    }
  }
}

/**
 * 创建大文本流式 JSON 解析器 (基于 @streamparser/json npm 库)
 * 允许在 JSON 尚未接收完整时，就将已写入的数组项逐项解析出来。
 * 兼容格式：
 * - {"translations": [{"id": 0, "text": "译文"}, ...]}
 * - [{"id": 0, "text": "译文"}, ...]
 * @returns {{ write: Generator, end: Function }}
 */
export function createStreamingJsonParser() {
  const pending = [];
  // 设置 JSON 抽取路径
  const parser = new JSONParser({
    paths: ["$.translations.*", "$.*"],
    keepStack: false,
  });

  // 当解析器提取出一个完整对象时触发
  parser.onValue = ({ value }) => {
    // JSON 增量解析仍由 @streamparser/json 负责，但单条对象字段归一化与非流式 JSON 共用。
    const segment = normalizeTranslationItem(value, NaN);
    if (segment) {
      pending.push(segment);
    }
  };

  parser.onError = () => {};

  return {
    /**
     * 向解析器中追加 delta 增量数据包，并 yield 当前能解析出的所有 JSON 段落对象
     * @param {string} delta
     */
    *write(delta) {
      try {
        parser.write(delta);
      } catch (e) {
        // 忽略流式解析中由残缺 JSON 导致的解析错误
      }
      while (pending.length > 0) {
        yield pending.shift();
      }
    },
    /**
     * 强行闭合流并清理资源
     */
    end() {
      try {
        parser.end();
      } catch (e) {
        // 忽略
      }
    },
  };
}

/**
 * 把字幕断句模型返回的索引结构映射成播放器可消费的字幕对象。
 *
 * @param {Object} item 模型已经输出完整的字幕句子对象。
 * @param {Array<Object>} events 当前请求中传给模型的原始字幕事件。
 * @returns {Object|null} 可渲染字幕；字段不完整时返回 null。
 */
const mapSubtitleItemToCue = (item, events = []) => {
  const s = Number(item?.s ?? item?.start_id);
  const e = Number(item?.e ?? item?.end_id);
  if (!Number.isInteger(s) || !Number.isInteger(e) || events.length === 0) {
    return null;
  }

  const startIdx = Math.max(0, Math.min(s, events.length - 1));
  const endIdx = Math.max(startIdx, Math.min(e, events.length - 1));
  return {
    start: events[startIdx].start,
    end: events[endIdx].end,
    text: String(item.o ?? item.original ?? ""),
    translation: String(item.t ?? item.translation ?? ""),
    _si: s,
    _ei: e,
  };
};

/**
 * 创建字幕断句专用的流式 JSON 解析器。
 *
 * 字幕断句必须等到一个完整 `{s,e,o,t}` 对象闭合后才能稳定映射时间轴，
 * 因此这里按对象边界增量抽取，而不是像网页段落翻译那样解析任意文本片段。
 *
 * @param {Array<Object>} events 当前字幕请求对应的原始事件列表。
 * @returns {{write: Function, end: Function}} 流式写入器，每次写入返回新完成的字幕句子数组。
 */
export function createStreamingSubtitleParser(events = []) {
  let buffer = "";
  let jsonStarted = false;
  let scanIndex = 0;
  const emittedKeys = new Set();

  /**
   * 从当前 buffer 中查找 JSON 正文的起点。
   *
   * 大模型偶尔会先输出 Markdown fence 或解释性文字；字幕流式解析只从第一个
   * JSON 数组/对象起点开始消费，前置噪声直接丢弃，避免污染对象边界扫描。
   */
  const trimToJsonStart = () => {
    if (jsonStarted) return;

    const start = buffer.search(/[[{]/);
    if (start === -1) {
      buffer = buffer.slice(-20);
      return;
    }

    buffer = buffer.slice(start);
    jsonStarted = true;
    scanIndex = 0;
  };

  /**
   * 扫描并取出当前 buffer 中已经完整闭合的 JSON 对象字符串。
   *
   * 这里保留未完成对象在 buffer 中，等待下一段 delta 补齐；这是字幕按句
   * 流式输出能安全工作的核心，不能在半个对象上尝试更新时间轴。
   */
  const extractCompletedObjects = () => {
    const objects = [];
    let depth = 0;
    let objectStart = -1;
    let inString = false;
    let escaped = false;
    let lastConsumedEnd = -1;

    for (let i = scanIndex; i < buffer.length; i++) {
      const ch = buffer[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        if (depth === 0) {
          objectStart = i;
        }
        depth += 1;
        continue;
      }

      if (ch === "}") {
        depth -= 1;
        if (depth === 0 && objectStart !== -1) {
          objects.push(buffer.slice(objectStart, i + 1));
          lastConsumedEnd = i + 1;
          objectStart = -1;
        }
      }
    }

    if (lastConsumedEnd !== -1) {
      buffer = buffer.slice(lastConsumedEnd);
      scanIndex = 0;
    } else {
      scanIndex = Math.max(0, objectStart);
    }

    return objects;
  };

  /**
   * 将对象字符串解析成字幕句子，并按 `s/e` 去重。
   *
   * @param {Array<string>} objectStrings 已闭合的 JSON 对象字符串列表。
   * @returns {Array<Object>} 新解析出的字幕句子数组。
   */
  const consumeObjects = (objectStrings) => {
    const subtitles = [];

    for (const objectString of objectStrings) {
      try {
        const item = JSON.parse(objectString);
        const subtitle = mapSubtitleItemToCue(item, events);
        if (!subtitle) continue;

        const key = `${subtitle._si}:${subtitle._ei}`;
        // 流式过程中模型可能重复输出同一对象，按时间轴索引去重避免重复插入字幕轨。
        if (emittedKeys.has(key)) continue;
        emittedKeys.add(key);
        subtitles.push(subtitle);
      } catch {
        // 单个对象解析失败时忽略，保留后续对象继续增量输出。
      }
    }

    return subtitles;
  };

  return {
    /**
     * 写入模型文本增量，并返回当前新完成的字幕句子。
     *
     * @param {string} delta 新到达的模型文本增量。
     * @returns {Array<Object>} 本次写入解析出的新增字幕。
     */
    write(delta = "") {
      buffer += delta;
      trimToJsonStart();
      if (!jsonStarted) return [];

      return consumeObjects(extractCompletedObjects());
    },
    /**
     * 流结束时再尝试消费一次缓冲区中已经闭合的对象。
     *
     * @returns {Array<Object>} 最终补解析出的字幕。
     */
    end() {
      trimToJsonStart();
      if (!jsonStarted) return [];

      return consumeObjects(extractCompletedObjects());
    },
  };
}

/**
 * 启发式检测大模型当前响应流的格式类型 (JSON / XML / 行协议)
 * 通过判断最先出现的格式特征符（“{” 或 “<t” 或 “ID|”）进行确认。
 * @param {string} content 首批累积的流内容
 * @returns {{ isJson: boolean, detected: boolean }} 是否是 JSON，以及是否判定成功
 */
export function detectStreamFormat(content) {
  const stripped = content.trim();

  // 查找各个特征标志符的索引
  const jsonStart = stripped.search(/[{[]/);
  const xmlStart = stripped.search(/<(t|item|seg)\s/i);
  const lineStart = stripped.search(/^\d+\s*\|/m);

  if (jsonStart === -1 && xmlStart === -1 && lineStart === -1) {
    return { isJson: false, detected: false };
  }

  // 找出索引值最小且有效（即最先出现）的格式特征
  const positions = [
    { type: "json", pos: jsonStart },
    { type: "xml", pos: xmlStart },
    { type: "line", pos: lineStart },
  ].filter((p) => p.pos !== -1);

  if (positions.length === 0) {
    return { isJson: false, detected: false };
  }

  const first = positions.reduce((a, b) => (a.pos < b.pos ? a : b));
  return { isJson: first.type === "json", detected: true };
}

/**
 * 创建实时打字机流解析器。
 * 跟踪段落边界，并不仅在段落闭合时输出，而是在大模型打字时实时输出包含
 * { id, partialText: '当前已输出的残缺译文', isComplete: '是否闭合' } 数组，
 * 从而在网页中渲染出极其高级的“边打字边翻译”的 Premium 打字机视觉体验。
 * @returns {{ write: Function, getFormat: Function, getBuffer: Function }}
 */
export function createRealtimeStreamParser() {
  let format = null; // 判定的流格式："xml" | "json" | "line" | null
  let buffer = "";

  // 辅助判定流格式
  const detect = (content) => {
    const stripped = content.trim();
    if (stripped.search(/[{[]/) !== -1) return "json";
    if (stripped.search(/<(t|item|seg)\s/i) !== -1) return "xml";
    if (stripped.search(/^\d+\s*\|/m) !== -1) return "line";
    return null;
  };

  // 实时增量解析 XML 标签内容
  const parseXml = (content) => {
    const results = [];
    // 1. 先匹配所有已完全闭合的 XML 节点
    const closedRegex =
      /<(t|item|seg)\s+id="(\d+)"(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = closedRegex.exec(content)) !== null) {
      const id = parseInt(match[2], 10);
      results.push({ id, partialText: match[3], isComplete: true });
    }
    // 2. 用正则剔除掉已闭合节点，寻找到最后一个处于“未闭合”状态的节点作为当前正在打字的段落
    let remaining = content;
    remaining = remaining.replace(
      /<(t|item|seg)\s+id="\d+"(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
      ""
    );
    const openRegex = /<(t|item|seg)\s+id="(\d+)"(?:\s[^>]*)?>([^]*)$/;
    const openMatch = remaining.match(openRegex);
    if (openMatch) {
      const id = parseInt(openMatch[2], 10);
      // 去除未写完的残缺闭合标签干扰
      const partialText = openMatch[3].replace(/<\/[^>]*$/, "");
      results.push({ id, partialText, isComplete: false });
    }
    return results;
  };

  // 实时解析行格式
  const parseLine = (content) => {
    const results = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const pipeMatch = trimmed.match(/^(\d+)\s*\|\s*(.*)/);
      if (pipeMatch) {
        const id = parseInt(pipeMatch[1], 10);
        const text = pipeMatch[2].trim().replace(/<br\s*\/?>/gi, "\n");
        const isComplete = i < lines.length - 1;
        results.push({ id, partialText: text, isComplete });
      }
    }
    return results;
  };

  return {
    write(delta) {
      buffer += delta;
      if (!format) {
        format = detect(buffer);
        if (!format) return [];
      }

      switch (format) {
        case "xml":
          return parseXml(buffer);
        case "line":
          return parseLine(buffer);
        case "json":
          return [];
        default:
          return [];
      }
    },
    getFormat() {
      return format;
    },
    getBuffer() {
      return buffer;
    },
  };
}
