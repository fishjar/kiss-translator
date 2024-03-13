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
export const STOKEY_WFRULES = `${APP_NAME}_webfix_rules`;
export const STOKEY_WORDS = `${APP_NAME}_words`;
export const STOKEY_SYNC = `${APP_NAME}_sync`;
export const STOKEY_FAB = `${APP_NAME}_fab`;
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`;
export const STOKEY_WEBFIXCACHE_PREFIX = `${APP_NAME}_webfixcache_`;

export const CMD_TOGGLE_TRANSLATE = "toggleTranslate";
export const CMD_TOGGLE_STYLE = "toggleStyle";
export const CMD_OPEN_OPTIONS = "openOptions";
export const CMD_OPEN_TRANBOX = "openTranbox";

export const CLIENT_WEB = "web";
export const CLIENT_CHROME = "chrome";
export const CLIENT_EDGE = "edge";
export const CLIENT_FIREFOX = "firefox";
export const CLIENT_USERSCRIPT = "userscript";
export const CLIENT_EXTS = [CLIENT_CHROME, CLIENT_EDGE, CLIENT_FIREFOX];

export const KV_RULES_KEY = "kiss-rules.json";
export const KV_WFRULES_KEY = "kiss-webfix.json";
export const KV_WORDS_KEY = "kiss-words.json";
export const KV_RULES_SHARE_KEY = "kiss-rules-share.json";
export const KV_SETTING_KEY = "kiss-setting.json";
export const KV_SALT_SYNC = "KISS-Translator-SYNC";
export const KV_SALT_SHARE = "KISS-Translator-SHARE";

export const CACHE_NAME = `${APP_NAME}_cache`;

export const MSG_FETCH = "fetch";
export const MSG_FETCH_LIMIT = "fetch_limit";
export const MSG_FETCH_CLEAR = "fetch_clear";
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
export const URL_MICROSOFT_TRAN =
  "https://api-edge.cognitive.microsofttranslator.com/translate";
export const URL_MICROSOFT_AUTH = "https://edge.microsoft.com/translate/auth";
export const URL_BAIDU_LANGDETECT = "https://fanyi.baidu.com/langdetect";
export const URL_BAIDU_WEB = "https://fanyi.baidu.com/";
export const URL_BAIDU_TRANSAPI = "https://fanyi.baidu.com/transapi";
export const URL_BAIDU_TRANSAPI_V2 = "https://fanyi.baidu.com/v2transapi";
export const URL_DEEPLFREE_TRAN = "https://www2.deepl.com/jsonrpc";
export const URL_TENCENT_TRANSMART = "https://transmart.qq.com/api/imt";

export const OPT_TRANS_GOOGLE = "Google";
export const OPT_TRANS_MICROSOFT = "Microsoft";
export const OPT_TRANS_DEEPL = "DeepL";
export const OPT_TRANS_DEEPLX = "DeepLX";
export const OPT_TRANS_DEEPLFREE = "DeepLFree";
export const OPT_TRANS_BAIDU = "Baidu";
export const OPT_TRANS_TENCENT = "Tencent";
export const OPT_TRANS_OPENAI = "OpenAI";
export const OPT_TRANS_GEMINI = "Gemini";
export const OPT_TRANS_CLOUDFLAREAI = "CloudflareAI";
export const OPT_TRANS_CUSTOMIZE = "Custom";
export const OPT_TRANS_ALL = [
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_BAIDU,
  OPT_TRANS_TENCENT,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLFREE,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_CUSTOMIZE,
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
    ["auto", ""],
    ["zh-CN", "ZH"],
    ["zh-TW", "ZH"],
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
  [OPT_TRANS_GEMINI]: new Map(
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
};
export const OPT_LANGS_LIST = OPT_LANGS_TO.map(([lang]) => lang);
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
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_HIGHLIGHT,
  OPT_STYLE_BLOCKQUOTE,
];

export const OPT_MOUSEKEY_DISABLE = "mk_disable"; // 滚动加载翻译
export const OPT_MOUSEKEY_PAGEOPEN = "mk_pageopen"; // 直接翻译到底
export const OPT_MOUSEKEY_MOUSEOVER = "mk_mouseover";
export const OPT_MOUSEKEY_CONTROL = "mk_ctrlKey";
export const OPT_MOUSEKEY_SHIFT = "mk_shiftKey";
export const OPT_MOUSEKEY_ALT = "mk_altKey";
export const OPT_MOUSEKEY_ALL = [
  OPT_MOUSEKEY_DISABLE,
  OPT_MOUSEKEY_PAGEOPEN,
  OPT_MOUSEKEY_MOUSEOVER,
  OPT_MOUSEKEY_CONTROL,
  OPT_MOUSEKEY_SHIFT,
  OPT_MOUSEKEY_ALT,
];

export const DEFAULT_FETCH_LIMIT = 10; // 默认最大任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间

export const PROMPT_PLACE_FROM = "{{from}}"; // 占位符
export const PROMPT_PLACE_TO = "{{to}}"; // 占位符
export const PROMPT_PLACE_TEXT = "{{text}}"; // 占位符

export const DEFAULT_COLOR = "#209CEE"; // 默认高亮背景色/线条颜色

// 全局规则
export const GLOBLA_RULE = {
  pattern: "*",
  selector: DEFAULT_SELECTOR,
  keepSelector: DEFAULT_KEEP_SELECTOR,
  terms: "",
  translator: OPT_TRANS_MICROSOFT,
  fromLang: "auto",
  toLang: "zh-CN",
  textStyle: OPT_STYLE_DASHLINE,
  transOpen: "false",
  bgColor: "",
  textDiyStyle: "",
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
export const DEFAULT_TRANBOX_SHORTCUT = ["AltLeft", "KeyS"];
export const DEFAULT_TRANBOX_SETTING = {
  transOpen: true,
  translator: OPT_TRANS_MICROSOFT,
  fromLang: "auto",
  toLang: "zh-CN",
  toLang2: "en",
  tranboxShortcut: DEFAULT_TRANBOX_SHORTCUT,
  btnOffsetX: 10,
  btnOffsetY: 10,
  hideTranBtn: false,
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

// 翻译接口
export const DEFAULT_TRANS_APIS = {
  [OPT_TRANS_GOOGLE]: {
    url: "https://translate.googleapis.com/translate_a/single",
    key: "",
  },
  [OPT_TRANS_DEEPL]: {
    url: "https://api-free.deepl.com/v2/translate",
    key: "",
  },
  [OPT_TRANS_DEEPLX]: {
    url: "http://localhost:1188/translate",
    key: "",
  },
  [OPT_TRANS_OPENAI]: {
    url: "https://api.openai.com/v1/chat/completions",
    key: "",
    model: "gpt-4",
    prompt: `You will be provided with a sentence in ${PROMPT_PLACE_FROM}, and your task is to translate it into ${PROMPT_PLACE_TO}.`,
  },
  [OPT_TRANS_GEMINI]: {
    url: "https://generativelanguage.googleapis.com/v1/models",
    key: "",
    model: "gemini-pro",
    prompt: `Translate the following text from ${PROMPT_PLACE_FROM} to ${PROMPT_PLACE_TO}:\n\n${PROMPT_PLACE_TEXT}`,
  },
  [OPT_TRANS_CLOUDFLAREAI]: {
    url: "https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/meta/m2m100-1.2b",
    key: "",
  },
  [OPT_TRANS_CUSTOMIZE]: {
    url: "",
    key: "",
  },
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

export const DEFAULT_SETTING = {
  darkMode: false, // 深色模式
  uiLang: "en", // 界面语言
  fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量
  fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间
  minLength: TRANS_MIN_LENGTH,
  maxLength: TRANS_MAX_LENGTH,
  newlineLength: TRANS_NEWLINE_LENGTH,
  clearCache: false, // 是否在浏览器下次启动时清除缓存
  injectRules: true, // 是否注入订阅规则
  injectWebfix: true, // 是否注入修复补丁
  detectRemote: false, // 是否使用远程语言检测
  contextMenus: true, // 是否添加右键菜单(作废)
  contextMenuType: 1, // 右键菜单类型(0不显示，1简单菜单，2多级菜单)
  transTag: "span", // 译文元素标签
  transOnly: false, // 是否仅显示译文
  transTitle: false, // 是否同时翻译页面标题
  subrulesList: DEFAULT_SUBRULES_LIST, // 订阅列表
  owSubrule: DEFAULT_OW_RULE, // 覆写订阅规则
  transApis: DEFAULT_TRANS_APIS, // 翻译接口
  mouseKey: OPT_MOUSEKEY_DISABLE, // 翻译时机/鼠标悬停翻译
  shortcuts: DEFAULT_SHORTCUTS, // 快捷键
  inputRule: DEFAULT_INPUT_RULE, // 输入框设置
  tranboxSetting: DEFAULT_TRANBOX_SETTING, // 划词翻译设置
  touchTranslate: 2, // 触屏翻译
  blacklist: DEFAULT_BLACKLIST.join(",\n"), // 禁用翻译名单
  disableLangs: [], // 不翻译的语言
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
