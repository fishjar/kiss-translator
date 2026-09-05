import {
  APP_LCNAME,
  APP_CONSTS,
  OPT_STYLE_FUZZY,
  GLOBLA_RULE,
  GLOBAL_KEY,
  DEFAULT_SETTING,
  // DEFAULT_MOUSEHOVER_KEY,
  OPT_STYLE_NONE,
  DEFAULT_API_SETTING,
  DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  DEFAULT_MOUSE_HOVER_HOLD_DELAY,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
  OPT_MOUSE_HOVER_DISPLAY_BUBBLE,
  OPT_MOUSE_HOVER_TRANS_AREA,
  OPT_MOUSE_HOVER_TRANS_DISPLAY_BLOCK,
  OPT_MOUSE_HOVER_TRANS_DISPLAY_INLINE,
  OPT_MOUSE_HOVER_TRANS_PARAGRAPH,
  OPT_MOUSE_HOVER_TRANS_REGION,
  OPT_SPLIT_PARAGRAPH_PUNCTUATION,
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_SPLIT_PARAGRAPH_TEXTLENGTH,
  API_SPE_TYPES,
  MSG_INJECT_CSS,
  MSG_UPDATE_ICON,
  EVENT_FAVORITE_WORD_CHANGE,
  OPT_DICT_BING,
  OPT_DICT_MAP,
  newI18n,
} from "../config";
import { resolveApiPromptSettings } from "../config/prompt";
import { interpreter } from "./interpreter";
import { clearFetchPool } from "./pool";
import { debounce, scheduleIdle, genEventName, parseAITerms } from "./utils";
import { parseTerms, buildTermsRegex, buildTermsMatcher, applyTermReplace } from "./terms";
import { escapeHTML } from "./html";
import { apiMicrosoftDict, apiTranslate, apiYoudaoDict } from "../apis";
import { kissLog } from "./log";
import { clearAllBatchQueue } from "./batchQueue";
import { genTextClass } from "./style";
import { createLoadingSVG, createRetrySVG } from "./svg";
import { shortcutRegister } from "./shortcut";
import { tryDetectLang } from "./detect";
import { isSameTranslationLanguage } from "./language";
import { trustedTypesHelper } from "./trustedTypes";
import { injectJs, INJECTOR } from "../injectors";
import { injectInternalCss } from "./injector";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";
import { getDocInfo } from "./docInfo";

/**
 * @class Translator
 * @description 翻译核心逻辑封装
 */
export class Translator {
  // 块级判定缓存，避免对同一节点高频调用 window.getComputedStyle(el) 造成浏览器回流（Reflow）
  static displayCache = new WeakMap();

  // HTML 元素标签分类
  static TAGS = {
    // 强制换行标签
    BREAK_LINE: new Set(["BR", "WBR"]),
    // 块级标签
    BLOCK: new Set([
      "ADDRESS",
      "ARTICLE",
      "ASIDE",
      "BLOCKQUOTE",
      "CANVAS",
      "DD",
      "DIV",
      "DL",
      "DT",
      "FIELDSET",
      "FIGCAPTION",
      "FIGURE",
      "FOOTER",
      "FORM",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "HEADER",
      "HR",
      "LI",
      "MAIN",
      "NAV",
      "NOSCRIPT",
      "OL",
      "P",
      "PRE",
      "SECTION",
      "TABLE",
      "TFOOT",
      "UL",
      "VIDEO",
    ]),
    // 行级标签
    INLINE: new Set([
      // "A",
      "ABBR",
      "ACRONYM",
      "B",
      "BDO",
      "BIG",
      "BR",
      "BUTTON",
      "CITE",
      "CODE",
      "DFN",
      "DEL",
      "FONT",
      "EM",
      "I",
      "IMG",
      "INPUT",
      "INS",
      "KBD",
      "LABEL",
      "MAP",
      "MARK",
      "OBJECT",
      "OUTPUT",
      "Q",
      "RUBY",
      "SAMP",
      "SCRIPT",
      "SELECT",
      "SMALL",
      // "SPAN",
      "STRONG",
      "SUB",
      "SUP",
      "TEXTAREA",
      "TIME",
      "TT",
      "U",
      "VAR",
    ]),
    // 需要被作为占位符替换以保持原文格式不被机器翻译破坏的复杂标签
    REPLACE: new Set([
      "ABBR",
      "CODE",
      "DFN",
      "IMG",
      "KBD",
      "OUTPUT",
      "RP",
      "RT",
      "SAMP",
      "SUB",
      "SUP",
      "SVG",
      "TIME",
      "VAR",
    ]),
    // 需要被包装翻译的行内样式或逻辑标签
    WARP: new Set([
      "A",
      "B",
      "BDO",
      "BDI",
      "BIG",
      "CITE",
      "DEL",
      "EM",
      "FONT",
      "I",
      "INS",
      "MARK",
      "Q",
      "RUBY",
      "S",
      "SMALL",
      "SPAN",
      "STRONG",
      "U",
    ]),
  };

  // 译文相关 CSS 类名配置
  static KISS_CLASS = {
    warpper: `${APP_LCNAME}-wrapper`,
    inner: `${APP_LCNAME}-inner`,
    term: `${APP_LCNAME}-term`,
    br: `${APP_LCNAME}-br`,
    space: `${APP_LCNAME}-space`,
    highlight: `${APP_LCNAME}-highlight`,
    retry: `${APP_LCNAME}-retry`,
    backup: `${APP_LCNAME}-backup`,
    original: `${APP_LCNAME}-original`,
    hoverBubble: `${APP_LCNAME}-hover-bubble`,
  };

  // 内置过滤与跳过翻译的正则表达式规则（URL、邮箱、路径、数字、日期、模板等）
  static BUILTIN_SKIP_PATTERNS = [
    // 1. URL (覆盖 http, https, ftp, file 协议)
    /^(?:(?:https?|ftp|file):\/\/|www\.)[^\s/$.?#].[^\s]*$/i,

    // 2. 邮箱地址
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

    // 3. 文件路径 (为 Unix 和 Windows 做了简化)
    /^(?:[a-zA-Z]:\\|\/|\\)(?:[\w\-. ]+\/|[\w\-. ]+\\)*[\w\-. ]*\.?[\w\-. ]*$/,

    // 4. UUID (通用唯一标识符)
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,

    // 5. 纯数字字符串 (整数, 浮点数, 包含常见分隔符)
    // 同时也处理单位 (如 px, %, em, rem 等) 和货币符号。
    /^[$\u00A2-\u00A5\u20A0-\u20CF]?\s?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s?(?:px|%|em|rem|pt|vw|vh|deg|s|ms)?$/,

    // 6. 版本号 (例如 v1.2.3, 10.0.1)
    /^v?\d+(\.\d+){1,3}$/,

    // 7. ISO 8601 日期/时间格式
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/,

    // 8. 模板占位符 (例如 {{var}}, ${var}, __VAR__)
    /^({{[^}]+}}|\${[^}]+}|__\w+__|%\w+)$/,

    // 9. CSS 选择器 (简单的 class/ID) 和十六进制颜色值
    /^(?:\.|#)[\w-]+$|^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,

    // 10. 用户名 (例如 @username, @user.name, @user-name)
    /^@[\w.-]+$/,

    // 11. HTML 实体
    /^&\w+;$/,

    // 12. 中括号包裹的序号 (例如 [1], [99])
    /^\[\d+\]$/,

    // 13. 简单时间格式 (例如 12:30, 9:45:30)
    /^\d{1,2}:\d{2}(:\d{2})?$/,

    // 14. 包含常见扩展名的文件名 (例如: document.pdf, image.jpeg)
    /^[^\s\\/:]+?\.[a-zA-Z0-9]{2,5}$/,
  ];

  static DEFAULT_OPTIONS = DEFAULT_SETTING; // 默认配置选项
  static DEFAULT_RULE = GLOBLA_RULE; // 默认匹配规则

  // 判断是否为普通的 DOM 元素节点
  static isElement(el) {
    return el instanceof Element;
  }

  // 判断是否为 DOM 元素节点或文档片段
  static isElementOrFragment(el) {
    return el instanceof Element || el instanceof DocumentFragment;
  }

  /**
   * 判断目标元素是否为块级（Block）节点
   * // REVIEW: 缓存失效风险。使用 WeakMap 缓存了元素的 block 判定结果，如果在页面运行期间，
   * // 某个元素的 display 样式被动态修改（如从 none 变更为 block，或者从 inline 变更为 block），
   * // displayCache 中缓存的旧状态不会被失效或刷新，这可能导致后续的扫描和翻译无法准确处理该节点。
   * @param {Node} el - 待检测的 DOM 节点
   * @returns {boolean}
   */
  static isBlockNode(el) {
    if (!Translator.isElementOrFragment(el)) return false;

    // 若有显式的 inline 属性设置，直接判定非块级
    if (el.attributes?.display?.value?.includes("inline")) return false;
    // 若有显式的 block 属性设置，直接判定为块级
    if (el.attributes?.display?.value?.includes("block")) return true;

    // 若标签在内联标签集合中，直接判定非块级
    if (Translator.TAGS.INLINE.has(el.nodeName?.toUpperCase())) return false;
    // 若标签在块级标签集合中，直接判定为块级
    if (Translator.TAGS.BLOCK.has(el.nodeName?.toUpperCase())) return true;

    // 优先读取 WeakMap 缓存
    if (Translator.displayCache.has(el)) {
      return Translator.displayCache.get(el);
    }

    // 降级回滚：调用 getComputedStyle 进行高开销的布局样式计算
    const isBlock = !window.getComputedStyle(el).display.startsWith("inline");
    Translator.displayCache.set(el, isBlock);
    return isBlock;
  }

  // 判断是否包含块级子元素
  static hasBlockNode(el) {
    if (!Translator.isElementOrFragment(el)) return false;
    for (const child of el.childNodes) {
      if (Translator.isBlockNode(child)) {
        return true;
      }
    }
    return false;
  }

