import { OPT_TRANS_MICROSOFT } from "./api";
import { OPT_STYLE_NONE } from "./styles";

export const GLOBAL_KEY = "*";
export const REMAIN_KEY = "-";
export const SHADOW_KEY = ">>>";

export const DEFAULT_COLOR = "#209CEE"; // 默认高亮背景色/线条颜色

export const DEFAULT_TRANS_TAG = "font";
// export const DEFAULT_SELECT_STYLE =
//   "-webkit-line-clamp: unset; max-height: none; height: auto;";

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

export const OPT_SPLIT_PARAGRAPH_DISABLE = "split_disable";
export const OPT_SPLIT_PARAGRAPH_TEXTLENGTH = "split_textlength";
export const OPT_SPLIT_PARAGRAPH_PUNCTUATION = "split_punctuation";
export const OPT_SPLIT_PARAGRAPH_ALL = [
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_SPLIT_PARAGRAPH_PUNCTUATION,
  OPT_SPLIT_PARAGRAPH_TEXTLENGTH,
];

export const OPT_HIGHLIGHT_WORDS_DISABLE = "highlight_disable";
export const OPT_HIGHLIGHT_WORDS_BEFORETRANS = "highlight_beforetrans";
export const OPT_HIGHLIGHT_WORDS_AFTERTRANS = "highlight_aftertrans";
export const OPT_HIGHLIGHT_WORDS_ALL = [
  OPT_HIGHLIGHT_WORDS_DISABLE,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
];

export const DEFAULT_SELECTOR =
  "h1, h2, h3, h4, h5, h6, li, p, dd, blockquote, figcaption, label, legend";
export const DEFAULT_IGNORE_SELECTOR = "button, footer, pre, mark, nav";
export const DEFAULT_KEEP_SELECTOR = `code, cite, math, .math, a:has(code)`;
export const DEFAULT_RULE = {
  pattern: "", // 匹配网址
  selector: "", // 选择器
  keepSelector: "", // 保留元素选择器
  terms: "", // 专业术语
  aiTerms: "", // AI专业术语
  apiSlug: GLOBAL_KEY, // 翻译服务
  fromLang: GLOBAL_KEY, // 源语言
  toLang: GLOBAL_KEY, // 目标语言
  textStyle: GLOBAL_KEY, // 译文样式
  transOpen: GLOBAL_KEY, // 开启翻译
  // bgColor: "", // 译文颜色 (作废)
  // textDiyStyle: "", // 自定义译文样式 (作废)
  textExtStyle: "", // 译文附加样式
  termsStyle: "", // 专业术语样式
  highlightStyle: "", // 高亮词汇样式
  selectStyle: "", // 选择器节点样式
  parentStyle: "", // 选择器父节点样式
  grandStyle: "", // 选择器父节点样式
  injectJs: "", // 注入JS
  // injectCss: "", // 注入CSS (作废)
  transOnly: GLOBAL_KEY, // 是否仅显示译文
  // transTiming: GLOBAL_KEY, // 翻译时机/鼠标悬停翻译  (暂时作废)
  transTag: GLOBAL_KEY, // 译文元素标签
  transTitle: GLOBAL_KEY, // 是否同时翻译页面标题
  // transSelected: GLOBAL_KEY, // 是否启用划词翻译 (移回setting)
  // detectRemote: GLOBAL_KEY, // 是否使用远程语言检测 (移回setting)
  // skipLangs: [], // 不翻译的语言 (移回setting)
  // fixerSelector: "", // 修复函数选择器 (暂时作废)
  // fixerFunc: GLOBAL_KEY, // 修复函数 (暂时作废)
  transStartHook: "", // 钩子函数
  transEndHook: "", // 钩子函数
  // transRemoveHook: "", // 钩子函数 (暂时作废)
  autoScan: GLOBAL_KEY, // 是否自动识别文本节点
  hasRichText: GLOBAL_KEY, // 是否启用富文本翻译
  hasShadowroot: GLOBAL_KEY, // 是否包含shadowroot
  rootsSelector: "", // 翻译范围选择器
  ignoreSelector: "", // 不翻译的选择器
  splitParagraph: GLOBAL_KEY, // 切分段落
  splitLength: 0, // 切分段落长度
  highlightWords: GLOBAL_KEY, // 高亮词汇
};

