import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import FormHelperText from "@mui/material/FormHelperText";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme, alpha } from "@mui/material/styles";
import Check from "@mui/icons-material/Check";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Close from "@mui/icons-material/Close";
import Cancel from "@mui/icons-material/Cancel";
import Warning from "@mui/icons-material/Warning";
import RemoveCircle from "@mui/icons-material/RemoveCircle";
import Remove from "@mui/icons-material/Remove";
import HelpOutline from "@mui/icons-material/HelpOutline";
import DataObjectIcon from "@mui/icons-material/DataObject";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import SubjectIcon from "@mui/icons-material/Subject";
import {
  API_SPE_TYPES,
  BUILTIN_PLACEHOLDERS,
  DEFAULT_TRANBOX_SETTING,
  GLOBAL_KEY,
  OPT_LANGS_MAP,
  OPT_LANGS_TO_REVERSED as OPT_LANGS_TO,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_QWENMT,
  defaultSystemPrompt,
  defaultSystemPromptXml,
  defaultSystemPromptLines,
  defaultNobatchUserPrompt,
} from "../../config";
import { apiTranslate } from "../../apis";
import { useAlert } from "../../hooks/Alert";
import { useI18n } from "../../hooks/I18n";
import { useRules } from "../../hooks/Rules";
import { useSetting } from "../../hooks/Setting";
import { isWeb } from "../../libs/client";
import { logger } from "../../libs/log";
import { matchRule } from "../../libs/rules";
import { debounce } from "../../libs/utils";
import { parseAITerms } from "../../libs/utils";
import {
  FATAL_DIAGNOSTIC_TYPES,
  applyNaiveReplace,
  applyTermReplace,
  parseTerms,
} from "../../libs/terms";
import {
  assertTermReplacements,
  detectTermConflicts,
  generateTermTestText,
  getDiagnosticSampleTerms,
  joinIntoParagraph,
  selectDisplayedResults,
} from "../../libs/termTestUtils";

// 占位符格式由 apiSetting.placeholder 配置决定，默认取内置第一项 "{ }" → 生成 {1}、{2}…
const [PLACEHOLDER_START, PLACEHOLDER_END] = BUILTIN_PLACEHOLDERS[0].split(" ");

// 接口条目的运行时必需默认字段（2026-08-20 根因修复）。
// 生产引擎的 #apiSetting 直接从 transApis 条目读取，不做默认字段合并
// （translator.js #apiSetting: #apisMap.get(apiSlug) || DEFAULT_API_SETTING）。
// 缺 placeholder 会让 #placeholderConfig 的 placeholder.split(" ") 抛 TypeError，
// 整页翻译在发请求前就失败。真实扩展条目由设置页基于 defaultApi 构建；
// Playground 做真实 AI 测试前，必须在所有读取点补齐这些字段，否则必然复现同一崩溃。
const API_RUNTIME_DEFAULTS = {
  placeholder: "{ }", // BUILTIN_PLACEHOLDERS[0]
  placetag: "i", // BUILTIN_PLACETAGS[0]
  placetagFormat: "compact",
  rootMargin: 2000, // defaultApi.rootMargin
  transAllnow: false, // defaultApi.transAllnow
  batchPromptSlug: "batch-translation-json",
  subtitlePromptSlug: "subtitle-segmentation",
  dictPromptSlug: "dictionary-en-zh",
  nobatchPromptSlug: "nobatch-translation",
  useBatchFetch: false,
  useStream: false,
  streamRenderMode: "disabled",
  fetchLimit: 5,
  fetchInterval: 1500,
  httpTimeout: 10000,
  batchInterval: 0,
  batchSize: 100,
  batchLength: 4000,
  batchConcurrency: 1,
};

/** 为单条接口配置补齐运行时必需默认字段（与真实引擎测试台 harness 的补齐一致）。 */
const fillApiDefaults = (api) => ({ ...API_RUNTIME_DEFAULTS, ...api });

// 冲突矩阵 4 类固定演示用例（8 个术语，4 组独立冲突对，覆盖全部四类矩阵）。
// 从 termTestUtils 获取，确保与单元测试共用同一套 fixture。
const CONFLICT_MATRIX_SAMPLE = getDiagnosticSampleTerms();

// 与翻译器 #serializeForTranslation 的空译文语义一致：无译文时保留原文。
const REPLACER = (term, fullMatch) => term.value || fullMatch;

// UI 默认展示上限（完整计算结果与 UI 展示分离，失败优先）。
const DISPLAY_LIMIT = 4;

// 敏感键集合（大小写不敏感匹配）。
const SENSITIVE_KEYS = new Set([
  "authorization",
  "api-key",
  "x-api-key",
  "apikey",
  "key",
  "access_token",
  "token",
]);

/** 递归打码敏感键值。 */
function maskSensitiveJson(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(copy)) {
    const val = copy[key];
    if (typeof val === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
      if (val.startsWith("Bearer ")) {
        copy[key] = `Bearer ${val.slice(7, 13)}****`;
      } else {
        copy[key] = `${val.slice(0, 4)}****`;
      }
    } else if (typeof val === "object" && val !== null) {
      copy[key] = maskSensitiveJson(val);
    }
  }
  return copy;
}

