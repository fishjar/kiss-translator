import {
  APP_LCNAME,
  APP_CONSTS,
  OPT_STYLE_FUZZY,
  GLOBLA_RULE,
  DEFAULT_SETTING,
  // DEFAULT_MOUSEHOVER_KEY,
  OPT_STYLE_NONE,
  DEFAULT_API_SETTING,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
  OPT_SPLIT_PARAGRAPH_PUNCTUATION,
  OPT_SPLIT_PARAGRAPH_DISABLE,
  OPT_SPLIT_PARAGRAPH_TEXTLENGTH,
  MSG_INJECT_CSS,
} from "../config";
import { interpreter } from "./interpreter";
import { clearFetchPool } from "./pool";
import {
  debounce,
  scheduleIdle,
  genEventName,
  truncateWords,
  escapeHTML,
} from "./utils";
import { apiTranslate } from "../apis";
import { kissLog } from "./log";
import { clearAllBatchQueue } from "./batchQueue";
import { genTextClass } from "./style";
import { createLoadingSVG } from "./svg";
import { shortcutRegister } from "./shortcut";
import { tryDetectLang } from "./detect";
import { trustedTypesHelper } from "./trustedTypes";
import { injectJs, INJECTOR } from "../injectors";
import { injectInternalCss } from "./injector";
import { isExt } from "./client";
import { sendBgMsg } from "./msg";

/**
 * @class Translator
 * @description 翻译核心逻辑封装
 */
