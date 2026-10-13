import {
  parseNativeDictionaryResponse as parseDictRes,
  parseNativeSummaryResponse,
  parseNativeSubtitleResponse,
} from "../builtin-plugins/textResponses";
import { nativeResponseParsers } from "../builtin-plugins/responses";
import { getStreamDelta } from "../builtin-plugins/streamResponses";
import { getBuiltinServiceDefinition } from "../builtin-plugins/definitions";
import { buildSystemRoleMessages } from "../builtin-plugins/messages";
import { nativeRequestBuilders as genReqFuncs } from "../builtin-plugins/requests";

import {
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_GEMINI,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_LOCALAI,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO,
  INPUT_PLACE_TEXT,
  defaultSystemPrompt,
  defaultSubtitlePrompt,
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultDictUserPrompt,
  INPUT_PLACE_TONE,
  INPUT_PLACE_TITLE,
  INPUT_PLACE_DESCRIPTION,
  INPUT_PLACE_TO_LANG,
  INPUT_PLACE_FROM_LANG,
  INPUT_PLACE_GLOSSARY,
  INPUT_PLACE_SEGMENTS,
  defaultSystemPromptXml,
  defaultSystemPromptLines,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
  isGeminiInteractionsUrl,
  PROMPT_PROTOCOL_LINE,
  PROMPT_PROTOCOL_XML,
  PROMPT_PROTOCOL_JSON,
  MSG_LOCAL_AI_RPC,
  MSG_LOCAL_AI_CANCEL,
  MSG_BUILTINAI_SUMMARIZE,
} from "../config";
import { isExt } from "../libs/client";
import { isBg } from "../libs/browser";

import {
  callLegacyRequestHook,
  callLegacyResponseHook,
} from "../providers/legacyHooks";

import {
  parseJsonObj,
  extractJson,
  stripMarkdownCodeBlock,
  parseAITerms,
} from "../libs/utils";
import { decodeHTMLEntities } from "../libs/html";
import { parseCompleteTranslationSegments } from "../libs/aiResponseParser";
import {
  parseStreamingSegments,
  createStreamingJsonParser,
  createStreamingSubtitleParser,
  createRealtimeStreamParser,
  detectStreamFormat,
} from "../libs/stream";
import { createSubtitleIndexAligner } from "../libs/subtitleIndexAlign";
import { kissLog } from "../libs/log";
import { fetchData, fetchStream } from "../libs/fetch";
import { getMsgHistory } from "./history";
import { getOpenCodeSessionId } from "./opencode";
import { parseBilingualVtt } from "../subtitle/vtt";
import { getDocInfo } from "../libs/docInfo";
import { chromeSummarize } from "../libs/builtinAI";
import { sendBgMsg } from "../libs/msg";
import {
  isLegacyIndexSubtitleItem,
  mapBoundaryItemToCue,
} from "../subtitle/subtitleBoundaryProtocol";

import { selectNativeEndpoint } from "../builtin-plugins/credentials";

/**
 * 依据配置参数和当前页面元数据生成大模型 Prompt 系统指示。
 */
const genSystemPrompt = ({
  systemPrompt,
  tone,
  from,
  to,
  fromLang,
  toLang,
  texts,
  docInfo: { title = "", description = "", summary = "", context = "" } = {},
}) =>
  String(systemPrompt || "")
    .replaceAll(INPUT_PLACE_TITLE, title)
    .replaceAll(INPUT_PLACE_DESCRIPTION, description)
    .replaceAll(INPUT_PLACE_SUMMARY, summary)
    .replaceAll(INPUT_PLACE_CONTEXT, context)
    .replaceAll(INPUT_PLACE_TONE, tone)
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_FROM_LANG, fromLang)
    .replaceAll(INPUT_PLACE_TO_LANG, toLang)
    .replaceAll(INPUT_PLACE_TEXT, texts[0]);

// 构建 Hy-MT 官方范式的术语与语气前置约束块
const buildHyMtGlossaryBlock = (glossary) => {
  const entries = Object.entries(glossary || {});
  if (entries.length === 0) return "";
  return `Reference the following translations:\n${entries
    .map(([k, v]) => {
      const source = String(k ?? "").trim();
      const target = String(v ?? "").trim();
      return `${source} translates to ${target || source}`;
    })
    .join("\n")}`;
};

const buildHyMtToneBlock = (tone) => {
  const trimmed = String(tone || "").trim();
  if (!trimmed) return "";
  return `Note that the translation style must strictly conform to [${trimmed}].`;
};

// 构建独立上下文信息块
const buildTitleBlock = (title) => {
  const t = String(title || "").trim();
  return t ? `Title: ${t}` : "";
};

const buildDescriptionBlock = (description) => {
  const d = String(description || "").trim();
  return d ? `Description: ${d}` : "";
};

const buildSummaryBlock = (summary) => {
  const s = String(summary || "").trim();
  return s ? `Summary: ${s}` : "";
};

const buildContextBlock = (context) => {
  const c = String(context || "").trim();
  return c ? `Context: ${c}` : "";
};

// 智能替换块级占位符：独立成行时展开或彻底抹除，行内时普通替换
const renderBlockPlaceholder = (
  template,
  placeholder,
  blockContent,
  inlineContent = blockContent
) => {
  if (!template.includes(placeholder)) return template;
  const standaloneRegex = new RegExp(
    `^[ \\t]*${placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[ \\t]*(?:\\r?\\n|$)`,
    "gm"
  );
  if (blockContent && blockContent.trim()) {
    template = template.replace(standaloneRegex, `${blockContent.trim()}\n\n`);
  } else {
    template = template.replace(standaloneRegex, "");
  }
  return template.replaceAll(
    placeholder,
    inlineContent ? String(inlineContent).trim() : ""
  );
};

