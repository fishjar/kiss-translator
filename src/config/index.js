import {
  DEFAULT_SELECTOR,
  DEFAULT_KEEP_SELECTOR,
  GLOBAL_KEY,
  REMAIN_KEY,
  SHADOW_KEY,
  DEFAULT_RULE,
  DEFAULT_OW_RULE,
  BUILTIN_RULES,
} from "./rules";
import { APP_NAME, APP_LCNAME } from "./app";
export { I18N, UI_LANGS } from "./i18n";
export {
  GLOBAL_KEY,
  REMAIN_KEY,
  SHADOW_KEY,
  DEFAULT_RULE,
  DEFAULT_OW_RULE,
  BUILTIN_RULES,
  APP_LCNAME,
};

export const STOKEY_MSAUTH = `${APP_NAME}_msauth`;
export const STOKEY_BDAUTH = `${APP_NAME}_bdauth`;
export const STOKEY_SETTING = `${APP_NAME}_setting`;
export const STOKEY_RULES = `${APP_NAME}_rules`;
export const STOKEY_WORDS = `${APP_NAME}_words`;
export const STOKEY_SYNC = `${APP_NAME}_sync`;
export const STOKEY_FAB = `${APP_NAME}_fab`;
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`;

export const CMD_TOGGLE_TRANSLATE = "toggleTranslate";
export const CMD_TOGGLE_STYLE = "toggleStyle";
export const CMD_OPEN_OPTIONS = "openOptions";
export const CMD_OPEN_TRANBOX = "openTranbox";

export const CLIENT_WEB = "web";
export const CLIENT_CHROME = "chrome";
export const CLIENT_EDGE = "edge";
export const CLIENT_FIREFOX = "firefox";
export const CLIENT_USERSCRIPT = "userscript";
export const CLIENT_THUNDERBIRD = "thunderbird";
export const CLIENT_EXTS = [
  CLIENT_CHROME,
  CLIENT_EDGE,
  CLIENT_FIREFOX,
  CLIENT_THUNDERBIRD,
];

export const KV_RULES_KEY = "kiss-rules.json";
export const KV_WORDS_KEY = "kiss-words.json";
export const KV_RULES_SHARE_KEY = "kiss-rules-share.json";
export const KV_SETTING_KEY = "kiss-setting.json";
export const KV_SALT_SYNC = "KISS-Translator-SYNC";
export const KV_SALT_SHARE = "KISS-Translator-SHARE";

export const CACHE_NAME = `${APP_NAME}_cache`;

export const MSG_FETCH = "fetch";
export const MSG_GET_HTTPCACHE = "get_httpcache";
export const MSG_OPEN_OPTIONS = "open_options";
export const MSG_SAVE_RULE = "save_rule";
export const MSG_TRANS_TOGGLE = "trans_toggle";
export const MSG_TRANS_TOGGLE_STYLE = "trans_toggle_style";
export const MSG_OPEN_TRANBOX = "open_tranbox";
export const MSG_TRANS_GETRULE = "trans_getrule";
export const MSG_TRANS_PUTRULE = "trans_putrule";
export const MSG_TRANS_CURRULE = "trans_currule";
export const MSG_CONTEXT_MENUS = "context_menus";
export const MSG_COMMAND_SHORTCUTS = "command_shortcuts";
export const MSG_INJECT_JS = "inject_js";
export const MSG_INJECT_CSS = "inject_css";
export const MSG_UPDATE_CSP = "update_csp";

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export const URL_KISS_WORKER = "https://github.com/fishjar/kiss-worker";
export const URL_KISS_PROXY = "https://github.com/fishjar/kiss-proxy";
export const URL_KISS_RULES = "https://github.com/fishjar/kiss-rules";
export const URL_KISS_RULES_NEW_ISSUE =
  "https://github.com/fishjar/kiss-rules/issues/new";
export const URL_RAW_PREFIX =
  "https://raw.githubusercontent.com/fishjar/kiss-translator/master";

export const URL_CACHE_TRAN = `https://${APP_LCNAME}/translate`;

// api.cognitive.microsofttranslator.com
export const URL_MICROSOFT_TRAN =
  "https://api-edge.cognitive.microsofttranslator.com/translate";
export const URL_MICROSOFT_AUTH = "https://edge.microsoft.com/translate/auth";
export const URL_MICROSOFT_LANGDETECT =
  "https://api-edge.cognitive.microsofttranslator.com/detect?api-version=3.0";

export const URL_GOOGLE_TRAN =
  "https://translate.googleapis.com/translate_a/single";
export const URL_GOOGLE_TRAN2 =
  "https://translate-pa.googleapis.com/v1/translateHtml";
