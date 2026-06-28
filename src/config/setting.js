/**
 * @file setting.js
 * @description 应用默认全局设置定义模块。定义快捷键、默认输入框即时翻译规则、划词翻译与词典面板配置、字幕样式及同步 WebDAV 基础结构。
 */

import { LogLevel } from "../libs/log";
import {
  OPT_DICT_BING,
  OPT_SUG_YOUDAO,
  DEFAULT_HTTP_TIMEOUT,
  OPT_TRANS_MICROSOFT,
  DEFAULT_API_LIST,
} from "./api";
import {
  CURRENT_SETTINGS_VERSION,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  PROMPT_MODE_FOLLOW_API,
} from "./prompt";
import { DEFAULT_CUSTOM_STYLES } from "./styles";

// --- 默认系统快捷键映射 ---
export const OPT_SHORTCUT_TRANSLATE = "toggleTranslate"; // 切换整页双语翻译
export const OPT_SHORTCUT_TRANSONLY = "toggleTransOnly"; // 切换仅显示译文
export const OPT_SHORTCUT_STYLE = "toggleStyle"; // 切换译文呈现样式
export const OPT_SHORTCUT_POPUP = "togglePopup"; // 切换打开划词翻译弹窗
export const OPT_SHORTCUT_SETTING = "openSetting"; // 打开设置页面
export const DEFAULT_SHORTCUTS = {
  [OPT_SHORTCUT_TRANSLATE]: ["AltLeft", "KeyQ"], // Alt + Q 翻译整页
  [OPT_SHORTCUT_STYLE]: ["AltLeft", "KeyC"], // Alt + C 切换样式
  [OPT_SHORTCUT_POPUP]: ["AltLeft", "KeyK"], // Alt + K 显隐弹窗
  [OPT_SHORTCUT_SETTING]: ["AltLeft", "KeyO"], // Alt + O 打开设置
};

export const TRANS_MIN_LENGTH = 2; // 触发网页翻译的最小文本字符数 (过短字符如单个字母不予处理)
export const TRANS_MAX_LENGTH = 100000; // 单次翻译的最大字符数
export const TRANS_NEWLINE_LENGTH = 20; // 文本被认定为需要单独换行的长度限制

// 默认不参与整页翻译的网站黑名单 (例如翻译工具本身、特定系统页，避免死循环翻译)
export const DEFAULT_BLACKLIST = [
  "https://fishjar.github.io/kiss-translator/options.html",
  "https://translate.google.com",
  "https://www.deepl.com/translator",
];
export const DEFAULT_CSPLIST = []; // 默认禁用 CSP 安全策略的网址列表
export const DEFAULT_ORILIST = ["https://dict.youdao.com"]; // 默认在跨域请求中需要重写 Origin 请求头的域名

// --- 配置同步设置 ---
export const OPT_SYNCTYPE_WORKER = "KISS-Worker"; // 自建 Cloudflare Worker 同步方案
export const OPT_SYNCTYPE_WEBDAV = "WebDAV"; // 通用 WebDAV 网盘同步方案
export const OPT_SYNCTYPE_GIST = "GitHub Gist"; // GitHub Gist 同步方案
export const OPT_SYNCTOKEN_PERFIX = "kt_"; // 自建同步服务的 Token 前缀
export const OPT_SYNCTYPE_ALL = [
  OPT_SYNCTYPE_WORKER,
  OPT_SYNCTYPE_WEBDAV,
  OPT_SYNCTYPE_GIST,
];
export const DEFAULT_SYNC = {
  syncType: OPT_SYNCTYPE_WORKER, // 默认同步方式
  syncUrl: "", // 数据同步服务器端点
  syncUser: "", // 同步用户名
  syncKey: "", // 同步密码或 Token
  syncEncryptKey: "", // 同步数据端到端加密口令
  syncMeta: {}, // 存储同步的元信息 (如文件 ETag/修改时间等)
  subRulesSyncAt: 0, // 上一次订阅规则同步的时间戳
  dataCaches: {}, // 各类缓存项的最近同步时间
};

