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
export const OPT_TRANS_MICROSOFT = "Microsoft"; // 微软翻译服务
export const OPT_TRANS_AZUREAI = "AzureAI"; // 微软 Azure 翻译
export const OPT_TRANS_DEEPSEEK = "DeepSeek"; // DeepSeek 深度求索 AI 翻译
export const OPT_TRANS_OPENCODEGO = "OpenCodeGo"; // OpenCode Go AI 翻译订阅服务
export const OPT_TRANS_SILICONFLOW = "SiliconFlow"; // 硅基流动 AI 翻译 (云端部署大模型)
export const OPT_TRANS_XIAOMIMIMO = "XiaomiMimo"; // 小米米莫 AI 翻译
export const OPT_TRANS_ALIYUNBAILIAN = "AliyunBailian"; // 阿里云百炼大模型翻译
export const OPT_TRANS_CEREBRAS = "Cerebras"; // Cerebras AI 翻译极速推理服务
export const OPT_TRANS_ZAI = "Zai"; // 智谱 AI 翻译服务
export const OPT_TRANS_DEEPL = "DeepL"; // DeepL 官方专业翻译 API
export const OPT_TRANS_DEEPLX = "DeepLX"; // DeepLX 开源/自定义中转端
export const OPT_TRANS_DEEPLFREE = "DeepLFree"; // DeepL 免费网页翻译接口
export const OPT_TRANS_EPHONEAI = "ePhoneAI"; // ePhone AI 翻译服务
export const OPT_TRANS_BAIDU = "Baidu"; // 百度翻译 API
export const OPT_TRANS_TENCENT = "Tencent"; // 腾讯翻译君 API
export const OPT_TRANS_VOLCENGINE = "Volcengine"; // 火山翻译 API
export const OPT_TRANS_OPENAI = "OpenAI"; // OpenAI 官方大模型 API 翻译
export const OPT_TRANS_GEMINI = "Gemini"; // 谷歌 Gemini API 翻译 (原版接口形式)
export const OPT_TRANS_GEMINI_2 = "Gemini2"; // 谷歌 Gemini API 翻译 (OpenAI 兼容接口形式)
export const OPT_TRANS_CLAUDE = "Claude"; // Anthropic Claude 翻译
export const OPT_TRANS_CLOUDFLAREAI = "CloudflareAI"; // Cloudflare Workers AI 翻译
export const OPT_TRANS_OLLAMA = "Ollama"; // 本地部署 Ollama 模型翻译
export const OPT_TRANS_OPENROUTER = "OpenRouter"; // OpenRouter 多模型聚合 API 翻译
export const OPT_TRANS_CUSTOMIZE = "Custom"; // 自定义翻译 API

// 内置支持的翻译引擎
export const OPT_ALL_TRANS_TYPES = [
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  // OPT_TRANS_BAIDU,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
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
  OPT_TRANS_CUSTOMIZE,
];