const genUserPrompt = ({
  nobatchUserPrompt,
  batchUserPrompt,
  batchProtocol = "line",
  useBatchFetch,
  tone,
  glossary = {}, // 规则中的AI专业术语
  aiTerms = "", // 接口中的AI专业术语
  from,
  to,
  fromLang,
  toLang,
  texts,
  docInfo: { title = "", description = "", summary = "", context = "" } = {},
}) => {
  // 合并规则与接口中的AI专业术语
  if (aiTerms) {
    const aiGlossary = parseAITerms(aiTerms);
    glossary = { ...glossary, ...aiGlossary };
  }

  const glossaryStr = Object.entries(glossary)
    .map(([term, definition]) => {
      const src = String(term ?? "").trim();
      const target = String(definition ?? "").trim();
      return `- ${src}: ${target || src}`;
    })
    .join("\n");

  if (useBatchFetch) {
    if (batchUserPrompt && batchUserPrompt.trim()) {
      let segmentsStr = "";
      if (batchProtocol === "xml") {
        segmentsStr = `<root>\n${texts
          .map((text, i) => `  <t id="${i}">${text}</t>`)
          .join("\n")}\n</root>`;
      } else if (batchProtocol === "json") {
        segmentsStr = JSON.stringify(texts.map((text, i) => ({ id: i, text })));
      } else {
        // 默认按 line 单行管道协议格式化，句子内部换行转义为 <br>
        segmentsStr = texts
          .map(
            (text, i) =>
              `${i} | ${String(text ?? "").replace(/\r?\n/g, "<br>")}`
          )
          .join("\n");
      }

      const glossaryBlock = buildHyMtGlossaryBlock(glossary);
      const toneBlock = buildHyMtToneBlock(tone);
      const titleBlock = buildTitleBlock(title);
      const descriptionBlock = buildDescriptionBlock(description);
      const summaryBlock = buildSummaryBlock(summary);
      const contextBlock = buildContextBlock(context);

      // 未显式声明占位符的非空术语和语气，参照 Hy-MT 范式自动前置注入（聚合场景丢弃上下文）
      const unreferencedConstraints = [];
      if (
        !batchUserPrompt.includes(INPUT_PLACE_GLOSSARY) &&
        Object.keys(glossary).length > 0
      ) {
        unreferencedConstraints.push(glossaryBlock);
      }
      if (
        !batchUserPrompt.includes(INPUT_PLACE_TONE) &&
        tone &&
        String(tone).trim()
      ) {
        unreferencedConstraints.push(toneBlock);
      }

      let compiled = String(batchUserPrompt);

      // 智能替换块级占位符（上下文各个独立字段、术语、语气）
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_TITLE,
        titleBlock,
        title
      );
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_DESCRIPTION,
        descriptionBlock,
        description
      );
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_SUMMARY,
        summaryBlock,
        summary
      );
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_CONTEXT,
        contextBlock,
        context
      );
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_GLOSSARY,
        glossaryBlock,
        glossaryStr
      );
      compiled = renderBlockPlaceholder(
        compiled,
        INPUT_PLACE_TONE,
        toneBlock,
        tone
      );

      // 替换其他常规文本占位符
      compiled = compiled
        .replaceAll(INPUT_PLACE_FROM, from)
        .replaceAll(INPUT_PLACE_TO, to)
        .replaceAll(INPUT_PLACE_FROM_LANG, fromLang)
        .replaceAll(INPUT_PLACE_TO_LANG, toLang);

      if (compiled.includes(INPUT_PLACE_SEGMENTS)) {
        compiled = compiled.replaceAll(INPUT_PLACE_SEGMENTS, segmentsStr);
      } else {
        // 遗漏占位符自动末尾追加兜底
        compiled = `${compiled.trim()}\n\n${segmentsStr}`;
      }

      if (unreferencedConstraints.length > 0) {
        compiled = `${unreferencedConstraints.join("\n\n")}\n\n${compiled.trim()}`;
      }

      return compiled.replace(/\n{3,}/g, "\n\n").trim();
    }

    const promptObj = {
      targetLanguage: toLang,
      segments: texts.map((text, i) => ({ id: i, text })),
    };

    title && (promptObj.title = title);
    description && (promptObj.description = description);

    Object.keys(glossary).length !== 0 && (promptObj.glossary = glossary);
    tone && (promptObj.tone = tone);

    return JSON.stringify(promptObj);
  }

  const glossaryBlock = buildHyMtGlossaryBlock(glossary);
  const toneBlock = buildHyMtToneBlock(tone);
  const titleBlock = buildTitleBlock(title);
  const descriptionBlock = buildDescriptionBlock(description);
  const summaryBlock = buildSummaryBlock(summary);
  const contextBlock = buildContextBlock(context);

  // 单句翻译：仅在有效翻译模板（包含待翻译文本占位符）或默认模板中前置注入未引用的术语和语气
  const unreferencedNobatchConstraints = [];
  const nobatchStr = String(nobatchUserPrompt || "");
  const isFullTranslatePrompt =
    nobatchStr.includes(INPUT_PLACE_TEXT) || !nobatchUserPrompt;

  if (isFullTranslatePrompt) {
    if (
      !nobatchStr.includes(INPUT_PLACE_GLOSSARY) &&
      Object.keys(glossary).length > 0
    ) {
      unreferencedNobatchConstraints.push(glossaryBlock);
    }
    if (!nobatchStr.includes(INPUT_PLACE_TONE) && tone && String(tone).trim()) {
      unreferencedNobatchConstraints.push(toneBlock);
    }
  }

  let compiled = String(nobatchUserPrompt || "");

  // 智能替换块级占位符（上下文各个独立字段、术语、语气）
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_TITLE,
    titleBlock,
    title
  );
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_DESCRIPTION,
    descriptionBlock,
    description
  );
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_SUMMARY,
    summaryBlock,
    summary
  );
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_CONTEXT,
    contextBlock,
    context
  );
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_GLOSSARY,
    glossaryBlock,
    glossaryStr
  );
  compiled = renderBlockPlaceholder(
    compiled,
    INPUT_PLACE_TONE,
    toneBlock,
    tone
  );

  compiled = compiled
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_FROM_LANG, fromLang)
    .replaceAll(INPUT_PLACE_TO_LANG, toLang)
    .replaceAll(INPUT_PLACE_TEXT, texts[0]);

  if (unreferencedNobatchConstraints.length > 0) {
    compiled = `${unreferencedNobatchConstraints.join("\n\n")}\n\n${compiled.trim()}`;
  }

  return compiled.replace(/\n{3,}/g, "\n\n").trim();
};

// 统一生成最终字幕系统提示词；缓存签名与实际请求必须复用同一结果。
export const buildSubtitleSystemPrompt = ({
  subtitlePrompt,
  tone,
  from,
  to,
  fromLang,
  toLang,
  docInfo: { title = "", description = "", summary = "" } = {},
  aiTerms = "",
}) => {
  const aiGlossary = parseAITerms(aiTerms);
  const glossaryStr = Object.entries(aiGlossary)
    .map(([term, definition]) => `- ${term}: ${definition}`)
    .join("\n");
  return String(subtitlePrompt || "")
    .replaceAll(INPUT_PLACE_TITLE, title)
    .replaceAll(INPUT_PLACE_DESCRIPTION, description)
    .replaceAll(INPUT_PLACE_SUMMARY, summary)
    .replaceAll(INPUT_PLACE_TONE, tone)
    .replaceAll(INPUT_PLACE_GLOSSARY, glossaryStr)
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_FROM_LANG, fromLang)
    .replaceAll(INPUT_PLACE_TO_LANG, toLang);
};

// 字幕用户消息保持为纯 JSON，避免只读上下文污染模型的边界编号。
const buildSubtitleUserPrompt = ({ formattedEvents }) =>
  JSON.stringify(formattedEvents);

/**
 * 强健的大模型翻译结果解析器 (AI Response Robust Parser)。
 * 完美解决大模型在翻译时常混杂的 Markdown、未闭合 JSON、XML、数字列表及无规换行文本的纠错与规避问题。
 * @param {string} raw 大模型返回的原始字符串内容
 * @param {boolean} useBatchFetch 是否为批量翻译模式
 * @returns {Array<[string, string]>} 解析后的双元组列表 [译文, 源语言检测结果]
 */