  // 判断是否直接包含非空文本节点
  static hasTextNode(el) {
    if (!Translator.isElementOrFragment(el)) return false;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && /\S/.test(child.nodeValue)) {
        return true;
      }
    }
    return false;
  }

  // 特殊字符转义
  static escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 内置忽略元素
  static KISS_IGNORE_SELECTOR = `.${Translator.KISS_CLASS.warpper}, .${Translator.KISS_CLASS.hoverBubble}, .kiss-caption-container, .kiss-subtitle-controls, #kiss-youtube-subtitle-list-container,
  #${APP_CONSTS.fabID}, .${APP_CONSTS.fabID}_warpper,
  #${APP_CONSTS.boxID}, .${APP_CONSTS.boxID}_warpper,
  #${APP_CONSTS.popupID}, .${APP_CONSTS.popupID}_warpper`;

  static BUILTIN_IGNORE_SELECTOR = `address, area, audio, br, canvas,
  data, datalist, embed, head, iframe, input, noscript, map,
  object, option, param, picture, progress,
  select, script, style, svg, track, textarea, template,
  video, wbr, .notranslate, [contenteditable='true'], [translate='no']`;

  #setting; // 设置选项
  #rule; // 规则
  #isInitialized = false; // 初始化状态
  #isJsInjected = false; // 注入用户JS
  #isShadowRootJsInjected = false; //
  #mouseHoverEnabled = false; // 鼠标悬停翻译
  #enabled = false; // 全局默认状态
  #runId = 0; // 用于中止过期的异步请求

  #transOnlyRevertTimer = null;
  #transOnlyRevertTarget = null;
  #transOnlyRevertEnabled = false;
  #boundTransOnlyMouseOver = null;
  #boundTransOnlyMouseOut = null;
  #termEntries = []; // 排序后的术语条目（parseTerms 输出，供 applyTermReplace 使用）
  #combinedTermsRegex; // 专业术语正则表达式
  #termMatcher = null; // 术语扫描 matcher（buildTermsMatcher 一次物化，热路径零编译）
  #combinedSkipsRegex; // 跳过文本正则表达式

  #placeholderCache = null; // 缓存正则对象
  #translationTagName = APP_LCNAME; // 翻译容器的标签名
  #eventName = ""; // 通信事件名称
  #docInfo = {}; // 网页信息
  #glossary = {}; // AI词典
  #blockSelectorInvalid = false; // 自定义块级选择器是否已确认无效
  #textClass = {}; // 译文样式class
  #textSheet = null; // CSSStyleSheet 实例（Firefox 内容脚本中不可用时为 null）
  #textStylesRaw = ""; // 原始 CSS 文本（Firefox adoptedStyleSheets 回退备用）
  #useSheetFallback = false; // Firefox 跨作用域限制标记：adoptedStyleSheets 不可用时直接走内联 <style>
  #apisMap = new Map(); // 用于接口快速查找
  #favWords = []; // 收藏词汇
  #favoriteHighlightScopes = new Set(); // 已进入收藏词高亮流程的扫描单元

  #observedNodes = new WeakSet(); // 存储所有被识别出的、可翻译的 DOM 节点单元
  #translationNodes = new WeakMap(); // 存储所有插入到页面的译文节点
  #viewNodes = new Set(); // 当前在可视范围内的单元
  #processedNodes = new WeakMap(); // 已处理（已执行翻译DOM操作）的单元
  #rootNodes = new Set(); // 已监控的根节点
  #skipMoNodes = new WeakSet(); // 忽略变化的节点
  #ignoredMutationTargets = new WeakSet(); // 临时忽略扩展自身 DOM 调整产生的变化
  #plainTextPreprocessingNodes = new WeakSet(); // 正在流式预处理的纯文本 pre

  #removeKeydownHandler; // 快捷键清理函数
  #removeKeydownHandler2; // 备用快捷键清理函数
  #removeMouseHoldHandlers; // 按住鼠标左键触发方式的清理函数
  #mouseHoldTimer = null; // 按住左键等待触发翻译的定时器
  #mouseHoldActive = false; // 是否处于按住左键状态
  #mouseHoldTriggered = false; // 本次按住是否已经触发过翻译
  #mouseHoldStartX = 0; // 按住左键时的起始 X 坐标
  #mouseHoldStartY = 0; // 按住左键时的起始 Y 坐标
  #mouseHoldDownTarget = null; // 按住左键按下时的事件目标（坐标定位失败时兜底）
  #boundMouseDownHandler = null; // 鼠标左键按下事件
  #boundMouseUpHandler = null; // 鼠标左键松开事件
  #boundMouseHoldMoveHandler = null; // 按住期间移动取消事件
  #boundMouseHoldClickHandler = null; // 按住翻译后拦截点击的事件
  #boundCancelMouseHold = null; // 取消按住状态的绑定函数
  #mouseHoldSuppressClick = false; // 本次按住翻译成功后是否阻止松开时的点击
  #mouseHoldPreventClickEnabled = false; // 本次按住是否启用“阻止点击跳转”
  #mouseHoldInteractive = false; // 按住起点是否位于链接/按钮等可交互元素上
  #holdRequestConcurrency = 0; // 按住触发翻译的在途 API 请求数
  #holdRequestWaiters = []; // 等待并发名额的翻译请求
  #holdRequestLimit = 5; // 按住触发翻译的最大并发请求数
  #holdUnitsCache = new WeakMap(); // 区域容器 -> 已收集的翻译单元（DOM 变更/重扫描时失效）
  #holdGeneration = 0; // 按住操作代次：语言检测期间还原/重触发后用于废弃过期任务
  #holdProcessGenerations = new WeakMap(); // 节点 -> 当前语言检测中的按住代次，用于竞态回滚处理状态
  #hoveredNode = null; // 存储当前悬停的可翻译节点
  #hoverPointer = { x: 0, y: 0 }; // 最近一次鼠标位置，用于定位气泡
  #hoverPointerValid = false; // 是否已经收到过有效的 mousemove 坐标
  #hoverDeepElement = null; // 最近一次 mousemove 在 Shadow DOM 内的实际目标（composedPath[0]）
  #hoverBubbleNode = null; // 鼠标悬停气泡容器
  #hoverBubbleTarget = null; // 当前气泡绑定的原文节点
  #hoverBubbleRunId = 0; // 用于丢弃过期的气泡翻译请求
  #favoriteHoverTimer = null;
  #favoriteHoverTarget = null;
  #hoverOriginalTimer = null; // 延迟显示隐藏原文的定时器
  #hoverOriginalTimerTarget = null; // 当前等待显示原文的译文容器
  #boundMouseMoveHandler; // 鼠标事件
  #boundKeyDownHandler; // 键盘事件
  #windowMessageHandler = null;
  #boundFavoriteWordChange = null;
  #boundFavoriteMouseOver = null;
  #boundFavoriteMouseOut = null;

  #debouncedFindShadowRoot = null;

  #io; // IntersectionObserver
  #mo; // MutationObserver
  #dmm; // DebounceMouseMover

  #rescanQueue = new Set(); // “脏容器”队列
  #isQueueProcessing = false; // 队列处理状态标志

  // 获取当前视口中的稳定锚点，用于 DOM 高度/结构发生改变（如插入译文）后保持滚动条位置，防止页面视觉闪烁或滚动位置发生偏移
  #captureViewportAnchor(excludedElements) {
    if (!document.elementFromPoint || !window.scrollBy) return null;

    // 测试视口中部的三个不同纵坐标点（50%, 33%, 66%），确保抓取到一个有效的可视 DOM 节点
    const points = [0.5, 0.33, 0.66];
    for (const ratio of points) {
      const x = Math.max(0, Math.floor(window.innerWidth / 2));
      const y = Math.max(
        0,
        Math.min(window.innerHeight - 1, Math.floor(window.innerHeight * ratio))
      );
      const element = document.elementFromPoint(x, y);
      let anchor = this.#normalizeViewportAnchor(element);
      // 如果锚点会在本次操作中被移除，则向上查找一个稳定的祖先节点
      while (anchor && excludedElements?.has(anchor)) {
        anchor = anchor.parentElement || anchor.getRootNode?.()?.host || null;
      }
      if (!anchor?.isConnected) continue;

      const rect = anchor.getBoundingClientRect();
      if (rect.width || rect.height) {
        return { element: anchor, top: rect.top };
      }
    }

    return null;
  }

  // 规范化视口锚点，如果是译文容器节点，则向上归纳为对应的原文节点，以保证高度恢复的稳定性
  #normalizeViewportAnchor(element) {
    if (!element) return null;

    const wrapper = element.closest?.(`.${Translator.KISS_CLASS.warpper}`);
    if (!wrapper) return element;

    const { nodes } = this.#translationNodes.get(wrapper) || {};
    const originalNode = nodes?.find((node) => node.isConnected);
    if (originalNode?.nodeType === Node.ELEMENT_NODE) return originalNode;
    if (originalNode?.parentElement?.isConnected)
      return originalNode.parentElement;

    return wrapper.previousElementSibling || wrapper.parentElement;
  }

  // 恢复滚动视口的锚点位置，通过计算锚点元素的位移差进行补偿滚动
  #restoreViewportAnchor(anchor) {
    if (!anchor?.element?.isConnected) return;

    const scrollingElement =
      document.scrollingElement || document.documentElement;
    if (!scrollingElement) return;

    const overflowY = window.getComputedStyle(scrollingElement).overflowY;
    const canScrollDocument =
      scrollingElement.scrollHeight > scrollingElement.clientHeight &&
      overflowY !== "hidden" &&
      overflowY !== "clip";
    if (!canScrollDocument) return;

    const currentTop = anchor.element.getBoundingClientRect().top;
    const offset = currentTop - anchor.top;
    // 如果位移差超过 0.5 像素，则平滑滚动以补偿该差值
    if (Math.abs(offset) > 0.5) {
      window.scrollBy(0, offset);
    }
  }

  // 包装执行 DOM 修改的回调函数，并在前后自动完成视口滚动稳定保护
  #withViewportAnchor(callback, excludedElements) {
    const anchor = this.#captureViewportAnchor(excludedElements);
    try {
      return callback();
    } finally {
      this.#restoreViewportAnchor(anchor);
    }
  }

  // 忽略元素
  get #ignoreSelector() {
    if (this.#rule.scanAll === "true" || this.#rule.isPlainText) {
      return Translator.KISS_IGNORE_SELECTOR;
    }

    const selectors = [Translator.KISS_IGNORE_SELECTOR];
    if (this.#rule.autoScan !== "false") {
      selectors.push(Translator.BUILTIN_IGNORE_SELECTOR);
    }

    const userSelector = this.#rule.ignoreSelector?.trim();
    if (userSelector) {
      selectors.push(userSelector);
    }

    return selectors.join(", ");
  }

  #isIgnoredElement(node) {
    return (
      node?.nodeType === Node.ELEMENT_NODE &&
      node.matches?.(this.#ignoreSelector)
    );
  }

  #matchesBlockSelector(node) {
    const selector = this.#rule.blockSelector?.trim();
    if (
      !selector ||
      this.#blockSelectorInvalid ||
      !Translator.isElement(node)
    ) {
      return false;
    }

    try {
      return node.matches(selector);
    } catch (err) {
      this.#blockSelectorInvalid = true;
      kissLog("invalid blockSelector", err);
      return false;
    }
  }

  #appendCssText(node, cssText, label) {
    if (typeof cssText !== "string" || !cssText.trim()) return;

    try {
      const style = node?.style;
      if (
        !style ||
        typeof style !== "object" ||
        typeof style.cssText !== "string"
      ) {
        return;
      }

      style.cssText = `${style.cssText || ""}${cssText}`;
    } catch (err) {
      kissLog("append rule style error", label, err);
    }
  }

  #isBlockNode(node) {
    if (this.#matchesBlockSelector(node)) return true;
    return Translator.isBlockNode(node);
  }

  #hasBlockNode(node) {
    if (!Translator.isElementOrFragment(node)) return false;
    for (const child of node.childNodes) {
      if (this.#isBlockNode(child)) {
        return true;
      }
    }
    return false;
  }

  #getPlainTextChunkLimit() {
    const maxLength = Number(this.#setting.maxLength);
    // 单个纯文本块必须小于 maxLength，避免后续 #isInvalidText 直接过滤。
    const hardLimit = Number.isFinite(maxLength)
      ? Math.max(1, maxLength - 1)
      : 3000;

    // 控制默认块大小，避免纯文本页面一次请求过长文本。
    return Math.min(3000, hardLimit);
  }

  #findPlainTextBreakIndex(text, limit) {
    const slice = text.slice(0, limit + 1);
    let breakIndex = -1;
    // 优先在句尾或换行处切分，减少把一句话截断的概率。
    const naturalBreakRegex = /(?:[。！？]+|[.?!]+(?=\s+|$)|\n+)/g;
    let match;

    while ((match = naturalBreakRegex.exec(slice)) !== null) {
      const candidate = match.index + match[0].length;
      if (candidate > 0 && candidate <= limit) {
        breakIndex = candidate;
      }
    }

    if (breakIndex > Math.floor(limit * 0.4)) {
      return breakIndex;
    }

    for (let i = limit; i > Math.floor(limit * 0.4); i--) {
      if (/\s/.test(text[i - 1])) {
        return i;
      }
    }

    return limit;
  }

  #readPlainTextNewline(source, offset) {
    let count = 0;
    let nextOffset = offset;

    while (nextOffset < source.length) {
      const char = source[nextOffset];
      if (char === "\r") {
        count++;
        nextOffset += source[nextOffset + 1] === "\n" ? 2 : 1;
      } else if (char === "\n") {
        count++;
        nextOffset++;
      } else {
        break;
      }
    }

    return count ? { count, nextOffset } : null;
  }

  #findPlainTextLineEnd(source, offset) {
    let cursor = offset;

    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "\r" || char === "\n") break;
      cursor++;
    }

    return cursor;
  }

  #readNextPlainTextChunk(source, offset, limit) {
    if (offset >= source.length) return null;

    const newline = this.#readPlainTextNewline(source, offset);
    if (newline) {
      return {
        type: "break",
        count: Math.max(0, newline.count - 1),
        nextOffset: newline.nextOffset,
      };
    }

    const lineEnd = this.#findPlainTextLineEnd(source, offset);
    const lineLength = lineEnd - offset;

    if (lineLength <= limit) {
      return {
        type: "text",
        value: source.slice(offset, lineEnd),
        nextOffset: lineEnd,
      };
    }

    // 超长单行继续按自然边界或硬上限拆分，保证每个 span 可单独翻译。
    const splitIndex = this.#findPlainTextBreakIndex(
      source.slice(offset, lineEnd),
      limit
    );

    return {
      type: "text",
      value: source.slice(offset, offset + splitIndex),
      nextOffset: offset + splitIndex,
    };
  }

  #createPlainTextChunkNode(chunk) {
    if (chunk.type !== "text" || !chunk.value) return null;

    const span = document.createElement("span");
    span.style.cssText = "display: block; white-space: pre-wrap;";
    span.textContent = chunk.value;

    return span;
  }

  #appendPlainTextPreBatch(pre, state, isInitialBatch = false) {
    if (
      state.runId !== this.#runId ||
      !pre.isConnected ||
      !this.#rule.isPlainText
    ) {
      this.#plainTextPreprocessingNodes.delete(pre);
      return;
    }

    const limit = this.#getPlainTextChunkLimit();
    const maxNodes = isInitialBatch ? 20 : 100;
    const maxDuration = isInitialBatch ? Infinity : 10;
    const startedAt = performance.now?.() || Date.now();
    const fragment = document.createDocumentFragment();
    const textNodes = [];
    let nodeCount = 0;

    while (
      (state.offset < state.source.length || state.pendingBreaks > 0) &&
      nodeCount < maxNodes
    ) {
      if (state.pendingBreaks > 0) {
        fragment.appendChild(document.createElement("br"));
        state.pendingBreaks--;
        nodeCount++;
        continue;
      }

      const chunk = this.#readNextPlainTextChunk(
        state.source,
        state.offset,
        limit
      );
      if (!chunk) break;

      state.offset = chunk.nextOffset;

      if (chunk.type === "break") {
        // 一个换行只结束当前 span；连续换行额外生成 br 来保留空白行。
        state.pendingBreaks += chunk.count;
      } else {
        const node = this.#createPlainTextChunkNode(chunk);
        if (node) {
          fragment.appendChild(node);
          textNodes.push(node);
          nodeCount++;
        }
      }

      if (
        !isInitialBatch &&
        nodeCount > 0 &&
        (performance.now?.() || Date.now()) - startedAt >= maxDuration
      ) {
        break;
      }
    }

    if (fragment.childNodes.length) {
      pre.appendChild(fragment);
      textNodes.forEach((node) => this.#startObserveNode(node));
    }

    if (state.offset < state.source.length || state.pendingBreaks > 0) {
      scheduleIdle(() => this.#appendPlainTextPreBatch(pre, state), 100);
    } else {
      this.#plainTextPreprocessingNodes.delete(pre);
    }
  }

  #initPlainTextPre(pre) {
    if (pre.dataset.kissPreprocessed === "true") {
      return;
    }

    // 使用 textContent 读取纯文本，避免把 <tag> 这类内容重新解析成 HTML。
    const state = {
      source: pre.textContent || "",
      offset: 0,
      runId: this.#runId,
      pendingBreaks: 0,
    };

    pre.dataset.kissPreprocessed = "true";
    this.#plainTextPreprocessingNodes.add(pre);
    pre.replaceChildren();
    this.#appendPlainTextPreBatch(pre, state, true);
  }

  // 接口参数
  // todo: 不用频繁查找计算
  get #apiSetting() {
    // return (
    //   this.#setting.transApis.find(
    //     (api) => api.apiSlug === this.#rule.apiSlug
    //   ) || DEFAULT_API_SETTING
    // );
    return this.#apisMap.get(this.#rule.apiSlug) || DEFAULT_API_SETTING;
  }

  // 气泡模式可使用独立接口；配置失效时继续跟随当前网页规则。
  get #hoverBubbleApiSetting() {
    const apiSlug = this.#setting.mouseHoverSetting?.apiSlug;
    if (!apiSlug || apiSlug === GLOBAL_KEY) {
      return this.#apiSetting;
    }

    const apiSetting = this.#apisMap.get(apiSlug);
    return apiSetting && !apiSetting.isDisabled ? apiSetting : this.#apiSetting;
  }

  get #transAllnow() {
    const apiValue = this.#apisMap.get(this.#rule.apiSlug)?.transAllnow;
    if (apiValue !== undefined) {
      return apiValue === true || apiValue === "true";
    }

    return (
      this.#setting.transAllnow === true || this.#setting.transAllnow === "true"
    );
  }

  get #rootMargin() {
    const apiValue = this.#apisMap.get(this.#rule.apiSlug)?.rootMargin;
    const legacyValue = this.#setting.rootMargin;
    const value =
      apiValue !== undefined && apiValue !== ""
        ? apiValue
        : legacyValue !== undefined && legacyValue !== ""
          ? legacyValue
          : 500;
    const rootMargin = Number(value);

    return Number.isFinite(rootMargin) ? rootMargin : 500;
  }

  // 占位符配置（包含正则）
  get #placeholderConfig() {
    if (this.#placeholderCache) {
      return this.#placeholderCache;
    }

    const [startDelimiter, endDelimiter] =
      this.#apiSetting.placeholder.split(" ");

    // 确保 placetag 始终是字符串（兼容旧配置可能是数组）
    let tagName = this.#apiSetting.placetag;
    if (Array.isArray(tagName)) {
      tagName = tagName[0] || "i";
    }
    if (typeof tagName !== "string") {
      tagName = "i"; // 默认值
    }

    const format = this.#apiSetting.placetagFormat || "compact"; // 占位符格式
    const safeTag = "span";

    // 1. 缓存常用还原正则
    let openRegex, closeRegex;
    if (format === "attribute") {
      openRegex = new RegExp(`<${tagName}\\s+i=(\\d+)>`, "gi");
      closeRegex = new RegExp(`<\\/${tagName}>`, "gi");
    } else {
      openRegex = new RegExp(`<${tagName}(\\d+)>`, "gi");
      closeRegex = new RegExp(`<\\/${tagName}(\\d+)>`, "gi");
    }

    // 2. 创建普通占位符正则（标签占位符在restoreFromTranslation中单独处理）
    // 只匹配普通占位符 {{1}}, {{2}} 等
    const escapedStart = Translator.escapeRegex(startDelimiter);
    const escapedEnd = Translator.escapeRegex(endDelimiter);
    const placeholderPattern = `${escapedStart}\\d+${escapedEnd}`;
    const placeholderRegex = new RegExp(placeholderPattern, "g");

    const result = {
      startDelimiter,
      endDelimiter,
      tagName,
      format,
      safeTag,
      openRegex,
      closeRegex,
      placeholderRegex,
    };

    this.#placeholderCache = result;
    return result;
  }

  constructor({ rule = {}, setting = {}, favWords = [] }) {
    this.#setting = { ...Translator.DEFAULT_OPTIONS, ...setting };
    this.#rule = {
      ...Translator.DEFAULT_RULE,
      ...rule,
      isPlainText: rule.isPlainText === true || rule.isPlainText === "true",
    };
    this.#favWords = this.#dedupeFavoriteWords(favWords);
    this.#apisMap = new Map(
      this.#setting.transApis.map((api) => [api.apiSlug, api])
    );

    this.#eventName = genEventName();
    this.#combinedSkipsRegex = new RegExp(
      Translator.BUILTIN_SKIP_PATTERNS.map((r) => `(${r.source})`).join("|")
    );

    this.#parseTerms(this.#rule.terms);
    // this.#parseAITerms(this.#rule.aiTerms);
    this.#glossary = parseAITerms(this.#rule.aiTerms);
    this.#createTextStyles();

    this.#boundMouseMoveHandler = this.#handleMouseMove.bind(this);
    this.#boundKeyDownHandler = this.#handleKeyDown.bind(this);

    this.#io = this.#createIntersectionObserver();
    this.#mo = this.#createMutationObserver();
    this.#dmm = this.#createDebounceMouseMover();

    this.#windowMessageHandler = this.#handleWindowMessage.bind(this);
    this.#boundFavoriteWordChange = this.#handleFavoriteWordChange.bind(this);
    this.#boundFavoriteMouseOver = this.#handleFavoriteMouseOver.bind(this);
    this.#boundFavoriteMouseOut = this.#handleFavoriteMouseOut.bind(this);
    document.addEventListener(
      EVENT_FAVORITE_WORD_CHANGE,
      this.#boundFavoriteWordChange
    );
    document.addEventListener("mouseover", this.#boundFavoriteMouseOver);
    document.addEventListener("mouseout", this.#boundFavoriteMouseOut);
    this.#debouncedFindShadowRoot = debounce(
      this.#findAndObserveShadowRoot.bind(this),
      300
    );

    // 鼠标悬停翻译
    if (this.#setting.mouseHoverSetting.useMouseHover) {
      this.#enableMouseHover();
    }

    // 仅显示译文模式下悬浮恢复原文
    if (
      this.#rule.transOnly === "true" &&
      this.#rule.transOnlyRevert === "true"
    ) {
      this.#enableTransOnlyRevert();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#run());
    } else {
      this.#run();
    }
  }

  // 启动
  #run() {
    if (this.#rule.transOpen === "true") {
      this.enable();
    } else if (this.#setting.preInit) {
      this.#init();
    }
  }

  // 初始化
  #init() {
    this.#isInitialized = true;
    // 重新初始化意味着规则/DOM 都可能变化，按住翻译的区域单元缓存全部失效
    this.#holdUnitsCache = new WeakMap();

    // 注入JS/CSS
    this.#initInjector();

    // 纯文本预处理
    if (this.#rule.isPlainText) {
      document.querySelectorAll("pre").forEach((pre) => {
        this.#initPlainTextPre(pre);
      });
    }

    // 查找根节点并扫描
    document
      .querySelectorAll(this.#rule.rootsSelector || "body")
      .forEach((root) => {
        this.#startObserveRoot(root);
      });

    if (this.#rule.scanAll === "true" || this.#rule.hasShadowroot === "true") {
      this.#attachShadowRootListener();
      this.#findAndObserveShadowRoot();
    }
  }

  #handleWindowMessage(event) {
    if (event.data?.type === "KISS_SHADOW_ROOT_CREATED") {
      this.#debouncedFindShadowRoot();
    }
  }

  #attachShadowRootListener() {
    if (!this.#isShadowRootJsInjected) {
      const id = "kiss-translator-inject-shadowroot-js";
      injectJs(INJECTOR.shadowroot, id);

      this.#isShadowRootJsInjected = true;
    }

    window.addEventListener("message", this.#windowMessageHandler);
  }

  #removeShadowRootListener() {
    window.removeEventListener("message", this.#windowMessageHandler);
  }

  // 查找现有的所有shadowroot
  #findAndObserveShadowRoot() {
    try {
      this.#findAllShadowRoots().forEach((shadowRoot) => {
        this.#startObserveShadowRoot(shadowRoot);
      });
    } catch (err) {
      kissLog("findAllShadowRoots", err);
    }
  }

  // 创建样式
  #createTextStyles() {
    const [textClass, textStyles] = genTextClass(this.#setting.customStyles);
    this.#textClass = textClass;
    this.#textStylesRaw = textStyles;

    try {
      const textSheet = new CSSStyleSheet();
      textSheet.replaceSync(textStyles);
      this.#textSheet = textSheet;
    } catch (err) {
      kissLog("createTextStyles: CSSStyleSheet not available", err);
      // CSSStyleSheet 在当前环境不可用（Firefox 内容脚本等），改用内联 <style>
      this.#useSheetFallback = true;
    }
  }

  // 注入样式（优先 adoptedStyleSheets，失败时回退到 <style>）
  #injectSheet(shadowRoot) {
    if (this.#useSheetFallback || !this.#textSheet) {
      this.#injectSheetFallback(shadowRoot);
      return;
    }

    try {
      if (!shadowRoot.adoptedStyleSheets.includes(this.#textSheet)) {
        shadowRoot.adoptedStyleSheets = [
          ...shadowRoot.adoptedStyleSheets,
          this.#textSheet,
        ];
      }
    } catch {
      // Firefox 跨作用域限制：内容脚本的 CSSStyleSheet 无法赋值给页面 ShadowRoot
      this.#useSheetFallback = true;
      this.#injectSheetFallback(shadowRoot);
    }
  }

  // 回退方案：通过内联 <style> 元素注入样式（兼容 Firefox）
  #injectSheetFallback(shadowRoot) {
    const fallbackStyleId = `${APP_LCNAME}-fallback-style`;
    if (shadowRoot.getElementById(fallbackStyleId)) return;

    const style = document.createElement("style");
    style.id = fallbackStyleId;
    style.textContent = this.#textStylesRaw || "";
    shadowRoot.append(style);
  }

  // 解析专业术语字符串
  #parseTerms(termsString) {
    this.#termEntries = [];
    this.#combinedTermsRegex = null;
    this.#termMatcher = null;

    if (!termsString || typeof termsString !== "string") return;

    // 纯函数解析：按 key.length 降序、同 key 去重、非法正则收集。
    // fast 模式跳过跨术语 O(n²) 冲突分析，避免阻塞 Translator 初始化；
    // 跨术语 conflicting-pattern 诊断由 Playground / CLI 的完整模式负责。
    const { terms, invalid, diagnostics, hasErrors } = parseTerms(termsString, {
      fullDiagnostics: false,
    });

    if (invalid.length > 0) {
      invalid.forEach(({ key, error }) =>
        kissLog(`Invalid RegExp for term: "${key}"`, error)
      );
    }

    // 保留诊断与 hasErrors 日志（供 Playground / 控制台排查），但不再因任一非法段
    // 禁用整份术语：parseTerms 已逐条排除非法项，返回的 terms 是可安全应用的合法集合。
    if (hasErrors) {
      kissLog("Term parse errors (legal terms still applied): ", diagnostics);
    }

    this.#termEntries = terms;
    this.#combinedTermsRegex = buildTermsRegex(terms);
    // matcher 一次物化槽位表与 phase 正则，逐文本节点扫描零编译；
    // 规则更新走 #parseTerms 整体重建，热更新自然失效。
    this.#termMatcher = buildTermsMatcher(terms);
  }

  // #parseAITerms(termsString) {
  //   if (!termsString || typeof termsString !== "string") return;

  //   try {
  //     this.#glossary = Object.fromEntries(
  //       termsString
  //         .split(/\n|;/)
  //         .map((line) => {
  //           const [k = "", v = ""] = line.split(",").map((s) => s.trim());
  //           return [k, v];
  //         })
  //         .filter(([k]) => k)
  //     );
  //   } catch (err) {
  //     kissLog("parse aiterms", err);
  //   }
  // }

  // // todo: 利用AI总结
  // #getDocDescription() {
  //   try {
  //     const meta = document.querySelector('meta[name="description"]');
  //     const description = meta?.getAttribute("content") || "";
  //     return truncateWords(description);
  //   } catch (err) {
  //     kissLog("get description", err);
  //   }
  //   return "";
  // }

  // 监控翻译单元的可见性
  #createIntersectionObserver() {
    const { transInterval } = this.#setting;
    const rootMargin = this.#rootMargin;

    const pending = new Set();
    const flush = debounce(() => {
      pending.forEach((node) => this.#performSyncNode(node));
      pending.clear();
    }, transInterval);

    return new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.#viewNodes.add(entry.target);
            pending.add(entry.target);
            flush();
          } else {
            this.#viewNodes.delete(entry.target);
          }
        });
      },
      { threshold: 0.01, rootMargin: `${rootMargin}px 0px ${rootMargin}px 0px` }
    );
  }

  // 监控页面动态变化
  #createMutationObserver() {
    return new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          this.#ignoredMutationTargets.has(mutation.target) ||
          this.#skipMoNodes.has(mutation.target) ||
          this.#plainTextPreprocessingNodes.has(mutation.target) ||
          mutation.nextSibling?.tagName?.toLowerCase() ===
            this.#translationTagName
        ) {
          continue;
        }

        if (mutation.type === "characterData") {
          if (
            mutation.oldValue !== mutation.target.nodeValue &&
            !this.#combinedSkipsRegex.test(mutation.target.nodeValue)
          ) {
            this.#queueForRescan(mutation.target.parentElement);
          }
        } else if (mutation.type === "childList") {
          let nodes = new Set();
          let hasText = false;
          mutation.addedNodes.forEach((node) => {
            if (
              this.#skipMoNodes.has(node) ||
              node.nodeName?.toLowerCase() === this.#translationTagName
            ) {
              return;
            }

            if (node.nodeType === Node.TEXT_NODE) {
              hasText = true;
            } else if (Translator.isElementOrFragment(node)) {
              nodes.add(node);
            }
          });
          if (hasText) {
            this.#queueForRescan(mutation.target);
          } else {
            nodes.forEach((node) => this.#queueForRescan(node));
          }
        }
      }
    });
  }

  #withIgnoredMutations(targets, callback) {
    const validTargets = targets.filter((target) => target instanceof Node);
    validTargets.forEach((target) => this.#ignoredMutationTargets.add(target));
    try {
      return callback();
    } finally {
      queueMicrotask(() => {
        validTargets.forEach((target) =>
          this.#ignoredMutationTargets.delete(target)
        );
      });
    }
  }

  // 节流的鼠标悬停事件
  #createDebounceMouseMover() {
    return debounce((targetNode) => {
      const startNode = targetNode;
      const favoriteWord = startNode.closest?.(
        `.${Translator.KISS_CLASS.highlight}`
      );
      if (favoriteWord && this.#isFavoriteHighlightInScope(favoriteWord)) {
        this.#hoveredNode = null;
        this.#clearHoverOriginalTimer();
        return;
      }

      // 仅译文模式下，真实鼠标目标是扩展生成的译文容器；必须先于普通页面节点识别。
      const translationWrapper = startNode.closest?.(
        `.${Translator.KISS_CLASS.warpper}`
      );
      const {
        mouseHoverKey = [],
        mouseHoverKey2 = [],
        mouseHoverKeyHold = false,
        mouseHoverKey2Hold = false,
      } = this.#setting.mouseHoverSetting;
      const hasMouseHoverTrigger =
        mouseHoverKey.length > 0 ||
        mouseHoverKey2.length > 0 ||
        mouseHoverKeyHold ||
        mouseHoverKey2Hold;

      if (translationWrapper) {
        this.#hoveredNode = translationWrapper;
        if (this.#canShowOriginalInHoverBubble(translationWrapper)) {
          if (hasMouseHoverTrigger) {
            // 配置了快捷键时只记录目标，等待快捷键回调立即显示原文。
            this.#clearHoverOriginalTimer();
            if (this.#hoverBubbleTarget !== translationWrapper) {
              this.#hideHoverBubble();
            }
          } else {
            this.#scheduleOriginalHoverBubble(translationWrapper);
          }
        } else {
          this.#hideHoverBubble();
        }
        return;
      }

      if (
        this.#hoverOriginalTimerTarget ||
        this.#hoverBubbleTarget?.classList?.contains(
          Translator.KISS_CLASS.warpper
        )
      ) {
        // 鼠标已离开译文，取消待显示任务并清除现有原文气泡。
        this.#hideHoverBubble();
      }

      let foundNode = null;
      while (targetNode && targetNode !== document.body) {
        if (this.#observedNodes.has(targetNode)) {
          foundNode = targetNode;
          break;
        }
        targetNode = targetNode.parentElement;
      }
      this.#hoveredNode = foundNode || startNode;

      if (!hasMouseHoverTrigger && !this.#isInitialized) {
        this.#init();
      }
      if (!hasMouseHoverTrigger && foundNode) {
        this.#toggleTargetNode(foundNode);
      } else if (!foundNode && this.#isMouseHoverBubbleMode()) {
        this.#hideHoverBubble();
      }
    }, 100);
  }

  // 跟踪鼠标下的可翻译节点
  #handleMouseMove(event) {
    this.#hoverPointer = { x: event.clientX, y: event.clientY };
    this.#hoverPointerValid = true;
    if (
      this.#isMouseHoverBubbleMode() &&
      this.#hoverBubbleNode &&
      !this.#hoverBubbleNode.hidden
    ) {
      this.#positionHoverBubble();
    }
    let targetNode = event.composedPath()[0];
    // 记录 Shadow DOM 内的实际目标：elementFromPoint 对 Shadow DOM 只返回宿主元素
    this.#hoverDeepElement =
      targetNode?.nodeType === Node.ELEMENT_NODE
        ? targetNode
        : targetNode?.parentElement || targetNode;
    this.#dmm(targetNode);
  }

  // 快捷键按下时的处理器
  #handleKeyDown() {
    if (!this.#isInitialized) {
      this.#init();
    }
    let targetNode = this.#hoveredNode;
    // 译文容器不属于 observedNodes，快捷键路径需要在普通可翻译节点校验之前处理。
    if (this.#canShowOriginalInHoverBubble(targetNode)) {
      this.#showOriginalHoverBubble(targetNode);
      return;
    }
    if (!targetNode || !this.#observedNodes.has(targetNode)) return;

    this.#toggleTargetNode(targetNode);
  }

  // 触发段落翻译
  toggleHoverNode() {
    this.#handleKeyDown();
  }

  // 获取按住左键触发翻译需要等待的毫秒数
  #getMouseHoldDelay() {
    const delay = Number(
      this.#setting.mouseHoverSetting?.mouseHoverHoldDelay
    );
    return Number.isFinite(delay) && delay > 0
      ? delay
      : DEFAULT_MOUSE_HOVER_HOLD_DELAY;
  }

  // 按住左键译文是否独立成块显示（默认独立成块，便于长文对照阅读）
  #getMouseHoldBlockDisplay() {
    const display =
      this.#setting.mouseHoverSetting?.mouseHoverTransDisplay ||
      OPT_MOUSE_HOVER_TRANS_DISPLAY_BLOCK;
    return display !== OPT_MOUSE_HOVER_TRANS_DISPLAY_INLINE;
  }

  // 纯触屏设备（无任何支持悬停的指针输入）上“按住鼠标左键”没有对应语义，
  // 长按会触发系统菜单/选词，容易误触发翻译，因此不注册按住监听。
  // 使用 any-hover：触屏为主但外接鼠标/触控板的混合设备仍应启用。
  // matchMedia 不可用或抛错时（极旧环境）默认启用。
  #isHoldSupportedByDevice() {
    try {
      return (
        typeof window.matchMedia !== "function" ||
        window.matchMedia("(any-hover: hover)").matches
      );
    } catch (err) {
      return true;
    }
  }

  // 注册“按住鼠标左键不放”触发翻译/还原的监听
  #registerMouseHoldHandler() {
    if (this.#removeMouseHoldHandlers) return;

    this.#boundMouseDownHandler = (event) =>
      this.#handleMouseHoldDown(event);
    this.#boundMouseUpHandler = (event) => this.#handleMouseHoldUp(event);
    this.#boundMouseHoldMoveHandler = (event) =>
      this.#handleMouseHoldMove(event);
    this.#boundMouseHoldClickHandler = (event) =>
      this.#handleMouseHoldClick(event);
    this.#boundCancelMouseHold = () => this.#cancelMouseHold();

    document.addEventListener(
      "mousedown",
      this.#boundMouseDownHandler,
      true
    );
    document.addEventListener("mouseup", this.#boundMouseUpHandler, true);
    document.addEventListener(
      "mousemove",
      this.#boundMouseHoldMoveHandler,
      { capture: true, passive: true }
    );
    document.addEventListener(
      "click",
      this.#boundMouseHoldClickHandler,
      true
    );
    window.addEventListener("blur", this.#boundCancelMouseHold);
    document.addEventListener(
      "visibilitychange",
      this.#boundCancelMouseHold
    );
    // 触摸手势被浏览器接管（按住后滚动/系统手势）时取消，避免残留状态触发翻译
    document.addEventListener(
      "pointercancel",
      this.#boundCancelMouseHold,
      true
    );
    // 按住期间弹出右键/移动端长按菜单时取消
    document.addEventListener(
      "contextmenu",
      this.#boundCancelMouseHold,
      true
    );

    this.#removeMouseHoldHandlers = () => {
      document.removeEventListener(
        "mousedown",
        this.#boundMouseDownHandler,
        true
      );
      document.removeEventListener(
        "mouseup",
        this.#boundMouseUpHandler,
        true
      );
      document.removeEventListener(
        "mousemove",
        this.#boundMouseHoldMoveHandler,
        true
      );
      document.removeEventListener(
        "click",
        this.#boundMouseHoldClickHandler,
        true
      );
      window.removeEventListener("blur", this.#boundCancelMouseHold);
      document.removeEventListener(
        "visibilitychange",
        this.#boundCancelMouseHold
      );
      document.removeEventListener(
        "pointercancel",
        this.#boundCancelMouseHold,
        true
      );
      document.removeEventListener(
        "contextmenu",
        this.#boundCancelMouseHold,
        true
      );
      this.#removeMouseHoldHandlers = null;
      this.#boundCancelMouseHold = null;
    };
  }

  // 鼠标左键按下：等待设定的延迟后触发翻译/还原
  #handleMouseHoldDown(event) {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target?.closest?.(
        "input, textarea, select, [contenteditable='true'], [contenteditable='']"
      )
    ) {
      return;
    }

    this.#cancelMouseHold();
    this.#mouseHoldActive = true;
    this.#mouseHoldTriggered = false;
    this.#mouseHoldSuppressClick = false;
    this.#mouseHoldPreventClickEnabled = Boolean(
      this.#setting.mouseHoverSetting?.mouseHoverPreventClick
    );
    this.#mouseHoldInteractive = Boolean(
      target?.closest?.(
        "button, a, [role='button'], [role='link'], summary"
      )
    );
    this.#mouseHoldStartX = event.clientX;
    this.#mouseHoldStartY = event.clientY;
    this.#mouseHoldDownTarget = target;

    this.#mouseHoldTimer = setTimeout(() => {
      this.#mouseHoldTimer = null;
      if (!this.#mouseHoldActive) return;
      // 按住过程中如果已经产生了文字选区（正在拖选），不触发翻译
      const selectionText = window.getSelection?.()?.toString()?.trim();
      if (selectionText) return;
      this.#mouseHoldTriggered = true;
      // 先为本次按住生成候选代次，只有目标解析和规则校验实际接受后
      // 才推进全局代次，避免“按在无效目标上”误伤其他正在检测的任务。
      const generation = this.#holdGeneration + 1;
      const accepted = this.#handleMouseHoldToggle(generation);
      if (accepted) {
        this.#holdGeneration = generation;
      }
      // 只有实际接受（翻译或还原）了目标时才启用点击抑制：
      // 被规则排除或未命中任何目标的按住不应吞掉后续的导航/按钮点击
      if (
        accepted &&
        this.#mouseHoldPreventClickEnabled &&
        this.#mouseHoldInteractive
      ) {
        this.#mouseHoldSuppressClick = true;
      }
    }, this.#getMouseHoldDelay());
  }

  // 鼠标左键松开：取消本次按住状态
  #handleMouseHoldUp(event) {
    if (event.button !== 0) return;
    this.#cancelMouseHold();
  }

  // 按住期间鼠标明显移动（拖选/拖动）时取消触发
  #handleMouseHoldMove(event) {
    if (!this.#mouseHoldActive || this.#mouseHoldTriggered) return;
    const moved =
      Math.abs(event.clientX - this.#mouseHoldStartX) > 6 ||
      Math.abs(event.clientY - this.#mouseHoldStartY) > 6;
    if (moved) this.#cancelMouseHold();
  }

  // 按住链接/按钮翻译成功后，松开时的点击不再触发跳转或按钮点击
  #handleMouseHoldClick(event) {
    if (!this.#mouseHoldSuppressClick) return;
    this.#mouseHoldSuppressClick = false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  // 取消按住左键触发的等待状态
  #cancelMouseHold() {
    this.#mouseHoldActive = false;
    this.#mouseHoldTriggered = false;
    this.#mouseHoldPreventClickEnabled = false;
    this.#mouseHoldInteractive = false;
    this.#mouseHoldDownTarget = null;
    if (this.#mouseHoldSuppressClick) {
      // click 事件在 mouseup 之后同步触发，这里仅作为兜底清理，
      // 避免窗口失焦等场景下标志残留导致下一次点击被误拦截。
      setTimeout(() => {
        this.#mouseHoldSuppressClick = false;
      }, 0);
    }
    if (this.#mouseHoldTimer) {
      clearTimeout(this.#mouseHoldTimer);
      this.#mouseHoldTimer = null;
    }
  }

  // 按住左键到点后执行：优先翻译/还原光标所在的整块文字区域
  #handleMouseHoldToggle(generation) {
    if (!this.#isInitialized) {
      this.#init();
    }
    let targetNode = this.#hoveredNode;
    // 触发瞬间重新用鼠标坐标定位，避免滚动/动态渲染后悬停节点过期
    // （Outlook 邮件正文等页面容易出现只命中第一行的问题）。
    // 页面刚加载、尚未收到 mousemove 时，退回 mousedown 时的坐标。
    const pointerX = this.#hoverPointerValid
      ? this.#hoverPointer.x
      : this.#mouseHoldStartX;
    const pointerY = this.#hoverPointerValid
      ? this.#hoverPointer.y
      : this.#mouseHoldStartY;
    try {
      const el = document.elementFromPoint?.(pointerX, pointerY);
      if (el) {
        // Shadow DOM 命中时 elementFromPoint 只返回宿主元素；
        // 若最近一次 mousemove 的实际目标位于该宿主的 Shadow Root 内，改用实际目标
        let hit = el;
        const deep = this.#hoverDeepElement;
        if (deep && el.shadowRoot?.contains?.(deep)) {
          hit = deep;
        }
        // 链接/按钮等可交互文字元素优先作为独立翻译目标，
        // 避免跳转到其外层容器后翻译范围过大。
        const atomic = this.#findAtomicHoldTarget(hit);
        if (atomic) {
          targetNode = atomic;
        } else {
          let resolved = null;
          let node = hit;
          while (node && node !== document.body) {
            if (this.#observedNodes.has(node)) {
              resolved = node;
              break;
            }
            node = node.parentElement;
          }
          // 鼠标下的节点尚未被扫描/登记时，优先采用本次命中元素，
          // 避免 DOM 被动态替换后过期的悬停节点胜出。
          if (
            !resolved &&
            Translator.isElement(hit) &&
            hit !== document.body &&
            hit !== document.documentElement
          ) {
            resolved = hit;
          }
          if (resolved) {
            targetNode = resolved;
          }
        }
      }
    } catch (err) {
      kissLog("mouse hold resolve target", err);
    }
    // 坐标定位失败时退回 mousedown 按下时的目标元素
    if (!targetNode) {
      targetNode = this.#mouseHoldDownTarget;
    }
    if (this.#canShowOriginalInHoverBubble(targetNode)) {
      this.#showOriginalHoverBubble(targetNode);
      return true;
    }
    if (!targetNode) return false;
    // 鼠标悬停在译文容器上时，还原其所属的原始翻译单元
    if (targetNode.classList?.contains(Translator.KISS_CLASS.warpper)) {
      targetNode = targetNode.parentElement || targetNode;
    }

    // 链接、按钮等短文本元素作为独立翻译单元处理；
    // 这些元素通常位于导航/按钮等紧凑布局中，译文始终使用行内显示，
    // 避免块级译文把单行导航撑成两行甚至被容器裁剪。
    // 是否翻译仍遵循规则设置（不翻译节点选择器、根节点选择器、目标元素选择器等）。
    const atomicTarget = this.#findAtomicHoldTarget(targetNode);
    if (atomicTarget) {
      if (this.#isHoldTargetAllowed(atomicTarget)) {
        this.#toggleTargetNode(atomicTarget, true, false, generation);
        return true;
      }
      // 原子目标被规则排除时，回退到悬停时登记的容器/原文单元
      targetNode = this.#hoveredNode;
      if (targetNode?.classList?.contains(Translator.KISS_CLASS.warpper)) {
        targetNode = targetNode.parentElement || targetNode;
      }
    }

    // 规则设置优先：不满足不翻译节点选择器/根节点/目标选择器时直接跳过
    if (!this.#isHoldTargetAllowed(targetNode)) return false;

    // 容器内的文本全部位于块级子节点中时（如链接包裹 h1/span），
    // 直接翻译容器会因块级子节点被分段规则切断而落空，
    // 应下钻到最深层的文本容器（Yahoo 新闻标题等结构）。
    if (!Translator.hasTextNode(targetNode)) {
      const leaf = this.#findDeepestTextLeaf(targetNode);
      if (leaf && leaf !== targetNode && this.#isHoldTargetAllowed(leaf)) {
        targetNode = leaf;
      }
    }

    const transMode =
      this.#setting.mouseHoverSetting?.mouseHoverTransMode ||
      OPT_MOUSE_HOVER_TRANS_AREA;
    if (transMode === OPT_MOUSE_HOVER_TRANS_PARAGRAPH) {
      // 只翻译当前段：与旧版鼠标悬停翻译行为一致
      this.#toggleTargetNode(
        targetNode,
        true,
        this.#getMouseHoldBlockDisplay(),
        generation
      );
      return true;
    }

    const area = this.#findMouseHoverAreaNode(targetNode, transMode);
    if (!area || area === targetNode) {
      this.#toggleTargetNode(
        targetNode,
        true,
        this.#getMouseHoldBlockDisplay(),
        generation
      );
      return true;
    }
    return this.#toggleHoverBlock(area, generation);
  }

  // 查找可作为独立翻译目标的链接/按钮等可交互文字元素。
  // 按钮、链接、summary 等元素即使不在常规扫描范围内，
  // 也允许通过按住左键单独翻译，便于处理图标旁文字、按钮文案等短文本。
  #findAtomicHoldTarget(node) {
    let current = node;
    while (current && current !== document.body) {
      if (Translator.isElement(current)) {
        try {
          if (
            current.matches?.(
              "button, a, [role='button'], [role='link'], summary"
            ) &&
            (current.textContent || "").trim()
          ) {
            // 链接/按钮内部没有直接文本时，优先定位最深层的文本容器，
            // 让译文与解除截断的样式直接作用在真正的文本元素上
            // （如 <a><span>标题</span></a>，Yahoo 新闻标题即此类结构）。
            if (!Translator.hasTextNode(current)) {
              const leaf = this.#findSingleTextLeaf(current);
              if (leaf) return leaf;
            }
            // 链接/按钮内部只有块级内容时（如链接直接包裹 h2/p 等），
            // 把它当作原子目标会导致内部块被分段规则跳过而翻译失败，
            // 应退回由悬停登记的标题/段落节点处理。
            if (this.#hasBlockNode(current)) {
              break;
            }
            return current;
          }
        } catch (err) {
          // 忽略无效选择器
        }
      }
      current = current.parentElement;
    }
    return null;
  }

  // 查找可交互元素内唯一的非空文本叶子元素（行内文本容器）。
  // 若内部已经存在译文容器，则返回译文宿主，保证再次按住时能正确还原。
  #findSingleTextLeaf(node) {
    if (!Translator.isElement(node)) return null;
    const wrapper = node.querySelector?.(`.${Translator.KISS_CLASS.warpper}`);
    if (wrapper?.parentElement && wrapper.parentElement !== node) {
      return wrapper.parentElement;
    }
    let leaf = null;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (!current.nodeValue?.trim()) continue;
      if (leaf) return null; // 存在多个非空文本节点时不下钻
      leaf = current.parentElement;
    }
    if (!leaf || leaf === node) return null;
    if (
      leaf.matches?.("button, a, [role='button'], [role='link'], summary")
    ) {
      return null;
    }
    return leaf;
  }

  // 查找容器内文本最长的深层文本叶子元素。
  // 用于按住翻译的目标是外层容器、而真实文本在块级子节点内的情况。
  #findDeepestTextLeaf(node) {
    if (!Translator.isElement(node)) return null;
    let best = null;
    let bestLength = 0;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      const text = current.nodeValue?.trim() || "";
      if (!text) continue;
      if (current.parentElement?.closest?.(`.${Translator.KISS_CLASS.warpper}`)) {
        continue;
      }
      if (text.length > bestLength) {
        bestLength = text.length;
        best = current.parentElement;
      }
    }
    if (!best || best === node) return null;
    if (
      best.matches?.("button, a, [role='button'], [role='link'], summary")
    ) {
      return null;
    }
    return best;
  }

  // 目标是否位于规则设置的根节点内（rootsSelector）
  #isWithinRuleRoots(node) {
    if (this.#rootNodes.size === 0) return true;
    let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el) {
      for (const root of this.#rootNodes) {
        if (root === el || root.contains?.(el)) return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  // autoScan=false 时，目标必须匹配规则设置的目标元素选择器（selector）
  #matchesRuleTargetSelector(node) {
    if (this.#rule.autoScan !== "false") return true;
    const selector = this.#rule.selector?.trim();
    if (!selector) return true;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!Translator.isElement(el)) return false;
    try {
      return Boolean(el.matches(selector));
    } catch (err) {
      return false;
    }
  }

  // 按住左键翻译的目标是否允许翻译（遵循个人/订阅/全局规则设置）
  #isHoldTargetAllowed(node) {
    if (!node) return false;
    if (node.closest?.(this.#ignoreSelector)) return false;
    if (!this.#isWithinRuleRoots(node)) return false;
    if (!this.#matchesRuleTargetSelector(node)) return false;
    return true;
  }

  // 查找“翻译整个区域”模式下的区域容器。
  // 使用两层限制：
  // 按住左键区域翻译的目标容器定位：
  // - 翻译整篇文章（area）：优先最近的 article/main/[role=main] 等文章框架；
  // - 翻译最近区域（region）：优先“最近的、包含多个文字块”的容器，
  //   在 Outlook 中即邮件正文容器本身，不会把上方标题栏圈进来；
  // 两种模式下未命中时都退回鼠标上方最外层块级容器。
  #findMouseHoverAreaNode(node, scopeMode = OPT_MOUSE_HOVER_TRANS_AREA) {
    let el = node;
    if (el?.nodeType === Node.TEXT_NODE) {
      el = el.parentElement;
    }
    if (!Translator.isElementOrFragment(el)) return null;
    if (el.classList?.contains(Translator.KISS_CLASS.warpper)) return el;

    let current = el;
    let topmostBlock = el;
    let strong = null;
    let multi = null;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (
        !parent ||
        parent === document.body ||
        parent === document.documentElement ||
        parent.closest?.(this.#ignoreSelector) ||
        !this.#isWithinRuleRoots(parent)
      ) {
        break;
      }
      if (!this.#isBlockNode(parent)) break;
      if (!strong && this.#isHoverAreaContainer(parent)) {
        strong = parent;
      }
      if (!multi && this.#countTextBlockChildren(parent) >= 2) {
        multi = parent;
      }
      topmostBlock = parent;
      current = parent;
    }
    if (scopeMode === OPT_MOUSE_HOVER_TRANS_REGION) {
      // 最近区域优先
      return multi || strong || topmostBlock;
    }
    // 整篇文章优先
    return strong || multi || topmostBlock;
  }

  // 判断节点是否为语义化的内容容器（整篇文章/主区域）
  #isHoverAreaContainer(node) {
    if (!Translator.isElement(node)) return false;
    try {
      return Boolean(
        node.matches?.(
          "article, main, [role='main'], [role='article']"
        )
      );
    } catch (err) {
      return false;
    }
  }

  // 统计容器内可直接翻译的文字块数量（含容器自身的直接文本）
  #countTextBlockChildren(node) {
    let count = Translator.hasTextNode(node) ? 1 : 0;
    for (const child of node.children || []) {
      if (!Translator.isElement(child)) continue;
      if (!this.#isBlockNode(child)) continue;
      if (child.closest?.(this.#ignoreSelector)) continue;
      if (child.textContent?.trim()) count += 1;
    }
    return count;
  }

  // 整块翻译/还原区域内的所有翻译单元。
  // 返回是否实际接受（翻译或还原）了目标，供点击抑制判断使用。
  // generation 为按住操作代次，透传给各单元用于废弃过期任务。
  #toggleHoverBlock(container, generation) {
    if (!this.#isInitialized) {
      this.#init();
    }
    // 区域容器必须在规则设置的根节点内，避免越界翻译
    if (!this.#isWithinRuleRoots(container)) {
      return false;
    }
    let units = this.#holdUnitsCache.get(container);
    if (!units) {
      this.#scanNode(container);
      units = this.#collectHoverBlockUnits(container);
      // 空结果不缓存：区域可能尚未扫描完成，下次按住再尝试
      if (units.length > 0) {
        this.#holdUnitsCache.set(container, units);
      }
    }
    // 缓存与新鲜收集的单元统一执行完整规则校验（ignore/roots/selector）：
    // updateRule 收紧范围规则后，旧的已观察单元不会被继续翻译
    units = units.filter((unit) => this.#isHoldTargetAllowed(unit));
    if (units.length === 0) {
      this.#toggleTargetNode(
        this.#hoveredNode,
        true,
        this.#getMouseHoldBlockDisplay(),
        generation
      );
      return true;
    }

    const allProcessed = units.every((unit) =>
      this.#processedNodes.has(unit)
    );
    if (allProcessed) {
      this.#restoreHoverBlock(container);
      return true;
    }

    units.forEach((unit) => {
      if (!this.#processedNodes.has(unit)) {
        this.#processNode(unit, {
          blockDisplay: this.#getMouseHoldBlockDisplay(),
          limitConcurrency: true,
          generation,
        });
      }
    });
    return true;
  }

  // 并发限流：区域模式按住触发可能一次翻译几十个单元，
  // 限制同时在途的 API 请求数，避免瞬间打满服务端限流配额。
  #acquireHoldRequestSlot() {
    if (this.#holdRequestConcurrency < this.#holdRequestLimit) {
      this.#holdRequestConcurrency += 1;
      // 快速路径直接返回 undefined，调用方同步继续，不引入额外微任务
      return undefined;
    }
    return new Promise((resolve) => {
      this.#holdRequestWaiters.push(resolve);
    });
  }

  #releaseHoldRequestSlot() {
    const next = this.#holdRequestWaiters.shift();
    if (next) {
      next(); // 名额直接转给下一个等待者，在途总数保持不变
    } else {
      this.#holdRequestConcurrency -= 1;
    }
  }

  // 收集区域内最外层（互不包含）的已观察翻译单元
  #collectHoverBlockUnits(container) {
    const units = [];
    const maxLength = Number(this.#setting.maxLength) || 100000;
    const visit = (node, isRoot) => {
      if (!Translator.isElementOrFragment(node)) return;
      // 根节点需检查整条祖先链；递归进入的子节点其祖先已在上一层验证过，
      // 只需 matches 检查自身，避免每个节点都重复遍历祖先链。
      const isIgnored = isRoot
        ? node.closest?.(this.#ignoreSelector)
        : node.matches?.(this.#ignoreSelector);
      if (isIgnored) return;
      if (this.#observedNodes.has(node)) {
        // 超大容器不适合作为单一翻译单元（会超过接口长度限制），继续下钻到子单元
        const isOversized = (node.textContent || "").trim().length > maxLength;
        if (!isOversized) {
          units.push(node);
        }
      }
      // 即使节点自身被观察也继续下钻：混合容器（自身含直接文本 + 块级子节点）
      // 需要同时翻译其直接文本与子单元，避免只翻译第一行/跳过块级子节点。
      for (const child of node.children || []) {
        visit(child, false);
      }
    };
    visit(container, true);
    return units;
  }

  // 还原整块区域：移除区域内所有译文并清除相关处理状态
  #restoreHoverBlock(container) {
    this.#cleanupAllTranslations(container);
    const clearState = (node) => {
      if (!Translator.isElementOrFragment(node)) return;
      if (this.#observedNodes.has(node) || node === container) {
        this.#processedNodes.delete(node);
      }
      for (const child of node.children || []) {
        clearState(child);
      }
    };
    clearState(container);
  }

  // 切换节点翻译状态
  // forceInline 为 true 时（如按住鼠标左键触发），忽略气泡展示模式，
  // 始终使用双语行内翻译并保留译文，方便下一次按住还原。
  // generation 为按住操作代次：语言检测期间还原/重触发后，过期任务据此废弃。
  #toggleTargetNode(
    targetNode,
    forceInline = false,
    blockDisplay = false,
    generation
  ) {
    if (!forceInline && this.#isMouseHoverBubbleMode()) {
      this.#translateHoverBubbleNode(targetNode);
      return;
    }

    if (this.#processedNodes.has(targetNode)) {
      const hasPendingTranslation = Array.from(
        this.#findTranslationWrappers(targetNode)
      ).some((wrapper) => !this.#translationNodes.has(wrapper));
      if (hasPendingTranslation) {
        // 按住路径需要“再次按住还原”：移除仍处于 loading 的 wrapper，
        // 后续请求会通过 wrapper.isConnected 防护丢弃过期结果。
        if (!forceInline) return;
        this.#cleanupDirectTranslations(targetNode);
        return;
      }
      this.#cleanupDirectTranslations(targetNode);
    } else {
      this.#processNode(targetNode, { blockDisplay, generation });
    }
  }

  // 判断当前鼠标悬停翻译是否处于气泡展示模式
  #isMouseHoverBubbleMode() {
    return (
      this.#setting.mouseHoverSetting?.displayMode ===
      OPT_MOUSE_HOVER_DISPLAY_BUBBLE
    );
  }

  // 原文气泡只依赖气泡模式和“隐藏原文”，不要求额外开启行内悬浮恢复选项。
  #shouldUseOriginalHoverBubble() {
    return (
      this.#mouseHoverEnabled &&
      this.#isMouseHoverBubbleMode() &&
      this.#rule.transOnly === "true"
    );
  }

  // 确认译文容器仍保存着本次翻译对应的隐藏原文节点。
  #canShowOriginalInHoverBubble(wrapper) {
    if (
      !this.#shouldUseOriginalHoverBubble() ||
      !wrapper?.classList?.contains(Translator.KISS_CLASS.warpper)
    ) {
      return false;
    }

    const data = this.#translationNodes.get(wrapper);
    return Boolean(data?.isHide && data.nodes?.length);
  }

  // 原文节点已被移入 wrapper 内的 template 备份，读取 textContent 不会改变页面布局。
  #getOriginalText(wrapper) {
    const { nodes = [] } = this.#translationNodes.get(wrapper) || {};
    return nodes
      .map((node) => node.textContent || "")
      .join("")
      .trim();
  }

  // 取消直接悬停模式下尚未到期的原文气泡任务。
  #clearHoverOriginalTimer() {
    if (this.#hoverOriginalTimer) {
      clearTimeout(this.#hoverOriginalTimer);
      this.#hoverOriginalTimer = null;
    }
    this.#hoverOriginalTimerTarget = null;
  }

  // 快捷键为空时，沿用“悬浮显示原文延迟”的时长后再展示气泡。
  #scheduleOriginalHoverBubble(wrapper) {
    if (
      this.#hoverBubbleTarget === wrapper &&
      this.#hoverBubbleNode?.isConnected
    ) {
      return;
    }
    if (this.#hoverOriginalTimerTarget === wrapper) return;

    this.#hideHoverBubble();
    const parsedDelay = parseFloat(this.#rule.transOnlyRevertDelay);
    const delay = Number.isFinite(parsedDelay) ? Math.max(0, parsedDelay) : 0.5;
    this.#hoverOriginalTimerTarget = wrapper;
    this.#hoverOriginalTimer = setTimeout(() => {
      this.#hoverOriginalTimer = null;
      this.#hoverOriginalTimerTarget = null;
      if (
        // 定时器到期时再次校验，避免鼠标移动或规则切换后显示过期内容。
        this.#hoveredNode === wrapper &&
        this.#canShowOriginalInHoverBubble(wrapper)
      ) {
        this.#showOriginalHoverBubble(wrapper);
      }
    }, delay * 1000);
  }

  // 直接复用气泡容器显示缓存原文，不发起反向翻译请求。
  #showOriginalHoverBubble(wrapper) {
    this.#clearHoverOriginalTimer();
    const text = this.#getOriginalText(wrapper);
    if (!text) {
      this.#hideHoverBubble();
      return;
    }

    this.#hideHoverBubble();
    this.#hoverBubbleTarget = wrapper;
    this.#showHoverBubble(text);
  }

  // 获取元素的 shadowRoot（支持 closed 模式）
  #getShadowRoot(element) {
    // Firefox 原生支持
    if (element.openOrClosedShadowRoot) {
      return element.openOrClosedShadowRoot;
    }
    // Chrome 扩展 API
    if (
      typeof globalThis !== "undefined" &&
      globalThis.chrome?.dom?.openOrClosedShadowRoot &&
      element instanceof HTMLElement
    ) {
      return globalThis.chrome.dom.openOrClosedShadowRoot(element);
    }
    // 标准 API（只能获取 open 模式）
    return element.shadowRoot;
  }

  #isKissIgnoredNode(node) {
    return (
      node?.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(Translator.KISS_IGNORE_SELECTOR) ||
        node.closest?.(Translator.KISS_IGNORE_SELECTOR))
    );
  }

  // 找页面所有 ShadowRoot
  #findAllShadowRoots(root = document.body, results = new Set()) {
    // const start = performance.now();
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (this.#isKissIgnoredNode(node)) {
          continue;
        }

        const shadowRoot = this.#getShadowRoot(node);
        if (shadowRoot) {
          results.add(shadowRoot);
          this.#findAllShadowRoots(shadowRoot, results);
        }
      }
    } catch (err) {
      kissLog("无法访问某个 shadowRoot", err);
    }
    // const end = performance.now();
    // const duration = end - start;
    // console.log(`findAllShadowRoots 耗时：${duration} 毫秒`);
    return results;
  }

  // 向上查找发生变化的块级元素
  #findChangeContainer(startNode) {
    if (
      !Translator.isElementOrFragment(startNode) ||
      startNode.closest?.(this.#ignoreSelector)
    ) {
      return null;
    }

    let current = startNode;
    while (current && current !== document.body) {
      if (current.classList?.contains(Translator.KISS_CLASS.original)) {
        current = current.parentElement;
        continue;
      }
      if (this.#isBlockNode(current) || this.#observedNodes.has(current)) {
        // 确保找到的容器在我们监控的根节点内
        for (const root of this.#rootNodes) {
          if (root.contains(current)) {
            return current;
          }
        }
      }
      current = current.parentElement;
    }

    return null;
  }

  // “脏容器”队列
  #queueForRescan(target) {
    this.#rescanQueue.add(target);
    if (!this.#isQueueProcessing) {
      this.#isQueueProcessing = true;
      scheduleIdle(() => {
        this.#rescanQueue.forEach((t) => this.#rescanContainer(t));
        this.#rescanQueue.clear();
        this.#isQueueProcessing = false;
      }, 100);
    }
  }

  // 处理“脏容器”
  #rescanContainer(changedNode) {
    // DOM 发生变化，按住翻译的区域单元缓存不再可靠，全部失效
    this.#holdUnitsCache = new WeakMap();

    const container = this.#findChangeContainer(changedNode);
    if (!container) return;

    this.#processedNodes.delete(container); // 删除处理状态，允许重新翻译
    this.#cleanupAllTranslations(container);
    this.#scanNode(container);
  }

  // 重新观察
  #reIO(node) {
    this.#io.unobserve(node);
    this.#io.observe(node);
  }

  // 重新观察可视范围内全部节点
  #reIOViewNodes() {
    this.#viewNodes.forEach((n) => this.#reIO(n));
  }

  // 监控shadowroot
  #startObserveShadowRoot(shadowRoot) {
    try {
      if (
        shadowRoot.host.matches(`#${APP_CONSTS.fabID}, #${APP_CONSTS.boxID}`)
      ) {
        return;
      }
      this.#startObserveRoot(shadowRoot);
      this.#injectSheet(shadowRoot);
    } catch (err) {
      kissLog("startObserveShadowRoot", err);
    }
  }

  // 监控根节点
  #startObserveRoot(root) {
    if (this.#rootNodes.has(root)) return;
    this.#rootNodes.add(root);
    this.#mo.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });
    this.#scanNode(root);
  }

  // 开始/重新监控节点
  #startObserveNode(node) {
    // todo: DocumentFragment 无法被 this.#io.observe
    if (!Translator.isElement(node)) return;
    if (this.#tryAdoptExistingTranslationHost(node)) {
      if (
        this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_BEFORETRANS ||
        this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS
      ) {
        this.#favoriteHighlightScopes.add(node);
      }
      if (!this.#observedNodes.has(node)) {
        this.#observedNodes.add(node);
        this.#io.observe(node);
      }
      return;
    }

    if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_BEFORETRANS) {
      this.#favoriteHighlightScopes.add(node);
      this.#highlightWordsDeeply(node);
    }

    if (!this.#observedNodes.has(node) && this.#enabled && this.#transAllnow) {
      this.#observedNodes.add(node);
      this.#processNode(node);
      return;
    }

    // 未监控
    if (!this.#observedNodes.has(node)) {
      this.#observedNodes.add(node);
      this.#io.observe(node);
      return;
    }

    // 已监控，但未处理状态，且在可视范围
    if (!this.#processedNodes.has(node) && this.#viewNodes.has(node)) {
      this.#reIO(node);
    }
  }

  // 非自动识别文本模式下，快速查询目标节点
  #queryNode(rootNode) {
    // root 也可能是目标节点
    if (rootNode.matches?.(this.#rule.selector)) {
      this.#startObserveNode(rootNode);
    }

    rootNode.querySelectorAll(this.#rule.selector).forEach((node) => {
      if (!node.closest?.(this.#ignoreSelector)) {
        this.#startObserveNode(node);
      }
    });
  }

  // 寻找需要被监控的文本节点
  #scanNode(rootNode) {
    if (
      !Translator.isElementOrFragment(rootNode) ||
      // rootNode.matches?.(this.#rule.keepSelector) ||
      rootNode.matches?.(this.#ignoreSelector)
    ) {
      return;
    }

    if (this.#rule.autoScan === "false") {
      this.#queryNode(rootNode);
      return;
    }

    const hasText = Translator.hasTextNode(rootNode);

    // 如果当前节点没有直接文本，但只有一个子节点，继续向下钻取，避免在过高层级包裹
    if (!hasText && rootNode.children.length === 1) {
      const child = rootNode.children[0];
      if (!child.classList?.contains(Translator.KISS_CLASS.warpper)) {
        this.#scanNode(child);
        return;
      }
    }

    const hasBlock = this.#hasBlockNode(rootNode);

    if (hasText || !hasBlock) {
      this.#startObserveNode(rootNode);
    }

    if (hasBlock) {
      for (const child of rootNode.children) {
        const isBlock = this.#isBlockNode(child);
        if (!hasText || isBlock) {
          this.#scanNode(child);
        }
      }
    }
  }

  // 处理一个待翻译的节点
  async #processNode(node, options = {}) {
    if (
      this.#processedNodes.has(node) ||
      !Translator.isElementOrFragment(node)
    ) {
      return;
    }

    this.#processedNodes.set(node, { ...this.#rule });
    // 按住操作代次与 runId：语言检测等异步环节完成后据此判断任务是否已过期
    const generation = options.generation;
    const runId = this.#runId;
    if (generation !== undefined) {
      this.#holdProcessGenerations.set(node, generation);
    } else {
      this.#holdProcessGenerations.delete(node);
    }

    // 提前检测文本
    if (this.#isInvalidText(node.textContent)) {
      return;
    }

    // 提前进行语言检测
    let deLang = "";
    const {
      fromLang = "auto",
      toLang,
      splitParagraph = OPT_SPLIT_PARAGRAPH_DISABLE,
      splitLength = 100,
    } = this.#rule;
    const {
      langDetector,
      skipLangs = [],
      translateVariants = true,
    } = this.#setting;
    if (fromLang === "auto") {
      // revert 529
      deLang = await tryDetectLang(node.textContent, langDetector);
      // 语言检测期间可能发生了还原、重新触发或停止/重扫：
      // 任务已失效，不再创建译文容器或发起翻译请求。
      // 若当前节点仍由本代次任务标记，则回滚处理状态，避免单段/原子目标
      // 在还原后永久停留在 processed 状态，导致后续按住无法再次翻译。
      if (
        generation !== undefined &&
        (generation !== this.#holdGeneration || runId !== this.#runId)
      ) {
        if (this.#holdProcessGenerations.get(node) === generation) {
          this.#processedNodes.delete(node);
          this.#holdProcessGenerations.delete(node);
        }
        return;
      }
      if (generation !== undefined) {
        this.#holdProcessGenerations.delete(node);
      }
      if (
        deLang &&
        (isSameTranslationLanguage(deLang, toLang, translateVariants) ||
          skipLangs.includes(deLang))
      ) {
        // 保留处理状态，不做删除
        // this.#processedNodes.delete(node);
        return;
      }
    }

    // 切分长段落
    if (splitParagraph !== OPT_SPLIT_PARAGRAPH_DISABLE) {
      this.#splitTextNodesBySentence(node, splitParagraph, splitLength);
    }

    let nodeGroup = [];
    [...node.childNodes].forEach((child) => {
      const shouldBreak = this.#shouldBreak(child);
      const shouldGroup =
        child.nodeType === Node.ELEMENT_NODE ||
        child.nodeType === Node.TEXT_NODE;
      if (!shouldBreak && shouldGroup) {
        nodeGroup.push(child);
      } else if (shouldBreak && nodeGroup.length) {
        this.#translateNodeGroup(nodeGroup, node, deLang, options);
        nodeGroup = [];
      }
    });

    if (nodeGroup.length) {
      this.#translateNodeGroup(nodeGroup, node, deLang, options);
    }
  }

  // 高亮词汇
  #highlightTextNode(textNode, wordRegex) {
    if (
      textNode.parentElement?.closest(
        `.${Translator.KISS_CLASS.highlight}, ${Translator.KISS_IGNORE_SELECTOR}`
      )
    ) {
      return;
    }

    if (!wordRegex.test(textNode.textContent)) {
      return;
    }

    wordRegex.lastIndex = 0;
    const fragments = textNode.textContent.split(wordRegex);
    const newNodes = [];

    fragments.forEach((fragment, i) => {
      if (!fragment) return;

      if (i % 2 === 1) {
        // 奇数索引是匹配到的关键词
        const bTag = document.createElement("b");
        bTag.className = Translator.KISS_CLASS.highlight;
        bTag.dataset.kissFavoriteWord = this.#normalizeFavoriteWord(fragment);
        bTag.style.cssText = this.#rule.highlightStyle || "";
        bTag.textContent = fragment;
        this.#skipMoNodes.add(bTag);
        newNodes.push(bTag);
      } else {
        // 偶数索引是普通文本
        const newTextNode = document.createTextNode(fragment);
        this.#skipMoNodes.add(newTextNode);
        newNodes.push(newTextNode);
      }
    });

    if (newNodes.length > 0) {
      textNode.replaceWith(...newNodes);
    }
  }

  // 高亮词汇
  #highlightWordsDeeply(parentNode, words = this.#favWords) {
    if (!parentNode || words.length === 0) {
      return;
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedWords = words.map(escapeRegex);
    const wordRegex = new RegExp(`\\b(${escapedWords.join("|")})\\b`, "gi");

    if (parentNode.nodeType === Node.ELEMENT_NODE) {
      const walker = document.createTreeWalker(
        parentNode,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            node.parentElement?.closest(
              `.${Translator.KISS_CLASS.highlight}, ${Translator.KISS_IGNORE_SELECTOR}`
            )
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT,
        },
        false
      );

      const nodesToProcess = [];
      let node;
      while ((node = walker.nextNode())) {
        nodesToProcess.push(node);
      }

      nodesToProcess.forEach((textNode) => {
        this.#highlightTextNode(textNode, wordRegex);
      });
    } else if (parentNode.nodeType === Node.TEXT_NODE) {
      this.#highlightTextNode(parentNode, wordRegex);
    }
  }

  #normalizeFavoriteWord(word) {
    return typeof word === "string" ? word.trim().toLowerCase() : "";
  }

  #dedupeFavoriteWords(words) {
    const seen = new Set();
    return (Array.isArray(words) ? words : []).filter((word) => {
      const normalized = this.#normalizeFavoriteWord(word);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  #handleFavoriteWordChange(event) {
    const { word, isFavorite } = event.detail || {};
    const normalized = this.#normalizeFavoriteWord(word);
    if (!normalized || typeof isFavorite !== "boolean") return;

    if (isFavorite) {
      if (
        !this.#favWords.some(
          (item) => this.#normalizeFavoriteWord(item) === normalized
        )
      ) {
        this.#favWords = [...this.#favWords, word.trim()];
      }
    } else {
      this.#favWords = this.#favWords.filter(
        (item) => this.#normalizeFavoriteWord(item) !== normalized
      );
    }

    if (
      this.#rule.highlightWords !== OPT_HIGHLIGHT_WORDS_BEFORETRANS &&
      this.#rule.highlightWords !== OPT_HIGHLIGHT_WORDS_AFTERTRANS
    ) {
      return;
    }

    if (isFavorite) {
      this.#favoriteHighlightScopes.forEach((scope) => {
        this.#highlightWordsDeeply(scope, [word.trim()]);
      });
    } else {
      this.#removeFavoriteWordHighlights(normalized);
    }
  }

  #removeFavoriteWordHighlights(normalizedWord) {
    const highlights = new Set();
    this.#favoriteHighlightScopes.forEach((scope) => {
      if (
        scope.matches?.(`.${Translator.KISS_CLASS.highlight}`) &&
        scope.dataset.kissFavoriteWord === normalizedWord
      ) {
        highlights.add(scope);
      }
      scope
        .querySelectorAll?.(`.${Translator.KISS_CLASS.highlight}`)
        .forEach((node) => {
          if (node.dataset.kissFavoriteWord === normalizedWord) {
            highlights.add(node);
          }
        });
    });

    highlights.forEach((highlight) => {
      const textNode = document.createTextNode(highlight.textContent || "");
      this.#skipMoNodes.add(textNode);
      highlight.replaceWith(textNode);
      this.#mergeFavoriteHighlightText(textNode);
    });
  }

  #mergeFavoriteHighlightText(textNode) {
    let mergedNode = textNode;
    const previous = mergedNode.previousSibling;
    if (previous?.nodeType === Node.TEXT_NODE) {
      this.#skipMoNodes.add(previous);
      previous.nodeValue += mergedNode.nodeValue;
      mergedNode.remove();
      mergedNode = previous;
    }

    const next = mergedNode.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE) {
      this.#skipMoNodes.add(mergedNode);
      mergedNode.nodeValue += next.nodeValue;
      next.remove();
    }
  }

  #isFavoriteHighlightInScope(highlight) {
    for (const scope of this.#favoriteHighlightScopes) {
      if (scope === highlight || scope.contains?.(highlight)) return true;
    }
    return false;
  }

  // 切分文本段落
  #splitTextNodesBySentence(parentNode, splitParagraph, splitLength) {
    const sentenceEndRegexForSplit = /[。！？]+|[.?!]+(?=\s+|$)/g;

    [...parentNode.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE || node.textContent.trim() === "") {
        return;
      }

      const text = node.textContent;
      const parts = [];
      let lastIndex = 0;
      let match;

      while ((match = sentenceEndRegexForSplit.exec(text)) !== null) {
        let realEndIndex = match.index + match[0].length;
        while (realEndIndex < text.length && /\s/.test(text[realEndIndex])) {
          realEndIndex++;
        }
        parts.push(text.substring(lastIndex, realEndIndex));
        lastIndex = realEndIndex;
        sentenceEndRegexForSplit.lastIndex = realEndIndex;
      }
      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }

      const validParts = parts.filter((part) => part.trim().length > 0);
      if (validParts.length <= 1) {
        return;
      }

      const newNodes = validParts.map((part) => {
        const newNode = document.createTextNode(part);
        this.#skipMoNodes.add(newNode);
        return newNode;
      });

      node.replaceWith(...newNodes);
    });

    const sentenceEndRegexForTest = /(?:[。！？?!]+|(?<!\d)\.)\s*$/;
    let textLength = 0;

    [...parentNode.childNodes].forEach((node) => {
      textLength += node.textContent.length;

      const isSentenceEnd = sentenceEndRegexForTest.test(node.textContent);
      if (
        !isSentenceEnd ||
        node.nextSibling?.nodeName?.toUpperCase() === "BR"
      ) {
        return;
      }

      if (
        splitParagraph === OPT_SPLIT_PARAGRAPH_PUNCTUATION ||
        (splitParagraph === OPT_SPLIT_PARAGRAPH_TEXTLENGTH &&
          textLength >= splitLength)
      ) {
        textLength = 0;

        const br = document.createElement("br");
        br.className = Translator.KISS_CLASS.br;
        this.#skipMoNodes.add(br);

        node.after(br);
      }
    });
  }

  // 清除高亮
  #removeHighlights(parentNode) {
    if (!parentNode) return;

    const highlightedElements = parentNode.querySelectorAll(
      `.${Translator.KISS_CLASS.highlight}`
    );

    highlightedElements.forEach((element) => {
      const textNode = document.createTextNode(element.textContent);
      element.replaceWith(textNode);
    });

    parentNode.normalize();
  }

  // 移除br
  #removeBrTags(parentNode) {
    if (!parentNode) return;

    parentNode
      .querySelectorAll(`.${Translator.KISS_CLASS.br}`)
      .forEach((br) => br.remove());

    parentNode.normalize();
  }

  // 判断是否需要换行
  #shouldBreak(node) {
    if (!Translator.isElementOrFragment(node)) return false;

    let matchesKeepSelector = false;
    try {
      matchesKeepSelector = node.matches(this.#rule.keepSelector);
    } catch (err) {
      kissLog(
        "keepSelector match error in shouldBreak",
        this.#rule.keepSelector,
        err
      );
    }
    if (matchesKeepSelector) return false;

    if (
      Translator.TAGS.BREAK_LINE.has(node.nodeName?.toUpperCase()) ||
      node.matches?.(this.#ignoreSelector) ||
      node.nodeName?.toLowerCase() === this.#translationTagName
    ) {
      return true;
    }

    if (this.#rule.autoScan === "true" && this.#isBlockNode(node)) {
      return true;
    }

    if (
      this.#rule.autoScan === "false" &&
      (node.matches(this.#rule.selector) ||
        node.querySelector(this.#rule.selector))
    ) {
      return true;
    }

    return false;
  }

  // 过滤文本
  #isInvalidText(text) {
    if (typeof text !== "string") {
      return true;
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      return true;
    }

    // 文本长度
    if (
      trimmedText.length < this.#setting.minLength ||
      trimmedText.length > this.#setting.maxLength
    ) {
      return true;
    }

    // 单个非字母数字字符。
    if (trimmedText.length === 1 && !trimmedText.match(/[a-zA-Z]/)) {
      return true;
    }

    // 只是一个数字
    if (!isNaN(parseFloat(trimmedText)) && isFinite(trimmedText)) {
      return true;
    }

    // 正则匹配
    if (this.#combinedSkipsRegex.test(trimmedText)) {
      return true;
    }

    return false;
  }

  // 将不同来源的异常统一转成可展示、可复制的纯文本错误信息
  #formatTranslateError(error) {
    if (error instanceof Error) {
      const tag = error.name ? `[${error.name}]` : "[UnknownError]";
      const msg = error.message ? ` ${error.message}` : "";
      return `${tag}${msg}\n${error.stack || ""}`;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      const jsonText = JSON.stringify(error);
      return jsonText || String(error);
    } catch (_) {
      return String(error);
    }
  }

  // 将文本写入剪贴板；当 Clipboard API 不可用时，回退到临时文本框复制
  async #copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText =
      "position: fixed; left: -9999px; top: 0; opacity: 0;";

    document.body.appendChild(textarea);
    try {
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  // 创建带错误信息浮层的重试按钮，浮层内支持直接复制错误内容
  #createRetryErrorNode(errorText, onRetry) {
    const i18n = newI18n(this.#setting.uiLang || "zh");
    const copyText = i18n("copy") || "Copy";
    const isDarkMode =
      this.#setting.darkMode === "dark" ||
      (this.#setting.darkMode === "auto" &&
        window.matchMedia?.("(prefers-color-scheme: dark)")?.matches);
    const panelBg = isDarkMode ? "#1f1f23" : "#ffffff";
    const panelText = isDarkMode
      ? "rgba(255, 255, 255, 0.82)"
      : "rgba(0, 0, 0, 0.78)";
    const panelBorder = isDarkMode
      ? "rgba(32, 156, 238, 0.45)"
      : "rgba(32, 156, 238, 0.28)";
    const panelShadow = isDarkMode
      ? "0 8px 24px rgba(0, 0, 0, 0.42)"
      : "0 8px 24px rgba(0, 0, 0, 0.16)";
    const errorColor = isDarkMode ? "#ff8a80" : "#d32f2f";
    const buttonBg = isDarkMode
      ? "rgba(32, 156, 238, 0.14)"
      : "rgba(32, 156, 238, 0.08)";
    const buttonHoverBg = isDarkMode
      ? "rgba(32, 156, 238, 0.24)"
      : "rgba(32, 156, 238, 0.16)";

    const container = document.createElement("span");
    container.style.cssText =
      "position: relative; display: inline-flex; align-items: center; vertical-align: middle;";

    const retryIcon = createRetrySVG();
    retryIcon.classList.add(Translator.KISS_CLASS.retry);
    retryIcon.setAttribute("role", "button");
    retryIcon.setAttribute("tabindex", "0");

    const panel = document.createElement("span");
    panel.className = "notranslate";
    panel.setAttribute("translate", "no");
    panel.style.cssText = [
      "position: fixed",
      "left: 0",
      "top: 0",
      "z-index: 2147483647",
      "display: none",
      "box-sizing: border-box",
      "width: max-content",
      "max-width: min(420px, calc(100vw - 16px))",
      "max-height: 240px",
      "overflow: auto",
      "padding: 10px 10px 8px 12px",
      `border: 1px solid ${panelBorder}`,
      "border-left: 3px solid #209CEE",
      "border-radius: 6px",
      `background: ${panelBg}`,
      `color: ${panelText}`,
      `box-shadow: ${panelShadow}`,
      "font-size: 12px",
      "line-height: 1.5",
      "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "white-space: pre-wrap",
      "overflow-wrap: anywhere",
      "user-select: text",
      "visibility: hidden",
    ].join("; ");

    const message = document.createElement("span");
    message.textContent = errorText;
    message.style.cssText = `color: ${errorColor};`;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = copyText;
    copyButton.style.cssText = [
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "width: fit-content",
      "margin-top: 8px",
      "padding: 3px 8px",
      "border: 1px solid rgba(32, 156, 238, 0.35)",
      "border-radius: 4px",
      `background: ${buttonBg}`,
      "color: #209CEE",
      "font-size: 12px",
      "line-height: 1.4",
      "font-weight: 500",
      "cursor: pointer",
      "transition: background 0.2s ease, border-color 0.2s ease",
    ].join("; ");
    copyButton.addEventListener("mouseenter", () => {
      copyButton.style.background = buttonHoverBg;
      copyButton.style.borderColor = "rgba(32, 156, 238, 0.55)";
    });
    copyButton.addEventListener("mouseleave", () => {
      copyButton.style.background = buttonBg;
      copyButton.style.borderColor = "rgba(32, 156, 238, 0.35)";
    });
    copyButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      e.preventDefault();

      try {
        await this.#copyText(errorText);
        copyButton.textContent = "OK";
        setTimeout(() => {
          copyButton.textContent = copyText;
        }, 800);
      } catch (copyErr) {
        kissLog("copy translate error: ", this.#formatTranslateError(copyErr));
      }
    });

    let hideTimer = null;

    const clearHideTimer = () => {
      if (!hideTimer) return;
      clearTimeout(hideTimer);
      hideTimer = null;
    };

    // 浮层挂到 body，避免被正文节点的 stacking context 或 overflow 裁剪。
    const updatePanelPosition = () => {
      if (!container.isConnected) {
        hidePanel();
        return;
      }

      const anchorRect = container.getBoundingClientRect();
      const viewportGap = 8;
      const panelGap = 6;
      const panelRect = panel.getBoundingClientRect();
      const panelWidth = panelRect.width;
      const panelHeight = panelRect.height;
      const maxLeft = window.innerWidth - panelWidth - viewportGap;
      const maxTop = window.innerHeight - panelHeight - viewportGap;

      let left = anchorRect.left;
      let top = anchorRect.bottom + panelGap;

      if (top > maxTop) {
        top = anchorRect.top - panelHeight - panelGap;
      }

      panel.style.left = `${Math.max(viewportGap, Math.min(left, maxLeft))}px`;
      panel.style.top = `${Math.max(viewportGap, Math.min(top, maxTop))}px`;
      panel.style.visibility = "visible";
    };

    const showPanel = () => {
      clearHideTimer();
      if (!panel.isConnected) {
        document.body.appendChild(panel);
      }
      panel.style.display = "block";
      panel.style.visibility = "hidden";
      updatePanelPosition();
      window.addEventListener("scroll", updatePanelPosition, true);
      window.addEventListener("resize", updatePanelPosition);
    };

    const hidePanel = () => {
      clearHideTimer();
      window.removeEventListener("scroll", updatePanelPosition, true);
      window.removeEventListener("resize", updatePanelPosition);
      panel.style.display = "none";
      panel.style.visibility = "hidden";
      panel.remove();
    };

    const hidePanelSoon = () => {
      clearHideTimer();
      hideTimer = setTimeout(() => {
        const activeElement = document.activeElement;
        if (
          container.matches(":hover") ||
          panel.matches(":hover") ||
          container.contains(activeElement) ||
          panel.contains(activeElement)
        ) {
          return;
        }

        hidePanel();
      }, 80);
    };

    container.addEventListener("mouseenter", showPanel);
    container.addEventListener("mouseleave", hidePanelSoon);
    container.addEventListener("focusin", showPanel);
    container.addEventListener("focusout", (e) => {
      if (panel.contains(e.relatedTarget)) return;
      if (container.contains(e.relatedTarget)) return;
      hidePanelSoon();
    });
    panel.addEventListener("mouseenter", showPanel);
    panel.addEventListener("mouseleave", hidePanelSoon);
    panel.addEventListener("focusin", showPanel);
    panel.addEventListener("focusout", (e) => {
      if (container.contains(e.relatedTarget)) return;
      if (panel.contains(e.relatedTarget)) return;
      hidePanelSoon();
    });
    retryIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      hidePanel();
      onRetry();
    });
    retryIcon.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.stopPropagation();
      e.preventDefault();
      hidePanel();
      onRetry();
    });

    panel.appendChild(message);
    panel.appendChild(copyButton);
    container.appendChild(retryIcon);

    return container;
  }

  // 翻译内联节点
  // options.blockDisplay 为 true 时（按住鼠标左键触发），译文以独立块的形式
  // 显示在原文下方，并留出上下间距（margin: 8px 0），便于对照阅读。
  async #translateNodeGroup(nodes, hostNode, deLang, options = {}) {
    const {
      transTag,
      textStyle,
      transEndHook,
      transOnly,
      termsStyle,
      textExtStyle,
      selectStyle,
      parentStyle,
      grandStyle,
      // detectRemote,
      toLang,
      // skipLangs = [],
      highlightWords,
      transOrder = "original-first",
      wrapOriginal,
      originalTextStyle,
    } = this.#rule;
    const {
      newlineLength,
      // langDetector，
    } = this.#setting;
    const parentNode = hostNode.parentElement;
    const hideOrigin = transOnly === "true";
    // 在 try 外声明，供 catch 分支判断本译文容器是否已被还原移除
    let wrapper = null;

    try {
      const [processedString, placeholderMap] = this.#serializeForTranslation(
        nodes,
        termsStyle
      );
      if (this.#isInvalidText(processedString)) return;

      wrapper = document.createElement(this.#translationTagName);
      wrapper.className = `${Translator.KISS_CLASS.warpper} notranslate`;

      const inner = document.createElement(transTag);
      inner.lang = toLang;
      inner.className = `${Translator.KISS_CLASS.inner} ${this.#textClass[textStyle] || ""}`;
      if (textExtStyle?.trim()) {
        inner.style.cssText = textExtStyle; // 附加内联样式
      }
      inner.appendChild(createLoadingSVG());

      // 将 <br> 作为 wrapper 的子节点，以便 toggleTranslationOnly 统一管理
      if (options.blockDisplay) {
        wrapper.style.display = "block";
        wrapper.style.margin = "8px 0";
        wrapper.style.boxSizing = "border-box";
        wrapper.appendChild(inner);
      } else if (processedString.length > newlineLength) {
        const br = document.createElement("br");
        br.hidden = hideOrigin;
        if (transOrder === "translation-first") {
          // 译文在上：inner → br
          wrapper.appendChild(inner);
          wrapper.appendChild(br);
        } else {
          // 原文在上：br → inner
          wrapper.appendChild(br);
          wrapper.appendChild(inner);
        }
      } else {
        const space = document.createElement("span");
        space.textContent = " ";
        space.className = Translator.KISS_CLASS.space;
        space.hidden = hideOrigin;
        if (transOrder === "translation-first") {
          wrapper.appendChild(inner);
          wrapper.appendChild(space);
        } else {
          wrapper.appendChild(space);
          wrapper.appendChild(inner);
        }
      }

      this.#withViewportAnchor(() => {
        // 根据 transOrder 选项决定译文显示位置
        if (transOrder === "translation-first") {
          nodes[0].before(wrapper); // 译文在上
        } else {
          nodes[nodes.length - 1].after(wrapper); // 原文在上（默认）
        }
      });

      const currentRunId = this.#runId;

      // 1. 确定流式渲染模式状态
      const streamRenderMode = this.#apiSetting.streamRenderMode || "disabled";
      const isStreamRender =
        streamRenderMode !== "disabled" &&
        this.#apiSetting.useStream &&
        API_SPE_TYPES.stream.has(this.#apiSetting.apiType);

      // REVIEW: 极佳的性能优化设计 (RequestAnimationFrame 缓冲刷新)！
      // 大模型流式输出（onStreamChunk）返回速率极快（每秒可达几十次）。
      // 若每次收到数据都直接操作 DOM 修改 innerText 刷新页面，极易导致浏览器主线程阻塞和严重的 Layout Thrashing (布局抖动)。
      // 此处引入了 RAF (requestAnimationFrame) 刷新缓冲区，限制每秒最多渲染 60 次（FPS 锁帧），
      // 并只在空闲时间执行 flushPendingText() 修改 textNode 节点，大幅度节约了 DOM 回流重绘的开销，用户体验丝滑。
      let rafId = null;
      let pendingText = "";
      let hasFirstChunk = false;
      const innerRef = inner;

      // 异步刷新临时文本缓冲区到 DOM 中
      const flushPendingText = () => {
        if (!hasFirstChunk) {
          innerRef.textContent = "";
          innerRef.appendChild(document.createTextNode(pendingText));
          hasFirstChunk = true;
        } else {
          const textNode = innerRef.firstChild;
          if (textNode) {
            textNode.nodeValue = pendingText; // 直接修改 TextNode 的 nodeValue 避免触发表单级 Reflow
          }
        }
        rafId = null;
      };

      // 流式 Chunk 回调函数
      const onStreamChunk = isStreamRender
        ? (chunk) => {
            // 防过期控制，若本轮翻译请求已因用户点击关闭或被新请求覆盖，则立刻抛弃
            if (this.#runId !== currentRunId) return;
            // 容器已被还原移除时同样停止流式写入，避免向脱离文档的节点空转渲染
            if (!wrapper.isConnected) return;
            const { text, isComplete } = chunk;
            if (!text) return;

            if (isComplete) {
              pendingText = Array.isArray(text) ? text[0] : text;
              if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
              }
              flushPendingText();
            } else {
              pendingText = text;
              if (!rafId) {
                // 开启 RAF 排队渲染
                rafId = requestAnimationFrame(flushPendingText);
              }
            }
          }
        : null;

      // 2. 发起真实的翻译网络请求
      // 区域模式按住触发可能一次翻译几十个单元，先获取并发名额再发请求，
      // 把同时在途的请求数限制在 #holdRequestLimit 内，避免打满服务端限流配额。
      if (options.limitConcurrency) {
        const wait = this.#acquireHoldRequestSlot();
        if (wait) await wait;
        // 等待并发名额期间，容器可能已被第二次按住还原移除；
        // 重新检查后丢弃任务并释放名额，避免把已还原的文本外发给翻译服务
        if (!wrapper.isConnected) {
          this.#releaseHoldRequestSlot();
          return;
        }
      }
      let translatedText;
      let isSameLang;
      try {
        const result = await this.#translateFetch(
          processedString,
          deLang,
          onStreamChunk
        );
        translatedText = result.trText;
        isSameLang = result.isSame;
      } finally {
        if (options.limitConcurrency) {
          this.#releaseHoldRequestSlot();
        }
      }

      // 请求完成后，立刻注销多余的 RAF 定时监听器，防止内存泄漏
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (this.#runId !== currentRunId) {
        throw new Error("Request terminated");
      }

      // 还原/清理（如区域模式按住第二次）可能已把本译文容器从文档移除，
      // 此时丢弃过期结果：继续执行会把包裹/隐藏原文等 DOM 变更作用到已还原的
      // 原文上（仅译文模式下原文会被搬走消失），并把脱离文档的 wrapper 重新
      // 登记进 #translationNodes 造成状态泄漏。
      if (!wrapper.isConnected) return;

      // 如果翻译文本为空，或者识别出来的源语言与目标语言一致，则移除临时的翻译 Loading 容器
      if (!translatedText || isSameLang) {
        this.#withViewportAnchor(() => {
          wrapper.remove();
        });
        return;
      }

      // 3. 将翻译后文本里的 {{1}}、<tag1> 等占位符还原为对应的 DOM 节点和 HTML 结构
      const htmlString = this.#restoreFromTranslation(
        translatedText,
        placeholderMap
      );

      // REVIEW: 高安全标准的 Trusted Types 注入机制。
      // 在页面插入 innerHTML 很容易遭受 DOM-based XSS 跨站脚本攻击。
      // 特别是在 Chrome 扩展中强灌 innerHTML 会直接触发扩展程序的安全拦截。
      // 此处将 htmlString 传入 trustedTypesHelper.createHTML 转化为受信任的 TrustedHTML 实例，
      // 再安全地写入 inner.innerHTML，这完全符合现代高 CSP 标准站点的规范，非常专业。
      const trustedHTML = trustedTypesHelper.createHTML(htmlString);

      this.#withViewportAnchor(() => {
        inner.innerHTML = trustedHTML;
      });

      let originalWrapper = null;
      if (wrapOriginal === "true") {
        this.#withViewportAnchor(() => {
          originalWrapper = this.#wrapOriginalNodes(nodes, originalTextStyle);
        });
      }

      const translationData = {
        nodes,
        originalWrapper,
        isHide: hideOrigin,
      };
      this.#translationNodes.set(wrapper, translationData);
      if (hideOrigin) {
        this.#withViewportAnchor(() => {
          this.#removeOriginal(translationData, wrapper);
        });
      }

      // 附加样式
      this.#appendCssText(hostNode, selectStyle, "selectStyle");
      this.#appendCssText(parentNode, parentStyle, "parentStyle");
      this.#appendCssText(parentNode?.parentElement, grandStyle, "grandStyle");

      // 高亮词汇
      if (highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
        this.#favoriteHighlightScopes.add(hostNode);
        nodes.forEach((node) => this.#highlightWordsDeeply(node));
      }

      // 翻译完成钩子函数（在隔离沙盒内安全执行用户自定义的译后处理脚本）
      // REVIEW: 共享 Sval 实例导致 Hook 竞态条件 (Race Condition) 隐患。
      // 由于 interpreter 是全局单例，当页面中同时有多个并发的 translateNodeGroup 任务异步执行时，
      // 同步运行的 `interpreter.run('exports.transEndHook = ...')` 会直接覆盖上一个任务尚未执行完毕的 exports.transEndHook 引用。
      // 这可能导致后一个任务的 Hook 函数被错误地执行多次，或者前一个任务执行了不匹配的、新覆盖的 Hook 函数，出现非预期的运行时状态混乱。
      if (transEndHook?.trim()) {
        try {
          interpreter.run(`exports.transEndHook = ${transEndHook}`);
          interpreter.exports.transEndHook(
            {
              hostNode,
              parentNode,
              nodes,
              wrapperNode: wrapper,
              innerNode: inner,
            },
            {
              text: processedString,
              fromLang: deLang || this.#rule.fromLang,
              toLang,
            }
          );
        } catch (err) {
          kissLog("transEndHook", err);
        }
      }
    } catch (err) {
      // 容器已被还原移除时丢弃过期失败结果，避免 “Request terminated” 分支的
      // #cleanupDirectTranslations(hostNode) 误删宿主上随后产生的新译文，
      // 也避免在已脱离文档的容器里渲染重试按钮。
      if (wrapper && !wrapper.isConnected) return;

      const errorText = this.#formatTranslateError(err);
      kissLog("translate group error: ", errorText);
      if (err?.message === "Request terminated") {
        this.#cleanupDirectTranslations(hostNode);
        return;
      }

      // 失败重试按钮
      try {
        const lastWrapper = hostNode.querySelector(
          `:scope > .${Translator.KISS_CLASS.warpper}:last-of-type`
        );
        if (lastWrapper) {
          const inner = lastWrapper.querySelector(
            `.${Translator.KISS_CLASS.inner}`
          );
          if (inner) {
            inner.textContent = "";
            const retryNode = this.#createRetryErrorNode(errorText, () => {
              this.#withViewportAnchor(() => {
                lastWrapper.remove();
              });
              this.#processedNodes.delete(hostNode);
              this.#translateNodeGroup(nodes, hostNode, deLang, options);
            });
            inner.appendChild(retryNode);
          }
        }
      } catch (retryErr) {
        kissLog("retry icon error: ", retryErr.message);
        this.#cleanupDirectTranslations(hostNode);
      }
    }
  }

  // 获取悬停气泡的样式，如果用户未设置则使用默认样式
  #handleFavoriteMouseOver(event) {
    const eventTarget = event.composedPath?.()[0] || event.target;
    const highlight = eventTarget.closest?.(
      `.${Translator.KISS_CLASS.highlight}`
    );
    if (!highlight || !this.#isFavoriteHighlightInScope(highlight)) return;
    if (highlight.contains(event.relatedTarget)) return;

    this.#hoverPointer = { x: event.clientX, y: event.clientY };
    if (this.#favoriteHoverTarget === highlight) return;

    this.#hideHoverBubble();
    this.#favoriteHoverTarget = highlight;
    this.#favoriteHoverTimer = setTimeout(() => {
      this.#favoriteHoverTimer = null;
      this.#showFavoriteWordTooltip(highlight);
    }, 300);
  }

  #handleFavoriteMouseOut(event) {
    const eventTarget = event.composedPath?.()[0] || event.target;
    const highlight = eventTarget.closest?.(
      `.${Translator.KISS_CLASS.highlight}`
    );
    if (!highlight || !this.#isFavoriteHighlightInScope(highlight)) return;
    if (highlight.contains(event.relatedTarget)) return;
    if (this.#favoriteHoverTarget === highlight) {
      this.#hideHoverBubble();
    }
  }

  #clearFavoriteHoverTimer() {
    if (this.#favoriteHoverTimer) {
      clearTimeout(this.#favoriteHoverTimer);
      this.#favoriteHoverTimer = null;
    }
  }

  async #showFavoriteWordTooltip(highlight) {
    if (
      this.#favoriteHoverTarget !== highlight ||
      !highlight.isConnected ||
      !this.#isFavoriteHighlightInScope(highlight)
    ) {
      return;
    }

    const word = (highlight.textContent || "").trim();
    const i18n = newI18n(this.#setting.uiLang || "zh");
    const currentRunId = ++this.#hoverBubbleRunId;
    this.#hoverBubbleTarget = highlight;
    this.#showFavoriteBubble(
      i18n("favorite_word_lookup_loading") || "Looking up...",
      "loading"
    );

    if (!/^[a-zA-Z]+(?:['’][a-zA-Z]+)?$/.test(word)) {
      this.#showFavoriteBubble(
        i18n("favorite_word_lookup_unavailable") ||
          "Dictionary lookup is unavailable for this word.",
        "unavailable"
      );
      return;
    }

    const enDict = this.#setting.tranboxSetting?.enDict;
    if (!OPT_DICT_MAP.has(enDict)) {
      this.#showFavoriteBubble(
        i18n("favorite_word_lookup_unavailable") ||
          "Dictionary lookup is unavailable for this word.",
        "unavailable"
      );
      return;
    }

    try {
      const rawResult =
        enDict === OPT_DICT_BING
          ? await apiMicrosoftDict(word)
          : await apiYoudaoDict(word);
      if (
        this.#hoverBubbleRunId !== currentRunId ||
        this.#hoverBubbleTarget !== highlight
      ) {
        return;
      }

      const result = this.#normalizeFavoriteDictionaryResult(
        enDict,
        rawResult,
        word
      );
      if (result.definitions.length === 0) {
        this.#showFavoriteBubble(
          i18n("favorite_word_definition_not_found") || "No definition found.",
          "empty"
        );
        return;
      }

      this.#showFavoriteBubble(
        this.#createFavoriteDictionaryNode(result),
        "ready"
      );
    } catch (err) {
      if (
        this.#hoverBubbleRunId !== currentRunId ||
        this.#hoverBubbleTarget !== highlight
      ) {
        return;
      }
      kissLog("favorite word lookup failed", err);
      this.#showFavoriteBubble(
        i18n("favorite_word_lookup_failed") || "Failed to load definition.",
        "error"
      );
    }
  }

  #normalizeFavoriteDictionaryResult(enDict, data, fallbackWord) {
    if (enDict === OPT_DICT_BING) {
      return {
        word: data?.word || fallbackWord,
        phonetics: (data?.aus || [])
          .filter(({ phonetic }) => phonetic)
          .map(({ key, phonetic }) => `${key ? `${key} ` : ""}[${phonetic}]`),
        definitions: (data?.trs || [])
          .filter(({ def }) => def)
          .map(({ pos, def }) => ({ pos, text: def })),
      };
    }

    const wordData = data?.ec?.word;
    const phonetics = [];
    if (wordData?.ukphone) phonetics.push(`英 [${wordData.ukphone}]`);
    if (wordData?.usphone) phonetics.push(`美 [${wordData.usphone}]`);
    return {
      word: wordData?.["return-phrase"] || fallbackWord,
      phonetics,
      definitions: (wordData?.trs || [])
        .filter(({ tran }) => tran)
        .map(({ pos, tran }) => ({ pos, text: tran })),
    };
  }

  #createFavoriteDictionaryNode({ word, phonetics, definitions }) {
    const container = document.createElement("div");
    const title = document.createElement("div");
    title.style.cssText = "font-weight: 700; margin-bottom: 6px;";
    title.textContent = word;
    container.appendChild(title);

    if (phonetics.length > 0) {
      const phonetic = document.createElement("div");
      phonetic.style.cssText = "opacity: 0.75; margin-bottom: 6px;";
      phonetic.textContent = phonetics.join("  ");
      container.appendChild(phonetic);
    }

    definitions.forEach(({ pos, text }) => {
      const definition = document.createElement("div");
      definition.style.cssText = "margin: 3px 0;";
      definition.textContent = `${pos ? `[${pos}] ` : ""}${text}`;
      container.appendChild(definition);
    });

    return container;
  }

  #showFavoriteBubble(content, state) {
    this.#showHoverBubble(content, state);
    this.#hoverBubbleNode?.style.setProperty("max-height", "60vh", "important");
    this.#hoverBubbleNode?.style.setProperty("overflow-y", "auto", "important");
  }

  #getHoverBubbleStyle() {
    const userStyle =
      this.#setting.mouseHoverSetting?.bubbleStyle ||
      DEFAULT_MOUSE_HOVER_BUBBLE_STYLE;
    const normalizedUserStyle = userStyle.trim().replace(/;+$/, "");
    return `${normalizedUserStyle};
position: fixed !important;
z-index: 2147483647 !important;
box-sizing: border-box !important;
pointer-events: none !important;
white-space: pre-wrap !important;
overflow-wrap: anywhere !important;`;
  }

  // 确保悬停气泡的 DOM 元素存在并已挂载到 body
  #ensureHoverBubble() {
    if (this.#hoverBubbleNode?.isConnected) {
      return this.#hoverBubbleNode;
    }

    const bubble = document.createElement("div");
    bubble.className = `${Translator.KISS_CLASS.hoverBubble} notranslate`;
    bubble.setAttribute("role", "tooltip");
    document.body.appendChild(bubble);
    this.#hoverBubbleNode = bubble;

    return bubble;
  }

  // 计算并更新悬停气泡的位置，使其跟随鼠标且不溢出视口
  #positionHoverBubble() {
    const bubble = this.#hoverBubbleNode;
    if (!bubble) return;

    const gap = 12;
    const viewportGap = 8;
    let left = this.#hoverPointer.x + gap;
    let top = this.#hoverPointer.y + gap;

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;

    const rect = bubble.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - viewportGap;
    const maxTop = window.innerHeight - rect.height - viewportGap;

    left = Math.max(viewportGap, Math.min(left, maxLeft));
    top = Math.max(viewportGap, Math.min(top, maxTop));

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  // 显示悬停气泡内容并更新其状态与位置
  #showHoverBubble(content, state = "ready") {
    const bubble = this.#ensureHoverBubble();
    bubble.style.cssText = this.#getHoverBubbleStyle();
    bubble.dataset.state = state;
    bubble.replaceChildren(
      content instanceof Node ? content : document.createTextNode(content)
    );
    bubble.hidden = false;
    this.#positionHoverBubble();
  }

  // 隐藏并移除悬停气泡，同时通过递增 RunId 废弃正在进行的翻译请求
  #hideHoverBubble() {
    this.#clearHoverOriginalTimer();
    this.#clearFavoriteHoverTimer();
    this.#hoverBubbleRunId++;
    this.#hoverBubbleTarget = null;
    this.#favoriteHoverTarget = null;
    if (this.#hoverBubbleNode) {
      this.#hoverBubbleNode.remove();
      this.#hoverBubbleNode = null;
    }
  }

  // 气泡模式下翻译目标节点，处理请求竞态与错误边界
  async #translateHoverBubbleNode(node) {
    this.#clearHoverOriginalTimer();
    if (!Translator.isElementOrFragment(node)) return;
    if (this.#hoverBubbleTarget === node && this.#hoverBubbleNode) return;

    const text = node.textContent || "";
    if (this.#isInvalidText(text)) {
      this.#hideHoverBubble();
      return;
    }

    const currentRunId = ++this.#hoverBubbleRunId;
    this.#hoverBubbleTarget = node;
    this.#showHoverBubble(createLoadingSVG(), "loading");

    try {
      let deLang = "";
      const { fromLang = "auto", toLang } = this.#rule;
      const {
        langDetector,
        skipLangs = [],
        translateVariants = true,
      } = this.#setting;
      if (fromLang === "auto") {
        deLang = await tryDetectLang(text, langDetector);
        if (
          deLang &&
          (isSameTranslationLanguage(deLang, toLang, translateVariants) ||
            skipLangs.includes(deLang))
        ) {
          if (this.#hoverBubbleRunId === currentRunId) {
            this.#hideHoverBubble();
          }
          return;
        }
      }

      const { trText, isSame } = await this.#translateFetch(
        text,
        deLang,
        null,
        this.#hoverBubbleApiSetting
      );
      if (
        this.#hoverBubbleRunId !== currentRunId ||
        this.#hoverBubbleTarget !== node
      ) {
        return;
      }

      if (!trText || isSame) {
        this.#hideHoverBubble();
        return;
      }

      this.#showHoverBubble(Array.isArray(trText) ? trText[0] : trText);
    } catch (err) {
      if (
        this.#hoverBubbleRunId !== currentRunId ||
        this.#hoverBubbleTarget !== node
      ) {
        return;
      }
      this.#showHoverBubble(this.#formatTranslateError(err), "error");
    }
  }

  // 处理节点转为翻译字符串
  #serializeForTranslation(nodes, termsStyle) {
    let replaceCounter = 0; // {{n}}
    let wrapCounter = 0; // <tagn>
    const placeholderMap = new Map();
    const { startDelimiter, endDelimiter } = this.#placeholderConfig;

    const pushReplace = (html) => {
      replaceCounter++;
      const placeholder = `${startDelimiter}${replaceCounter}${endDelimiter}`;
      placeholderMap.set(placeholder, html);
      return placeholder;
    };

    const traverse = (node) => {
      if (
        node.nodeType !== Node.ELEMENT_NODE &&
        node.nodeType !== Node.TEXT_NODE
      ) {
        return "";
      }

      // 文本节点
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent;
        if (!text.trim()) return "";

        // 专业术语替换：matcher 一次物化（热路径零编译），applyTermReplace 内部重置 lastIndex
        if (this.#combinedTermsRegex) {
          const { output } = applyTermReplace(
            text,
            this.#termEntries,
            (termEntry, fullMatch) => {
              const termValue = termEntry.value;
              return pushReplace(
                `<i class="${Translator.KISS_CLASS.term}" style="${termsStyle}">${termValue || fullMatch}</i>`
              );
            },
            this.#termMatcher || this.#combinedTermsRegex
          );
          text = output;
        }

        return escapeHTML(text);
      }

      // 元素节点
      if (node.nodeType === Node.ELEMENT_NODE) {
        // 收藏词高亮只影响原文显示，不应改变翻译请求的结构
        if (node.classList.contains(Translator.KISS_CLASS.highlight)) {
          return Array.from(node.childNodes, traverse).join("");
        }

        if (this.#isIgnoredElement(node)) {
          return "";
        }

        let matchesKeepSelector = false;
        try {
          matchesKeepSelector = node.matches(this.#rule.keepSelector);
        } catch (err) {
          kissLog("keepSelector match error", this.#rule.keepSelector, err);
        }

        if (
          (this.#rule.hasRichText === "true" &&
            Translator.TAGS.REPLACE.has(node.tagName)) ||
          matchesKeepSelector ||
          // node.matches(this.#ignoreSelector) ||
          !node.textContent.trim()
        ) {
          if (
            node.tagName?.toUpperCase() === "IMG" ||
            node.tagName?.toUpperCase() === "SVG"
          ) {
            node.style.width = `${node.offsetWidth}px`;
            node.style.height = `${node.offsetHeight}px`;
          }
          return pushReplace(node.outerHTML);
        }

        let innerContent = "";
        node.childNodes.forEach((child) => {
          try {
            innerContent += traverse(child);
          } catch (err) {
            kissLog("traverse child error", child.nodeName, err);
          }
        });

        if (
          this.#rule.hasRichText === "true" &&
          Translator.TAGS.WARP.has(node.tagName?.toUpperCase())
        ) {
          wrapCounter++;
          const { tagName, format } = this.#placeholderConfig;

          // 存储序号对应的原始标签对（使用TAG_前缀避免与普通占位符{{1}}冲突）
          placeholderMap.set(`TAG_${wrapCounter}`, {
            openTag: buildOpeningTag(node),
            closeTag: `</${node.localName}>`,
          });

          // 生成占位符
          let startPlaceholder, endPlaceholder;
          if (format === "attribute") {
            // 属性格式：<a i=1>content</a>
            startPlaceholder = `<${tagName} i=${wrapCounter}>`;
            endPlaceholder = `</${tagName}>`;
          } else {
            // 简洁格式：<a1>content</a1>
            startPlaceholder = `<${tagName}${wrapCounter}>`;
            endPlaceholder = `</${tagName}${wrapCounter}>`;
          }

          return `${startPlaceholder}${innerContent}${endPlaceholder}`;
        }

        return innerContent;
      }

      return "";
    };

    function buildOpeningTag(node) {
      const escapeAttr = (str) => str.replace(/"/g, "&quot;");
      let tag = `<${node.tagName.toLowerCase()}`;
      for (const attr of node.attributes) {
        tag += ` ${attr.name}="${escapeAttr(attr.value)}"`;
      }
      tag += ">";
      return tag;
    }

    let processedString = nodes.map(traverse).join("").trim();

    // 先清理整个翻译片段两端的源码排版空白，再保护正文内部的换行和 Tab。
    // 不能逐个 trim 文本节点，否则会破坏行内元素之间的必要空格。
    processedString = processedString.replace(/\r?\n|\t/g, (whitespace) =>
      pushReplace(whitespace === "\t" ? "&#9;" : "&#10;")
    );

    return [processedString, placeholderMap];
  }

  // 将翻译后的文本与之前序列化时抽离的 HTML 占位符、标签和术语映射进行合并还原，恢复原网页的富文本格式与 DOM 结构
  #restoreFromTranslation(translatedText, placeholderMap) {
    if (!placeholderMap.size) {
      return translatedText;
    }

    if (!translatedText) return "";

    const { safeTag, openRegex, closeRegex } = this.#placeholderConfig;
    const restoreAttr = "data-kiss-restore";
    let textToParse = translatedText;
    let result = translatedText;

    try {
      // 1. 规范化占位符：将不同翻译源返回的不同占位标签（如 <a1>... </a1> 或 <span i=1>...）统一替换为统一的临时标记格式 `<span data-kiss-restore="序号">`
      textToParse = textToParse.replace(
        openRegex,
        `<${safeTag} ${restoreAttr}="$1">`
      );
      textToParse = textToParse.replace(closeRegex, `</${safeTag}>`);

      // 2. DOM 静态解析：使用 DOMParser 将规范后的 HTML 字符串解析成一个虚拟 DOM 树，以便精确操作和避免正则嵌套标签还原出错的问题
      const parser = new DOMParser();
      const doc = parser.parseFromString(
        trustedTypesHelper.createHTML(textToParse),
        "text/html"
      );

      // 3. 查找所有临时标记节点
      const selector = `${safeTag}[${restoreAttr}]`;
      const placeholders = Array.from(doc.querySelectorAll(selector));

      // 4. 自底向上倒序还原：为了保证嵌套标签的父子包含层级不被破坏，必须从最深处的子节点开始依次向外层父节点还原。
      // 这里的 placeholders.reverse() 正是实现了自底向上（倒序）替换 DOM 节点，逻辑非常严密！
      placeholders.reverse().forEach((node) => {
        const index = node.getAttribute(restoreAttr);
        if (index) {
          const tagPair = placeholderMap.get(`TAG_${index}`);
          if (tagPair) {
            // 使用原本的 HTML 标签对 (如 <a href="...">...</a>) 完整包裹当前节点的内容，并使用 outerHTML 替换整个临时 span 节点
            node.outerHTML = trustedTypesHelper.createHTML(
              `${tagPair.openTag}${node.innerHTML}${tagPair.closeTag}`
            );
          }
        }
      });

      // 获取还原完毕后的富文本 HTML 字符串
      result = doc.body.innerHTML;
    } catch (e) {
      kissLog("DOMParser restore failed, fallback to raw", e);
      // 如果 DOMParser 解析出错（比如翻译源返回了破碎的 HTML 片段），则回退，继续尝试用正则直接替换普通占位符
    }

    // 5. 还原普通无语义占位符（如术语、换行符、行内图片或不可翻译标记 {{1}}、{{2}} 等）
    result = result.replace(
      this.#placeholderConfig.placeholderRegex,
      (match) => placeholderMap.get(match) || match
    );

    return result;
  }

  // 发起翻译请求
  #translateFetch(
    text,
    deLang = "",
    onStreamChunk = null,
    apiSettingOverride = null
  ) {
    const { toLang, transStartHook } = this.#rule;
    const fromLang = deLang || this.#rule.fromLang;
    const rawApiSetting = { ...(apiSettingOverride || this.#apiSetting) };

    const apiSetting = resolveApiPromptSettings(
      rawApiSetting,
      this.#setting.prompts,
      this.#setting.subtitleSetting
    );

    const glossary = { ...this.#glossary };
    const apisMap = this.#apisMap;

    const args = {
      text,
      fromLang,
      toLang,
      apiSetting,
      glossary,
      onStreamChunk,
      textFormat: "html",
      translateVariants: this.#setting.translateVariants,
    };

    // 翻译开始钩子函数（允许用户在翻译请求发送前修改文本、语言或词典配置）
    // REVIEW: 共享 Sval 实例导致 Hook 竞态条件 (Race Condition) 隐患。
    // 由于 interpreter 是全局单例，当短时间内有多个并发的 translateFetch 触发时，
    // 同步执行的 `interpreter.run('exports.transStartHook = ...')` 会直接覆盖上一个翻译请求的 exports.transStartHook。
    // 这可能导致先前发起的、仍在执行准备阶段的请求，在调用 transStartHook 时执行成了后一个翻译源的钩子逻辑。
    if (transStartHook?.trim()) {
      try {
        interpreter.run(`exports.transStartHook = ${transStartHook}`);
        const hookResult = interpreter.exports.transStartHook({
          ...args,
          apisMap,
        });
        if (hookResult) {
          Object.assign(args, hookResult);
        }
      } catch (err) {
        kissLog("transStartHook", err);
      }
    }

    return apiTranslate(args);
  }

  // 查找指定节点下所有译文节点
  #findTranslationWrappers(parentNode) {
    return parentNode.querySelectorAll(
      `:scope > .${Translator.KISS_CLASS.warpper}`
    );
  }

  // 清理所有插入的译文dom
  #cleanupAllNodes() {
    this.#rootNodes.forEach((root) => this.#cleanupAllTranslations(root));
  }

  #cleanupTranslationElements(elements) {
    const wrappers = Array.from(elements);
    if (!wrappers.length) return;

    // 这些节点会在清理期间被移除或解包，不能作为最终的视口锚点
    const excludedAnchors = new Set(wrappers);
    wrappers.forEach((wrapper) => {
      const originalWrapper =
        this.#translationNodes.get(wrapper)?.originalWrapper;
      if (originalWrapper) excludedAnchors.add(originalWrapper);
    });

    this.#withViewportAnchor(() => {
      wrappers.forEach((el) => this.#removeTranslationElement(el));
    }, excludedAnchors);
  }

  // 清理节点下面所有译文dom
  #cleanupAllTranslations(root) {
    this.#cleanupTranslationElements(
      root.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    );
  }

  // 清理子节点译文dom
  #cleanupDirectTranslations(node) {
    this.#cleanupTranslationElements(this.#findTranslationWrappers(node));
  }

  #collectExistingTranslationNodes(wrapper) {
    const { transOrder = "original-first" } = this.#rule;
    const nodes = [];
    const isOriginalBefore = transOrder !== "translation-first";
    let current = isOriginalBefore
      ? wrapper.previousSibling
      : wrapper.nextSibling;

    if (current?.classList?.contains(Translator.KISS_CLASS.original)) {
      return [current];
    }

    while (current) {
      if (
        this.#shouldBreak(current) &&
        !Translator.TAGS.WARP.has(current.nodeName?.toUpperCase())
      ) {
        break;
      }

      if (
        current.nodeType === Node.ELEMENT_NODE ||
        current.nodeType === Node.TEXT_NODE
      ) {
        if (isOriginalBefore) {
          nodes.unshift(current);
        } else {
          nodes.push(current);
        }
      }

      current = isOriginalBefore
        ? current.previousSibling
        : current.nextSibling;
    }

    return nodes;
  }

  #getTranslationBackup(wrapper) {
    return wrapper.querySelector(
      `:scope > template.${Translator.KISS_CLASS.backup}`
    );
  }

  #getOrCreateTranslationBackup(wrapper) {
    let backup = this.#getTranslationBackup(wrapper);
    if (!backup) {
      backup = document.createElement("template");
      backup.className = Translator.KISS_CLASS.backup;
      wrapper.appendChild(backup);
    }
    return backup;
  }

  #getOriginalStyleClass(style) {
    return this.#textClass[style] || this.#textClass[OPT_STYLE_NONE] || "";
  }

  #wrapOriginalNodes(nodes, style) {
    if (!nodes?.length) return null;

    const parent = nodes[0].parentNode;
    if (!parent || nodes.some((node) => node.parentNode !== parent)) {
      return null;
    }

    const originalWrapper = document.createElement("span");
    originalWrapper.className = [
      Translator.KISS_CLASS.original,
      this.#getOriginalStyleClass(style),
    ]
      .filter(Boolean)
      .join(" ");

    this.#withIgnoredMutations([parent, originalWrapper], () => {
      nodes[0].before(originalWrapper);
      nodes.forEach((node) => originalWrapper.appendChild(node));
    });

    return originalWrapper;
  }

  #unwrapOriginal(originalWrapper) {
    if (!originalWrapper?.parentNode) return;

    const parent = originalWrapper.parentNode;
    this.#withIgnoredMutations([parent, originalWrapper], () => {
      originalWrapper.replaceWith(...originalWrapper.childNodes);
    });
  }

  #getOriginalUnits({ nodes = [], originalWrapper } = {}) {
    return originalWrapper ? [originalWrapper] : nodes;
  }

  #setOriginalStyle(originalWrapper, oldStyle, newStyle) {
    if (!originalWrapper) return;

    const oldClass = this.#getOriginalStyleClass(oldStyle);
    const newClass = this.#getOriginalStyleClass(newStyle);
    if (oldClass) originalWrapper.classList.remove(oldClass);
    if (newClass) originalWrapper.classList.add(newClass);
  }

  #tryAdoptExistingTranslationHost(hostNode) {
    if (!Translator.isElementOrFragment(hostNode)) return false;

    const wrappers = Array.from(hostNode.children || []).filter((child) =>
      child.classList?.contains(Translator.KISS_CLASS.warpper)
    );
    if (!wrappers.length) return false;

    wrappers.forEach((wrapper) => {
      const backup = this.#getTranslationBackup(wrapper);
      const backupNodes = backup ? Array.from(backup.content.childNodes) : [];
      const hasBackupNodes = backupNodes.length > 0;
      const collectedNodes = hasBackupNodes
        ? backupNodes
        : this.#collectExistingTranslationNodes(wrapper);
      const originalWrapper = collectedNodes.find((node) =>
        node.classList?.contains(Translator.KISS_CLASS.original)
      );
      const nodes = originalWrapper
        ? Array.from(originalWrapper.childNodes)
        : collectedNodes;
      this.#translationNodes.set(wrapper, {
        nodes,
        originalWrapper,
        isHide: hasBackupNodes,
      });
      nodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          this.#processedNodes.set(node, { ...this.#rule });
        }
      });
    });

    this.#processedNodes.set(hostNode, { ...this.#rule });
    this.#observedNodes.add(hostNode);
    this.#viewNodes.add(hostNode);
    return true;
  }

  // 清理译文；视口锚点由批量清理方法统一维护
  #removeTranslationElement(el) {
    const parentElement = el.parentElement;
    this.#processedNodes.delete(parentElement);

    // 如果是仅显示译文模式，先恢复原文
    const data = this.#translationNodes.get(el);
    if (data?.isHide) {
      this.#restoreOriginal(el, data);
    }
    if (data?.originalWrapper) {
      this.#unwrapOriginal(data.originalWrapper);
    }

    this.#translationNodes.delete(el);
    el.remove();

    // todo: 可能不应深度清除
    if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
      this.#removeHighlights(parentElement);
    }
    this.#removeBrTags(parentElement);
  }

  // 恢复原文
  #restoreOriginal(el, data) {
    const originalUnits = this.#getOriginalUnits(data);
    if (originalUnits.length) {
      const parent = el.parentElement;
      if (parent) {
        const sourceParents = originalUnits.map((node) => node.parentNode);
        this.#withIgnoredMutations([...sourceParents, parent], () => {
          const frag = document.createDocumentFragment();
          originalUnits.forEach((node) => frag.appendChild(node));
          if (this.#rule.transOrder === "translation-first") {
            el.after(frag);
          } else {
            el.before(frag);
          }
        });
      }
    }
  }

  // 隐藏原文显示单元
  #removeOriginal(data, wrapper) {
    const originalUnits = this.#getOriginalUnits(data);
    if (originalUnits.length && wrapper) {
      const backup = this.#getOrCreateTranslationBackup(wrapper);
      const parent = originalUnits[0].parentNode;
      this.#withIgnoredMutations([parent], () => {
        originalUnits.forEach((node) => backup.content.appendChild(node));
      });
    }
  }

  // 切换译文和双语显示
  #toggleTranslationOnly(node, transOnly) {
    this.#findTranslationWrappers(node).forEach((el) => {
      const br = el.querySelector(":scope > br");
      const space = el.querySelector(
        `:scope > span.${Translator.KISS_CLASS.space}`
      );
      const data = this.#translationNodes.get(el);
      if (!data) return;
      if (transOnly === "true") {
        // 双语变为仅译文
        this.#withViewportAnchor(() => {
          if (br) br.hidden = true;
          if (space) space.hidden = true;
          this.#removeOriginal(data, el);
        });
        this.#translationNodes.set(el, { ...data, isHide: true });
      } else {
        // 仅译文变为双语
        this.#withViewportAnchor(() => {
          if (br) br.hidden = false;
          if (space) space.hidden = false;
          this.#restoreOriginal(el, data);
        });
        this.#translationNodes.set(el, { ...data, isHide: false });
      }
    });
  }

  // 根据 transOrder 调整 wrapper 位置
  #adjustWrapperPosition(wrapper, nodes, transOrder) {
    if (!nodes || !nodes.length) return;

    const { originalWrapper } = this.#translationNodes.get(wrapper) || {};
    const positionNodes = originalWrapper ? [originalWrapper] : nodes;

    // 获取第一个和最后一个原文节点的位置
    const firstNode = positionNodes[0];
    const lastNode = positionNodes[positionNodes.length - 1];

    // 获取 wrapper 和原文节点的父容器
    const wrapperParent = wrapper.parentElement;
    const firstNodeParent = firstNode?.parentElement;
    const lastNodeParent = lastNode?.parentElement;

    // 仅在同一父容器下才需要调整位置
    if (wrapperParent !== firstNodeParent || wrapperParent !== lastNodeParent) {
      return;
    }

    // br 是 wrapper 的子节点，只需调整 wrapper 相对于原文节点的位置
    if (transOrder === "translation-first") {
      // 译文在上：wrapper 应在原文节点前面
      if (firstNode.previousElementSibling !== wrapper) {
        firstNode.before(wrapper);
      }
    } else {
      // 原文在上（默认）：wrapper 应在原文节点后面
      if (lastNode.nextElementSibling !== wrapper) {
        lastNode.after(wrapper);
      }
    }
  }

  // 更新样式
  #updateStyle(node, oldStyle, newStyle) {
    this.#findTranslationWrappers(node).forEach((el) => {
      const inner = el.querySelector(
        `:scope > .${Translator.KISS_CLASS.inner}`
      );
      inner.classList.remove(this.#textClass[oldStyle]);
      inner.classList.add(this.#textClass[newStyle]);
    });
  }

  #updateOriginalWrapping(node, wrapOriginal, originalTextStyle) {
    this.#findTranslationWrappers(node).forEach((wrapper) => {
      const data = this.#translationNodes.get(wrapper);
      if (!data) return;

      if (wrapOriginal === "true" && !data.originalWrapper) {
        const originalWrapper = this.#wrapOriginalNodes(
          data.nodes,
          originalTextStyle
        );
        if (originalWrapper) {
          this.#translationNodes.set(wrapper, {
            ...data,
            originalWrapper,
          });
        }
      } else if (wrapOriginal !== "true" && data.originalWrapper) {
        this.#unwrapOriginal(data.originalWrapper);
        this.#translationNodes.set(wrapper, {
          ...data,
          originalWrapper: null,
        });
      }
    });
  }

  #updateOriginalStyle(node, oldStyle, newStyle) {
    this.#findTranslationWrappers(node).forEach((wrapper) => {
      const { originalWrapper } = this.#translationNodes.get(wrapper) || {};
      this.#setOriginalStyle(originalWrapper, oldStyle, newStyle);
    });
  }

  // 更新文本顺序
  #updateTransOrder(node, transOrder) {
    this.#findTranslationWrappers(node).forEach((el) => {
      const { nodes } = this.#translationNodes.get(el) || {};
      if (nodes && nodes.length) {
        this.#withViewportAnchor(() => {
          this.#adjustWrapperPosition(el, nodes, transOrder);
        });
      }
    });
  }

  // 刷新节点翻译
  #refreshNode(node) {
    this.#cleanupDirectTranslations(node);
    this.#processedNodes.delete(node);
    this.#processNode(node);
  }

  // 使指定节点的状态与当前的全局同步
  #performSyncNode(node) {
    const appliedRule = this.#processedNodes.get(node);
    if (!appliedRule) {
      this.#enabled && this.#processNode(node);
      return;
    }

    const {
      apiSlug,
      fromLang,
      toLang,
      hasRichText,
      textStyle,
      transOnly,
      transOrder = "original-first",
      wrapOriginal,
      originalTextStyle,
    } = this.#rule;

    const needsRefresh =
      appliedRule.apiSlug !== apiSlug ||
      appliedRule.fromLang !== fromLang ||
      appliedRule.toLang !== toLang ||
      appliedRule.hasRichText !== hasRichText;

    // 需要重新翻译
    if (needsRefresh) {
      Object.assign(appliedRule, {
        apiSlug,
        fromLang,
        toLang,
        hasRichText,
        textStyle,
        transOnly,
        transOrder,
        wrapOriginal,
        originalTextStyle,
      });
      this.#refreshNode(node); // 会自动应用新样式
      return;
    }

    // 样式规则过时
    if (appliedRule.textStyle !== textStyle) {
      const oldStyle = appliedRule.textStyle;
      appliedRule.textStyle = textStyle;
      this.#updateStyle(node, oldStyle, textStyle);
    }

    if (appliedRule.wrapOriginal !== wrapOriginal) {
      appliedRule.wrapOriginal = wrapOriginal;
      this.#withViewportAnchor(() => {
        this.#updateOriginalWrapping(node, wrapOriginal, originalTextStyle);
      });
    }

    if (appliedRule.originalTextStyle !== originalTextStyle) {
      const oldStyle = appliedRule.originalTextStyle;
      appliedRule.originalTextStyle = originalTextStyle;
      this.#updateOriginalStyle(node, oldStyle, originalTextStyle);
    }

    // 文本顺序规则过时
    if (appliedRule.transOrder !== transOrder) {
      appliedRule.transOrder = transOrder;
      this.#updateTransOrder(node, transOrder);
    }

    // 切换原文显示
    if (appliedRule.transOnly !== transOnly) {
      appliedRule.transOnly = transOnly;
      this.#toggleTranslationOnly(node, transOnly);
    }
  }

  // 停止监听，重置参数
  #resetOptions() {
    // 停止/重扫会清理实例状态，语言检测中的按住任务必须立即过期
    this.#holdGeneration += 1;
    this.#removeShadowRootListener();

    this.#io.disconnect();
    this.#mo.disconnect();
    this.#viewNodes.clear();
    this.#rootNodes.clear();
    this.#favoriteHighlightScopes.clear();
    this.#observedNodes = new WeakSet();
    this.#translationNodes = new WeakMap();
    this.#processedNodes = new WeakMap();
    this.#holdProcessGenerations = new WeakMap();
    this.#plainTextPreprocessingNodes = new WeakSet();
    this.#ignoredMutationTargets = new WeakSet();
    this.#io = this.#createIntersectionObserver();
  }

  // 开启鼠标悬停翻译
  #enableMouseHover() {
    if (this.#mouseHoverEnabled) return;
    this.#mouseHoverEnabled = true;
    this.#setting.mouseHoverSetting.useMouseHover = true;

    if (this.#shouldUseOriginalHoverBubble() && this.#transOnlyRevertTarget) {
      this.#clearTransOnlyRevertTimer();
      this.#hideOriginalTemporarily(this.#transOnlyRevertTarget);
    }

    document.addEventListener("mousemove", this.#boundMouseMoveHandler);
    const {
      mouseHoverKey = [],
      mouseHoverKey2 = [],
      mouseHoverKeyHold = false,
      mouseHoverKey2Hold = false,
    } = this.#setting.mouseHoverSetting;
    const hasMouseHold = mouseHoverKeyHold || mouseHoverKey2Hold;
    if (hasMouseHold && this.#isHoldSupportedByDevice()) {
      this.#registerMouseHoldHandler();
    }
    if (
      mouseHoverKey.length === 0 &&
      mouseHoverKey2.length === 0 &&
      !hasMouseHold
    ) {
      // 没有任何触发方式时，鼠标悬停即直接翻译
      return;
    }
    const hasPrimaryShortcut = mouseHoverKey.length > 0;
    const hasAltShortcut = mouseHoverKey2.length > 0;
    this.#removeKeydownHandler = hasPrimaryShortcut
      ? shortcutRegister(mouseHoverKey, this.#boundKeyDownHandler)
      : undefined;
    const isSameShortcut =
      hasPrimaryShortcut &&
      hasAltShortcut &&
      mouseHoverKey.length === mouseHoverKey2.length &&
      mouseHoverKey.every((key, idx) => key === mouseHoverKey2[idx]);
    this.#removeKeydownHandler2 =
      hasAltShortcut && !isSameShortcut
        ? shortcutRegister(mouseHoverKey2, this.#boundKeyDownHandler)
        : undefined;
  }

  // 禁用鼠标悬停翻译
  #disableMouseHover() {
    if (!this.#mouseHoverEnabled) return;
    this.#mouseHoverEnabled = false;
    this.#setting.mouseHoverSetting.useMouseHover = false;
    this.#hoveredNode = null;
    this.#hideHoverBubble();

    document.removeEventListener("mousemove", this.#boundMouseMoveHandler);
    this.#removeKeydownHandler?.();
    this.#removeKeydownHandler2?.();
    this.#removeMouseHoldHandlers?.();
    this.#cancelMouseHold();
    // 关闭鼠标悬停翻译时同样废弃语言检测中的按住任务
    this.#holdGeneration += 1;
    this.#holdUnitsCache = new WeakMap();
  }

  #enableTransOnlyRevert() {
    if (this.#transOnlyRevertEnabled) return;
    this.#transOnlyRevertEnabled = true;

    this.#boundTransOnlyMouseOver = (e) => {
      if (this.#shouldUseOriginalHoverBubble()) return;

      const wrapper = e.target.closest?.(`.${Translator.KISS_CLASS.warpper}`);
      if (wrapper) {
        const data = this.#translationNodes.get(wrapper);
        if (!data || !data.isHide) return;
        if (this.#transOnlyRevertTarget === wrapper) return;

        this.#clearTransOnlyRevertTimer();
        const delay = parseFloat(this.#rule.transOnlyRevertDelay) || 0.5;
        this.#transOnlyRevertTimer = setTimeout(() => {
          this.#showOriginalTemporarily(wrapper, data);
        }, delay * 1000);
        return;
      }

      if (this.#transOnlyRevertTarget) {
        const data = this.#translationNodes.get(this.#transOnlyRevertTarget);
        if (data) {
          const origNodes = data.nodes || [];
          for (const node of origNodes) {
            if (node === e.target || node.contains?.(e.target)) return;
          }
        }
      }
    };

    this.#boundTransOnlyMouseOut = (e) => {
      if (this.#shouldUseOriginalHoverBubble()) return;

      if (!this.#transOnlyRevertTarget) {
        const wrapper = e.target.closest?.(`.${Translator.KISS_CLASS.warpper}`);
        if (wrapper) this.#clearTransOnlyRevertTimer();
        return;
      }

      const wrapper = this.#transOnlyRevertTarget;
      const related = e.relatedTarget;

      if (related && (wrapper.contains(related) || related === wrapper)) return;

      const data = this.#translationNodes.get(wrapper);
      if (data && related) {
        const origNodes = data.nodes || [];
        for (const node of origNodes) {
          if (node === related || node.contains?.(related)) return;
        }
      }

      this.#clearTransOnlyRevertTimer();
      this.#hideOriginalTemporarily(wrapper);
    };

    document.addEventListener("mouseover", this.#boundTransOnlyMouseOver);
    document.addEventListener("mouseout", this.#boundTransOnlyMouseOut);
  }

  #disableTransOnlyRevert() {
    if (!this.#transOnlyRevertEnabled) return;
    this.#transOnlyRevertEnabled = false;

    this.#clearTransOnlyRevertTimer();
    if (this.#transOnlyRevertTarget) {
      this.#hideOriginalTemporarily(this.#transOnlyRevertTarget);
    }

    document.removeEventListener("mouseover", this.#boundTransOnlyMouseOver);
    document.removeEventListener("mouseout", this.#boundTransOnlyMouseOut);
    this.#boundTransOnlyMouseOver = null;
    this.#boundTransOnlyMouseOut = null;
  }

  #clearTransOnlyRevertTimer() {
    if (this.#transOnlyRevertTimer) {
      clearTimeout(this.#transOnlyRevertTimer);
      this.#transOnlyRevertTimer = null;
    }
  }

  #showOriginalTemporarily(wrapper, data) {
    this.#withViewportAnchor(() => {
      this.#restoreOriginal(wrapper, data);
      const inner = wrapper.querySelector(
        `:scope > .${Translator.KISS_CLASS.inner}`
      );
      if (inner) inner.style.display = "none";
      const br = wrapper.querySelector(":scope > br");
      if (br) br.hidden = true;
    });
    this.#transOnlyRevertTarget = wrapper;
  }

  #hideOriginalTemporarily(wrapper) {
    const data = this.#translationNodes.get(wrapper);
    if (!data) return;
    this.#withViewportAnchor(() => {
      this.#removeOriginal(data, wrapper);
      const inner = wrapper.querySelector(
        `:scope > .${Translator.KISS_CLASS.inner}`
      );
      if (inner) inner.style.display = "";
    });
    this.#transOnlyRevertTarget = null;
  }

  // 注入JS/CSS
  #initInjector() {
    if (this.#isJsInjected) {
      return;
    }
    this.#isJsInjected = true;

    try {
      // const { injectJs, injectCss } = this.#rule;
      // if (isExt) {
      //   injectJs && sendBgMsg(MSG_INJECT_JS, injectJs);
      //   injectCss && sendBgMsg(MSG_INJECT_CSS, injectCss);
      // } else {
      //   injectJs &&
      //     injectInlineJs(injectJs, "kiss-translator-userinit-injector");
      //   injectCss && injectInternalCss(injectCss);
      // }

      const { injectJs, injectCss, toLang } = this.#rule;

      if (isExt) {
        injectCss && sendBgMsg(MSG_INJECT_CSS, injectCss);
      } else {
        injectCss && injectInternalCss(injectCss);
      }

      if (injectJs?.trim()) {
        const apiSetting = { ...this.#apiSetting };
        const glossary = { ...this.#glossary };
        const apisMap = this.#apisMap;
        const apiDectect = tryDetectLang;
        interpreter.import({
          KT: {
            apiTranslate,
            apiDectect,
            apiSetting,
            apisMap,
            toLang,
            glossary,
          },
        });
        interpreter.run(injectJs);
      }
    } catch (err) {
      kissLog("inject js", err);
    }
  }

  // 移除JS/CSS
  #removeInjector() {
    document
      .querySelectorAll(`[data-source^="kiss-inject"]`)
      ?.forEach((el) => el.remove());
  }

  // 切换鼠标悬停翻译
  toggleMouseHover() {
    this.#mouseHoverEnabled
      ? this.#disableMouseHover()
      : this.#enableMouseHover();
  }

  // 开启翻译
  enable() {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#rule.transOpen = "true";
    this.#runId++;

    if (this.#isInitialized) {
      if (this.#transAllnow) {
        this.rescan();
      } else {
        this.#reIOViewNodes();
      }
    } else {
      this.#init();
    }

    if (this.#rule.transTitle === "true") {
      this.#translateTitle();
    }

    isExt && sendBgMsg(MSG_UPDATE_ICON, true);
  }

  // 翻译页面标题
  async #translateTitle() {
    const docInfo = getDocInfo();
    if (!docInfo?.title) return;

    try {
      const deLang = await tryDetectLang(docInfo.title);
      const { trText } = await this.#translateFetch(docInfo.title, deLang);
      this.#docInfo.title = document.title; // 缓存原标题
      document.title = trText || docInfo.title;
    } catch (err) {
      kissLog("tanslate title", err);
    }
  }

  // 关闭翻译
  disable() {
    if (!this.#enabled) return;
    this.#enabled = false;
    this.#rule.transOpen = "false";
    this.#runId++;
    // 关闭翻译时立即废弃语言检测中的按住任务
    this.#holdGeneration += 1;

    this.#cleanupAllNodes();
    clearFetchPool();
    clearAllBatchQueue();

    // 恢复页面标题
    if (this.#rule.transTitle === "true" && this.#docInfo.title) {
      document.title = this.#docInfo.title;
    }

    isExt && sendBgMsg(MSG_UPDATE_ICON, false);
  }

  // 重新扫描页面
  rescan() {
    if (!this.#isInitialized) return;
    this.#runId++;

    this.#cleanupAllNodes();
    this.#resetOptions();
    clearFetchPool();
    clearAllBatchQueue();

    // 重新初始化
    this.#init();
  }

  // 切换是否翻译
  toggle() {
    this.#enabled ? this.disable() : this.enable();
  }

  toggleTransOnly() {
    if (!this.#enabled) {
      this.#rule.transOnly = "true";
      this.enable();
    } else {
      const newValue = this.#rule.transOnly === "true" ? "false" : "true";
      this.updateRule({ transOnly: newValue });
    }
  }

  // 快速切换模糊样式
  toggleStyle() {
    const textStyle =
      this.#rule.textStyle === OPT_STYLE_FUZZY
        ? OPT_STYLE_NONE
        : OPT_STYLE_FUZZY;
    this.updateRule({ textStyle });
  }

  // 切换划词翻译
  toggleTransbox() {
    this.#setting.tranboxSetting.transOpen =
      !this.#setting.tranboxSetting.transOpen;
  }

  // 切换输入框翻译
  toggleInputTranslate() {
    this.#setting.inputRule.transOpen = !this.#setting.inputRule.transOpen;
  }

  // 停止运行
  stop() {
    document.removeEventListener(
      EVENT_FAVORITE_WORD_CHANGE,
      this.#boundFavoriteWordChange
    );
    document.removeEventListener("mouseover", this.#boundFavoriteMouseOver);
    document.removeEventListener("mouseout", this.#boundFavoriteMouseOut);
    this.#hideHoverBubble();
    this.disable();
    this.#resetOptions();
    this.#disableMouseHover();
    this.#disableTransOnlyRevert();
    this.#removeInjector();
    this.#isInitialized = false;
  }

  // 更新规则
  updateRule(newRule) {
    let hasChanged = false;
    let needsRescan = false;
    const oldTransAllnow = this.#transAllnow;
    const oldRootMargin = this.#rootMargin;
    for (const key in newRule) {
      if (
        Object.prototype.hasOwnProperty.call(this.#rule, key) &&
        this.#rule[key] !== newRule[key]
      ) {
        this.#rule[key] = newRule[key];
        if (
          key === "autoScan" ||
          key === "blockSelector" ||
          key === "hasShadowroot" ||
          key === "rootsSelector" ||
          key === "scanAll" ||
          key === "isPlainText"
        ) {
          needsRescan = true;
        } else {
          hasChanged = true;
        }
      }
    }

    // 配置变更时清空正则缓存
    this.#placeholderCache = null;
    this.#blockSelectorInvalid = false;

    // terms 变更时重新解析术语：updateRule 可能由扩展/Popup 在运行期推送新规则，
    // 必须同步刷新 #termEntries 与 #combinedTermsRegex，否则术语停留在构造时的旧值
    // （历史缺陷：只有 #rule.terms 被覆盖，解析状态不更新导致新术语静默不生效）。
    // 用 hasOwnProperty 判定（与上方 3991 行一致）：显式传 terms: undefined 不触发重解析，
    // 避免把解析状态置位到 undefined 派生值。
    if (Object.prototype.hasOwnProperty.call(newRule, "terms")) {
      this.#parseTerms(this.#rule.terms);
    }

    // aiTerms 变更时同步刷新 #glossary：与 #terms 同类的运行时不对称缺陷——
    // 构造后运行期更新规则里的 AI 术语若不同步重解析，glossary 会停留构造时旧值，
    // 导致 AI 翻译静默不生效。这里与 terms 分支并列，保持两者解析状态一致。
    if (Object.prototype.hasOwnProperty.call(newRule, "aiTerms")) {
      this.#glossary = parseAITerms(this.#rule.aiTerms);
    }

    const needsTriggerRescan =
      this.#enabled &&
      (oldTransAllnow !== this.#transAllnow ||
        String(oldRootMargin) !== String(this.#rootMargin));

    if (
      needsRescan ||
      needsTriggerRescan ||
      (this.#enabled && this.#transAllnow)
    ) {
      this.rescan();
      this.#syncTransOnlyRevert();
      return;
    }

    if (hasChanged) {
      this.#reIOViewNodes();
      this.#syncTransOnlyRevert();
    }
  }

  #syncTransOnlyRevert() {
    // 退出气泡模式或关闭“隐藏原文”时，清理仍在等待或显示的原文气泡。
    if (!this.#shouldUseOriginalHoverBubble()) {
      this.#clearHoverOriginalTimer();
      if (
        this.#hoverBubbleTarget?.classList?.contains(
          Translator.KISS_CLASS.warpper
        )
      ) {
        this.#hideHoverBubble();
      }
    }

    const shouldEnable =
      this.#rule.transOnly === "true" && this.#rule.transOnlyRevert === "true";
    if (shouldEnable && !this.#transOnlyRevertEnabled) {
      this.#enableTransOnlyRevert();
    } else if (!shouldEnable && this.#transOnlyRevertEnabled) {
      this.#disableTransOnlyRevert();
    }
  }

  get setting() {
    return { ...this.#setting };
  }

  get rule() {
    return { ...this.#rule };
  }

  get eventName() {
    return this.#eventName;
  }
}
