/**
 * @file rules.js
 * @description 网页翻译规则相关的配置参数。定义匹配选择器、翻译时机、段落切分、生词高亮策略以及兜底和内置的定制网站翻译规则。
 */

import { OPT_TRANS_MICROSOFT } from "./api";
import { OPT_STYLE_NONE } from "./styles";

// --- 规则模式关键字 ---
export const GLOBAL_KEY = "*"; // 全局匹配键名，表示继承全局设置
export const REMAIN_KEY = "-"; // 保留/排除键名，表示不执行继承
export const SHADOW_KEY = ">>>"; // 用于深度穿透 Shadow DOM 的 CSS 选择器分隔符

export const DEFAULT_COLOR = "#209CEE"; // 默认的生词高亮背景色/波浪线颜色

export const DEFAULT_TRANS_TAG = "font"; // 默认翻译译文所外包的 HTML 标签名
export const DEFAULT_SELECT_STYLE =
  "-webkit-line-clamp: unset; max-height: none; height: auto;"; // 默认放开高度限制的 CSS，防止翻译后因译文变长导致文本截断或溢出

// --- 网页翻译的触发时机常量 ---
export const OPT_TIMING_PAGESCROLL = "mk_pagescroll"; // 智能滚动加载翻译：仅翻译当前视口内的可见段落
export const OPT_TIMING_PAGEOPEN = "mk_pageopen"; // 页面打开时立即翻译：全网页从头到尾一次性自动翻译
export const OPT_TIMING_MOUSEOVER = "mk_mouseover"; // 鼠标悬停翻译：鼠标滑过某个段落时，单独翻译当前段落
export const OPT_TIMING_CONTROL = "mk_ctrlKey"; // Control 键 + 鼠标悬停触发翻译
export const OPT_TIMING_SHIFT = "mk_shiftKey"; // Shift 键 + 鼠标悬停触发翻译
export const OPT_TIMING_ALT = "mk_altKey"; // Alt 键 + 鼠标悬停触发翻译
export const OPT_TIMING_ALL = [
  OPT_TIMING_PAGESCROLL,
  OPT_TIMING_PAGEOPEN,
  OPT_TIMING_MOUSEOVER,
  OPT_TIMING_CONTROL,
  OPT_TIMING_SHIFT,
  OPT_TIMING_ALT,
];

// --- 文本段落切分拆分策略 (避免单个段落过长导致大模型翻译效果差或报错) ---
export const OPT_SPLIT_PARAGRAPH_DISABLE = "split_disable"; // 禁用段落切分
export const OPT_SPLIT_PARAGRAPH_TEXTLENGTH = "split_textlength"; // 仅根据字符长度限制进行强制切分
export const OPT_SPLIT_PARAGRAPH_PUNCTUATION = "split_punctuation"; // 优先根据标点符号（如句号等）进行切分，使句子更完整
export const OPT_SPLIT_PARAGRAPH_ALL = [
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_SPLIT_PARAGRAPH_PUNCTUATION,
  OPT_SPLIT_PARAGRAPH_TEXTLENGTH,
];

// --- 生词本生词高亮高频词的高亮策略 ---
export const OPT_HIGHLIGHT_WORDS_DISABLE = "highlight_disable"; // 不对生词进行高亮
export const OPT_HIGHLIGHT_WORDS_BEFORETRANS = "highlight_beforetrans"; // 在翻译前（即原文中）高亮生词
export const OPT_HIGHLIGHT_WORDS_AFTERTRANS = "highlight_aftertrans"; // 在翻译后（即译文中）高亮生词
export const OPT_HIGHLIGHT_WORDS_ALL = [
  OPT_HIGHLIGHT_WORDS_DISABLE,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
];

// 默认的待翻译元素选择器：包含主要的标题、列表、段落及引用块
export const DEFAULT_SELECTOR =
  "h1, h2, h3, h4, h5, h6, li, p, dd, blockquote, figcaption, label, legend";
// 默认被忽略、不参与翻译的选择器：包含按钮、页脚、导航栏、代码块、矢量图以及带“logo”属性的元素
export const DEFAULT_IGNORE_SELECTOR =
  "button, footer, pre, mark, nav, svg, img[src*='.svg'], [class*='logo'] svg, [id*='logo'] svg";
// 默认保留原样、不破坏内部结构的特殊行内元素选择器（如行内代码、公式等）
export const DEFAULT_KEEP_SELECTOR = `code, cite, math, .math, a:has(code)`;