const parseAIRes = (raw, useBatchFetch = true, batchProtocol = "") => {
  if (!raw) {
    return [];
  }

  // 纯覆盖单段模式，直接包装返回
  if (!useBatchFetch) {
    return [[raw]];
  }

  // 剥离 Markdown 常用的 ```json...``` 代码块包裹
  let content = stripMarkdownCodeBlock(raw).trim();

  // JSON/XML/LINE 三种聚合格式统一交给共享字符串解析器处理。
  // 这里不再直接使用 DOMParser 解析 XML，避免浏览器 Trusted Types / DOMPurify
  // 清洗自定义标签后导致非流式路径拿不到 <t> 译文。
  const structuredSegments = parseCompleteTranslationSegments(content, {
    decodeText: decodeHTMLEntities,
  });
  if (structuredSegments.length > 0) {
    return structuredSegments;
  }

  // 若明确启用了现代聚合翻译协议（LINE/XML/JSON），必须解析出对应合法结构；
  // 面对模型拒答、解释或普通文本时严禁按行伪造 ID，直接返回空数组以触发回退
  if (
    batchProtocol === PROMPT_PROTOCOL_LINE ||
    batchProtocol === PROMPT_PROTOCOL_XML ||
    batchProtocol === PROMPT_PROTOCOL_JSON
  ) {
    return [];
  }

  // 兜底策略：仅对未声明协议的旧配置/自定义提示词，保留纯文本按行切割解析（按行号注入 id）
  return content.split("\n").map((line, i) => {
    const text = decodeHTMLEntities(line.replace(/<br\s*\/?>/gi, "\n").trim());
    return { id: i, translation: [text, ""] };
  });
};

/**
 * 校验并对齐批量翻译结果，防止漏段、重段、越界段导致的位移错位。
 * 支持两种输入形态：
 * 1. 结构化段落数组: [{ id: 0, translation: [text, src] }] 或 [{ id: 0, result: [text, src] }]
 * 2. 传统位置索引数组: [[text, src], ...]
 * @param {Array} items 解析出的翻译结果列表
 * @param {number} totalCount 预期的总段落数 (texts.length)
 * @returns {Array<{ id: number, result: [string, string] }>} 严格按合法 id 对齐的结果列表
 */
export const alignBatchTranslations = (items, totalCount) => {
  if (!Array.isArray(items) || items.length === 0 || totalCount <= 0) {
    return [];
  }

  const aligned = new Array(totalCount).fill(null);
  const seenIds = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;

    let id;
    let translation;

    if (typeof item === "object" && !Array.isArray(item) && "id" in item) {
      id = Number(item.id);
      translation = item.translation || item.result;
    } else if (Array.isArray(item)) {
      id = i;
      translation = item;
    } else {
      continue;
    }

    // 校验 ID 是否合法（必须是非负整数且在 [0, totalCount) 范围内）
    if (!Number.isInteger(id) || id < 0 || id >= totalCount) {
      continue; // 越界或非法 ID 予以丢弃，避免污染合法槽位
    }

    // 重复 ID 防御：仅保留首个到达的有效翻译
    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    aligned[id] = translation;
  }

  const results = [];
  for (let id = 0; id < totalCount; id++) {
    if (aligned[id]) {
      results.push({ id, result: aligned[id] });
    }
  }
  return results;
};

/** 依据时间差计算旧版字幕输入使用的停顿等级。 */
const getPauseLevel = (gapMs) => {
  if (!Number.isFinite(gapMs) || gapMs <= 300) return 0;
  if (gapMs <= 600) return 1;
  if (gapMs <= 1200) return 2;
  return 3;
};

/**
 * 根据提示词识别字幕断句协议，供请求格式、缓存和 Playground 共用。
 */
