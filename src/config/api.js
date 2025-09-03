export const DEFAULT_HTTP_TIMEOUT = 10000; // 调用超时时间
export const DEFAULT_FETCH_LIMIT = 10; // 默认最大任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间
export const DEFAULT_BATCH_INTERVAL = 1000; // 批处理请求间隔时间
export const DEFAULT_BATCH_SIZE = 10; // 每次最多发送段落数量
export const DEFAULT_BATCH_LENGTH = 10000; // 每次发送最大文字数量
export const DEFAULT_CONTEXT_SIZE = 3; // 上下文会话数量

export const INPUT_PLACE_URL = "{{url}}"; // 占位符
export const INPUT_PLACE_FROM = "{{from}}"; // 占位符
export const INPUT_PLACE_TO = "{{to}}"; // 占位符
export const INPUT_PLACE_TEXT = "{{text}}"; // 占位符
export const INPUT_PLACE_KEY = "{{key}}"; // 占位符
export const INPUT_PLACE_MODEL = "{{model}}"; // 占位符

export const OPT_DICT_BAIDU = "Baidu";

export const OPT_TRANS_GOOGLE = "Google";
export const OPT_TRANS_GOOGLE_2 = "Google2";
export const OPT_TRANS_MICROSOFT = "Microsoft";
export const OPT_TRANS_DEEPL = "DeepL";
export const OPT_TRANS_DEEPLX = "DeepLX";
export const OPT_TRANS_DEEPLFREE = "DeepLFree";
export const OPT_TRANS_NIUTRANS = "NiuTrans";
export const OPT_TRANS_BAIDU = "Baidu";
export const OPT_TRANS_TENCENT = "Tencent";
export const OPT_TRANS_VOLCENGINE = "Volcengine";
export const OPT_TRANS_OPENAI = "OpenAI";
export const OPT_TRANS_OPENAI_2 = "OpenAI2";
export const OPT_TRANS_OPENAI_3 = "OpenAI3";
export const OPT_TRANS_GEMINI = "Gemini";
export const OPT_TRANS_GEMINI_2 = "Gemini2";
export const OPT_TRANS_CLAUDE = "Claude";
export const OPT_TRANS_CLOUDFLAREAI = "CloudflareAI";
export const OPT_TRANS_OLLAMA = "Ollama";
export const OPT_TRANS_OLLAMA_2 = "Ollama2";
export const OPT_TRANS_OLLAMA_3 = "Ollama3";
export const OPT_TRANS_OPENROUTER = "OpenRouter";
export const OPT_TRANS_CUSTOMIZE = "Custom";
export const OPT_TRANS_CUSTOMIZE_2 = "Custom2";
export const OPT_TRANS_CUSTOMIZE_3 = "Custom3";
export const OPT_TRANS_CUSTOMIZE_4 = "Custom4";
export const OPT_TRANS_CUSTOMIZE_5 = "Custom5";
export const OPT_TRANS_ALL = [
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_VOLCENGINE,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_NIUTRANS,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENAI_2,
  OPT_TRANS_OPENAI_3,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OLLAMA_2,
  OPT_TRANS_OLLAMA_3,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CUSTOMIZE_2,
  OPT_TRANS_CUSTOMIZE_3,
  OPT_TRANS_CUSTOMIZE_4,
  OPT_TRANS_CUSTOMIZE_5,
];

// 可使用批处理的翻译引擎
export const OPT_TRANS_BATCH = new Set([
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_TENCENT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENAI_2,
  OPT_TRANS_OPENAI_3,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OLLAMA_2,
  OPT_TRANS_OLLAMA_3,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CUSTOMIZE_2,
  OPT_TRANS_CUSTOMIZE_3,
  OPT_TRANS_CUSTOMIZE_4,
  OPT_TRANS_CUSTOMIZE_5,
]);

