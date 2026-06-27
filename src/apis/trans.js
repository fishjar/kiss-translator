import queryString from "query-string";
import {
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
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
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
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
  THINKING_PARAM_MAP,
} from "../config";
import { msAuth } from "../libs/auth";
import { genDeeplFree } from "./deepl";
import { genBaidu } from "./baidu";
import { interpreter } from "../libs/interpreter";
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
  getStreamDelta,
} from "../libs/stream";
import { kissLog } from "../libs/log";
import { fetchData, fetchStream } from "../libs/fetch";
import { getMsgHistory } from "./history";
import { parseBilingualVtt } from "../subtitle/vtt";
import { getDocInfo } from "../libs/docInfo";

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

const genSubtitlePrompt = ({
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

const normalizeSubtitleContext = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);

const buildSubtitleUserPrompt = ({
  formattedEvents,
  prevContext = "",
  nextContext = "",
}) => {
  const mainInput = JSON.stringify(formattedEvents);
  const prev = normalizeSubtitleContext(prevContext);
  const next = normalizeSubtitleContext(nextContext);
  if (!prev && !next) return mainInput;
  const sections = [];
  if (prev) {
    sections.push(
      `[Previous context (read-only, do NOT segment)]\n${JSON.stringify(prev)}`
    );
  }
  sections.push(`[Main input]\n${mainInput}`);
  if (next) {
    sections.push(
      `[Next context (read-only, do NOT segment)]\n${JSON.stringify(next)}`
    );
  }
  return sections.join("\n\n");
};

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

/**
 * 依据时间差计算字幕中发生的句子停顿断句等级。
 */
const getPauseLevel = (gapMs) => {
  if (!Number.isFinite(gapMs) || gapMs <= 300) return 0;
  if (gapMs <= 600) return 1;
  if (gapMs <= 1200) return 2;
  return 3;
};

const formatIndexSubtitleEvents = (events) =>
  events.map((e, i) => {
    const item = { id: i, text: e.text };
    if (i > 0) {
      const p = getPauseLevel(e.start - events[i - 1].end);
      if (p) item.p = p;
    }
    return item;
  });

const usesIndexSubtitleInput = (prompt = "") => {
  if (/\{\s*["']?s["']?\s*:/.test(prompt) && /\bid\b/i.test(prompt))
    return true;
  if (/WEBVTT|MM:SS\.mmm|-->/i.test(prompt)) return false;
  return false;
};

const geminiText = (parts) =>
  Array.isArray(parts)
    ? parts
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("")
    : "";

const parseIndexSubtitleRes = (raw, events) => {
  const buildResult = (data) => {
    if (!Array.isArray(data) || !data.length) return null;
    const result = [];
    for (const seg of data) {
      const s = Number(seg.s ?? seg.start_id);
      const e = Number(seg.e ?? seg.end_id);
      if (!Number.isInteger(s) || !Number.isInteger(e)) continue;
      const startIdx = Math.max(0, Math.min(s, events.length - 1));
      const endIdx = Math.max(startIdx, Math.min(e, events.length - 1));
      result.push({
        start: events[startIdx].start,
        end: events[endIdx].end,
        text: String(seg.o ?? seg.original ?? ""),
        translation: String(seg.t ?? seg.translation ?? ""),
        _si: s,
        _ei: e,
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
      const last = Math.max(
        repaired.lastIndexOf("},"),
        repaired.lastIndexOf("}\n"),
        repaired.lastIndexOf("}\r")
      );
      if (last < 0) return null;
      return buildResult(JSON.parse(repaired.slice(0, last + 1) + "]"));
    } catch {
      return null;
    }
  }
};

const parseSTRes = (raw, events = null) => {
  if (!raw) {
    return [];
  }

  if (events?.length) {
    const indexed = parseIndexSubtitleRes(raw, events);
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
 * 注入推理模式（Thinking）的专用控制参数。
 * 针对 DeepSeek, 阿里百炼, 硅基流动, Cerebras, OpenRouter 各大模型厂商繁杂的推理链配置参数进行统一映射注入。
 */
const injectThinking = (body, { apiType, thinkingMode, thinkingEffort }) => {
  if (thinkingMode === "auto") return; // 留空由模型网关自动决定

  const param = THINKING_PARAM_MAP[apiType];
  if (!param) return;

  const hasEffort = thinkingEffort && thinkingEffort !== "_default";

  switch (param.type) {
    case "deepseek":
      body.thinking = {
        type: thinkingMode === "enabled" ? "enabled" : "disabled",
      };
      if (thinkingMode === "enabled" && hasEffort) {
        body.reasoning_effort = thinkingEffort;
      }
      break;
    case "aliyunbailian":
      // 百炼仅支持 enable_thinking 布尔开关，不支持推理强度参数
      body.enable_thinking = thinkingMode === "enabled";
      break;
    case "siliconflow":
      body.enable_thinking = thinkingMode === "enabled";
      if (thinkingMode === "enabled" && hasEffort) {
        // 将抽象等级转换为硅基流动所支持的具体思考 tokens 额度
        body.thinking_budget = siliconflowEffortMap[thinkingEffort] || 8192;
      }
      break;
    case "cerebras":
      if (thinkingMode === "disabled") {
        body.reasoning_effort = "none";
      } else if (hasEffort) {
        body.reasoning_effort = thinkingEffort;
      }
      break;
    case "openai":
      if (thinkingMode === "disabled") {
        body.reasoning_effort = "none";
      } else if (thinkingMode === "enabled" && hasEffort) {
        body.reasoning_effort = thinkingEffort;
      }
      break;
    case "openrouter":
      if (hasEffort) {
        body.reasoning = { effort: thinkingEffort };
      }
      break;
    default:
      break;
  }
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

const genGoogle2 = ({ texts, from, to, url, key }) => {
  const body = [[texts, from, to], "wt_lib"];
  const headers = {
    "Content-Type": "application/json+protobuf",
    "X-Goog-API-Key": key,
  };

  return { url, body, headers };
};

const genMicrosoft = ({ texts, from, to, token }) => {
  const params = queryString.stringify({
    from,
    to,
    "api-version": "3.0",
  });
  const url = `https://api-edge.cognitive.microsofttranslator.com/translate?${params}`;
  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const body = texts.map((text) => ({ Text: text }));

  return { url, body, headers };
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

  injectThinking(body, { apiType, thinkingMode, thinkingEffort });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`, // OpenAI
    // "api-key": key, // Azure OpenAI
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
  thinkingMode,
  thinkingEffort,
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);

  // 流式传输使用 streamGenerateContent 端点
  if (useStream) {
    url = url.replace(":generateContent", ":streamGenerateContent");
    url += (url.includes("?") ? "&" : "?") + "alt=sse";
  }

  const userMsg = { role: "user", parts: [{ text: userPrompt }] };

  const body = {
    contents: [
      {
        role: "model",
        parts: [{ text: systemPrompt }],
      },
      ...hisMsgs,
      userMsg,
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  if (thinkingMode === "disabled") {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else if (thinkingMode && thinkingMode !== "auto") {
    if (thinkingEffort && thinkingEffort !== "_default") {
      body.generationConfig.thinkingConfig = { thinkingLevel: thinkingEffort };
    }
  }

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

  injectThinking(body, { apiType, thinkingMode, thinkingEffort });

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

  if (thinkingMode && thinkingMode !== "auto") {
    if (thinkingMode === "enabled") {
      body.thinking = { type: "adaptive" };
      if (thinkingEffort && thinkingEffort !== "_default") {
        body.output_config = { effort: thinkingEffort };
      }
    }
  }

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

  injectThinking(body, {
    apiType: OPT_TRANS_OPENROUTER,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
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

  injectThinking(body, {
    apiType: OPT_TRANS_OLLAMA,
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
  [OPT_TRANS_MICROSOFT]: genMicrosoft,
  [OPT_TRANS_AZUREAI]: genAzureAI,
  [OPT_TRANS_DEEPL]: genDeepl,
  [OPT_TRANS_DEEPLFREE]: genDeeplFree,
  [OPT_TRANS_DEEPSEEK]: genOpenAI,
  [OPT_TRANS_OPENCODEGO]: genOpenAI,
  [OPT_TRANS_SILICONFLOW]: genOpenAI,
  [OPT_TRANS_XIAOMIMIMO]: genOpenAI,
  [OPT_TRANS_ALIYUNBAILIAN]: genOpenAI,
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
    prevContext,
    nextContext,
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
      ? genSubtitlePrompt({
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
            ? formatIndexSubtitleEvents(events)
            : events,
          prevContext,
          nextContext,
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

  if (events && apiType === OPT_TRANS_GEMINI && body?.generationConfig) {
    body.generationConfig.responseMimeType = "application/json";
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
      return res?.[0]?.map((_, i) => [res?.[0]?.[i], res?.[1]?.[i]]);
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
      modelMsg = res?.choices?.[0]?.message;
      if (history && userMsg && modelMsg) {
        history.add(userMsg, {
          role: modelMsg.role,
          content: modelMsg.content,
        });
      }
      return parseAIRes(modelMsg?.content, useBatchFetch);
    case OPT_TRANS_GEMINI:
      modelMsg = res?.candidates?.[0]?.content;
      if (history && userMsg && modelMsg) {
        history.add(userMsg, modelMsg);
      }
      return parseAIRes(geminiText(modelMsg?.parts), useBatchFetch);
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
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content || "";
    case OPT_TRANS_GEMINI:
      return geminiText(res?.candidates?.[0]?.content?.parts);
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
        } catch {
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
    signal,
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

  const enableStream = useStream && API_SPE_TYPES.stream.has(apiType);

  let token = "";
  if (apiType === OPT_TRANS_MICROSOFT) {
    token = await msAuth();
    if (!token) {
      throw new Error("got msauth error");
    }
  }

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
      hisMsgs,
      token,
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
    });
    if (!result?.length) {
      throw new Error("translate got an unexpected result");
    }

    for (let i = 0; i < result.length; i++) {
      yield { id: i, result: result[i] };
    }
  };

  const [input, init, userMsg] = await getRequest(enableStream);

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
          // 实时渲染模式：yield 段落级中间态
          if (realtimeParser && streamRenderMode === "realtime") {
            const items = realtimeParser.write(delta);
            for (const { id, partialText, isComplete } of items) {
              if (!isComplete) {
                yield { id, partialText, isComplete: false };
              }
            }
          }
        }
      } catch (e) {
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
 * Microsoft语言识别聚合及解析
 * @param {*} texts
 * @returns
 */
export const handleMicrosoftLangdetect = async (texts = []) => {
  const token = await msAuth();
  const input =
    "https://api-edge.cognitive.microsofttranslator.com/detect?api-version=3.0";
  const init = {
    headers: {
      "Content-type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    method: "POST",
    body: JSON.stringify(texts.map((text) => ({ Text: text }))),
  };

  const res = await fetchData(input, init, {
    useCache: false,
  });

  if (Array.isArray(res)) {
    return res.map((r) => r.language);
  }

  return [];
};

/**
 * 执行字幕断句与字幕翻译请求。
 *
 * @param {Object} params 字幕请求参数。
 * @param {Array<Object>} params.events 当前字幕分块内的原始事件列表。
 * @param {string} params.from 源语言代码。
 * @param {string} params.to 目标语言代码。
 * @param {Object} params.apiSetting 字幕断句所使用的 API 配置。
 * @param {Object} [params.docInfo] 页面标题、描述和 AI 摘要等上下文。
 * @param {string} [params.prevContext] 前一个字幕分块的只读上下文。
 * @param {string} [params.nextContext] 后一个字幕分块的只读上下文。
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
  prevContext = "",
  nextContext = "",
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
    docInfo,
    prevContext,
    nextContext,
  });

  if (enableStream) {
    try {
      const subtitles = await handleSubtitleStreamInternal(input, init, {
        events,
        apiType,
        fetchInterval,
        fetchLimit,
        httpTimeout,
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
      prevContext,
      nextContext,
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
    case OPT_TRANS_OLLAMA:
      return parseSTRes(res?.choices?.[0]?.message?.content ?? "", events);
    case OPT_TRANS_GEMINI: {
      const candidate = res?.candidates?.[0];
      const { thinkingMode } = apiSetting;
      const thinkingWasOn =
        thinkingMode && thinkingMode !== "auto" && thinkingMode !== "disabled";

      // REVIEW: 本地 AI (Gemini Nano) 强大的降级容灾容错逻辑！
      // 字幕翻译时，如果开启了推理链 (Thinking)，可能会因推理产生大量额外 Token，
      // 触发 Gemini 发生 finishReason === "MAX_TOKENS" 的阶段性提前截断中止。
      // 遇到该截断限制时，此处自动关闭推理（thinkingMode = "disabled"）并重新发送重试，
      // 降级以取得无损字幕。该设计能够极大增强在复杂字幕网页下的长句稳定性。
      if (candidate?.finishReason === "MAX_TOKENS" && thinkingWasOn) {
        const [retryInput, retryInit] = await genTransReq({
          ...apiSetting,
          // Gemini 字幕重试同样需要完整 JSON/VTT 结果，避免把 SSE 当普通响应解析。
          useStream: false,
          thinkingMode: "disabled",
          events,
          from,
          to,
          docInfo,
          prevContext,
          nextContext,
        });
        const retryRes = await fetchData(retryInput, retryInit, {
          useCache: false,
          usePool: true,
          fetchInterval,
          fetchLimit,
          httpTimeout,
        });
        if (retryRes?.candidates?.[0]?.content?.parts) {
          return parseSTRes(
            geminiText(retryRes.candidates[0].content.parts),
            events
          );
        }
      }
      return parseSTRes(geminiText(candidate?.content?.parts), events);
    }
    case OPT_TRANS_CLAUDE:
      return parseSTRes(res?.content?.[0]?.text ?? "", events);
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
    onSubtitleChunk,
    signal,
  }
) {
  const parser = createStreamingSubtitleParser(events);
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
    } catch {
      // 单个 SSE 分片异常不终止整条字幕流，等待后续分片或最终兜底解析补齐。
    }
  }

  appendSubtitles(parser.end(), false);

  const finalSubtitles = parseSTRes(fullContent, events);
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
    case OPT_TRANS_OLLAMA:
      return res?.choices?.[0]?.message?.content?.trim() || "";
    case OPT_TRANS_GEMINI:
      return geminiText(res?.candidates?.[0]?.content?.parts).trim() || "";
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
