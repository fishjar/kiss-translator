import { LogLevel } from "../libs/log";
import {
  OPT_DICT_BING,
  OPT_SUG_YOUDAO,
  DEFAULT_HTTP_TIMEOUT,
  OPT_TRANS_MICROSOFT,
  DEFAULT_API_LIST,
} from "./api";
import { DEFAULT_CUSTOM_STYLES } from "./styles";

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
  // fromLang: "en",
  toLang: "zh-CN",
  isBilingual: true, // 是否双语显示
  skipAd: false, // 是否快进广告
  windowStyle: SUBTITLE_WINDOW_STYLE, // 背景样式
  originStyle: SUBTITLE_ORIGIN_STYLE, // 原文样式
  translationStyle: SUBTITLE_TRANSLATION_STYLE, // 译文样式
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