export const OPT_LANGDETECTOR_ALL = [
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
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
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持多 API Key 轮询/备用的引擎
  mulkeys: new Set([
    OPT_TRANS_AZUREAI,
    OPT_TRANS_DEEPSEEK,
    OPT_TRANS_OPENCODEGO,
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_ALIYUNBAILIAN,
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
    OPT_TRANS_MICROSOFT,
    OPT_TRANS_TENCENT,
    OPT_TRANS_DEEPL,
    OPT_TRANS_OPENAI,
    OPT_TRANS_GEMINI,
    OPT_TRANS_GEMINI_2,
    OPT_TRANS_CLAUDE,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
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

// REVIEW: 思考模式参数映射：定义各 API 的思考开关和强度参数。
// 这里的设计可以将 AI 推理模型的“思考过程”(Reasoning Effort) 与普通参数解耦，支持可视化调节。
// type: 对应的厂商/平台类型；efforts: 思考强度级别列表 (如 max, high 等)，null 表示仅支持开启/关闭，无多档强度可选。
// disableSupported: 是否允许用户手动关闭思考模式，默认 true。若为 false 则说明该模型强制开启思考（如 Claude 的部分高推理模型）。
export const THINKING_PARAM_MAP = {
  [OPT_TRANS_DEEPSEEK]: {
    type: "deepseek",
    efforts: [
      { value: "max", label: "Max" },
      { value: "high", label: "High" },
    ],
  },
  [OPT_TRANS_OPENCODEGO]: {
    type: "deepseek",
    efforts: [
      { value: "max", label: "Max" },
      { value: "high", label: "High" },
    ],
  },
  [OPT_TRANS_SILICONFLOW]: {
    type: "siliconflow",
    efforts: [
      { value: "max", label: "Max (32768)" },
      { value: "high", label: "High (16384)" },
      { value: "medium", label: "Medium (8192)" },
      { value: "low", label: "Low (4096)" },
      { value: "minimal", label: "Minimal (2048)" },
    ],
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    type: "deepseek",
    efforts: null,
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    type: "aliyunbailian",
    efforts: null,
  },
  [OPT_TRANS_CEREBRAS]: {
    type: "cerebras",
    efforts: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  [OPT_TRANS_ZAI]: {
    type: "deepseek",
    efforts: null,
  },
  [OPT_TRANS_EPHONEAI]: {
    type: "openai",
    efforts: [
      { value: "xhigh", label: "X-High" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "minimal", label: "Minimal" },
    ],
  },
  [OPT_TRANS_OPENAI]: {
    type: "openai",
    efforts: [
      { value: "xhigh", label: "X-High" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "minimal", label: "Minimal" },
    ],
  },
  [OPT_TRANS_GEMINI]: {
    type: "gemini",
    efforts: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "minimal", label: "Minimal" },
    ],
  },
  [OPT_TRANS_GEMINI_2]: {
    type: "openai",
    efforts: [
      { value: "xhigh", label: "X-High" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "minimal", label: "Minimal" },
    ],
  },
  [OPT_TRANS_CLAUDE]: {
    type: "claude",
    disableSupported: false,
    efforts: [
      { value: "max", label: "Max" },
      { value: "xhigh", label: "X-High" },
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  [OPT_TRANS_OLLAMA]: {
    type: "cerebras",
    efforts: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
    ],
  },
  [OPT_TRANS_OPENROUTER]: {
    type: "openrouter",
    disableSupported: false,
    efforts: [
      { value: "high", label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low", label: "Low" },
      { value: "minimal", label: "Minimal" },
    ],
  },
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
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
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
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPSEEK]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_OPENCODEGO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_SILICONFLOW]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_XIAOMIMIMO]: OPT_LANGS_SPEC_NAME,
  [OPT_TRANS_ALIYUNBAILIAN]: OPT_LANGS_SPEC_NAME,
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
  [OPT_TRANS_CLOUDFLAREAI]: new Map([
    ...OPT_LANGS_SPEC_DEFAULT,
    ["auto", "en"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
  ]),
  [OPT_TRANS_CUSTOMIZE]: OPT_LANGS_SPEC_NAME,
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
3. Output ONLY the translated text. No markdown, no explanations.

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
4.  Highest priority: Follow 'glossary'. Use value for translation; if value is "", keep the key.
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
4.  **Glossary**: Highest priority. Use the glossary value for translation. If the value is "", keep the source term as is.
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
7.  **Glossary**: Highest priority. Follow 'glossary'. Use value for translation; if value is "", keep the key.
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
export const defaultDictPrompt = `# Role
你是一位精通对比语言学、现代语料库语言学的专家级词典编纂者。请为用户输入的文本提供兼具学术严谨性与视觉优雅感的全方位解析或高质量翻译。

# Execution Rules
1. **智能分流机制（CRITICAL）**：请严格基于下方 \`[Target / 目标文本]\` 的长度和性质决定工作模式：
   - **词典模式**：如果 \`[Target / 目标文本]\` 是**单个单词、短语、成语或固定搭配**，请严格执行下方的【词典输出格式】。
   - **纯翻译模式**：如果 \`[Target / 目标文本]\` 是**一个完整的句子、段落或长文本**，请**立即放弃词典格式**，仅提供该文本的高质量、地道双语翻译。禁止输出音标、词源、搭配和例句等无关内容。
2. **语境优先原则**：在【词典模式】下，若 \`[Context / 上下文]\` 中存在有效信息，请优先锁定该词在特定语境下的义项，并将其置于释义首位。
3. **格式死线**：无论进入哪种模式，严格按对应格式输出，禁止输出任何前导寒暄（如“好的”、“为您解析”）或尾部总结。

---

# Output Format (仅限【词典模式】执行)

## 词条：[原词/短语]
> [如果该词在 \`[Context]\` 中发生了时态/复数/屈折变形，在此处括号内注明其原型，例如：(原型: Go)]

### 1. 基础形态与音标 (Essentials)
- **发音标注**：🇺🇸 [美式音标] ｜ uk [英式音标] （*若非英语词汇，请自动切换为目标语言的标准注音/假名/拼音*）
- **词性与核心义项**：
  - \`[词性缩写. (如 v. / adj.)]\` ① [核心中文释义1] ② [核心中文释义2]
  - \`[词性缩写.]\` ① [核心中文释义1]

### 2. 语境精析 (Contextual Mapping) *[仅在具有有效 Context 时生成本板块]*
- **当前语义锁定**：该词在给定语境中表现为 \`[词性]\`，精确含义为“[中文释义]”。
- **语境色调**：[明示该词在此处的修辞色彩，如：感情色彩（褒/贬/中性）｜ 语体（正式书面/职场专业/俚语口语）]
- **原句平替词**：[提供 1-2 个在当前语境中可无缝替换、不改变原意的近义词]

### 3. 词源深度解构与辨析 (Deep Dive)
- **词源与记忆锚点**：[拆解词根词缀、历史演变，或提供一个逻辑清晰的联想记忆法]
- **高频搭配 (Collocations)**：
  * \`[搭配 1]\` ➔ [中文精准翻译]
  * \`[搭配 2]\` ➔ [中文精准翻译]
- **同义词微观辨析 (Synonyms)**：
  * **[原词] vs [近义词1] vs [近义词2]**：[用 1-2 句话点透它们在“使用语境”、“语气轻重”或“搭配习惯”上的微妙区别]

### 4. 语料库双解例句 (Corpus Examples)
[请提供 2-3 个来自真实出版物、新闻或地道日常场景的优质双语例句]

1. **[地道英文/源语言例句]**
   - 💡 *中文翻译*：[精准的、符合中文习惯的翻译]
   - 📌 *场景标签*：\`[学术写作 / 商务邮件 / 日常街头 / 科技新闻]\``;

// 专家级AI词典用户提示词
export const defaultDictUserPrompt = `# Input Data

## [Context / 上下文] (Optional)
> 以下信息用于辅助精准锁定目标文本的语境：
- 文档标题：${INPUT_PLACE_TITLE}
- 文档描述：${INPUT_PLACE_DESCRIPTION}
- 文档摘要：${INPUT_PLACE_SUMMARY}
- 所在段落：${INPUT_PLACE_CONTEXT}

## [Target / 目标文本] (Required)
> 触发【词典模式】或【纯翻译模式】的核心判定对象：
${INPUT_PLACE_TEXT}`;

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
2. Format per element: {"s":<first_word_id>, "e":<last_word_id>, "o":"merged original text", "t":"translation"}
3. The "s" (start) and "e" (end) fields must represent inclusive, exact word IDs from the input.
4. Completeness: Cover every single word from the input exactly once. No missing words, no overlaps, and no gaps.

# Rules
1. Length Constraint: Keep each subtitle segment concise for on-screen readability. The translation ("t") and original text ("o") should ideally not exceed 12 words per segment. Split longer sentences at logical break points.
2. Segmentation: Merge words into complete sentences or logical phrases. Split at natural pauses, conjunctions, or punctuation marks to maintain a natural reading pace.
3. Pause Indicators: Use the "p" (pause level 1-3) attribute in the input as a hint for segmentation. Higher "p" values indicate stronger sentence boundaries, but grammatical correctness and semantic coherence always take priority.
4. Translation Quality: Translate accurately and naturally, strictly adhering to the provided Context, Tone, and Glossary.

# Example
Input: [{"id":0,"text":"Hello"},{"id":1,"text":"world!"},{"id":2,"text":"Good","p":2},{"id":3,"text":"morning."}]
Output: [{"s":0,"e":1,"o":"Hello world!","t":"你好，世界！"},{"s":2,"e":3,"o":"Good morning.","t":"早上好。"}]`;

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
  aiTerms: "", // AI智能专业术语 （todo: 备用）
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
  useBatchFetch: false, // 是否启用聚合发送请求
  useStream: false, // 是否启用流式传输
  streamRenderMode: "disabled", // 流式渲染模式：disabled/realtime/segment
  transAllnow: false, // 是否立即全部翻译
  rootMargin: 2000, // 滚动加载提前触发距离
  useContext: false, // 是否启用智能上下文
  contextSize: DEFAULT_CONTEXT_SIZE, // 智能上下文保留会话数
  temperature: 0.0,
  maxTokens: 20480,
  thinkingMode: "auto", // 思考模式：auto | enabled | disabled
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
    url: `https://generativelanguage.googleapis.com/v1beta/models/${INPUT_PLACE_MODEL}:generateContent`,
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-2.5-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_GEMINI_2]: {
    ...defaultApi,
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-2.0-flash",
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
  [OPT_TRANS_CUSTOMIZE]: {
    ...defaultApi,
    reqHook: defaultRequestHook,
    resHook: defaultResponseHook,
  },
};

// 内置翻译接口列表（带参数）
export const DEFAULT_API_LIST = OPT_ALL_TRANS_TYPES.map((apiType) => ({
  ...defaultApiOpts[apiType],
  apiSlug: apiType,
  apiName: apiType,
  apiType,
}));

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
