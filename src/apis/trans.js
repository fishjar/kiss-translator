import queryString from "query-string";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_QWENMT,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_CUSTOMIZE,
  API_SPE_TYPES,
  INPUT_PLACE_FROM,
  INPUT_PLACE_TO,
  INPUT_PLACE_TEXT,
  INPUT_PLACE_KEY,
  INPUT_PLACE_MODEL,
  DEFAULT_USER_AGENT,
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
  defaultSystemPromptXml,
  defaultSystemPromptLines,
  INPUT_PLACE_SUMMARY,
  INPUT_PLACE_CONTEXT,
  GEMINI25_BUDGETS,
  THINKING_API_REGISTRY,
  isGeminiInteractionsUrl,
  normalizeGeminiModelName,
  normalizeThinkingSettings,
  BUILTIN_STONES,
} from "../config";
import { genDeeplFree } from "./deepl";
import { genBaidu } from "./baidu";
import { interpreter } from "../libs/interpreter";
import {
  parseJsonObj,
  extractJson,
  stripMarkdownCodeBlock,
  parseAITerms,
} from "../libs/utils";
import {
  decodeHTMLEntities,
  decodeHTMLTranslationText,
  encodeHTMLTranslationText,
} from "../libs/html";
import { parseCompleteTranslationSegments } from "../libs/aiResponseParser";
import {
  parseStreamingSegments,
  createStreamingJsonParser,
  createStreamingSubtitleParser,
  createRealtimeStreamParser,
  detectStreamFormat,
  getStreamDelta,
} from "../libs/stream";
import { createSubtitleIndexAligner } from "../libs/subtitleIndexAlign";
import { kissLog } from "../libs/log";
import { fetchData, fetchStream } from "../libs/fetch";
import { getMsgHistory } from "./history";
import { parseBilingualVtt } from "../subtitle/vtt";
import { getDocInfo } from "../libs/docInfo";
import {
  isLegacyIndexSubtitleItem,
  mapBoundaryItemToCue,
} from "../subtitle/subtitleBoundaryProtocol";

const keyMap = new Map();
const urlMap = new Map();

// 轮询key/url
// 轮询 Key / URL 负载均衡。
// 用于在配置了多个 API 密钥或自定义 URL 端点时，分摊频率并降低单 Key 被限流限额的风险。
const keyPick = (apiSlug, key = "", cacheMap) => {
  const keys = key
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return "";
  }

  // 从轮询缓存 cacheMap 中提取上一次使用的 Index，计算本次轮询的 Index 并写回缓存
  const preIndex = cacheMap.get(apiSlug) ?? -1;
  const curIndex = (preIndex + 1) % keys.length;
  cacheMap.set(apiSlug, curIndex);

  return keys[curIndex];
};

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

