import {
  APP_LCNAME,
  APP_CONSTS,
  OPT_STYLE_FUZZY,
  GLOBLA_RULE,
  DEFAULT_SETTING,
  // DEFAULT_MOUSEHOVER_KEY,
  OPT_STYLE_NONE,
  DEFAULT_API_SETTING,
  DEFAULT_MOUSE_HOVER_BUBBLE_STYLE,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
  OPT_MOUSE_HOVER_DISPLAY_BUBBLE,
  OPT_SPLIT_PARAGRAPH_PUNCTUATION,
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_SPLIT_PARAGRAPH_TEXTLENGTH,
  API_SPE_TYPES,
  MSG_INJECT_CSS,
  MSG_UPDATE_ICON,
  newI18n,
} from "../config";
import { resolveApiPromptSettings } from "../config/prompt";
import { interpreter } from "./interpreter";
import { clearFetchPool } from "./pool";
import { debounce, scheduleIdle, genEventName, parseAITerms } from "./utils";
import { escapeHTML } from "./html";
import { apiTranslate } from "../apis";
import { kissLog } from "./log";
import { clearAllBatchQueue } from "./batchQueue";
import { genTextClass } from "./style";
import { createLoadingSVG, createRetrySVG } from "./svg";
import { shortcutRegister } from "./shortcut";
import { tryDetectLang } from "./detect";
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
  #termValues = []; // 按顺序存储术语的替换值
  #combinedTermsRegex; // 专业术语正则表达式
  #combinedSkipsRegex; // 跳过文本正则表达式

  #placeholderCache = null; // 缓存正则对象
  #translationTagName = APP_LCNAME; // 翻译容器的标签名
  #eventName = ""; // 通信事件名称
  #docInfo = {}; // 网页信息
  #glossary = {}; // AI词典
  #blockSelectorInvalid = false; // 自定义块级选择器是否已确认无效
  #textClass = {}; // 译文样式class
  #textSheet = ""; // 译文样式字典
  #apisMap = new Map(); // 用于接口快速查找
  #favWords = []; // 收藏词汇

  #observedNodes = new WeakSet(); // 存储所有被识别出的、可翻译的 DOM 节点单元
  #translationNodes = new WeakMap(); // 存储所有插入到页面的译文节点
  #viewNodes = new Set(); // 当前在可视范围内的单元
  #processedNodes = new WeakMap(); // 已处理（已执行翻译DOM操作）的单元
  #rootNodes = new Set(); // 已监控的根节点
  #skipMoNodes = new WeakSet(); // 忽略变化的节点
  #plainTextPreprocessingNodes = new WeakSet(); // 正在流式预处理的纯文本 pre

  #removeKeydownHandler; // 快捷键清理函数
  #removeKeydownHandler2; // 备用快捷键清理函数
  #hoveredNode = null; // 存储当前悬停的可翻译节点
  #hoverPointer = { x: 0, y: 0 }; // 最近一次鼠标位置，用于定位气泡
  #hoverBubbleNode = null; // 鼠标悬停气泡容器
  #hoverBubbleTarget = null; // 当前气泡绑定的原文节点
  #hoverBubbleRunId = 0; // 用于丢弃过期的气泡翻译请求
  #boundMouseMoveHandler; // 鼠标事件
  #boundKeyDownHandler; // 键盘事件
  #windowMessageHandler = null;

  #debouncedFindShadowRoot = null;

  #io; // IntersectionObserver
  #mo; // MutationObserver
  #dmm; // DebounceMouseMover

  #rescanQueue = new Set(); // “脏容器”队列
  #isQueueProcessing = false; // 队列处理状态标志

  // 获取当前视口中的稳定锚点，用于 DOM 高度/结构发生改变（如插入译文）后保持滚动条位置，防止页面视觉闪烁或滚动位置发生偏移
  #captureViewportAnchor() {
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
      const anchor = this.#normalizeViewportAnchor(element);
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

    const currentTop = anchor.element.getBoundingClientRect().top;
    const offset = currentTop - anchor.top;
    // 如果位移差超过 0.5 像素，则平滑滚动以补偿该差值
    if (Math.abs(offset) > 0.5) {
      window.scrollBy(0, offset);
    }
  }

  // 包装执行 DOM 修改的回调函数，并在前后自动完成视口滚动稳定保护
  #withViewportAnchor(callback) {
    const anchor = this.#captureViewportAnchor();
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
    this.#rule = { ...Translator.DEFAULT_RULE, ...rule, isPlainText: false };
    this.#favWords = favWords;
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
    const textSheet = new CSSStyleSheet();
    textSheet.replaceSync(textStyles);
    this.#textClass = textClass;
    this.#textSheet = textSheet;
  }

  // 注入样式
  #injectSheet(shadowRoot) {
    if (!shadowRoot.adoptedStyleSheets.includes(this.#textSheet)) {
      shadowRoot.adoptedStyleSheets = [
        ...shadowRoot.adoptedStyleSheets,
        this.#textSheet,
      ];
    }
  }

  // 解析专业术语字符串
  #parseTerms(termsString) {
    this.#termValues = [];
    this.#combinedTermsRegex = null;

    if (!termsString || typeof termsString !== "string") return;

    const termPatterns = [];
    const lines = termsString.split(/\n|;/); // 按换行或分号分割

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      let lastCommaIndex = trimmedLine.lastIndexOf(",");
      if (lastCommaIndex === -1) {
        lastCommaIndex = trimmedLine.length;
      }
      const key = trimmedLine.substring(0, lastCommaIndex).trim();
      const value = trimmedLine.substring(lastCommaIndex + 1).trim();

      if (key) {
        try {
          new RegExp(key);
          termPatterns.push(`(${key})`);
          this.#termValues.push(value);
        } catch (err) {
          kissLog(`Invalid RegExp for term: "${key}"`, err);
        }
      }
    }

    if (termPatterns.length > 0) {
      this.#combinedTermsRegex = new RegExp(termPatterns.join("|"), "g");
    }
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

  // 节流的鼠标悬停事件
  #createDebounceMouseMover() {
    return debounce((targetNode) => {
      const startNode = targetNode;
      let foundNode = null;
      while (targetNode && targetNode !== document.body) {
        if (this.#observedNodes.has(targetNode)) {
          foundNode = targetNode;
          break;
        }
        targetNode = targetNode.parentElement;
      }
      this.#hoveredNode = foundNode || startNode;

      const { mouseHoverKey = [], mouseHoverKey2 = [] } =
        this.#setting.mouseHoverSetting;
      const hasMouseHoverShortcut =
        mouseHoverKey.length > 0 || mouseHoverKey2.length > 0;
      if (!hasMouseHoverShortcut && !this.#isInitialized) {
        this.#init();
      }
      if (!hasMouseHoverShortcut && foundNode) {
        this.#toggleTargetNode(foundNode);
      } else if (!foundNode && this.#isMouseHoverBubbleMode()) {
        this.#hideHoverBubble();
      }
    }, 100);
  }

  // 跟踪鼠标下的可翻译节点
  #handleMouseMove(event) {
    this.#hoverPointer = { x: event.clientX, y: event.clientY };
    if (
      this.#isMouseHoverBubbleMode() &&
      this.#hoverBubbleNode &&
      !this.#hoverBubbleNode.hidden
    ) {
      this.#positionHoverBubble();
    }
    let targetNode = event.composedPath()[0];
    this.#dmm(targetNode);
  }

  // 快捷键按下时的处理器
  #handleKeyDown() {
    if (!this.#isInitialized) {
      this.#init();
    }
    let targetNode = this.#hoveredNode;
    if (!targetNode || !this.#observedNodes.has(targetNode)) return;

    this.#toggleTargetNode(targetNode);
  }

  // 触发段落翻译
  toggleHoverNode() {
    this.#handleKeyDown();
  }

  // 切换节点翻译状态
  #toggleTargetNode(targetNode) {
    if (this.#isMouseHoverBubbleMode()) {
      this.#translateHoverBubbleNode(targetNode);
      return;
    }

    if (this.#processedNodes.has(targetNode)) {
      this.#cleanupDirectTranslations(targetNode);
    } else {
      this.#processNode(targetNode);
    }
  }

  // 判断当前鼠标悬停翻译是否处于气泡展示模式
  #isMouseHoverBubbleMode() {
    return (
      this.#setting.mouseHoverSetting?.displayMode ===
      OPT_MOUSE_HOVER_DISPLAY_BUBBLE
    );
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
    if (shadowRoot.host.matches(`#${APP_CONSTS.fabID}, #${APP_CONSTS.boxID}`)) {
      return;
    }
    this.#startObserveRoot(shadowRoot);
    this.#injectSheet(shadowRoot);
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
      if (!this.#observedNodes.has(node)) {
        this.#observedNodes.add(node);
        this.#io.observe(node);
      }
      return;
    }

    if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_BEFORETRANS) {
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
  async #processNode(node) {
    if (
      this.#processedNodes.has(node) ||
      !Translator.isElementOrFragment(node)
    ) {
      return;
    }

    this.#processedNodes.set(node, { ...this.#rule });

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
    const { langDetector, skipLangs = [] } = this.#setting;
    if (fromLang === "auto") {
      // revert 529
      deLang = await tryDetectLang(node.textContent, langDetector);
      if (
        deLang &&
        (toLang.slice(0, 2) === deLang.slice(0, 2) ||
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
        this.#translateNodeGroup(nodeGroup, node, deLang);
        nodeGroup = [];
      }
    });

    if (nodeGroup.length) {
      this.#translateNodeGroup(nodeGroup, node, deLang);
    }
  }

  // 高亮词汇
  #highlightTextNode(textNode, wordRegex) {
    if (textNode.parentNode?.nodeName.toLowerCase() === "b") {
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
  #highlightWordsDeeply(parentNode) {
    if (!parentNode || this.#favWords.length === 0) {
      return;
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedWords = this.#favWords.map(escapeRegex);
    const wordRegex = new RegExp(`\\b(${escapedWords.join("|")})\\b`, "gi");

    if (parentNode.nodeType === Node.ELEMENT_NODE) {
      const walker = document.createTreeWalker(
        parentNode,
        NodeFilter.SHOW_TEXT,
        null,
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
  async #translateNodeGroup(nodes, hostNode, deLang) {
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
    } = this.#rule;
    const {
      newlineLength,
      // langDetector，
    } = this.#setting;
    const parentNode = hostNode.parentElement;
    const hideOrigin = transOnly === "true";

    try {
      const [processedString, placeholderMap] = this.#serializeForTranslation(
        nodes,
        termsStyle
      );
      if (this.#isInvalidText(processedString)) return;

      const wrapper = document.createElement(this.#translationTagName);
      wrapper.className = `${Translator.KISS_CLASS.warpper} notranslate`;

      const inner = document.createElement(transTag);
      inner.lang = toLang;
      inner.className = `${Translator.KISS_CLASS.inner} ${this.#textClass[textStyle] || ""}`;
      if (textExtStyle?.trim()) {
        inner.style.cssText = textExtStyle; // 附加内联样式
      }
      inner.appendChild(createLoadingSVG());

      // 将 <br> 作为 wrapper 的子节点，以便 toggleTranslationOnly 统一管理
      if (processedString.length > newlineLength) {
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
      const { trText: translatedText, isSame: isSameLang } =
        await this.#translateFetch(processedString, deLang, onStreamChunk);

      // 请求完成后，立刻注销多余的 RAF 定时监听器，防止内存泄漏
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }

      if (this.#runId !== currentRunId) {
        throw new Error("Request terminated");
      }

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

      this.#translationNodes.set(wrapper, {
        nodes,
        isHide: hideOrigin,
      });
      if (hideOrigin) {
        this.#withViewportAnchor(() => {
          this.#removeNodes(nodes, wrapper);
        });
      }

      // 附加样式
      this.#appendCssText(hostNode, selectStyle, "selectStyle");
      this.#appendCssText(parentNode, parentStyle, "parentStyle");
      this.#appendCssText(parentNode?.parentElement, grandStyle, "grandStyle");

      // 高亮词汇
      if (highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
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
      const errorText = this.#formatTranslateError(err);
      kissLog("translate group error: ", errorText);
      if (err?.message === "Request terminated") {
        this.#cleanupDirectTranslations(hostNode);
        return;
      }

      // 失败重试按钮
      try {
        const wrapper = hostNode.querySelector(
          `:scope > .${Translator.KISS_CLASS.warpper}:last-of-type`
        );
        if (wrapper) {
          const inner = wrapper.querySelector(
            `.${Translator.KISS_CLASS.inner}`
          );
          if (inner) {
            inner.textContent = "";
            const retryNode = this.#createRetryErrorNode(errorText, () => {
              this.#withViewportAnchor(() => {
                wrapper.remove();
              });
              this.#processedNodes.delete(hostNode);
              this.#translateNodeGroup(nodes, hostNode, deLang);
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
    this.#hoverBubbleRunId++;
    this.#hoverBubbleTarget = null;
    if (this.#hoverBubbleNode) {
      this.#hoverBubbleNode.remove();
      this.#hoverBubbleNode = null;
    }
  }

  // 气泡模式下翻译目标节点，处理请求竞态与错误边界
  async #translateHoverBubbleNode(node) {
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
      const { langDetector, skipLangs = [] } = this.#setting;
      if (fromLang === "auto") {
        deLang = await tryDetectLang(text, langDetector);
        if (
          deLang &&
          (toLang.slice(0, 2) === deLang.slice(0, 2) ||
            skipLangs.includes(deLang))
        ) {
          if (this.#hoverBubbleRunId === currentRunId) {
            this.#hideHoverBubble();
          }
          return;
        }
      }

      const { trText, isSame } = await this.#translateFetch(text, deLang);
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

        // 专业术语替换
        if (this.#combinedTermsRegex) {
          this.#combinedTermsRegex.lastIndex = 0;
          text = text.replace(this.#combinedTermsRegex, (...args) => {
            const groups = args.slice(1, -2);
            const matchedIndex = groups.findIndex(
              (group) => group !== undefined
            );
            const fullMatch = args[0];
            const termValue = this.#termValues[matchedIndex];

            return pushReplace(
              `<i class="${Translator.KISS_CLASS.term}" style="${termsStyle}">${termValue || fullMatch}</i>`
            );
          });
        }

        // 换行符替换
        text = text.replace(/\r?\n/g, () => pushReplace(`&#10;`));

        return escapeHTML(text);
      }

      // 元素节点
      if (node.nodeType === Node.ELEMENT_NODE) {
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

    const processedString = nodes.map(traverse).join("").trim();

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
  #translateFetch(text, deLang = "", onStreamChunk = null) {
    const { toLang, transStartHook } = this.#rule;
    const fromLang = deLang || this.#rule.fromLang;
    const rawApiSetting = { ...this.#apiSetting };

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

  // 清理节点下面所有译文dom
  #cleanupAllTranslations(root) {
    root
      .querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
      .forEach((el) => this.#removeTranslationElement(el));
  }

  // 清理子节点译文dom
  #cleanupDirectTranslations(node) {
    this.#findTranslationWrappers(node).forEach((el) => {
      this.#removeTranslationElement(el);
    });
  }

  #collectExistingTranslationNodes(wrapper) {
    const { transOrder = "original-first" } = this.#rule;
    const nodes = [];
    const isOriginalBefore = transOrder !== "translation-first";
    let current = isOriginalBefore
      ? wrapper.previousSibling
      : wrapper.nextSibling;

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
      const nodes = hasBackupNodes
        ? backupNodes
        : this.#collectExistingTranslationNodes(wrapper);
      this.#translationNodes.set(wrapper, {
        nodes,
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

  // 清理译文
  #removeTranslationElement(el) {
    this.#withViewportAnchor(() => {
      const parentElement = el.parentElement;
      this.#processedNodes.delete(parentElement);

      // 如果是仅显示译文模式，先恢复原文
      const { nodes, isHide } = this.#translationNodes.get(el) || {};
      if (isHide) {
        this.#restoreOriginal(el, nodes);
      }

      this.#translationNodes.delete(el);
      el.remove();

      // todo: 可能不应深度清除
      if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
        this.#removeHighlights(parentElement);
      }
      this.#removeBrTags(parentElement);
    });
  }

  // 恢复原文
  #restoreOriginal(el, nodes) {
    if (nodes) {
      const frag = document.createDocumentFragment();
      nodes.forEach((n) => frag.appendChild(n));
      const parent = el.parentElement;
      parent?.insertBefore(frag, el);
    }
  }

  // 移除多个节点
  #removeNodes(nodes, wrapper) {
    if (nodes && wrapper) {
      const backup = this.#getOrCreateTranslationBackup(wrapper);
      nodes.forEach((n) => backup.content.appendChild(n));
    } else if (nodes) {
      const frag = document.createDocumentFragment();
      nodes.forEach((n) => frag.appendChild(n));
    }
  }

  // 切换译文和双语显示
  #toggleTranslationOnly(node, transOnly) {
    const { transOrder = "original-first" } = this.#rule;
    this.#findTranslationWrappers(node).forEach((el) => {
      const br = el.querySelector(":scope > br");
      const space = el.querySelector(
        `:scope > span.${Translator.KISS_CLASS.space}`
      );
      const { nodes } = this.#translationNodes.get(el) || {};
      if (transOnly === "true") {
        // 双语变为仅译文
        this.#withViewportAnchor(() => {
          if (br) br.hidden = true;
          if (space) space.hidden = true;
          this.#removeNodes(nodes, el);
        });
        this.#translationNodes.set(el, { nodes, isHide: true });
      } else {
        // 仅译文变为双语
        this.#withViewportAnchor(() => {
          if (br) br.hidden = false;
          if (space) space.hidden = false;
          if (nodes && nodes.length) {
            const frag = document.createDocumentFragment();
            nodes.forEach((n) => frag.appendChild(n));
            const parent = el.parentElement;
            if (parent) {
              if (transOrder === "translation-first") {
                // 译文在上：原文节点应在 wrapper 之后
                el.after(frag);
              } else {
                // 原文在上：原文节点应在 wrapper 之前
                el.before(frag);
              }
            }
          }
        });
        this.#translationNodes.set(el, { nodes, isHide: false });
      }
    });
  }

  // 根据 transOrder 调整 wrapper 位置
  #adjustWrapperPosition(wrapper, nodes, transOrder) {
    if (!nodes || !nodes.length) return;

    // 获取第一个和最后一个原文节点的位置
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];

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
    this.#removeShadowRootListener();

    this.#io.disconnect();
    this.#mo.disconnect();
    this.#viewNodes.clear();
    this.#rootNodes.clear();
    this.#observedNodes = new WeakSet();
    this.#translationNodes = new WeakMap();
    this.#processedNodes = new WeakMap();
    this.#plainTextPreprocessingNodes = new WeakSet();
    this.#io = this.#createIntersectionObserver();
  }

  // 开启鼠标悬停翻译
  #enableMouseHover() {
    if (this.#mouseHoverEnabled) return;
    this.#mouseHoverEnabled = true;
    this.#setting.mouseHoverSetting.useMouseHover = true;

    document.addEventListener("mousemove", this.#boundMouseMoveHandler);
    const { mouseHoverKey = [], mouseHoverKey2 = [] } =
      this.#setting.mouseHoverSetting;
    if (mouseHoverKey.length === 0 && mouseHoverKey2.length === 0) {
      // mouseHoverKey = DEFAULT_MOUSEHOVER_KEY;
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
    this.#hideHoverBubble();

    document.removeEventListener("mousemove", this.#boundMouseMoveHandler);
    this.#removeKeydownHandler?.();
    this.#removeKeydownHandler2?.();
  }

  #enableTransOnlyRevert() {
    if (this.#transOnlyRevertEnabled) return;
    this.#transOnlyRevertEnabled = true;

    this.#boundTransOnlyMouseOver = (e) => {
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
    const { nodes } = data;
    this.#withViewportAnchor(() => {
      this.#restoreOriginal(wrapper, nodes);
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
    const { nodes } = data;
    this.#withViewportAnchor(() => {
      this.#removeNodes(nodes, wrapper);
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