// --- 输入框即时翻译图标(点)的显示策略 ---
export const OPT_INPUT_DOT_DISABLE = "-"; // 彻底不显示图标
export const OPT_INPUT_DOT_MOBILE = "mobile"; // 仅在移动端浏览器中显示
export const OPT_INPUT_DOT_ALWAYS = "always"; // 始终显示在输入框边缘

// --- 输入框即时翻译配置 ---
export const OPT_INPUT_TRANS_SIGNS = ["/", "//", "\\", "\\\\", ">", ">>"]; // 支持的触发翻译符号
export const DEFAULT_INPUT_SHORTCUT = ["AltLeft", "KeyI"]; // 触发输入框翻译的键盘快捷键
export const DEFAULT_INPUT_RULE = {
  transOpen: true, // 是否开启输入框翻译功能
  blacklist: "", // 禁用输入框翻译的域名列表
  apiSlug: OPT_TRANS_MICROSOFT, // 默认使用的翻译服务 API 标识
  fromLang: "auto", // 默认自动检测输入源语言
  toLang: "en", // 默认翻译目标语言为英文
  triggerShortcut: DEFAULT_INPUT_SHORTCUT, // 快捷键组合
  triggerCount: 1, // 快捷键连续敲击次数
  triggerTime: 200, // 敲击时间间隔 (毫秒)
  transSign: OPT_INPUT_TRANS_SIGNS[0], // 默认以斜杠（"/"）结尾时触发翻译
  showDot: OPT_INPUT_DOT_MOBILE, // 图标指示器显示策略
};

// --- 划词/选区翻译配置 ---
export const PHONIC_MAP = {
  en_phonic: ["英", "uk"], // 英国英语发音
  us_phonic: ["美", "en"], // 美国英语发音
};
// 划词翻译框的触发时机常量
export const OPT_TRANBOX_TRIGGER_CLICK = "click"; // 划词后，点击出现的翻译悬浮球图标再触发翻译
export const OPT_TRANBOX_TRIGGER_HOVER = "hover"; // 划词后，鼠标悬停在悬浮球上触发翻译
export const OPT_TRANBOX_TRIGGER_SELECT = "select"; // 划词后直接开始翻译并展现结果面板
export const OPT_TRANBOX_TRIGGER_ALL = [
  OPT_TRANBOX_TRIGGER_CLICK,
  OPT_TRANBOX_TRIGGER_HOVER,
  OPT_TRANBOX_TRIGGER_SELECT,
];
// 划词后弹出按钮的定位模式
export const OPT_TRANBOX_BTN_POSITION_FIXED = "fixed"; // 沿用当前逻辑，固定显示在选区右下角
export const OPT_TRANBOX_BTN_POSITION_MOUSE = "mouse"; // 跟随鼠标或触摸结束位置显示
export const OPT_TRANBOX_BTN_POSITION_ALL = [
  OPT_TRANBOX_BTN_POSITION_FIXED,
  OPT_TRANBOX_BTN_POSITION_MOUSE,
];
export const OPT_TRANBOX_INTERACT_CLICK = "click"; // 单击翻译框内选中文本触发新翻译
export const OPT_TRANBOX_INTERACT_DBLCLICK = "dblclick"; // 双击翻译框内选中文本触发新翻译
export const DEFAULT_TRANBOX_SHORTCUT = ["AltLeft", "KeyS"]; // 呼出划词翻译面板的键盘快捷键
export const DEFAULT_TRANBOX_SETTING = {
  transOpen: true, // 是否启用划词翻译功能
  blacklist: "", // 划词翻译禁用的域名列表
  apiSlugs: [OPT_TRANS_MICROSOFT], // 启用的翻译 API (支持多选)
  singleWordNoTrans: false, // 划词为单个单词时是否仅查询词典，不请求整句翻译服务
  fromLang: "auto",
  toLang: "zh-CN",
  toLang2: "en", // 第二目标语言，用于自动反向互译
  tranboxShortcut: DEFAULT_TRANBOX_SHORTCUT,
  btnOffsetX: 0, // 翻译触发球相对光标的横向偏移像素
  btnOffsetY: 0, // 翻译触发球相对光标的纵向偏移像素
  boxOffsetX: 0, // 翻译结果框的横向偏移像素
  boxOffsetY: 10, // 翻译结果框的纵向偏移像素
  hideTranBtn: false, // 是否隐藏翻译悬浮球（即直接展示框或通过快捷键开启）
  hideClickAway: false, // 鼠标点击页面空白处时，是否关闭翻译框
  simpleStyle: false, // 是否启用极简无边框设计风格
  followSelection: false, // 翻译结果框位置是否贴紧选中文本中心
  autoHeight: false, // 翻译结果框高度是否自适应其文本内容长度
  triggerMode: OPT_TRANBOX_TRIGGER_CLICK, // 划词触发翻译的行为模式
  btnPositionMode: OPT_TRANBOX_BTN_POSITION_FIXED, // 划词后弹出按钮的定位模式
  tranboxInteractMode: "-", // 翻译框内交互模式（"-"表示禁用）
  // extStyles: "", // 附加样式
  enDict: OPT_DICT_BING, // 默认英文网络词典数据源
  enSug: OPT_SUG_YOUDAO, // 英文输入联想建议源
  aiDictApiSlug: "-",
  aiDictPromptSlug: PROMPT_MODE_FOLLOW_API,
};

