import {
  GEMINI_INTERACTIONS_URL,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_SYSTEM_TTS,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_GOOGLE_CLOUD,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_AZUREAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_QWENMT,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
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
  OPT_TRANS_REQUESTY,
  OPT_TRANS_ATLASCLOUD,
  OPT_TRANS_CUSTOMIZE,
} from "../config/apiConstants";

// Vendor endpoints/models and compatibility Hook templates belong to compiled providers.
// The caller supplies scene defaults; these overrides never rewrite saved instances.
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

// AI 翻译接口默认参数
const defaultAiApiOpts = {
  useBatchFetch: true, // 是否启用聚合发送请求
  thinkingMode: "disabled", // 思考模式：auto | enabled | disabled
  thinkingEffort: "_default", // 思考强度：_default=接口默认,不注入参数
  useStream: true, // 是否启用流式传输
  streamRenderMode: "realtime", // 流式渲染模式：disabled/realtime/segment
};

export const NATIVE_PRESET_OVERRIDES = {
  [OPT_TRANS_BUILTINAI]: {
    sourceType: "builtin",
  },
  [OPT_TRANS_SYSTEM_TTS]: {
    sourceType: "builtin",
  },
  [OPT_TRANS_LOCALAI]: {
    sourceType: "local",
    vlmPromptSlug: "",

    isDisabled: true,
  },
  [OPT_TRANS_GOOGLE]: {
    url: "https://translate.googleapis.com/translate_a/single",
  },
  [OPT_TRANS_GOOGLE_2]: {
    url: "https://translate-pa.googleapis.com/v1/translateHtml",
    key: "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520",
    useBatchFetch: true,
    placetag: "a",
    placetagFormat: "attribute",
  },
  [OPT_TRANS_GOOGLE_CLOUD]: {
    url: "https://translation.googleapis.com/language/translate/v2",
    useBatchFetch: true,
  },
  [OPT_TRANS_YANDEX]: {
    url: "https://translate.api.cloud.yandex.net/translate/v2/translate",
    folderId: "",
    useBatchFetch: true,
  },
  [OPT_TRANS_YANDEXFREE]: {},
  [OPT_TRANS_MICROSOFT]: {
    useBatchFetch: true,
  },
  [OPT_TRANS_AZUREAI]: {
    url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0",
    useBatchFetch: true,
  },
  [OPT_TRANS_BAIDU]: {},
  [OPT_TRANS_TENCENT]: {
    useBatchFetch: true,
  },
  [OPT_TRANS_VOLCENGINE]: {},
  [OPT_TRANS_DEEPL]: {
    url: "https://api-free.deepl.com/v2/translate",
    useBatchFetch: true,
  },
  [OPT_TRANS_DEEPLFREE]: {
    fetchLimit: 1,
  },
  [OPT_TRANS_DEEPSEEK]: {
    url: "https://api.deepseek.com/chat/completions",
    modelListUrl: "https://api.deepseek.com/models",
    model: "deepseek-v4-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_OPENCODEGO]: {
    url: "https://opencode.ai/zen/go/v1/chat/completions",
    model: "deepseek-v4-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_SILICONFLOW]: {
    url: "https://api.siliconflow.cn/v1/chat/completions",
    modelListUrl: "https://api.siliconflow.cn/v1/models",
    model: "Pro/zai-org/GLM-4.7",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    url: "https://api.xiaomimimo.com/v1/chat/completions",
    modelListUrl: "https://api.xiaomimimo.com/v1/models",
    model: "mimo-v2.5-pro",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    modelListUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    model: "qwen-plus",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_QWENMT]: {
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-mt-flash",
    useStream: false,
  },
  [OPT_TRANS_CEREBRAS]: {
    url: "https://api.cerebras.ai/v1/chat/completions",
    modelListUrl: "https://api.cerebras.ai/v1/models",
    model: "gpt-oss-120b",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ZAI]: {
    url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    modelListUrl: "https://open.bigmodel.cn/api/paas/v4/models",
    model: "glm-5.1",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_DEEPLX]: {
    url: "http://localhost:1188/translate",
  },
  [OPT_TRANS_EPHONEAI]: {
    url: "https://api.ephone.ai/v1/chat/completions",
  },
  [OPT_TRANS_APIMART]: {
    url: "https://api.apimart.ai/v1/chat/completions",
    modelListUrl: "https://api.apimart.ai/v1/models",
    model: "gpt-5.6-luna",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_OPENAI]: {
    url: "https://api.openai.com/v1/chat/completions",
    modelListUrl: "https://api.openai.com/v1/models",
    model: "gpt-4",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_GEMINI]: {
    // 官方 Gemini 默认使用 GA 的 Interactions；用户自定义 URL 仍由运行时按协议自动分流。
    url: GEMINI_INTERACTIONS_URL,
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-3.6-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_GEMINI_2]: {
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    modelListUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/models",
    model: "gemini-3.6-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CLAUDE]: {
    url: "https://api.anthropic.com/v1/messages",
    modelListUrl: "https://api.anthropic.com/v1/models",
    model: "claude-3-haiku-20240307",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CLOUDFLAREAI]: {
    url: "https://api.cloudflare.com/client/v4/accounts/{{ACCOUNT_ID}}/ai/run/@cf/meta/m2m100-1.2b",
  },
  [OPT_TRANS_OLLAMA]: {
    url: "http://localhost:11434/v1/chat/completions",
    modelListUrl: "http://localhost:11434/v1/models",
    model: "llama3.1",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_OPENROUTER]: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    modelListUrl: "https://openrouter.ai/api/v1/models",
    model: "openai/gpt-4o",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ORCAROUTER]: {
    url: "https://api.orcarouter.ai/v1/chat/completions",
    modelListUrl: "https://api.orcarouter.ai/v1/models",
    model: "openai/gpt-5.4-mini",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_REQUESTY]: {
    url: "https://router.requesty.ai/v1/chat/completions",
    modelListUrl: "https://router.requesty.ai/v1/models",
    model: "openai/gpt-4o-mini",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_ATLASCLOUD]: {
    url: "https://api.atlascloud.ai/v1/chat/completions",
    modelListUrl: "https://api.atlascloud.ai/v1/models",
    model: "deepseek-ai/deepseek-v4-flash",
    ...defaultAiApiOpts,
  },
  [OPT_TRANS_CUSTOMIZE]: {
    reqHook: defaultRequestHook,
    resHook: defaultResponseHook,
  },
};

export const DEFAULT_ENABLED_API_TYPES = new Set([
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_GOOGLE,
  OPT_TRANS_GOOGLE_2,
  OPT_TRANS_BUILTINAI,
]);