/** 把 URL query 里的 key / api_key 等参数值打码。 */
function maskUrl(url) {
  if (typeof url !== "string") return url;
  try {
    const u = new URL(url);
    for (const [key] of u.searchParams) {
      const lower = key.toLowerCase();
      if (
        lower === "key" ||
        lower === "api_key" ||
        lower === "apikey" ||
        lower === "token"
      ) {
        u.searchParams.set(key, "****");
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** 递归截断超长字符串，保留前 maxLen 字符；截断后缀文案走 i18n。 */
function truncateLongStrings(obj, maxLen, i18n) {
  if (typeof obj === "string") {
    if (obj.length > maxLen) {
      const suffix = formatI18n(
        i18n,
        "terminology_playground_truncated",
        "…[已省略 {n} 字符]",
        { n: obj.length - maxLen }
      );
      return `${obj.slice(0, maxLen)}${suffix}`;
    }
    return obj;
  }
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => truncateLongStrings(item, maxLen, i18n));
  const copy = {};
  for (const key of Object.keys(obj)) {
    copy[key] = truncateLongStrings(obj[key], maxLen, i18n);
  }
  return copy;
}

/** 把 init.body 归一为可展示对象。 */
function parseBody(body) {
  if (body === null || body === undefined) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

/** JSON 格式化展示，字符串原样返回。 */
function stringifyForDisplay(obj) {
  if (typeof obj === "string") return obj;
  return JSON.stringify(obj, null, 2);
}

// 截断常量（D6）
const SYSTEM_PROMPT_MAX = 80;
const GENERIC_MAX = 1200;
const RESPONSE_MAX = 300;

/** 递归打码，跳过 glossary 与 terms 子树（D7）。 */
function maskForDisplay(obj, skipKeys = ["glossary", "terms"]) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (!Array.isArray(obj)) {
    const proto = Object.getPrototypeOf(obj);
    // 仅拦"零 own 可枚举键且原型非 Object.prototype"的真 {} 场景
    // （原生 Response / Date / Map / 空类实例）：展开必得 {}，诚实呈现类型标签。
    // 带 own 可枚举键的类实例保持既有展开 + 掩码显示（E1 窄门闸，零旁支行为变化）。
    // Object.create(null)（proto===null）仍按纯对象。
    if (
      proto !== Object.prototype &&
      proto !== null &&
      Object.keys(obj).length === 0
    ) {
      return {
        __type: obj?.constructor?.name || "Object",
        ownKeys: 0,
      };
    }
  }
  const copy = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(copy)) {
    if (skipKeys.includes(key.toLowerCase())) continue;
    const val = copy[key];
    if (typeof val === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
      if (val.startsWith("Bearer ")) {
        copy[key] = `Bearer ${val.slice(7, 13)}****`;
      } else {
        copy[key] = `${val.slice(0, 4)}****`;
      }
    } else if (typeof val === "object" && val !== null) {
      copy[key] = maskForDisplay(val, skipKeys);
    }
  }
  return copy;
}

/** 从 userMsg 三种互不兼容结构中提取纯文本（D5）。 */
function extractUserPromptText(userMsg) {
  if (typeof userMsg === "string") return userMsg;
  if (!userMsg || typeof userMsg !== "object") return null;
  if (typeof userMsg.content === "string") return userMsg.content;
  if (Array.isArray(userMsg.content)) {
    return (
      userMsg.content
        .map((c) => c?.text)
        .filter(Boolean)
        .join("") || null
    );
  }
  if (Array.isArray(userMsg.parts)) {
    return (
      userMsg.parts
        .map((p) => p?.text)
        .filter(Boolean)
        .join("") || null
    );
  }
  return null;
}

/**
 * 把请求体里「字符串形式的嵌套 JSON」就地展开成对象（C4/V5）。
 *
 * 用户消息在真实请求体里是字符串：批量模式下 messages[].content 是双重编码的 JSON
 * （`'{"targetLanguage":"zh-CN",...}'`），直接打印满屏 \" 不可读；非批量是带字面
 * \n 的长文本模板。这里对已知的三个承载位置尝试 JSON.parse，成功就换成对象
 * （缩进打印天然可读），失败就原样保留 —— <pre> 的 whiteSpace: pre-wrap 会把真实
 * 换行正常渲染出来。
 *
 * 跳过 role === "system"：系统提示词由 truncateRequestForDisplay 截到 SYSTEM_PROMPT_MAX，
 * 不需要也不应该展开。必须在 truncateRequestForDisplay **之前**调用。
 */
function expandNestedUserMessage(bodyObj) {
  if (!bodyObj || typeof bodyObj !== "object" || Array.isArray(bodyObj))
    return bodyObj;
  const tryParse = (text) => {
    if (typeof text !== "string") return text;
    const trimmed = text.trim();
    // 只对看起来像 JSON 的字符串尝试解析，避免把普通文本误判
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === "object" ? parsed : text;
    } catch {
      return text;
    }
  };
  const copy = { ...bodyObj };
  // OpenAI 兼容 / Claude / QwenMT：messages[*].content
  if (Array.isArray(copy.messages)) {
    copy.messages = copy.messages.map((msg) =>
      msg &&
      typeof msg === "object" &&
      msg.role !== "system" &&
      typeof msg.content === "string"
        ? { ...msg, content: tryParse(msg.content) }
        : msg
    );
  }
  // Gemini generateContent：contents[*].parts[*].text
  if (Array.isArray(copy.contents)) {
    copy.contents = copy.contents.map((item) =>
      item && typeof item === "object" && Array.isArray(item.parts)
        ? {
            ...item,
            parts: item.parts.map((p) =>
              p && typeof p === "object" && typeof p.text === "string"
                ? { ...p, text: tryParse(p.text) }
                : p
            ),
          }
        : item
    );
  }
  // Gemini Interactions：input[*].content[*].text
  if (Array.isArray(copy.input)) {
    copy.input = copy.input.map((item) =>
      item && typeof item === "object" && Array.isArray(item.content)
        ? {
            ...item,
            content: item.content.map((c) =>
              c && typeof c === "object" && typeof c.text === "string"
                ? { ...c, text: tryParse(c.text) }
                : c
            ),
          }
        : item
    );
  }
  return copy;
}

/** 对请求体做差异化截断（D6）：四个系统提示词位置用 SYSTEM_PROMPT_MAX，其余 GENERIC_MAX。 */
function truncateRequestForDisplay(reqObj, i18n) {
  if (!reqObj || typeof reqObj !== "object") return reqObj;
  const copy = { ...reqObj };
  if (typeof copy.url === "string")
    copy.url = truncateLongStrings(copy.url, GENERIC_MAX, i18n);
  if (copy.headers && typeof copy.headers === "object") {
    copy.headers = truncateLongStrings(copy.headers, GENERIC_MAX, i18n);
  }
  if (copy.body && typeof copy.body === "object" && !Array.isArray(copy.body)) {
    const truncatedBody = {};
    for (const key of Object.keys(copy.body)) {
      const val = copy.body[key];
      // systemInstruction 为 camelCase 对象带 parts 数组
      if (
        key === "systemInstruction" &&
        val &&
        typeof val === "object" &&
        Array.isArray(val.parts)
      ) {
        truncatedBody[key] = {
          ...val,
          parts: val.parts.map((p) =>
            p && typeof p === "object" && typeof p.text === "string"
              ? {
                  ...p,
                  text: truncateLongStrings(p.text, SYSTEM_PROMPT_MAX, i18n),
                }
              : p
          ),
        };
        // system_instruction 为 snake_case 纯字符串
      } else if (key === "system_instruction" && typeof val === "string") {
        truncatedBody[key] = truncateLongStrings(val, SYSTEM_PROMPT_MAX, i18n);
        // system 为 Claude 字段，纯字符串
      } else if (key === "system" && typeof val === "string") {
        truncatedBody[key] = truncateLongStrings(val, SYSTEM_PROMPT_MAX, i18n);
        // messages 数组：role==="system" 的 content 用 SYSTEM_PROMPT_MAX
      } else if (key === "messages" && Array.isArray(val)) {
        truncatedBody.messages = val.map((msg) => {
          if (
            msg &&
            typeof msg === "object" &&
            msg.role === "system" &&
            typeof msg.content === "string"
          ) {
            return {
              ...msg,
              content: truncateLongStrings(
                msg.content,
                SYSTEM_PROMPT_MAX,
                i18n
              ),
            };
          }
          return msg;
        });
      } else {
        truncatedBody[key] = truncateLongStrings(val, GENERIC_MAX, i18n);
      }
    }
    copy.body = truncatedBody;
  } else {
    copy.body = truncateLongStrings(copy.body, GENERIC_MAX, i18n);
  }
  return copy;
}

/** 传递状态渲染元数据（D2）：MUI 图标 + 语义色 Chip（未发出=红、值不一致=橙）。 */
const DELIVERY_STATES = {
  delivered: {
    Icon: CheckCircle,
    labelKey: "terminology_playground_delivery_delivered",
    color: "success",
    variant: "filled",
  },
  mismatch: {
    Icon: Warning,
    labelKey: "terminology_playground_delivery_mismatch",
    color: "warning",
    variant: "outlined",
  },
  missing: {
    Icon: Cancel,
    labelKey: "terminology_playground_delivery_missing",
    color: "error",
    variant: "outlined",
  },
  uncaptured: {
    Icon: RemoveCircle,
    labelKey: "terminology_playground_delivery_uncaptured",
    color: "default",
    variant: "outlined",
  },
};

/** 结果表与摘要软术语块共用的状态 Chip：data-state 是给测试用的稳定锚点。 */
function DeliveryChip({ state, actualValue, ...rest }) {
  const i18n = useI18n();
  const meta = DELIVERY_STATES[state] ?? DELIVERY_STATES.uncaptured;
  const Icon = meta.Icon;
  return (
    <Chip
      size="small"
      color={meta.color}
      variant={meta.variant}
      icon={<Icon fontSize="small" />}
      data-state={state}
      label={
        state === "mismatch"
          ? formatI18n(
              i18n,
              "terminology_playground_delivery_value_wrap",
              "{label}（实际值：{value}）",
              {
                label: i18n(meta.labelKey, ""),
                value:
                  actualValue ??
                  i18n("terminology_playground_delivery_empty", "（空）"),
              }
            )
          : i18n(meta.labelKey, "")
      }
      {...rest}
    />
  );
}

/** 根据快照判断术语注入通道（D3）。 */
function buildInjectionChannel({ apiType, category, isBatch }, i18n) {
  if (apiType === OPT_TRANS_CUSTOMIZE) {
    return i18n(
      "terminology_playground_channel_custom",
      "自定义接口：不注入提示词与术语（需自行实现 reqHook）"
    );
  }
  if (category === "qwenmt")
    return i18n(
      "terminology_playground_channel_qwenmt",
      "服务端原生术语 translation_options.terms"
    );
  if (category === "ai" && isBatch)
    return i18n(
      "terminology_playground_channel_batch",
      "批量 JSON glossary 字段"
    );
  if (category === "ai" && !isBatch)
    return i18n(
      "terminology_playground_channel_nobatch",
      "非批量 {{glossary}} 占位符"
    );
  return "";
}

/** 根据快照计算提示词标签（Task 4）。 */
function buildPromptLabel(
  { apiType, category, isBatch, systemPrompt, nobatchUserPrompt },
  i18n
) {
  if (category === "qwenmt" || apiType === OPT_TRANS_CUSTOMIZE) {
    return i18n("terminology_playground_prompt_none", "不使用翻译提示词");
  }
  if (category === "ai" && isBatch) {
    if (systemPrompt === defaultSystemPrompt)
      return i18n("terminology_playground_prompt_json", "JSON 聚合翻译提示词");
    if (systemPrompt === defaultSystemPromptXml)
      return i18n("terminology_playground_prompt_xml", "XML 聚合翻译提示词");
    if (systemPrompt === defaultSystemPromptLines)
      return i18n("terminology_playground_prompt_line", "LINE 聚合翻译提示词");
    return i18n(
      "terminology_playground_prompt_custom_batch",
      "自定义聚合提示词"
    );
  }
  if (category === "ai" && !isBatch) {
    const actualNobatch = nobatchUserPrompt ?? defaultNobatchUserPrompt;
    return actualNobatch === defaultNobatchUserPrompt
      ? i18n("terminology_playground_prompt_nobatch", "非批量翻译提示词")
      : i18n(
          "terminology_playground_prompt_custom_nobatch",
          "自定义非批量提示词"
        );
  }
  return "";
}

/** 根据快照检测每条术语的注入事实（D2）。 */
function detectGlossaryDelivery({ rawRequest, entries, apiSnapshot }) {
  const result = new Map();
  const setState = (key, state, actualValue) =>
    result.set(key, { state, actualValue });
  if (rawRequest == null) {
    entries.forEach(({ key }) => setState(key, "uncaptured"));
    return result;
  }
  const { apiType, category, isBatch } = apiSnapshot;
  if (apiType === OPT_TRANS_CUSTOMIZE) {
    entries.forEach(({ key }) => setState(key, "missing"));
    return result;
  }
  if (category === "qwenmt") {
    const parsed = parseBody(rawRequest.body);
    const terms = parsed?.translation_options?.terms ?? [];
    entries.forEach(({ key, value }) => {
      const hit = terms.find((t) => t.source === key);
      if (!hit) return setState(key, "missing");
      const expected = value || key;
      return hit.target === expected
        ? setState(key, "delivered")
        : setState(key, "mismatch", hit.target);
    });
    return result;
  }
  const userText = extractUserPromptText(rawRequest.userMsg);
  if (category === "ai" && isBatch) {
    const promptObj = parseBody(userText);
    const glossary = promptObj?.glossary ?? {};
    entries.forEach(({ key, value }) => {
      if (!Object.prototype.hasOwnProperty.call(glossary, key))
        return setState(key, "missing");
      return glossary[key] === value
        ? setState(key, "delivered")
        : setState(key, "mismatch", glossary[key]);
    });
    return result;
  }
  if (category === "ai" && !isBatch) {
    const lines = (userText ?? "").split("\n");
    entries.forEach(({ key, value }) => {
      const prefix = `- ${key}:`;
      const line = lines.find((l) => l.trim().startsWith(prefix));
      if (!line) return setState(key, "missing");
      const actual = line.slice(line.indexOf(":") + 1).trim();
      return actual === value
        ? setState(key, "delivered")
        : setState(key, "mismatch", actual);
    });
    return result;
  }
  return result;
}

// 术语页把聚焦边框压回 1px（局部 sx），notch 遮罩条取 3（遮盖 1px border + 各 1px anti-aliasing）。

// 说明类 Alert 的统一「caption 族」排版：正文跟随主题 caption 字号（rem，随
// Theme.js 注入的 htmlFontSize 缩放），图标同步缩到 16px 等效 rem
// —— MUI Alert 的 icon slot 硬编码 fontSize: 22（Alert.js:111），不缩会与 12px
// 正文视觉失衡。三个接口 note 与结果区的启发式说明共用这一份口径。
const NOTE_ALERT_SX = {
  fontSize: (t) => t.typography.caption.fontSize,
  "& .MuiAlert-icon": { fontSize: (t) => t.typography.pxToRem(16) },
};

// AI 测试接口选择的持久化键：仅用户手动选择时写入（默认逻辑不持久化），
// 刷新/页签往返后回填；恢复值失效（接口被删除/禁用）时清除并回落默认。
const LS_AI_API_SLUG_KEY = "kt-playground-ai-api-slug";
const readStoredAiApiSlug = () => {
  try {
    const v = window.localStorage.getItem(LS_AI_API_SLUG_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
};

// AI 测试目标语言的持久化键：仅用户手动选择时写入，刷新/页签往返后回填。
// 恢复值不是合法语言代码（脏值/旧版本残留）时立即清除并回落全局默认，
// 与 LS_AI_API_SLUG_KEY 的失效清理语义一致，避免脏值永久留存。
const LS_AI_TO_LANG_KEY = "kt-playground-ai-to-lang";
const readStoredAiToLang = () => {
  try {
    const v = window.localStorage.getItem(LS_AI_TO_LANG_KEY);
    if (typeof v === "string" && OPT_LANGS_MAP.has(v)) {
      return v;
    }
    if (v !== null) {
      window.localStorage.removeItem(LS_AI_TO_LANG_KEY);
    }
    return "";
  } catch {
    return "";
  }
};

// AI 术语例句的源语言：例句正文恒由 generateTermTestText 的英文模板生成，
// 模型端按系统提示词自行检测 sourceLanguage（请求不带 fromLang 字段），故此处固定标注英语。
// 取纯语言名（"English - English" → "English"）避免重复冗长。
const AI_EXAMPLE_SOURCE_LANG = "en";
const AI_EXAMPLE_SOURCE_LANG_NAME = (
  OPT_LANGS_MAP.get(AI_EXAMPLE_SOURCE_LANG) || AI_EXAMPLE_SOURCE_LANG
).split(" - ")[0];

// AI 测试状态的初始（无结果）形态：三处共用同一份定义，防止新增字段时漏改一处造成漂移。
//   ① useState 初值；
//   ② 点「测试」时的会话初始化基座（D2：每轮都是全新会话，摘要与 JSON 必然同源）；
//   ③ 「取消」早退时的状态复位（D8：否则 status 永久停在 testing，按钮死锁到刷新）。
// 视为只读常量：组件内只读不写（glossaryEntries 仅参与 map/length），不得就地修改。
const AI_TEST_INITIAL_STATE = {
  status: "idle", // idle | testing | done | error
  requestText: "",
  trText: "",
  glossaryEntries: [],
  error: "",
  rawRequest: null,
  rawResponse: null,
  srLang: "",
  srCode: "",
  isSame: false,
  toLang: "",
  apiSnapshot: null,
};

/** 用命名占位符组装包含运行时数据的多语言文案。 */
function formatI18n(i18n, key, fallback, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) =>
      text.split(`{${name}}`).join(value === undefined ? "" : String(value)),
    i18n(key, fallback)
  );
}

/**
 * 把一次致命诊断格式化为 UI 可读的多语言文案。
 * 诊断核心（terms.js）只输出稳定 type + 结构化 detail；本函数按 type 映射主 I18N key
 * 并插入 detail 参数，不再直接展示核心层硬编码中文 message。CLI 终端走 formatDiagnosticMessage。
 */
function formatFatalDiagnostic(diagnostic, i18n) {
  const d = diagnostic || {};
  const detail = d.detail || {};
  const segmentIndex = detail.segmentIndex ?? d.segmentIndex ?? "?";
  const segment = detail.segment ?? d.segment ?? "";
  const key = detail.key ?? d.key ?? "";
  switch (d.type) {
    case "empty-source-term":
      return formatI18n(
        i18n,
        "terminology_playground_diag_empty_source_term",
        "第 {segmentIndex} 段「{segment}」的逗号前没有源术语（空源术语）",
        { segmentIndex, segment }
      );
    case "invalid-regex":
      return formatI18n(
        i18n,
        "terminology_playground_diag_invalid_regex",
        "第 {segmentIndex} 段「{segment}」无法作为正则解析：{error}",
        { segmentIndex, segment, error: detail.error ?? "" }
      );
    case "empty-matching-pattern":
      return formatI18n(
        i18n,
        "terminology_playground_diag_empty_matching_pattern",
        "第 {segmentIndex} 段「{segment}」的正则可匹配空字符串（{key}），会在任意位置注入译文导致错乱，请改用非空匹配的正则",
        { segmentIndex, segment, key }
      );
    case "zero-width-matching-pattern":
      return formatI18n(
        i18n,
        "terminology_playground_diag_zero_width_matching_pattern",
        "第 {segmentIndex} 段「{segment}」的正则不消费任何字符（{key}），会在原文任意位置零宽注入译文导致错乱，请改用消费字符的正则",
        { segmentIndex, segment, key }
      );
    case "conflicting-mapping":
      return formatI18n(
        i18n,
        "terminology_playground_diag_conflicting_mapping",
        "第 {segmentIndex} 段「{segment}」与第 {prevIndex} 段「{key},{prevValue}」同源但译文不同（冲突映射）",
        {
          segmentIndex,
          segment,
          key,
          prevIndex: detail.prevIndex ?? "?",
          prevValue: detail.prevValue ?? "",
        }
      );
    case "conflicting-pattern":
      return formatI18n(
        i18n,
        "terminology_playground_diag_conflicting_pattern",
        "第 {segmentIndexA} 段「{keyA}」与第 {segmentIndexB} 段「{keyB}」的正则同时命中同一原文「{literal}」（冲突映射），请转义或统一术语写法",
        {
          segmentIndexA: detail.segmentIndexA ?? "?",
          keyA: detail.keyA ?? "",
          segmentIndexB: detail.segmentIndexB ?? "?",
          keyB: detail.keyB ?? "",
          literal: detail.literal ?? "",
        }
      );
    default:
      return String(d.type || "diagnostic");
  }
}

/**
 * 把字典里的 Markdown-lite 标记渲染成 JSX：**粗体** → <strong>，`代码` → <code>。
 * 只支持这两种、不支持嵌套，足够覆盖本页说明文案；不引入 dangerouslySetInnerHTML。
 * 已知边界：代码段内部含 *（如 `. + * ? ( ) [ ] \ | ^ $`）时，因 ** 分支先判且
 * `[^`]+` 不贪婪，内部 * 不会误拆。
 */
function renderRichI18n(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export { renderRichI18n, maskForDisplay };

/**
 * 按命中区间把替换结果渲染为带 <mark> 高亮的文本。
 * 注意 text 必须是原始文本（span 区间记录的是原始文本位置），
 * 渲染片段为命中的 replacement，最终视觉输出即"替换后文本"。
 */
function renderHighlighted(text, spans) {
  const nodes = [];
  let cursor = 0;
  spans.forEach((span, index) => {
    nodes.push(text.slice(cursor, span.start));
    nodes.push(<mark key={index}>{span.replacement}</mark>);
    cursor = span.end;
  });
  nodes.push(text.slice(cursor));
  return nodes;
}

/**
 * 专业术语专项预览测试页签。
 * 只做本地术语替换预览（零网络）：自然语境测试文本 → 防抖实时重算 →
 * 修复前/后对比 → 按冲突矩阵 4 类给出断言状态（图标 + 一行 message），
 * 完整 detail 通过 logger 输出到控制台，遵循"UI 简短 + 控制台完整"范式。
 *
 * 规模控制：完整计算结果与 UI 展示分离，默认最多展示 4 条，失败优先。
 * 同时包含开发态旧引擎失败诊断样例，用于验证错误状态的可识别性。
 */
export default function TerminologyPlayground({
  termsDraft,
  setTermsDraft,
  termDraftTouched,
  setTermDraftTouched,
  termSeed,
  setTermSeed,
  aiTermsDraft,
  setAiTermsDraft,
  transApis = [],
}) {
  const i18n = useI18n();
  const alert = useAlert();
  const theme = useTheme();
  // 表格分隔线：原先写死 #ccc/#eee，深色模式下几乎不可见。用主题 token 取代，
  // 表头线比行线略强（alpha 0.28 vs divider 0.12）以保留原有层次。
  const tableHeadBorder = `1px solid ${alpha(theme.palette.text.primary, 0.28)}`;
  const tableRowBorder = `1px solid ${theme.palette.divider}`;
  const { setting } = useSetting();
  const { list: userRules } = useRules();
  // 术语/seed 草稿由父级 Playground 持有并随页签切换保留（不持久化、不写入正式规则）。
  const [computed, setComputed] = useState(null);
  const [loadError, setLoadError] = useState("");
  // 跟踪用户是否在异步初始加载完成前编辑了输入框，避免覆盖用户已编辑内容。
  const hasUserEdited = useRef(false);
  // 输入框采用原生 resize:vertical 缩放，不引入自定义手柄。

  // 本地重算：解析 → 自然文本生成 → 结构化断言，并把完整 detail 打到控制台。
  // seed 用于例句轮换（同一 seed 确定不变；UI"换一个例句"递增 seed）。
  const runCompute = useMemo(
    () =>
      (value, seed = "") => {
        // Playground 显式请求完整诊断（含 O(n²) 跨术语 conflicting-pattern 分析）
        const parsed = parseTerms(value, { fullDiagnostics: true });

        // 存在致命诊断时：不生成用例，记录诊断并显示错误
        if (parsed.hasErrors) {
          const fatalDiagnostics = parsed.diagnostics.filter((d) =>
            FATAL_DIAGNOSTIC_TYPES.has(d.type)
          );
          logger.error(
            "[TermPlayground] fatal invalid term segments in input:",
            fatalDiagnostics
          );
          if (parsed.metaWarnings.length > 0) {
            logger.info(
              "[TermPlayground] metacharacter warnings:",
              parsed.metaWarnings
            );
          }
          setComputed({
            parsed,
            fatalDiagnostics,
            metaWarnings: parsed.metaWarnings,
            invalid: parsed.invalid,
            hasErrors: true,
          });
          return;
        }

        // 冲突分析只算一次（统一计划 20260829 Task 4）：generateTermTestText
        // 复用同一份结果（不传则其内部自算），uniqueConflictPairs / conflictKeys
        // 也复用，避免 runCompute 内触发 3 次 O(n²) 分析。
        const conflicts = detectTermConflicts(parsed);
        const cases = generateTermTestText(parsed, seed, { conflicts });
        const results = cases.map((testCase) => ({
          testCase,
          assertion: assertTermReplacements(parsed, testCase),
          fixed: applyTermReplace(testCase.text, parsed.terms, REPLACER),
          naive: applyNaiveReplace(testCase.text, parsed),
        }));

        // 完整计算结果统计（不受 UI 展示上限影响）。
        const termCount = parsed.terms.length;
        const conflictPairCount = cases.filter(
          (c) => c.type === "conflict"
        ).length;
        const singleCaseCount = cases.filter((c) => c.type === "single").length;
        const totalCaseCount = cases.length;
        const passCount = results.filter((entry) => entry.assertion.ok).length;
        const failCount = totalCaseCount - passCount;

        // 唯一冲突对数（来自检测，非术语数除以二）；复用上方已算好的 conflicts。
        const uniqueConflictPairs = conflicts.length;

        // 独立术语数（未参与任何冲突的术语数量）。
        const conflictKeys = new Set();
        for (const c of conflicts) {
          conflictKeys.add(c.short.key);
          conflictKeys.add(c.long.key);
        }
        const independentTermCount = parsed.terms.filter(
          (t) => !conflictKeys.has(t.key)
        ).length;

        // UI 展示规模控制。
        const { displayed, hiddenFailCount, hiddenPassCount } =
          selectDisplayedResults(results, { limit: DISPLAY_LIMIT });

        // 控制台输出完整所有 issue/detail，不受 UI 展示上限影响。
        logger.info("[TermPlayground]", {
          termCount,
          uniqueConflictPairs,
          independentTermCount,
          conflictPairCount,
          singleCaseCount,
          totalCaseCount,
          passCount,
          failCount,
          displayedCount: displayed.length,
          hiddenFailCount,
          hiddenPassCount,
        });
        const allIssues = results.flatMap((entry) => entry.assertion.issues);
        if (allIssues.length > 0) {
          logger.error("[TermPlayground]", allIssues);
        }

        setComputed({
          parsed,
          cases,
          results,
          displayed,
          invalid: parsed.invalid,
          metaWarnings: parsed.metaWarnings,
          hasErrors: false,
          summary: {
            termCount,
            uniqueConflictPairs,
            independentTermCount,
            conflictPairCount,
            singleCaseCount,
            totalCaseCount,
            passCount,
            failCount,
            displayedCount: displayed.length,
            hiddenFailCount,
            hiddenPassCount,
          },
        });
      },
    []
  );

  // 输入变化后 300ms 内没有再次输入才重算，避免每敲一个字符都做全量断言。
  const recompute = useMemo(() => debounce(runCompute, 300), [runCompute]);

  // 卸载时取消未执行的防抖任务，避免在已卸载的组件上 setState。
  useEffect(() => {
    return () => {
      recompute.cancel();
    };
  }, [recompute]);

  // 规则加载（恢复 activeRuleData / initial terms）：与用户草稿覆盖解耦。
  // touched 只阻止 setTermsDraft 覆盖草稿，不阻止 matchRule() 恢复规则元数据——
  // activeRuleData 是子组件本地状态，页签往返会随卸载消失，必须每次挂载按当前规则身份恢复，
  // 否则规则级 aiTerms 与默认接口（规则 apiSlug）都会丢失。
  // 异步竞态：matchRule 完成前用户已编辑时，仍写回与当前规则身份一致的只读元数据，
  // 但绝不覆盖草稿；卸载（cancelled）后不得写 state。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const globalRule =
        userRules?.find((rule) => rule.pattern === GLOBAL_KEY) || null;
      let rule = null;
      let loadError = null;
      try {
        rule = await matchRule(window.location.href, {
          injectRules: setting?.injectRules,
          subrulesList: setting?.subrulesList,
        });
      } catch (error) {
        loadError = error;
        // 规则加载失败：回退到全局规则（元数据与初始术语来源）。
        rule = globalRule;
      }
      if (cancelled) return;

      // 只读规则元数据总是写回：规则身份由本次 matchRule 结果决定，
      // 不受用户是否已编辑草稿影响（touched / hasUserEdited 只保护 termsDraft）。
      setActiveRuleData(rule || null);
      if (loadError) {
        setLoadError(
          formatI18n(
            i18n,
            "terminology_playground_rule_load_failed",
            "当前规则术语加载失败，已回退到全局规则：{message}",
            { message: loadError?.message || String(loadError) }
          )
        );
      }

      // termsDraft 覆盖仅限「无草稿」（未 touched 且用户未编辑）场景：
      // 规则术语与全局术语都为空时默认填入冲突矩阵示例，保证例句自动生成。
      if (hasUserEdited.current || termDraftTouched) return;
      const ruleTerms = rule?.terms || "";
      const initial = ruleTerms || CONFLICT_MATRIX_SAMPLE;
      setTermsDraft(initial);
      runCompute(initial, termSeed);
    })();
    return () => {
      cancelled = true;
    };
    // 只在挂载时加载一次初始术语，避免 uiLang/规则列表变化时覆盖用户输入。
    // 页签往返时 termDraftTouched 已由父级保留，据此只跳过草稿覆盖、不跳过元数据恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 页签往返 + 已有草稿：首次挂载 computed 为 null 时补算例句（不覆盖草稿、
  // 不跑空算）。与规则加载 effect 独立，避免规则加载与否影响例句生成。
  useEffect(() => {
    if (termDraftTouched && computed === null && (termsDraft || "").trim()) {
      runCompute(termsDraft, termSeed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termDraftTouched, computed, termsDraft, termSeed]);

  const handleTermsChange = (event) => {
    const value = event.target.value;
    hasUserEdited.current = true;
    setTermDraftTouched(true);
    setTermsDraft(value);
    recompute(value, termSeed);
  };

  const handleLoadSample = () => {
    hasUserEdited.current = true;
    setTermDraftTouched(true);
    setTermsDraft(CONFLICT_MATRIX_SAMPLE);
    recompute(CONFLICT_MATRIX_SAMPLE, termSeed);
  };

  // 换一个例句：在有限模板集合内通过显式 seed 轮换（确定性、可复现），
  // 不依赖随机数或模块缓存；同一 seed 必产生同一例句。
  const handleRotateSeed = () => {
    const nextSeed = String((Number(termSeed) || 0) + 1);
    setTermSeed(nextSeed);
    recompute(termsDraft, nextSeed);
  };

  // 「测试」按钮：对当前生成的例句跑一次本地术语替换，结果以顶部居中
  // Snackbar 弹出（绿色=通过、红色=失败），样式与接口设置的测试弹窗一致。
  const handleRunTest = () => {
    if (!computed) return;
    if (computed.hasErrors) {
      alert.error(
        i18n(
          "terminology_playground_alert_invalid_terms",
          "存在非法术语段，请先修正输入后再测试。"
        )
      );
      return;
    }
    const entry = computed.results?.[0];
    if (!entry) {
      alert.error(
        i18n("terminology_playground_alert_no_example", "未生成可测试的例句。")
      );
      return;
    }
    const { testCase, assertion, fixed } = entry;
    if (assertion.ok) {
      alert.success(
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {i18n("terminology_playground_alert_test_passed", "测试通过")}
          </Typography>
          <Typography variant="body2">
            {i18n("terminology_playground_alert_example_label", "例句：")}
            {testCase.text}
          </Typography>
          <Typography variant="body2">
            {i18n("terminology_playground_alert_replaced_label", "替换后：")}
            {renderHighlighted(testCase.text, fixed.spans)}
          </Typography>
        </Box>
      );
    } else {
      alert.error(
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {i18n("terminology_playground_alert_test_failed", "测试失败")}
          </Typography>
          <Typography variant="body2">
            {assertion.issues[0]?.message ||
              i18n("terminology_playground_none", "（无）")}
          </Typography>
        </Box>
      );
    }
  };

  // 真实 AI 翻译测试：AI 术语例句 → glossary 合并 → 调 apiTranslate → 结果展示。
  const handleRunAiTest = async () => {
    if (!selectedApi) {
      alert.error(
        i18n(
          "terminology_playground_alert_no_api",
          "请先在顶部选择要测试的翻译接口。"
        )
      );
      return;
    }
    if (selectedApiCategory !== "ai" && selectedApiCategory !== "qwenmt") {
      alert.warning(
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {i18n(
              "terminology_playground_alert_api_not_supported",
              "该接口不支持 AI 专业术语"
            )}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {formatI18n(
              i18n,
              "terminology_playground_alert_api_not_supported_body",
              "{apiName} 是 {type}接口，不支持注入提示词，AI 专业术语（规则级/接口级）不会生效。 请选 AI 接口（OpenAI 兼容/Gemini/Claude 等）。",
              {
                apiName: selectedApi.apiName || selectedApi.apiType,
                type:
                  selectedApiCategory === "machine"
                    ? i18n(
                        "terminology_playground_api_type_machine",
                        "机器翻译"
                      )
                    : i18n(
                        "terminology_playground_api_type_traditional",
                        "传统翻译"
                      ),
              }
            )}
          </Typography>
        </Box>
      );
      return;
    }
    if (!aiExampleText) {
      alert.error(
        i18n(
          "terminology_playground_alert_ai_terms_required",
          "请先输入 AI 专业术语以生成测试例句。"
        )
      );
      return;
    }
    const testText = aiExampleText;

    // 1. Glossary 合并（用户输入优先，接口级覆盖规则级，规则级作为补充）。
    //    合并顺序：rule.aiTerms → apiSetting.aiTerms → aiTermsDraft（用户输入最高优先级）。
    //    这与生产引擎的 {rule, api} 合并一致，用户输入代替规则级参与测试。
    const inputGlossary = parseAITerms(aiTermsDraft);
    const ruleGlossary = parseAITerms(activeRuleData?.aiTerms || "");
    const apiGlossary = parseAITerms(selectedApi?.aiTerms || "");
    const mergedGlossary = {
      ...ruleGlossary,
      ...apiGlossary,
      ...inputGlossary,
    };
    // 标记每个 key 的来源（input / rule / api），用于贡献展示。
    const glossaryEntries = Object.entries(mergedGlossary).map(
      ([key, value]) => {
        // 反向查找最高优先级来源：input 优先，其次 api，最后 rule。
        const source =
          inputGlossary[key] !== undefined
            ? "input"
            : apiGlossary[key] !== undefined
              ? "api"
              : "rule";
        return { source, key, value };
      }
    );

    // 2. 发起真实 AI 翻译请求。
    //    保留接口原始 useBatchFetch（AI 接口默认 true → 走 batch 聚合翻译提示词路径），
    //    仅强制 useStream:false 走非流式 runNonStream，一次性测试更可预测稳定；
    //    streamRenderMode 在非流式路径不被读取，无需覆盖。
    //    aiTerms 置空：接口级术语已在上面折进 mergedGlossary，若再透传会在
    //    genUserPrompt 里二次合并并反向覆盖用户输入（R2）。
    //    useContext 置 false：handleTranslate 按 apiSlug 取全局 getMsgHistory 单例，
    //    上一轮的问答会被注入下一轮 messages（用户抓包实证：第 2 轮出现上一轮 user +
    //    空 assistant，第 3 轮首条被环形队列挤成 assistant 而违反协议报错）。
    //    本页测的是术语注入而非对话能力，历史上下文是纯干扰，故整轮关闭。
    //    副作用（已知且无害）：index.js 的 effectiveBatchConcurrency 不再被强制为 1，
    //    队列 key 随之改变，本页因此拿到独立的批量队列实例，隔离性更好。
    const controller = new AbortController();
    aiAbortRef.current = controller;
    // 目标语言优先取本页下拉（持久化于 localStorage），未选中时回落全局设置。
    // fromLang 保持 "auto"：例句正文恒为英文模板，请求体本身不带 fromLang 字段，
    // 由模型按系统提示词检测每个 segment 的 sourceLanguage 并回填（parseAIRes → srLang）。
    const toLang =
      aiToLang ||
      setting?.tranboxSetting?.toLang ||
      DEFAULT_TRANBOX_SETTING.toLang;
    const testApiSetting = {
      ...selectedApi,
      useStream: false,
      aiTerms: "",
      useContext: false,
    };
    // 请求身份快照（D4）：结果区一切派生信息只读请求时快照，不读当前 selectedApi。
    // 切换接口选择器不会重置结果区，若读 selectedApi 会输出与 rawRequest 矛盾的结论。
    const isBatch =
      !!selectedApi.useBatchFetch &&
      API_SPE_TYPES.batch.has(selectedApi.apiType);
    const apiSnapshot = {
      apiName: selectedApi.apiName || selectedApi.apiType || "",
      apiType: selectedApi.apiType,
      category: selectedApiCategory,
      isBatch,
      model: selectedApi.model || "",
      host: getApiHost(selectedApi),
      maskedKey: getMaskedAuthSummary(selectedApi),
      promptLabel: buildPromptLabel(
        {
          apiType: selectedApi.apiType,
          category: selectedApiCategory,
          isBatch,
          systemPrompt: selectedApi.systemPrompt,
          nobatchUserPrompt: selectedApi.nobatchUserPrompt,
        },
        i18n
      ),
      injectionChannel: buildInjectionChannel(
        {
          apiType: selectedApi.apiType,
          category: selectedApiCategory,
          isBatch,
        },
        i18n
      ),
    };
    // 会话初始化（D2/D3）：以初始态为基座整体替换，本轮字段一次写入、上一轮
    // 残留字段（rawRequest/rawResponse/trText/srLang 等）显式归零，
    // 保证 done 之后请求摘要、请求 JSON、响应摘要、响应 JSON 必然同源于同一轮。
    setAiTestState({
      ...AI_TEST_INITIAL_STATE,
      status: "testing",
      requestText: testText,
      glossaryEntries,
      apiSnapshot,
      toLang,
    });
    let capturedReq = null;
    let capturedResp = null;
    try {
      const result = await apiTranslate({
        text: testText,
        fromLang: "auto",
        toLang,
        apiSetting: testApiSetting,
        glossary: mergedGlossary,
        useCache: false,
        usePool: false,
        textFormat: "html",
        signal: controller.signal,
        capture: {
          onRequest: (input, init, userMsg) => {
            capturedReq = {
              url: input,
              method: init?.method || "POST",
              headers: init?.headers || {},
              body: init?.body ?? null,
              userMsg,
            };
          },
          onResponse: (response) => {
            capturedResp = response;
          },
        },
      });
      // 取消（D8）：复位为初始无结果态。只 return 不复位会把 status 永久留在
      // "testing" —— 「测试」按钮永久禁用、「取消」按钮常驻，直到刷新页面。
      if (controller.signal.aborted) {
        setAiTestState(AI_TEST_INITIAL_STATE);
        return;
      }
      const trText = result?.trText || "";
      setAiTestState({
        status: "done",
        requestText: testText,
        trText,
        glossaryEntries,
        error: "",
        rawRequest: capturedReq,
        rawResponse: capturedResp,
        srLang: result?.srLang || "",
        srCode: result?.srCode || "",
        isSame: result?.isSame || false,
        toLang,
        apiSnapshot,
      });
    } catch (error) {
      // 取消（D8）：与上面的 aborted 早退同一语义，复位而非留在 "testing"。
      // 取消是用户主动行为，不弹错误 Snackbar、不落 error 态。
      if (error?.name === "AbortError") {
        setAiTestState(AI_TEST_INITIAL_STATE);
        return;
      }
      // 用 Snackbar 展示错误信息（网络/HTTP 状态/接口字段缺失），不抛未捕获异常。
      alert.error(
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {i18n(
              "terminology_playground_alert_ai_test_failed",
              "AI 翻译测试失败"
            )}
          </Typography>
          <Typography
            variant="body2"
            sx={{ mt: 0.5, fontFamily: "monospace", fontSize: 12 }}
          >
            {error?.message || String(error)}
          </Typography>
        </Box>
      );
      setAiTestState({
        status: "error",
        requestText: testText,
        trText: "",
        glossaryEntries,
        error: error?.message || String(error),
        rawRequest: capturedReq,
        rawResponse: capturedResp,
        srLang: "",
        srCode: "",
        isSame: false,
        toLang,
        apiSnapshot,
      });
    } finally {
      aiAbortRef.current = null;
    }
  };

  const handleCancelAiTest = () => {
    aiAbortRef.current?.abort();
  };

  // AI 术语区专属示例：填入默认 AI 专业术语样例并生成例句（不依赖本地术语库）。
  const handleAiLoadSample = () => {
    setAiTermsDraft(
      i18n(
        "terminology_playground_terms_sample",
        "zorp,数据管道\nquzzle,缓存节点"
      )
    );
  };

  // AI 例句换一个：递增 aiTermSeed 触发例句重新生成（与本地术语区 handleRotateSeed 一致）。
  const handleAiRotateSeed = () => {
    setAiTermSeed(String((Number(aiTermSeed) || 0) + 1));
  };

  // 用户手动切换测试接口：标记已触摸，默认逻辑不再覆盖；同时持久化到 localStorage
  // （仅手动选择写入，默认逻辑选出的接口不持久化，避免规则改接口后仍恢复旧默认）。
  const handleSelectApi = (event) => {
    apiSelectionTouchedRef.current = true;
    setSelectedApiSlug(event.target.value);
    try {
      if (event.target.value) {
        window.localStorage.setItem(LS_AI_API_SLUG_KEY, event.target.value);
      } else {
        // 选择被清空：一并清除持久化键，避免留下过期值。
        window.localStorage.removeItem(LS_AI_API_SLUG_KEY);
      }
    } catch {
      // localStorage 不可用时静默降级：仅丢失跨刷新留存，不影响本页使用。
    }
  };

  // 用户手动切换 AI 测试目标语言：写入 localStorage（清空则移除键），
  // 与 handleSelectApi 同款失败静默降级。
  const handleSelectAiToLang = (event) => {
    const value = event.target.value;
    setAiToLang(value);
    try {
      if (value) {
        window.localStorage.setItem(LS_AI_TO_LANG_KEY, value);
      } else {
        window.localStorage.removeItem(LS_AI_TO_LANG_KEY);
      }
    } catch {
      // localStorage 不可用时静默降级：仅丢失跨刷新留存，不影响本页使用。
    }
  };

  // 卸载时清理未完成的 AI 测试请求。
  useEffect(() => {
    return () => {
      aiAbortRef.current?.abort();
      aiAbortRef.current = null;
    };
  }, []);

  // 展示占位符格式：配置的分隔符 + n + 配置的结束分隔符（默认 {n}）。
  const placeholderFormat = `${PLACEHOLDER_START}n${PLACEHOLDER_END}`;

  // 当前例句（首个生成用例）及其通过/异常状态（供例句旁紧凑徽标）。
  const exampleEntry =
    computed && !computed.hasErrors ? computed.results?.[0] : null;
  const exampleText = exampleEntry?.testCase?.text ?? "";
  const exampleOk = exampleEntry?.assertion?.ok;

  // AI 专业术语草稿（由父级 Playground 持有，跨页签/跨路由经 localStorage 临时留存）
  const aiGlossary = useMemo(() => parseAITerms(aiTermsDraft), [aiTermsDraft]);
  const aiGlossaryEntries = useMemo(
    () => Object.entries(aiGlossary),
    [aiGlossary]
  );

  // 真实 AI 翻译测试：接口选择 + 请求/结果状态。
  // 接口列表来自父组件 resolve 后的 resolvedTransApis（含展开的 systemPrompt 等字段，
  // 与 TranForm/SubtitleSegmentationPlayground 一致），过 fillApiDefaults 补齐运行时默认字段。
  const availableApis = useMemo(() => {
    const list = Array.isArray(transApis) ? transApis : [];
    return list
      .filter((api) => api && api.apiSlug && api.isDisabled !== true)
      .map(fillApiDefaults);
  }, [transApis]);
  // AI 测试接口选择：首帧渲染即进行有效性归一化，确保永远向 MUI Select 传递合法 value。
  // 1. 若 localStorage 恢复值仍在可用列表中 → 首帧直接选用；
  // 2. 若恢复值已失效（如已删除/禁用）或不存在 → 首帧回落至第一个可用接口（或 "" 对应无接口占位项），
  //    完全消除 MUI out-of-range 控制台 warning；
  // 3. 失效键清理与规则级默认接口覆盖由下方 useEffect 异步完成。
  const [selectedApiSlug, setSelectedApiSlug] = useState(() => {
    const restored = readStoredAiApiSlug();
    const valid =
      restored && availableApis.some((api) => api.apiSlug === restored);
    if (valid) return restored;
    return availableApis[0]?.apiSlug || "";
  });
  // 挂载时恢复的接口（只读一次）：默认选择 effect 据此校验有效性，
  // 校验后立即清空引用，避免后续 availableApis 变化时用过期恢复值误删用户新保存的选择。
  const restoredApiSlugRef = useRef(null);
  if (restoredApiSlugRef.current === null) {
    restoredApiSlugRef.current = readStoredAiApiSlug();
  }
  // 用户是否手动改过接口选择：手动选择后不再被默认逻辑覆盖。
  const apiSelectionTouchedRef = useRef(false);
  // AI 测试目标语言：挂载时只读一次 localStorage（StrictMode 幂等，同 restoredApiSlugRef 先例），
  // 无有效持久化值时回落全局 tranboxSetting.toLang —— 与本下拉引入前的行为完全一致。
  const restoredToLangRef = useRef(null);
  if (restoredToLangRef.current === null) {
    restoredToLangRef.current = readStoredAiToLang();
  }
  const [aiToLang, setAiToLang] = useState(() => {
    const restored = restoredToLangRef.current;
    const valid = restored && OPT_LANGS_MAP.has(restored) ? restored : "";
    return (
      valid || setting?.tranboxSetting?.toLang || DEFAULT_TRANBOX_SETTING.toLang
    );
  });
  // 当前匹配规则对象（含 rule.terms / rule.aiTerms / rule.apiSlug，用于默认接口与规则级 glossary）。
  const [activeRuleData, setActiveRuleData] = useState(null);
  // AI 测试状态：idle | testing | done | error（初始形态见 AI_TEST_INITIAL_STATE）
  const [aiTestState, setAiTestState] = useState(AI_TEST_INITIAL_STATE);
  const [showRequestRaw, setShowRequestRaw] = useState(false);
  const [showResponseRaw, setShowResponseRaw] = useState(false);
  const aiAbortRef = useRef(null);
  // AI 术语说明「更多」折叠（U4/U6）：常显 3 短句，长说明默认折叠。
  const [aiHelpOpen, setAiHelpOpen] = useState(false);
  // 请求/响应面板为普通 Box 容器，不做拖高。
  // AI 术语例句轮换 seed（与本地术语区 termSeed 语义一致："" = 缺省确定性行为，递增轮换）。
  const [aiTermSeed, setAiTermSeed] = useState("");

  // 「已发出」通道判定（D2/D3）：只读请求时快照，不做 JSON 子串搜索
  // （例句必然包含术语 key，子串判定恒真、未发出不可达）。
  const deliveryMap = useMemo(() => {
    if (aiTestState.status !== "done" || !aiTestState.apiSnapshot) return null;
    return detectGlossaryDelivery({
      rawRequest: aiTestState.rawRequest,
      entries: aiTestState.glossaryEntries,
      apiSnapshot: aiTestState.apiSnapshot,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aiTestState.status,
    aiTestState.rawRequest,
    aiTestState.glossaryEntries,
    aiTestState.apiSnapshot,
  ]);

  // 接口类型分类：QwenMT 特例优先（虽属 machine 集合，但原生支持术语）。
  const apiCategory = (apiType) => {
    if (apiType === OPT_TRANS_QWENMT) return "qwenmt";
    if (API_SPE_TYPES.ai.has(apiType)) return "ai";
    if (API_SPE_TYPES.machine.has(apiType)) return "machine";
    return "other";
  };
  const selectedApi =
    availableApis.find((api) => api.apiSlug === selectedApiSlug) || null;
  const selectedApiCategory = selectedApi
    ? apiCategory(selectedApi.apiType)
    : null;
  // AI 术语例句：当 aiTermsDraft 非空时，用 parseAITerms 解析为 {key:value} 对象，
  // 转成 [{key, value}] 数组，再调用 generateTermTestText 生成自然例句。
  // 与本地术语区的区别：AI 术语不支持正则，用 parseAITerms 而非 parseTerms。
  // 用 joinIntoParagraph 拼接全部用例（而非只取 cases[0]），保证每条术语都进入待翻译文本，
  // 否则未被首条例句覆盖的术语物理上不可能被替换（R1 根因）。
  const aiExampleText = useMemo(() => {
    const trimmed = aiTermsDraft.trim();
    if (!trimmed) return null;
    const parsed = parseAITerms(trimmed);
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;
    const termsArray = entries.map(([key, value]) => ({ key, value }));
    // 统一计划 §2.3 字面兑现：冲突分析显式传入 { conflicts }（与本地术语区
    // runCompute 同一调用形态）。detectTermConflicts 自带 WeakMap 引用缓存，
    // 改前改后本路径均恰 1 次分析，非性能优化。
    const cases = generateTermTestText(termsArray, aiTermSeed, {
      conflicts: detectTermConflicts(termsArray),
    });
    return joinIntoParagraph(cases) || null;
  }, [aiTermsDraft, aiTermSeed]);

  // 从 apiSetting.url 提取 host（模型/接口摘要展示用）。
  const getApiHost = (api) => {
    try {
      return new URL(api?.url || "").host;
    } catch {
      return api?.url || "";
    }
  };

  // 鉴权摘要：打码 Key 的首段前若干字符。
  const getMaskedAuthSummary = (api) => {
    const key = api?.key || "";
    if (!key) return "-";
    const firstKey = key.split(/\n|,/)[0].trim();
    return maskSensitiveJson({ key: firstKey }).key;
  };

  // 默认接口：优先取 localStorage 恢复的有效选择，其次当前匹配规则的 apiSlug，再次第一个启用接口。
  // 用户手动选择后不再被默认逻辑覆盖。
  useEffect(() => {
    if (availableApis.length === 0) return;
    const restored = restoredApiSlugRef.current;
    if (restored) {
      const restoredValid = availableApis.some(
        (api) => api.apiSlug === restored
      );
      // 一次性校验：校验后立即清空引用，避免后续 availableApis 变化时
      // 用过期的恢复值误删用户已重新保存的选择。
      restoredApiSlugRef.current = "";
      if (restoredValid) {
        // 恢复的接口仍存在：视为已选择，默认逻辑不再覆盖。
        apiSelectionTouchedRef.current = true;
        if (selectedApiSlug !== restored) setSelectedApiSlug(restored);
        return;
      }
      // 恢复的接口已被删除/禁用：清除失效持久化值，回落默认逻辑。
      try {
        window.localStorage.removeItem(LS_AI_API_SLUG_KEY);
      } catch {
        // 静默降级。
      }
    }
    if (apiSelectionTouchedRef.current) return;
    const ruleApi = activeRuleData?.apiSlug;
    const preferred = availableApis.find((api) => api.apiSlug === ruleApi);
    const next = (preferred || availableApis[0])?.apiSlug || "";
    if (next && next !== selectedApiSlug) setSelectedApiSlug(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableApis, activeRuleData]);

  return (
    <Stack spacing={2} data-testid="terminology-tab-root">
      {loadError && <Alert severity="warning">{loadError}</Alert>}
      {isWeb && (
        <Alert severity="warning" data-testid="terminology-web-note">
          {i18n(
            "terminology_playground_web_note",
            "当前为 web 模式（普通浏览器标签页）：AI 翻译请求可能被浏览器 CORS 拦截（多数 AI 接口未开放跨域）。本地术语替换预览不受影响；真实 AI 翻译测试请在打包后的扩展（background 代发）或油猴（GM.xmlHttpRequest）环境中验证。"
          )}
        </Alert>
      )}

      {/* 真实 AI 翻译测试：接口选择器（顶部首个板块）。
          原顶部三行「术语类型/配置位置/特点/生效范围」对照表已移除（窄屏累赘，
          100% 宽表格只会压缩换行、永不横向滚动）；完整对照见 preview/专业术语.md，
          唯一关键语义「机翻不支持 AI 专业术语」由下方 api_desc 承接。 */}
      <Paper
        variant="outlined"
        sx={{ p: 2 }}
        data-testid="terminology-api-selector"
      >
        <Typography variant="subtitle2" gutterBottom>
          {i18n("terminology_playground_api_title", "接口选择")}
        </Typography>
        {/* 说明降到 caption（12px）与 subtitle2 标题（14px/600）形成字号层级，
            文案必须与下方 apiCategory() 三分支一致：QwenMT 虽属 machine 集合但被
            特判为可生效，不得归入"不支持"侧。 */}
        <Typography
          variant="caption"
          component="div"
          color="text.secondary"
          sx={{ mb: 1.5 }}
        >
          {i18n(
            "terminology_playground_api_desc",
            "机器翻译与传统翻译接口（Microsoft、DeepL、Google 等）不支持 AI 专业术语；AI 模型接口与 QwenMT 支持。"
          )}
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          label={i18n("terminology_playground_api_label", "翻译接口")}
          value={selectedApiSlug}
          onChange={handleSelectApi}
          data-testid="terminology-api-select"
        >
          {availableApis.length === 0 && (
            <MenuItem disabled value="">
              {i18n(
                "terminology_playground_api_none",
                "未配置可用接口，请先到「接口设置」页配置"
              )}
            </MenuItem>
          )}
          {availableApis.map((api) => (
            <MenuItem key={api.apiSlug} value={api.apiSlug}>
              {api.apiName || api.apiType || api.apiSlug}
            </MenuItem>
          ))}
        </TextField>
        {selectedApi && (
          <Box sx={{ mt: 1 }}>
            {selectedApiCategory === "machine" ||
            selectedApiCategory === "other" ? (
              <Alert
                severity="warning"
                sx={NOTE_ALERT_SX}
                data-testid="terminology-api-machine-note"
              >
                {formatI18n(
                  i18n,
                  "terminology_playground_api_machine_note",
                  "当前为{type}，AI 专业术语无法生效。",
                  {
                    type:
                      selectedApiCategory === "machine"
                        ? i18n(
                            "terminology_playground_api_type_machine",
                            "机器翻译"
                          )
                        : i18n(
                            "terminology_playground_api_type_traditional",
                            "传统翻译"
                          ),
                  }
                )}
              </Alert>
            ) : selectedApiCategory === "qwenmt" ? (
              <Alert
                severity="info"
                sx={NOTE_ALERT_SX}
                data-testid="terminology-api-qwenmt-note"
              >
                {i18n(
                  "terminology_playground_api_qwenmt_note",
                  "当前为 QwenMT，AI 专业术语可生效。"
                )}
              </Alert>
            ) : (
              <Alert
                severity="info"
                sx={NOTE_ALERT_SX}
                data-testid="terminology-api-ai-note"
              >
                {i18n(
                  "terminology_playground_api_ai_note",
                  "当前为 AI 翻译，AI 专业术语可生效。"
                )}
              </Alert>
            )}
          </Box>
        )}
      </Paper>

      {/* 术语库输入区：格式与规则表单的 terms 字段一致，初始值取当前匹配规则，不持久化。 */}
      <Paper variant="outlined" sx={{ p: 2 }} data-testid="terminology-config">
        <Typography variant="subtitle2" gutterBottom>
          {i18n("terminology_playground_title", "专业术语库（本地替换预览）")}
        </Typography>
        {/* 术语库输入区：格式与规则表单的 terms 字段一致，初始值取当前匹配规则，不持久化。
            使用浏览器原生 resize:vertical 缩放（右下角斜纹 grip），不引入自定义手柄。 */}
        <TextField
          fullWidth
          multiline
          minRows={5}
          maxRows={10}
          value={termsDraft}
          onChange={handleTermsChange}
          label={i18n(
            "terminology_playground_terms_label",
            "术语库（键值对，每行或 ; 分隔）"
          )}
          inputProps={{
            "aria-describedby": "terminology-terms-helper",
          }}
          sx={{
            "& textarea": {
              resize: "vertical",
            },
          }}
          data-testid="terminology-terms-input"
        />
        {/* 术语格式说明 */}
        <FormHelperText
          id="terminology-terms-helper"
          sx={{ margin: "3px 14px 0" }}
        >
          {i18n(
            "terminology_playground_terms_helper",
            "术语键按正则语义解析；译文留空 = 不翻译（保留原文）；重复键只保留首次；术语按正则语义在原文任意位置匹配（与生产一致），建议长度长的术语写在前面。"
          )}
        </FormHelperText>
        {computed?.fatalDiagnostics?.length > 0 && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            data-testid="terminology-invalid"
          >
            {formatI18n(
              i18n,
              "terminology_playground_invalid_terms",
              "检测到 {count} 条非法术语段，未生成本地替换结果：{reasons}",
              {
                count: computed.fatalDiagnostics.length,
                reasons: computed.fatalDiagnostics
                  .map((d) => formatFatalDiagnostic(d, i18n))
                  .join("；"),
              }
            )}
          </Alert>
        )}
        {computed?.metaWarnings?.length > 0 && (
          <Alert
            severity="warning"
            sx={{ mt: 2 }}
            data-testid="terminology-meta-warning"
          >
            {formatI18n(
              i18n,
              "terminology_playground_meta_warning",
              "{count} 个术语含未转义正则元字符（术语按正则语义解析）：{terms}。若要字面匹配，请在字符前加反斜杠，例如 Dr.whob 应写为 Dr\\.whob。",
              {
                count: computed.metaWarnings.length,
                terms: computed.metaWarnings
                  .map((w) => `「${w.key}」（${w.metas.join(" ")})`)
                  .join("、"),
              }
            )}
          </Alert>
        )}
        {computed?.hasErrors && (
          <Alert
            severity="info"
            sx={{ mt: 2 }}
            data-testid="terminology-invalid-state"
          >
            {formatI18n(
              i18n,
              "terminology_playground_invalid_state",
              "存在被拒绝的非法段（已跳过，不影响仍可应用的合法术语）。为免误导，未生成整体“通过”摘要；仍可应用的合法术语：{terms}。完整诊断见控制台（logger.error [TermPlayground]）。",
              {
                terms:
                  computed.parsed.terms.length > 0
                    ? computed.parsed.terms
                        .map((t) => `「${t.key}」`)
                        .join("、")
                    : i18n("terminology_playground_none", "（无）"),
              }
            )}
          </Alert>
        )}
        {/* 本地术语操作按钮：同 AI 操作区，useFlexGap 消除 wrap 后零垂直间距与左偏移。 */}
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1 }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={handleLoadSample}
            data-testid="terminology-sample"
          >
            {i18n("terminology_playground_sample", "填入冲突矩阵 4 类示例")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={handleRotateSeed}
            data-testid="terminology-rotate-seed"
          >
            {i18n("terminology_playground_rotate_seed", "换一个例句")}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleRunTest}
            data-testid="terminology-run-test"
          >
            {i18n("terminology_playground_local_test", "测试")}
          </Button>
        </Stack>
        <Grid container spacing={1} sx={{ mt: 0 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              {i18n("terminology_playground_placeholder_label", "占位符格式")}
            </Typography>
            <Typography variant="body1">{placeholderFormat}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="caption" color="text.secondary">
              {i18n("terminology_playground_seed_label", "例句序号")}
            </Typography>
            <Typography variant="body1" data-testid="terminology-seed">
              {termSeed === "" || termSeed === "0"
                ? i18n("terminology_playground_local_default", "默认")
                : termSeed}
            </Typography>
          </Grid>
        </Grid>
        {/* 例句：当前 seed 生成的首个自然文本，右侧「测试」按钮对其做本地替换。 */}
        {computed && !computed.hasErrors && exampleText && (
          <Box sx={{ mt: 2 }} data-testid="terminology-example">
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="caption" color="text.secondary">
                {i18n("terminology_playground_local_example", "例句")}
              </Typography>
              <Chip
                size="small"
                color={exampleOk ? "success" : "error"}
                label={
                  exampleOk
                    ? i18n("terminology_playground_local_pass", "通过")
                    : i18n("terminology_playground_local_fail", "异常")
                }
                data-testid="terminology-example-status"
              />
            </Stack>
            <Box
              sx={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}
              data-testid="terminology-example-text"
            >
              {exampleText}
            </Box>
            {/* 徽标语义澄清：仅本地正则替换自检，不代表 AI 接口的遵循效果。 */}
            <Typography
              variant="caption"
              component="div"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              {i18n(
                "terminology_playground_local_replace_hint",
                "本地自检：已对当前例句执行一次正则替换断言，全部术语命中并按预期替换；不代表 AI 接口的实际遵循效果。"
              )}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* AI 专业术语预览区：解析键值对，不调 API */}
      <Paper
        variant="outlined"
        sx={{ p: 2 }}
        data-testid="terminology-ai-terms"
      >
        <Typography variant="subtitle2" gutterBottom>
          {i18n(
            "terminology_playground_terms_title",
            "AI 专业术语（术语表预览 + 真实 AI 翻译测试）"
          )}
        </Typography>
        {/* 常显说明：3 短句 + 行内「更多」。「更多」必须留在本段末尾行内，
            否则它会紧贴下方输入框、看起来像输入框的标题。 */}
        <Typography variant="caption" component="div" color="text.secondary">
          {renderRichI18n(
            i18n(
              "terminology_playground_terms_help_intro",
              "键值对，每行或 `;` 分隔。选 AI 接口后点「测试」发起真实请求。 术语表为**软注入**，模型不保证遵循。"
            )
          )}
          <Button
            size="small"
            variant="text"
            disableRipple
            onClick={() => setAiHelpOpen((v) => !v)}
            endIcon={
              aiHelpOpen ? (
                <ExpandLessIcon fontSize="inherit" />
              ) : (
                <ExpandMoreIcon fontSize="inherit" />
              )
            }
            sx={{
              minWidth: 0,
              p: 0,
              ml: 0.5,
              // 跟随 caption 字号/行高，避免行内按钮把整行撑高
              fontSize: "inherit",
              lineHeight: "inherit",
              verticalAlign: "baseline",
            }}
            data-testid="terminology-ai-help-more"
          >
            {aiHelpOpen
              ? i18n("terminology_playground_terms_help_collapse", "收起")
              : i18n("terminology_playground_terms_help_more", "更多")}
          </Button>
        </Typography>
        <Collapse in={aiHelpOpen} unmountOnExit={false}>
          <Typography
            variant="caption"
            component="div"
            color="text.secondary"
            data-testid="terminology-ai-help-detail"
            // 比常显的 caption(0.75rem) 再小一档，明确二级信息层级
            sx={{ mt: 0.75, fontSize: "0.6875rem", lineHeight: 1.6 }}
          >
            {renderRichI18n(
              i18n(
                "terminology_playground_terms_help_detail_a",
                "本区数据为临时测试数据，已自动保留上一次输入，正式保存请复制到「规则/接口设置」页。 AI 专业术语不支持正则表达式。 注意：术语表是通过提示词**软注入**的，模型不保证一定遵循；遇到强先验词 （模型已熟知的专有名词/固定译法，如 API、token）可能压不住，建议用造词 （如 zorp,数据管道）排除干扰。要**必定**替换请写到本地专业术语 （规则 → 术语）：那是正则硬替换、原词不进请求，但注意它按正则语义解析， 元字符 `. + * ? ( ) [ ] \\ | ^ $` 需转义，且只作用于整页翻译的段落正文。 AI 专业术语仅作辅助。"
              )
            )}
            <br />
            {renderRichI18n(
              i18n(
                "terminology_playground_terms_help_detail_b",
                "另外，接口的**「聚合发送翻译请求」开关会影响遵循率**：开启时术语作为结构化 `glossary` 字段发出，且系统提示词带「最高优先级、只输出术语值」的显式指令； 关闭时术语退化为提示词里的 `- 原词: 译文` 文本行，无结构、指令权重低， 小参数模型（8B 级）经常压不住。实测 Qwen3-8B 关闭聚合时替换不稳定、开启后显著改善； Qwen3.6-27B 与 Gemini 3.5 Flash Lite 两种模式都能稳定替换。**术语不生效时优先试着开启聚合。**"
              )
            )}
          </Typography>
        </Collapse>
        {/* 说明区与输入框之间留出间距，避免「更多」展开后紧贴输入框标签 */}
        <TextField
          fullWidth
          multiline
          minRows={3}
          maxRows={10}
          value={aiTermsDraft}
          onChange={(e) => setAiTermsDraft(e.target.value)}
          label={i18n(
            "terminology_playground_terms_input_label",
            "AI 专业术语"
          )}
          placeholder={i18n(
            "terminology_playground_terms_sample",
            "zorp,数据管道\nquzzle,缓存节点"
          )}
          inputProps={{
            "aria-describedby": "terminology-ai-terms-helper",
          }}
          sx={{
            mt: 2,
            "& textarea": {
              resize: "vertical",
            },
          }}
          data-testid="terminology-ai-terms-input"
        />
        {/* AI 术语格式说明 */}
        <FormHelperText
          id="terminology-ai-terms-helper"
          sx={{ margin: "3px 14px 0" }}
        >
          {aiTermsDraft.trim()
            ? formatI18n(
                i18n,
                "terminology_playground_terms_count",
                "解析出 {count} 条术语",
                { count: aiGlossaryEntries.length }
              )
            : i18n(
                "terminology_playground_terms_helper_empty",
                "输入键值对格式的术语，每行或 ; 分隔"
              )}
        </FormHelperText>
        {aiGlossaryEntries.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
              {i18n(
                "terminology_playground_terms_parsed_title",
                "解析后的术语表键值对（将按此格式合并到提示词中的术语表占位符）："
              )}
            </Typography>
            {/* 窄屏真滚动：外层 overflowX:auto 只有在内容确有溢出时才产生横向滚动，
                而 width:100% 的表格永远只压缩换行、永不溢出。给表格设 minWidth
                （3 列约 480px）后，<480px 视口才会真正出现横向滑动。 */}
            <Box sx={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: 480,
                  borderCollapse: "collapse",
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                <thead>
                  <tr style={{ borderBottom: tableHeadBorder }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>
                      {i18n(
                        "terminology_playground_terms_col_term",
                        "术语（键）"
                      )}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>
                      {i18n(
                        "terminology_playground_terms_col_value",
                        "定义（值）"
                      )}
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>
                      {i18n(
                        "terminology_playground_terms_col_format",
                        "提示词格式"
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {aiGlossaryEntries.map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: tableRowBorder }}>
                      <td
                        style={{ padding: "4px 6px", fontFamily: "monospace" }}
                      >
                        {key}
                      </td>
                      <td
                        style={{ padding: "4px 6px", fontFamily: "monospace" }}
                      >
                        {value || (
                          <Box component="em" sx={{ color: "text.disabled" }}>
                            {i18n(
                              "terminology_playground_terms_no_translation",
                              "（无译文，保留原文）"
                            )}
                          </Box>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "4px 6px",
                          fontFamily: "monospace",
                          fontSize: 12,
                        }}
                      >
                        - {key}: {value || key}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Paper>
        )}

        {/* AI 例句展示：由 AI 术语独立生成，不依赖本地术语库。 */}
        {aiExampleText && (
          <Box sx={{ mt: 1 }} data-testid="terminology-ai-example">
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 0.5, display: "block" }}
            >
              {i18n(
                "terminology_playground_terms_example_title",
                "AI 术语例句"
              )}
            </Typography>
            {/* 源语言标注：例句正文恒为英文模板，明示"源语言=英语"，
                避免用户把目标语言下拉误当成例句语言开关。 */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mb: 0.5, display: "block" }}
              data-testid="terminology-ai-source-lang"
            >
              {`${i18n("from_lang", "源语言")}：${AI_EXAMPLE_SOURCE_LANG_NAME}`}
            </Typography>
            <Box
              sx={{
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                fontSize: 13,
                p: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
              }}
            >
              {aiExampleText}
            </Box>
          </Box>
        )}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mt: 0.5, display: "block" }}
        >
          {i18n(
            "terminology_playground_terms_hint",
            "要专门测试某一个术语是否生效，只需填入该术语；其他术语留空有助于观察单个术语的生效情况。"
          )}
        </Typography>

        {/* AI 术语操作按钮：填入示例、换一个例句、测试（/测试中的取消）单起一行。
            useFlexGap 必须开：MUI Stack 默认用 sibling marginLeft 实现 spacing，
            配合 flexWrap 换行后第二行零垂直间距、首元素带左偏移（真机"样式损坏"根因）。 */}
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1 }}
        >
          <Button
            size="small"
            variant="outlined"
            onClick={handleAiLoadSample}
            data-testid="terminology-ai-sample"
          >
            {i18n("terminology_playground_terms_sample_button", "填入示例")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={handleAiRotateSeed}
            data-testid="terminology-ai-rotate-seed"
          >
            {i18n("terminology_playground_terms_rotate_button", "换一个例句")}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={handleRunAiTest}
            disabled={aiTestState.status === "testing"}
            startIcon={
              aiTestState.status === "testing" ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
            data-testid="terminology-ai-run-test"
          >
            {aiTestState.status === "testing"
              ? i18n("terminology_playground_terms_testing", "测试中…")
              : i18n("terminology_playground_terms_test", "测试")}
          </Button>
          {aiTestState.status === "testing" && (
            <Button
              size="small"
              variant="text"
              onClick={handleCancelAiTest}
              data-testid="terminology-ai-cancel"
            >
              {i18n("terminology_playground_terms_cancel", "取消")}
            </Button>
          )}
        </Stack>

        {/* 目标语言：仅覆盖本页 AI 测试请求，不改全局 tranboxSetting.toLang。
            选项/标签/样式全部复用全站既有目标语言下拉（OPT_LANGS_TO_REVERSED + to_lang）；
            窄屏（412px 竖屏）下与按钮同排必然折行损坏，故独立成行、mt:2 与上行拉开
            分组间距（真机反馈 mt:1 的 8px 与普通行距无异、贴得太近）。
            宽度 200：SelectInput 本身 ellipsis+nowrap，常规语言名完整显示，
            个别最长名（繁體中文 - Traditional Chinese 等）省略号截断，与原 240 行为一致。 */}
        <TextField
          select
          size="small"
          variant="outlined"
          label={i18n("to_lang")}
          value={aiToLang}
          onChange={handleSelectAiToLang}
          data-testid="terminology-ai-target-lang"
          sx={{ width: 200, mt: 2 }}
        >
          {OPT_LANGS_TO.map(([code, name]) => (
            <MenuItem key={code} value={code}>
              {name}
            </MenuItem>
          ))}
        </TextField>

        {/* 结果区在 done 与 error 两态都渲染（E5）：capture.onRequest 在 fetchData 之前
            执行，失败轮的请求必然已被捕获，是排查 4xx/协议错误最关键的现场。
            仅 done 态计算 deliveryMap 与生效检测表 —— 请求发失败时不该对术语给出
            「已发出」结论。 */}
        {(aiTestState.status === "done" || aiTestState.status === "error") && (
          <Box sx={{ mt: 2 }} data-testid="terminology-ai-result">
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
              {formatI18n(
                i18n,
                "terminology_playground_result_title",
                "测试结果（{name}）",
                { name: aiTestState.apiSnapshot?.apiName || "" }
              )}
            </Typography>

            {/* 发送的请求 / 接收的响应 左右并排（U1）：<900px 自动上下堆叠；各自拖动手柄独立调高（U5）。 */}
            <Grid
              container
              spacing={1}
              columns={12}
              alignItems="flex-start"
              sx={{ mb: 1 }}
            >
              <Grid
                item
                xs={12}
                md={6}
                data-testid="terminology-ai-req-col"
                sx={{ pb: 1.5 }}
              >
                {/* 请求面板：普通 Box 容器（border/padding 保持），不做拖高 */}
                <Box
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    backgroundColor: theme.palette.background.paper,
                    p: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {i18n(
                        "terminology_playground_result_req_title",
                        "发送的请求（Request）"
                      )}
                    </Typography>
                    <Tooltip
                      title={
                        showRequestRaw
                          ? i18n(
                              "terminology_playground_result_req_view_summary",
                              "返回摘要视图"
                            )
                          : i18n(
                              "terminology_playground_result_req_view_json",
                              "查看原始 JSON"
                            )
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={() => setShowRequestRaw((prev) => !prev)}
                        data-testid="terminology-ai-req-toggle"
                        sx={{
                          color: showRequestRaw
                            ? theme.palette.primary.main
                            : theme.palette.text.secondary,
                        }}
                      >
                        {showRequestRaw ? (
                          <SubjectIcon fontSize="small" />
                        ) : (
                          <DataObjectIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box data-testid="terminology-ai-req-scroll">
                    {showRequestRaw ? (
                      aiTestState.rawRequest ? (
                        <Box
                          data-testid="terminology-ai-req-json"
                          sx={{
                            p: 1,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 12,
                          }}
                        >
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: "inherit",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {stringifyForDisplay(
                              truncateRequestForDisplay(
                                {
                                  url: maskUrl(aiTestState.rawRequest.url),
                                  method: aiTestState.rawRequest.method,
                                  headers: maskSensitiveJson(
                                    aiTestState.rawRequest.headers
                                  ),
                                  body: expandNestedUserMessage(
                                    maskForDisplay(
                                      parseBody(aiTestState.rawRequest.body)
                                    )
                                  ),
                                },
                                i18n
                              )
                            )}
                          </pre>
                        </Box>
                      ) : (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          {i18n(
                            "terminology_playground_result_req_uncaptured",
                            "未捕获到请求"
                          )}
                        </Typography>
                      )
                    ) : (
                      <Box sx={{ display: "grid", gap: 0.5 }}>
                        {aiTestState.glossaryEntries.length > 0 && (
                          <Box
                            data-testid="terminology-ai-soft-glossary"
                            sx={{
                              p: 1,
                              borderRadius: 1,
                              backgroundColor: theme.palette.action.hover,
                            }}
                          >
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mb: 0.5 }}
                            >
                              {i18n(
                                "terminology_playground_result_soft_glossary_title",
                                "AI 专业术语（软提示词注入）"
                              )}
                            </Typography>
                            {aiTestState.glossaryEntries.map(
                              ({ source, key, value }) => {
                                const delivery = deliveryMap?.get(key);
                                return (
                                  <Typography
                                    key={`${source}:${key}`}
                                    variant="caption"
                                    component="div"
                                    // 状态 Chip 靠该块右边缘：左侧术语文本吃掉剩余宽度，
                                    // Chip 不参与收缩，避免长术语把它挤走。
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: 1,
                                      fontFamily: "monospace",
                                    }}
                                  >
                                    <Box
                                      component="span"
                                      sx={{
                                        flex: "1 1 auto",
                                        minWidth: 0,
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      - {key}: {value}
                                    </Box>
                                    {/* 状态 Chip 只在 done 态出现：deliveryMap 只在 done 计算，
                                      失败轮兜底成 "uncaptured"（未捕获）与事实相反 ——
                                      失败轮的请求恰恰已被捕获，只是不该给出「已发出」结论。 */}
                                    {aiTestState.status === "done" && (
                                      <DeliveryChip
                                        state={delivery?.state ?? "uncaptured"}
                                        actualValue={delivery?.actualValue}
                                        sx={{ flexShrink: 0 }}
                                      />
                                    )}
                                  </Typography>
                                );
                              }
                            )}
                          </Box>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          data-testid="terminology-ai-prompt-label"
                        >
                          {i18n(
                            "terminology_playground_result_prompt_label",
                            "翻译提示词："
                          )}
                          {aiTestState.apiSnapshot?.promptLabel || "-"}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          data-testid="terminology-ai-inject-channel"
                        >
                          {i18n(
                            "terminology_playground_result_channel_label",
                            "注入通道："
                          )}
                          {aiTestState.apiSnapshot?.injectionChannel || "-"}
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            backgroundColor: theme.palette.action.hover,
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            {i18n(
                              "terminology_playground_result_request_label",
                              "翻译例句："
                            )}
                          </Typography>
                          <Box
                            data-testid="terminology-ai-request-text"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {aiTestState.requestText}
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatI18n(
                            i18n,
                            "terminology_playground_result_model_host",
                            "模型：{model} · 接口地址：{host}",
                            {
                              model: aiTestState.apiSnapshot?.model || "-",
                              host: aiTestState.apiSnapshot?.host,
                            }
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatI18n(
                            i18n,
                            "terminology_playground_result_auth",
                            "鉴权：{key}",
                            { key: aiTestState.apiSnapshot?.maskedKey }
                          )}
                        </Typography>
                        {/* 实际发出的提示词 —— 摘要视图专属。
                            userMsg 在原始请求体里是转义串：批量是双重编码的 JSON 字符串
                            （满屏 \" ），非批量是带字面 \n 的长文本，两者都难读。这里反转义后展示。
                            原始 JSON 视图**不渲染本块**：那边 body 已由 expandNestedUserMessage
                            就地反转义，再显示一份就是重复噪音（这正是上一轮的设计失误）。 */}
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {i18n(
                              "terminology_playground_result_actual_prompt",
                              "实际发出的提示词"
                            )}
                          </Typography>
                          {(() => {
                            if (!aiTestState.rawRequest) {
                              return (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontStyle: "italic", display: "block" }}
                                  data-testid="terminology-ai-usermsg-json"
                                >
                                  {i18n(
                                    "terminology_playground_result_uncaptured_prompt",
                                    "未捕获到提示词"
                                  )}
                                </Typography>
                              );
                            }
                            const userText = extractUserPromptText(
                              aiTestState.rawRequest.userMsg
                            );
                            const parsed = parseBody(userText);
                            if (parsed == null || parsed === "") {
                              return (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ fontStyle: "italic", display: "block" }}
                                  data-testid="terminology-ai-usermsg-json"
                                >
                                  {i18n(
                                    "terminology_playground_result_uncaptured_prompt",
                                    "未捕获到提示词"
                                  )}
                                </Typography>
                              );
                            }
                            return (
                              <Box
                                data-testid="terminology-ai-usermsg-json"
                                sx={{
                                  p: 1,
                                  mt: 0.5,
                                  borderRadius: 1,
                                  backgroundColor: theme.palette.action.hover,
                                  fontFamily:
                                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  fontSize: 12,
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-all",
                                }}
                              >
                                {stringifyForDisplay(
                                  truncateLongStrings(
                                    maskForDisplay(parsed),
                                    GENERIC_MAX,
                                    i18n
                                  )
                                )}
                              </Box>
                            );
                          })()}
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Grid>

              <Grid
                item
                xs={12}
                md={6}
                data-testid="terminology-ai-resp-col"
                sx={{ pb: 1.5 }}
              >
                {/* 响应面板：普通 Box 容器（border/padding 保持），不做拖高 */}
                <Box
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    backgroundColor: theme.palette.background.paper,
                    p: 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {i18n(
                        "terminology_playground_result_resp_title",
                        "接收的响应（Response）"
                      )}
                    </Typography>
                    {/* 摘要 ↔ JSON 切换按钮只在 done 态出现：失败轮没有可摘要的译文，
                        面板固定展示原始响应（或未捕获提示），留个空转的开关只会误导。 */}
                    {aiTestState.status === "done" && (
                      <Tooltip
                        title={
                          showResponseRaw
                            ? i18n(
                                "terminology_playground_result_req_view_summary",
                                "返回摘要视图"
                              )
                            : i18n(
                                "terminology_playground_result_req_view_json",
                                "查看原始 JSON"
                              )
                        }
                      >
                        <IconButton
                          size="small"
                          onClick={() => setShowResponseRaw((prev) => !prev)}
                          data-testid="terminology-ai-resp-toggle"
                          sx={{
                            color: showResponseRaw
                              ? theme.palette.primary.main
                              : theme.palette.text.secondary,
                          }}
                        >
                          {showResponseRaw ? (
                            <SubjectIcon fontSize="small" />
                          ) : (
                            <DataObjectIcon fontSize="small" />
                          )}
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Box data-testid="terminology-ai-resp-scroll">
                    {/* error 态强制走原始分支：失败轮没有译文可摘要，能给出的只有
                        已捕获的原始响应体（HTTP 200 但解析失败时最有价值），
                        或既有的「未捕获到响应」提示（请求阶段就失败/被取消）。 */}
                    {showResponseRaw || aiTestState.status === "error" ? (
                      aiTestState.rawResponse ? (
                        <Box
                          data-testid="terminology-ai-resp-json"
                          sx={{
                            p: 1,
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 12,
                          }}
                        >
                          <pre
                            style={{
                              margin: 0,
                              fontFamily: "inherit",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {stringifyForDisplay(
                              truncateLongStrings(
                                maskForDisplay(aiTestState.rawResponse),
                                RESPONSE_MAX,
                                i18n
                              )
                            )}
                          </pre>
                        </Box>
                      ) : (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontStyle: "italic" }}
                        >
                          {i18n(
                            "terminology_playground_result_resp_uncaptured",
                            "未捕获到响应（可能失败/被取消）"
                          )}
                        </Typography>
                      )
                    ) : (
                      <Box sx={{ display: "grid", gap: 0.5 }}>
                        <Box
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            backgroundColor: theme.palette.action.hover,
                          }}
                        >
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block" }}
                          >
                            {i18n(
                              "terminology_playground_result_translation_label",
                              "翻译译文："
                            )}
                          </Typography>
                          <Box
                            data-testid="terminology-ai-response-text"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 12,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {aiTestState.trText}
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {formatI18n(
                            i18n,
                            "terminology_playground_result_lang_same",
                            "语言：{lang}（{code}）· 同语言：{same}",
                            {
                              lang: aiTestState.srLang || "-",
                              code: aiTestState.srCode || "-",
                              same: aiTestState.isSame
                                ? i18n(
                                    "terminology_playground_result_yes",
                                    "是"
                                  )
                                : i18n(
                                    "terminology_playground_result_no",
                                    "否"
                                  ),
                            }
                          )}
                        </Typography>
                        {/* 目标语言：本次实际发送的目标语言快照（不读当前下拉），
                            与上方检测出的源语言并列，消除"为什么翻成中文"的困惑。 */}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          data-testid="terminology-ai-result-to-lang"
                        >
                          {`${i18n("to_lang", "目标语言")}：${
                            OPT_LANGS_MAP.get(aiTestState.toLang) ||
                            aiTestState.toLang ||
                            "-"
                          }（${aiTestState.toLang || "-"}）`}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Grid>
            </Grid>

            {/* 启发式说明：与三个接口 note 共用 caption 族排版（随主题字号缩放），
                文案已去掉 **粗体** 标记，纯文本即可，不再走 renderRichI18n。
                说明与检测表都只在 done 态出现（E5）：失败轮没有译文可对照，
                更不该对术语给出「已发出/已应用」结论。 */}
            {aiTestState.status === "done" && (
              <Alert severity="info" sx={{ mb: 1, ...NOTE_ALERT_SX }}>
                {i18n(
                  "terminology_playground_check_heuristic",
                  "以下术语表生效检测为启发式参考（模型可能改写措辞/加括号/不保留占位符），真实对照以上方原始返回译文为准。"
                )}
              </Alert>
            )}
            {aiTestState.status === "done" &&
              aiTestState.glossaryEntries.length > 0 && (
                <Box>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontWeight: 700 }}
                  >
                    {i18n(
                      "terminology_playground_check_title",
                      "术语表贡献与生效检测"
                    )}
                  </Typography>
                  {/* 窄屏真滚动：4 列且含 Chip，minWidth 约 560px（同解析术语表口径）。 */}
                  <Box sx={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: 560,
                        borderCollapse: "collapse",
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: tableHeadBorder }}>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>
                            {i18n(
                              "terminology_playground_check_col_source",
                              "来源"
                            )}
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>
                            {i18n(
                              "terminology_playground_check_col_term",
                              "术语（键→值）"
                            )}
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>
                            {i18n(
                              "terminology_playground_check_col_delivered",
                              "已发出（事实）"
                            )}
                          </th>
                          <th style={{ textAlign: "left", padding: "4px 6px" }}>
                            {i18n(
                              "terminology_playground_check_col_hit",
                              "译文命中（启发式）"
                            )}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiTestState.glossaryEntries.map(
                          ({ source, key, value }) => {
                            const sourceLabel =
                              source === "input"
                                ? i18n(
                                    "terminology_playground_check_source_input",
                                    "用户输入"
                                  )
                                : source === "api"
                                  ? i18n(
                                      "terminology_playground_check_source_api",
                                      "接口级"
                                    )
                                  : i18n(
                                      "terminology_playground_check_source_rule",
                                      "规则级"
                                    );
                            const delivery = deliveryMap?.get(key);
                            // 译文命中为启发式：空值术语语义 = 不翻译（保留原文）；
                            // 例句未覆盖该术语原词时无法判断（Task 1 修复后的护栏态）。
                            // 「未应用」保持灰：启发式判定，模型可能改写措辞，涂红会误读成 bug。
                            let hitChip;
                            if (!value) {
                              hitChip = (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color="default"
                                  icon={<Remove fontSize="small" />}
                                  label={i18n(
                                    "terminology_playground_check_hit_empty",
                                    "不翻译（空值）"
                                  )}
                                />
                              );
                            } else if (!aiTestState.requestText.includes(key)) {
                              hitChip = (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  color="default"
                                  icon={<HelpOutline fontSize="small" />}
                                  label={i18n(
                                    "terminology_playground_check_hit_not_covered",
                                    "例句未覆盖"
                                  )}
                                />
                              );
                            } else {
                              const applied =
                                aiTestState.trText.includes(value);
                              hitChip = (
                                <Chip
                                  size="small"
                                  color={applied ? "success" : "default"}
                                  label={
                                    applied
                                      ? i18n(
                                          "terminology_playground_check_hit_applied",
                                          "已应用"
                                        )
                                      : i18n(
                                          "terminology_playground_check_hit_not_applied",
                                          "未应用"
                                        )
                                  }
                                  variant={applied ? "filled" : "outlined"}
                                  icon={
                                    applied ? (
                                      <Check fontSize="small" />
                                    ) : (
                                      <Close fontSize="small" />
                                    )
                                  }
                                />
                              );
                            }
                            return (
                              <tr
                                key={`${source}:${key}`}
                                style={{
                                  borderBottom: tableRowBorder,
                                  ...(delivery?.state === "mismatch"
                                    ? {
                                        backgroundColor:
                                          theme.palette.warning.light,
                                      }
                                    : {}),
                                }}
                              >
                                <td style={{ padding: "4px 6px" }}>
                                  {sourceLabel}
                                </td>
                                <td
                                  style={{
                                    padding: "4px 6px",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {key} →{" "}
                                  {value ||
                                    i18n(
                                      "terminology_playground_check_empty_value",
                                      "（空值）"
                                    )}
                                </td>
                                <td style={{ padding: "4px 6px" }}>
                                  <DeliveryChip
                                    state={delivery?.state ?? "uncaptured"}
                                    actualValue={delivery?.actualValue}
                                    data-testid={`terminology-ai-delivery-${key}`}
                                  />
                                </td>
                                <td style={{ padding: "4px 6px" }}>
                                  {hitChip}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              )}
          </Box>
        )}
        {aiTestState.status === "error" && (
          <Alert
            severity="error"
            sx={{ mt: 2 }}
            data-testid="terminology-ai-error"
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {i18n(
                "terminology_playground_alert_ai_test_failed",
                "AI 翻译测试失败"
              )}
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", fontSize: 12, mt: 0.5 }}
            >
              {aiTestState.error}
            </Typography>
            {/* 目标语言：失败态也展示本次请求发往的语种，避免"为什么翻成中文"式困惑（与 done 态同 testid，两态互斥不重复）。 */}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.5, display: "block" }}
              data-testid="terminology-ai-result-to-lang"
            >
              {`${i18n("to_lang", "目标语言")}：${
                OPT_LANGS_MAP.get(aiTestState.toLang) ||
                aiTestState.toLang ||
                "-"
              }（${aiTestState.toLang || "-"}）`}
            </Typography>
          </Alert>
        )}
      </Paper>
    </Stack>
  );
}