// --- 字幕默认样式属性 ---
const SUBTITLE_WINDOW_STYLE = `padding: 0.5em 1em;
background-color: rgba(0, 0, 0, 0.5);
color: white;
line-height: 1.3;
text-shadow: 1px 1px 2px black;
display: inline-block`; // 字幕外层窗口的 CSS 默认样式

const SUBTITLE_ORIGIN_STYLE = `font-size: clamp(1rem, 2cqw, 3rem);`; // 字幕原文的默认 CSS 样式
const SUBTITLE_TRANSLATION_STYLE = `font-size: clamp(1rem, 2cqw, 3rem);`; // 字幕译文的默认 CSS 样式

export const OPT_ENHANCE_ON = "on";
export const OPT_ENHANCE_OFF = "off";
export const OPT_ENHANCE_MOBILE_OFF = "mobile_off"; // 移动端浏览器中默认禁用

// --- 字幕翻译核心配置 ---
export const DEFAULT_SUBTITLE_SETTING = {
  enabled: true, // 是否自动开启视频字幕翻译功能
  apiSlug: OPT_TRANS_MICROSOFT, // 默认的字幕翻译接口 (使用微软翻译)
  segSlug: "-", // 智能 AI 断句/字幕合并的算法选择 ("-" 表示禁用 AI 段落合并)
  forceSubtitleRetranslate: false, // AI 断句服务与翻译服务不同时，是否强制使用翻译服务重翻译文
  chunkLength: 2000, // 触发 AI 翻译的单包最大字幕字符数
  longSentenceThreshold: 100, // 启用基于标点规则拆分的长句判定字符长度限制
  useAlgorithmBreaker: "rule", // 字幕断句断行处理器类型 ("rule" 规则断行，"statistical" 基于时间统计特征断行)
  preTrans: 90, // 字幕翻译提前发送的时长 (毫秒)，防止接口网络延迟导致字幕不同步
  throttleTrans: 30, // 节流延迟：两次翻译请求的最小时间间隔 (毫秒)
  // fromLang: "en",
  toLang: "zh-CN", // 字幕译文的目标语言
  isBilingual: true, // 字幕是否启用双语对照显示
  displayOrder: "original-first", // 字幕双语显示顺序：原文在前或译文在前
  blurTranslation: false, // 是否模糊显示译文 (用于听力/口语训练)
  skipAd: false, // 是否在识别到 YouTube 广告字幕时进行特殊快进
  windowStyle: SUBTITLE_WINDOW_STYLE, // 字幕背景及定位样式
  originStyle: SUBTITLE_ORIGIN_STYLE, // 原文字体大小及字重样式
  translationStyle: SUBTITLE_TRANSLATION_STYLE, // 译文字体大小样式
  hoverLookupMode: OPT_ENHANCE_MOBILE_OFF, // 鼠标悬停到字幕单词上时是否弹出查词面板
  showList: OPT_ENHANCE_MOBILE_OFF, // 是否在侧边/右侧显示字幕全文滚动历史面板
  hideSubtitleButton: false, // 是否隐藏 YouTube 播放器中的字幕功能按钮
  aiContextSlug: "-", // 是否为字幕启用智能上下文，以获取更好的代词翻译效果
  segPromptMode: PROMPT_MODE_FOLLOW_API, // AI 断句提示词来源：接口默认或指定 subtitle prompt
  segPromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG, // 指定的 subtitle prompt slug，仅在指定提示词模式下生效
};