// 网页匹配翻译规则的空对象结构模板（属性全览）
export const DEFAULT_RULE = {
  pattern: "", // 匹配网址的正则/通配符字符串
  enabled: true, // 该条个人/订阅规则是否参与匹配
  selector: "", // 核心待翻译元素 CSS 选择器
  keepSelector: "", // 保留原文的行内元素 CSS 选择器
  blockSelector: "", // 自定义块级元素 CSS 选择器
  terms: "", // 本地化专有名词/术语表字典 (格式：原文=译文)
  aiTerms: "", // 发送给大模型的专有名词/术语表
  apiSlug: GLOBAL_KEY, // 本网页指定的翻译 API 标识名 (继承/覆盖全局)
  fromLang: GLOBAL_KEY, // 网页源语言代码 (继承/覆盖全局)
  toLang: GLOBAL_KEY, // 目标语言代码 (继承/覆盖全局)
  textStyle: GLOBAL_KEY, // 译文样式类型 (继承/覆盖全局)
  transOpen: GLOBAL_KEY, // 是否自动开启翻译 (继承/覆盖全局)
  // bgColor: "", // 译文颜色 (作废)
  // textDiyStyle: "", // 自定义译文样式 (作废)
  textExtStyle: "", // 附加到译文元素上的 CSS 样式字符串
  termsStyle: "", // 匹配到专有名词时的自定义高亮样式
  highlightStyle: "", // 生词本生词的高亮样式
  selectStyle: "", // 改变翻译目标节点本身的 CSS 样式 (如清除行高限制等)
  parentStyle: "", // 改变翻译目标节点父级的 CSS 样式
  grandStyle: "", // 改变翻译目标节点祖父级的 CSS 样式
  injectJs: "", // 页面翻译开始时注入并运行的 JS 脚本
  // injectCss: "", // 注入CSS (作废)
  transOnly: GLOBAL_KEY, // 是否仅显示译文而不显示原文 (单语翻译)
  transOnlyRevert: GLOBAL_KEY, // 仅译文模式下，鼠标悬浮时是否临时恢复显示原文
  transOnlyRevertDelay: GLOBAL_KEY, // 悬浮恢复原文的延迟时间 (秒)
  transOrder: GLOBAL_KEY, // 文本顺序：原文在上 ("original-first") 或 译文在上 ("translation-first")
  // transTiming: GLOBAL_KEY, // 翻译时机/鼠标悬停翻译 (暂时作废)
  transTag: GLOBAL_KEY, // 译文嵌套的 HTML 标签 (如 font, span 等)
  transTitle: GLOBAL_KEY, // 是否翻译网页的 document.title
  // transSelected: GLOBAL_KEY, // 是否启用划词翻译 (移回setting)
  // detectRemote: GLOBAL_KEY, // 是否使用远程语言检测 (移回setting)
  // skipLangs: [], // 不翻译的语言 (移回setting)
  // fixerSelector: "", // 修复函数选择器 (暂时作废)
  // fixerFunc: GLOBAL_KEY, // 修复函数 (暂时作废)
  transStartHook: "", // 翻译事务启动时的 Hook 脚本 (通过 eval/Sval 执行)
  transEndHook: "", // 翻译事务完成后的 Hook 脚本
  // transRemoveHook: "", // 钩子函数 (暂时作废)
  autoScan: GLOBAL_KEY, // 是否启用智能文本节点扫描 (扫描未匹配选择器的裸文本)
  hasRichText: GLOBAL_KEY, // 是否启用富文本(包含嵌套 HTML 标签)翻译而非仅纯文本
  hasShadowroot: GLOBAL_KEY, // 页面是否包含 Shadow DOM，若为 true 会递归穿透扫描
  scanAll: GLOBAL_KEY, // 是否强行扫描页面中的所有节点 (不推荐，性能损耗大)
  rootsSelector: "", // 限制翻译仅在特定的根节点容器内进行
  ignoreSelector: "", // 额外指定不进行翻译的 CSS 屏蔽选择器
  splitParagraph: GLOBAL_KEY, // 拆分长段落的策略
  splitLength: 0, // 段落切分触发字符长度阈值
  highlightWords: GLOBAL_KEY, // 生词高亮的触发时机
};

