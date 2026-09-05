/**
 * @file api.js
 * @description 翻译 API 配置模块，定义各类翻译引擎和词典的默认请求参数、模型名称、语言映射以及 AI 翻译提示词模版。
 */

// --- 基础请求控制参数 ---
export const DEFAULT_HTTP_TIMEOUT = 30; // 调用超时时间 (单位：秒)
export const DEFAULT_FETCH_LIMIT = 10; // 默认最大并行请求/任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间 (单位：毫秒)
export const DEFAULT_BATCH_INTERVAL = 400; // 批处理合并请求的等待延迟时间 (单位：毫秒)
export const DEFAULT_BATCH_SIZE = 20; // 每次翻译请求最多合并发送的 DOM 段落数量
export const DEFAULT_BATCH_LENGTH = 10000; // 每次翻译请求发送的最大字符数限制
export const DEFAULT_BATCH_CONCURRENCY = 10; // 同时执行的聚合批次数量
export const DEFAULT_CONTEXT_SIZE = 3; // AI 翻译时保留的上下文会话历史轮数

// --- 翻译内容替换占位符 ---
export const INPUT_PLACE_URL = "{{url}}"; // 当前网页 URL 占位符
export const INPUT_PLACE_FROM = "{{from}}"; // 源语言占位符
export const INPUT_PLACE_TO = "{{to}}"; // 目标语言占位符
export const INPUT_PLACE_FROM_LANG = "{{fromLang}}"; // 源语言代码占位符
export const INPUT_PLACE_TO_LANG = "{{toLang}}"; // 目标语言代码占位符
export const INPUT_PLACE_TEXT = "{{text}}"; // 翻译源文本占位符
export const INPUT_PLACE_TONE = "{{tone}}"; // 翻译风格/语气占位符 (例如：formal, casual 等)
export const INPUT_PLACE_TITLE = "{{title}}"; // 页面标题占位符
export const INPUT_PLACE_DESCRIPTION = "{{description}}"; // 页面描述(Description)占位符
export const INPUT_PLACE_SUMMARY = "{{summary}}"; // 页面摘要(Summary)占位符
export const INPUT_PLACE_CONTEXT = "{{context}}"; // 当前选中文本所在上下文占位符
export const INPUT_PLACE_KEY = "{{key}}"; // API Key 占位符
export const INPUT_PLACE_MODEL = "{{model}}"; // AI 模型名称占位符
export const INPUT_PLACE_GLOSSARY = "{{glossary}}"; // 专业术语表占位符

export const GEMINI_GENERATE_CONTENT_URL = `https://generativelanguage.googleapis.com/v1beta/models/${INPUT_PLACE_MODEL}:generateContent`;
export const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1/interactions";

// --- 划词翻译词典服务商 ---
// export const OPT_DICT_BAIDU = "Baidu";
export const OPT_DICT_BING = "Bing"; // 必应词典
export const OPT_DICT_YOUDAO = "Youdao"; // 有道词典
export const OPT_DICT_ALL = [OPT_DICT_BING, OPT_DICT_YOUDAO];
export const OPT_DICT_MAP = new Set(OPT_DICT_ALL);

// --- 划词翻译输入联想建议服务商 ---
export const OPT_SUG_BAIDU = "Baidu"; // 百度搜索建议
export const OPT_SUG_YOUDAO = "Youdao"; // 有道输入建议
export const OPT_SUG_ALL = [OPT_SUG_BAIDU, OPT_SUG_YOUDAO];
export const OPT_SUG_MAP = new Set(OPT_SUG_ALL);

// --- 翻译服务提供商标识常量 ---
export const OPT_TRANS_BUILTINAI = "BuiltinAI"; // 浏览器内置 Gemini AI 翻译
export const OPT_TRANS_GOOGLE = "Google"; // 谷歌翻译服务
export const OPT_TRANS_GOOGLE_2 = "Google2"; // 谷歌翻译 pa 网页 API (支持大批量 HTML)
export const OPT_TRANS_GOOGLE_CLOUD = "GoogleCloud"; // Google Cloud Translation Basic API
export const OPT_TRANS_MICROSOFT = "Microsoft"; // 微软翻译服务
export const OPT_TRANS_AZUREAI = "AzureAI"; // 微软 Azure 翻译
export const OPT_TRANS_DEEPSEEK = "DeepSeek"; // DeepSeek 深度求索 AI 翻译
export const OPT_TRANS_OPENCODEGO = "OpenCodeGo"; // OpenCode Go AI 翻译订阅服务
export const OPT_TRANS_SILICONFLOW = "SiliconFlow"; // 硅基流动 AI 翻译 (云端部署大模型)
export const OPT_TRANS_XIAOMIMIMO = "XiaomiMimo"; // 小米米莫 AI 翻译
export const OPT_TRANS_ALIYUNBAILIAN = "AliyunBailian"; // 阿里云百炼大模型翻译
export const OPT_TRANS_QWENMT = "QwenMT"; // 阿里云百炼 Qwen-MT 专用翻译
export const OPT_TRANS_CEREBRAS = "Cerebras"; // Cerebras AI 翻译极速推理服务
export const OPT_TRANS_ZAI = "Zai"; // 智谱 AI 翻译服务
export const OPT_TRANS_DEEPL = "DeepL"; // DeepL 官方专业翻译 API
export const OPT_TRANS_DEEPLX = "DeepLX"; // DeepLX 开源/自定义中转端
export const OPT_TRANS_DEEPLFREE = "DeepLFree"; // DeepL 免费网页翻译接口
export const OPT_TRANS_EPHONEAI = "ePhoneAI"; // ePhone AI 翻译服务
export const OPT_TRANS_BAIDU = "Baidu"; // 百度翻译 API
export const OPT_TRANS_TENCENT = "Tencent"; // 腾讯翻译君 API
export const OPT_TRANS_VOLCENGINE = "Volcengine"; // 火山翻译 API
export const OPT_TRANS_YANDEX = "Yandex"; // Yandex Cloud Translate API
export const OPT_TRANS_YANDEXFREE = "YandexFree"; // Yandex 免费网页翻译接口
export const OPT_TRANS_OPENAI = "OpenAI"; // OpenAI 官方大模型 API 翻译
export const OPT_TRANS_GEMINI = "Gemini"; // 谷歌 Gemini API 翻译 (原版接口形式)
export const OPT_TRANS_GEMINI_2 = "Gemini2"; // 谷歌 Gemini API 翻译 (OpenAI 兼容接口形式)
export const OPT_TRANS_CLAUDE = "Claude"; // Anthropic Claude 翻译
export const OPT_TRANS_CLOUDFLAREAI = "CloudflareAI"; // Cloudflare Workers AI 翻译
export const OPT_TRANS_OLLAMA = "Ollama"; // 本地部署 Ollama 模型翻译
export const OPT_TRANS_OPENROUTER = "OpenRouter"; // OpenRouter 多模型聚合 API 翻译
export const OPT_TRANS_ORCAROUTER = "OrcaRouter"; // OrcaRouter 多模型聚合 API 翻译
export const OPT_TRANS_CUSTOMIZE = "Custom"; // 自定义翻译 API

// 内置支持的翻译引擎
export const OPT_ALL_TRANS_TYPES = [
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  // OPT_TRANS_BAIDU,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_QWENMT,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_CUSTOMIZE,
];

export const OPT_LANGDETECTOR_ALL = [
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
];

export const OPT_LANGDETECTOR_MAP = new Set(OPT_LANGDETECTOR_ALL);