export class Translator {
  static displayCache = new WeakMap();
  static TAGS = {
    BREAK_LINE: new Set(["BR", "WBR"]),
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
    REPLACE: new Set([
      "ABBR",
      "CODE",
      "DFN",
      "IMG",
      "KBD",
      "OUTPUT",
      "SAMP",
      "SUB",
      "SUP",
      "SVG",
      "TIME",
      "VAR",
    ]),
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
      "S",
      "SMALL",
      "SPAN",
      "STRONG",
      "U",
    ]),
  };

  // 译文相关class
  static KISS_CLASS = {
    warpper: `${APP_LCNAME}-wrapper`,
    inner: `${APP_LCNAME}-inner`,
    term: `${APP_LCNAME}-term`,
    br: `${APP_LCNAME}-br`,
    highlight: `${APP_LCNAME}-highlight`,
  };

  // 内置跳过翻译文本
  // todo: 验证有效性
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

    // 10. 用户名 (例如 @username, @user.name, @user-name) - [已修改]
    /^@[\w.-]+$/,

    // 11. HTML 实体
    /^&\w+;$/,

    // 12. 中括号包裹的序号 (例如 [1], [99])
    /^\[\d+\]$/,

    // 13. 简单时间格式 (例如 12:30, 9:45:30) - [新增]
    /^\d{1,2}:\d{2}(:\d{2})?$/,

    // 14. 包含常见扩展名的文件名 (例如: document.pdf, image.jpeg)
    /^[^\s\\/:]+?\.[a-zA-Z0-9]{2,5}$/,

    // todo: 数字和特殊字符组成的字符串
  ];

  static DEFAULT_OPTIONS = DEFAULT_SETTING; // 默认配置
  static DEFAULT_RULE = GLOBLA_RULE; // 默认规则

  static isElement(el) {
    return el instanceof Element;
  }

  static isElementOrFragment(el) {
    return el instanceof Element || el instanceof DocumentFragment;
  }

  // 判断是否块级元素
  static isBlockNode(el) {
    if (!Translator.isElementOrFragment(el)) return false;

    if (el.attributes?.display?.value?.includes("inline")) return false;
    if (Translator.TAGS.INLINE.has(el.nodeName?.toUpperCase())) return false;
    if (Translator.TAGS.BLOCK.has(el.nodeName?.toUpperCase())) return true;

    if (Translator.displayCache.has(el)) {
      return Translator.displayCache.get(el);
    }

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
  static KISS_IGNORE_SELECTOR = `.${Translator.KISS_CLASS.warpper}, .kiss-caption-container, .kiss-subtitle-controls
  #${APP_CONSTS.fabID}, .${APP_CONSTS.fabID}_warpper,
  #${APP_CONSTS.boxID}, .${APP_CONSTS.boxID}_warpper,
  #${APP_CONSTS.popupID}, .${APP_CONSTS.popupID}_warpper`;

  static BUILTIN_IGNORE_SELECTOR = `address, area, audio, br, canvas, 
  data, datalist, embed, head, iframe, input, noscript, map, 
  object, option, param, picture, progress, 
  select, script, style, track, textarea, template, 
  video, wbr, .notranslate, [contenteditable='true'], [translate='no']`;

  #setting; // 设置选项
  #rule; // 规则
  #isInitialized = false; // 初始化状态
  #isJsInjected = false; // 注入用户JS
  #isShadowRootJsInjected = false; //
  #mouseHoverEnabled = false; // 鼠标悬停翻译
  #enabled = false; // 全局默认状态
  #runId = 0; // 用于中止过期的异步请求
  #termValues = []; // 按顺序存储术语的替换值
  #combinedTermsRegex; // 专业术语正则表达式
  #combinedSkipsRegex; // 跳过文本正则表达式
  #placeholderRegex; // 恢复htnml正则表达式
  #translationTagName = APP_LCNAME; // 翻译容器的标签名
  #eventName = ""; // 通信事件名称
  #docInfo = {}; // 网页信息
  #glossary = {}; // AI词典
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

  #removeKeydownHandler; // 快捷键清理函数
  #hoveredNode = null; // 存储当前悬停的可翻译节点
  #boundMouseMoveHandler; // 鼠标事件
  #boundKeyDownHandler; // 键盘事件
  #windowMessageHandler = null;

  #debouncedFindShadowRoot = null;

  #io; // IntersectionObserver
  #mo; // MutationObserver
  #dmm; // DebounceMouseMover

  #rescanQueue = new Set(); // “脏容器”队列
  #isQueueProcessing = false; // 队列处理状态标志

  // 忽略元素
  get #ignoreSelector() {
    if (this.#rule.isPlainText) {
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

  // 占位符
  get #placeholder() {
    const [startDelimiter, endDelimiter] =
      this.#apiSetting.placeholder.split(" ");
    return {
      startDelimiter,
      endDelimiter,
      tagName: this.#apiSetting.placetag,
    };
  }

  constructor({ rule = {}, setting = {}, favWords = [] }) {
    this.#setting = { ...Translator.DEFAULT_OPTIONS, ...setting };
    this.#rule = { ...Translator.DEFAULT_RULE, ...rule, isPlainText: false };
    this.#favWords = favWords;
    this.#apisMap = new Map(
      this.#setting.transApis.map((api) => [api.apiSlug, api])
    );

    this.#eventName = genEventName();
    this.#docInfo = {
      title: truncateWords(document.title),
      description: this.#getDocDescription(),
    };
    this.#combinedSkipsRegex = new RegExp(
      Translator.BUILTIN_SKIP_PATTERNS.map((r) => `(${r.source})`).join("|")
    );
    this.#placeholderRegex = this.#createPlaceholderRegex();
    this.#parseTerms(this.#rule.terms);
    this.#parseAITerms(this.#rule.aiTerms);
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
      document
        .querySelectorAll("pre")
        .forEach(
          (pre) =>
            (pre.innerHTML = pre.innerHTML?.replace(
              /(?:\r\n|\r|\n)/g,
              "<br />"
            ))
        );
    }

    // 查找根节点并扫描
    document
      .querySelectorAll(this.#rule.rootsSelector || "body")
      .forEach((root) => {
        this.#startObserveRoot(root);
      });

    if (this.#rule.hasShadowroot === "true") {
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

  #createPlaceholderRegex() {
    const escapedStart = Translator.escapeRegex(
      this.#placeholder.startDelimiter
    );
    const escapedEnd = Translator.escapeRegex(this.#placeholder.endDelimiter);
    const patternString = `(${escapedStart}\\d+${escapedEnd}|<\\/?\\w+\\d+>)`;
    const flags = "g";
    return new RegExp(patternString, flags);
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

  #parseAITerms(termsString) {
    if (!termsString || typeof termsString !== "string") return;

    try {
      this.#glossary = Object.fromEntries(
        termsString
          .split(/\n|;/)
          .map((line) => {
            const [k = "", v = ""] = line.split(",").map((s) => s.trim());
            return [k, v];
          })
          .filter(([k]) => k)
      );
    } catch (err) {
      kissLog("parse aiterms", err);
    }
  }

  // todo: 利用AI总结
  #getDocDescription() {
    try {
      const meta = document.querySelector('meta[name="description"]');
      const description = meta?.getAttribute("content") || "";
      return truncateWords(description);
    } catch (err) {
      kissLog("get description", err);
    }
    return "";
  }

  // 监控翻译单元的可见性
  #createIntersectionObserver() {
    const { transInterval, rootMargin = 500 } = this.#setting;

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

      const { mouseHoverKey } = this.#setting.mouseHoverSetting;
      if (mouseHoverKey.length === 0 && !this.#isInitialized) {
        this.#init();
      }
      if (mouseHoverKey.length === 0 && foundNode) {
        this.#toggleTargetNode(foundNode);
      }
    }, 100);
  }

  // 跟踪鼠标下的可翻译节点
  #handleMouseMove(event) {
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
    if (this.#processedNodes.has(targetNode)) {
      this.#cleanupDirectTranslations(targetNode);
    } else {
      this.#processNode(targetNode);
    }
  }

  // 找页面所有 ShadowRoot
  #findAllShadowRoots(root = document.body, results = new Set()) {
    // const start = performance.now();
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.shadowRoot) {
          results.add(node.shadowRoot);
          this.#findAllShadowRoots(node.shadowRoot, results);
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
      if (Translator.isBlockNode(current) || this.#observedNodes.has(current)) {
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

    if (this.#rule.highlightWords === OPT_HIGHLIGHT_WORDS_BEFORETRANS) {
      this.#highlightWordsDeeply(node);
    }

    if (
      !this.#observedNodes.has(node) &&
      this.#enabled &&
      this.#setting.transAllnow
    ) {
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

    if (!hasText && rootNode.children.length === 1) {
      this.#scanNode(rootNode.children[0]);
      return;
    }

    const hasBlock = Translator.hasBlockNode(rootNode);

    if (hasText || !hasBlock) {
      this.#startObserveNode(rootNode);
    }

    if (hasBlock) {
      for (const child of rootNode.children) {
        const isBlock = Translator.isBlockNode(child);
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
    if (node.matches(this.#rule.keepSelector)) return false;

    if (
      Translator.TAGS.BREAK_LINE.has(node.nodeName?.toUpperCase()) ||
      node.matches?.(this.#ignoreSelector) ||
      node.nodeName?.toLowerCase() === this.#translationTagName
    ) {
      return true;
    }

    if (this.#rule.autoScan && Translator.isBlockNode(node)) {
      return true;
    }

    if (
      !this.#rule.autoScan &&
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

      if (processedString.length > newlineLength) {
        const br = document.createElement("br");
        br.hidden = hideOrigin;
        wrapper.appendChild(br);
      }

      const inner = document.createElement(transTag);
      inner.className = `${Translator.KISS_CLASS.inner} ${this.#textClass[textStyle] || ""}`;
      if (textExtStyle?.trim()) {
        inner.style.cssText = textExtStyle; // 附加内联样式
      }
      inner.appendChild(createLoadingSVG());
      wrapper.appendChild(inner);
      nodes[nodes.length - 1].after(wrapper);

      const currentRunId = this.#runId;
      const { trText: translatedText, isSame: isSameLang } =
        await this.#translateFetch(processedString, deLang);
      if (this.#runId !== currentRunId) {
        throw new Error("Request terminated");
      }

      if (!translatedText || isSameLang) {
        wrapper.remove();
        return;
      }

      const htmlString = this.#restoreFromTranslation(
        translatedText,
        placeholderMap
      );
      const trustedHTML = trustedTypesHelper.createHTML(htmlString);

      // const parser = new DOMParser();
      // const doc = parser.parseFromString(trustedHTML, "text/html");
      // const innerElement = doc.body.firstChild;
      // inner.replaceChildren(innerElement);

      inner.innerHTML = trustedHTML;

      this.#translationNodes.set(wrapper, {
        nodes,
        isHide: hideOrigin,
      });
      if (hideOrigin) {
        this.#removeNodes(nodes);
      }

      // 附加样式
      if (selectStyle && hostNode.style) {
        hostNode.style.cssText += selectStyle;
      }
      if (parentStyle && parentNode && parentNode.style) {
        parentNode.style.cssText += parentStyle;
      }
      if (grandStyle && parentNode && parentNode.parentElement) {
        parentNode.parentElement.style.cssText += grandStyle;
      }

      // 高亮词汇
      if (highlightWords === OPT_HIGHLIGHT_WORDS_AFTERTRANS) {
        nodes.forEach((node) => this.#highlightWordsDeeply(node));
      }

      // 翻译完成钩子函数
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
      // inner.textContent = `[失败]...`;
      // todo: 失败重试按钮
      kissLog("translate group error: ", err.message);
      this.#cleanupDirectTranslations(hostNode);
    }
  }

  // 处理节点转为翻译字符串
  #serializeForTranslation(nodes, termsStyle) {
    let replaceCounter = 0; // {{n}}
    let wrapCounter = 0; // <tagn>
    const placeholderMap = new Map();
    const { startDelimiter, endDelimiter } = this.#placeholder;

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

        return escapeHTML(text);
      }

      // 元素节点
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (
          (this.#rule.hasRichText === "true" &&
            Translator.TAGS.REPLACE.has(node.tagName)) ||
          node.matches(this.#rule.keepSelector) ||
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
          innerContent += traverse(child);
        });

        if (
          this.#rule.hasRichText === "true" &&
          Translator.TAGS.WARP.has(node.tagName?.toUpperCase())
        ) {
          wrapCounter++;
          const startPlaceholder = `<${this.#placeholder.tagName}${wrapCounter}>`;
          const endPlaceholder = `</${this.#placeholder.tagName}${wrapCounter}>`;
          placeholderMap.set(startPlaceholder, buildOpeningTag(node));
          placeholderMap.set(endPlaceholder, `</${node.localName}>`);
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

  // 组装恢复html字符串
  #restoreFromTranslation(translatedText, placeholderMap) {
    if (!placeholderMap.size) {
      return translatedText;
    }

    if (!translatedText) return "";

    return translatedText.replace(
      this.#placeholderRegex,
      (match) => placeholderMap.get(match) || match
    );
  }

  // 发起翻译请求
  #translateFetch(text, deLang = "") {
    const { toLang, transStartHook } = this.#rule;
    const fromLang = deLang || this.#rule.fromLang;
    const apiSetting = { ...this.#apiSetting };
    const docInfo = { ...this.#docInfo };
    const glossary = { ...this.#glossary };
    const apisMap = this.#apisMap;

    const args = {
      text,
      fromLang,
      toLang,
      apiSetting,
      docInfo,
      glossary,
    };

    // 翻译开始钩子函数
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

  // 清理译文
  #removeTranslationElement(el) {
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
  #removeNodes(nodes) {
    if (nodes) {
      const frag = document.createDocumentFragment();
      nodes.forEach((n) => frag.appendChild(n));
    }
  }

  // 切换译文和双语显示
  #toggleTranslationOnly(node, transOnly) {
    this.#findTranslationWrappers(node).forEach((el) => {
      const br = el.querySelector(":scope > br");
      const { nodes } = this.#translationNodes.get(el) || {};
      if (transOnly === "true") {
        // 双语变为仅译文
        if (br) br.hidden = true;
        this.#removeNodes(nodes);
        this.#translationNodes.set(el, { nodes, isHide: true });
      } else {
        // 仅译文变为双语
        if (br) br.hidden = false;
        this.#restoreOriginal(el, nodes);
        this.#translationNodes.set(el, { nodes, isHide: false });
      }
    });
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

    const { apiSlug, fromLang, toLang, hasRichText, textStyle, transOnly } =
      this.#rule;

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
  }

  // 开启鼠标悬停翻译
  #enableMouseHover() {
    if (this.#mouseHoverEnabled) return;
    this.#mouseHoverEnabled = true;
    this.#setting.mouseHoverSetting.useMouseHover = true;

    document.addEventListener("mousemove", this.#boundMouseMoveHandler);
    const { mouseHoverKey } = this.#setting.mouseHoverSetting;
    if (mouseHoverKey.length === 0) {
      // mouseHoverKey = DEFAULT_MOUSEHOVER_KEY;
      return;
    }
    this.#removeKeydownHandler = shortcutRegister(
      mouseHoverKey,
      this.#boundKeyDownHandler
    );
  }

  // 禁用鼠标悬停翻译
  #disableMouseHover() {
    if (!this.#mouseHoverEnabled) return;
    this.#mouseHoverEnabled = false;
    this.#setting.mouseHoverSetting.useMouseHover = false;

    document.removeEventListener("mousemove", this.#boundMouseMoveHandler);
    this.#removeKeydownHandler?.();
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
        const docInfo = { ...this.#docInfo };
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
            docInfo,
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
      if (this.#setting.transAllnow) {
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
  }

  // 翻译页面标题
  async #translateTitle() {
    const title = document.title;
    this.#docInfo.title = truncateWords(title);
    if (!title) return;

    try {
      const deLang = await tryDetectLang(title);
      const { trText } = await this.#translateFetch(title, deLang);
      document.title = trText || title;
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
    if (this.#docInfo.title) {
      document.title = this.#docInfo.title;
    }
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
    this.#removeInjector();
    this.#isInitialized = false;
  }

  // 更新规则
  updateRule(newRule) {
    let hasChanged = false;
    let needsRescan = false;
    for (const key in newRule) {
      if (
        Object.prototype.hasOwnProperty.call(this.#rule, key) &&
        this.#rule[key] !== newRule[key]
      ) {
        this.#rule[key] = newRule[key];
        if (
          key === "autoScan" ||
          key === "hasShadowroot" ||
          key === "isPlainText"
        ) {
          needsRescan = true;
        } else {
          hasChanged = true;
        }
      }
    }

    if (needsRescan || (this.#enabled && this.#setting.transAllnow)) {
      this.rescan();
      return;
    }

    if (hasChanged) {
      this.#reIOViewNodes();
    }
  }

  get setting() {
    return { ...this.#setting };
  }

  get rule() {
    return { ...this.#rule };
  }

  get docInfo() {
    return { ...this.#docInfo };
  }

  get eventName() {
    return this.#eventName;
  }
}