// 全局兜底规则：当网页没有匹配的特定规则时，采用此默认规则
export const GLOBLA_RULE = {
  pattern: "*", // 匹配任意网址
  enabled: true,
  selector: DEFAULT_SELECTOR, // 默认的翻译元素
  keepSelector: DEFAULT_KEEP_SELECTOR, // 保留不动的行内元素
  blockSelector: "",
  terms: "",
  aiTerms: "",
  apiSlug: OPT_TRANS_MICROSOFT, // 默认采用微软翻译
  fromLang: "auto", // 默认自动识别原文语言
  toLang: "zh-CN", // 默认翻译为简体中文
  textStyle: OPT_STYLE_NONE, // 默认译文不加额外线条/高亮背景
  transOpen: "false", // 默认不自动开始翻译网页 (需要手动点击或快捷键)
  // bgColor: DEFAULT_COLOR, // 译文颜色 (作废)
  // textDiyStyle: DEFAULT_DIY_STYLE, // 自定义译文样式 (作废)
  textExtStyle: "",
  termsStyle: "font-weight: bold;", // 专业术语默认加粗
  highlightStyle: "color: red;", // 高亮生词默认标红
  selectStyle: DEFAULT_SELECT_STYLE,
  parentStyle: "",
  grandStyle: "",
  injectJs: "",
  injectCss: "",
  transOnly: "false", // 默认保留原文，呈现双语对比形式
  transOnlyRevert: "false",
  transOnlyRevertDelay: "0.5",
  // transTiming: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译 (暂时作废)
  transTag: DEFAULT_TRANS_TAG,
  transTitle: "false", // 默认不自动翻译网页 Tab 标题
  // transSelected: "true", // 是否启用划词翻译 (移回setting)
  // detectRemote: "true", // 是否使用远程语言检测 (移回setting)
  // skipLangs: [], // 不翻译的语言 (移回setting)
  // fixerSelector: "", // 修复函数选择器 (暂时作废)
  // fixerFunc: "-", // 修复函数 (暂时作废)
  transStartHook: "",
  transEndHook: "",
  // transRemoveHook: "", // 钩子函数 (暂时作废)
  autoScan: "true", // 默认自动扫描文本节点，确保漏网之鱼也被翻译
  hasRichText: "true", // 默认进行富文本标签翻译，以保证链接等样式不会在翻译后破损
  hasShadowroot: "false", // 默认不主动穿透 Shadow DOM (因性能开销，仅在特定页面开启)
  scanAll: "false",
  rootsSelector: "body",
  ignoreSelector: DEFAULT_IGNORE_SELECTOR,
  splitParagraph: OPT_SPLIT_PARAGRAPH_DISABLE,
  splitLength: 100,
  highlightWords: OPT_HIGHLIGHT_WORDS_DISABLE,
  transOrder: "original-first", // 文本顺序：原文在上 ("original-first") 或 译文在上 ("translation-first")
};

// 预设规则列表，初始化时直接注册
export const DEFAULT_RULES = [GLOBLA_RULE];

// REVIEW: 针对特定高频复杂网页做特殊定制的内置规则映射表。
// 这些预置规则解决了各大平台（如维基百科、黑客新闻、X/Twitter、YouTube直播、GitHub）由于动态加载、复杂的 CSS 结构、大量的干扰元素所导致的翻译错位或不完整问题。
const RULES_MAP = {
  // "www.google.com/search": {
  //   rootsSelector: `#rcnt`,
  // },
  "en.wikipedia.org": {
    ignoreSelector: `.button, code, footer, form, mark, pre, .mwe-math-element, .mw-editsection`,
  },
  "news.ycombinator.com": {
    selector: `p, .titleline, .commtext, .hn-item-title, .hn-comment-text, .hn-story-title`,
    keepSelector: `code, img, svg, pre, .sitebit`,
    ignoreSelector: `button, code, footer, form, header, mark, nav, pre, .reply`,
    autoScan: `false`,
  },
  "twitter.com, https://x.com": {
    selector: `[data-testid='tweetText'], [data-testid='twitter-article-title'], [data-testid='UserDescription'], .public-DraftStyleDefault-block, span.text-body, div.css-175oi2r.r-3pj75a div.css-175oi2r>span, div.css-175oi2r.r-3pj75a li>span, div.r-1s2bzr4>div.r-16dba41, div.r-16y2uox>div.r-1jeg54m`,
    keepSelector: `img, svg, a, span:has(a), div:has(a)`,
    ignoreSelector: `[data-testid='videoPlayer'], [data-testid^='tweetTextarea']`,
    autoScan: `false`,
    selectStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
  },
  "www.youtube.com/live_chat": {
    rootsSelector: `div#items`,
    selector: `span.yt-live-chat-text-message-renderer`,
    autoScan: `false`,
  },
  "www.youtube.com": {
    rootsSelector: `ytd-page-manager`,
    ignoreSelector: `aside, button, footer, form, header, pre, mark, nav, #player, #container, .caption-window, .ytp-settings-menu, #kiss-youtube-subtitle-list-container`,
    selectStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
    parentStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
    grandStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
  },
  "web.telegram.org": {
    autoScan: `false`,
    selector: ".text-content, .embedded-text-wrapper",
    rootsSelector: ".Transition",
  },
  "github.com": {
    autoScan: `false`,
    selector: `h1, h2, h3, h4, h5, h6, .markdown-body li, p, dd, blockquote, figcaption, label, legend, .user-profile-bio>div, [data-testid="results-list"] .search-match, .Subhead-description, [class^="prc-SelectPanel-Subtitle-"], [class^="prc-ActionList-ItemLabel-"], [role="dialog"] .overflow-auto, .h4, .repos-list-description, .discussion-title, [class*="PinnedIssue-module__Link"] span, .js-wiki-sidebar-page-container :is(.Truncate-text, .Link--primary)`,
    ignoreSelector: `button, p.pinned-item-desc+p`,
  },
};

// 格式化 RULES_MAP 为内置规则数组，供扩展初始化或同步逻辑使用
export const BUILTIN_RULES = Object.entries(RULES_MAP).map(
  ([pattern, rule]) => ({
    // ...DEFAULT_RULE,
    ...rule,
    pattern,
  })
);