// 翻译引擎特殊集合：按能力将翻译引擎分类
export const API_SPE_TYPES = {
  // 内置翻译引擎
  builtin: new Set(OPT_ALL_TRANS_TYPES),
  // 机器翻译引擎（传统查表/神经网络翻译，不需要大型语言模型）
  machine: new Set([
    OPT_TRANS_MICROSOFT,
    OPT_TRANS_DEEPLFREE,
    OPT_TRANS_BAIDU,
    OPT_TRANS_TENCENT,
    OPT_TRANS_VOLCENGINE,
    OPT_TRANS_YANDEXFREE,
    OPT_TRANS_QWENMT,
  ]),
  // 大语言模型 AI 翻译引擎
  ai: new Set([
    OPT_TRANS_EPHONEAI,
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
    OPT_TRANS_CLAUDE,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
    OPT_TRANS_ORCAROUTER,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持多 API Key 轮询/备用的引擎
  mulkeys: new Set([
    OPT_TRANS_AZUREAI,
    OPT_TRANS_GOOGLE_CLOUD,
    OPT_TRANS_YANDEX,
    OPT_TRANS_DEEPSEEK,
    OPT_TRANS_OPENCODEGO,
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_ALIYUNBAILIAN,
    OPT_TRANS_QWENMT,
    OPT_TRANS_CEREBRAS,
    OPT_TRANS_ZAI,
    OPT_TRANS_DEEPL,
    OPT_TRANS_OPENAI,
    OPT_TRANS_GEMINI,
    OPT_TRANS_GEMINI_2,
    OPT_TRANS_CLAUDE,
    OPT_TRANS_CLOUDFLAREAI,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
    OPT_TRANS_ORCAROUTER,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持段落聚合（批处理合并）翻译的引擎
  batch: new Set([
    OPT_TRANS_AZUREAI,
    OPT_TRANS_DEEPSEEK,
    OPT_TRANS_OPENCODEGO,
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_ALIYUNBAILIAN,
    OPT_TRANS_CEREBRAS,
    OPT_TRANS_ZAI,
    OPT_TRANS_GOOGLE_2,
    OPT_TRANS_GOOGLE_CLOUD,
    OPT_TRANS_YANDEX,
    OPT_TRANS_MICROSOFT,
    OPT_TRANS_TENCENT,
    OPT_TRANS_DEEPL,
    OPT_TRANS_OPENAI,
    OPT_TRANS_GEMINI,
    OPT_TRANS_GEMINI_2,
    OPT_TRANS_CLAUDE,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
    OPT_TRANS_ORCAROUTER,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持带历史会话（Context）关联的翻译引擎
  context: new Set([
    OPT_TRANS_DEEPSEEK,
    OPT_TRANS_OPENCODEGO,
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_ALIYUNBAILIAN,
    OPT_TRANS_CEREBRAS,
    OPT_TRANS_ZAI,
    OPT_TRANS_OPENAI,
    OPT_TRANS_GEMINI,
    OPT_TRANS_GEMINI_2,
    OPT_TRANS_CLAUDE,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
    OPT_TRANS_ORCAROUTER,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持流式文本返回（Server-Sent Events / Stream）的翻译引擎
  stream: new Set([
    OPT_TRANS_DEEPSEEK,
    OPT_TRANS_OPENCODEGO,
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_ALIYUNBAILIAN,
    OPT_TRANS_CEREBRAS,
    OPT_TRANS_ZAI,
    OPT_TRANS_OPENAI,
    OPT_TRANS_GEMINI,
    OPT_TRANS_GEMINI_2,
    OPT_TRANS_CLAUDE,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
    OPT_TRANS_ORCAROUTER,
    OPT_TRANS_EPHONEAI,
  ]),
  // 官方推荐/赞助商的翻译服务
  sponsors: new Set([OPT_TRANS_EPHONEAI]),
  // 暗黑模式下图标反色
  darkIcon: new Set([
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_ZAI,
    OPT_TRANS_DEEPL,
    OPT_TRANS_DEEPLFREE,
    OPT_TRANS_DEEPLX,
    OPT_TRANS_OPENAI,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
  ]),
};

const THINKING_EFFORT_LABELS = {
  max: "Max",
  xhigh: "X-High",
  high: "High",
  medium: "Medium",
  low: "Low",
  minimal: "Minimal",
};
const THINKING_EFFORT_RANK = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};

/**
 * 将思考强度值转换为设置页可直接渲染的选项。
 * @param {string[]} efforts 按强到弱排列的思考强度值。
 * @returns {Array<{value: string, label: string}>} 带显示名称的强度选项。
 */
const toThinkingEffortOptions = (efforts = []) =>
  efforts.map((effort) => ({
    value: effort,
    label: THINKING_EFFORT_LABELS[effort] || effort,
  }));

/**
 * 创建统一的模型思考能力对象。
 * @param {string[]|null} efforts 模型支持的思考强度；null 表示没有强度参数。
 * @param {Object} extra 协议开关、关闭方式等附加能力。
 * @returns {Object} 标准化后的模型思考能力。
 */
const createThinkingCapability = (efforts, extra = {}) => ({
  efforts: efforts ? toThinkingEffortOptions(efforts) : null,
  ...extra,
});

/**
 * 创建通过 reasoning_effort 开启、通过 none 关闭的 OpenAI 兼容能力。
 * @param {string[]} efforts 模型支持的思考强度。
 * @param {Object} [defaults] 模型公布的默认思考行为。
 * @returns {Object} OpenAI 兼容模型的统一思考能力。
 */
const createOpenAIThinkingCapability = (efforts, defaults = {}) =>
  createThinkingCapability(efforts, {
    enable: "effort",
    disable: "none",
    ...defaults,
  });

/**
 * 根据 OpenAI 模型名称解析已确认的思考能力。
 * @param {string} model OpenAI 或带 openai/ 前缀的模型名称。
 * @returns {Object|null} 已知模型的思考能力；未知模型返回 null。
 */
const getOpenAIThinkingCapability = (model = "") => {
  const normalizedModel = String(model)
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "");

  if (/^gpt-5\.6(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability([
      "max",
      "xhigh",
      "high",
      "medium",
      "low",
    ]);
  }
  if (/^gpt-5\.(?:4|2)-pro(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium"]);
  }
  if (/^gpt-5-pro(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high"]);
  }
  if (/^gpt-5\.[23]-codex(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"]);
  }
  if (/^gpt-5\.(?:5|4|2)(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"]);
  }
  if (/^gpt-5\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low"], {
      // GPT-5.1 默认不推理；用户明确开启时应回落到最低非关闭强度 low。
      defaultEnabled: false,
      defaultEffort: "none",
    });
  }
  if (/^gpt-5\.1(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low"]);
  }
  if (/^gpt-5(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low", "minimal"]);
  }

  return null;
};

/**
 * 将设置页内存中的 OpenRouter reasoning 元数据转换为统一能力。
 * @param {string} model 当前选中的模型名称。
 * @param {Object|undefined} metadata 模型目录中当前模型的 reasoning 元数据。
 * @returns {Object|null} 可确认的模型能力；元数据无效时返回 null。
 */
export const getOpenRouterThinkingCapability = (model, metadata) => {
  if (!metadata || metadata.model !== model) return null;

  const supportedEfforts = Array.isArray(metadata.supportedEfforts)
    ? metadata.supportedEfforts.filter(
        (effort) =>
          effort !== "none" && THINKING_EFFORT_RANK[effort] !== undefined
      )
    : [];
  if (!supportedEfforts.length) return null;

  return createThinkingCapability(supportedEfforts, {
    enable: "effort",
    disable: metadata.mandatory ? null : "none",
    // 默认值只参与设置页归一化，不会进入持久化配置和请求生成器。
    defaultEffort: metadata.defaultEffort,
    defaultEnabled: metadata.defaultEnabled,
  });
};

/**
 * 根据 Claude 模型名称解析原生 adaptive thinking 能力。
 * @param {string} model Claude 模型名称。
 * @returns {Object|null} 已知模型的思考能力；旧模型或未知模型返回 null。
 */
const getClaudeThinkingCapability = (model = "") => {
  const normalizedModel = String(model).trim().toLowerCase();
  const supportsAdaptiveThinking =
    /^claude-(?:opus|sonnet)-(?:[5-9](?:-|$)|4-[6-9](?:-|$))/.test(
      normalizedModel
    ) ||
    /^claude-(?:fable|mythos)-5(?:-|$)/.test(normalizedModel) ||
    normalizedModel.startsWith("claude-mythos-preview");

  if (!supportsAdaptiveThinking) return null;

  const mandatory =
    /^claude-(?:fable|mythos)-5(?:-|$)/.test(normalizedModel) ||
    normalizedModel.startsWith("claude-mythos-preview");
  return createThinkingCapability(["max", "xhigh", "high", "medium", "low"], {
    enable: "explicit",
    disable: mandatory ? null : "explicit",
  });
};

/**
 * 根据 Gemini 模型与请求协议解析思考强度和关闭方式。
 * @param {Object} options Gemini 能力解析参数。
 * @param {string} options.apiType Gemini 原生或 OpenAI 兼容接口类型。
 * @param {string} [options.url] 实际请求地址，用于区分 Interactions 与 Generate Content。
 * @param {string} [options.model] Gemini 模型名称。
 * @returns {Object|null} 已知模型的思考能力；未知模型返回 null。
 */
const resolveGeminiCapability = ({ apiType, url = "", model = "" }) => {
  const efforts = getGeminiThinkingEfforts({ apiType, model });
  if (!efforts) return null;

  const normalizedModel = normalizeGeminiModelName(model);
  // disable 记录原生关闭方式；null 表示只能降到模型最低思考强度。
  let disable = null;
  if (apiType === OPT_TRANS_GEMINI_2 && isGemini25NonPro(normalizedModel)) {
    disable = "none";
  } else if (
    apiType === OPT_TRANS_GEMINI &&
    isGeminiInteractionsUrl(url) &&
    isGemini25FlashLite(normalizedModel)
  ) {
    disable = "omit";
  } else if (
    apiType === OPT_TRANS_GEMINI &&
    !isGeminiInteractionsUrl(url) &&
    isGemini25NonPro(normalizedModel)
  ) {
    disable = 0;
  }

  let defaultEffort = null;
  let defaultEnabled = true;
  if (isGemini25(normalizedModel)) {
    defaultEnabled = !isGemini25FlashLite(normalizedModel);
    // Generate Content 使用 -1 明确表达 Gemini 2.5 的动态思考默认值；
    // Interactions 与 OpenAI-compatible 省略强度即可采用服务端默认行为。
    if (
      defaultEnabled &&
      apiType === OPT_TRANS_GEMINI &&
      !isGeminiInteractionsUrl(url)
    ) {
      defaultEffort = -1;
    }
  } else if (
    normalizedModel.startsWith("gemini-3.6-flash") ||
    (normalizedModel.startsWith("gemini-3.5-flash") &&
      !normalizedModel.startsWith("gemini-3.5-flash-lite"))
  ) {
    defaultEffort = "medium";
  } else if (
    normalizedModel.includes("flash-lite") ||
    isGemini31FlashLiteImage(normalizedModel)
  ) {
    defaultEffort = "minimal";
  } else if (
    isGemini31Pro(normalizedModel) ||
    isGemini3Pro(normalizedModel) ||
    normalizedModel.startsWith("gemini-3-flash")
  ) {
    defaultEffort = "high";
  }

  return createThinkingCapability(
    efforts.map((item) => item.value),
    { enable: "effort", disable, defaultEffort, defaultEnabled }
  );
};

/**
 * 为能力固定的接口创建注册表 resolver。
 * @param {string[]|null} efforts 接口统一支持的思考强度。
 * @param {Object} extra 接口统一的开关和字段能力。
 * @returns {Function} 无需模型判断、直接返回固定能力的 resolver。
 */
const resolveFixedCapability = (efforts, extra) => () =>
  createThinkingCapability(efforts, extra);

// 新增同协议接口只需登记 adapter；新增模型能力则只修改对应 resolver。
export const THINKING_API_REGISTRY = {
  [OPT_TRANS_DEEPSEEK]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(["max", "high"], {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_OPENCODEGO]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(["max", "high"], {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_ZAI]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    adapter: "boolean",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_SILICONFLOW]: {
    adapter: "siliconflow",
    resolveCapability: resolveFixedCapability(
      ["max", "high", "medium", "low", "minimal"],
      { enable: "explicit", disable: "explicit" }
    ),
  },
  [OPT_TRANS_CEREBRAS]: {
    adapter: "openai",
    resolveCapability: ({ model = "" }) =>
      /^gpt-oss-120b(?:-|$)/i.test(model)
        ? createOpenAIThinkingCapability(["high", "medium", "low"])
        : null,
  },
  [OPT_TRANS_EPHONEAI]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OPENAI]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OLLAMA]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_ORCAROUTER]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OPENROUTER]: {
    adapter: "openrouter",
    // OpenRouter 的动态能力仅来自设置页内存中的模型目录，不进入持久化配置和请求参数。
    resolveCapability: ({ model, openRouterMetadata }) =>
      getOpenRouterThinkingCapability(model, openRouterMetadata),
  },
  [OPT_TRANS_GEMINI]: {
    adapter: "gemini",
    resolveCapability: resolveGeminiCapability,
  },
  [OPT_TRANS_GEMINI_2]: {
    adapter: "gemini",
    resolveCapability: resolveGeminiCapability,
  },
  [OPT_TRANS_CLAUDE]: {
    adapter: "claude",
    resolveCapability: ({ model }) => getClaudeThinkingCapability(model),
  },
};

/**
 * 返回当前接口和模型可确认的思考能力。
 * @param {Object} options 能力查询参数。
 * @param {string} options.apiType 翻译接口类型。
 * @param {string} [options.url] 实际请求地址。
 * @param {string} [options.model] 当前模型名称。
 * @param {Object} [options.openRouterMetadata] 设置页内存中的 OpenRouter 模型元数据。
 * @returns {Object|null} 包含 adapter 的统一能力；未知接口或模型返回 null。
 */
export const getThinkingCapability = ({
  apiType,
  url = "",
  model = "",
  openRouterMetadata,
}) => {
  const registration = THINKING_API_REGISTRY[apiType];
  if (!registration) return null;

  const capability = registration.resolveCapability({
    apiType,
    url,
    model,
    openRouterMetadata,
  });
  return capability ? { adapter: registration.adapter, ...capability } : null;
};

/**
 * 将用户选择的强度规范化为模型实际支持的最接近值。
 * @param {string} effort 用户选择的思考强度或 _default。
 * @param {Array<{value: string}>} supportedEfforts 模型支持的强度选项。
 * @returns {string|null} 规范化后的强度；模型没有强度参数时返回 null。
 */
export const normalizeThinkingEffort = (effort, supportedEfforts = []) => {
  const supported = supportedEfforts.map((item) => item.value);
  if (!supported.length) return null;
  // 接口默认由能力对象单独解析，不能再隐式等同于最高强度。
  if (effort === null || effort === undefined || effort === "_default") {
    return null;
  }
  if (supported.includes(effort)) return effort;

  const targetRank = THINKING_EFFORT_RANK[effort];
  if (targetRank === undefined) return null;
  return supported.reduce((closest, candidate) => {
    const distance = Math.abs(THINKING_EFFORT_RANK[candidate] - targetRank);
    const closestDistance = Math.abs(
      THINKING_EFFORT_RANK[closest] - targetRank
    );
    return distance < closestDistance ? candidate : closest;
  });
};

/**
 * 根据模型公布的默认行为解析用户选择“接口默认”时的最终开启强度。
 * @param {Object} capability 当前模型的统一思考能力。
 * @returns {string|number|null} 具体默认强度、动态预算或省略强度标记。
 */
const getDefaultThinkingEffort = (capability) => {
  const efforts = capability.efforts || [];
  const lowestEffort = efforts[efforts.length - 1]?.value ?? null;
  if (
    capability.defaultEnabled === false ||
    capability.defaultEffort === "none"
  ) {
    // 模型默认关闭但用户明确开启时，使用最低支持强度保证真正开启。
    return lowestEffort;
  }
  if (capability.defaultEffort === null) return null;
  if (typeof capability.defaultEffort === "number") {
    return capability.defaultEffort;
  }
  return efforts.some((effort) => effort.value === capability.defaultEffort)
    ? capability.defaultEffort
    : null;
};

/**
 * 在配置阶段根据接口和模型能力，将用户选择归一化为最终持久化的两个思考字段。
 * 该函数不会生成协议原生字段，也不会把模型能力写入返回结果。
 * @param {Object} options 思考设置归一化参数。
 * @param {string} options.apiType 翻译接口类型。
 * @param {string} [options.url] 实际请求地址，用于识别 Gemini 协议。
 * @param {string} [options.model] 当前模型名称。
 * @param {"auto"|"enabled"|"disabled"} [options.thinkingMode] 用户选择的思考模式。
 * @param {string|number|null} [options.thinkingEffort] 用户选择或已经确认的思考强度。
 * @param {Object} [options.openRouterMetadata] 设置页内存中的 OpenRouter 模型元数据。
 * @returns {{thinkingMode: string, thinkingEffort: string|number|null}} 最终可持久化的两个思考字段。
 */
export const normalizeThinkingSettings = ({
  apiType,
  url = "",
  model = "",
  thinkingMode = "disabled",
  thinkingEffort = "_default",
  openRouterMetadata,
}) => {
  if (thinkingMode === "auto") {
    return { thinkingMode, thinkingEffort: "_default" };
  }

  const capability = getThinkingCapability({
    apiType,
    url,
    model,
    openRouterMetadata,
  });
  if (!capability) {
    // OpenRouter 的具体强度只会由设置页目录确认；重新打开设置时允许直接沿用该最终值。
    const hasConfirmedOpenRouterEffort =
      apiType === OPT_TRANS_OPENROUTER &&
      thinkingEffort !== undefined &&
      thinkingEffort !== "_default";
    return {
      thinkingMode,
      thinkingEffort: hasConfirmedOpenRouterEffort
        ? thinkingEffort
        : "_default",
    };
  }

  const hasExplicitEffort =
    thinkingEffort !== null &&
    thinkingEffort !== undefined &&
    thinkingEffort !== "_default";
  const normalizedEffort =
    hasExplicitEffort && thinkingEffort === capability.defaultEffort
      ? thinkingEffort
      : normalizeThinkingEffort(thinkingEffort, capability.efforts || []);
  if (thinkingMode === "enabled") {
    return {
      thinkingMode,
      thinkingEffort:
        capability.enable === "explicit" && !hasExplicitEffort
          ? null
          : hasExplicitEffort
            ? normalizedEffort
            : getDefaultThinkingEffort(capability),
    };
  }

  const efforts = capability.efforts || [];
  return {
    thinkingMode,
    thinkingEffort:
      capability.disable === "explicit" || capability.disable === "omit"
        ? null
        : (capability.disable ?? efforts[efforts.length - 1]?.value ?? null),
  };
};

/**
 * 对单个接口配置执行静态思考设置归一化，不处理 OpenRouter 的动态模型目录。
 * @param {Object} apiSetting 原始接口配置。
 * @returns {Object} 归一化后的接口配置；字段未变化时返回原对象引用。
 */
export const normalizeApiThinkingSetting = (apiSetting = {}) => {
  if (!THINKING_API_REGISTRY[apiSetting.apiType]) return apiSetting;

  const normalized = normalizeThinkingSettings(apiSetting);
  if (
    normalized.thinkingMode === apiSetting.thinkingMode &&
    normalized.thinkingEffort === apiSetting.thinkingEffort
  ) {
    return apiSetting;
  }
  return { ...apiSetting, ...normalized };
};

/**
 * 在配置加载、同步或导入后一次性归一化接口列表中的静态思考设置。
 * @param {Array<Object>} transApis 原始翻译接口配置列表。
 * @returns {Array<Object>} 归一化后的配置列表；无变化时返回原数组引用。
 */
export const normalizeApiThinkingSettings = (transApis = []) => {
  if (!Array.isArray(transApis)) return transApis;

  let hasChanges = false;
  const normalizedApis = transApis.map((apiSetting) => {
    const normalized = normalizeApiThinkingSetting(apiSetting);
    if (normalized !== apiSetting) hasChanges = true;
    return normalized;
  });
  return hasChanges ? normalizedApis : transApis;
};

/**
 * 判断关闭思考时是否只能降到模型最低强度。
 * @param {Object} options 判断参数。
 * @param {Object|null} options.capability 当前模型的统一思考能力。
 * @param {string} options.thinkingMode 用户选择的思考模式。
 * @returns {boolean} 是否需要显示最低强度降级提示。
 */
export const isThinkingMinimumFallback = ({ capability, thinkingMode }) =>
  Boolean(
    capability &&
      thinkingMode === "disabled" &&
      capability.disable === null &&
      capability.efforts?.length
  );

/**
 * 规范化 Gemini 模型名称，移除资源名前缀并统一为小写。
 * @param {string} model 原始 Gemini 模型名称。
 * @returns {string} 规范化后的模型名称。
 */
export const normalizeGeminiModelName = (model = "") =>
  String(model)
    .trim()
    .replace(/^models\//i, "")
    .toLowerCase();

/**
 * 判断请求地址是否使用 Gemini Interactions 协议。
 * @param {string} url Gemini 请求地址。
 * @returns {boolean} 是否为 Interactions 端点。
 */
export const isGeminiInteractionsUrl = (url = "") =>
  /\/v1(?:beta\d*)?\/interactions(?:[/?]|$)/i.test(url);

const GEMINI_EFFORT_OPTIONS = {
  high: { value: "high", label: "High" },
  medium: { value: "medium", label: "Medium" },
  low: { value: "low", label: "Low" },
  minimal: { value: "minimal", label: "Minimal" },
};
export const GEMINI25_BUDGETS = {
  minimal: 1024,
  low: 1024,
  medium: 8192,
  high: 24576,
};

const isGemini25 = (model) => model.startsWith("gemini-2.5-");
const isGemini25FlashLite = (model) =>
  model.startsWith("gemini-2.5-flash-lite");
const isGemini25Pro = (model) => model.startsWith("gemini-2.5-pro");
const isGemini25NonPro = (model) => isGemini25(model) && !isGemini25Pro(model);
const isGemini31Pro = (model) => model.startsWith("gemini-3.1-pro");
const isGemini3Pro = (model) => model.startsWith("gemini-3-pro");
const isGemini31FlashLiteImage = (model) =>
  model.startsWith("gemini-3.1-flash-lite-image");

/**
 * 将 Gemini 强度值映射为设置页选项。
 * @param {string[]} efforts Gemini 支持的思考强度。
 * @returns {Array<{value: string, label: string}>} Gemini 强度选项。
 */
const toGeminiEffortOptions = (efforts) =>
  efforts.map((effort) => GEMINI_EFFORT_OPTIONS[effort]);

/**
 * Gemini 不同模型支持的 thinkingLevel 并不一致。UI 与请求构造共用这份能力表，
 * 避免界面允许选择一个最终会被官方接口拒绝的等级。
 * @param {Object} options Gemini 强度查询参数。
 * @param {string} options.apiType Gemini 原生或 OpenAI 兼容接口类型。
 * @param {string} [options.model] Gemini 模型名称。
 * @returns {Array<{value: string, label: string}>|null} 已知模型的强度选项；未知模型返回 null。
 */
export const getGeminiThinkingEfforts = ({ apiType, model = "" }) => {
  const normalizedModel = normalizeGeminiModelName(model);
  const isKnownModel =
    isGemini25(normalizedModel) ||
    isGemini31FlashLiteImage(normalizedModel) ||
    isGemini31Pro(normalizedModel) ||
    isGemini3Pro(normalizedModel) ||
    (normalizedModel.startsWith("gemini-3") &&
      normalizedModel.includes("flash"));
  if (!isKnownModel) return null;

  if (apiType === OPT_TRANS_GEMINI_2) {
    return toGeminiEffortOptions(["high", "medium", "low", "minimal"]);
  }

  if (isGemini25(normalizedModel)) {
    return toGeminiEffortOptions(["high", "medium", "low"]);
  }
  if (isGemini31FlashLiteImage(normalizedModel)) {
    return toGeminiEffortOptions(["high", "minimal"]);
  }
  if (isGemini31Pro(normalizedModel)) {
    return toGeminiEffortOptions(["high", "medium", "low"]);
  }
  if (isGemini3Pro(normalizedModel)) {
    return toGeminiEffortOptions(["high", "low"]);
  }
  if (
    normalizedModel.startsWith("gemini-3") &&
    normalizedModel.includes("flash")
  ) {
    // Regular 3-series flash models reject "minimal"
    // ("'minimal' is not a supported thinking level for this model");
    // only the flash-lite variants accept it.
    return toGeminiEffortOptions(
      normalizedModel.includes("flash-lite")
        ? ["high", "medium", "low", "minimal"]
        : ["high", "medium", "low"]
    );
  }
  return null;
};

export const BUILTIN_STONES = [
  "formal", // 正式风格
  "casual", // 口语风格
  "neutral", // 中性风格
  "technical", // 技术风格
  "marketing", // 营销风格
  "Literary", // 文学风格
  "academic", // 学术风格
  "legal", // 法律风格
  "literal", // 直译风格
  "idiomatic", // 意译风格
  "transcreation", // 创译风格
  "machine-like", // 机器风格
  "concise", // 简明风格
];
export const BUILTIN_PLACEHOLDERS = ["{ }", "{{ }}", "[ ]", "[[ ]]"];
export const BUILTIN_PLACETAGS = ["i", "a", "b", "x", "span"];
export const PLACETAG_FORMATS = ["compact", "attribute"]; // 占位符格式：简洁格式、属性格式

export const OPT_LANGS_TO = [
  ["en", "English - English"],
  ["zh-CN", "Simplified Chinese - 简体中文"],
  ["zh-TW", "Traditional Chinese - 繁體中文"],
  ["ar", "Arabic - العربية"],
  ["bg", "Bulgarian - Български"],
  ["ca", "Catalan - Català"],
  ["hr", "Croatian - Hrvatski"],
  ["cs", "Czech - Čeština"],
  ["da", "Danish - Dansk"],
  ["nl", "Dutch - Nederlands"],
  ["fa", "Persian - فارسی"],
  ["fi", "Finnish - Suomi"],
  ["fr", "French - Français"],
  ["de", "German - Deutsch"],
  ["el", "Greek - Ελληνικά"],
  ["hi", "Hindi - हिन्दी"],
  ["hu", "Hungarian - Magyar"],
  ["id", "Indonesian - Indonesia"],
  ["it", "Italian - Italiano"],
  ["ja", "Japanese - 日本語"],
  ["ko", "Korean - 한국어"],
  ["ms", "Malay - Melayu"],
  ["mt", "Maltese - Malti"],
  ["nb", "Norwegian - Norsk Bokmål"],
  ["pl", "Polish - Polski"],
  ["pt", "Portuguese - Português"],
  ["ro", "Romanian - Română"],
  ["ru", "Russian - Русский"],
  ["sk", "Slovak - Slovenčina"],
  ["sl", "Slovenian - Slovenščina"],
  ["es", "Spanish - Español"],
  ["sv", "Swedish - Svenska"],
  ["ta", "Tamil - தமிழ்"],
  ["te", "Telugu - తెలుగు"],
  ["th", "Thai - ไทย"],
  ["tr", "Turkish - Türkçe"],
  ["uk", "Ukrainian - Українська"],
  ["vi", "Vietnamese - Tiếng Việt"],
];
export const OPT_LANGS_LIST = OPT_LANGS_TO.map(([lang]) => lang);
export const OPT_LANGS_FROM = [
  ["auto", "AutoDetect - AutoDetect"],
  ...OPT_LANGS_TO,
];
export const OPT_LANGS_MAP = new Map(OPT_LANGS_TO);
export const OPT_LANGS_TO_REVERSED = OPT_LANGS_TO.map(([code, name]) => [
  code,
  name.split(" - ").reverse().join(" - "),
]);
export const OPT_LANGS_FROM_REVERSED = OPT_LANGS_FROM.map(([code, name]) => [
  code,
  name.split(" - ").reverse().join(" - "),
]);

// CODE->名称
export const OPT_LANGS_SPEC_NAME = new Map(
  OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
);
export const OPT_LANGS_SPEC_DEFAULT = new Map(
  OPT_LANGS_FROM.map(([key]) => [key, key])
);
export const OPT_LANGS_SPEC_DEFAULT_UC = new Map(
  OPT_LANGS_FROM.map(([key]) => [key, key.toUpperCase()])
);
export const OPT_LANGS_TO_SPEC = {
  [OPT_TRANS_BUILTINAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_GOOGLE]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_GOOGLE_2]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_GOOGLE_CLOUD]: OPT_LANGS_SPEC_DEFAULT,
  [OPT_TRANS_YANDEX]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["nb", "no"],
  ]),
  [OPT_TRANS_YANDEXFREE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["nb", "no"],
  ]),
  [OPT_TRANS_MICROSOFT]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_AZUREAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_DEEPL]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", ""],
    ["zh-CN", "ZH-HANS"],
    ["zh-TW", "ZH-HANT"],
  ]),
  [OPT_TRANS_DEEPLFREE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", "auto"],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLX]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT_UC,
    ["auto", "auto"],
    ["zh-CN", "ZH-HANS"],
    ["zh-TW", "ZH-HANT"],
  ]),
  [OPT_TRANS_DEEPSEEK]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENCODEGO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_SILICONFLOW]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_XIAOMIMIMO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ALIYUNBAILIAN]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_QWENMT]: new Map([...OPT_LANGS_SPEC_NAME, ["auto", "auto"]]),
  [OPT_TRANS_CEREBRAS]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ZAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_VOLCENGINE]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_BAIDU]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["zh-CN", "zh"],
    ["zh-TW", "cht"],
    ["ar", "ara"],
    ["bg", "bul"],
    ["ca", "cat"],
    ["hr", "hrv"],
    ["da", "dan"],
    ["fi", "fin"],
    ["fr", "fra"],
    ["hi", "mai"],
    ["ja", "jp"],
    ["ko", "kor"],
    ["ms", "may"],
    ["mt", "mlt"],
    ["nb", "nor"],
    ["ro", "rom"],
    ["ru", "ru"],
    ["sl", "slo"],
    ["es", "spa"],
    ["sv", "swe"],
    ["ta", "tam"],
    ["te", "tel"],
    ["uk", "ukr"],
    ["vi", "vie"],
  ]),
  [OPT_TRANS_TENCENT]: new Map([
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["en", "en"],
    ["ar", "ar"],
    ["de", "de"],
    ["ru", "ru"],
    ["fr", "fr"],
    ["fi", "fil"],
    ["ko", "ko"],
    ["ms", "ms"],
    ["pt", "pt"],
    ["ja", "ja"],
    ["th", "th"],
    ["tr", "tr"],
    ["es", "es"],
    ["it", "it"],
    ["hi", "hi"],
    ["id", "id"],
    ["vi", "vi"],
  ]),
  [OPT_TRANS_EPHONEAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENAI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_GEMINI]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_GEMINI_2]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_CLAUDE]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OLLAMA]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENROUTER]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ORCAROUTER]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_CLOUDFLAREAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", "en"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
  ]),
  [OPT_TRANS_CUSTOMIZE]: OPT_LANGS_SPEC_NAME,
};