export const detectSubtitleProtocol = (prompt = "") => {
  const normalizedPrompt = String(prompt);
  if (/WEBVTT|MM:SS\.mmm|-->/i.test(normalizedPrompt)) return "vtt-legacy";
  if (/\{\s*["']?s["']?\s*:/.test(normalizedPrompt)) return "index-v1";

  // 自定义提示词明确描述旧 p 等级时继续发送原结构，避免静默破坏已有配置。
  const mentionsQuotedP = /["'`]p["'`]/i.test(normalizedPrompt);
  const mentionsPauseLevel = /pause\s+levels?|停顿等级|暫停等級/i.test(
    normalizedPrompt
  );
  if (mentionsQuotedP && mentionsPauseLevel) return "boundary-v2";
  return "boundary-v3";
};

/** 将播放器事件压缩成发送给 AI 的稳定索引 JSON 结构。 */
export const formatIndexSubtitleEvents = (events, prompt = "") => {
  const protocol = detectSubtitleProtocol(prompt);
  const usesLegacyPauseLevel =
    protocol === "boundary-v2" ||
    protocol === "index-v1" ||
    protocol === "vtt-legacy";

  return events.map((e, i) => {
    const item = { id: i, text: e.text };
    if (usesLegacyPauseLevel && i > 0) {
      const p = getPauseLevel(e.start - events[i - 1].end);
      if (p) item.p = p;
    } else if (!usesLegacyPauseLevel && i < events.length - 1) {
      // pauseMs 挂在停顿前的事件上，可直接作为该事件成为句末的边界提示。
      const pauseMs = Math.round(events[i + 1].start - e.end);
      if (pauseMs > 0) item.pauseMs = pauseMs;
    }
    return item;
  });
};

const usesIndexSubtitleInput = (prompt = "") => {
  // 只有明确声明 VTT 的旧提示词继续接收旧结构；其余字幕请求统一使用纯索引 JSON。
  return detectSubtitleProtocol(prompt) !== "vtt-legacy";
};

const parseIndexSubtitleRes = (raw, events, fromLang = "auto") => {
  // 对齐器只建一次词表：buildResult 在截断修复兜底时可能执行两次。
  const aligner = createSubtitleIndexAligner(events);
  const buildResult = (data) => {
    if (!Array.isArray(data) || !data.length) return null;
    const legacyItems = data.map(isLegacyIndexSubtitleItem);
    // 同一响应混用新旧协议会使游标语义不明确，直接交给尾部恢复逻辑处理。
    if (legacyItems.some(Boolean) && !legacyItems.every(Boolean)) return null;

    if (!legacyItems[0]) {
      const result = [];
      let nextIndex = 0;
      for (const item of data) {
        const cue = mapBoundaryItemToCue(item, events, nextIndex, fromLang);
        // 新协议一旦出现非法边界，停止接收后续对象，保留已验证的连续前缀。
        if (!cue) break;
        result.push(cue);
        nextIndex = cue._ei + 1;
      }
      return result.length ? result : null;
    }

    const result = [];
    for (const seg of data) {
      const s = Number(seg.s ?? seg.start_id);
      const e = Number(seg.e ?? seg.end_id);
      if (!Number.isInteger(s) || !Number.isInteger(e)) continue;
      const startIdx = Math.max(0, Math.min(s, events.length - 1));
      const endIdx = Math.max(startIdx, Math.min(e, events.length - 1));
      const text = String(seg.o ?? seg.original ?? "");
      const fixed = aligner.realign(s, e, text);
      result.push({
        start: events[fixed?.startIdx ?? startIdx].start,
        end: events[fixed?.endIdx ?? endIdx].end,
        text,
        translation: String(seg.t ?? seg.translation ?? ""),
        // _si/_ei 保留模型原始索引：去重键与尾句重试语义依赖它们。
        _si: s,
        _ei: e,
        // 仅在确实发生纠偏时记录覆盖索引，避免扩大普通结果的数据表面。
        ...(fixed && {
          _alignedSi: fixed.startIdx,
          _alignedEi: fixed.endIdx,
        }),
      });
    }
    return result.length ? result : null;
  };

  const stripped = stripMarkdownCodeBlock(String(raw ?? "")).trim();
  // AI 有时在 JSON 值以 >> 开头时丢掉冒号和引号: "o">> → "o":">>
  const repaired = stripped.replace(/"([a-z_]+)">>/g, '"$1":">>');

  try {
    return buildResult(JSON.parse(repaired));
  } catch {
    try {
      // 响应被截断时，从最后一个完整对象闭合处补上数组尾括号，保留可验证前缀。
      const arrayStart = repaired.indexOf("[");
      const lastObjectEnd = repaired.lastIndexOf("}");
      if (arrayStart < 0 || lastObjectEnd < arrayStart) return null;
      return buildResult(
        JSON.parse(repaired.slice(arrayStart, lastObjectEnd + 1) + "]")
      );
    } catch {
      return null;
    }
  }
};

const parseSTRes = (raw, events = null, fromLang = "auto") => {
  if (!raw) {
    return [];
  }

  if (events?.length) {
    const indexed = parseIndexSubtitleRes(raw, events, fromLang);
    if (indexed) return indexed;
  }

  try {
    const data = parseBilingualVtt(raw);
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    kissLog("parse AI Res: subtitle", err);
  }

  return [];
};

/**
 * 构建统一的 Fetch init 对象。
 * 对请求体和方法做健全处理。
 */
const genInit = ({
  url = "",
  body = null,
  headers = {},
  userMsg = null,
  method = "POST",
}) => {
  if (!url) {
    throw new Error("genInit: url is empty");
  }

  const init = {
    method,
    headers,
  };
  if (method !== "GET" && method !== "HEAD" && body) {
    let payload = JSON.stringify(body);
    const id = body?.params?.id;

    // REVIEW: 极其硬核的 WAF (网关指纹防火墙) 特征规避设计！
    // 很多公开的 JSON-RPC 翻译网关由于序列化格式完全一致，极易被 WAF 通过报文指纹拦截阻断。
    // 此处针对 body 中的随机 id 动态对方法字段进行了微小的空格格式抖动（在冒号前或后加入空格），
    // 能够破坏 WAF 的静态字符串指纹匹配，达到长期稳定抗封防盾的效果。
    if (id) {
      payload = payload.replace(
        'method":"',
        (id + 3) % 13 === 0 || (id + 5) % 29 === 0
          ? 'method" : "'
          : 'method": "'
      );
    }
    Object.assign(init, { body: payload });
  }

  return [url, init, userMsg];
};

/**
 * 构造翻译接口请求参数
 * @param {*}
 * @returns
 */
export const genTransReq = async ({ reqHook, ...args }) => {
  Object.assign(args, selectNativeEndpoint(args));
  const {
    apiType,
    apiSlug,
    systemPrompt,
    batchUserPrompt,
    batchProtocol,
    subtitlePrompt,
    // userPrompt,
    nobatchPrompt = defaultNobatchPrompt,
    nobatchUserPrompt = defaultNobatchUserPrompt,
    useBatchFetch,
    from,
    to,
    fromLang,
    toLang,
    texts,
    glossary,
    aiTerms,
    customHeader,
    customBody,
    events,
    tone,
    docInfo: externalDocInfo,
  } = args;

  if (args.vlmPrompt !== undefined) {
    args.systemPrompt = "";
    args.userPrompt = args.vlmPrompt;
  } else if (getBuiltinServiceDefinition(apiType)?.usesMessages) {
    const docInfo = externalDocInfo || getDocInfo();

    let baseSystemPrompt = events
      ? buildSubtitleSystemPrompt({
          subtitlePrompt,
          from,
          to,
          fromLang,
          toLang,
          texts,
          docInfo,
          tone,
          aiTerms,
        })
      : genSystemPrompt({
          systemPrompt: useBatchFetch ? systemPrompt : nobatchPrompt,
          from,
          to,
          fromLang,
          toLang,
          texts,
          docInfo,
          tone,
        });

    args.systemPrompt = baseSystemPrompt;
    args.userPrompt = events
      ? buildSubtitleUserPrompt({
          formattedEvents: usesIndexSubtitleInput(subtitlePrompt)
            ? formatIndexSubtitleEvents(events, subtitlePrompt)
            : events,
        })
      : genUserPrompt({
          nobatchUserPrompt,
          batchUserPrompt,
          batchProtocol,
          useBatchFetch,
          from,
          to,
          fromLang,
          toLang,
          texts,
          docInfo,
          tone,
          glossary,
          aiTerms,
        });
  }

  const {
    url = "",
    body = null,
    headers = {},
    userMsg = null,
    method = "POST",
  } = genReqFuncs[apiType](args);

  if (events && apiType === OPT_TRANS_GEMINI) {
    if (body?.generation_config) {
      body.response_format = {
        type: "text",
        mime_type: "application/json",
      };
    } else if (body?.generationConfig) {
      body.generationConfig.responseMimeType = "application/json";
    }
  }

  // 合并用户自定义headers和body
  if (apiType !== OPT_TRANS_LOCALAI && customHeader?.trim()) {
    Object.assign(headers, parseJsonObj(customHeader));
  }
  if (apiType !== OPT_TRANS_LOCALAI && customBody?.trim()) {
    Object.assign(body, parseJsonObj(customBody));
  }

  // OpenCode Go 要求稳定的会话 ID；同时覆盖不执行 hook 的字幕请求。
  // 自定义请求头大小写不敏感，保留用户显式配置的值。
  if (
    apiType === OPT_TRANS_OPENCODEGO &&
    !Object.keys(headers).some(
      (name) => name.toLowerCase() === "x-opencode-session"
    )
  ) {
    headers["x-opencode-session"] = getOpenCodeSessionId({ apiSlug, url });
  }

  // 执行 request hook
  if (apiType !== OPT_TRANS_LOCALAI && reqHook?.trim() && !events) {
    try {
      const req = {
        url,
        body,
        headers,
        userMsg,
        method,
      };
      const hookResult = await callLegacyRequestHook(
        reqHook,
        {
          ...args,
          defaultSystemPrompt,
          defaultSystemPromptXml,
          defaultSystemPromptLines,
          defaultSubtitlePrompt,
          defaultNobatchPrompt,
          defaultNobatchUserPrompt,
          req,
        },
        req
      );
      if (hookResult && hookResult.url) {
        return genInit(hookResult);
      }
    } catch (err) {
      kissLog("run req hook", err);
      throw new Error(`Request hook error: ${err.message}`);
    }
  }

  return genInit({ url, body, headers, userMsg, method });
};

/**
 * 解析翻译接口返回数据
 * @param {*} res
 * @param {*} param3
 * @returns
 */
export const parseTransRes = async (
  res,
  {
    texts,
    from,
    to,
    fromLang,
    toLang,
    langMap,
    resHook,
    // thinkIgnore,
    history,
    userMsg,
    apiType,
    useBatchFetch,
    batchProtocol,
    textFormat = "text",
  }
) => {
  // 执行 response hook
  if (apiType !== OPT_TRANS_LOCALAI && resHook?.trim()) {
    try {
      const hookResult = await callLegacyResponseHook(resHook, {
        apiType,
        userMsg,
        res,
        texts,
        from,
        to,
        fromLang,
        toLang,
        langMap,
        extractJson,
        parseAIRes,
      });
      if (hookResult && Array.isArray(hookResult.translations)) {
        if (history && userMsg && hookResult.modelMsg) {
          history.add(userMsg, hookResult.modelMsg);
        }
        return hookResult.translations;
      } else if (Array.isArray(hookResult)) {
        return hookResult;
      }
    } catch (err) {
      kissLog("run res hook", err);
      throw new Error(`Response hook error: ${err.message}`);
    }
  }

  const parser = nativeResponseParsers[apiType];
  if (parser) {
    const result = parser(
      res,
      {
        texts,
        from,
        to,
        fromLang,
        toLang,
        langMap,
        history,
        userMsg,
        apiType,
        useBatchFetch,
        batchProtocol,
        textFormat,
      },
      { parseAIRes, alignBatchTranslations }
    );
    if (result !== undefined) return result;
  }

  throw new Error("parse translate result: apiType not matched", apiType);
};

/**
 * 从各家 AI 接口响应中抽取 AI 词典正文。
 *
 * AI 词典使用 Markdown 原文展示，不走翻译结果的 JSON 行解析逻辑，
 * 因此这里只提取模型 message/content 文本并保留其格式。
 *
 * @param {*} res 接口原始响应
 * @param {string} apiType API 类型
 * @returns {string} 模型生成的 Markdown 内容
 */

/**
 * 发起 AI 词典请求并返回 Markdown 结果。
 *
 * 这里将词典提示词临时映射到非聚合翻译请求字段，
 * 以便复用 `genTransReq` 已经实现好的鉴权、模型参数、Hook 和流式协议适配。
 *
 * @param {Object} params 词典请求参数
 * @param {string} params.text 需要解析的文本
 * @param {string} params.from 已映射到当前接口规格的源语言名称
 * @param {string} params.to 已映射到当前接口规格的目标语言名称
 * @param {string} params.fromLang 源语言代码
 * @param {string} params.toLang 目标语言代码
 * @param {Object} params.apiSetting 当前 AI 接口配置
 * @param {Object} [params.docInfo] 页面标题、描述与摘要
 * @param {string} [params.context] 当前选区所在段落上下文
 * @param {Function} [params.onStreamChunk] 流式增量回调
 * @param {AbortSignal} [params.signal] 取消信号
 * @returns {Promise<string>} Markdown 格式的词典解析结果
 */
/** Scene entry selects a capability; compiled adapters call the native implementation below. */
export const handleDict = async (options) => {
  if (!options.apiSetting.provider) return handleNativeDict(options);
  const { invokeTextScene } = await import("../providers/sceneAdapter");
  return invokeTextScene(
    options.apiSetting,
    "dictionary",
    {
      text: options.text,
      sourceLanguage: options.fromLang,
      language: options.toLang,
      context: options.context || "",
      instructions: options.apiSetting.dictPrompt,
      userPrompt: options.apiSetting.dictUserPrompt,
    },
    {
      signal: options.signal,
      nativeOptions: options,
      onText:
        options.onStreamChunk &&
        ((markdown) => options.onStreamChunk({ markdown })),
    }
  );
};

export const handleNativeDict = async ({
  text,
  from,
  to,
  fromLang,
  toLang,
  apiSetting,
  docInfo,
  context = "",
  onStreamChunk,
  signal,
}) => {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  if (
    apiSetting.provider &&
    apiSetting.provider.implementation.kind !== "native"
  ) {
    const { invokeTextScene } = await import("../providers/sceneAdapter");
    return invokeTextScene(
      apiSetting,
      "dictionary",
      {
        text,
        sourceLanguage: fromLang,
        language: toLang,
        context,
        instructions: apiSetting.dictPrompt,
        userPrompt: apiSetting.dictUserPrompt,
      },
      {
        signal,
        onText: onStreamChunk && ((markdown) => onStreamChunk({ markdown })),
      }
    );
  }

  const {
    apiType,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    dictPrompt,
    dictUserPrompt,
  } = apiSetting;
  const enableStream =
    Boolean(onStreamChunk) &&
    apiSetting.useStream &&
    getBuiltinServiceDefinition(
      apiType
    )?.capabilities.dictionary?.outputModes.includes("stream");
  if (!dictPrompt) {
    throw new Error("AI dictionary prompt is empty.");
  }

  // 词典请求本质上是单条文本解析，强制关闭批量模式与翻译语气注入。
  const requestApiSetting = {
    ...apiSetting,
    tone: "",
    useBatchFetch: false,
    useStream: enableStream,
    nobatchPrompt: dictPrompt,
    nobatchUserPrompt: dictUserPrompt ?? defaultDictUserPrompt,
  };
  const dictDocInfo = docInfo || getDocInfo();

  // 将选区段落作为 docInfo.context 注入，使默认词典提示词中的 {{context}} 可被替换。
  const [input, init] = await genTransReq({
    ...requestApiSetting,
    texts: [text],
    from,
    to,
    fromLang,
    toLang,
    docInfo: {
      ...(dictDocInfo || {}),
      context,
    },
  });

  if (enableStream) {
    try {
      let fullContent = "";

      for await (const rawData of fetchStream(input, init, {
        useCache: false,
        usePool: true,
        fetchInterval,
        fetchLimit,
        httpTimeout,
        signal,
      })) {
        try {
          const json = JSON.parse(rawData);
          const delta = getStreamDelta(json, apiType);
          if (!delta) continue;

          fullContent += delta;
          // 流式模型可能先输出 Markdown 代码围栏，边流式展示边剥离可避免 UI 闪出 ```。
          fullContent = stripMarkdownCodeBlock(fullContent, true);
          await onStreamChunk({ markdown: fullContent });
        } catch (error) {
          if (error?.isAIStreamTerminal || error?.isProviderStreamError)
            throw error;
          // 忽略单个 SSE 数据帧解析失败，等待后续帧继续输出。
        }
      }

      const markdown = stripMarkdownCodeBlock(fullContent).trim();
      if (!markdown) {
        throw new Error("dictionary got empty content");
      }

      return markdown;
    } catch (err) {
      if (err?.name === "AbortError" || err?.isProviderStreamError) {
        throw err;
      }

      kissLog("dictionary stream failed, fallback to non-stream", err);
    }

    // 流式协议异常时自动降级为普通请求，保留 AI 词典功能可用性。
    const [fallbackInput, fallbackInit] = await genTransReq({
      ...requestApiSetting,
      useStream: false,
      texts: [text],
      from,
      to,
      fromLang,
      toLang,
      docInfo: {
        ...(dictDocInfo || {}),
        context,
      },
    });

    const fallbackRes = await fetchData(fallbackInput, fallbackInit, {
      useCache: false,
      usePool: true,
      fetchInterval,
      fetchLimit,
      httpTimeout,
      signal,
    });
    if (!fallbackRes) {
      throw new Error("dictionary got empty response");
    }

    const fallbackMarkdown = parseDictRes(fallbackRes, apiType);
    if (!fallbackMarkdown) {
      throw new Error("dictionary got empty content");
    }

    return fallbackMarkdown;
  }

  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    signal,
  });
  if (!res) {
    throw new Error("dictionary got empty response");
  }

  const markdown = parseDictRes(res, apiType);
  if (!markdown) {
    throw new Error("dictionary got empty content");
  }

  return markdown;
};

/**
 * 发送翻译请求并解析
 * 支持流式和非流式两种模式
 * @param {*} texts 待翻译文本数组
 * @param {*} options 翻译选项
 * @yields {{id: number, result: [string, string]}} 流式模式下逐个返回结果
 * @returns {Promise<Array>} 非流式模式下返回完整结果数组
 */
export async function* handleTranslate(texts, options) {
  if (!options.apiSetting.provider) {
    yield* handleNativeTranslate(texts, options);
    return;
  }
  const { translatePlugin } = await import("../providers/translationAdapter");
  yield* translatePlugin(texts, { ...options, nativeOptions: options });
}

export async function* handleNativeTranslate(
  texts = [],
  {
    from,
    to,
    fromLang,
    toLang,
    langMap,
    glossary,
    apiSetting,
    usePool,
    docInfo,
    textFormat = "text",
    signal,
    capture,
  }
) {
  if (signal?.aborted) return;

  if (
    apiSetting.provider &&
    apiSetting.provider.implementation.kind !== "native"
  ) {
    const { translatePlugin } = await import("../providers/translationAdapter");
    yield* translatePlugin(texts, {
      apiSetting,
      fromLang,
      toLang,
      glossary,
      signal,
      docInfo,
      textFormat,
    });
    return;
  }

  let history = null;
  let hisMsgs = [];
  const {
    apiType,
    apiSlug,
    contextSize,
    useContext,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    useStream,
  } = apiSetting;
  if (useContext && getBuiltinServiceDefinition(apiType)?.supportsContext) {
    const historyKey =
      apiType === OPT_TRANS_LOCALAI
        ? JSON.stringify([
            apiSlug,
            apiSetting.modelRef,
            apiSetting.device,
            fromLang,
            toLang,
            apiSetting.systemPrompt,
            apiSetting.nobatchPrompt,
            apiSetting.nobatchUserPrompt,
            apiSetting.batchUserPrompt,
            apiSetting.batchProtocol,
            apiSetting.tone,
            apiSetting.aiTerms,
            apiSetting.temperature,
            apiSetting.maxTokens,
            apiSetting.useBatchFetch,
            glossary,
            contextSize,
          ])
        : apiSlug;
    history = getMsgHistory(historyKey, contextSize);
    hisMsgs = history.getAll();
  }

  const enableStream =
    useStream !== false &&
    getBuiltinServiceDefinition(
      apiType
    )?.capabilities.translate?.outputModes.includes("stream") &&
    !(
      apiType === OPT_TRANS_GEMINI &&
      useContext &&
      isGeminiInteractionsUrl(apiSetting.url)
    );

  const getRequest = (requestUseStream) =>
    genTransReq({
      ...apiSetting,
      texts,
      from,
      to,
      fromLang,
      toLang,
      langMap,
      glossary,
      textFormat,
      hisMsgs,
      useStream: requestUseStream,
      docInfo,
    });

  const runNonStream = async function* (input, init, userMsg) {
    const response = await fetchData(input, init, {
      useCache: false,
      usePool,
      fetchInterval,
      fetchLimit,
      httpTimeout,
      signal,
    });
    if (!response) {
      throw new Error("translate got empty response");
    }
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    capture?.onResponse?.(response);

    const result = await parseTransRes(response, {
      texts,
      from,
      to,
      fromLang,
      toLang,
      langMap,
      history,
      userMsg,
      ...apiSetting,
      textFormat,
    });
    if (!result?.length) {
      throw new Error("translate got an unexpected result");
    }

    const aligned = alignBatchTranslations(result, texts.length);
    for (const chunk of aligned) {
      yield chunk;
    }
  };

  const [input, init, userMsg] = await getRequest(enableStream);
  capture?.onRequest?.(input, init, userMsg);

  if (enableStream) {
    const yieldedIds = new Set();
    try {
      for await (const chunk of handleTranslateStreamInternal(
        texts,
        input,
        init,
        {
          apiType,
          history,
          userMsg,
          useBatchFetch: apiSetting.useBatchFetch,
          batchProtocol: apiSetting.batchProtocol,
          usePool,
          fetchInterval,
          fetchLimit,
          httpTimeout,
          signal,
          streamRenderMode: apiSetting.streamRenderMode || "disabled",
        }
      )) {
        if (chunk?.result && chunk.id !== undefined) {
          yieldedIds.add(chunk.id);
        }
        yield chunk;
      }
      return;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      kissLog("translate stream failed, fallback to non-stream", err);
    }

    const [fallbackInput, fallbackInit, fallbackUserMsg] =
      await getRequest(false);
    for await (const chunk of runNonStream(
      fallbackInput,
      fallbackInit,
      fallbackUserMsg
    )) {
      if (chunk?.id !== undefined && yieldedIds.has(chunk.id)) {
        continue;
      }
      yield chunk;
    }
    return;
  }

  yield* runNonStream(input, init, userMsg);
}

/**
 * 内部流式翻译处理
 */
async function* handleTranslateStreamInternal(
  texts,
  input,
  init,
  {
    apiType,
    history,
    userMsg,
    useBatchFetch,
    batchProtocol,
    usePool,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    signal,
    streamRenderMode,
  }
) {
  const results = new Array(texts.length).fill(null);
  let fullContent = "";
  const processedIds = new Set();

  const jsonParser = createStreamingJsonParser();
  const realtimeParser =
    streamRenderMode === "realtime" ? createRealtimeStreamParser() : null;
  let isJsonFormat = false;
  let formatDetected = false;

  try {
    for await (const rawData of fetchStream(input, init, {
      useCache: false,
      usePool,
      fetchInterval,
      fetchLimit,
      httpTimeout,
      signal,
    })) {
      try {
        const json = JSON.parse(rawData);
        const delta = getStreamDelta(json, apiType);

        if (delta) {
          fullContent += delta;
          fullContent = stripMarkdownCodeBlock(fullContent, true);

          if (!useBatchFetch) {
            if (streamRenderMode === "realtime") {
              yield { id: 0, partialText: fullContent, isComplete: false };
            }
            continue;
          }

          // 中间态必须先于同一段的最终结果发出，避免较晚到达的 partial
          // 回调覆盖已经完成的译文。
          if (realtimeParser && streamRenderMode === "realtime") {
            const items = realtimeParser.write(delta);
            for (const { id, partialText, isComplete } of items) {
              if (!isComplete) {
                yield { id, partialText, isComplete: false };
              }
            }
          }

          if (!formatDetected) {
            const { isJson, detected } = detectStreamFormat(fullContent);
            if (detected) {
              formatDetected = true;
              isJsonFormat = isJson;
              // 格式检测成功后，将累积的内容写入解析器
              if (isJsonFormat) {
                for (const { id, translation } of jsonParser.write(
                  fullContent
                )) {
                  results[id] = translation;
                  yield { id, result: translation };
                }
              }
            }
          } else if (isJsonFormat) {
            for (const { id, translation } of jsonParser.write(delta)) {
              results[id] = translation;
              yield { id, result: translation };
            }
          } else {
            for (const { id, translation } of parseStreamingSegments(
              fullContent,
              processedIds
            )) {
              results[id] = translation;
              yield { id, result: translation };
            }
          }
        }
      } catch (e) {
        if (e?.isAIStreamTerminal) throw e;
        // 忽略解析错误
      }
    }

    if (isJsonFormat) {
      jsonParser.end();
    }
  } catch (error) {
    kissLog("handleTranslateStream error", error);
    throw error;
  }

  // 最终再解析一次，捕获可能遗漏的段落（严格按真实 ID 寻址，防止错位）
  const hasEmpty = results.some((r) => !r);
  const newlyYieldable = [];
  if (hasEmpty) {
    const parsed = parseAIRes(fullContent, useBatchFetch, batchProtocol);
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      let id;
      let translation;
      if (typeof item === "object" && !Array.isArray(item) && "id" in item) {
        id = Number(item.id);
        translation = item.translation || item.result;
      } else if (Array.isArray(item)) {
        id = i;
        translation = item;
      }
      if (
        typeof id === "number" &&
        Number.isInteger(id) &&
        id >= 0 &&
        id < texts.length &&
        !results[id] &&
        translation
      ) {
        results[id] = translation;
        newlyYieldable.push({ id, result: results[id] });
      }
    }
  }

  // 仅在聚合批量翻译（useBatchFetch === true）时，检查是否存在小模型遗漏的 ID
  // 若有缺失段落，在 yield 任何最终补偿结果前直接抛出异常，触发外层回退到非流式重试并补齐
  if (useBatchFetch) {
    const stillMissing = results.some((r) => !r);
    if (stillMissing) {
      const missingIds = results
        .map((r, i) => (r ? null : i))
        .filter((i) => i !== null);
      throw new Error(
        `Stream translation incomplete, missing ids: [${missingIds.join(", ")}]`
      );
    }
  }

  // 完整性校验通过后，才安全发出最终补充的段落
  for (const item of newlyYieldable) {
    yield item;
  }

  if (history && userMsg) {
    if (apiType === OPT_TRANS_GEMINI) {
      history.add(userMsg, {
        role: "model",
        parts: [{ text: fullContent }],
      });
    } else {
      // 流式非 Gemini 分支与非流式挂载点共用 addPair 守卫：空正文整对不写
      history.addPair(userMsg, {
        role: "assistant",
        content: fullContent,
      });
    }
  }
}

/**
 * 执行字幕断句与字幕翻译请求。
 *
 * @param {Object} params 字幕请求参数。
 * @param {Array<Object>} params.events 当前字幕分块内的原始事件列表。
 * @param {string} params.from 源语言代码。
 * @param {string} params.to 目标语言代码。
 * @param {Object} params.apiSetting 字幕断句所使用的 API 配置。
 * @param {Object} [params.docInfo] 页面标题、描述和 AI 摘要等上下文。
 * @param {Function} [params.onSubtitleChunk] 流式解析到完整字幕句子时触发的回调。
 * @param {AbortSignal} [params.signal] 调用方生命周期取消信号，会下传到 fetch/fetchStream。
 * @returns {Promise<Array<Object>>} 完整字幕句子数组。
 */
export const handleSubtitle = async (options) => {
  if (!options.apiSetting.provider) return handleNativeSubtitle(options);
  const { segmentPlugin } = await import("../providers/sceneAdapter");
  return segmentPlugin(options.events, {
    ...options,
    nativeOptions: options,
    instructions: options.apiSetting.subtitlePrompt,
    context: options.docInfo?.summary,
  });
};

export const handleNativeSubtitle = async ({
  events,
  from,
  to,
  apiSetting,
  docInfo,
  onSubtitleChunk,
  signal,
}) => {
  if (
    apiSetting.provider &&
    apiSetting.provider.implementation.kind !== "native"
  ) {
    const { segmentPlugin } = await import("../providers/sceneAdapter");
    return segmentPlugin(events, {
      apiSetting,
      from,
      to,
      signal,
      instructions: apiSetting.subtitlePrompt,
      context: docInfo?.summary,
    });
  }
  const { apiType, fetchInterval, fetchLimit, httpTimeout, useStream } =
    apiSetting;
  const enableStream =
    Boolean(onSubtitleChunk) &&
    useStream !== false &&
    getBuiltinServiceDefinition(apiType)?.supportsSubtitleCallbackStream;

  const [input, init] = await genTransReq({
    ...apiSetting,
    // 字幕流式只在调用方显式消费句子分块时开启，避免普通完整响应路径误把 SSE 当 JSON 解析。
    useStream: enableStream,
    events,
    from,
    to,
    fromLang: from,
    toLang: to,
    docInfo,
  });

  if (enableStream) {
    try {
      const subtitles = await handleSubtitleStreamInternal(input, init, {
        events,
        apiType,
        fetchInterval,
        fetchLimit,
        httpTimeout,
        fromLang: from,
        onSubtitleChunk,
        signal,
      });
      if (subtitles?.length) {
        return subtitles;
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      kissLog("subtitle stream failed, fallback to non-stream", err);
    }

    return handleNativeSubtitle({
      events,
      from,
      to,
      apiSetting: { ...apiSetting, useStream: false },
      docInfo,
      signal,
    });
  }

  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    signal,
  });
  if (!res) {
    kissLog("subtitle got empty response");
    return [];
  }

  return parseNativeSubtitleResponse(
    res,
    { apiSetting, events, from, to, docInfo, signal },
    { parseSTRes, genTransReq, fetchData }
  );
};