// 可使用上下文的翻译引擎
export const OPT_TRANS_CONTEXT = new Set([
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENAI_2,
  OPT_TRANS_OPENAI_3,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OLLAMA_2,
  OPT_TRANS_OLLAMA_3,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CUSTOMIZE_2,
  OPT_TRANS_CUSTOMIZE_3,
  OPT_TRANS_CUSTOMIZE_4,
  OPT_TRANS_CUSTOMIZE_5,
]);

export const OPT_LANGDETECTOR_ALL = [
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
];

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
export const OPT_LANGS_FROM = [["auto", "Auto-detect"], ...OPT_LANGS_TO];
export const OPT_LANGS_SPECIAL = {
  [OPT_TRANS_GOOGLE]: new Map(OPT_LANGS_FROM.map(([key]) => [key, key])),
  [OPT_TRANS_GOOGLE_2]: new Map(OPT_LANGS_FROM.map(([key]) => [key, key])),
  [OPT_TRANS_MICROSOFT]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_DEEPL]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key.toUpperCase()]),
    ["auto", ""],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLFREE]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key.toUpperCase()]),
    ["auto", "auto"],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_DEEPLX]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key.toUpperCase()]),
    ["auto", "auto"],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
  ]),
  [OPT_TRANS_NIUTRANS]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "cht"],
  ]),
  [OPT_TRANS_VOLCENGINE]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", "auto"],
    ["zh-CN", "zh"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_BAIDU]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
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
  [OPT_TRANS_OPENAI]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OPENAI_2]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OPENAI_3]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_GEMINI]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_GEMINI_2]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_CLAUDE]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OLLAMA]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OLLAMA_2]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OLLAMA_3]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_OPENROUTER]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
  [OPT_TRANS_CLOUDFLAREAI]: new Map([
    ["auto", ""],
    ["zh-CN", "chinese"],
    ["zh-TW", "chinese"],
    ["en", "english"],
    ["ar", "arabic"],
    ["de", "german"],
    ["ru", "russian"],
    ["fr", "french"],
    ["pt", "portuguese"],
    ["ja", "japanese"],
    ["es", "spanish"],
    ["hi", "hindi"],
  ]),
  [OPT_TRANS_CUSTOMIZE]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
  ]),
  [OPT_TRANS_CUSTOMIZE_2]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
  ]),
  [OPT_TRANS_CUSTOMIZE_3]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
  ]),
  [OPT_TRANS_CUSTOMIZE_4]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
  ]),
  [OPT_TRANS_CUSTOMIZE_5]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
  ]),
};
export const OPT_LANGS_LIST = OPT_LANGS_TO.map(([lang]) => lang);
export const OPT_LANGS_MICROSOFT = new Map(
  Array.from(OPT_LANGS_SPECIAL[OPT_TRANS_MICROSOFT].entries()).map(([k, v]) => [
    v,
    k,
  ])
);
export const OPT_LANGS_BAIDU = new Map(
  Array.from(OPT_LANGS_SPECIAL[OPT_TRANS_BAIDU].entries()).map(([k, v]) => [
    v,
    k,
  ])
);
export const OPT_LANGS_TENCENT = new Map(
  Array.from(OPT_LANGS_SPECIAL[OPT_TRANS_TENCENT].entries()).map(([k, v]) => [
    v,
    k,
  ])
);
OPT_LANGS_TENCENT.set("zh", "zh-CN");

