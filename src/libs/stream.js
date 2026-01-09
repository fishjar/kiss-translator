import { JSONParser } from "@streamparser/json";
import {
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_CLAUDE,
} from "../config";
import { stripMarkdownCodeBlock } from "./utils";

/**
 * 创建 SSE 流解析器
 * 处理 buffer 管理和 SSE 格式解析，逐条 yield 解析出的数据
 * @returns {Function} 生成器函数，接收 chunk 逐条 yield data
 */
export const createSSEParser = () => {
  let buffer = "";

  return function* (chunk) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      yield data;
    }
  };
};

/**
 * 创建异步队列，用于在回调式 API 和异步生成器之间桥接
 * @returns {Object} 队列对象
 */
export const createAsyncQueue = () => {
  const queue = [];
  let resolve = null;
  let done = false;
  let error = null;

  return {
    push: (data) => {
      queue.push(data);
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    finish: () => {
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    error: (e) => {
      error = e;
      done = true;
      if (resolve) {
        resolve();
        resolve = null;
      }
    },
    async *iterate() {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift();
        } else if (!done) {
          await new Promise((r) => {
            resolve = r;
          });
        }
      }
      if (error) throw error;
    },
  };
};

/**
 * 从流式响应数据中提取 delta 内容
 * @param {Object} json 解析后的 SSE 数据
 * @param {string} apiType API 类型
 * @returns {string} delta 内容
 */
export function getStreamDelta(json, apiType) {
  switch (apiType) {
    case OPT_TRANS_OPENAI:
    case OPT_TRANS_GEMINI_2:
    case OPT_TRANS_OPENROUTER:
    case OPT_TRANS_OLLAMA:
      return json.choices?.[0]?.delta?.content || "";
    case OPT_TRANS_GEMINI:
      return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
    case OPT_TRANS_CLAUDE:
      if (json.type === "content_block_delta") {
        return json.delta?.text || "";
      }
      return "";
    default:
      return "";
  }
}

/**
 * 解析 SSE 流式响应中的段落（支持 XML、行格式）
 * @param {string} content 当前累积的内容
 * @param {Set} processedIds 已处理的 ID 集合
 * @yields {{ id, translation }} 解析出的段落
 */
export function* parseStreamingSegments(content, processedIds) {
  if (!content) return;

  // 尝试解析 XML 格式: <t id="0" sourceLanguage="en">翻译内容</t>
  const xmlRegex =
    /<(t|item|seg)\s+id="(\d+)"(?:\s+sourceLanguage="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let hasXml = false;
  while ((match = xmlRegex.exec(content)) !== null) {
    hasXml = true;
    const id = parseInt(match[2], 10);
    if (!processedIds.has(id)) {
      processedIds.add(id);
      const sourceLanguage = match[3] || "";
      const translation = [match[4].trim(), sourceLanguage];
      yield { id, translation };
    }
  }

  if (hasXml) return;

  // 尝试解析行格式: 0 | 翻译内容
  const endsWithNewline = content.endsWith("\n");
  const lines = content.split("\n");
  const linesToProcess = endsWithNewline ? lines : lines.slice(0, -1);

  for (const line of linesToProcess) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const pipeMatch = trimmedLine.match(/^(\d+)\s*\|\s*(.*)/);
    if (pipeMatch) {
      const id = parseInt(pipeMatch[1], 10);
      if (!processedIds.has(id)) {
        processedIds.add(id);
        const translation = [
          pipeMatch[2].trim().replace(/<br\s*\/?>/gi, "\n"),
          "",
        ];
        yield { id, translation };
      }
    }
  }
}

/**
 * 创建流式 JSON 解析器
 * 支持的 JSON 格式:
 * - { "translations": [{ "id": 0, "text": "翻译" }, ...] }
 * - [{ "id": 0, "text": "翻译" }, ...]
 * @returns {{ write: Generator, end: Function }}
 */
export function createStreamingJsonParser() {
  const pending = [];
  const parser = new JSONParser({
    paths: ["$.translations.*", "$.*"],
    keepStack: false,
  });

  parser.onValue = ({ value }) => {
    if (
      value &&
      typeof value === "object" &&
      typeof value.id === "number" &&
      (typeof value.text === "string" || typeof value.translation === "string")
    ) {
      const id = value.id;
      const translation = value.text || value.translation || "";
      const sourceLanguage = value.sourceLanguage || value.src || "";
      pending.push({ id, translation: [translation, sourceLanguage] });
    }
  };

  parser.onError = () => {};

  return {
    *write(delta) {
      try {
        parser.write(delta);
      } catch (e) {
        // 忽略解析错误
      }
      while (pending.length > 0) {
        yield pending.shift();
      }
    },
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
 * 检测流式内容的格式类型
 * @param {string} content 累积的内容
 * @returns {{ isJson: boolean, detected: boolean }}
 */
export function detectStreamFormat(content) {
  const stripped = content.trim();

  // 查找第一个有意义的格式标识符位置
  const jsonStart = stripped.search(/[{\[]/);
  const xmlStart = stripped.search(/<(t|item|seg)\s/i);
  const lineStart = stripped.search(/^\d+\s*\|/m);

  // 如果都没找到，无法确定格式
  if (jsonStart === -1 && xmlStart === -1 && lineStart === -1) {
    return { isJson: false, detected: false };
  }

  // 找出最先出现的格式
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
