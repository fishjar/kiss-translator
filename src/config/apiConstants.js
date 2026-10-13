/** Pure legacy IDs and feature flags, shared by configuration and compiled providers. */
// --- 基础请求控制参数 ---
export const DEFAULT_HTTP_TIMEOUT = 30; // 调用超时时间 (单位：秒)
export const DEFAULT_FETCH_LIMIT = 10; // 默认最大并行请求/任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间 (单位：毫秒)
export const DEFAULT_BATCH_INTERVAL = 400; // 批处理合并请求的等待延迟时间 (单位：毫秒)
export const DEFAULT_BATCH_SIZE = 20; // 每次翻译请求最多合并发送的 DOM 段落数量
export const DEFAULT_BATCH_LENGTH = 10000; // 每次翻译请求发送的最大字符数限制
export const DEFAULT_BATCH_CONCURRENCY = 10; // 同时执行的聚合批次数量
export const DEFAULT_CONTEXT_SIZE = 3; // AI 翻译时上下文历史条数上限，按完整 user/assistant 轮次向下取整保留

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
export const INPUT_PLACE_SEGMENTS = "{{segments}}"; // 聚合翻译文本片段占位符

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
export const OPT_TRANS_SYSTEM_TTS = "SystemTTS";
export const OPT_TRANS_LOCALAI = "LocalAI";
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
export const OPT_TRANS_APIMART = "APIMart"; // APIMart 翻译服务
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
export const OPT_TRANS_REQUESTY = "Requesty"; // Requesty 多模型聚合 API 翻译
export const OPT_TRANS_CUSTOMIZE = "Custom"; // 自定义翻译 API

// 内置支持的翻译引擎
export const OPT_ALL_TRANS_TYPES = [
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_SYSTEM_TTS,
  OPT_TRANS_LOCALAI,
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
  OPT_TRANS_APIMART,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
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
    OPT_TRANS_LOCALAI,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
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
    OPT_TRANS_REQUESTY,
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
    OPT_TRANS_REQUESTY,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持段落聚合（批处理合并）翻译的引擎
  batch: new Set([
    OPT_TRANS_LOCALAI,
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
    OPT_TRANS_REQUESTY,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持带历史会话（Context）关联的翻译引擎
  context: new Set([
    OPT_TRANS_LOCALAI,
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
    OPT_TRANS_REQUESTY,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
    OPT_TRANS_CUSTOMIZE,
  ]),
  // 支持流式文本返回（Server-Sent Events / Stream）的翻译引擎
  stream: new Set([
    OPT_TRANS_LOCALAI,
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
    OPT_TRANS_REQUESTY,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
  ]),
  // 官方推荐/赞助商的翻译服务
  sponsors: new Set([OPT_TRANS_EPHONEAI, OPT_TRANS_APIMART]),
  // 暗黑模式下图标反色
  darkIcon: new Set([
    OPT_TRANS_SILICONFLOW,
    OPT_TRANS_XIAOMIMIMO,
    OPT_TRANS_EPHONEAI,
    OPT_TRANS_APIMART,
    OPT_TRANS_ZAI,
    OPT_TRANS_DEEPL,
    OPT_TRANS_DEEPLFREE,
    OPT_TRANS_DEEPLX,
    OPT_TRANS_OPENAI,
    OPT_TRANS_OLLAMA,
    OPT_TRANS_OPENROUTER,
  ]),
};