// 翻译接口
const defaultApi = {
  apiSlug: "", // 唯一标识
  apiName: "", // 接口名称
  url: "",
  key: "",
  model: "", // 模型名称
  systemPrompt: `You are a translation API.

Output:
- Return one raw JSON object only.
- Start with "{" and end with "}".
- No fences or extra text.

Input JSON:
{"targetLanguage":"<lang>","title":"<title>","description":"<desc>","segments":[{"id":1,"text":"..."}]}

Output JSON:
{"translations":[{"id":1,"text":"...","sourceLanguage":"<detected-language>"}]}

Rules:
1. Use title/description as context only, do not output them.
2. Keep ids/order/count.
3. Translate inner text only, not HTML tags.
4. Do not translate <code>, <pre>, backticks, or terms like React, Docker, JavaScript, API.
5. Preserve whitespace & entities.
6. Automatically detect the source language of each segment and add it in the "sourceLanguage" field.
7. Empty/unchanged input → unchanged.

Fail-safe: {"translations":[]}`,
  userPrompt: `${INPUT_PLACE_TEXT}`,
  customHeader: "",
  customBody: "",
  reqHook: "", // request 钩子函数
  resHook: "", // response 钩子函数
  fetchLimit: DEFAULT_FETCH_LIMIT, // 最大请求数量
  fetchInterval: DEFAULT_FETCH_INTERVAL, // 请求间隔时间
  httpTimeout: DEFAULT_HTTP_TIMEOUT * 30, // 请求超时时间
  batchInterval: DEFAULT_BATCH_INTERVAL, // 批处理请求间隔时间
  batchSize: DEFAULT_BATCH_SIZE, // 每次最多发送段落数量
  batchLength: DEFAULT_BATCH_LENGTH, // 每次发送最大文字数量
  useBatchFetch: false, // 是否启用聚合发送请求
  useRichText: false, // 是否启用富文本翻译
  useContext: false, // 是否启用智能上下文
  contextSize: DEFAULT_CONTEXT_SIZE, // 智能上下文保留会话数
  temperature: 0,
  maxTokens: 20480,
  think: false,
  thinkIgnore: "qwen3,deepseek-r1",
  isDisabled: false, // 是否不显示
};
const defaultCustomApi = {
  ...defaultApi,
  url: "https://translate.googleapis.com/translate_a/single?client=gtx&dj=1&dt=t&ie=UTF-8&q={{text}}&sl=en&tl=zh-CN",
  reqHook: `// Request Hook
(text, from, to, url, key) => [url, {
  headers: {
      "Content-type": "application/json",
  },
  method: "GET",
  body: null,
}]`,
  resHook: `// Response Hook
(res, text, from, to) => [res.sentences.map((item) => item.trans).join(" "), to === res.src]`,
};
const defaultOpenaiApi = {
  ...defaultApi,
  url: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4",
  fetchLimit: 1,
};
const defaultOllamaApi = {
  ...defaultApi,
  url: "http://localhost:11434/v1/chat/completions",
  model: "llama3.1",
};
export const DEFAULT_TRANS_APIS = {
  [OPT_TRANS_GOOGLE]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_GOOGLE,
    apiName: OPT_TRANS_GOOGLE,
    url: "https://translate.googleapis.com/translate_a/single",
  },
  [OPT_TRANS_GOOGLE_2]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_GOOGLE_2,
    apiName: OPT_TRANS_GOOGLE_2,
    url: "https://translate-pa.googleapis.com/v1/translateHtml",
    key: "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520",
    useBatchFetch: true,
  },
  [OPT_TRANS_MICROSOFT]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_MICROSOFT,
    apiName: OPT_TRANS_MICROSOFT,
    useBatchFetch: true,
  },
  [OPT_TRANS_BAIDU]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_BAIDU,
    apiName: OPT_TRANS_BAIDU,
  },
  [OPT_TRANS_TENCENT]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_TENCENT,
    apiName: OPT_TRANS_TENCENT,
    useBatchFetch: true,
  },
  [OPT_TRANS_VOLCENGINE]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_VOLCENGINE,
    apiName: OPT_TRANS_VOLCENGINE,
  },
  [OPT_TRANS_DEEPL]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_DEEPL,
    apiName: OPT_TRANS_DEEPL,
    url: "https://api-free.deepl.com/v2/translate",
    useBatchFetch: true,
  },
  [OPT_TRANS_DEEPLFREE]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_DEEPLFREE,
    apiName: OPT_TRANS_DEEPLFREE,
    fetchLimit: 1,
  },
  [OPT_TRANS_DEEPLX]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_DEEPLX,
    apiName: OPT_TRANS_DEEPLX,
    url: "http://localhost:1188/translate",
    fetchLimit: 1,
  },
  [OPT_TRANS_NIUTRANS]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_NIUTRANS,
    apiName: OPT_TRANS_NIUTRANS,
    url: "https://api.niutrans.com/NiuTransServer/translation",
    dictNo: "",
    memoryNo: "",
  },
  [OPT_TRANS_OPENAI]: {
    ...defaultOpenaiApi,
    apiSlug: OPT_TRANS_OPENAI,
    apiName: OPT_TRANS_OPENAI,
  },
  [OPT_TRANS_OPENAI_2]: {
    ...defaultOpenaiApi,
    apiSlug: OPT_TRANS_OPENAI_2,
    apiName: OPT_TRANS_OPENAI_2,
  },
  [OPT_TRANS_OPENAI_3]: {
    ...defaultOpenaiApi,
    apiSlug: OPT_TRANS_OPENAI_3,
    apiName: OPT_TRANS_OPENAI_3,
  },
  [OPT_TRANS_GEMINI]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_GEMINI,
    apiName: OPT_TRANS_GEMINI,
    url: `https://generativelanguage.googleapis.com/v1/models/${INPUT_PLACE_MODEL}:generateContent?key=${INPUT_PLACE_KEY}`,
    model: "gemini-2.5-flash",
  },
  [OPT_TRANS_GEMINI_2]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_GEMINI_2,
    apiName: OPT_TRANS_GEMINI_2,
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    model: "gemini-2.0-flash",
  },
  [OPT_TRANS_CLAUDE]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_CLAUDE,
    apiName: OPT_TRANS_CLAUDE,
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-3-haiku-20240307",
  },
  [OPT_TRANS_CLOUDFLAREAI]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_CLOUDFLAREAI,
    apiName: OPT_TRANS_CLOUDFLAREAI,
    url: "https://api.cloudflare.com/client/v4/accounts/{{ACCOUNT_ID}}/ai/run/@cf/meta/m2m100-1.2b",
  },
  [OPT_TRANS_OLLAMA]: {
    ...defaultOllamaApi,
    apiSlug: OPT_TRANS_OLLAMA,
    apiName: OPT_TRANS_OLLAMA,
  },
  [OPT_TRANS_OLLAMA_2]: {
    ...defaultOllamaApi,
    apiSlug: OPT_TRANS_OLLAMA_2,
    apiName: OPT_TRANS_OLLAMA_2,
  },
  [OPT_TRANS_OLLAMA_3]: {
    ...defaultOllamaApi,
    apiSlug: OPT_TRANS_OLLAMA_3,
    apiName: OPT_TRANS_OLLAMA_3,
  },
  [OPT_TRANS_OPENROUTER]: {
    ...defaultApi,
    apiSlug: OPT_TRANS_OPENROUTER,
    apiName: "",
    url: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o",
  },
  [OPT_TRANS_CUSTOMIZE]: {
    ...defaultCustomApi,
    apiSlug: OPT_TRANS_CUSTOMIZE,
    apiName: OPT_TRANS_CUSTOMIZE,
  },
  [OPT_TRANS_CUSTOMIZE_2]: {
    ...defaultCustomApi,
    apiSlug: OPT_TRANS_CUSTOMIZE_2,
    apiName: OPT_TRANS_CUSTOMIZE_2,
  },
  [OPT_TRANS_CUSTOMIZE_3]: {
    ...defaultCustomApi,
    apiSlug: OPT_TRANS_CUSTOMIZE_3,
    apiName: OPT_TRANS_CUSTOMIZE_3,
  },
  [OPT_TRANS_CUSTOMIZE_4]: {
    ...defaultCustomApi,
    apiSlug: OPT_TRANS_CUSTOMIZE_4,
    apiName: OPT_TRANS_CUSTOMIZE_4,
  },
  [OPT_TRANS_CUSTOMIZE_5]: {
    ...defaultCustomApi,
    apiSlug: OPT_TRANS_CUSTOMIZE_5,
    apiName: OPT_TRANS_CUSTOMIZE_5,
  },
};
