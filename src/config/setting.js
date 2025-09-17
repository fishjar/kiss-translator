import {
  OPT_DICT_BAIDU,
  DEFAULT_HTTP_TIMEOUT,
  OPT_TRANS_MICROSOFT,
  DEFAULT_TRANS_APIS,
} from "./api";
import { DEFAULT_OW_RULE } from "./rules";

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
export const TRANS_MAX_LENGTH = 10000; // 最长翻译长度
export const TRANS_NEWLINE_LENGTH = 20; // 换行字符数
export const DEFAULT_BLACKLIST = [
  "https://fishjar.github.io/kiss-translator/options.html",
  "https://translate.google.com",
  "https://www.deepl.com/translator",
  "oapi.dingtalk.com",
  "login.dingtalk.com",
]; // 禁用翻译名单
export const DEFAULT_CSPLIST = ["https://github.com"]; // 禁用CSP名单

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
  fabClickAction: 0, // 悬浮按钮点击行为
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
