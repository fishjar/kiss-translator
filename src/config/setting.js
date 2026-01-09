import { LogLevel } from "../libs/log";
import {
  OPT_DICT_BING,
  OPT_SUG_YOUDAO,
  DEFAULT_HTTP_TIMEOUT,
  OPT_TRANS_MICROSOFT,
  DEFAULT_API_LIST,
} from "./api";
import { DEFAULT_CUSTOM_STYLES } from "./styles";

// Tone 預設（翻譯風格/語氣指令）
// 內建預設的 id 以 builtin- 開頭，使用者自訂的則使用 uuid
export const DEFAULT_TONES = [
  {
    id: "builtin-default",
    name: "預設",
    description: "通用翻譯，不附加額外指示",
    instruction: "",
    isBuiltin: true,
  },
  {
    id: "builtin-source-close",
    name: "貼近原文",
    description: "偏形式對等；保留原文語序、修辭與限定詞，較少意譯",
    instruction: `Translate with formal equivalence: stay close to the source wording and structure when it remains grammatical.
Rules:
- Keep hedging, modality, qualifiers, and scope exactly accurate (may/might/likely, some/most, unless/only if).
- Preserve emphasis, contrast, and rhetorical devices where possible.
- Do not paraphrase, simplify, or reinterpret.
- Keep terminology consistent; do not substitute with broader or vaguer words.
Do not:
- Add explanations or clarifications not present in the source.
- Summarize or omit any information.`,
    isBuiltin: true,
  },
  {
    id: "builtin-foreignizing",
    name: "保留原味",
    description: "偏異化；保留原文文化詞彙與作者語感，不強行本地化",
    instruction: `Use a foreignizing translation strategy: preserve the source culture and authorial voice.
Rules:
- Keep culture-specific terms, institutions, and proper nouns close to the source; transliterate if needed.
- Avoid replacing culture-specific references with local equivalents unless the source already explains them.
- Keep metaphors and idioms close to the original image when understandable.
- Maintain the author's voice, including formality, humor, or sharpness.
Do not:
- Over-domesticate (do not rewrite into local sayings that change cultural flavor).
- Add explanatory notes or parenthetical explanations (unless the source includes them).`,
    isBuiltin: true,
  },
  {
    id: "builtin-formal",
    name: "正式",
    description: "正式、專業的語氣，適合商業或學術場合",
    instruction: `Use formal, professional tone appropriate for business, academic, or official contexts.
Rules:
- Employ sophisticated vocabulary and structured sentences.
- Maintain respectful, objective language.
- Keep technical terms and proper nouns accurate.
Do not:
- Use colloquialisms, slang, or casual expressions.
- Add informal filler words or conversational phrases.`,
    isBuiltin: true,
  },
  {
    id: "builtin-casual",
    name: "口語化",
    description: "輕鬆日常的對話風格，像朋友聊天",
    instruction: `Use casual, conversational tone as if speaking to a friend.
Rules:
- Use everyday vocabulary and natural speech patterns.
- Keep the friendly, relaxed manner of the original if present.
- Preserve meaning while making it sound approachable.
Do not:
- Use overly formal or stiff expressions.
- Add slang or idioms that significantly change the original meaning.`,
    isBuiltin: true,
  },
  {
    id: "builtin-technical",
    name: "技術文檔",
    description: "保留程式碼、技術術語、API 名稱不翻譯",
    instruction: `Translate technical documentation while preserving all technical elements.
Rules:
- Keep all code blocks, inline code, and code syntax exactly as they appear.
- Preserve API names, function names, variable names, and programming keywords unchanged.
- Keep technical terms, acronyms, and product names in their original form.
- Maintain formatting, indentation, and structure of technical content.
Do not:
- Translate identifiers, function names, or technical jargon.
- Alter code examples or command-line instructions.`,
    isBuiltin: true,
  },
  {
    id: "builtin-literary",
    name: "文學翻譯",
    description: "優美流暢的文學風格，重視意境與美感",
    instruction: `Use elegant, flowing literary style that prioritizes aesthetic quality.
Rules:
- Prioritize natural expression and readability over literal translation.
- Preserve the emotional tone, rhythm, and aesthetic quality of the original.
- Adapt imagery and metaphors to resonate in the target language while keeping their essence.
- Maintain the author's distinctive voice and style.
Do not:
- Produce flat, mechanical translations that lose the literary quality.
- Over-explain or flatten poetic ambiguity.`,
    isBuiltin: true,
  },
];

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

export const TRANS_MIN_LENGTH = 2; // 最短翻译长度
export const TRANS_MAX_LENGTH = 100000; // 最长翻译长度
export const TRANS_NEWLINE_LENGTH = 20; // 换行字符数
export const DEFAULT_BLACKLIST = [
  "https://fishjar.github.io/kiss-translator/options.html",
  "https://translate.google.com",
  "https://www.deepl.com/translator",
]; // 禁用翻译名单
export const DEFAULT_CSPLIST = []; // 禁用CSP名单
export const DEFAULT_ORILIST = ["https://dict.youdao.com"]; // 移除Origin名单

// 同步设置
export const OPT_SYNCTYPE_WORKER = "KISS-Worker";
export const OPT_SYNCTYPE_WEBDAV = "WebDAV";
export const OPT_SYNCTOKEN_PERFIX = "kt_";
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