export const OPT_LANGS_FROM_SPEC = {
  ...OPT_LANGS_TO_SPEC,
  [OPT_TRANS_DEEPL]: new Map([
    ...OPT_LANGS_TO_SPEC[OPT_TRANS_DEEPL],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLX]: new Map([
    ...OPT_LANGS_TO_SPEC[OPT_TRANS_DEEPLX],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
};

const specToCode = (m) =>
  new Map(
    Array.from(m.entries()).map(([k, v]) => {
      if (v === "") {
        return ["auto", "auto"];
      }
      if (v === "zh" || v === "ZH") {
        return [v, "zh-CN"];
      }
      return [v, k];
    })
  );

// 名称->CODE
export const OPT_LANGS_TO_CODE = {};
Object.entries(OPT_LANGS_TO_SPEC).forEach(([t, m]) => {
  OPT_LANGS_TO_CODE[t] = specToCode(m);
});
[OPT_TRANS_DEEPL, OPT_TRANS_DEEPLX].forEach((apiType) => {
  OPT_LANGS_TO_CODE[apiType].set("ZH", "zh-CN");
});

export const defaultNobatchPrompt = `You are a professional, authentic machine translation engine.`;
export const defaultNobatchUserPrompt = `# Context
Title: ${INPUT_PLACE_TITLE}
Description: ${INPUT_PLACE_DESCRIPTION}
Summary: ${INPUT_PLACE_SUMMARY}
Tone: ${INPUT_PLACE_TONE}

# Glossary:
${INPUT_PLACE_GLOSSARY}

# Task
Translate the Source Text below to ${INPUT_PLACE_TO}.
1. Use the Context to ensure accuracy.
2. Adapt the wording to match the specified Tone.
3. If a Source Text term exactly matches a Glossary entry, output ONLY that entry's value; never repeat the source term, never wrap the value in parentheses.
4. Output ONLY the translated text. No markdown, no explanations.

Source Text: ${INPUT_PLACE_TEXT}

Translated Text:`;

export const defaultSystemPrompt = `Act as a translation API. Output a single raw JSON object only. No extra text or fences.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output:
{"translations":[{"id":1,"text":"...","sourceLanguage":"<detected>"}]}

Rules:
1.  Use title/description for context only; do not output them.
2.  Keep id, order, and count of segments.
3.  Preserve whitespace, HTML entities, and all HTML-like tags (e.g., <i1>, <a1>). Translate inner text only.
4.  Highest priority: Follow 'glossary'. Use value for translation; if value is "", keep the key. When a term matches the glossary, output ONLY the glossary value; never echo the source term alongside it and never wrap the value in parentheses.
5.  Do not translate: content in <code>, <pre>, text enclosed in backticks, or placeholders like {1}, {{1}}, [1], [[1]].
6.  Apply the specified tone to the translation.
7.  Detect sourceLanguage for each segment.
8.  Return empty or unchanged inputs as is.

Example:
Input: {"targetLanguage":"zh-CN","segments":[{"id":1,"text":"A <b>React</b> component."}],"glossary":{"component":"组件","React":""}}
Output: {"translations":[{"id":1,"text":"一个<b>React</b>组件","sourceLanguage":"en"}]}

Fail-safe: On any error, return {"translations":[]}.`;

export const defaultSystemPromptXml = `Act as a translation API. Output raw XML-like format only. No Markdown fences (xml). No conversational filler.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output Format:
<root>
    <t id="0" sourceLanguage="<detected_source_lang>">Translated text content...</t>
    <t id="1" sourceLanguage="<detected_source_lang>">Translated text content...</t>
</root>

Rules:
1.  **Strict Format**: Output ONLY the <root> element and its children. Do not include "xml" version declarations or markdown code blocks.
2.  **Structure**: Maintain the exact "id" from the input in the "id" attribute. Detect the source language for the "sourceLanguage" attribute.
3.  **HTML & Whitespace**: Preserve all HTML tags (e.g., <b>, <span>, <br>) and whitespace exactly as they appear in the structure. Only translate the text content inside them.
4.  **Glossary**: Highest priority. Use the glossary value for translation. If the value is "", keep the source term as is. When a term matches the glossary, output ONLY the glossary value; never echo the source term alongside it and never wrap the value in parentheses.
5.  **Do Not Translate**: Content inside <code>, <pre>, text in backticks ("code"), and placeholders like {1}, {{1}}, [1], [[1]].
6.  **Context**: Use the "title" and "description" fields to understand the context for better translation accuracy, but do not output them.
7.  **Tone**: Apply the specified "tone" (formal/casual).

Example:
Input:
{"targetLanguage":"zh-CN","segments":[{"id":0,"text":"Hello <b>World</b>!"}],"glossary":{"World":"世界"},"tone":"formal"}

Output:
<root>
    <t id="0" sourceLanguage="en">你好 <b>世界</b>！</t>
</root>`;

export const defaultSystemPromptLines = `Act as a translation API. Output raw text lines in "ID | Text" format. No Markdown. No conversational filler.

Input:
{"targetLanguage":"<lang>","title":"<context>","description":"<context>","summary":"<context>","segments":[{"id":1,"text":"..."}],"glossary":{"sourceTerm":"targetTerm"},"tone":"<formal|casual>"}

Output Format:
<id> | <Translation for Segment>
<id> | <Translation for Segment>
...

Rules:
1.  **Strict Format**: Output exactly one line per segment using the format: "{id} | {translated_text}".
2.  **ID Mapping**: You MUST copy the exact "id" from the input segment to the output line.
3.  **Newline Handling**: If the translated text contains a newline, replace it with the HTML tag "<br>" to ensure it stays on a single line.
4.  **Separator**: Use the pipe symbol " | " strictly to separate the ID and the text.
5.  **Context**: Use title/description for context only; do not output them.
6.  **HTML/Tags**: Preserve whitespace, HTML entities, and all HTML-like tags (e.g., <i1>, <b>). Translate inner text only.
7.  **Glossary**: Highest priority. Follow 'glossary'. Use value for translation; if value is "", keep the key. When a term matches the glossary, output ONLY the glossary value; never echo the source term alongside it and never wrap the value in parentheses.
8.  **Do Not Translate**: content in <code>, <pre>, text enclosed in backticks, or placeholders like {1}, {{1}}, [1].
9.  **Tone**: Apply the specified tone.

Example:
Input: {"targetLanguage":"zh-CN","segments":[{"id":0,"text":"Hello."},{"id":1,"text":"Line 1\nLine 2"}],"glossary":{}}
Output:
0 | 你好。
1 | 第一行<br>第二行

Fail-safe: On error, return "{id} | {original_text}" line by line.`;

// const defaultSubtitlePrompt = `Goal: Convert raw subtitle event JSON into a clean, sentence-based JSON array.

// Output (valid JSON array, output ONLY this array):
// [{
//   "text": "string",        // Full sentence with correct punctuation
//   "translation": "string", // Translation in ${INPUT_PLACE_TO}
//   "start": int,            // Start time (ms)
//   "end": int,              // End time (ms)
// }]

// Guidelines:
// 1. **Segmentation**: Merge sequential 'utf8' strings from 'segs' into full sentences, merging groups logically.
// 2. **Punctuation**: Ensure proper sentence-final punctuation (., ?, !); add if missing.
// 3. **Translation**: Translate 'text' into ${INPUT_PLACE_TO}, place result in 'translation'.
// 4. **Special Cases**: '[Music]' (and similar cues) are standalone entries. Translate appropriately (e.g., '[音乐]', '[Musique]').
// `;

// 专家级AI词典系统提示词
export const defaultDictPrompt = createEnglishDictionaryPrompt({
  targetLanguage: "Chinese",
  translationExample: "用于 Web 和原生用户界面的库",
  labels: {
    entry: "词条",
    essentials: "基础形态与音标",
    pronunciation: "发音标注",
    meanings: "词性与核心义项",
    context: "语境精析",
    contextMeaning: "当前语义锁定",
    register: "语境色调",
    replacements: "原句平替词",
    deepDive: "词源深度解构与辨析",
    etymology: "词源与记忆锚点",
    collocations: "高频搭配",
    synonyms: "同义词微观辨析",
    examples: "语料库双解例句",
    translation: "中文翻译",
    scene: "场景标签",
  },
});

function createEnglishDictionaryPrompt({
  targetLanguage,
  translationExample,
  labels,
}) {
  return `# Role
You are an expert English-${targetLanguage} lexicographer specializing in contrastive linguistics and modern corpus linguistics. Analyze the user's English text with academic rigor and clear, elegant formatting, or translate it naturally into ${targetLanguage} when dictionary analysis is not appropriate.

# Execution Rules
1. **Smart routing (CRITICAL)**: Choose the mode strictly from the length and nature of \`[Target]\`:
   - **Dictionary mode**: Use the dictionary output format only when \`[Target]\` is clearly a single English word, an idiom, or a fixed collocation of no more than 3 words.
   - **Pure translation mode**: Use pure translation for complete sentences, clauses, natural-language phrases, paragraphs, long text, or any continuous text longer than 3 words. When uncertain, choose pure translation mode.
2. **Context first**: In dictionary mode, if \`[Context]\` contains useful information, put the contextually correct sense first.
3. **Target-language contract**: All headings, labels, definitions, explanations, usage notes, and example translations in dictionary mode must be written in ${targetLanguage}. Keep English only for the entry, English examples, pronunciation, and English words being compared.
4. **No extra framing**: Follow the selected format exactly. Do not add greetings, prefaces, or closing summaries.

---

# Pure Translation Output Contract (only for pure translation mode)

Your entire response must contain only the ${targetLanguage} translation itself:
- Do not output the source text, bilingual comparison, headings, labels, language names, quotation marks, Markdown, or explanations.
- Do not add prefixes such as "Translation:" or include pronunciation, etymology, collocations, examples, or acknowledgements.
- If the source has one paragraph, output one paragraph. Preserve paragraph breaks only when the source has multiple paragraphs.

Example:
- Input: The library for web and native user interfaces
- Correct output: ${translationExample}

# Output Format (only for dictionary mode)

## ${labels.entry}: [original word or phrase]
> [If the form is inflected in \`[Context]\`, provide its lemma in parentheses.]

### 1. ${labels.essentials}
- **${labels.pronunciation}**: 🇺🇸 [US IPA] ｜ 🇬🇧 [UK IPA]
- **${labels.meanings}**:
  - \`[part of speech]\` ① [primary ${targetLanguage} definition] ② [secondary ${targetLanguage} definition]
  - \`[part of speech]\` ① [primary ${targetLanguage} definition]

### 2. ${labels.context} *[include only when useful Context exists]*
- **${labels.contextMeaning}**: State the part of speech and precise meaning in the given context.
- **${labels.register}**: Describe sentiment, register, formality, and tone.
- **${labels.replacements}**: Give 1-2 English synonyms that can replace the entry in this context without changing the meaning.

### 3. ${labels.deepDive}
- **${labels.etymology}**: Explain roots, affixes, historical development, or provide a logical memory aid.
- **${labels.collocations}**:
  * \`[collocation 1]\` ➔ [precise ${targetLanguage} translation]
  * \`[collocation 2]\` ➔ [precise ${targetLanguage} translation]
- **${labels.synonyms}**:
  * **[entry] vs [synonym 1] vs [synonym 2]**: Explain their differences in context, intensity, register, or collocation habits in 1-2 sentences.

### 4. ${labels.examples}
[Provide 2-3 natural examples from publications, news, professional writing, or everyday English.]

1. **[natural English example]**
   - 💡 *${labels.translation}*: [accurate, idiomatic ${targetLanguage} translation]
   - 📌 *${labels.scene}*: \`[localized scene label]\``;
}

export const defaultDictPromptEnJa = createEnglishDictionaryPrompt({
  targetLanguage: "Japanese",
  translationExample:
    "Webおよびネイティブのユーザーインターフェース向けライブラリ",
  labels: {
    entry: "見出し語",
    essentials: "基本情報と発音",
    pronunciation: "発音",
    meanings: "品詞と主要な意味",
    context: "文脈分析",
    contextMeaning: "文脈上の意味",
    register: "語調と使用域",
    replacements: "文脈に合う言い換え",
    deepDive: "語源・用法・類義語",
    etymology: "語源と記憶の手がかり",
    collocations: "頻出コロケーション",
    synonyms: "類義語の使い分け",
    examples: "コーパス用例",
    translation: "日本語訳",
    scene: "使用場面",
  },
});

export const defaultDictPromptEnKo = createEnglishDictionaryPrompt({
  targetLanguage: "Korean",
  translationExample: "웹 및 네이티브 사용자 인터페이스용 라이브러리",
  labels: {
    entry: "표제어",
    essentials: "기본 정보와 발음",
    pronunciation: "발음",
    meanings: "품사와 핵심 의미",
    context: "문맥 분석",
    contextMeaning: "문맥상 의미",
    register: "어조와 사용역",
    replacements: "문맥에 맞는 대체어",
    deepDive: "어원·용법·유의어",
    etymology: "어원과 기억 단서",
    collocations: "주요 연어",
    synonyms: "유의어 뉘앙스 비교",
    examples: "말뭉치 예문",
    translation: "한국어 번역",
    scene: "사용 상황",
  },
});

export const defaultDictPromptEnVi = createEnglishDictionaryPrompt({
  targetLanguage: "Vietnamese",
  translationExample: "Thư viện dành cho giao diện người dùng web và native",
  labels: {
    entry: "Mục từ",
    essentials: "Thông tin cơ bản và phát âm",
    pronunciation: "Phát âm",
    meanings: "Từ loại và nghĩa cốt lõi",
    context: "Phân tích ngữ cảnh",
    contextMeaning: "Nghĩa trong ngữ cảnh",
    register: "Sắc thái và phong cách",
    replacements: "Từ thay thế phù hợp",
    deepDive: "Từ nguyên, cách dùng và từ đồng nghĩa",
    etymology: "Từ nguyên và mẹo ghi nhớ",
    collocations: "Cụm từ thường gặp",
    synonyms: "Phân biệt từ đồng nghĩa",
    examples: "Ví dụ ngữ liệu",
    translation: "Bản dịch tiếng Việt",
    scene: "Ngữ cảnh sử dụng",
  },
});

export const defaultDictPromptEnRu = createEnglishDictionaryPrompt({
  targetLanguage: "Russian",
  translationExample:
    "Библиотека для веб-интерфейсов и нативных пользовательских интерфейсов",
  labels: {
    entry: "Словарная статья",
    essentials: "Основная информация и произношение",
    pronunciation: "Произношение",
    meanings: "Часть речи и основные значения",
    context: "Контекстный анализ",
    contextMeaning: "Значение в контексте",
    register: "Тональность и регистр",
    replacements: "Контекстные замены",
    deepDive: "Этимология, употребление и синонимы",
    etymology: "Этимология и подсказка для запоминания",
    collocations: "Частотные сочетания",
    synonyms: "Различия между синонимами",
    examples: "Корпусные примеры",
    translation: "Перевод на русский",
    scene: "Сфера употребления",
  },
});

// 专家级AI词典用户提示词
export const defaultDictUserPrompt = `# Input Data

## [Context] (Optional)
> Use this information to identify the target text's meaning in context:
- Document title: ${INPUT_PLACE_TITLE}
- Document description: ${INPUT_PLACE_DESCRIPTION}
- Document summary: ${INPUT_PLACE_SUMMARY}
- Surrounding paragraph: ${INPUT_PLACE_CONTEXT}

## [Target] (Required)
> Use this text to choose between dictionary mode and pure translation mode:
${INPUT_PLACE_TEXT}`;

// AI 字幕默认使用 boundary-v3：模型返回句末事件 ID、原文锚点和译文，最终原文与时间轴仍由程序重建。
export const defaultSubtitlePrompt = `# Context
Title: ${INPUT_PLACE_TITLE}
Description: ${INPUT_PLACE_DESCRIPTION}
Summary: ${INPUT_PLACE_SUMMARY}
Tone: ${INPUT_PLACE_TONE}

# Glossary (Terminology):
${INPUT_PLACE_GLOSSARY}

# Task
Group the input word-level JSON array into readable, well-paced bilingual subtitle segments. Target Language: ${INPUT_PLACE_TO}.

# Output Contract
1. STRICTLY output a valid JSON array only. No markdown formatting (e.g., do not use \`\`\`json fences), no preamble, and no postscript.
2. Format per element: {"e":<last_word_id>, "o":"exact merged source text", "t":"translation"}
3. The "e" field must be an inclusive, exact word ID from the input and must increase strictly. The first segment starts at ID 0; every later segment starts at the previous "e" + 1.
4. Completeness: Cover every input item exactly once. The final "e" must equal the final input ID. No missing items, overlaps, or gaps.
5. For each segment, first determine its exact input range from the previous "e" + 1 through the current "e", then merge every source item in that range verbatim into "o". Do not paraphrase, normalize, translate, omit, or add source text in "o".
6. Do not return start IDs, timestamps, or any extra fields. The application reconstructs them from the input.

# Rules
1. Hard Source Length Limit:
   - For space-separated source languages, each source span MUST contain no more than 15 words; aim for 8-12 words when a natural boundary exists.
   - For Chinese, Japanese, and other non-space-separated source languages, each source span MUST contain no more than 30 source characters.
   - If a sentence exceeds the applicable limit, split it at a clause, comma, conjunction, or natural phrase boundary. The hard length limit takes priority over keeping a long grammatical sentence intact.
2. Sentence Boundaries: Never merge two complete sentences into one subtitle segment. Terminal punctuation such as .?!。！？ normally ends the current segment.
3. Pause Indicators: An optional "pauseMs" field is the timeline gap in milliseconds after the current input item. If "pauseMs" is missing, treat it as 0 milliseconds and do not infer a pause. Larger positive values indicate stronger sentence boundaries, but grammatical correctness and semantic coherence always take priority.
4. Exact Translation Alignment: Build "o" first from the exact source span covered by the current "e", starting after the previous "e". Then translate only the current "o" into "t". The "t" field MUST NOT omit that span, translate future input items, or carry text from adjacent segments.
5. Silent Self-Check: Before returning, silently verify that every "e", "o", and "t" correspond one-to-one, every "o" matches its exact input range, all source-length limits are satisfied, and all input items are covered exactly once. Do not output the self-check or any reasoning.
6. Translation Quality: Keep "t" concise, accurate, and natural while strictly adhering to the provided Context, Tone, and Glossary. When a term matches the Glossary, output ONLY the glossary value; never echo the source term alongside it and never wrap the value in parentheses.

# Example
Input: [{"id":0,"text":"Once"},{"id":1,"text":"the"},{"id":2,"text":"assets"},{"id":3,"text":"are"},{"id":4,"text":"ready,"},{"id":5,"text":"open"},{"id":6,"text":"the"},{"id":7,"text":"storyboard"},{"id":8,"text":"tab.","pauseMs":850},{"id":9,"text":"This"},{"id":10,"text":"is"},{"id":11,"text":"where"},{"id":12,"text":"everything"},{"id":13,"text":"comes"},{"id":14,"text":"together."},{"id":15,"text":"If"},{"id":16,"text":"a"},{"id":17,"text":"scene"},{"id":18,"text":"does"},{"id":19,"text":"not"},{"id":20,"text":"match"},{"id":21,"text":"your"},{"id":22,"text":"idea,"},{"id":23,"text":"regenerate"},{"id":24,"text":"it"},{"id":25,"text":"or"},{"id":26,"text":"adjust"},{"id":27,"text":"the"},{"id":28,"text":"prompt"},{"id":29,"text":"carefully"},{"id":30,"text":"until"},{"id":31,"text":"it"},{"id":32,"text":"feels"},{"id":33,"text":"right."}]
Output: [{"e":8,"o":"Once the assets are ready, open the storyboard tab.","t":"素材准备好后，打开故事板标签页。"},{"e":14,"o":"This is where everything comes together.","t":"一切从这里开始整合。"},{"e":22,"o":"If a scene does not match your idea,","t":"如果某个场景与你的想法不符，"},{"e":33,"o":"regenerate it or adjust the prompt carefully until it feels right.","t":"请重新生成，或仔细调整提示词，直到效果合适。"}]`;

const defaultRequestHook = `async (args, { url, body, headers, userMsg, method } = {}) => {
  console.log("request hook args:", { args, url, body, headers, userMsg, method });
  // return { url, body, headers, userMsg, method };
};`;

const defaultResponseHook = `async ({ res, ...args }) => {
  console.log("reaponse hook args:", { res, args });
  // const translations = [["你好", "zh"]];
  // const modelMsg = "";
  // return { translations, modelMsg };
};`;

// 翻译接口默认参数
const defaultApi = {
  apiSlug: "", // 唯一标识
  apiName: "", // 接口名称
  apiType: "", // 接口类型
  url: "",
  key: "",
  model: "", // 模型名称
  modelListUrl: "", // 模型列表接口地址
  systemPrompt: "",
  batchPromptSlug: "batch-translation-json",
  subtitlePrompt: "",
  subtitlePromptSlug: "subtitle-segmentation",
  dictPrompt: "",
  dictUserPrompt: "",
  dictPromptSlug: "dictionary-en-zh",
  nobatchPrompt: "",
  nobatchUserPrompt: "",
  nobatchPromptSlug: "nobatch-translation",
  userPrompt: "",
  tone: BUILTIN_STONES[0], // 翻译风格
  placeholder: BUILTIN_PLACEHOLDERS[0], // 占位符
  placetag: BUILTIN_PLACETAGS[0], // 占位标签
  aiTerms: "", // AI智能专业术语（apiSetting.aiTerms，全路径生效：整页/划词/输入框/字幕；与规则级 #glossary 逐 key 合并时接口级覆盖同名）
  customHeader: "",
  customBody: "",
  reqHook: "", // request 钩子函数
  resHook: "", // response 钩子函数
  fetchLimit: DEFAULT_FETCH_LIMIT, // 最大请求数量
  fetchInterval: DEFAULT_FETCH_INTERVAL, // 请求间隔时间
  httpTimeout: DEFAULT_HTTP_TIMEOUT, // 请求超时时间
  batchInterval: DEFAULT_BATCH_INTERVAL, // 批处理请求间隔时间
  batchSize: DEFAULT_BATCH_SIZE, // 每次最多发送段落数量
  batchLength: DEFAULT_BATCH_LENGTH, // 每次发送最大文字数量
  batchConcurrency: DEFAULT_BATCH_CONCURRENCY, // 同时执行的聚合批次数量
  useBatchFetch: false, // 是否启用聚合发送请求
  useStream: false, // 是否启用流式传输
  streamRenderMode: "disabled", // 流式渲染模式：disabled/realtime/segment
  transAllnow: false, // 是否立即全部翻译
  rootMargin: 2000, // 滚动加载提前触发距离
  useContext: false, // 是否启用智能上下文
  contextSize: DEFAULT_CONTEXT_SIZE, // 智能上下文保留会话数
  temperature: 0.0,
  maxTokens: 20480,
  thinkingMode: "disabled", // 思考模式：auto | enabled | disabled
  thinkingEffort: "_default", // 思考强度：_default=接口默认,不注入参数
  isDisabled: false, // 是否不显示,
  region: "", // Azure 专用
  sortOrder: 0, // 排序权重，数值越小越靠前
  placetagFormat: "compact", // 占位符格式：compact(<a1>) 或 attribute(<a i=1>)
};

// AI 翻译接口默认参数
const defaultAiApiOpts = {
  useBatchFetch: true, // 是否启用聚合发送请求
  thinkingMode: "disabled", // 思考模式：auto | enabled | disabled
  thinkingEffort: "_default", // 思考强度：_default=接口默认,不注入参数
  useStream: true, // 是否启用流式传输
  streamRenderMode: "realtime", // 流式渲染模式：disabled/realtime/segment
};

const defaultApiOpts = {
  [OPT_TRANS_BUILTINAI]: defaultApi,
  [OPT_TRANS_GOOGLE]: {
    ...defaultApi,
    url: "https://translate.googleapis.com/translate_a/single",
  },
  [OPT_TRANS_GOOGLE_2]: {
    ...defaultApi,
    url: "https://translate-pa.googleapis.com/v1/translateHtml",
    key: "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520",
    useBatchFetch: true,
    placetag: "a",
    placetagFormat: "attribute",
  },
  [OPT_TRANS_GOOGLE_CLOUD]: {
    ...defaultApi,
    url: "https://translation.googleapis.com/language/translate/v2",
    useBatchFetch: true,
  },
  [OPT_TRANS_YANDEX]: {
    ...defaultApi,
    url: "https://translate.api.cloud.yandex.net/translate/v2/translate",
    folderId: "",
    useBatchFetch: true,
  },
  [OPT_TRANS_YANDEXFREE]: {
    ...defaultApi,
  },
  [OPT_TRANS_MICROSOFT]: {
    ...defaultApi,
    useBatchFetch: true,
  },
  [OPT_TRANS_AZUREAI]: {
    ...defaultApi,
    url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0",
    useBatchFetch: true,
  },
  [OPT_TRANS_BAIDU]: {
    ...defaultApi,
  },
  [OPT_TRANS_TENCENT]: {
    ...defaultApi,
    useBatchFetch: true,
  },
  [OPT_TRANS_VOLCENGINE]: {
    ...defaultApi,
  },
  [OPT_TRANS_DEEPL]: {
    ...defaultApi,
    url: "https://api-free.deepl.com/v2/translate",
    useBatchFetch: true,
  },
  [OPT_TRANS_DEEPLFREE]: {
    ...defaultApi,
    fetchLimit: 1,
  },
  [OPT_TRANS_DEEPSEEK]: {
    ...defaultApi,
    url: "https://api.deepseek.com/chat/completions",
    modelListUrl: "https://api.deepseek.com/models",
    model: "deepseek-v4-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_OPENCODEGO]: {
    ...defaultApi,
    url: "https://opencode.ai/zen/go/v1/chat/completions",
    model: "deepseek-v4-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_SILICONFLOW]: {
    ...defaultApi,
    url: "https://api.siliconflow.cn/v1/chat/completions",
    modelListUrl: "https://api.siliconflow.cn/v1/models",
    model: "Pro/zai-org/GLM-4.7",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    ...defaultApi,
    url: "https://api.xiaomimimo.com/v1/chat/completions",
    modelListUrl: "https://api.xiaomimimo.com/v1/models",
    model: "mimo-v2.5-pro",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    ...defaultApi,
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelListUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    model: "qwen-plus",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_QWENMT]: {
    ...defaultApi,
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-mt-flash",
  },
  [OPT_TRANS_CEREBRAS]: {
    ...defaultApi,
    url: "https://api.cerebras.ai/v1/chat/completions",
    modelListUrl: "https://api.cerebras.ai/v1/models",
    model: "gpt-oss-120b",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ZAI]: {
    ...defaultApi,
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelListUrl: "https://open.bigmodel.cn/api/paas/v4/models",
    model: "glm-5.1",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_DEEPLX]: {
    ...defaultApi,
    url: "http://localhost:1188/translate",
  },
  [OPT_TRANS_EPHONEAI]: {
    ...defaultApi,
    url: "https://api.ephone.ai/v1/chat/completions",
  },
  [OPT_TRANS_OPENAI]: {
    ...defaultApi,
    url: "https://api.openai.com/v1/chat/completions",
    modelListUrl: "https://api.openai.com/v1/models",
    model: "gpt-4",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_GEMINI]: {
    ...defaultApi,
    // 官方 Gemini 默认使用 GA 的 Interactions；用户自定义 URL 仍由运行时按协议自动分流。
    url: GEMINI_INTERACTIONS_URL,
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-3.6-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_GEMINI_2]: {
    ...defaultApi,
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    modelListUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/models",
    model: "gemini-3.6-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CLAUDE]: {
    ...defaultApi,
    url: "https://api.anthropic.com/v1/messages",
    modelListUrl: "https://api.anthropic.com/v1/models",
    model: "claude-3-haiku-20240307",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CLOUDFLAREAI]: {
    ...defaultApi,
    url: "https://api.cloudflare.com/client/v4/accounts/{{ACCOUNT_ID}}/ai/run/@cf/meta/m2m100-1.2b",
  },
  [OPT_TRANS_OLLAMA]: {
    ...defaultApi,
    url: "http://localhost:11434/v1/chat/completions",
    modelListUrl: "http://localhost:11434/v1/models",
    model: "llama3.1",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_OPENROUTER]: {
    ...defaultApi,
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelListUrl: "https://openrouter.ai/api/v1/models",
    model: "openai/gpt-4o",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ORCAROUTER]: {
    ...defaultApi,
    url: "https://api.orcarouter.ai/v1/chat/completions",
    modelListUrl: "https://api.orcarouter.ai/v1/models",
    model: "openai/gpt-5.4-mini",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CUSTOMIZE]: {
    ...defaultApi,
    reqHook: defaultRequestHook,
    resHook: defaultResponseHook,
  },
};

// 内置翻译接口列表（带参数）
export const DEFAULT_API_LIST = OPT_ALL_TRANS_TYPES.map((apiType) =>
  normalizeApiThinkingSetting({
    ...defaultApiOpts[apiType],
    apiSlug: apiType,
    apiName: apiType,
    apiType,
  })
);

/**
 * 为单个翻译接口补齐模型列表 URL。
 *
 * 这里专门用来兼容旧版本保存的数据：旧数据里没有 `modelListUrl` 字段，
 * 读取到的值会是 `undefined`。如果用户已经显式保存为空字符串，说明用户
 * 选择不配置模型列表接口，不能再用默认值覆盖。
 *
 * @param {object} apiSetting 单个翻译接口配置
 * @returns {object} 补齐后的接口配置；如果无需修改，则返回原对象引用
 */
export function fillDefaultApiModelListUrl(apiSetting) {
  if (!apiSetting || typeof apiSetting !== "object") {
    return apiSetting;
  }
  // 只有 undefined 才代表旧数据缺字段；空字符串或自定义 URL 都应原样保留。
  if (apiSetting.modelListUrl !== undefined) {
    return apiSetting;
  }

  // 按接口类型查找内置默认配置，未查到官方模型列表接口时补为空字符串。
  const defaultApiOpt =
    DEFAULT_API_LIST.find((item) => item.apiType === apiSetting.apiType) || {};
  return {
    ...apiSetting,
    modelListUrl: defaultApiOpt.modelListUrl || "",
  };
}

/**
 * 批量补齐翻译接口列表中的模型列表 URL。
 *
 * 该函数保持不可变更新：只有发现旧数据缺少 `modelListUrl` 时才创建新数组
 * 和新接口对象；没有任何变更时返回原数组引用，方便调用方用引用比较避免
 * 多余的设置写回和 React 重渲染。
 *
 * @param {Array<object>} transApis 翻译接口配置列表
 * @returns {Array<object>} 归一化后的接口配置列表
 */
export function normalizeApiModelListUrls(transApis = []) {
  if (!Array.isArray(transApis)) {
    return transApis;
  }

  let hasChanges = false;
  const nextApis = transApis.map((api) => {
    const nextApi = fillDefaultApiModelListUrl(api);
    // helper 返回新对象时，说明该 API 是需要补字段的旧数据。
    if (nextApi !== api) {
      hasChanges = true;
    }
    return nextApi;
  });

  // 无变更时保留原数组引用，避免触发不必要的持久化更新。
  return hasChanges ? nextApis : transApis;
}

export const DEFAULT_API_TYPE = OPT_TRANS_MICROSOFT;
export const DEFAULT_API_SETTING = DEFAULT_API_LIST.find(
  (a) => a.apiType === DEFAULT_API_TYPE
);