// 预设配置规则的在线订阅 URL 地址列表 (从服务器拉取全球主流网站的最优适配 CSS 选择器规则)
export const DEFAULT_SUBRULES_LIST = [
  {
    url: process.env.REACT_APP_RULESURL, // 默认官方稳定版规则库
    selected: true,
  },
  {
    url: process.env.REACT_APP_RULESURL_ON, // 默认全部翻译规则库
    selected: false,
  },
  {
    url: process.env.REACT_APP_RULESURL_OFF, // 默认关闭翻译规则库
    selected: false,
  },
];

export const DEFAULT_MOUSEHOVER_KEY = ["ControlLeft"]; // 默认触发悬停翻译的触发按键 (左 Ctrl 键)
export const OPT_MOUSE_HOVER_DISPLAY_BILINGUAL = "bilingual"; // 鼠标悬停翻译：把译文插入页面形成双语对照
export const OPT_MOUSE_HOVER_DISPLAY_BUBBLE = "bubble"; // 鼠标悬停翻译：用悬浮气泡展示译文，不改变页面布局
export const DEFAULT_MOUSE_HOVER_BUBBLE_STYLE = `max-width: min(420px, calc(100vw - 32px));
padding: 10px 12px;
border-radius: 8px;
background: rgb(25, 118, 210);
color: #fff;
font-size: 14px;
line-height: 1.5;
box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
backdrop-filter: blur(8px);`;
export const DEFAULT_MOUSE_HOVER_SETTING = {
  useMouseHover: false, // 是否开启鼠标悬停翻译
  blacklist: "", // 鼠标悬停翻译禁用的网页黑名单
  mouseHoverKey: DEFAULT_MOUSEHOVER_KEY, // 主按键
  mouseHoverKey2: [], // 备用快捷按键
  displayMode: OPT_MOUSE_HOVER_DISPLAY_BILINGUAL, // 鼠标悬停翻译展示模式
  bubbleStyle: DEFAULT_MOUSE_HOVER_BUBBLE_STYLE, // 气泡模式的容器 CSS
};