/**
 * 处理字幕断句的 SSE 流式响应。
 *
 * @param {string} input 请求地址。
 * @param {Object} init Fetch 初始化参数。
 * @param {Object} options 流式解析上下文。
 * @param {Array<Object>} options.events 当前字幕事件列表，用于把 s/e 索引映射回时间轴。
 * @param {string} options.apiType 翻译接口类型。
 * @param {number} options.fetchInterval 请求池间隔。
 * @param {number} options.fetchLimit 请求池并发限制。
 * @param {number} options.httpTimeout 请求超时时间。
 * @param {string} options.fromLang 源语言，用于按语言规则重建字幕原文。
 * @param {Function} options.onSubtitleChunk 新句子完成时触发的回调。
 * @param {AbortSignal} options.signal 取消信号。
 * @returns {Promise<Array<Object>>} 最终完整字幕数组。
 */
async function handleSubtitleStreamInternal(
  input,
  init,
  {
    events,
    apiType,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    fromLang,
    onSubtitleChunk,
    signal,
  }
) {
  const parser = createStreamingSubtitleParser(events, { fromLang });
  let fullContent = "";
  const emitted = [];
  const emittedKeys = new Set();

  const appendSubtitles = (subtitles, isFinal = false) => {
    const fresh = [];
    for (const subtitle of subtitles || []) {
      const key = `${subtitle._si}:${subtitle._ei}`;
      if (emittedKeys.has(key)) continue;
      emittedKeys.add(key);
      emitted.push(subtitle);
      fresh.push(subtitle);
    }

    if (fresh.length) {
      // 只有完整句子对象闭合后才上抛，避免半句字幕污染播放器时间轴。
      onSubtitleChunk({ subtitles: fresh, isFinal });
    }
  };

  for await (const rawData of fetchStream(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    signal,
  })) {
    if (signal?.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }

    try {
      const json = JSON.parse(rawData);
      const delta = getStreamDelta(json, apiType);
      if (!delta) continue;

      fullContent += delta;
      appendSubtitles(parser.write(delta), false);
    } catch (error) {
      if (error?.isAIStreamTerminal) throw error;
      // 单个 SSE 分片异常不终止整条字幕流，等待后续分片或最终兜底解析补齐。
    }
  }

  appendSubtitles(parser.end(), false);

  const finalSubtitles = parseSTRes(fullContent, events, fromLang);
  appendSubtitles(finalSubtitles, true);

  return finalSubtitles?.length
    ? finalSubtitles
    : emitted.sort((a, b) => a.start - b.start);
}

