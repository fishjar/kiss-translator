import {
  DEFAULT_SELECTOR,
  GLOBAL_KEY,
  SHADOW_KEY,
  DEFAULT_RULE,
  BUILTIN_RULES,
} from "./rules";
import { APP_NAME, APP_LCNAME } from "./app";
export { I18N, UI_LANGS } from "./i18n";
export { GLOBAL_KEY, SHADOW_KEY, DEFAULT_RULE, BUILTIN_RULES, APP_LCNAME };

export const STOKEY_MSAUTH = `${APP_NAME}_msauth`;
export const STOKEY_SETTING = `${APP_NAME}_setting`;
export const STOKEY_RULES = `${APP_NAME}_rules`;
export const STOKEY_SYNC = `${APP_NAME}_sync`;
export const STOKEY_FAB = `${APP_NAME}_fab`;
export const STOKEY_RULESCACHE_PREFIX = `${APP_NAME}_rulescache_`;

export const CMD_TOGGLE_TRANSLATE = "toggleTranslate";
export const CMD_TOGGLE_STYLE = "toggleStyle";

export const CLIENT_WEB = "web";
export const CLIENT_CHROME = "chrome";
export const CLIENT_EDGE = "edge";
export const CLIENT_FIREFOX = "firefox";
export const CLIENT_USERSCRIPT = "userscript";
export const CLIENT_EXTS = [CLIENT_CHROME, CLIENT_EDGE, CLIENT_FIREFOX];

export const KV_RULES_KEY = "KT_RULES";
export const KV_RULES_SHARE_KEY = "KT_RULES_SHARE";
export const KV_SETTING_KEY = "KT_SETTING";
export const KV_SALT_SYNC = "KISS-Translator-SYNC";
export const KV_SALT_SHARE = "KISS-Translator-SHARE";

export const CACHE_NAME = `${APP_NAME}_cache`;

export const MSG_FETCH = "fetch";
export const MSG_FETCH_LIMIT = "fetch_limit";
export const MSG_FETCH_CLEAR = "fetch_clear";
export const MSG_TRANS_TOGGLE = "trans_toggle";
export const MSG_TRANS_TOGGLE_STYLE = "trans_toggle_style";
export const MSG_TRANS_GETRULE = "trans_getrule";
export const MSG_TRANS_PUTRULE = "trans_putrule";
export const MSG_TRANS_CURRULE = "trans_currule";

export const EVENT_KISS = "kissEvent";

export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

export const URL_KISS_WORKER = "https://github.com/fishjar/kiss-worker";
export const URL_RAW_PREFIX =
  "https://raw.githubusercontent.com/fishjar/kiss-translator/master";
export const URL_MICROSOFT_AUTH = "https://edge.microsoft.com/translate/auth";
export const URL_MICROSOFT_TRANS =
  "https://api-edge.cognitive.microsofttranslator.com/translate";

export const OPT_TRANS_GOOGLE = "Google";
export const OPT_TRANS_MICROSOFT = "Microsoft";
export const OPT_TRANS_OPENAI = "OpenAI";
export const OPT_TRANS_ALL = [
  OPT_TRANS_GOOGLE,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_OPENAI,
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
  [OPT_TRANS_MICROSOFT]: new Map([
    ["auto", ""],
    ["zh-CN", "zh-Hans"],
    ["zh-TW", "zh-Hant"],
  ]),
  [OPT_TRANS_OPENAI]: new Map(
    OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
  ),
};

export const OPT_STYLE_NONE = "style_none"; // 无
export const OPT_STYLE_LINE = "under_line"; // 下划线
export const OPT_STYLE_DOTLINE = "dot_line"; // 点状线
export const OPT_STYLE_DASHLINE = "dash_line"; // 虚线
export const OPT_STYLE_WAVYLINE = "wavy_line"; // 波浪线
export const OPT_STYLE_FUZZY = "fuzzy"; // 模糊
export const OPT_STYLE_HIGHTLIGHT = "highlight"; // 高亮
export const OPT_STYLE_ALL = [
  OPT_STYLE_NONE,
  OPT_STYLE_LINE,
  OPT_STYLE_DOTLINE,
  OPT_STYLE_DASHLINE,
  OPT_STYLE_WAVYLINE,
  OPT_STYLE_FUZZY,
  OPT_STYLE_HIGHTLIGHT,
];

export const DEFAULT_FETCH_LIMIT = 10; // 默认最大任务数量
export const DEFAULT_FETCH_INTERVAL = 100; // 默认任务间隔时间

export const PROMPT_PLACE_FROM = "{{from}}"; // 占位符
export const PROMPT_PLACE_TO = "{{to}}"; // 占位符

export const DEFAULT_COLOR = "#209CEE"; // 默认高亮背景色/线条颜色

// 全局规则
export const GLOBLA_RULE = {
  pattern: "*",
  selector: DEFAULT_SELECTOR,
  translator: OPT_TRANS_MICROSOFT,
  fromLang: "auto",
  toLang: "zh-CN",
  textStyle: OPT_STYLE_DASHLINE,
  transOpen: "false",
  bgColor: "",
};

// 订阅列表
export const DEFAULT_SUBRULES_LIST = [
  {
    url: process.env.REACT_APP_RULESURL,
    selected: true,
  },
  {
    url: "https://fishjar.github.io/kiss-translator/kiss-translator-rules.json",
    selected: false,
  },
];

export const TRANS_MIN_LENGTH = 5; // 最短翻译长度
export const TRANS_MAX_LENGTH = 5000; // 最长翻译长度

export const DEFAULT_SETTING = {
  darkMode: false, // 深色模式
  uiLang: "en", // 界面语言
  fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量
  fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间
  minLength: TRANS_MIN_LENGTH,
  maxLength: TRANS_MAX_LENGTH,
  clearCache: false, // 是否在浏览器下次启动时清除缓存
  injectRules: true, // 是否注入订阅规则
  subrulesList: DEFAULT_SUBRULES_LIST, // 订阅列表
  googleUrl: "https://translate.googleapis.com/translate_a/single", // 谷歌翻译接口
  openaiUrl: "https://api.openai.com/v1/chat/completions",
  openaiKey: "",
  openaiModel: "gpt-4",
  openaiPrompt: `You will be provided with a sentence in ${PROMPT_PLACE_FROM}, and your task is to translate it into ${PROMPT_PLACE_TO}.`,
};

export const DEFAULT_RULES = [GLOBLA_RULE];

export const DEFAULT_SYNC = {
  syncUrl: "", // 数据同步接口
  syncKey: "", // 数据同步密钥
  settingUpdateAt: 0,
  settingSyncAt: 0,
  rulesUpdateAt: 0,
  rulesSyncAt: 0,
  subRulesSyncAt: 0, // 订阅规则同步时间
};