// 全局规则
export const GLOBLA_RULE = {
  pattern: "*", // 匹配网址
  selector: DEFAULT_SELECTOR, // 选择器
  keepSelector: DEFAULT_KEEP_SELECTOR, // 保留元素选择器
  terms: "", // 专业术语
  aiTerms: "", // AI专业术语
  apiSlug: OPT_TRANS_MICROSOFT, // 翻译服务
  fromLang: "auto", // 源语言
  toLang: "zh-CN", // 目标语言
  textStyle: OPT_STYLE_NONE, // 译文样式
  transOpen: "false", // 开启翻译
  // bgColor: DEFAULT_COLOR, // 译文颜色 (作废)
  // textDiyStyle: DEFAULT_DIY_STYLE, // 自定义译文样式 (作废)
  textExtStyle: "", // 译文附加样式
  termsStyle: "font-weight: bold;", // 专业术语样式
  highlightStyle: "color: red;", // 高亮词汇样式
  selectStyle: "", // 选择器节点样式
  parentStyle: "", // 选择器父节点样式
  grandStyle: "", // 选择器祖节点样式
  injectJs: "", // 注入JS
  injectCss: "", // 注入CSS
  transOnly: "false", // 是否仅显示译文
  // transTiming: OPT_TIMING_PAGESCROLL, // 翻译时机/鼠标悬停翻译 (暂时作废)
  transTag: DEFAULT_TRANS_TAG, // 译文元素标签
  transTitle: "false", // 是否同时翻译页面标题
  // transSelected: "true", // 是否启用划词翻译 (移回setting)
  // detectRemote: "true", // 是否使用远程语言检测 (移回setting)
  // skipLangs: [], // 不翻译的语言 (移回setting)
  // fixerSelector: "", // 修复函数选择器 (暂时作废)
  // fixerFunc: "-", // 修复函数 (暂时作废)
  transStartHook: "", // 钩子函数
  transEndHook: "", // 钩子函数
  // transRemoveHook: "", // 钩子函数 (暂时作废)
  autoScan: "true", // 是否自动识别文本节点
  hasRichText: "true", // 是否启用富文本翻译
  hasShadowroot: "false", // 是否包含shadowroot
  rootsSelector: "body", // 翻译范围选择器
  ignoreSelector: DEFAULT_IGNORE_SELECTOR, // 不翻译的选择器
  splitParagraph: OPT_SPLIT_PARAGRAPH_DISABLE, // 切分段落
  splitLength: 100, // 切分段落长度
  highlightWords: OPT_HIGHLIGHT_WORDS_DISABLE, // 高亮词汇
};

export const DEFAULT_RULES = [GLOBLA_RULE];

// todo: 校验几个内置规则
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
    selector: `[data-testid='tweetText'], [data-testid='twitter-article-title'], .public-DraftStyleDefault-block`,
    keepSelector: `img, svg, a, span:has(a), div:has(a)`,
    ignoreSelector: `button, [data-testid='videoPlayer'], [role='group']`,
    autoScan: `false`,
  },
  "www.youtube.com/live_chat": {
    rootsSelector: `div#items`,
    selector: `span.yt-live-chat-text-message-renderer`,
    autoScan: `false`,
  },
  "www.youtube.com": {
    rootsSelector: `ytd-page-manager`,
    ignoreSelector: `aside, button, footer, form, header, pre, mark, nav, #player, #container, .caption-window, .ytp-settings-menu`,
    selectStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
    parentStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
    grandStyle: `-webkit-line-clamp: unset; max-height: none; height: auto;`,
  },
  "web.telegram.org": {
    autoScan: `false`,
    selector: ".text-content, .embedded-text-wrapper",
    rootsSelector: ".Transition",
  },
};

export const BUILTIN_RULES = Object.entries(RULES_MAP).map(
  ([pattern, rule]) => ({
    // ...DEFAULT_RULE,
    ...rule,
    pattern,
  })
);