export const DEFAULT_GOOGLE_API_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";

export const URL_BAIDU_LANGDETECT = "https://fanyi.baidu.com/langdetect";
export const URL_BAIDU_SUGGEST = "https://fanyi.baidu.com/sug";
export const URL_BAIDU_TTS = "https://fanyi.baidu.com/gettts";
export const URL_BAIDU_WEB = "https://fanyi.baidu.com/";
export const URL_BAIDU_TRANSAPI = "https://fanyi.baidu.com/transapi";
export const URL_BAIDU_TRANSAPI_V2 = "https://fanyi.baidu.com/v2transapi";
export const URL_DEEPLFREE_TRAN = "https://www2.deepl.com/jsonrpc";
export const URL_TENCENT_TRANSMART = "https://transmart.qq.com/api/imt";
export const URL_VOLCENGINE_TRAN =
  "https://translate.volcengine.com/crx/translate/v1";
export const URL_NIUTRANS_REG =
  "https://niutrans.com/login?active=3&userSource=kiss-translator";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

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
    ["auto", ""],
  ]),
  [OPT_TRANS_CUSTOMIZE_2]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", ""],
  ]),
  [OPT_TRANS_CUSTOMIZE_3]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", ""],
  ]),
  [OPT_TRANS_CUSTOMIZE_4]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", ""],
  ]),
  [OPT_TRANS_CUSTOMIZE_5]: new Map([
    ...OPT_LANGS_FROM.map(([key]) => [key, key]),
    ["auto", ""],
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

export const OPT_STYLE_NONE = "style_none"; // 无
export const OPT_STYLE_LINE = "under_line"; // 下划线
export const OPT_STYLE_DOTLINE = "dot_line"; // 点状线
export const OPT_STYLE_DASHLINE = "dash_line"; // 虚线
export const OPT_STYLE_DASHBOX = "dash_box"; // 虚线框
export const OPT_STYLE_WAVYLINE = "wavy_line"; // 波浪线
export const OPT_STYLE_FUZZY = "fuzzy"; // 模糊
export const OPT_STYLE_HIGHLIGHT = "highlight"; // 高亮
export const OPT_STYLE_BLOCKQUOTE = "blockquote"; // 引用
export const OPT_STYLE_DIY = "diy_style"; // 自定义样式
export const OPT_STYLE_ALL = [
  OPT_STYLE_NONE,
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_DASHBOX,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
  OPT_STYLE_DIY,
];
export const OPT_STYLE_USE_COLOR = [
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_DASHBOX,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
];

export const OPT_TIMING_PAGESCROLL = "mk_pagescroll"; // 滚动加载翻译
export const OPT_TIMING_PAGEOPEN = "mk_pageopen"; // 直接翻译到底
export const OPT_TIMING_MOUSEOVER = "mk_mouseover";
export const OPT_TIMING_CONTROL = "mk_ctrlKey";
export const OPT_TIMING_SHIFT = "mk_shiftKey";
export const OPT_TIMING_ALT = "mk_altKey";
export const OPT_TIMING_ALL = [
  OPT_TIMING_PAGESCROLL,
  OPT_TIMING_PAGEOPEN,
  OPT_TIMING_MOUSEOVER,
  OPT_TIMING_CONTROL,
  OPT_TIMING_SHIFT,
  OPT_TIMING_ALT,
];

export const DEFAULT_FETCH_LIMIT = 10; // 默认最大任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间

export const INPUT_PLACE_URL = "{{url}}"; // 占位符
export const INPUT_PLACE_FROM = "{{from}}"; // 占位符
export const INPUT_PLACE_TO = "{{to}}"; // 占位符
export const INPUT_PLACE_TEXT = "{{text}}"; // 占位符
export const INPUT_PLACE_KEY = "{{key}}"; // 占位符
export const INPUT_PLACE_MODEL = "{{model}}"; // 占位符

export const DEFAULT_COLOR = "#209CEE"; // 默认高亮背景色/线条颜色

export const DEFAULT_TRANS_TAG = "font";
export const DEFAULT_SELECT_STYLE =
  "-webkit-line-clamp: unset; max-height: none; height: auto;";

// 全局规则
export const GLOBLA_RULE = {
  pattern: "*", // 匹配网址
  selector: DEFAULT_SELECTOR, // 选择器
  keepSelector: DEFAULT_KEEP_SELECTOR, // 保留元素选择器
  terms: "", // 专业术语
  translator: OPT_TRANS_MICROSOFT, // 翻译服务
  fromLang: "auto", // 源语言
  toLang: "zh-CN", // 目标语言
  textStyle: OPT_STYLE_DASHLINE, // 译文样式
  transOpen: "false", // 开启翻译
  bgColor: "", // 译文颜色
  textDiyStyle: "", // 自定义译文样式
  selectStyle: DEFAULT_SELECT_STYLE, // 选择器节点样式
  parentStyle: DEFAULT_SELECT_STYLE, // 选择器父节点样式
  injectJs: "", // 注入JS
  injectCss: "", // 注入CSS
  transOnly: "false", // 是否仅显示译文
  transTiming: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译
  transTag: DEFAULT_TRANS_TAG, // 译文元素标签
  transTitle: "false", // 是否同时翻译页面标题
  transSelected: "true", // 是否启用划词翻译
  detectRemote: "false", // 是否使用远程语言检测
  skipLangs: [], // 不翻译的语言
  fixerSelector: "", // 修复函数选择器
  fixerFunc: "-", // 修复函数
  transStartHook: "", // 钩子函数
  transEndHook: "", // 钩子函数
  transRemoveHook: "", // 钩子函数
};

// 输入框翻译
export const OPT_INPUT_TRANS_SIGNS = ["/", "//", "\\", "\\\\", ">", ">>"];
export const DEFAULT_INPUT_SHORTCUT = ["AltLeft", "KeyI"];
export const DEFAULT_INPUT_RULE = {
  transOpen: true,
  translator: OPT_TRANS_MICROSOFT,
  fromLang: "auto",
  toLang: "en",
  triggerShortcut: DEFAULT_INPUT_SHORTCUT,
  triggerCount: 1,
  triggerTime: 200,
  transSign: OPT_INPUT_TRANS_SIGNS[0],
};

// 划词翻译
export const PHONIC_MAP = {
  en_phonic: ["英", "uk"],
  us_phonic: ["美", "en"],
};
export const OPT_TRANBOX_TRIGGER_CLICK = "click";
export const OPT_TRANBOX_TRIGGER_HOVER = "hover";
export const OPT_TRANBOX_TRIGGER_SELECT = "select";
export const OPT_TRANBOX_TRIGGER_ALL = [
  OPT_TRANBOX_TRIGGER_CLICK,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
];
export const DEFAULT_TRANBOX_SHORTCUT = ["AltLeft", "KeyS"];
export const DEFAULT_TRANBOX_SETTING = {
  // transOpen: true, // 是否启用划词翻译（作废，移至rule）
  translator: OPT_TRANS_MICROSOFT,
  fromLang: "auto",
  toLang: "zh-CN",
  toLang2: "en",
  tranboxShortcut: DEFAULT_TRANBOX_SHORTCUT,
  btnOffsetX: 10,
  btnOffsetY: 10,
  boxOffsetX: 0,
  boxOffsetY: 10,
  hideTranBtn: false, // 是否隐藏翻译按钮
  hideClickAway: false, // 是否点击外部关闭弹窗
  simpleStyle: false, // 是否简洁界面
  followSelection: false, // 翻译框是否跟随选中文本
  triggerMode: OPT_TRANBOX_TRIGGER_CLICK, // 触发翻译方式
  extStyles: "", // 附加样式
  enDict: OPT_DICT_BAIDU, // 英文词典
};

// 订阅列表
export const DEFAULT_SUBRULES_LIST = [
  {
    url: process.env.REACT_APP_RULESURL,
    selected: false,
  },
  {
    url: process.env.REACT_APP_RULESURL_ON,
    selected: true,
  },
  {
    url: process.env.REACT_APP_RULESURL_OFF,
    selected: false,
  },
];

export const DEFAULT_HTTP_TIMEOUT = 5000; // 调用超时时间

// 翻译接口
const defaultCustomApi = {
  url: "",
  key: "",
  customOption: "", // (作废)
  reqHook: "", // request 钩子函数
  resHook: "", // response 钩子函数
  fetchLimit: DEFAULT_FETCH_LIMIT,
  fetchInterval: DEFAULT_FETCH_INTERVAL,
  apiName: "",
  isDisabled: false,
  httpTimeout: DEFAULT_HTTP_TIMEOUT,
};
const defaultOpenaiApi = {
  url: "https://api.openai.com/v1/chat/completions",
  key: "",
  model: "gpt-4",
  systemPrompt: `You are a professional, authentic machine translation engine.`,
  userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
  customHeader: "",
  customBody: "",
  temperature: 0,
  maxTokens: 256,
  fetchLimit: 1,
  fetchInterval: 500,
  apiName: "",
  isDisabled: false,
  httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
};
const defaultOllamaApi = {
  url: "http://localhost:11434/api/generate",
  key: "",
  model: "llama3.1",
  systemPrompt: `You are a professional, authentic machine translation engine.`,
  userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
  customHeader: "",
  customBody: "",
  think: false,
  thinkIgnore: `qwen3,deepseek-r1`,
  fetchLimit: 1,
  fetchInterval: 500,
  apiName: "",
  isDisabled: false,
  httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
};
export const DEFAULT_TRANS_APIS = {
  [OPT_TRANS_GOOGLE]: {
    url: URL_GOOGLE_TRAN,
    key: "",
    fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量
    fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间
    apiName: OPT_TRANS_GOOGLE, // 接口自定义名称
    isDisabled: false, // 是否禁用
    httpTimeout: DEFAULT_HTTP_TIMEOUT, // 超时时间
  },
  [OPT_TRANS_GOOGLE_2]: {
    url: URL_GOOGLE_TRAN2,
    key: DEFAULT_GOOGLE_API_KEY,
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_GOOGLE_2,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_MICROSOFT]: {
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_MICROSOFT,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_BAIDU]: {
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_BAIDU,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_TENCENT]: {
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_TENCENT,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_VOLCENGINE]: {
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_VOLCENGINE,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_DEEPL]: {
    url: "https://api-free.deepl.com/v2/translate",
    key: "",
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_DEEPL,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_DEEPLFREE]: {
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_DEEPLFREE,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_DEEPLX]: {
    url: "http://localhost:1188/translate",
    key: "",
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_DEEPLX,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_NIUTRANS]: {
    url: "https://api.niutrans.com/NiuTransServer/translation",
    key: "",
    dictNo: "",
    memoryNo: "",
    fetchLimit: DEFAULT_FETCH_LIMIT,
    fetchInterval: DEFAULT_FETCH_INTERVAL,
    apiName: OPT_TRANS_NIUTRANS,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT,
  },
  [OPT_TRANS_OPENAI]: defaultOpenaiApi,
  [OPT_TRANS_OPENAI_2]: defaultOpenaiApi,
  [OPT_TRANS_OPENAI_3]: defaultOpenaiApi,
  [OPT_TRANS_GEMINI]: {
    url: `https://generativelanguage.googleapis.com/v1/models/${INPUT_PLACE_MODEL}:generateContent?key=${INPUT_PLACE_KEY}`,
    key: "",
    model: "gemini-2.5-flash",
    systemPrompt: `You are a professional, authentic machine translation engine.`,
    userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
    customHeader: "",
    customBody: "",
    temperature: 0,
    maxTokens: 2048,
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_GEMINI,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
  },
  [OPT_TRANS_GEMINI_2]: {
    url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    key: "",
    model: "gemini-2.0-flash",
    systemPrompt: `You are a professional, authentic machine translation engine.`,
    userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
    customHeader: "",
    customBody: "",
    temperature: 0,
    maxTokens: 2048,
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_GEMINI_2,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
  },
  [OPT_TRANS_CLAUDE]: {
    url: "https://api.anthropic.com/v1/messages",
    key: "",
    model: "claude-3-haiku-20240307",
    systemPrompt: `You are a professional, authentic machine translation engine.`,
    userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
    customHeader: "",
    customBody: "",
    temperature: 0,
    maxTokens: 1024,
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_CLAUDE,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
  },
  [OPT_TRANS_CLOUDFLAREAI]: {
    url: "https://api.cloudflare.com/client/v4/accounts/{{ACCOUNT_ID}}/ai/run/@cf/meta/m2m100-1.2b",
    key: "",
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_CLOUDFLAREAI,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
  },
  [OPT_TRANS_OLLAMA]: defaultOllamaApi,
  [OPT_TRANS_OLLAMA_2]: defaultOllamaApi,
  [OPT_TRANS_OLLAMA_3]: defaultOllamaApi,
  [OPT_TRANS_OPENROUTER]: {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: "",
    model: "openai/gpt-4o",
    systemPrompt: `You are a professional, authentic machine translation engine.`,
    userPrompt: `Translate the following source text from ${INPUT_PLACE_FROM} to ${INPUT_PLACE_TO}. Output translation directly without any additional text.\n\nSource Text: ${INPUT_PLACE_TEXT}\n\nTranslated Text:`,
    customHeader: "",
    customBody: "",
    temperature: 0,
    maxTokens: 256,
    fetchLimit: 1,
    fetchInterval: 500,
    apiName: OPT_TRANS_OPENROUTER,
    isDisabled: false,
    httpTimeout: DEFAULT_HTTP_TIMEOUT * 2,
  },
  [OPT_TRANS_CUSTOMIZE]: defaultCustomApi,
  [OPT_TRANS_CUSTOMIZE_2]: defaultCustomApi,
  [OPT_TRANS_CUSTOMIZE_3]: defaultCustomApi,
  [OPT_TRANS_CUSTOMIZE_4]: defaultCustomApi,
  [OPT_TRANS_CUSTOMIZE_5]: defaultCustomApi,
};

// 默认快捷键
export const OPT_SHORTCUT_TRANSLATE = "toggleTranslate";
export const OPT_SHORTCUT_STYLE = "toggleStyle";
export const OPT_SHORTCUT_POPUP = "togglePopup";
export const OPT_SHORTCUT_SETTING = "openSetting";
export const DEFAULT_SHORTCUTS = {
  [OPT_SHORTCUT_TRANSLATE]: ["AltLeft", "KeyQ"],
  [OPT_SHORTCUT_STYLE]: ["AltLeft", "KeyC"],
  [OPT_SHORTCUT_POPUP]: ["AltLeft", "KeyK"],
  [OPT_SHORTCUT_SETTING]: ["AltLeft", "KeyO"],
};

export const TRANS_MIN_LENGTH = 5; // 最短翻译长度
export const TRANS_MAX_LENGTH = 5000; // 最长翻译长度
export const TRANS_NEWLINE_LENGTH = 20; // 换行字符数
export const DEFAULT_BLACKLIST = [
  "https://fishjar.github.io/kiss-translator/options.html",
  "https://translate.google.com",
  "https://www.deepl.com/translator",
  "oapi.dingtalk.com",
  "login.dingtalk.com",
]; // 禁用翻译名单
export const DEFAULT_CSPLIST = ["https://github.com"]; // 禁用CSP名单

export const DEFAULT_SETTING = {
  darkMode: false, // 深色模式
  uiLang: "en", // 界面语言
  // fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量(移至transApis，作废)
  // fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间(移至transApis，作废)
  minLength: TRANS_MIN_LENGTH,
  maxLength: TRANS_MAX_LENGTH,
  newlineLength: TRANS_NEWLINE_LENGTH,
  httpTimeout: DEFAULT_HTTP_TIMEOUT,
  clearCache: false, // 是否在浏览器下次启动时清除缓存
  injectRules: true, // 是否注入订阅规则
  // injectWebfix: true, // 是否注入修复补丁(作废)
  // detectRemote: false, // 是否使用远程语言检测(移至rule，作废)
  // contextMenus: true, // 是否添加右键菜单(作废)
  contextMenuType: 1, // 右键菜单类型(0不显示，1简单菜单，2多级菜单)
  // transTag: DEFAULT_TRANS_TAG, // 译文元素标签(移至rule，作废)
  // transOnly: false, // 是否仅显示译文(移至rule，作废)
  // transTitle: false, // 是否同时翻译页面标题(移至rule，作废)
  subrulesList: DEFAULT_SUBRULES_LIST, // 订阅列表
  owSubrule: DEFAULT_OW_RULE, // 覆写订阅规则
  transApis: DEFAULT_TRANS_APIS, // 翻译接口
  // mouseKey: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译(移至rule，作废)
  shortcuts: DEFAULT_SHORTCUTS, // 快捷键
  inputRule: DEFAULT_INPUT_RULE, // 输入框设置
  tranboxSetting: DEFAULT_TRANBOX_SETTING, // 划词翻译设置
  touchTranslate: 2, // 触屏翻译
  blacklist: DEFAULT_BLACKLIST.join(",\n"), // 禁用翻译名单
  csplist: DEFAULT_CSPLIST.join(",\n"), // 禁用CSP名单
  // disableLangs: [], // 不翻译的语言(移至rule，作废)
  transInterval: 500, // 翻译间隔时间
  langDetector: OPT_TRANS_MICROSOFT, // 远程语言识别服务
};

export const DEFAULT_RULES = [GLOBLA_RULE];

export const OPT_SYNCTYPE_WORKER = "KISS-Worker";
export const OPT_SYNCTYPE_WEBDAV = "WebDAV";
export const OPT_SYNCTYPE_ALL = [OPT_SYNCTYPE_WORKER, OPT_SYNCTYPE_WEBDAV];

export const DEFAULT_SYNC = {
  syncType: OPT_SYNCTYPE_WORKER, // 同步方式
  syncUrl: "", // 数据同步接口
  syncUser: "", // 数据同步用户名
  syncKey: "", // 数据同步密钥
  syncMeta: {}, // 数据更新及同步信息
  subRulesSyncAt: 0, // 订阅规则同步时间
  dataCaches: {}, // 缓存同步时间
};