const genUserPrompt = ({
  nobatchUserPrompt,
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

  if (useBatchFetch) {
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

  const glossaryStr = Object.entries(glossary)
    .map(([term, definition]) => `- ${term}: ${definition}`)
    .join("\n");

  return String(nobatchUserPrompt || "")
    .replaceAll(INPUT_PLACE_TITLE, title)
    .replaceAll(INPUT_PLACE_DESCRIPTION, description)
    .replaceAll(INPUT_PLACE_SUMMARY, summary)
    .replaceAll(INPUT_PLACE_CONTEXT, context)
    .replaceAll(INPUT_PLACE_TONE, tone)
    .replaceAll(INPUT_PLACE_GLOSSARY, glossaryStr)
    .replaceAll(INPUT_PLACE_FROM, from)
    .replaceAll(INPUT_PLACE_TO, to)
    .replaceAll(INPUT_PLACE_FROM_LANG, fromLang)
    .replaceAll(INPUT_PLACE_TO_LANG, toLang)
    .replaceAll(INPUT_PLACE_TEXT, texts[0]);
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
const parseAIRes = (raw, useBatchFetch = true) => {
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
    return structuredSegments.map((segment) => segment.translation);
  }

  // 兜底策略：纯文本按行切割解析
  return content.split("\n").map((line) => {
    const text = decodeHTMLEntities(line.replace(/<br\s*\/?>/gi, "\n").trim());
    return [text, ""];
  });
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

const geminiText = (parts) =>
  Array.isArray(parts)
    ? parts
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("")
    : "";

const geminiInteractionText = (res) =>
  Array.isArray(res?.steps)
    ? res.steps
        .filter((step) => step?.type === "model_output")
        .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
        .filter((content) => content?.type === "text" && content.text)
        .map((content) => content.text)
        .join("")
    : "";

const geminiResponseText = (res) =>
  Array.isArray(res?.steps)
    ? geminiInteractionText(res)
    : geminiText(res?.candidates?.[0]?.content?.parts);

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

const siliconflowEffortMap = {
  max: 32768,
  high: 16384,
  medium: 8192,
  low: 4096,
  minimal: 2048,
};

/**
 * 将统一思考设置写入 DeepSeek 风格请求体。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @param {string|null} settings.thinkingEffort 最终思考强度。
 * @returns {void}
 */
const applyDeepSeekThinking = (body, { thinkingMode, thinkingEffort }) => {
  body.thinking = { type: thinkingMode };
  if (thinkingMode === "enabled" && thinkingEffort) {
    body.reasoning_effort = thinkingEffort;
  }
};

/**
 * 将统一思考模式写入布尔开关型接口。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @returns {void}
 */
const applyBooleanThinking = (body, { thinkingMode }) => {
  body.enable_thinking = thinkingMode === "enabled";
};

/**
 * 将统一思考设置写入硅基流动请求体。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @param {string|null} settings.thinkingEffort 最终思考强度。
 * @returns {void}
 */
const applySiliconFlowThinking = (body, { thinkingMode, thinkingEffort }) => {
  body.enable_thinking = thinkingMode === "enabled";
  if (thinkingMode === "enabled" && thinkingEffort) {
    body.thinking_budget = siliconflowEffortMap[thinkingEffort] || 8192;
  }
};

/**
 * 将统一思考强度写入 OpenAI 兼容请求体。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {string|null} settings.thinkingEffort 最终思考强度或关闭值。
 * @returns {void}
 */
const applyOpenAIThinking = (body, { thinkingEffort }) => {
  if (thinkingEffort !== null) body.reasoning_effort = thinkingEffort;
};

/**
 * 将统一思考设置写入 OpenRouter reasoning 对象。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @param {string|null} settings.thinkingEffort 最终思考强度或关闭值。
 * @returns {void}
 */
const applyOpenRouterThinking = (body, { thinkingMode, thinkingEffort }) => {
  if (thinkingMode === "enabled" && thinkingEffort === null) {
    body.reasoning = { enabled: true };
    return;
  }
  if (thinkingEffort !== null) body.reasoning = { effort: thinkingEffort };
};

/**
 * 将统一思考设置写入 Claude 原生请求体。
 * @param {Object} body 待修改的请求体。
 * @param {Object} settings 已规范化的思考设置。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @param {string|null} settings.thinkingEffort 最终思考强度。
 * @returns {void}
 */
const applyClaudeThinking = (body, { thinkingMode, thinkingEffort }) => {
  const usesMinimumEffort =
    thinkingMode === "disabled" && thinkingEffort !== null;
  body.thinking = {
    type:
      thinkingMode === "enabled" || usesMinimumEffort ? "adaptive" : "disabled",
  };
  if (thinkingEffort) body.output_config = { effort: thinkingEffort };
};

/**
 * 将 3.x 非 lite flash 模型不支持的 minimal 强度兜底降为 low。
 * 设置页按模型能力只提供支持的档位，但旧版本保存的配置或同步数据
 * 可能仍带着 minimal，直接发送会被整个请求以 400 拒绝 (#1048)。
 * @param {string} model 当前模型名称。
 * @param {string|number} effort 待处理的思考强度。
 * @returns {string|number} 处理后的强度。
 */
const clampGeminiEffort = (model, effort) => {
  if (effort !== "minimal" || typeof model !== "string") {
    return effort;
  }
  const normalizedModel = normalizeGeminiModelName(model);
  if (
    normalizedModel.startsWith("gemini-3") &&
    normalizedModel.includes("flash") &&
    !normalizedModel.includes("flash-lite")
  ) {
    return "low";
  }
  return effort;
};

/**
 * 按 Gemini 实际协议将统一思考设置写入对应请求层级。
 * @param {Object} body 待修改的 Gemini 请求体。
 * @param {Object} settings 已规范化的思考设置与请求上下文。
 * @param {string} settings.apiType Gemini 原生或 OpenAI 兼容接口类型。
 * @param {string} settings.url 实际请求地址。
 * @param {string} settings.model Gemini 模型名称。
 * @param {"enabled"|"disabled"} settings.thinkingMode 最终思考模式。
 * @param {string|number|null} settings.thinkingEffort 最终思考强度或预算。
 * @returns {void}
 */
const applyGeminiThinking = (
  body,
  { apiType, url, model, thinkingMode, thinkingEffort }
) => {
  // Gemini 的三种兼容协议字段位置不同，但共用同一份模式与强度解析结果。
  if (apiType === OPT_TRANS_GEMINI_2) {
    if (thinkingEffort !== null) body.reasoning_effort = thinkingEffort;
    return;
  }

  // null 表示配置阶段已经确认当前关闭方式无需发送思考强度字段。
  if (thinkingEffort === null) return;

  if (isGeminiInteractionsUrl(url)) {
    body.generation_config.thinking_level = clampGeminiEffort(
      model,
      thinkingEffort
    );
    return;
  }

  const normalizedModel = normalizeGeminiModelName(model);
  if (normalizedModel.startsWith("gemini-2.5-")) {
    const thinkingBudget =
      thinkingMode === "disabled" &&
      normalizedModel.startsWith("gemini-2.5-pro")
        ? 128
        : typeof thinkingEffort === "number"
          ? thinkingEffort
          : GEMINI25_BUDGETS[thinkingEffort];
    body.generationConfig.thinkingConfig = { thinkingBudget };
    return;
  }

  body.generationConfig.thinkingConfig = {
    thinkingLevel: clampGeminiEffort(model, thinkingEffort),
  };
};

const THINKING_ADAPTERS = {
  deepseek: applyDeepSeekThinking,
  boolean: applyBooleanThinking,
  siliconflow: applySiliconFlowThinking,
  openai: applyOpenAIThinking,
  openrouter: applyOpenRouterThinking,
  claude: applyClaudeThinking,
  gemini: applyGeminiThinking,
};

/**
 * 将配置阶段已经归一化的两个思考字段写入对应协议请求体。
 * @param {Object} body 待修改的请求体。
 * @param {Object} options 思考设置与接口上下文。
 * @param {string} options.apiType 翻译接口类型。
 * @param {string} [options.url] 实际请求地址。
 * @param {string} [options.model] 当前模型名称。
 * @param {"auto"|"enabled"|"disabled"} [options.thinkingMode] 用户选择的思考模式。
 * @param {string|number|null} [options.thinkingEffort] 已归一化的最终思考强度或关闭值。
 * @returns {void} 自动模式和能力未确认的设置不会修改请求体。
 */
const applyThinkingParameters = (body, options) => {
  const registration = THINKING_API_REGISTRY[options.apiType];
  if (
    !registration ||
    options.thinkingMode === "auto" ||
    options.thinkingEffort === "_default" ||
    options.thinkingEffort === undefined
  ) {
    return;
  }

  THINKING_ADAPTERS[registration.adapter]?.(body, options);
};

const genGoogle = ({ texts, from, to, url, key }) => {
  const params = queryString.stringify({
    client: "gtx",
    dt: "t",
    dj: 1,
    ie: "UTF-8",
    sl: from,
    tl: to,
    q: texts.join(" "),
  });
  url = `${url}?${params}`;
  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, headers, method: "GET" };
};

const genGoogle2 = ({ texts, from, to, url, key, textFormat = "text" }) => {
  const requestTexts =
    textFormat === "html" ? texts : texts.map(encodeHTMLTranslationText);
  const body = [[requestTexts, from, to], "wt_lib"];
  const headers = {
    "Content-Type": "application/json+protobuf",
    "X-Goog-API-Key": key,
  };

  return { url, body, headers };
};

const genGoogleCloud = ({ texts, from, to, url, key, textFormat = "text" }) => {
  const body = {
    q: texts,
    target: to,
    format: textFormat,
    ...(from !== "auto" && { source: from }),
  };
  const headers = {
    "Content-type": "application/json",
    "X-Goog-Api-Key": key,
  };

  return { url, body, headers };
};

const genYandex = ({ texts, from, to, url, key, folderId }) => {
  const body = {
    folderId,
    texts,
    targetLanguageCode: to,
    ...(from !== "auto" && { sourceLanguageCode: from }),
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Api-Key ${key}`,
  };

  return { url, body, headers };
};

const genYandexFree = ({ texts, from, to }) => {
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  const params = queryString.stringify({
    id: `${id}-0-0`,
    srv: "android",
    source_lang: from,
    target_lang: to,
    text: texts[0],
  });
  const url = `https://translate.yandex.net/api/v1/tr.json/translate?${params}`;

  return { url, method: "POST" };
};

const genMicrosoft = ({ texts, from, to }) => {
  // Edge 前端内部端点：无需鉴权，Body 为纯字符串数组；from 留空表示自动检测。
  const params = queryString.stringify({
    from: from || "",
    to,
    isEnterpriseClient: false,
  });
  const url = `https://edge.microsoft.com/translate/translatetext?${params}`;
  const headers = {
    "Content-type": "application/json",
  };

  return { url, body: texts, headers };
};

const genAzureAI = ({ texts, from, to, url, key, region }) => {
  const params = queryString.stringify({
    from,
    to,
  });
  url = url.endsWith("&") ? `${url}${params}` : `${url}&${params}`;
  const headers = {
    "Content-type": "application/json",
    "Ocp-Apim-Subscription-Key": key,
    "Ocp-Apim-Subscription-Region": region,
  };
  const body = texts.map((text) => ({ Text: text }));

  return { url, body, headers };
};

const genDeepl = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts,
    target_lang: to,
    source_lang: from,
    // split_sentences: "0",
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `DeepL-Auth-Key ${key}`,
  };

  return { url, body, headers };
};

const genDeeplX = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    target_lang: to,
    source_lang: from,
  };

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers };
};