// --- 全局默认设置对象，存储于 local storage ---
export const DEFAULT_SETTING = {
  version: CURRENT_SETTINGS_VERSION,
  darkMode: "auto", // 主题外观模式 ("light" 浅色, "dark" 深色, "auto" 跟随浏览器系统)
  uiLang: "en", // 插件设置面板界面的显示语言
  // fetchLimit: DEFAULT_FETCH_LIMIT, // 最大任务数量(移至rule，作废)
  // fetchInterval: DEFAULT_FETCH_INTERVAL, // 任务间隔时间(移至rule，作废)
  minLength: TRANS_MIN_LENGTH, // 整页翻译的段落最小有效长度限制
  maxLength: TRANS_MAX_LENGTH, // 整页翻译的段落最大有效长度限制
  newlineLength: TRANS_NEWLINE_LENGTH,
  httpTimeout: DEFAULT_HTTP_TIMEOUT, // 接口请求超时时间
  clearCache: false, // 每次浏览器重启时，是否自动清空翻译结果的本地网络缓存
  injectRules: true, // 页面加载时是否自动匹配并注入云端订阅的翻译规则
  fabClickAction: 0, // 工具栏悬浮球按钮双击或单击的默认响应行为 (如开启/关闭翻译)
  // injectWebfix: true, // 是否注入修复补丁(作废)
  // detectRemote: false, // 是否使用远程语言检测 （从rule移回）
  // contextMenus: true, // 是否添加右键菜单(作废)
  contextMenuType: 1, // 鼠标右键上下文菜单形式 (0: 禁用, 1: 精简, 2: 完整菜单)
  // transTag: DEFAULT_TRANS_TAG, // 译文元素标签(移至rule，作废)
  // transOnly: false, // 是否仅显示译文(移至rule，作废)
  // transTitle: false, // 是否同时翻译页面标题(移至rule，作废)
  subrulesList: DEFAULT_SUBRULES_LIST, // 订阅的在线翻译规则列表
  // owSubrule: DEFAULT_OW_RULE, // 覆写订阅规则 (作废)
  transApis: DEFAULT_API_LIST, // 缓存的全部可用翻译 API 配置列表（数组格式）
  prompts: [], // 用户自定义提示词；预设提示词由 config/prompt.js 提供，不写入本地配置
  deletedTransApiSlugs: [], // 用户手动删除的默认翻译接口标识
  // mouseKey: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译(移至rule，作废)
  shortcuts: DEFAULT_SHORTCUTS, // 键盘快捷键配置对象
  inputRule: DEFAULT_INPUT_RULE, // 输入框即时翻译相关配置
  tranboxSetting: DEFAULT_TRANBOX_SETTING, // 划词翻译及字典结果面板配置
  // touchTranslate: 2, // 触屏翻译 {5:单指双击，6:单指三击，7:双指双击} (作废)
  touchModes: [2], // 触屏移动端翻译触发行为配置 (数组，支持多选，如单指双击/三击)
  blacklist: DEFAULT_BLACKLIST.join(",\n"), // 禁用整页双语翻译的网址/黑名单列表
  csplist: DEFAULT_CSPLIST.join(",\n"), // 强制禁用内容安全策略(CSP)以允许向翻译 API 发送请求的网址列表
  orilist: DEFAULT_ORILIST.join(",\n"), // 需要改写或删除 Cross-Origin HTTP 请求头的网址列表
  // disableLangs: [], // 不翻译的语言(移至rule，作废)
  skipLangs: [], // 忽略翻译的语种代码列表 (即如果网页检测到是这些语言，则不触发自动整页翻译)
  transInterval: 100, // 两次段落翻译执行之间的等待延迟
  langDetector: "-", // 主动检测源语言的外部 API 服务选择 ("-" 表示由翻译 API 本身自动判定)
  mouseHoverSetting: DEFAULT_MOUSE_HOVER_SETTING, // 鼠标悬浮段落翻译的详细配置
  preInit: true, // 是否在 DOMContentLoaded 之前预先加载核心拦截脚本以加快翻译响应
  transAllnow: false, // 兜底机制：无匹配规则下是否强行全页面立即翻译
  subtitleSetting: DEFAULT_SUBTITLE_SETTING, // 字幕翻译模块的具体参数设置
  logLevel: LogLevel.INFO.value, // 扩展运行时的全局调试日志级别
  rootMargin: 500, // 滚动翻译机制触发时，段落距离屏幕视口边界的触发高度 (px)
  customStyles: DEFAULT_CUSTOM_STYLES, // 用于个性化译文表现的自定义 CSS 样式规则列表
};