// 输入框翻译
export const OPT_INPUT_TRANS_SIGNS = ["/", "//", "\\", "\\\\", ">", ">>"];
export const DEFAULT_INPUT_SHORTCUT = ["AltLeft", "KeyI"];
export const DEFAULT_INPUT_RULE = {
  transOpen: true,
  apiSlug: OPT_TRANS_MICROSOFT,
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
  transOpen: true, // 是否启用划词翻译
  apiSlugs: [OPT_TRANS_MICROSOFT],
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
  autoHeight: false, // 自适应高度
  triggerMode: OPT_TRANBOX_TRIGGER_CLICK, // 触发翻译方式
  // extStyles: "", // 附加样式
  enDict: OPT_DICT_BING, // 英文词典
  enSug: OPT_SUG_YOUDAO, // 英文建议
  activeToneId: "builtin-default", // AI 翻译风格
};

const SUBTITLE_WINDOW_STYLE = `padding: 0.5em 1em;
background-color: rgba(0, 0, 0, 0.5);
color: white;
line-height: 1.3;
text-shadow: 1px 1px 2px black;
display: inline-block`;

const SUBTITLE_ORIGIN_STYLE = `font-size: clamp(1rem, 2cqw, 3rem);`;

const SUBTITLE_TRANSLATION_STYLE = `font-size: clamp(1rem, 2cqw, 3rem);`;

export const DEFAULT_SUBTITLE_SETTING = {
  enabled: true, // 是否开启
  apiSlug: OPT_TRANS_MICROSOFT,
  segSlug: "-", // AI智能断句
  chunkLength: 1000, // AI处理切割长度
  preTrans: 90, // 提前翻译时长
  throttleTrans: 30, // 节流翻译间隔
  // fromLang: "en",
  toLang: "zh-CN",
  isBilingual: true, // 是否双语显示
  skipAd: false, // 是否快进广告
  windowStyle: SUBTITLE_WINDOW_STYLE, // 背景样式
  originStyle: SUBTITLE_ORIGIN_STYLE, // 原文样式
  translationStyle: SUBTITLE_TRANSLATION_STYLE, // 译文样式
  isEnhance: true, // 启用增强功能
  activeToneId: "builtin-default", // AI 翻译风格
};

// 订阅列表
export const DEFAULT_SUBRULES_LIST = [
  {
    url: process.env.REACT_APP_RULESURL,
    selected: true,
  },
  {
    url: process.env.REACT_APP_RULESURL_ON,
    selected: false,
  },
  {
    url: process.env.REACT_APP_RULESURL_OFF,
    selected: false,
  },
];

export const DEFAULT_MOUSEHOVER_KEY = ["ControlLeft"];
export const DEFAULT_MOUSE_HOVER_SETTING = {
  useMouseHover: false, // 是否启用鼠标悬停翻译
  mouseHoverKey: DEFAULT_MOUSEHOVER_KEY, // 鼠标悬停翻译组合键
};

export const DEFAULT_SETTING = {
  darkMode: "auto", // 深色模式
  uiLang: "en", // 界面语言
  // fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量(移至rule，作废)
  // fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间(移至rule，作废)
  minLength: TRANS_MIN_LENGTH,
  maxLength: TRANS_MAX_LENGTH,
  newlineLength: TRANS_NEWLINE_LENGTH,
  httpTimeout: DEFAULT_HTTP_TIMEOUT,
  clearCache: false, // 是否在浏览器下次启动时清除缓存
  injectRules: true, // 是否注入订阅规则
  fabClickAction: 0, // 悬浮按钮点击行为
  tones: DEFAULT_TONES,
  // activeToneId: "builtin-default", // 移至rule
  // injectWebfix: true, // 是否注入修复补丁(作废)
  // detectRemote: false, // 是否使用远程语言检测 （从rule移回）
  // contextMenus: true, // 是否添加右键菜单(作废)
  contextMenuType: 1, // 右键菜单类型(0不显示，1简单菜单，2多级菜单)
  // transTag: DEFAULT_TRANS_TAG, // 译文元素标签(移至rule，作废)
  // transOnly: false, // 是否仅显示译文(移至rule，作废)
  // transTitle: false, // 是否同时翻译页面标题(移至rule，作废)
  subrulesList: DEFAULT_SUBRULES_LIST, // 订阅列表
  // owSubrule: DEFAULT_OW_RULE, // 覆写订阅规则 (作废)
  transApis: DEFAULT_API_LIST, // 翻译接口 (v2.0 对象改为数组)
  // mouseKey: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译(移至rule，作废)
  shortcuts: DEFAULT_SHORTCUTS, // 快捷键
  inputRule: DEFAULT_INPUT_RULE, // 输入框设置
  tranboxSetting: DEFAULT_TRANBOX_SETTING, // 划词翻译设置
  // touchTranslate: 2, // 触屏翻译 {5:单指双击，6:单指三击，7:双指双击} (作废)
  touchModes: [2], // 触屏翻译 {5:单指双击，6:单指三击，7:双指双击} (多选)
  blacklist: DEFAULT_BLACKLIST.join(",\n"), // 禁用翻译名单
  csplist: DEFAULT_CSPLIST.join(",\n"), // 禁用CSP名单
  orilist: DEFAULT_ORILIST.join(",\n"), // 禁用CSP名单
  // disableLangs: [], // 不翻译的语言(移至rule，作废)
  skipLangs: [], // 不翻译的语言（从rule移回）
  transInterval: 100, // 翻译等待时间
  langDetector: "-", // 远程语言识别服务
  mouseHoverSetting: DEFAULT_MOUSE_HOVER_SETTING, // 鼠标悬停翻译
  preInit: true, // 是否预加载脚本
  transAllnow: false, // 是否立即全部翻译
  subtitleSetting: DEFAULT_SUBTITLE_SETTING, // 字幕设置
  logLevel: LogLevel.INFO.value, // 日志级别
  rootMargin: 500, // 提前触发翻译
  customStyles: DEFAULT_CUSTOM_STYLES, // 自定义样式列表
};