/**
 * 上下文摘要
 * @param {*} param0
 * @returns
 */
const summarizeSystemPrompt = `Analyze the video title, description, and transcript below. Produce a concise briefing (max 300 words) to help a subtitle translator understand the content accurately.

Cover these aspects:
1. Main topic, themes, and subject domain
2. Key terminology with brief definitions or context
3. Important proper nouns (people, organizations, products, places)
4. Speaker's tone and register
5. Abbreviations, jargon, or ambiguous terms needing consistent handling

Output plain text only. No markdown, no formatting, no headers.`;

export const handleSummarize = async (options) => {
  if (!options.apiSetting.provider) return handleNativeSummarize(options);
  const { invokeTextScene } = await import("../providers/sceneAdapter");
  return invokeTextScene(
    options.apiSetting,
    "summarize",
    {
      text: options.transcript,
      language: options.to || "zh-CN",
      instructions: options.prompt?.systemPrompt,
      userPrompt: options.prompt?.userPrompt,
      context: [options.title, options.description].filter(Boolean).join("\n"),
    },
    { signal: options.signal, nativeOptions: options }
  );
};

export const handleNativeSummarize = async ({
  title,
  description,
  transcript,
  apiSetting,
  prompt,
  to = "zh-CN",
  signal,
  cacheMode,
}) => {
  if (
    apiSetting.provider &&
    apiSetting.provider.implementation.kind !== "native"
  ) {
    const { invokeTextScene } = await import("../providers/sceneAdapter");
    return invokeTextScene(
      apiSetting,
      "summarize",
      {
        text: transcript,
        language: to,
        instructions: prompt?.systemPrompt,
        userPrompt: prompt?.userPrompt,
        context: [title, description].filter(Boolean).join("\n"),
      },
      { signal }
    );
  }
  const { apiType, fetchInterval, fetchLimit, httpTimeout } = apiSetting;

  // 1. Chrome 内置 AI (Summarizer API)
  if (apiType === OPT_TRANS_BUILTINAI) {
    const context = [title, description].filter(Boolean).join("\n");
    let summary = "";
    let err = "";

    if (isExt && !isBg()) {
      const res = await sendBgMsg(MSG_BUILTINAI_SUMMARIZE, {
        text: transcript,
        options: { context: context || undefined },
      });
      summary = res?.[0] || "";
      err = res?.[1] || "";
    } else {
      const [sum, error] = await chromeSummarize({
        text: transcript,
        options: { context: context || undefined },
      });
      summary = sum;
      err = error;
    }

    if (err) {
      kissLog("handleSummarize:builtinAI error", err);
      throw new Error(err);
    }
    return (summary || "").trim();
  }

  // 统一展开提示词模板，确保本地大模型与网络大模型均能正确支持自定义 userPrompt
  let userPrompt = prompt?.userPrompt;
  if (userPrompt) {
    userPrompt = userPrompt
      .replaceAll("{{title}}", title || "")
      .replaceAll("{{description}}", description || "")
      .replaceAll("{{transcript}}", transcript || "")
      .replaceAll(INPUT_PLACE_TO, to);
  } else {
    userPrompt = [
      title && `Title: ${title}`,
      description && `Description: ${description}`,
      `\nTranscript:\n${transcript}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const systemPrompt = (
    prompt?.systemPrompt || summarizeSystemPrompt
  ).replaceAll(INPUT_PLACE_TO, to);

  // 2. 本地大模型 (LocalAI)
  if (apiType === OPT_TRANS_LOCALAI) {
    const messages = [
      ...buildSystemRoleMessages(systemPrompt),
      { role: "user", content: userPrompt },
    ];
    const id = `local-summary-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cancel = () => {
      void sendBgMsg(MSG_LOCAL_AI_CANCEL, { id });
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await sendBgMsg(MSG_LOCAL_AI_RPC, {
        id,
        service: "llm",
        method: "chat",
        options: { cacheMode },
        payload: {
          modelRef: apiSetting.modelRef,
          ...(apiSetting.device
            ? { loadSpec: { device: apiSetting.device } }
            : {}),
          messages,
          maxTokens: apiSetting.maxTokens ?? 2048,
          ...(apiSetting.temperature !== undefined
            ? { temperature: apiSetting.temperature }
            : {}),
        },
      });
      if (typeof response === "string") return response.trim();
      return (response?.text || "").trim();
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  // 3. 网络大模型与自定义接口
  const [input, init] = await genTransReq({
    ...apiSetting,
    // 字幕上下文总结需要一次性文本结果，不能继承段落翻译的流式输出设置。
    useStream: false,
    texts: [""],
    from: "auto",
    to: to || "en",
    fromLang: "auto",
    toLang: to || "en",
    useBatchFetch: false,
    nobatchPrompt: systemPrompt,
    nobatchUserPrompt: userPrompt,
  });

  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
    signal,
  });

  if (!res) return "";

  return parseNativeSummaryResponse(res, apiType);
};