const genTencent = ({ texts, from, to }) => {
  const body = {
    header: {
      fn: "auto_translation",
      client_key:
        "browser-chrome-110.0.0-Mac OS-df4bd4c5-a65d-44b2-a40f-42f34f3535f2-1677486696487",
    },
    type: "plain",
    model_category: "normal",
    source: {
      text_list: texts,
      lang: from,
    },
    target: {
      lang: to,
    },
  };

  const url = "https://transmart.qq.com/api/imt";
  const headers = {
    "Content-Type": "application/json",
    "user-agent": DEFAULT_USER_AGENT,
    referer: "https://transmart.qq.com/zh-CN/index",
  };

  return { url, body, headers };
};

const genVolcengine = ({ texts, from, to }) => {
  const body = {
    source_language: from,
    target_language: to,
    text: texts.join(" "),
  };

  const url = "https://translate.volcengine.com/crx/translate/v1";
  const headers = {
    "Content-type": "application/json",
  };

  return { url, body, headers };
};

const genOpenAI = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  apiType,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_completion_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`, // OpenAI
    // "api-key": key, // Azure OpenAI
  };

  return { url, body, headers, userMsg };
};

const getQwenMtDomains = (tone = "") => {
  const normalizedTone = String(tone).trim();
  if (!normalizedTone) return "";

  return BUILTIN_STONES.includes(normalizedTone)
    ? `Translate in a ${normalizedTone.toLowerCase()} style.`
    : normalizedTone;
};

const getQwenMtTerms = (glossary = {}, aiTerms = "") => {
  const mergedTerms = { ...glossary, ...parseAITerms(aiTerms) };
  return Object.entries(mergedTerms)
    .filter(([source]) => String(source).trim())
    .map(([source, target]) => {
      const normalizedTarget = String(target ?? "");
      return {
        source,
        target: normalizedTarget.trim() ? normalizedTarget : source,
      };
    });
};

const genQwenMt = ({
  url,
  key,
  model,
  texts,
  from,
  to,
  glossary,
  aiTerms,
  tone,
}) => {
  const translationOptions = {
    source_lang: from,
    target_lang: to,
  };
  const terms = getQwenMtTerms(glossary, aiTerms);
  const domains = getQwenMtDomains(tone);

  if (terms.length) translationOptions.terms = terms;
  if (domains) translationOptions.domains = domains;

  const userMsg = {
    role: "user",
    content: texts[0],
  };
  const body = {
    model,
    messages: [userMsg],
    translation_options: translationOptions,
  };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

const genGemini = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  apiType,
  thinkingMode,
  thinkingEffort,
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);

  // 官方 Interactions 与 generateContent 的请求体、上下文和流式事件均不同，必须按 URL 分流。
  if (isGeminiInteractionsUrl(url)) {
    const userMsg = {
      type: "user_input",
      content: [{ type: "text", text: userPrompt }],
    };
    const generationConfig = {
      max_output_tokens: maxTokens,
      temperature,
    };

    const body = {
      model,
      system_instruction: systemPrompt,
      input: [...hisMsgs, userMsg],
      stream: useStream,
      // Interactions 默认会在服务端保存会话；翻译历史由客户端维护，因此显式关闭存储。
      store: false,
      generation_config: generationConfig,
    };
    applyThinkingParameters(body, {
      apiType,
      url,
      model,
      thinkingMode,
      thinkingEffort,
    });
    const headers = {
      "Content-type": "application/json",
      "x-goog-api-key": key,
    };

    return { url, body, headers, userMsg };
  }

  // 自定义代理通常只实现 generateContent，不能随官方默认端点一起强制迁移协议。
  if (useStream) {
    url = url.replace(":generateContent", ":streamGenerateContent");
    url += (url.includes("?") ? "&" : "?") + "alt=sse";
  }

  const userMsg = { role: "user", parts: [{ text: userPrompt }] };

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...hisMsgs, userMsg],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  applyThinkingParameters(body, {
    apiType,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  Object.assign(body, {
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
  });
  const headers = {
    "Content-type": "application/json",
    "x-goog-api-key": key,
  };

  return { url, body, headers, userMsg };
};

const genGemini2 = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  apiType,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

const genClaude = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    system: systemPrompt,
    messages: [...hisMsgs, userMsg],
    temperature,
    max_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_CLAUDE,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "x-api-key": key,
  };

  return { url, body, headers, userMsg };
};

const genOpenRouter = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_OPENROUTER,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
    "X-OpenRouter-Title": "KISS Translator",
  };

  return { url, body, headers, userMsg };
};

const genOrcaRouter = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_completion_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_ORCAROUTER,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
    // 聚合网关的调用来源标识，便于在 OrcaRouter 控制台区分本扩展的用量
    "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
    "X-Title": "KISS Translator",
  };

  return { url, body, headers, userMsg };
};

const genOllama = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: userPrompt,
  };
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      ...hisMsgs,
      userMsg,
    ],
    temperature,
    max_tokens: maxTokens,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_OLLAMA,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });
  body.stream = useStream;

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers, userMsg };
};

const genCloudflareAI = ({ texts, from, to, url, key }) => {
  const body = {
    text: texts.join(" "),
    source_lang: from,
    target_lang: to,
  };

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

const genCustom = ({ texts, fromLang, toLang, url, key, useBatchFetch }) => {
  const body = useBatchFetch
    ? { texts, from: fromLang, to: toLang }
    : { text: texts[0], from: fromLang, to: toLang };
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers };
};

const genReqFuncs = {
  [OPT_TRANS_GOOGLE]: genGoogle,
  [OPT_TRANS_GOOGLE_2]: genGoogle2,
  [OPT_TRANS_GOOGLE_CLOUD]: genGoogleCloud,
  [OPT_TRANS_YANDEX]: genYandex,
  [OPT_TRANS_YANDEXFREE]: genYandexFree,
  [OPT_TRANS_MICROSOFT]: genMicrosoft,
  [OPT_TRANS_AZUREAI]: genAzureAI,
  [OPT_TRANS_DEEPL]: genDeepl,
  [OPT_TRANS_DEEPLFREE]: genDeeplFree,
  [OPT_TRANS_DEEPSEEK]: genOpenAI,
  [OPT_TRANS_OPENCODEGO]: genOpenAI,
  [OPT_TRANS_SILICONFLOW]: genOpenAI,
  [OPT_TRANS_XIAOMIMIMO]: genOpenAI,
  [OPT_TRANS_ALIYUNBAILIAN]: genOpenAI,
  [OPT_TRANS_QWENMT]: genQwenMt,
  [OPT_TRANS_CEREBRAS]: genOpenAI,
  [OPT_TRANS_ZAI]: genOpenAI,
  [OPT_TRANS_DEEPLX]: genDeeplX,
  [OPT_TRANS_EPHONEAI]: genOpenAI,
  [OPT_TRANS_BAIDU]: genBaidu,
  [OPT_TRANS_TENCENT]: genTencent,
  [OPT_TRANS_VOLCENGINE]: genVolcengine,
  [OPT_TRANS_OPENAI]: genOpenAI,
  [OPT_TRANS_GEMINI]: genGemini,
  [OPT_TRANS_GEMINI_2]: genGemini2,
  [OPT_TRANS_CLAUDE]: genClaude,
  [OPT_TRANS_CLOUDFLAREAI]: genCloudflareAI,
  [OPT_TRANS_OLLAMA]: genOllama,
  [OPT_TRANS_OPENROUTER]: genOpenRouter,
  [OPT_TRANS_ORCAROUTER]: genOrcaRouter,
  [OPT_TRANS_CUSTOMIZE]: genCustom,
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
  const {
    apiType,
    apiSlug,
    key,
    systemPrompt,
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

  if (API_SPE_TYPES.mulkeys.has(apiType)) {
    args.key = keyPick(apiSlug, key, keyMap);
  }

  if (apiType === OPT_TRANS_DEEPLX) {
    args.url = keyPick(apiSlug, args.url, urlMap);
  }

  if (API_SPE_TYPES.ai.has(apiType)) {
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
  if (customHeader?.trim()) {
    Object.assign(headers, parseJsonObj(customHeader));
  }
  if (customBody?.trim()) {
    Object.assign(body, parseJsonObj(customBody));
  }

  // 执行 request hook
  if (reqHook?.trim() && !events) {
    try {
      const req = {
        url,
        body,
        headers,
        userMsg,
        method,
      };
      interpreter.run(`exports.reqHook = ${reqHook}`);
      const hookResult = await interpreter.exports.reqHook(
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
    textFormat = "text",
  }
) => {
  // 执行 response hook
  if (resHook?.trim()) {
    try {
      interpreter.run(`exports.resHook = ${resHook}`);
      const hookResult = await interpreter.exports.resHook({
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

  let modelMsg = "";

  // todo: 根据结果抛出实际异常信息
  switch (apiType) {
    case OPT_TRANS_GOOGLE:
      return [[res?.sentences?.map((item) => item.trans).join(" "), res?.src]];
    case OPT_TRANS_GOOGLE_2:
      return res?.[0]?.map((_, i) => [
        textFormat === "text"
          ? decodeHTMLTranslationText(res?.[0]?.[i])
          : res?.[0]?.[i],
        res?.[1]?.[i],
      ]);
    case OPT_TRANS_GOOGLE_CLOUD:
      return res?.data?.translations?.map((item) => [
        textFormat === "text"
          ? decodeHTMLEntities(item.translatedText)
          : item.translatedText,
        item.detectedSourceLanguage,
      ]);
    case OPT_TRANS_YANDEX:
      return res?.translations?.map((item) => [
        item.text,
        item.detectedLanguageCode,
      ]);
    case OPT_TRANS_YANDEXFREE:
      return [[res?.text?.[0], res?.lang?.split("-")?.[0]]];
    case OPT_TRANS_MICROSOFT:
    case OPT_TRANS_AZUREAI:
      return res?.map((item) => [
        item.translations.map((item) => item.text).join(" "),
        item.detectedLanguage?.language,
      ]);
    case OPT_TRANS_DEEPL:
      return res?.translations?.map((item) => [
        item.text,
        item.detected_source_language,
      ]);
    case OPT_TRANS_DEEPLFREE:
      return [
        [
          res?.result?.texts?.map((item) => item.text).join(" "),
          res?.result?.lang,
        ],
      ];
    case OPT_TRANS_DEEPLX:
      return [[res?.data, res?.source_lang]];
    case OPT_TRANS_BAIDU:
      if (res.type === 1) {
        return [
          [
            Object.keys(JSON.parse(res.result).content[0].mean[0].cont)[0],
            res.from,
          ],
        ];
      } else if (res.type === 2) {
        return [[res.data.map((item) => item.dst).join(" "), res.from]];
      }
      break;
    case OPT_TRANS_TENCENT:
      return res?.auto_translation?.map((text) => [text, res?.src_lang]);
    case OPT_TRANS_VOLCENGINE:
      return [[res?.translation, res?.detected_language]];
    case OPT_TRANS_QWENMT: {
      const content = res?.choices?.[0]?.message?.content;
      return typeof content === "string" ? [[content]] : [];
    }
    case OPT_TRANS_EPHONEAI:
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
    case OPT_TRANS_ORCAROUTER:
      modelMsg = res?.choices?.[0]?.message;
      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(modelMsg?.content, useBatchFetch);
    case OPT_TRANS_GEMINI:
      if (history && Array.isArray(res?.steps)) {
        history.clear();
        history.add(...res.steps);
      } else {
        modelMsg = res?.candidates?.[0]?.content;
        if (history && userMsg && modelMsg) {
          history.add(userMsg, modelMsg);
        }
      }
      return parseAIRes(geminiResponseText(res), useBatchFetch);
    case OPT_TRANS_CLAUDE:
      modelMsg = { role: res?.role, content: res?.content?.text };
      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(res?.content?.[0]?.text ?? "", useBatchFetch);
    case OPT_TRANS_CLOUDFLAREAI:
      return [[res?.result?.translated_text]];
    case OPT_TRANS_OLLAMA:
      modelMsg = res?.choices?.[0]?.message;

      // const deepModels = thinkIgnore
      //   .split(",")
      //   .filter((model) => model?.trim());
      // if (deepModels.some((model) => res?.model?.startsWith(model))) {
      //   modelMsg?.content.replace(/<think>[\s\S]*<\/think>/i, "");
      // }

      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(modelMsg?.content, useBatchFetch);
    case OPT_TRANS_CUSTOMIZE:
      if (useBatchFetch) {
        return (res?.translations ?? res)?.map((item) => [item.text, item.src]);
      }
      return [[res.text, res.src || res.from]];
    default:
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
function parseDictRes(res, apiType) {
  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
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
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content || "";
    case OPT_TRANS_GEMINI:
      return geminiResponseText(res);
    case OPT_TRANS_CLAUDE:
      return res?.content?.[0]?.text || "";
    case OPT_TRANS_CUSTOMIZE:
      if (typeof res === "string") return res;
      return res?.text || res?.result || "";
    default:
  }

  throw new Error("parse dictionary result: apiType not matched", apiType);
}

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
export const handleDict = async ({
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
    API_SPE_TYPES.stream.has(apiType);
  if (!dictPrompt) {
    throw new Error("AI dictionary prompt is empty.");
  }

  // 词典请求本质上是单条文本解析，强制关闭批量模式，避免进入批量 JSON 解析分支。
  const requestApiSetting = {
    ...apiSetting,
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
          onStreamChunk({ markdown: fullContent });
        } catch (error) {
          if (error?.isAIStreamTerminal) throw error;
          // 忽略单个 SSE 数据帧解析失败，等待后续帧继续输出。
        }
      }

      const markdown = stripMarkdownCodeBlock(fullContent).trim();
      if (!markdown) {
        throw new Error("dictionary got empty content");
      }

      return markdown;
    } catch (err) {
      if (err?.name === "AbortError") {
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
export async function* handleTranslate(
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
  if (useContext && API_SPE_TYPES.context.has(apiType)) {
    history = getMsgHistory(apiSlug, contextSize);
    hisMsgs = history.getAll();
  }

  const enableStream =
    useStream &&
    API_SPE_TYPES.stream.has(apiType) &&
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

    for (let i = 0; i < result.length; i++) {
      yield { id: i, result: result[i] };
    }
  };

  const [input, init, userMsg] = await getRequest(enableStream);
  capture?.onRequest?.(input, init, userMsg);

  if (enableStream) {
    try {
      yield* handleTranslateStreamInternal(texts, input, init, {
        apiType,
        history,
        userMsg,
        useBatchFetch: apiSetting.useBatchFetch,
        usePool,
        fetchInterval,
        fetchLimit,
        httpTimeout,
        signal,
        streamRenderMode: apiSetting.streamRenderMode || "disabled",
      });
      return;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      kissLog("translate stream failed, fallback to non-stream", err);
    }

    const [fallbackInput, fallbackInit, fallbackUserMsg] =
      await getRequest(false);
    yield* runNonStream(fallbackInput, fallbackInit, fallbackUserMsg);
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

  // 最终再解析一次，捕获可能遗漏的段落
  const hasEmpty = results.some((r) => !r);
  if (hasEmpty) {
    const parsed = parseAIRes(fullContent, useBatchFetch);
    for (let i = 0; i < texts.length && i < parsed.length; i++) {
      if (!results[i]) {
        results[i] = parsed[i];
        yield { id: i, result: results[i] };
      }
    }
  }

  if (history && userMsg) {
    if (apiType === OPT_TRANS_GEMINI) {
      history.add(userMsg, {
        role: "model",
        parts: [{ text: fullContent }],
      });
    } else {
      history.add(userMsg, {
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
export const handleSubtitle = async ({
  events,
  from,
  to,
  apiSetting,
  docInfo,
  onSubtitleChunk,
  signal,
}) => {
  const { apiType, fetchInterval, fetchLimit, httpTimeout, useStream } =
    apiSetting;
  const enableStream =
    Boolean(onSubtitleChunk) && useStream && API_SPE_TYPES.stream.has(apiType);

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

    return handleSubtitle({
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

  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
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
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_OLLAMA:
      return parseSTRes(
        res?.choices?.[0]?.message?.content ?? "",
        events,
        from
      );
    case OPT_TRANS_GEMINI: {
      const { thinkingMode } = apiSetting;
      const thinkingWasOn =
        thinkingMode && thinkingMode !== "auto" && thinkingMode !== "disabled";

      // REVIEW: 本地 AI (Gemini Nano) 强大的降级容灾容错逻辑！
      // 字幕翻译时，如果开启了推理链 (Thinking)，可能会因推理产生大量额外 Token，
      // 触发 Gemini 发生 finishReason === "MAX_TOKENS" 的阶段性提前截断中止。
      // 遇到该截断限制时，此处自动将推理降到当前模型支持的最低等级并重新发送重试，
      // 尽量保留输出 token 以取得完整字幕。
      const outputWasTruncated = Array.isArray(res?.steps)
        ? res?.status === "incomplete" || res?.status === "budget_exceeded"
        : res?.candidates?.[0]?.finishReason === "MAX_TOKENS";
      if (outputWasTruncated && thinkingWasOn) {
        // 运行时只在实际发生截断重试时归一化一次关闭状态，普通请求不再解析模型能力。
        const retryThinkingSettings = normalizeThinkingSettings({
          ...apiSetting,
          thinkingMode: "disabled",
          thinkingEffort: "_default",
        });
        const [retryInput, retryInit] = await genTransReq({
          ...apiSetting,
          // Gemini 字幕重试同样需要完整 JSON/VTT 结果，避免把 SSE 当普通响应解析。
          useStream: false,
          ...retryThinkingSettings,
          events,
          from,
          to,
          fromLang: from,
          toLang: to,
          docInfo,
        });
        const retryRes = await fetchData(retryInput, retryInit, {
          useCache: false,
          usePool: true,
          fetchInterval,
          fetchLimit,
          httpTimeout,
        });
        const retryText = geminiResponseText(retryRes);
        if (retryText) {
          return parseSTRes(retryText, events, from);
        }
      }
      return parseSTRes(geminiResponseText(res), events, from);
    }
    case OPT_TRANS_CLAUDE:
      return parseSTRes(res?.content?.[0]?.text ?? "", events, from);
    case OPT_TRANS_CUSTOMIZE:
      return res;
    default:
  }

  return [];
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

export const handleSummarize = async ({
  title,
  description,
  transcript,
  apiSetting,
}) => {
  const { apiType, fetchInterval, fetchLimit, httpTimeout } = apiSetting;

  const userPrompt = [
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    `\nTranscript:\n${transcript}`,
  ]
    .filter(Boolean)
    .join("\n");

  const [input, init] = await genTransReq({
    ...apiSetting,
    // 字幕上下文总结需要一次性文本结果，不能继承段落翻译的流式输出设置。
    useStream: false,
    texts: [""],
    from: "auto",
    to: "en",
    fromLang: "auto",
    toLang: "en",
    useBatchFetch: false,
    nobatchPrompt: summarizeSystemPrompt,
    nobatchUserPrompt: userPrompt,
  });

  const res = await fetchData(input, init, {
    useCache: false,
    usePool: true,
    fetchInterval,
    fetchLimit,
    httpTimeout,
  });

  if (!res) return "";

  switch (apiType) {
    case OPT_TRANS_EPHONEAI:
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
    case OPT_TRANS_ORCAROUTER:
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content?.trim() || "";
    case OPT_TRANS_GEMINI:
      return geminiResponseText(res).trim() || "";
    case OPT_TRANS_CLAUDE:
      return res?.content?.[0]?.text?.trim() || "";
    case OPT_TRANS_CUSTOMIZE:
      if (typeof res === "string") return res.trim();
      return (
        res?.choices?.[0]?.message?.content?.trim() ||
        geminiText(res?.candidates?.[0]?.content?.parts).trim() ||
        res?.content?.[0]?.text?.trim() ||
        ""
      );
    default:
      return "";
  }
};
