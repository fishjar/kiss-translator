import { AsrTaskPanel } from "./asr/AsrTaskPanel";
import { isApiConfigured } from "../config/serviceSelection";
import { supportsApiCapability } from "../config/serviceSelection";
import { logger } from "../libs/log.js";
import { downloadBlobFile } from "../libs/utils.js";
import { buildBilingualVtt, buildTranslationOnlyVtt } from "./vtt.js";
import { getSettingWithDefault, saveEdit } from "../libs/storage.js";
import { openOptionsPage } from "../libs/navigation.js";
import { apiSummarizeVideo, getVideoSummarySignature } from "../apis/index.js";
import { DEFAULT_SUMMARY_PROMPT } from "../config/prompt.js";
import { OPT_TRANS_BUILTINAI } from "../config/api.js";
import { STOKEY_SETTING } from "../config/storage.js";
import { DEFAULT_SUBTITLE_SETTING } from "../config/setting.js";
import { MSG_BUILTINAI_PROGRESS } from "../config/msg.js";
import { browser } from "../libs/browser.js";
import { trustedTypesHelper } from "../libs/trustedTypes.js";
import {
  addWordHoverStyles,
  WordTooltipController,
  wrapWordsWithSpans,
} from "./wordHover.js";
import { createFavoriteButton } from "./favoriteWords.js";

/**
 * YouTube 字幕列表管理器
 *
 * 主要职责与功能：
 * 1. 负责在 YouTube 原生播放器的右侧/下方“次要推荐内容栏”中动态挂载和管理一个自适应暗黑/浅色主题的双语字幕滚动列表面板。
 * 2. 监听视频播放器的 timeupdate，在 ASR/手动字幕播放时计算高亮并自适应居中滚动对齐（基于 O(log N) 二分搜索）。
 * 3. 拦截鼠标 hover/划词事件广播，实现增量生词本收录功能。
 * 4. 支持将收录的生词以 JSON、CSV（带 Excel BOM 字符防乱码）、纯文本、Markdown 格式导出及下载。
 */
/**
 * 轻量且安全的 Markdown 转 DOM 渲染器。
 * 避免使用 innerHTML 字符串拼接，直接基于 DOM API 构建结构，确保兼容 YouTube Trusted Types 与 CSP 策略。
 *
 * @param {string} markdownText 待解析的 Markdown 文本
 * @param {HTMLElement} container 目标挂载容器
 */
export function renderMarkdownToElement(markdownText, container) {
  container.replaceChildren();
  if (!markdownText) return;

  const lines = markdownText.split("\n");
  let currentList = null;

  const processInline = (text, parentEl) => {
    // 处理 **加粗**、*斜体*、`代码`
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        strong.style.color = "var(--kt-text)";
        strong.style.fontWeight = "600";
        parentEl.appendChild(strong);
      } else if (
        part.startsWith("*") &&
        part.endsWith("*") &&
        part.length >= 2
      ) {
        const em = document.createElement("em");
        em.textContent = part.slice(1, -1);
        em.style.color = "var(--kt-subtext)";
        parentEl.appendChild(em);
      } else if (
        part.startsWith("`") &&
        part.endsWith("`") &&
        part.length >= 2
      ) {
        const code = document.createElement("code");
        code.textContent = part.slice(1, -1);
        code.style.cssText = `background: var(--kt-time-bg); color: var(--kt-primary); padding: 1px 4px; border-radius: 3px; font-size: 0.9em; font-family: monospace;`;
        parentEl.appendChild(code);
      } else if (part) {
        parentEl.appendChild(document.createTextNode(part));
      }
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      currentList = null;
      continue;
    }

    if (line.startsWith("#### ")) {
      currentList = null;
      const h4 = document.createElement("h5");
      h4.style.cssText = `margin: 12px 0 6px 0; font-size: 13px; font-weight: 600; color: var(--kt-text);`;
      processInline(line.slice(5), h4);
      container.appendChild(h4);
    } else if (line.startsWith("### ")) {
      currentList = null;
      const h3 = document.createElement("h4");
      h3.style.cssText = `margin: 14px 0 6px 0; font-size: 14px; font-weight: 600; color: var(--kt-primary); display: flex; align-items: center; gap: 6px;`;
      processInline(line.slice(4), h3);
      container.appendChild(h3);
    } else if (line.startsWith("## ")) {
      currentList = null;
      const h2 = document.createElement("h3");
      h2.style.cssText = `margin: 16px 0 8px 0; font-size: 15px; font-weight: 600; color: var(--kt-primary);`;
      processInline(line.slice(3), h2);
      container.appendChild(h2);
    } else if (line.startsWith("# ")) {
      currentList = null;
      const h1 = document.createElement("h2");
      h1.style.cssText = `margin: 18px 0 10px 0; font-size: 16px; font-weight: 700; color: var(--kt-text);`;
      processInline(line.slice(2), h1);
      container.appendChild(h1);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      if (!currentList || currentList.tagName !== "UL") {
        currentList = document.createElement("ul");
        currentList.style.cssText = `margin: 4px 0 8px 0; padding-left: 20px; list-style-type: disc;`;
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      li.style.cssText = `margin-bottom: 6px; font-size: 13px; line-height: 1.5; color: var(--kt-text);`;
      processInline(line.slice(2), li);
      currentList.appendChild(li);
    } else if (/^\d+\.\s/.test(line)) {
      if (!currentList || currentList.tagName !== "OL") {
        currentList = document.createElement("ol");
        currentList.style.cssText = `margin: 4px 0 8px 0; padding-left: 20px; list-style-type: decimal;`;
        container.appendChild(currentList);
      }
      const text = line.replace(/^\d+\.\s/, "");
      const li = document.createElement("li");
      li.style.cssText = `margin-bottom: 6px; font-size: 13px; line-height: 1.5; color: var(--kt-text);`;
      processInline(text, li);
      currentList.appendChild(li);
    } else {
      currentList = null;
      const p = document.createElement("p");
      p.style.cssText = `margin: 6px 0 8px 0; font-size: 13px; line-height: 1.5; color: var(--kt-text);`;
      processInline(line, p);
      container.appendChild(p);
    }
  }
}

const ensureSubtitleHeaderStyles = () => {
  if (document.getElementById("kiss-youtube-tab-header-styles")) return;
  const style = document.createElement("style");
  style.id = "kiss-youtube-tab-header-styles";
  style.textContent = `
    .kiss-youtube-tab-header::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
  `;
  document.head.appendChild(style);
};

export class YouTubeSubtitleList {
  /**
   * @param {HTMLVideoElement} videoElement YouTube 的原生视频播放器 DOM 节点
   */
  constructor(
    videoElement,
    i18n = (key, defaultText = key) => defaultText,
    {
      enableHoverLookup = false,
      autoFavWord = false,
      hoverLookupCloseDelay = 2,
      getSummaryConfig = null,
      getVideoMetadata = null,
      asrActions = null,
      retryCaptions = null,
      onClose = null,
    } = {}
  ) {
    this.videoEl = videoElement;
    this.i18n = i18n;
    this.enableHoverLookup = enableHoverLookup;
    this.autoFavWord = autoFavWord;
    this.getSummaryConfig = getSummaryConfig;
    this.getVideoMetadata = getVideoMetadata;
    this.asrActions = asrActions;
    this.retryCaptions = retryCaptions;
    this.onClose = onClose;

    // --- 数据源缓存 ---
    // 双语字幕主列表数组。结构：{ start: number, end: number, text: string, translation: string }
    this.bilingualSubtitles = [];
    this.rawSubtitleEvents = [];
    // 生词本收录数组。结构：{ word, phonetic, definition, examples: [], timestamp }
    this.vocabulary = [];
    this._summaryCache = new Map();
    this._isSummarizing = false;
    this._currentSummaryText = "";

    // --- DOM 节点引用缓存 ---
    this.container = null; // 右侧字幕/生词面板的最外层根容器节点
    this.subtitleTabEl = null; // 字幕 Tab 按钮引用，用于随处理进度刷新标题文案
    this.vocabularyTabEl = null; // 生词本 Tab 按钮引用
    this.summaryTabEl = null; // 视频总结 Tab 按钮引用
    this.subtitleListEl = null; // 字幕列表面板的 DOM 引用
    this.vocabularyListEl = null; // 生词本面板的 DOM 引用
    this.summaryListEl = null; // 视频总结面板的 DOM 引用
    this.summaryScrollContainer = null; // 视频总结独立滚动视口
    this.summaryActionBar = null; // 视频总结操作工具条
    this.summaryRegenBtn = null; // 重新生成按钮
    this.summaryCopyBtn = null; // 复制总结按钮
    this.downloadBtn = null; // 下载字幕 (VTT) 按钮
    this.downloadTranslationBtn = null; // 下载译文字幕 (VTT) 按钮
    this.downloadRawBtn = null; // 下载源数据 (JSON) 按钮
    this.subtitleScrollContainer = null; // 字幕列表的专用独立纵向滚动容器
    this._cachedSubtitleItems = []; // 缓存每一个字幕行 li 节点引用的数组，避免在滚动同步高亮时高频执行 querySelector 带来的重排 (Reflow) 损耗，提升滚动性能

    // --- 内置 AI 模型下载与模型快捷切换状态 ---
    this._downloadProgress = { loaded: 0, total: 0, percent: 0 };
    this._downloadStalledTimer = null;
    this._downloadLastLoaded = 0;
    this._downloadStalled = false;
    this._modelSwitcherPopup = null;
    this._downloadProgressCard = null;
    this._downloadProgressBar = null;
    this._downloadProgressText = null;
    this._downloadStalledTip = null;
    this._selectedSummaryApiSlug = null;

    this._onBgMessage = (message) => {
      if (message?.action === MSG_BUILTINAI_PROGRESS) {
        this._handleBuiltinAiProgress(message.args);
      }
    };
    if (browser?.runtime?.onMessage?.addListener) {
      try {
        browser.runtime.onMessage.addListener(this._onBgMessage);
      } catch (_) {}
    }

    // --- 状态管理 ---
    this.subtitleProgress = 0; // 当前字幕断句/处理进度百分比，用于显示在“双语字幕”Tab 后
    this.loopAutoScroll = null; // 自动滚动的定时器 ID
    this.activeTab = "subtitles"; // 当前激活的 Tab: 'subtitles'、'vocabulary' 或 'summary'
    this._lastActiveIndex = -1; // 上一次高亮的字幕索引位置
    this._virtualHeights = []; // 虚拟列表每一行的缓存高度；未测量行先使用估算值，显示后再用真实高度回写
    this._virtualOffsets = [0]; // 前缀和偏移表，用于通过 scrollTop 快速定位应该渲染的字幕区间
    this._virtualStart = -1; // 当前已渲染窗口的起始字幕索引，避免 scroll 事件重复渲染同一段 DOM
    this._virtualEnd = -1; // 当前已渲染窗口的结束字幕索引（不包含该索引）
    this._virtualRenderRaf = null; // 虚拟列表渲染的 requestAnimationFrame ID，用于把高频滚动合并到下一帧
    this._virtualRenderForce = false; // 是否强制重建当前虚拟窗口；数据或高度变化时需要跳过区间相同的短路判断
    this._estimatedItemHeight = 76; // 字幕行在真实测量前使用的默认高度，保证长列表初始滚动条长度稳定
    this._subtitleItemGap = 4; // li 的 margin-bottom 需要计入虚拟高度，否则偏移量会随行数累积误差
    this._virtualTopPadding = 16; // 模拟原 ul 顶部 padding，保持虚拟化前后的视觉留白一致
    this._virtualBottomPadding = 16; // 模拟原 ul 底部 padding，避免最后一行贴住滚动容器底部
    this._virtualOverscan = 8; // 视口上下额外预渲染的行数，减少快速滚动时的空白闪烁
    this._pendingCenterIndex = -1; // 跳转到未测量高度的行后，等真实高度回写再补一次居中
    this._pendingSubtitleTabScrollIndex = -1; // 字幕 Tab 隐藏期间收到跳转请求时，延后到 Tab 恢复可见后再滚动到目标行
    this._eventListenersAttached = false;
    this._vocabularyDirty = false; // 惰性重绘标志位：若在生词 Tab 隐藏时收录了生词，先置为 true。当用户切换到生词 Tab 时再按需重绘 DOM，避免隐藏 DOM 的无效绘制开销
    this._chunkRenderCancel = null; // 记录当前分块渲染流程的取消回调函数，用于在重置或卸载时随时中断异步渲染流水线
    this._playerResizeObserver = null; // 监听播放器尺寸变化，使右侧字幕列表高度与播放器高度保持一致
    this._playerSizeListenerAttached = false;
    this._wordTooltipController = null; // 右侧列表英文单词 hover 查词控制器

    // --- 交互事件句柄绑定 ---
    this.handleWordAdded = this.handleWordAdded.bind(this);
    this.handleJumpMessage = this.handleJumpMessage.bind(this);
    this.handleSubtitleScroll = this.handleSubtitleScroll.bind(this);
    this.handleContainerMouseEnter = this.handleContainerMouseEnter.bind(this);
    this.handleContainerMouseLeave = this.handleContainerMouseLeave.bind(this);
    this.handleVideoEnded = this.handleVideoEnded.bind(this);
    this.handleVideoPause = this.handleVideoPause.bind(this);
    this.handleVideoPlay = this.handleVideoPlay.bind(this);
    this.handleWindowResize = this.handleWindowResize.bind(this);
    // 监听在视频字幕上 hover 或划词翻译触发后，弹窗模块向外广播的自定义 "kiss-add-word" 事件
    document.addEventListener("kiss-add-word", this.handleWordAdded);

    // 监听来自扩展配置选项页面等第三方发送的消息，用以点击生词时同步跳转视频进度
    window.addEventListener("message", this.handleJumpMessage);

    if (this.enableHoverLookup) {
      addWordHoverStyles();
      this._wordTooltipController = new WordTooltipController({
        getVideoContainer: () => this._getPlayerElement(),
        getTimestamp: () => this.videoEl.currentTime * 1000,
        autoFavWord: this.autoFavWord,
        closeDelay: hoverLookupCloseDelay,
        i18n: this.i18n,
      });
    }
  }

  /**
   * 响应外部页面发送的跳转消息，例如从生词本链接跳回视频对应时间点。
   * 使用具名 handler 是为了 destroy 时可以准确 removeEventListener，避免匿名函数残留。
   */
  handleJumpMessage(event) {
    if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
      this.jumpToTime(event.data.time);
    }
  }

  /**
   * 字幕滚动容器发生滚动时，仅调度下一帧虚拟渲染。
   * 实际 DOM 重建会被 _scheduleVirtualRender 合并，避免滚动过程中每个事件都同步改 DOM。
   */
  handleSubtitleScroll() {
    if (!this._wordTooltipController?.isPanelInteractionActive)
      this._wordTooltipController?.clearHoverState();
    this._scheduleVirtualRender();
  }

  /**
   * 鼠标进入侧栏时暂停自动跟随，方便用户手动浏览或选择字幕文本。
   */
  handleContainerMouseEnter() {
    this.turnOffAutoSub();
  }

  /**
   * 鼠标离开侧栏后恢复自动跟随视频进度。
   */
  handleContainerMouseLeave() {
    this.turnOnAutoSub();
  }

  /**
   * 视频播放结束时关闭自动滚动定时器，避免无意义轮询。
   */
  handleVideoEnded() {
    this.turnOffAutoSub();
  }

  /**
   * 视频暂停时关闭自动滚动定时器；恢复播放时再由 play 事件重新开启。
   */
  handleVideoPause() {
    this.turnOffAutoSub();
  }

  /**
   * 视频开始播放时恢复字幕自动跟随。
   */
  handleVideoPlay() {
    this.turnOnAutoSub();
  }

  handleWindowResize() {
    this._mountAsrContainer();
    this._syncContainerHeightToPlayer();
  }

  // ==================================================================================
  // 公有 API: 挂载初始化与数据响应机制
  // ==================================================================================

  /**
   * 初始化字幕面板并启动首次渲染与事件挂载
   * @param {Array} subtitles 初始格式化完毕的字幕数组
   */
  initialize(subtitles, rawSubtitleEvents = [], progressed = 100) {
    this.bilingualSubtitles = subtitles || [];
    this.rawSubtitleEvents = rawSubtitleEvents || [];
    this.subtitleProgress = this._normalizeProgress(progressed);
    if (this.bilingualSubtitles.length > 0 || this.asrActions) {
      this.createSubtitleList();
      this.setupEventListeners();
    }
    this._updateDownloadButtonsState();
  }

  /**
   * 外部更新数据源接口（如：AI 异步分块翻译追加完毕，或者切换了字幕语种）
   * 对面板应用 Diff 增量更新算法以最小化 DOM 操作代价。
   * @param {Array} subtitles 标准双语字幕数组
   */
  setBilingualSubtitles(subtitles, progressed = this.subtitleProgress) {
    this.bilingualSubtitles = subtitles || [];
    this.subtitleProgress = this._normalizeProgress(progressed);
    this._updateSubtitleTabLabel();
    this.updateCaptionState(this.captionState);
    this._updateDownloadButtonsState();

    if (this.subtitleListEl) {
      // 若列表面板已处于挂载状态，尝试执行增量 Diff 挂载
      this.updateBilingualSubtitles();
    } else if (this.bilingualSubtitles.length > 0) {
      // 首次挂载
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 异步更新原生字幕事件流数据，并刷新导出按钮状态
   * @param {Array} events YouTube timedtext 原始事件流数组
   */
  updateRawSubtitleEvents(events) {
    this.rawSubtitleEvents = events || [];
    this._updateDownloadButtonsState();
  }

  /**
   * 将外部传入的处理进度规整为 0-100 的整数百分比。
   *
   * @param {number} progressed 字幕处理进度百分比。
   * @returns {number} 可直接展示的进度百分比。
   */
  _normalizeProgress(progressed) {
    const progress = Number(progressed);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  _t(key, fallback) {
    return this.i18n(key, fallback);
  }

  /**
   * 刷新字幕 Tab 标题，在“双语字幕”后显示当前按需断句处理进度。
   *
   * @returns {void}
   */
  _updateSubtitleTabLabel() {
    if (!this.subtitleTabEl) return;
    this.subtitleTabEl.textContent = `${this._t(
      "bilingual_subtitles",
      "双语字幕"
    )} [${this.subtitleProgress}%]`;
  }

  /**
   * 销毁器 - 全面解绑事件监听、注销定时器、强行中断进行中的异步分块渲染并清理 DOM 节点引用以防止内存泄漏
   */
  destroy() {
    this._shortsResizeCleanup?.();
    this._shortsResizeHandle?.remove();
    this._shortsResizeHandle = null;
    this.asrPanel?.destroy();
    this.asrPanel = null;
    this.turnOffAutoSub();
    this._cancelChunkRender();
    this._cancelVirtualRender();
    this._removeEventListeners();
    this._sidebarMountObserver?.disconnect();
    this._sidebarMountObserver = null;
    this._playerResizeObserver?.disconnect();
    this._playerResizeObserver = null;
    window.removeEventListener("resize", this.handleWindowResize);
    document.removeEventListener(
      "fullscreenchange",
      this._asrFullscreenHandler
    );
    this._playerSizeListenerAttached = false;
    this._wordTooltipController?.destroy();
    this._wordTooltipController = null;
    document.removeEventListener("kiss-add-word", this.handleWordAdded);
    window.removeEventListener("message", this.handleJumpMessage);
    if (this._onBgMessage && browser?.runtime?.onMessage?.removeListener) {
      try {
        browser.runtime.onMessage.removeListener(this._onBgMessage);
      } catch (_) {}
    }
    this._clearDownloadStalledTimer();
    if (this._modelSwitcherPopup) {
      this._modelSwitcherPopup.remove();
      this._modelSwitcherPopup = null;
    }
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.subtitleTabEl = null;
    this.vocabularyTabEl = null;
    this.summaryTabEl = null;
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.summaryListEl = null;
    this.summaryScrollContainer = null;
    this.summaryActionBar = null;
    this.summaryRegenBtn = null;
    this.summaryCopyBtn = null;
    this.downloadBtn = null;
    this.downloadTranslationBtn = null;
    this.downloadRawBtn = null;
    this.subtitleListUl = null;
    this._summaryCache?.clear();
    this.bilingualSubtitles = [];
    this.rawSubtitleEvents = [];
    this._cachedSubtitleItems = [];
    this._virtualHeights = [];
    this._virtualOffsets = [0];
    this._pendingCenterIndex = -1;
    this._pendingSubtitleTabScrollIndex = -1;
    this.subtitleProgress = 0;
    this.vocabulary = [];
  }

  // ==================================================================================
  // Chunk / Virtual Rendering: 分块渲染兼容入口与虚拟列表工具方法
  // ==================================================================================

  /**
   * 中断正在执行中的空闲分块渲染任务
   */
  _cancelChunkRender() {
    if (this._chunkRenderCancel) {
      this._chunkRenderCancel();
      this._chunkRenderCancel = null;
    }
  }

  /**
   * 利用 requestIdleCallback API（在浏览器主线程空闲期间执行低优先级任务），
   * 对于不支持该 API 的旧版浏览器降级为 setTimeout 零延迟执行。
   */
  _scheduleIdle(callback) {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(callback, { timeout: 100 });
      this._chunkRenderCancel = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(callback, 0);
      this._chunkRenderCancel = () => clearTimeout(id);
    }
  }

  /**
   * 核心渲染优化算法：虚拟化与分块渲染字幕列表。
   *
   * ASR 自动字幕往往拥有数千行数据，如果一次性渲染几千个复杂的 li 节点，会导致浏览器主线程长任务 (Long Task) 爆表，
   * 页面出现明显卡顿甚至失去响应。虚拟化后仅初始化虚拟列表状态，并按需渲染当前视口附近的字幕行，保障了用户交互的平滑顺畅。
   *
   * @param {HTMLUListElement} ul - 字幕列表的 ul 元素
   */
  _renderSubtitlesInChunks(ul) {
    this.subtitleListUl = ul;
    this._resetVirtualMetrics();
    this._scheduleVirtualRender(true);
  }

  /**
   * 重置虚拟列表的高度和窗口缓存。
   * @param {{ preserveHeights?: boolean }} options preserveHeights 为 true 时尽量沿用旧高度，
   * 用于翻译文本增量更新后保持滚动位置稳定；全量重建时则重新回到估算高度。
   */
  _resetVirtualMetrics({ preserveHeights = false } = {}) {
    const previousHeights = preserveHeights ? this._virtualHeights : [];

    this._cachedSubtitleItems = [];
    this._virtualStart = -1;
    this._virtualEnd = -1;
    this._virtualHeights = this.bilingualSubtitles.map(
      (_, index) => previousHeights[index] || this._estimatedItemHeight
    );
    this._rebuildVirtualOffsets();
  }

  /**
   * 根据每行高度缓存重建前缀和偏移表，并同步 ul 的总高度。
   * 虚拟列表只渲染可见 DOM，但滚动条需要完整列表高度来保持原有滚动体验。
   */
  _rebuildVirtualOffsets() {
    const offsets = [0];
    let totalHeight = 0;

    for (let i = 0; i < this._virtualHeights.length; i++) {
      totalHeight += this._virtualHeights[i] || this._estimatedItemHeight;
      offsets.push(totalHeight);
    }

    this._virtualOffsets = offsets;
    if (this.subtitleListUl) {
      this.subtitleListUl.style.height = `${totalHeight + this._virtualTopPadding + this._virtualBottomPadding}px`;
    }
  }

  /**
   * 调度虚拟列表渲染到下一帧执行。
   * 多次滚动或数据更新只保留一个 RAF；force 会在合并后继续保留，确保下一帧跳过窗口相同的短路逻辑。
   * @param {boolean} force 是否强制重建当前可见窗口
   */
  _scheduleVirtualRender(force = false) {
    this._virtualRenderForce = this._virtualRenderForce || force;
    if (this._virtualRenderRaf) return;

    const schedule =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 16);

    this._virtualRenderRaf = schedule(() => {
      this._virtualRenderRaf = null;
      const shouldForce = this._virtualRenderForce;
      this._virtualRenderForce = false;
      this._renderVirtualSubtitles(shouldForce);
    });
  }

  /**
   * 取消尚未执行的虚拟渲染任务。
   * 组件销毁或数据源切换时需要清理，防止 RAF 回调在 DOM 被移除后继续访问旧节点。
   */
  _cancelVirtualRender() {
    if (!this._virtualRenderRaf) return;

    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this._virtualRenderRaf);
    } else {
      clearTimeout(this._virtualRenderRaf);
    }
    this._virtualRenderRaf = null;
    this._virtualRenderForce = false;
  }

  /**
   * 判断字幕列表当前是否处于可见且可测量状态。
   * 虚拟列表依赖 offsetHeight / clientHeight 计算行高和偏移量；当字幕 Tab 被 display:none 隐藏时，
   * 浏览器会把子树元素的布局尺寸读成 0，此时如果回写高度缓存，会污染后续滚动定位。
   * @returns {boolean} 当前字幕 Tab 是否可以安全执行 DOM 测量和滚动计算
   */
  _isSubtitleTabVisible() {
    return (
      this.activeTab === "subtitles" &&
      this.subtitleListEl &&
      this.subtitleScrollContainer &&
      this.subtitleListEl.style.display !== "none" &&
      this.subtitleListEl.getClientRects().length > 0
    );
  }

  /**
   * 通过偏移表二分查找某个 scrollTop 所在的字幕索引。
   * @param {number} offset 滚动容器内相对虚拟列表顶部的像素偏移
   * @returns {number} 与该偏移最接近的字幕索引；空列表返回 -1
   */
  _findIndexByOffset(offset) {
    const length = this.bilingualSubtitles.length;
    if (length === 0) return -1;

    let left = 0;
    let right = length - 1;
    let best = 0;
    while (left <= right) {
      const mid = (left + right) >> 1;
      if (this._virtualOffsets[mid] <= offset) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return Math.min(best, length - 1);
  }

  /**
   * 计算当前滚动视口需要渲染的字幕索引区间。
   * 会在视口上下加入 overscan，保证快速滚动时目标行提前出现在 DOM 中。
   * @returns {{ start: number, end: number }} end 为不包含的结束索引
   */
  _getVirtualRange() {
    const container = this.subtitleScrollContainer;
    const length = this.bilingualSubtitles.length;
    if (!container || length === 0) {
      return { start: 0, end: 0 };
    }

    const viewportTop = Math.max(
      0,
      container.scrollTop - this._virtualTopPadding
    );
    const viewportBottom = viewportTop + container.clientHeight;
    const start = Math.max(
      0,
      this._findIndexByOffset(viewportTop) - this._virtualOverscan
    );
    const end = Math.min(
      length,
      this._findIndexByOffset(viewportBottom) + this._virtualOverscan + 1
    );

    return { start, end };
  }

  /**
   * 根据当前滚动位置重建可见字幕 DOM。
   * @param {boolean} force 为 false 且可见区间未变化时直接返回；为 true 时强制重建以反映数据或高度变化。
   */
  _renderVirtualSubtitles(force = false) {
    if (!this.subtitleListUl || !this.subtitleScrollContainer) return;
    // 隐藏状态下只更新数据源，不重建和测量 DOM，避免 display:none 导致虚拟高度缓存被 0 值覆盖。
    if (!this._isSubtitleTabVisible()) return;

    const { start, end } = this._getVirtualRange();
    if (!force && start === this._virtualStart && end === this._virtualEnd) {
      return;
    }

    this._virtualStart = start;
    this._virtualEnd = end;
    this._cachedSubtitleItems = [];

    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const li = this._createSubtitleListItem(this.bilingualSubtitles[i], i);
      li.style.position = "absolute";
      li.style.left = "0";
      li.style.right = "0";
      li.style.top = `${this._virtualTopPadding + this._virtualOffsets[i]}px`;
      li.style.contain = "layout paint style";

      if (i === this._lastActiveIndex) {
        li.style.opacity = 1;
        li.classList.add("active-subtitle");
      }

      this._cachedSubtitleItems[i] = li;
      fragment.appendChild(li);
    }

    this.subtitleListUl.replaceChildren(fragment);
    this._measureVisibleSubtitleItems();
  }

  /**
   * 测量当前可见字幕行的真实高度，并在高度变化后重建偏移表。
   * 只测量可见行，避免一次性创建/读取全部字幕 DOM；未显示过的行继续使用估算高度。
   */
  _measureVisibleSubtitleItems() {
    // 只在字幕 Tab 可见时测量真实行高；生词本 Tab 下的字幕列表尺寸不可作为布局依据。
    if (!this._isSubtitleTabVisible()) return;

    let changed = false;

    for (let i = this._virtualStart; i < this._virtualEnd; i++) {
      const item = this._cachedSubtitleItems[i];
      if (!item) continue;

      const measuredHeight = item.offsetHeight + this._subtitleItemGap;
      if (
        Number.isFinite(measuredHeight) &&
        Math.abs((this._virtualHeights[i] || 0) - measuredHeight) > 1
      ) {
        this._virtualHeights[i] = measuredHeight;
        changed = true;
      }
    }

    if (!changed) {
      this._pendingCenterIndex = -1;
      return;
    }

    // 仅测量当前可见行；批量测量后统一重建偏移量，
    // 避免渲染完整列表，同时保持自动滚动定位准确。
    this._rebuildVirtualOffsets();

    const pendingCenterIndex = this._pendingCenterIndex;
    this._pendingCenterIndex = -1;
    if (pendingCenterIndex !== -1) {
      // 目标行真实高度已写回后，再按最新偏移补一次居中，
      // 避免跳转后必须等下一次滚动才稳定到列表中间。
      this._scrollIndexIntoView(pendingCenterIndex, {
        stabilizeAfterMeasure: false,
      });
      return;
    }

    this._scheduleVirtualRender(true);
  }

  // ==================================================================================
  // 核心逻辑: 跳转、添加单词与字幕包下载
  // ==================================================================================

  /**
   * 跳转视频到指定的毫秒进度
   * @param {number} timeMs - 视频绝对播放点时间戳（毫秒）
   * @param {number|null} exactIndex 已知目标字幕行索引，避免边界时间点命中上一句字幕
   */
  jumpToTime(timeMs, exactIndex = null) {
    if (this.videoEl && Number.isFinite(timeMs)) {
      this.videoEl.currentTime = timeMs / 1000;
      const targetIndex =
        Number.isInteger(exactIndex) &&
        exactIndex >= 0 &&
        exactIndex < this.bilingualSubtitles.length
          ? exactIndex
          : this._binarySearchSubtitle(timeMs);
      if (targetIndex !== -1) {
        // 跳转触发时立即同步焦点；否则居中会等到下一轮自动滚动轮询。
        const shouldScroll = this.activeTab === "subtitles";
        this._setActiveSubtitle(targetIndex, shouldScroll);
        if (!shouldScroll) {
          // 生词本 Tab 内点击时间戳时，字幕列表不可见，不能立即滚动；
          // 先记录目标索引，等用户切回字幕 Tab 后再居中，否则自动滚动会因 _lastActiveIndex 已更新而直接跳过。
          this._pendingSubtitleTabScrollIndex = targetIndex;
        }
      }

      // 若视频原先为暂停状态，跳转后自动触发播放
      if (this.videoEl.paused) {
        this.videoEl.play();
      }
    }
  }

  /**
   * 查词自定义事件响应句柄
   */
  handleWordAdded(event) {
    if (event.detail && event.detail.word) {
      this.addWord(
        event.detail.word,
        event.detail.phonetic || "",
        event.detail.definition || "",
        event.detail.examples || [],
        event.detail.timestamp || null
      );
    }
  }

  /**
   * 追加或者合并更新一个生词数据到内存中，并依视口 Tab 活跃状态决策重绘
   */
  addWord(
    word,
    phonetic = "",
    definition = "",
    examples = [],
    timestamp = null
  ) {
    if (!word) return;

    // 根据拼写检索该词汇是否已经收录过
    const existingIndex = this.vocabulary.findIndex(
      (item) => item.word === word
    );

    if (existingIndex !== -1) {
      // 若已收录，将可能缺失的信息（如音标、新例句等）进行 Diff 合并补齐
      const currentItem = this.vocabulary[existingIndex];
      if (phonetic) currentItem.phonetic = phonetic;
      if (definition) currentItem.definition = definition;
      if (examples.length > 0) currentItem.examples = examples;
      if (timestamp) currentItem.timestamp = timestamp;
    } else {
      // 否则，新添一条生词本数据记录
      this.vocabulary.push({ word, phonetic, definition, examples, timestamp });
    }

    // 惰性重绘优化：
    // 若生词本 Tab 正被展示在前台，则立即重新执行生词本渲染以给用户直观反馈；
    // 若当前在前台显示的是字幕 Tab，则仅将 dirty 标志置为 true，直到用户主动点击切换 Tab 时才做渲染重绘。
    if (this.activeTab === "vocabulary") {
      this._renderVocabulary();
    } else {
      this._vocabularyDirty = true;
    }
  }

  /**
   * 获取可导出的字幕源数据（JSON格式）。
   * 若处于 ASR 音频识别模式或缺失原生 timedtext 事件流时，
   * 自动利用当前已识别/生成的双语字幕数据组装成标准 timedtext JSON 结构。
   *
   * @returns {Array<object>} 可导出的原始事件数组
   */
  _getExportableRawSubtitleEvents() {
    if (this.asrState?.active) {
      if (
        Array.isArray(this.bilingualSubtitles) &&
        this.bilingualSubtitles.length > 0
      ) {
        return this.bilingualSubtitles.map((cue) => ({
          tStartMs: cue.start,
          dDurationMs: Math.max(0, (cue.end || cue.start) - cue.start),
          segs: [{ utf8: cue.text || "" }],
          ...(cue.translation ? { translation: cue.translation } : {}),
        }));
      }
    }

    if (
      Array.isArray(this.rawSubtitleEvents) &&
      this.rawSubtitleEvents.length > 0
    ) {
      return this.rawSubtitleEvents;
    }

    if (
      Array.isArray(this.bilingualSubtitles) &&
      this.bilingualSubtitles.length > 0
    ) {
      return this.bilingualSubtitles.map((cue) => ({
        tStartMs: cue.start,
        dDurationMs: Math.max(0, (cue.end || cue.start) - cue.start),
        segs: [{ utf8: cue.text || "" }],
        ...(cue.translation ? { translation: cue.translation } : {}),
      }));
    }

    return [];
  }

  /**
   * 同步双语字幕导出操作栏中各个下载按钮的禁用/启用状态。
   * 当字幕或原始数据尚未准备好时，禁用对应按钮以避免无效点击。
   */
  _updateDownloadButtonsState() {
    if (
      !this.downloadBtn &&
      !this.downloadTranslationBtn &&
      !this.downloadRawBtn
    ) {
      return;
    }

    const hasSubtitles =
      Array.isArray(this.bilingualSubtitles) &&
      this.bilingualSubtitles.length > 0;
    const hasTranslation =
      hasSubtitles &&
      this.bilingualSubtitles.some(
        (sub) =>
          typeof sub?.translation === "string" &&
          sub.translation.trim().length > 0
      );
    const hasRawEvents = this._getExportableRawSubtitleEvents().length > 0;

    const setBtnState = (btn, enabled) => {
      if (!btn) return;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? "1" : "0.45";
      btn.style.cursor = enabled ? "pointer" : "not-allowed";
      if (!enabled) {
        btn.style.transform = "translateY(0)";
        try {
          const normal = getComputedStyle(this.container).getPropertyValue(
            "--kt-btn-bg"
          );
          if (normal) btn.style.background = normal;
        } catch (e) {}
      }
    };

    setBtnState(this.downloadBtn, hasSubtitles);
    setBtnState(this.downloadTranslationBtn, hasTranslation);
    setBtnState(this.downloadRawBtn, hasRawEvents);
  }

  /**
   * 下载双语字幕为标准的双语对照格式 VTT 文件
   */
  downloadSubtitles() {
    if (!this.bilingualSubtitles || this.bilingualSubtitles.length === 0) {
      logger.info("Youtube Provider: No subtitles to download");
      return;
    }

    try {
      const videoId = this._getYouTubeVideoId() || "video";
      const vttContent = buildBilingualVtt(this.bilingualSubtitles);

      downloadBlobFile(
        vttContent,
        `kiss-subtitles-${videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger.error("Youtube Provider: download subtitles error:", error);
    }
  }

  /**
   * 下载仅含译文的 VTT 字幕文件
   */
  downloadTranslationOnlySubtitles() {
    if (!this.bilingualSubtitles || this.bilingualSubtitles.length === 0) {
      logger.info("Youtube Provider: No subtitles to download");
      return;
    }

    try {
      const videoId = this._getYouTubeVideoId() || "video";
      const vttContent = buildTranslationOnlyVtt(this.bilingualSubtitles);

      downloadBlobFile(
        vttContent,
        `kiss-subtitles-translation-${videoId}_${Date.now()}.vtt`
      );
    } catch (error) {
      logger.error(
        "Youtube Provider: download translation subtitles error:",
        error
      );
    }
  }

  downloadRawSubtitleEvents() {
    const rawEvents = this._getExportableRawSubtitleEvents();
    if (!rawEvents || rawEvents.length === 0) {
      logger.info("Youtube Provider: No raw subtitle events to download");
      return;
    }

    try {
      const videoId = this._getYouTubeVideoId() || "video";
      const jsonContent = JSON.stringify(rawEvents, null, 2);

      downloadBlobFile(
        jsonContent,
        `kiss-subtitles-raw-${videoId}_${Date.now()}.json`
      );
    } catch (error) {
      logger.error("Youtube Provider: download raw subtitles error:", error);
    }
  }

  // ==================================================================================
  // UI 渲染与自适应主题逻辑
  // ==================================================================================

  /**
   * 构建面板外框主干并触发字幕/生词初始化渲染流程
   */
  createSubtitleList() {
    if (!this.videoEl) return;

    // 1. 确保侧边栏包裹容器节点存在并自适应挂载
    this._ensureContainer();

    // 2. 如果容器为新建节点，绘制骨架及 Tab 标题栏结构
    if (!this.container.querySelector(".kiss-youtube-tab-header")) {
      this._renderTabsAndStructure();
      if (this._shortsResizeHandle)
        this.container.append(this._shortsResizeHandle);
    }

    // 3. 强行终止前序分块渲染
    this._cancelChunkRender();

    // 4. 清理上一次的字幕行，从头开始分块异步挂载字幕行
    const ul = this.subtitleListEl.querySelector("ul");
    ul.replaceChildren();
    this._renderSubtitlesInChunks(ul);

    // 5. 渲染生词本列表卡片
    this._renderVocabulary();
  }

  /**
   * 确保挂载主容器，并利用 CSS 变量系统自适应适配 YouTube 原生页面的 Dark/Light 偏好
   */
  _ensureContainer() {
    this.container = document.getElementById(
      "kiss-youtube-subtitle-list-container"
    );
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      this.container.className = "notranslate"; // 规避被其他第三方整页翻译插件二次重画
      Object.assign(this.container.style, {
        height: "calc(100vh - 220px)",
        maxHeight: "none",
        zIndex: "999",
        background: "var(--kt-bg, rgba(255, 255, 255, 0.9))",
        backdropFilter: "blur(10px)",
        top: "60px",
        right: "0",
        fontSize: "14px",
        padding: "0",
        border: "var(--kt-border, 1px solid rgba(0, 0, 0, 0.1))",
        borderRadius: "8px",
        minWidth: "320px",
        maxWidth: "600px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        marginBottom: "12px",
      });

      // 挂载到右侧推荐流栏的头部
      const secondary = document.getElementById("secondary-inner");
      if (secondary) secondary.prepend(this.container);
      if (this.asrActions) {
        this._asrFullscreenHandler = () => {
          this._mountAsrContainer();
          this._syncContainerHeightToPlayer();
        };
        document.addEventListener(
          "fullscreenchange",
          this._asrFullscreenHandler
        );
      }

      // 自适应主题：异步加载用户暗黑模式偏好，并嗅探原生系统的 prefers-color-scheme，写入对应的全局 CSS 变量系统
      (async () => {
        try {
          const setting = await getSettingWithDefault();
          if (!this._shortsWidthEdited) {
            const width =
              setting?.subtitleSetting?.youtubeShortsSubtitlePanelWidth;
            this._shortsPanelWidth = Number.isFinite(width)
              ? Math.max(320, Math.min(720, width))
              : 520;
            this._mountAsrContainer();
          }
          const darkMode = setting?.darkMode;
          const prefersDark =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;
          const isDark =
            darkMode === "dark" || (darkMode === "auto" && prefersDark);

          const lightVars = {
            "--kt-bg": "rgba(255, 255, 255, 0.95)",
            "--kt-border": "1px solid rgba(0, 0, 0, 0.1)",
            "--kt-text": "#1a1a1a",
            "--kt-subtext": "#606060",
            "--kt-primary": "#1e88e5",
            "--kt-time-bg": "rgba(30, 136, 229, 0.1)",
            "--kt-divider": "rgba(0, 0, 0, 0.08)",
            "--kt-active-bg": "rgba(30, 136, 229, 0.1)",
            "--kt-btn-bg": "var(--kt-primary)",
            "--kt-btn-color": "white",
            "--kt-btn-border": "none",
            "--kt-btn-hover-bg": "rgba(30, 136, 229, 0.85)",
            "--kt-card-bg": "#ffffff",
            "--kt-card-border": "1px solid rgba(0, 0, 0, 0.12)",
            "--kt-card-shadow": "0 6px 24px rgba(0, 0, 0, 0.14)",
            "--kt-hover-bg": "rgba(0, 0, 0, 0.05)",
            "--kt-tag-bg": "rgba(0, 0, 0, 0.06)",
            "--kt-tag-color": "#555555",
            "--kt-warning-color": "#b45309",
            "--kt-warning-bg": "rgba(245, 158, 11, 0.12)",
            "--kt-warning-border": "rgba(245, 158, 11, 0.35)",
          };

          const darkVars = {
            "--kt-bg": "rgba(18, 18, 18, 0.85)",
            "--kt-border": "1px solid rgba(255, 255, 255, 0.06)",
            "--kt-text": "#f1f1f1",
            "--kt-subtext": "#aaaaaa",
            "--kt-primary": "#90caf9",
            "--kt-time-bg": "rgba(144, 202, 249, 0.08)",
            "--kt-divider": "rgba(255, 255, 255, 0.08)",
            "--kt-active-bg": "rgba(144, 202, 249, 0.12)",
            "--kt-btn-bg": "linear-gradient(180deg, #0f0f0f, #1b1b1b)",
            "--kt-btn-color": "#e6e6e6",
            "--kt-btn-border": "1px solid rgba(255, 255, 255, 0.04)",
            "--kt-btn-hover-bg": "linear-gradient(180deg, #141414, #262626)",
            "--kt-card-bg": "#282828",
            "--kt-card-border": "1px solid rgba(255, 255, 255, 0.12)",
            "--kt-card-shadow": "0 8px 28px rgba(0, 0, 0, 0.65)",
            "--kt-hover-bg": "rgba(255, 255, 255, 0.08)",
            "--kt-tag-bg": "rgba(255, 255, 255, 0.1)",
            "--kt-tag-color": "#bbbbbb",
            "--kt-warning-color": "#fbbf24",
            "--kt-warning-bg": "rgba(245, 158, 11, 0.15)",
            "--kt-warning-border": "rgba(245, 158, 11, 0.4)",
          };

          const vars = isDark ? darkVars : lightVars;
          Object.keys(vars).forEach((k) =>
            this.container.style.setProperty(k, vars[k])
          );
        } catch (err) {
          logger.info("failed to apply subtitle list theme vars", err);
        }
      })();
    }

    this._mountAsrContainer();
    this._syncContainerHeightToPlayer();
    if (this.asrActions && !this._sidebarMountObserver) {
      this._sidebarMountObserver = new MutationObserver(() => {
        if (!this.container || document.fullscreenElement) return;
        const parent = window.location.pathname.startsWith("/shorts/")
          ? document.body
          : document.getElementById("secondary-inner");
        if (
          parent
            ? this.container.parentElement !== parent
            : this.container.style.display !== "none"
        ) {
          this._mountAsrContainer();
          this._syncContainerHeightToPlayer();
        }
      });
      this._sidebarMountObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    this._observePlayerSize();
  }

  _getPlayerElement() {
    return this.videoEl?.closest(".html5-video-player") || this.videoEl;
  }

  _mountAsrContainer() {
    if (!this.asrActions || !this.container) return;
    const fullscreen = document.fullscreenElement;
    if (fullscreen) {
      this.container.style.display = "none";
      return;
    }
    const secondary = document.getElementById("secondary-inner");
    const overlay = window.location.pathname.startsWith("/shorts/");
    if (!overlay && !secondary) {
      this.container.style.display = "none";
      return;
    }
    this.container.style.display = "flex";
    this._ensureShortsResizeHandle();
    this._shortsResizeHandle.hidden = !overlay;
    const parent = overlay ? document.body : secondary;
    if (this.container.parentElement !== parent) parent.prepend(this.container);
    Object.assign(
      this.container.style,
      overlay
        ? {
            position: "fixed",
            top: "72px",
            right: "12px",
            width: `${Math.min(this._shortsPanelWidth || 520, Math.max(0, window.innerWidth - 24))}px`,
            maxWidth: "720px",
            minWidth: "0",
            zIndex: "2147483640",
          }
        : {
            position: "",
            top: "60px",
            right: "0",
            width: "",
            maxWidth: "600px",
            minWidth: "320px",
            zIndex: "999",
          }
    );
  }

  _ensureShortsResizeHandle() {
    if (this._shortsResizeHandle) return;
    const handle = document.createElement("div");
    handle.tabIndex = 0;
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "vertical");
    handle.setAttribute(
      "aria-label",
      this.i18n("youtube_subtitle_resize_width")
    );
    handle.style.cssText =
      "position:absolute;left:-5px;top:0;bottom:0;width:10px;cursor:ew-resize;touch-action:none;z-index:1;";
    this.container.append(handle);
    this._shortsResizeHandle = handle;
    const update = (width) => {
      this._shortsWidthEdited = true;
      this._shortsPanelWidth = Math.max(320, Math.min(720, width));
      this._mountAsrContainer();
      handle.setAttribute("aria-valuenow", String(this._shortsPanelWidth));
    };
    const save = () => {
      void saveEdit(STOKEY_SETTING, (current) => ({
        ...current,
        subtitleSetting: {
          ...(current?.subtitleSetting || DEFAULT_SUBTITLE_SETTING),
          youtubeShortsSubtitlePanelWidth: this._shortsPanelWidth,
        },
      })).catch((err) => logger.warn("save Shorts panel width failed", err));
    };
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this._shortsResizeCleanup?.();
      const x = event.clientX,
        width = this.container.getBoundingClientRect().width;
      const move = (next) => update(width + x - next.clientX);
      const finish = () => {
        cleanup();
        save();
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        this._shortsResizeCleanup = null;
      };
      this._shortsResizeCleanup = cleanup;
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    });
    handle.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      update(
        (this._shortsPanelWidth || 520) + (event.key === "ArrowLeft" ? 16 : -16)
      );
      save();
    };
    handle.setAttribute("aria-valuemin", "320");
    handle.setAttribute("aria-valuemax", "720");
    handle.setAttribute("aria-valuenow", String(this._shortsPanelWidth || 520));
  }

  _syncContainerHeightToPlayer() {
    if (!this.container) return;
    if (this.asrActions && document.fullscreenElement) return;

    const player = this._getPlayerElement();
    const playerHeight = player?.getBoundingClientRect?.().height;
    if (!Number.isFinite(playerHeight) || playerHeight <= 0) return;

    const overlay =
      this.asrActions && window.location.pathname.startsWith("/shorts/");
    const height = `${Math.round(overlay ? Math.min(playerHeight, Math.max(160, window.innerHeight - 96)) : playerHeight)}px`;
    this.container.style.height = height;
    this.container.style.maxHeight = height;
  }

  _observePlayerSize() {
    const player = this._getPlayerElement();
    if (!player || this._playerSizeListenerAttached) return;

    window.addEventListener("resize", this.handleWindowResize);
    this._playerSizeListenerAttached = true;
    if (typeof ResizeObserver !== "function") return;

    this._playerResizeObserver = new ResizeObserver(() => {
      this._syncContainerHeightToPlayer();
    });
    this._playerResizeObserver.observe(player);
  }

  /**
   * 绘制骨架、关闭按钮以及 Tab 切换卡
   */
  _renderTabsAndStructure() {
    ensureSubtitleHeaderStyles();
    // 1. 创建头部 Tab 区域
    const tabHeader = document.createElement("div");
    tabHeader.className = "kiss-youtube-tab-header";
    tabHeader.style.cssText = `overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none; display: flex; align-items: center; border-bottom: 1px solid var(--kt-divider); padding: 0 16px; flex-shrink: 0;`;

    const subtitleTab = document.createElement("button");
    this.subtitleTabEl = subtitleTab;
    this._updateSubtitleTabLabel();
    const vocabularyTab = document.createElement("button");
    this.vocabularyTabEl = vocabularyTab;
    vocabularyTab.textContent = this._t("vocabulary_book", "生词本");
    const summaryTab = document.createElement("button");
    this.summaryTabEl = summaryTab;
    summaryTab.textContent = this._t("video_summary", "视频总结");

    // 动态控制 Tab 激活态与未激活态 CSS 的映射函数
    const styleTab = (tab, isActive) => {
      tab.style.cssText = `padding: 12px 14px; cursor: pointer; border: none; background: transparent; font-size: 14px; font-weight: ${isActive ? "600" : "500"}; color: ${isActive ? "var(--kt-primary)" : "var(--kt-text)"}; border-bottom: 2px solid ${isActive ? "var(--kt-primary)" : "transparent"}; margin-bottom: -1px; outline: none; white-space: nowrap; flex-shrink: 0;`;
    };

    // 关闭侧边列表栏的“×”小按钮
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×"; // 直接使用纯文本的“×”号，不再需要 HTML 转义
    closeBtn.title = this._t("close", "Close");
    closeBtn.style.cssText = `
      margin-left: auto; 
      background: transparent; 
      border: none; 
      color: var(--kt-subtext); 
      font-size: 22px; 
      line-height: 1;
      cursor: pointer; 
      padding: 0 8px;
      display: flex;
      align-items: center;
      transition: color 0.2s;
    `;

    closeBtn.addEventListener("click", () => {
      this.destroy(); // 卸载整个面板
      this.onClose?.();
    });

    closeBtn.addEventListener(
      "mouseenter",
      () => (closeBtn.style.color = "var(--kt-text)")
    );
    closeBtn.addEventListener(
      "mouseleave",
      () => (closeBtn.style.color = "var(--kt-subtext)")
    );

    // Tab 内容主容器 (控制 overflow 局部滚动，规避页面全局滚动条抖动)
    const tabContentContainer = document.createElement("div");
    tabContentContainer.style.cssText = `overflow: hidden; flex-grow: 1; display: flex; flex-direction: column; height: calc(100% - 40px);`;

    // ----------------------------------------------------
    // [Tab 1]: 字幕列表面板
    // ----------------------------------------------------
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "kiss-youtube-subtitle-list";
    this.subtitleListEl.style.cssText = `display: flex; flex-direction: column; height: 100%; overflow: hidden;`;

    // 字幕操作工具条
    const subActionBar = document.createElement("div");
    subActionBar.style.cssText = `padding: 10px 16px; border-bottom: 1px solid var(--kt-divider); display: flex; justify-content: center; gap: 8px; flex-shrink: 0;`;

    const setupButtonHover = (btn) => {
      btn.addEventListener("mouseenter", () => {
        if (btn.disabled) return;
        try {
          const hover = getComputedStyle(this.container).getPropertyValue(
            "--kt-btn-hover-bg"
          );
          if (hover) btn.style.background = hover;
          btn.style.transform = "translateY(-1px)";
        } catch (e) {}
      });
      btn.addEventListener("mouseleave", () => {
        try {
          const normal = getComputedStyle(this.container).getPropertyValue(
            "--kt-btn-bg"
          );
          if (normal) btn.style.background = normal;
          btn.style.transform = "translateY(0)";
        } catch (e) {}
      });
    };

    const baseBtnStyle = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px; opacity: 1; transition: background 220ms ease, color 200ms ease, transform 160ms ease, opacity 200ms ease;`;

    const downloadBtn = (this.downloadBtn = document.createElement("button"));
    downloadBtn.textContent = this._t(
      "download_subtitles_vtt",
      "下载字幕 (VTT)"
    );
    downloadBtn.style.cssText = baseBtnStyle;
    setupButtonHover(downloadBtn);
    downloadBtn.addEventListener("click", this.downloadSubtitles.bind(this));

    const downloadRawBtn = (this.downloadRawBtn =
      document.createElement("button"));
    downloadRawBtn.textContent = this._t(
      "download_raw_subtitle_events_json",
      "下载源数据 (JSON)"
    );
    downloadRawBtn.style.cssText = baseBtnStyle;
    setupButtonHover(downloadRawBtn);
    downloadRawBtn.addEventListener(
      "click",
      this.downloadRawSubtitleEvents.bind(this)
    );

    const downloadTranslationBtn = (this.downloadTranslationBtn =
      document.createElement("button"));
    downloadTranslationBtn.textContent = this._t(
      "download_translation_subtitles_vtt",
      "下载译文字幕 (VTT)"
    );
    downloadTranslationBtn.style.cssText = baseBtnStyle;
    setupButtonHover(downloadTranslationBtn);
    downloadTranslationBtn.addEventListener(
      "click",
      this.downloadTranslationOnlySubtitles.bind(this)
    );

    subActionBar.append(downloadBtn, downloadTranslationBtn, downloadRawBtn);
    if (this.asrActions) {
      this.asrAudioButton = document.createElement("button");
      this.asrAudioButton.style.cssText = baseBtnStyle;
      this.asrAudioButton.textContent = this.i18n("youtube_asr_download_full");
      this.asrAudioButton.addEventListener(
        "click",
        () => void this.asrActions.exportFull()
      );
      setupButtonHover(this.asrAudioButton);

      this.asrClearAudioButton = document.createElement("button");
      this.asrClearAudioButton.style.cssText = baseBtnStyle;
      this.asrClearAudioButton.textContent = this.i18n(
        "youtube_asr_clear_audio_btn"
      );
      this.asrClearAudioButton.addEventListener(
        "click",
        () => void this.asrActions.deleteAudio?.()
      );
      setupButtonHover(this.asrClearAudioButton);

      this.asrClearSubtitlesButton = document.createElement("button");
      this.asrClearSubtitlesButton.style.cssText = baseBtnStyle;
      this.asrClearSubtitlesButton.textContent = this.i18n(
        "youtube_asr_clear_subtitles_btn"
      );
      this.asrClearSubtitlesButton.addEventListener(
        "click",
        () => void this.asrActions.deleteCache?.()
      );
      setupButtonHover(this.asrClearSubtitlesButton);

      this.asrStopButton = document.createElement("button");
      this.asrStopButton.style.cssText = baseBtnStyle;
      this.asrStopButton.textContent = this.i18n("youtube_asr_disable");
      this.asrStopButton.addEventListener(
        "click",
        () => void this.asrActions.stop?.()
      );
      setupButtonHover(this.asrStopButton);

      this.asrPauseButton = document.createElement("button");
      this.asrPauseButton.style.cssText = baseBtnStyle;
      this.asrPauseButton.addEventListener("click", () => {
        if (this.asrState?.paused) this.asrActions.resume?.();
        else this.asrActions.pause?.();
      });
      setupButtonHover(this.asrPauseButton);

      this.asrCancelButton = document.createElement("button");
      this.asrCancelButton.textContent = this.i18n("youtube_asr_cancel");
      this.asrCancelButton.style.cssText = baseBtnStyle;
      this.asrCancelButton.addEventListener("click", () =>
        this.asrActions.cancelExport()
      );
      setupButtonHover(this.asrCancelButton);

      this.asrPanel = new AsrTaskPanel(this.i18n, this.asrActions);
      this.asrView = document.createElement("div");
      this.asrView.style.cssText =
        "display:none;flex-direction:column;height:100%;overflow:hidden;";
      this.asrEnableView = document.createElement("div");
      this.asrEnableView.style.cssText =
        "display:none;justify-content:center;padding:24px 16px;";
      this.asrStartButton = document.createElement("button");
      this.asrStartButton.style.cssText = baseBtnStyle;
      this.asrStartButton.textContent = this.i18n("youtube_asr_enable");
      this.asrStartButton.addEventListener(
        "click",
        () => void this.asrActions.start?.()
      );
      setupButtonHover(this.asrStartButton);
      this.asrEnableView.append(this.asrStartButton);
      this.asrInactiveNotice = document.createElement("div");
      this.asrInactiveNotice.setAttribute("role", "status");
      this.asrEnableView.append(this.asrInactiveNotice);
      this.asrView.append(this.asrEnableView, this.asrPanel.element);
      this.asrPanel.toolbar.append(
        this.asrAudioButton,
        this.asrClearAudioButton,
        this.asrClearSubtitlesButton,
        this.asrPauseButton,
        this.asrStopButton,
        this.asrCancelButton,
        this.asrPanel.languageControl,
        this.asrPanel.translationControl
      );
      this.updateAsrState(this.asrState || {});
    }
    if (this.retryCaptions) {
      this.captionRetryButton = document.createElement("button");
      this.captionRetryButton.style.cssText = baseBtnStyle;
      this.captionRetryButton.textContent = this.i18n("youtube_caption_retry");
      this.captionRetryButton.addEventListener(
        "click",
        () => void this.retryCaptions()
      );
      subActionBar.append(this.captionRetryButton);
      this.updateCaptionState(this.captionState);
    }
    this.subtitleListEl.appendChild(subActionBar);
    this._updateDownloadButtonsState();

    // 字幕滚动视口容器
    this.subtitleScrollContainer = document.createElement("div");
    this.subtitleScrollContainer.style.cssText = `overflow-y: auto; flex: 1; padding: 0 16px; position: relative;`;
    this.subtitleScrollContainer.addEventListener(
      "scroll",
      this.handleSubtitleScroll,
      { passive: true }
    );

    const subUl = document.createElement("ul");
    subUl.style.cssText = `list-style-type: none; padding: 0; margin: 0; position: relative;`;
    this.subtitleListUl = subUl;

    this.subtitleScrollContainer.appendChild(subUl);
    this.subtitleListEl.appendChild(this.subtitleScrollContainer);

    // ----------------------------------------------------
    // ----------------------------------------------------
    // [Tab 2]: 生词本面板
    // ----------------------------------------------------
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    this.vocabularyListEl.style.cssText = `display: none; flex-direction: column; height: 100%; overflow: hidden;`;

    // ----------------------------------------------------
    // [Tab 3]: 视频总结面板
    // ----------------------------------------------------
    this.summaryListEl = document.createElement("div");
    this.summaryListEl.id = "kiss-youtube-summary-list";
    this.summaryListEl.style.cssText = `display: none; flex-direction: column; height: 100%; overflow: hidden;`;

    const summaryActionBar = document.createElement("div");
    summaryActionBar.style.cssText = `padding: 10px 16px; border-bottom: 1px solid var(--kt-divider); display: none; justify-content: center; gap: 8px; flex-shrink: 0;`;
    this.summaryActionBar = summaryActionBar;

    const regenBtn = document.createElement("button");
    regenBtn.textContent = this._t("regenerate_summary", "重新生成");
    regenBtn.style.cssText = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 220ms ease, color 200ms ease, transform 160ms ease;`;
    this._attachBtnHover(regenBtn);
    regenBtn.addEventListener("click", () =>
      this.generateSummary({ force: true })
    );
    this.summaryRegenBtn = regenBtn;

    const copyBtn = document.createElement("button");
    copyBtn.textContent = this._t("copy_summary", "复制总结");
    copyBtn.style.cssText = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 220ms ease, color 200ms ease, transform 160ms ease;`;
    this._attachBtnHover(copyBtn);
    copyBtn.addEventListener("click", () => this._handleCopySummary());
    this.summaryCopyBtn = copyBtn;

    summaryActionBar.append(regenBtn, copyBtn);
    this.summaryListEl.appendChild(summaryActionBar);

    this.summaryScrollContainer = document.createElement("div");
    this.summaryScrollContainer.style.cssText = `overflow-y: auto; flex: 1; padding: 16px 20px; position: relative; box-sizing: border-box;`;
    this.summaryListEl.appendChild(this.summaryScrollContainer);

    let asrTab;
    if (this.asrPanel) {
      asrTab = document.createElement("button");
      this.asrTabEl = asrTab;
      asrTab.textContent = this.i18n("youtube_asr_tab");
      styleTab(asrTab, false);
      asrTab.onclick = () => {
        this.activeTab = "asr";
        for (const tab of [subtitleTab, vocabularyTab, summaryTab])
          styleTab(tab, false);
        styleTab(asrTab, true);
        for (const panel of [
          this.subtitleListEl,
          this.vocabularyListEl,
          this.summaryListEl,
        ])
          panel.style.display = "none";
        this._syncAsrView();
      };
    }
    this.selectAsrTab = () => asrTab?.click();
    const hideAsr = () => {
      if (!asrTab) return;
      this.asrPanel.stopPreview();
      styleTab(asrTab, false);
      this.asrPanel.element.style.display = "none";
      this.asrView.style.display = "none";
    };
    // Tab 点击事件联动
    subtitleTab.addEventListener("click", () => {
      hideAsr();
      this.activeTab = "subtitles";
      styleTab(subtitleTab, true);
      styleTab(vocabularyTab, false);
      styleTab(summaryTab, false);
      this.subtitleListEl.style.display = "flex";
      this.vocabularyListEl.style.display = "none";
      this.summaryListEl.style.display = "none";
      // 优先处理隐藏期间记录的跳转目标；没有待滚动目标时，再按当前 scrollTop 正常刷新虚拟窗口。
      if (!this._scrollPendingSubtitleTabIndex()) {
        this._scheduleVirtualRender(true);
      }
    });
    vocabularyTab.addEventListener("click", () => {
      hideAsr();
      this.activeTab = "vocabulary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, true);
      styleTab(summaryTab, false);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "flex";
      this.summaryListEl.style.display = "none";
      // 点击切换时，若是生词被标记为 Dirty (未绘制最新变动)，在此统一重绘
      if (this._vocabularyDirty) {
        this._renderVocabulary();
        this._vocabularyDirty = false;
      }
    });
    summaryTab.addEventListener("click", () => {
      hideAsr();
      this.activeTab = "summary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, false);
      styleTab(summaryTab, true);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "none";
      this.summaryListEl.style.display = "flex";
      this._onSummaryTabActivated();
    });

    // 缺省激活字幕 Tab
    styleTab(subtitleTab, true);
    styleTab(vocabularyTab, false);
    styleTab(summaryTab, false);

    tabHeader.append(subtitleTab);
    if (asrTab) tabHeader.append(asrTab);
    tabHeader.append(vocabularyTab, summaryTab, closeBtn);
    tabContentContainer.append(
      this.subtitleListEl,
      this.vocabularyListEl,
      this.summaryListEl
    );
    if (this.asrPanel) {
      tabContentContainer.append(this.asrView);
      this.container.append(tabHeader, tabContentContainer);
    } else this.container.append(tabHeader, tabContentContainer);
  }

  /**
   * 绘制单行字幕条目并绑定点击跳转进度事件
   *
   * @param {object} sub - 格式化后的字幕条目
   * @param {number} index - 在数组中的序号
   * @returns {HTMLLIElement} 挂载的字幕行 DOM 节点
   */
  _createSubtitleListItem(sub, index) {
    const li = document.createElement("li");
    li.id = `kiss-youtube-item-${index}`;
    li.className = "kiss-youtube-item";
    li.dataset.index = index;
    li.dataset.time = sub.start;
    li.style.cssText = `padding: 12px 16px; border-bottom: 1px solid var(--kt-divider); transition: opacity 0.2s ease; opacity: 0.6; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;

    // 播放起止时间标签
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
    timeSpan.style.cssText = `color: var(--kt-primary); font-weight: 600; margin-right: 10px; font-size: 12px; background: var(--kt-time-bg); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px; cursor: pointer;`;
    timeSpan.addEventListener("click", (event) => {
      event.stopPropagation();
      this.jumpToTime(sub.start, index);
    });

    const textContainer = document.createElement("div");
    textContainer.style.cssText = `flex-grow: 1;`;

    // 字幕原文
    const textSpan = document.createElement("div");
    textSpan.className = "kiss-youtube-original";
    textSpan.style.cssText = `color: var(--kt-text); font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;
    if (this.enableHoverLookup) {
      textSpan.innerHTML = trustedTypesHelper.createHTML(
        wrapWordsWithSpans(sub.text || "")
      );
      this._wordTooltipController?.attachSpanListeners(
        textSpan,
        () => sub.start
      );
    } else {
      textSpan.textContent = sub.text || "";
    }

    // 字幕译文（在翻译未返回前默认隐藏 display: none）
    const translationEl = document.createElement("div");
    translationEl.className = "kiss-youtube-translation";
    translationEl.textContent = sub.translation || "";
    translationEl.style.display = sub.translation ? "block" : "none";
    translationEl.style.cssText = `color: var(--kt-subtext); font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;

    li.addEventListener("mouseenter", () => {
      if (!li.classList.contains("active-subtitle")) li.style.opacity = 1;
    });
    li.addEventListener("mouseleave", () => {
      if (!li.classList.contains("active-subtitle")) li.style.opacity = 0.6;
    });

    textContainer.appendChild(textSpan);
    textContainer.appendChild(translationEl);
    li.appendChild(timeSpan);
    li.appendChild(textContainer);
    // 缓存译文节点引用，增量更新当前可见行时避免每次 querySelector。
    li._translationEl = translationEl;

    return li;
  }

  /**
   * 差异增量更新字幕列表：
   * 针对流式加载或 AI 后续批次翻译返回的数据块进行增量更新。
   * 虚拟列表不再直接追加 DOM；这里重置高度/偏移缓存并强制重绘当前窗口，
   * 让新增字幕和翻译后的高度变化统一通过虚拟渲染流程处理，避开低效的全量 DOM 清理重建。
   */
  updateAsrTasks(update) {
    this.asrPanel?.updateTasks(update);
  }

  updateCaptionState(state) {
    this.captionState = state;
    if (!this.captionRetryButton) return;
    const hidden =
      !["error", "empty"].includes(state?.phase) ||
      this.bilingualSubtitles.length > 0 ||
      !!this.asrState?.active;
    if (this.captionRetryButton.hidden !== hidden)
      this.captionRetryButton.hidden = hidden;
  }

  updateAsrState(state) {
    this.asrState = state;
    this.updateCaptionState(this.captionState);
    this.asrPanel?.updateState(state);
    this._syncAsrView();
    if (!this.asrAudioButton) return;
    const pauseLabel = this.i18n(
      state.paused ? "youtube_asr_resume_btn" : "youtube_asr_pause_btn"
    );
    if (this.asrPauseButton.textContent !== pauseLabel)
      this.asrPauseButton.textContent = pauseLabel;
    const pauseDisabled = !state.active || !!state.clearing;
    if (this.asrPauseButton.disabled !== pauseDisabled)
      this.asrPauseButton.disabled = pauseDisabled;
    if (
      this.asrPauseButton.getAttribute("aria-pressed") !==
      String(!!state.paused)
    )
      this.asrPauseButton.setAttribute("aria-pressed", String(!!state.paused));
    if (this.asrClearSubtitlesButton.disabled !== !!state.clearing)
      this.asrClearSubtitlesButton.disabled = !!state.clearing;
    const busy = ["fetching", "generating"].includes(state.fullExport);
    this.asrAudioButton.disabled = busy;
    this.asrAudioButton.style.opacity = busy ? "0.45" : "1";
    this.asrAudioButton.style.cursor = busy ? "not-allowed" : "pointer";
    const audioBusy = !!state.clearing;
    if (this.asrClearAudioButton) {
      this.asrClearAudioButton.disabled = audioBusy;
      this.asrClearAudioButton.style.opacity = audioBusy ? "0.45" : "1";
      this.asrClearAudioButton.style.cursor = audioBusy
        ? "not-allowed"
        : "pointer";
    }
    const label =
      this.i18n(
        state.fullExport === "generating"
          ? "youtube_asr_preparing"
          : "youtube_asr_download_full"
      ) +
      (busy && state.audio?.percent !== undefined
        ? ` ${Math.floor(state.audio.percent)}%`
        : "");
    if (this.asrAudioButton.textContent !== label)
      this.asrAudioButton.textContent = label;
    this.asrCancelButton.hidden = !busy;
  }

  _syncAsrView() {
    if (!this.asrView) return;
    const selected = this.activeTab === "asr";
    const active = this.asrState?.active === true;
    this.asrView.style.display = selected ? "flex" : "none";
    this.asrEnableView.style.display = selected && !active ? "flex" : "none";
    this.asrPanel.element.style.display = selected && active ? "flex" : "none";
    const canStart =
      Boolean(this.asrState?.available) && !this.asrState?.clearing;
    this.asrStartButton.disabled = !canStart;
    this.asrStartButton.style.opacity = canStart ? "1" : "0.45";
    this.asrStartButton.style.cursor = canStart ? "pointer" : "not-allowed";
    this.asrStartButton.title = canStart
      ? ""
      : this.i18n("youtube_asr_service_unavailable");
    const inactiveNotice = this.asrState?.clearing
      ? this.i18n("youtube_asr_clearing")
      : this.asrState?.cacheDeleteError
        ? this.i18n("youtube_asr_cache_delete_failed")
        : "";
    if (this.asrInactiveNotice.textContent !== inactiveNotice)
      this.asrInactiveNotice.textContent = inactiveNotice;
  }

  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;

    this._resetVirtualMetrics({ preserveHeights: true });
    this._scheduleVirtualRender(true);
  }

  /**
   * 增量局部定向更新某一行字幕的译文内容：
   * 利用二分检索算法 (O(log N)) 在有序的字幕缓存数组中快速定位匹配目标时间轴的 DOM 节点，
   * 随后定向修改译文 textContent 并显示。由于无需重画周边节点，性能极佳。
   *
   * @param {object} subtitleUpdate - 含有 { start, translation } 的更新分片数据
   */
  updateSingleSubtitle(subtitleUpdate) {
    if (!this.subtitleListEl) return;

    const { start, translation } = subtitleUpdate;
    // 对有序的双语字幕数组进行二分精确匹配
    const targetIndex = this._findSubtitleIndexByStart(start);

    if (targetIndex === -1) return;

    // 修改本地缓存数据
    this.bilingualSubtitles[targetIndex].translation = translation;
    this._updateDownloadButtonsState();

    // 获取缓存的 li 节点引用进行局部修改，只更新当前可见行；不可见字幕稍后会根据数据源重新渲染。
    const item = this._cachedSubtitleItems[targetIndex];
    if (item) {
      const translationEl =
        item._translationEl || item.querySelector(".kiss-youtube-translation");
      if (translationEl) {
        translationEl.textContent = translation || "";
        translationEl.style.display = translation ? "block" : "none";
        // 译文展示状态会改变行高，调度一次强制渲染以便重新测量可见行。
        this._scheduleVirtualRender(true);
      }
    }
  }

  /**
   * 根据字幕开始时间定位字幕索引。
   * 翻译更新事件只携带 start 时间；字幕数组按 start 升序排列，因此这里用二分查找避免线性扫描。
   * @param {number} start 字幕开始时间（毫秒）
   * @returns {number} 匹配的字幕索引，未找到返回 -1
   */
  _findSubtitleIndexByStart(start) {
    let left = 0;
    let right = this.bilingualSubtitles.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sub = this.bilingualSubtitles[mid];
      if (sub.start === start) return mid;
      if (sub.start > start) right = mid - 1;
      else left = mid + 1;
    }

    return -1;
  }

  // ==================================================================================
  // 生词本渲染与多格式导出逻辑
  // ==================================================================================

  /**
   * 渲染并构建生词本操作工具栏及生词列表容器
   */
  _renderVocabulary() {
    if (!this.vocabularyListEl) return;

    this.vocabularyListEl.replaceChildren();
    // 导出文件操作按钮区 (导出 JSON, CSV, MD 等)
    const exportContainer = this._createExportContainer();
    // 单词卡片滚动列表容器
    const vocabListContainer = this._createVocabListContainer();

    this.vocabularyListEl.appendChild(exportContainer);
    this.vocabularyListEl.appendChild(vocabListContainer);
  }

  /**
   * 绘制生词导出工具栏
   */
  _createExportContainer() {
    const exportContainer = document.createElement("div");
    exportContainer.style.cssText = `padding: 10px 16px; border-bottom: 1px solid var(--kt-divider); display: flex; justify-content: center; flex-shrink: 0; gap: 8px;`;

    // 如果生词本不为空，显示格式导出按钮
    if (this.vocabulary.length > 0) {
      const createBtn = (text, handler) => {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = `padding: 6px 12px; background: var(--kt-primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;`;
        if (handler) btn.addEventListener("click", handler.bind(this));
        return btn;
      };

      exportContainer.appendChild(
        createBtn("导出JSON", this.exportVocabularyAsJson)
      );
      exportContainer.appendChild(
        createBtn("导出CSV", this.exportVocabularyAsCsv)
      );
      exportContainer.appendChild(
        createBtn("导出TXT", this.exportVocabularyAsTxt)
      );
      exportContainer.appendChild(
        createBtn("导出MD", this.exportVocabularyAsMd)
      );
    } else {
      // 提示暂无生词
      const emptyTip = document.createElement("span");
      emptyTip.textContent = "暂无生词，在字幕中添加";
      emptyTip.style.color = "var(--kt-subtext)";
      emptyTip.style.fontSize = "12px";
      exportContainer.appendChild(emptyTip);
    }
    return exportContainer;
  }

  /**
   * 创建生词列表独立滚动容器
   */
  _createVocabListContainer() {
    const container = document.createElement("div");
    container.style.cssText = `overflow-y: auto; overflow-x: hidden; flex: 1; padding: 0 16px; min-height: 0;`;

    const list = document.createElement("div");
    list.style.cssText = `display: flex; flex-direction: column; gap: 16px; padding: 16px 0; width: 100%;`;

    this.vocabulary.forEach((item) => {
      const itemEl = this._createVocabItemElement(item);
      list.appendChild(itemEl);
    });

    container.appendChild(list);
    return container;
  }

  /**
   * 创建单个生词条目的卡片面板
   */
  _createVocabItemElement(item) {
    const vocabItem = document.createElement("div");
    vocabItem.style.cssText = `border-bottom: 1px solid var(--kt-divider); word-wrap: break-word; word-break: break-word;`;

    // 1. 单词与音标以及回放快捷跳转行
    const wordLine = document.createElement("div");
    wordLine.style.cssText = `display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;`;

    const wordEl = document.createElement("div");
    wordEl.textContent = item.word;
    wordEl.style.cssText = `color: var(--kt-text); font-weight: bold; font-size: 16px;`;
    wordLine.appendChild(wordEl);
    const favoriteButton = createFavoriteButton({
      word: item.word,
      data: {
        timestamp: item.timestamp,
        phonetic: item.phonetic,
        definition: item.definition,
        examples: item.examples,
      },
      i18n: this.i18n,
    });
    favoriteButton.style.marginLeft = "auto";

    if (item.phonetic) {
      const phEl = document.createElement("div");
      const cleanPhonetic = item.phonetic;
      phEl.textContent = `[${cleanPhonetic}]`;
      phEl.style.cssText = `color: var(--kt-subtext); font-style: italic; font-size: 14px;`;
      wordLine.appendChild(phEl);
    }

    if (item.timestamp) {
      // 记录了添加该生词时对应的视频时间戳，支持点击跳转至该处重听，方便磨耳朵记词
      const tsBtn = document.createElement("button");
      tsBtn.textContent = `${this.millisToMinutesAndSeconds(item.timestamp)}`;
      tsBtn.style.cssText = `color: var(--kt-primary); background: none; border: none; padding: 0 4px; font-size: 14px; cursor: pointer;`;
      tsBtn.addEventListener("click", () => this.jumpToTime(item.timestamp));
      wordLine.appendChild(tsBtn);
    }
    wordLine.appendChild(favoriteButton);
    vocabItem.appendChild(wordLine);

    // 2. 词典中文释义
    if (item.definition) {
      const defEl = document.createElement("div");
      defEl.textContent = item.definition;
      defEl.style.cssText = `color: var(--kt-text); margin: 8px 0; font-size: 14px; line-height: 1.4;`;
      vocabItem.appendChild(defEl);
    }

    // 3. 例句展示
    if (item.examples && item.examples.length > 0) {
      const exContainer = document.createElement("div");
      exContainer.style.cssText = `color: var(--kt-subtext); font-size: 13px; line-height: 1.4;`;
      item.examples.forEach((ex) => {
        const exItem = document.createElement("div");
        exItem.style.marginBottom = "8px";
        const eng = document.createElement("div");
        eng.textContent = ex.eng;
        exItem.appendChild(eng);
        if (ex.chs) {
          const chs = document.createElement("div");
          chs.textContent = ex.chs;
          chs.style.cssText = `color: var(--kt-subtext); font-style: italic;`;
          exItem.appendChild(chs);
        }
        exContainer.appendChild(exItem);
      });
      vocabItem.appendChild(exContainer);
    }

    return vocabItem;
  }

  // ----------------------------------------------------
  // 生词本数据导出实现
  // ----------------------------------------------------

  // 导出为结构化 JSON 格式
  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();

    const processedVocabulary = this.vocabulary.map((item) => {
      const newItem = { ...item };
      // 导出前对音标进行格式标准化（统一包裹方括号）
      if (item.phonetic) {
        const cleanPhonetic = item.phonetic;
        newItem.phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      }
      return newItem;
    });

    const exportData = {
      videoInfo: {
        title: this._getYouTubeVideoTitle(),
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        exportTime: new Date().toISOString(),
      },
      vocabulary: processedVocabulary,
    };

    this._downloadFile(
      JSON.stringify(exportData, null, 2),
      "application/json",
      "json"
    );
  }

  // 导出为 CSV 表格数据格式
  exportVocabularyAsCsv() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const header =
      "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";

    const rows = this.vocabulary.map((item) => {
      const escapeCSVField = (field) => {
        if (!field) return '""';
        // 对双引号进行转义，确保 CSV 规范解析
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      const cleanPhonetic = item.phonetic;
      const phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      const ex1 = item.examples?.[0];
      const ex2 = item.examples?.[1];

      let videoLink = "";
      if (item.timestamp && videoId) {
        // 拼接带秒数参数 (t=xx) 的 YouTube 回放进度链接
        videoLink = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`;
      }

      return [
        item.word,
        phonetic,
        item.definition,
        ex1?.eng || "",
        ex1?.chs || "",
        ex2?.eng || "",
        ex2?.chs || "",
        videoLink,
      ]
        .map(escapeCSVField)
        .join(",");
    });

    // 关键修正：在 CSV 文本头部硬性追加 UTF-8 BOM 字符 "\uFEFF"，
    // 使得导出的中文 CSV 文件在 Windows 版 Microsoft Excel 双击直接打开时能够被正确识别编码，彻底告别乱码。
    const csvContent = [
      `"${this._getYouTubeVideoTitle()}",,,,,,,`,
      `"${videoId ? `https://www.youtube.com/watch?v=${videoId}` : "生词本"}",,,,,,,`,
      `,,,,,,,,`,
      header,
      ...rows,
    ].join("\n");

    this._downloadFile("\uFEFF" + csvContent, "text/csv;charset=utf-8;", "csv");
  }

  // 导出为 Plain Text 纯文本排版格式
  exportVocabularyAsTxt() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const lines = [];

    lines.push("生词本导出文件");
    lines.push(`视频标题: ${this._getYouTubeVideoTitle()}`);
    if (videoId)
      lines.push(`视频链接: https://www.youtube.com/watch?v=${videoId}`);
    lines.push(`导出时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    this.vocabulary.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.word}`);
      const cleanPhonetic = item.phonetic;
      if (cleanPhonetic) lines.push(`   音标: [${cleanPhonetic}]`);
      if (item.definition) lines.push(`   释义: ${item.definition}`);

      if (item.examples && item.examples.length > 0) {
        lines.push("   例句:");
        item.examples.slice(0, 2).forEach((ex, i) => {
          lines.push(`   ${i + 1}. ${ex.eng}`);
          if (ex.chs) lines.push(`      ${ex.chs}`);
        });
      }
      if (item.timestamp && videoId) {
        lines.push(
          `   视频链接: https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`
        );
      }
      lines.push("");
    });

    this._downloadFile(lines.join("\n"), "text/plain;charset=utf-8;", "txt");
  }

  // 导出为美观的 Markdown 格式文档
  exportVocabularyAsMd() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const videoLink = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "";

    const lines = [];
    lines.push("# 生词本导出文件");
    lines.push(`**视频标题:** ${this._getYouTubeVideoTitle()}`);
    if (videoLink) lines.push(`**视频链接:** [${videoLink}](${videoLink})`);
    lines.push(`**导出时间:** ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    this.vocabulary.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.word}**`);
      const cleanPhonetic = item.phonetic;
      if (cleanPhonetic) lines.push(`   *音标 Phonetic:* [${cleanPhonetic}]`);
      if (item.definition)
        lines.push(`   *释义 Definition:* ${item.definition}`);

      if (item.examples && item.examples.length > 0) {
        lines.push("   *例句 Examples:*");
        item.examples.slice(0, 2).forEach((ex, i) => {
          lines.push(`   ${i + 1}. ${ex.eng}`);
          if (ex.chs) lines.push(`      ${ex.chs}`);
        });
      }
      if (item.timestamp && videoId) {
        const link = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(item.timestamp / 1000)}s`;
        lines.push(`   *视频链接 Video Link:* [跳转到视频时间点](${link})`);
      }
      lines.push("");
    });

    this._downloadFile(lines.join("\n"), "text/markdown;charset=utf-8;", "md");
  }

  // ==================================================================================
  // 字幕同步滚动核心算法
  // ==================================================================================

  /**
   * 绑定各种控制自动滚屏的交互监听器
   */
  setupEventListeners() {
    if (!this.container || !this.videoEl) return;
    if (this._eventListenersAttached) return;

    // 鼠标悬浮于侧边字幕面板时停止自动随视频播放滚动，方便用户进行鼠标选词或手动滑动浏览，鼠标移出时恢复自动滚动高亮，提升用户体验
    this.container.addEventListener(
      "mouseenter",
      this.handleContainerMouseEnter
    );
    this.container.addEventListener(
      "mouseleave",
      this.handleContainerMouseLeave
    );

    // 视频事件联动：视频结束或暂停时停止定时器，视频开始播放时开启同步定时器
    this.videoEl.addEventListener("ended", this.handleVideoEnded);
    this.videoEl.addEventListener("pause", this.handleVideoPause);
    this.videoEl.addEventListener("play", this.handleVideoPlay);
    this._eventListenersAttached = true;
  }

  /**
   * 解绑当前实例挂载的所有 DOM / video 事件。
   * 与 setupEventListeners 中的具名 handler 一一对应，确保切换视频或销毁侧栏时不会重复监听。
   */
  _removeEventListeners() {
    if (this.subtitleScrollContainer) {
      this.subtitleScrollContainer.removeEventListener(
        "scroll",
        this.handleSubtitleScroll
      );
    }

    if (this.container) {
      this.container.removeEventListener(
        "mouseenter",
        this.handleContainerMouseEnter
      );
      this.container.removeEventListener(
        "mouseleave",
        this.handleContainerMouseLeave
      );
    }

    if (this.videoEl) {
      this.videoEl.removeEventListener("ended", this.handleVideoEnded);
      this.videoEl.removeEventListener("pause", this.handleVideoPause);
      this.videoEl.removeEventListener("play", this.handleVideoPlay);
    }

    this._eventListenersAttached = false;
  }

  /**
   * 启动以 200ms 为精度的自动同步滚动定时轮询。
   */
  turnOnAutoSub() {
    this.turnOffAutoSub();
    if (this.videoEl.paused) return; // 暂停状态无需轮询

    this.loopAutoScroll = setInterval(() => {
      if (
        !this.videoEl ||
        this.activeTab !== "subtitles" ||
        this.bilingualSubtitles.length === 0
      )
        return;

      const currentTimeMs = this.videoEl.currentTime * 1000;
      // 利用 O(log N) 二分法算出当前播放时间处于哪一条字幕行
      let currentIndex = this._binarySearchSubtitle(currentTimeMs);

      // 缓存对比：若当前行索引并未发生变动，直接返回，避免无谓的 DOM 改写与滚动行为
      if (this._lastActiveIndex === currentIndex) return;

      this._setActiveSubtitle(currentIndex, true);
    }, 200);
  }

  /**
   * 更新当前高亮字幕索引，并按需将目标行滚动到可见区域中间。
   * 虚拟列表中目标 DOM 可能尚未渲染，因此滚动使用偏移缓存而不是直接依赖 DOM 节点。
   * @param {number} index 需要高亮的字幕索引
   * @param {boolean} shouldScroll 是否同步滚动到目标行
   */
  _setActiveSubtitle(index, shouldScroll = false) {
    const previousIndex = this._lastActiveIndex;
    this._lastActiveIndex = index;

    this._updateSubtitleItemActive(previousIndex, false);
    this._updateSubtitleItemActive(index, true);

    if (shouldScroll && index !== -1) {
      this._scrollIndexIntoView(index);
    }
  }

  /**
   * 更新某个可见字幕 DOM 的高亮状态。
   * 离屏行没有对应 DOM，稍后进入虚拟窗口时会在 _renderVirtualSubtitles 中根据 _lastActiveIndex 恢复状态。
   * @param {number} index 字幕索引
   * @param {boolean} isActive 是否设置为高亮状态
   */
  _updateSubtitleItemActive(index, isActive) {
    if (index === -1) return;

    const item = this._cachedSubtitleItems[index];
    if (!item) return;

    item.style.opacity = isActive ? 1 : 0.6;
    item.classList.toggle("active-subtitle", isActive);
  }

  /**
   * 消费隐藏字幕 Tab 期间记录的待滚动目标。
   * @returns {boolean} 是否成功处理了待滚动目标；返回 false 时调用方可执行普通虚拟窗口刷新。
   */
  _scrollPendingSubtitleTabIndex() {
    const index = this._pendingSubtitleTabScrollIndex;
    if (index === -1 || !this._isSubtitleTabVisible()) return false;

    // 只有确认字幕 Tab 已经恢复布局后才消费 pending，避免刚切换时布局尚未完成导致目标索引丢失。
    this._pendingSubtitleTabScrollIndex = -1;
    this._scrollIndexIntoView(index);
    return true;
  }

  /**
   * 根据虚拟偏移缓存把指定字幕行滚动到容器中间。
   * 如果目标行刚被渲染且真实高度发生变化，会通过 _pendingCenterIndex 在测量后再补一次居中。
   * @param {number} index 目标字幕索引
   * @param {{ stabilizeAfterMeasure?: boolean }} options 是否在测量后补偿一次居中
   */
  _scrollIndexIntoView(index, { stabilizeAfterMeasure = true } = {}) {
    const container = this.subtitleScrollContainer;
    if (!container || index < 0 || index >= this.bilingualSubtitles.length) {
      return;
    }

    if (!this._isSubtitleTabVisible()) {
      // 外部消息或生词本时间戳可能在字幕 Tab 隐藏时触发跳转；
      // 此时保存目标行，等列表可见后再用真实容器高度计算居中位置。
      this._pendingSubtitleTabScrollIndex = index;
      return;
    }

    if (stabilizeAfterMeasure) {
      this._pendingCenterIndex = index;
    }

    const itemTop = this._virtualTopPadding + this._virtualOffsets[index];
    const itemHeight = this._virtualHeights[index] || this._estimatedItemHeight;
    const targetTop = itemTop - container.clientHeight / 2 + itemHeight / 2;

    container.scrollTop = Math.max(0, targetTop);
    this._scheduleVirtualRender(true);
  }

  /**
   * 二分查找：在有序的双语字幕数组中，以 O(log N) 复杂度快速搜寻时间点 timeMs 对应的字幕块
   */
  _binarySearchSubtitle(timeMs) {
    let left = 0;
    let right = this.bilingualSubtitles.length - 1;
    let bestMatch = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sub = this.bilingualSubtitles[mid];

      const isLastSubtitle = mid === this.bilingualSubtitles.length - 1;
      if (timeMs >= sub.start && (timeMs < sub.end || isLastSubtitle)) {
        return mid; // 精确匹配该时间范围
      } else if (timeMs < sub.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
        bestMatch = mid; // 若没有精确包含在此区间内，将最接近的前一个字幕索引存入 bestMatch 作为缺省候选项
      }
    }
    return bestMatch;
  }

  // 关闭同步滚动定时器
  turnOffAutoSub() {
    if (this.loopAutoScroll) {
      clearInterval(this.loopAutoScroll);
      this.loopAutoScroll = null;
    }
  }

  // ==================================================================================
  // Helpers: 工具函数
  // ==================================================================================

  /**
   * 将字符串文本转换成 Blob 文件并唤起浏览器下载弹窗
   */
  _downloadFile(content, mimeType, extension) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlobFile(
      blob,
      `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.${extension}`
    );
  }

  /**
   * 格式化时间戳（毫秒）转换为 MM:SS 的短格式字符串
   * REVIEW: 这里的 seconds 计算公式中：`((millis % 60000) / 1000).toFixed(0)`
   * 在毫秒数为例如 59600 毫秒（即 59.6 秒）时，toFixed(0) 会将其四舍五入为 60，
   * 此时本函数的输出格式为类似于 `3:60` 这一错误时间格式，而非期待的 `4:00`。
   * 推荐的改进方案是对秒数向下取整：`Math.floor((millis % 60000) / 1000)`，或者在四舍五入为 60 时将分钟数加 1。
   */
  millisToMinutesAndSeconds(millis) {
    if (!Number.isFinite(millis)) return "0:00";
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  // 截取当前 YouTube 的 URL 获取当前播放视频的 ID
  _getYouTubeVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("v");
    } catch (e) {
      return null;
    }
  }

  // 获取视频标题 DOM 中的文本内容
  _getYouTubeVideoTitle() {
    try {
      const titleElement = document.querySelector("h1 yt-formatted-string");
      return titleElement ? titleElement.textContent : "YouTube Video";
    } catch (e) {
      return "YouTube Video";
    }
  }

  // ==================================================================================
  // Video Summary: 视频总结面板渲染与生命周期处理
  // ==================================================================================

  /**
   * 为通用按钮绑定基于容器主题变量的 hover 悬浮高亮反馈
   */
  _attachBtnHover(btn) {
    btn.addEventListener("mouseenter", () => {
      try {
        const hover = getComputedStyle(this.container).getPropertyValue(
          "--kt-btn-hover-bg"
        );
        if (hover) btn.style.background = hover;
        btn.style.transform = "translateY(-1px)";
      } catch (e) {}
    });
    btn.addEventListener("mouseleave", () => {
      try {
        const normal = getComputedStyle(this.container).getPropertyValue(
          "--kt-btn-bg"
        );
        if (normal) btn.style.background = normal;
        btn.style.transform = "translateY(0)";
      } catch (e) {}
    });
  }

  /**
   * 收集当前视频用于总结的完整输入参数与模型配置
   */
  _getSummaryParams(config) {
    const meta = this.getVideoMetadata?.() || {};
    const videoId = meta.videoId || this._getVideoId();
    const title = meta.title || this._getYouTubeVideoTitle() || "";
    const description = meta.description || "";
    let transcript = meta.transcript;
    if (!transcript) {
      transcript = this.bilingualSubtitles
        .map((s) => s.text)
        .filter(Boolean)
        .join(" ");
    }
    if (!transcript) {
      transcript = this.rawSubtitleEvents
        .map((e) => e.text || e.utf8)
        .filter(Boolean)
        .join(" ");
    }

    const transApis = config?.transApis || [];
    let apiSetting = transApis.find(
      (api) => api.apiSlug === config?.summaryApiSlug
    );
    if (!apiSetting) {
      if (config?.summaryApiSlug === OPT_TRANS_BUILTINAI) {
        apiSetting = {
          apiType: OPT_TRANS_BUILTINAI,
          apiSlug: OPT_TRANS_BUILTINAI,
        };
      } else {
        apiSetting = {
          apiType: config?.summaryApiSlug,
          apiSlug: config?.summaryApiSlug,
        };
      }
    }

    const prompts = config?.prompts || [];
    let prompt = prompts.find((p) => p.slug === config?.summaryPromptSlug);
    if (!prompt) {
      prompt = DEFAULT_SUMMARY_PROMPT;
    }

    return {
      videoId,
      title,
      description,
      transcript,
      apiSetting,
      prompt,
      to: config?.to || "zh-CN",
    };
  }

  /**
   * 当用户点击切换到“视频总结”Tab 时触发
   */
  async _onSummaryTabActivated() {
    const config = await this._resolveSummaryConfig();
    if (!config || !config.summaryApiSlug || config.summaryApiSlug === "-") {
      this._renderSummaryGuide();
      return;
    }

    if (this.summaryActionBar) this.summaryActionBar.style.display = "flex";
    const params = this._getSummaryParams(config);
    if (params.transcript && params.transcript.trim().length >= 10) {
      const summarySig = await getVideoSummarySignature(params);
      if (this._summaryCache.has(summarySig)) {
        const cached = this._summaryCache.get(summarySig);
        this._currentSummaryText = cached;
        this._renderSummaryContent(cached);
        return;
      }
    }

    if (!this._isSummarizing) {
      await this.generateSummary({ force: false });
    }
  }

  /**
   * 动态获取最新的总结配置（优先从构造回调读取，降级从本地配置读取）
   */
  async _resolveSummaryConfig() {
    let fallbackConfig = this.getSummaryConfig?.() || {};
    let sub = null;
    let transApis = Array.isArray(fallbackConfig.transApis)
      ? [...fallbackConfig.transApis]
      : [];
    let prompts = Array.isArray(fallbackConfig.prompts)
      ? [...fallbackConfig.prompts]
      : [];

    const activeApiSlug =
      this._selectedSummaryApiSlug || fallbackConfig.summaryApiSlug || "-";

    // 缺少当前选定模型的配置或没有 transApis 时，从 storage 补充读取
    const needFetchStorage =
      transApis.length === 0 ||
      (activeApiSlug !== "-" &&
        activeApiSlug !== OPT_TRANS_BUILTINAI &&
        !transApis.some((api) => api.apiSlug === activeApiSlug));

    if (needFetchStorage) {
      try {
        const stored = await getSettingWithDefault();
        sub = stored?.subtitleSetting || {};
        if (Array.isArray(stored?.transApis) && stored.transApis.length > 0) {
          transApis = stored.transApis;
        }
        if (Array.isArray(stored?.prompts) && stored.prompts.length > 0) {
          prompts = stored.prompts;
        }
      } catch (e) {
        logger.warn("resolveSummaryConfig failed to get setting", e);
      }
    }

    const finalApiSlug =
      this._selectedSummaryApiSlug ||
      fallbackConfig.summaryApiSlug ||
      sub?.summaryApiSlug ||
      "-";

    const activePromptSlug =
      fallbackConfig.summaryPromptSlug ||
      sub?.summaryPromptSlug ||
      "default_video_summary";

    const to = fallbackConfig.to || sub?.toLang || sub?.to || "zh-CN";

    return {
      summaryApiSlug: finalApiSlug,
      summaryPromptSlug: activePromptSlug,
      to,
      transApis,
      prompts,
    };
  }

  /**
   * 获取当前播放视频的 ID
   */
  _getVideoId() {
    const meta = this.getVideoMetadata?.();
    if (meta?.videoId) return meta.videoId;
    return this._getYouTubeVideoId() || "";
  }

  /**
   * 未启用总结服务时渲染的引导界面
   */
  _renderSummaryGuide() {
    if (this.summaryActionBar) this.summaryActionBar.style.display = "none";
    if (!this.summaryScrollContainer) return;
    this.summaryScrollContainer.replaceChildren();

    const guideCard = document.createElement("div");
    guideCard.style.cssText = `display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 220px; text-align: center; padding: 24px 16px; box-sizing: border-box;`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "42");
    svg.setAttribute("height", "42");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.cssText = `margin-bottom: 16px; color: var(--kt-subtext); opacity: 0.85;`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
    );
    const polyline = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline"
    );
    polyline.setAttribute("points", "14 2 14 8 20 8");
    const line1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    line1.setAttribute("x1", "16");
    line1.setAttribute("y1", "13");
    line1.setAttribute("x2", "8");
    line1.setAttribute("y2", "13");
    const line2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    line2.setAttribute("x1", "16");
    line2.setAttribute("y1", "17");
    line2.setAttribute("x2", "8");
    line2.setAttribute("y2", "17");
    svg.append(path, polyline, line1, line2);

    const textEl = document.createElement("p");
    textEl.style.cssText = `font-size: 14px; line-height: 1.5; color: var(--kt-subtext); margin: 0 0 20px 0; max-width: 280px;`;
    textEl.textContent = this._t(
      "summary_empty_guide",
      "尚未配置视频总结服务，请前往【字幕翻译设置】开启"
    );

    const settingBtn = document.createElement("button");
    settingBtn.textContent = this._t("go_to_settings", "前往设置");
    settingBtn.style.cssText = `padding: 8px 20px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 200ms ease, transform 160ms ease;`;
    this._attachBtnHover(settingBtn);
    settingBtn.addEventListener("click", () => {
      openOptionsPage("/subtitle");
    });

    guideCard.append(svg, textEl, settingBtn);
    this.summaryScrollContainer.appendChild(guideCard);
  }

  /**
   * 总结中过渡状态渲染
   */
  _renderSummaryLoading() {
    if (this.summaryActionBar) this.summaryActionBar.style.display = "flex";
    if (this.summaryRegenBtn) this.summaryRegenBtn.disabled = true;
    if (!this.summaryScrollContainer) return;
    this.summaryScrollContainer.replaceChildren();

    const loadingContainer = document.createElement("div");
    loadingContainer.style.cssText = `display: flex; flex-direction: column; align-items: center; justify-content: center; height: 180px; gap: 14px; color: var(--kt-subtext);`;

    const spinner = document.createElement("div");
    spinner.style.cssText = `width: 24px; height: 24px; border: 2.5px solid var(--kt-divider); border-top-color: var(--kt-primary); border-radius: 50%; animation: kt-spin 0.8s linear infinite;`;

    if (!document.getElementById("kt-spin-keyframes")) {
      const style = document.createElement("style");
      style.id = "kt-spin-keyframes";
      style.textContent = `@keyframes kt-spin { to { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }

    const tip = document.createElement("span");
    tip.textContent = this._t("summarizing", "正在总结视频内容...");
    tip.style.fontSize = "13px";

    loadingContainer.append(spinner, tip);
    this.summaryScrollContainer.appendChild(loadingContainer);
  }

  /**
   * 成功获取到 Markdown 总结结果并渲染
   */
  _renderSummaryContent(summary) {
    if (this.summaryActionBar) this.summaryActionBar.style.display = "flex";
    if (this.summaryRegenBtn) this.summaryRegenBtn.disabled = false;
    if (!this.summaryScrollContainer) return;
    this.summaryScrollContainer.replaceChildren();

    const contentDiv = document.createElement("div");
    contentDiv.style.cssText = `padding: 4px 0; font-size: 13px; line-height: 1.6; color: var(--kt-text);`;
    renderMarkdownToElement(summary, contentDiv);
    this.summaryScrollContainer.appendChild(contentDiv);
  }

  /**
   * 格式化字节数
   */
  _formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${Math.round(mb)} MB`;
  }

  /**
   * 收到后台推送的 BuiltinAI 模型下载进度
   */
  _handleBuiltinAiProgress(progressData) {
    if (!progressData) return;
    const { loaded = 0, total = 0, percent = 0 } = progressData;
    this._downloadProgress = { loaded, total, percent };

    if (loaded > this._downloadLastLoaded) {
      this._downloadLastLoaded = loaded;
      this._downloadStalled = false;
      this._resetDownloadStalledTimer();
    }

    if (this._downloadProgressBar) {
      this._downloadProgressBar.style.width = `${Math.max(6, Math.min(100, percent))}%`;
    }
    if (this._downloadProgressText) {
      if (total > 0) {
        this._downloadProgressText.textContent = `${percent}% (${this._formatBytes(
          loaded
        )} / ${this._formatBytes(total)})`;
      } else if (loaded > 0) {
        this._downloadProgressText.textContent = this._formatBytes(loaded);
      }
    }
    if (this._downloadStalledTip && !this._downloadStalled) {
      this._downloadStalledTip.style.display = "none";
    }
  }

  _resetDownloadStalledTimer() {
    this._clearDownloadStalledTimer();
    this._downloadStalledTimer = setTimeout(() => {
      this._downloadStalled = true;
      if (this._downloadStalledTip) {
        this._downloadStalledTip.style.display = "block";
      }
    }, 20000);
  }

  _clearDownloadStalledTimer() {
    if (this._downloadStalledTimer) {
      clearTimeout(this._downloadStalledTimer);
      this._downloadStalledTimer = null;
    }
  }

  /**
   * 渲染 Chrome 内置模型下载进度与快捷切换为网络 AI 视图
   */
  _renderModelDownloadingView(errorMessage = "") {
    if (this.summaryActionBar) this.summaryActionBar.style.display = "flex";
    if (this.summaryRegenBtn) this.summaryRegenBtn.disabled = false;
    if (!this.summaryScrollContainer) return;
    this.summaryScrollContainer.replaceChildren();

    this._resetDownloadStalledTimer();

    const card = document.createElement("div");
    card.style.cssText = `display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; padding: 20px 16px; text-align: center; color: var(--kt-text); gap: 12px; box-sizing: border-box;`;
    this._downloadProgressCard = card;

    // 1. 标题
    const header = document.createElement("div");
    header.style.cssText = `display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; color: var(--kt-primary);`;
    const titleSpan = document.createElement("span");
    titleSpan.textContent = this._t(
      "model_downloading_title",
      "Chrome 内置模型下载中..."
    );
    header.appendChild(titleSpan);

    // 2. 进度条
    const progressWrapper = document.createElement("div");
    progressWrapper.style.cssText = `width: 100%; max-width: 320px; background: var(--kt-divider, rgba(255,255,255,0.12)); height: 8px; border-radius: 4px; overflow: hidden; position: relative; margin: 4px 0;`;

    const initialPercent = this._downloadProgress?.percent || 0;
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `width: ${Math.max(6, Math.min(100, initialPercent))}%; height: 100%; background: var(--kt-primary, #3ea6ff); border-radius: 4px; transition: width 0.3s ease;`;
    progressWrapper.appendChild(progressBar);
    this._downloadProgressBar = progressBar;

    // 3. 进度文本
    const progressText = document.createElement("div");
    progressText.style.cssText = `font-size: 12px; color: var(--kt-subtext); font-variant-numeric: tabular-nums;`;
    if (this._downloadProgress?.total > 0) {
      progressText.textContent = `${this._downloadProgress.percent}% (${this._formatBytes(
        this._downloadProgress.loaded
      )} / ${this._formatBytes(this._downloadProgress.total)})`;
    } else {
      progressText.textContent =
        "Chrome 正在后台下载模型组件（约 1.5GB ~ 2GB）";
    }
    this._downloadProgressText = progressText;

    // 4. 描述说明
    const desc = document.createElement("p");
    desc.style.cssText = `font-size: 12.5px; color: var(--kt-subtext); margin: 2px 0 0 0; line-height: 1.5; max-width: 340px;`;
    desc.textContent = this._t(
      "model_downloading_desc",
      "Chrome 正在后台下载 Gemini Nano 大模型（体积约 1.5GB ~ 2GB）。受网络环境影响，若下载较慢，建议切换为网络大模型："
    );

    // 5. 停滞提示
    const stalledTip = document.createElement("div");
    stalledTip.style.cssText = `font-size: 12px; color: var(--kt-warning-color, #b45309); background: var(--kt-warning-bg, rgba(245, 158, 11, 0.12)); border: 1px solid var(--kt-warning-border, rgba(245, 158, 11, 0.35)); border-radius: 6px; padding: 8px 12px; line-height: 1.45; max-width: 340px; display: ${
      this._downloadStalled ? "block" : "none"
    }; text-align: left; box-sizing: border-box;`;
    stalledTip.textContent = this._t(
      "model_download_stalled",
      "下载较为缓慢或停滞，可能因网络无法连接 Google 官方模型服务器，建议切换为网络 AI"
    );
    this._downloadStalledTip = stalledTip;

    // 6. 操作按钮
    const btnGroup = document.createElement("div");
    btnGroup.style.cssText = `display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; align-items: center; margin-top: 6px;`;

    // 切换为网络AI 按钮 (高亮主按钮)
    const switchBtn = document.createElement("button");
    switchBtn.textContent = `⚡ ${this._t("switch_to_network_ai", "切换为网络AI")}`;
    switchBtn.style.cssText = `padding: 7px 14px; background: var(--kt-primary, #1e88e5); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12.5px; font-weight: 500; transition: opacity 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);`;
    switchBtn.addEventListener(
      "mouseenter",
      () => (switchBtn.style.opacity = "0.9")
    );
    switchBtn.addEventListener(
      "mouseleave",
      () => (switchBtn.style.opacity = "1")
    );
    switchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._showModelSwitcherPopup(switchBtn);
    });

    // 重新生成/检查 按钮
    const retryBtn = document.createElement("button");
    retryBtn.textContent = this._t("regenerate_summary", "重新生成");
    retryBtn.style.cssText = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px;`;
    this._attachBtnHover(retryBtn);
    retryBtn.addEventListener("click", () =>
      this.generateSummary({ force: true })
    );

    // 取消 按钮
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = this._t("cancel_action", "取消");
    cancelBtn.style.cssText = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px;`;
    this._attachBtnHover(cancelBtn);
    cancelBtn.addEventListener("click", () => {
      this._clearDownloadStalledTimer();
      this._renderSummaryGuide();
    });

    btnGroup.append(switchBtn, retryBtn, cancelBtn);
    card.append(
      header,
      progressWrapper,
      progressText,
      desc,
      stalledTip,
      btnGroup
    );
    this.summaryScrollContainer.appendChild(card);
  }

  /**
   * 弹出网络/其他可用 AI 模型选择菜单
   * @param {HTMLElement} anchorEl 触发弹出的锚点按钮
   * @param {object} [options={}]
   * @param {boolean} [options.excludeBuiltin=true] 是否排除 BuiltinAI
   */
  async _showModelSwitcherPopup(anchorEl, { excludeBuiltin = true } = {}) {
    if (this._modelSwitcherPopup) {
      this._modelSwitcherPopup.remove();
      this._modelSwitcherPopup = null;
      return;
    }

    let transApis = [];
    try {
      const stored = await getSettingWithDefault();
      transApis = stored?.transApis || [];
    } catch (_) {}

    // 严格过滤出未禁用且勾选了“总结能力 (summarization)”的服务
    const availableModels = transApis.filter((api) => {
      if (api.isDisabled) return false;
      if (
        excludeBuiltin &&
        (api.apiType === OPT_TRANS_BUILTINAI ||
          api.apiSlug === OPT_TRANS_BUILTINAI)
      ) {
        return false;
      }
      return isApiConfigured(api) && supportsApiCapability(api, "summarize");
    });

    const popup = document.createElement("div");
    popup.style.cssText = `
      position: absolute;
      z-index: 10000;
      background: var(--kt-card-bg, #ffffff);
      color: var(--kt-text, #1a1a1a);
      border: var(--kt-card-border, 1px solid rgba(0, 0, 0, 0.12));
      border-radius: 8px;
      box-shadow: var(--kt-card-shadow, 0 6px 24px rgba(0, 0, 0, 0.15));
      padding: 6px;
      width: 240px;
      box-sizing: border-box;
      max-height: 250px;
      overflow-y: auto;
      font-size: 12.5px;
      scrollbar-width: thin;
      scrollbar-color: var(--kt-divider, rgba(0,0,0,0.15)) transparent;
    `;

    // 计算绝对定位坐标（居中对齐按钮，且左右各保留 10px 边距）
    const rect = anchorEl.getBoundingClientRect();
    const containerRect = this.container?.getBoundingClientRect() || {
      top: 0,
      left: 0,
      width: 350,
    };
    const popupWidth = 240;
    let left = rect.left - containerRect.left + (rect.width - popupWidth) / 2;
    if (left < 10) left = 10;
    if (left + popupWidth > containerRect.width - 10) {
      left = containerRect.width - popupWidth - 10;
    }
    const top = rect.bottom - containerRect.top + 6;

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;

    const title = document.createElement("div");
    title.style.cssText = `
      padding: 6px 8px 8px 8px;
      font-weight: 600;
      color: var(--kt-subtext, #666666);
      border-bottom: 1px solid var(--kt-divider, rgba(0, 0, 0, 0.08));
      font-size: 11.5px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    title.textContent = this._t("select_summary_model", "选择总结 AI 模型");
    popup.appendChild(title);

    if (availableModels.length === 0) {
      const emptyTip = document.createElement("div");
      emptyTip.style.cssText = `padding: 14px 10px; text-align: center; color: var(--kt-subtext, #666666);`;
      emptyTip.textContent = this._t(
        "no_network_ai_available",
        "暂无启用的网络大模型，请前往设置开启"
      );

      const goBtn = document.createElement("button");
      goBtn.textContent = this._t("go_to_settings", "前往设置");
      goBtn.style.cssText = `margin-top: 8px; padding: 5px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 11.5px;`;
      goBtn.addEventListener("click", () => {
        popup.remove();
        this._modelSwitcherPopup = null;
        openOptionsPage("/apis");
      });
      emptyTip.appendChild(goBtn);
      popup.appendChild(emptyTip);
    } else {
      availableModels.forEach((api) => {
        const item = document.createElement("div");
        item.style.cssText = `
          padding: 8px 10px;
          margin-top: 2px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          color: var(--kt-text, #1a1a1a);
          transition: background 150ms ease;
        `;
        item.addEventListener("mouseenter", () => {
          item.style.background = "var(--kt-hover-bg, rgba(0, 0, 0, 0.06))";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = "transparent";
        });

        const nameSpan = document.createElement("span");
        nameSpan.textContent = api.apiName || api.apiType;
        nameSpan.style.cssText = `
          color: var(--kt-text, #1a1a1a);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12.5px;
          font-weight: 500;
        `;

        const tagSpan = document.createElement("span");
        tagSpan.textContent = api.sourceType === "local" ? "Local" : "Network";
        tagSpan.style.cssText = `
          font-size: 10.5px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--kt-tag-bg, rgba(0, 0, 0, 0.06));
          color: var(--kt-tag-color, #555555);
          flex-shrink: 0;
          font-weight: 500;
        `;

        item.append(nameSpan, tagSpan);
        item.addEventListener("click", async () => {
          popup.remove();
          this._modelSwitcherPopup = null;
          await this._switchToModel(api.apiSlug);
        });
        popup.appendChild(item);
      });
    }

    const handleOutsideClick = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorEl) {
        popup.remove();
        this._modelSwitcherPopup = null;
        document.removeEventListener("click", handleOutsideClick);
      }
    };
    setTimeout(
      () => document.addEventListener("click", handleOutsideClick),
      10
    );

    this.container.appendChild(popup);
    this._modelSwitcherPopup = popup;
  }

  /**
   * 切换至指定 AI 模型并持久化保存至 subtitleSetting.summaryApiSlug
   */
  async _switchToModel(apiSlug) {
    this._clearDownloadStalledTimer();

    // 1. 立即更新内部状态，覆盖当前生效的模型
    this._selectedSummaryApiSlug = apiSlug;

    // 2. 立即将界面置为加载中，给予即时视觉反馈
    this._renderSummaryLoading();

    // 3. 异步持久化配置至存储（不阻塞后续调用）
    saveEdit(STOKEY_SETTING, (currentSetting) => ({
      ...currentSetting,
      subtitleSetting: {
        ...(currentSetting?.subtitleSetting || DEFAULT_SUBTITLE_SETTING),
        summaryApiSlug: apiSlug,
      },
    })).catch((err) => {
      logger.warn("save summary api slug failed", err);
    });

    // 4. 重置正在总结标记，立即发起总结
    this._isSummarizing = false;
    await this.generateSummary({ force: true });
  }

  /**
   * 生成失败或异常状态渲染
   */
  _renderSummaryError(errorMessage) {
    if (this.summaryActionBar) this.summaryActionBar.style.display = "flex";
    if (this.summaryRegenBtn) this.summaryRegenBtn.disabled = false;
    if (!this.summaryScrollContainer) return;

    if (
      typeof errorMessage === "string" &&
      (errorMessage.includes("内置大模型正在下载中") ||
        errorMessage.includes("Optimization Guide On Device Model") ||
        errorMessage.includes("downloading"))
    ) {
      this._renderModelDownloadingView(errorMessage);
      return;
    }

    this.summaryScrollContainer.replaceChildren();

    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = `display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; padding: 16px 12px; text-align: center; color: var(--kt-subtext); gap: 12px;`;

    const text = document.createElement("p");
    text.style.cssText = `font-size: 13px; color: #ff5252; margin: 0; line-height: 1.5; word-break: break-word;`;
    text.textContent = errorMessage;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = `display: flex; gap: 8px; align-items: center; justify-content: center; flex-wrap: wrap;`;

    const retryBtn = document.createElement("button");
    retryBtn.textContent = this._t("regenerate_summary", "重新生成");
    retryBtn.style.cssText = `padding: 6px 14px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px;`;
    this._attachBtnHover(retryBtn);
    retryBtn.addEventListener("click", () =>
      this.generateSummary({ force: true })
    );

    const switchBtn = document.createElement("button");
    switchBtn.textContent = this._t("switch_summary_model", "切换总结模型");
    switchBtn.style.cssText = `padding: 6px 14px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px;`;
    this._attachBtnHover(switchBtn);
    switchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._showModelSwitcherPopup(switchBtn, { excludeBuiltin: false });
    });

    btnRow.append(retryBtn, switchBtn);
    errorDiv.append(text, btnRow);
    this.summaryScrollContainer.appendChild(errorDiv);
  }

  /**
   * 复制当前视频总结到剪贴板
   */
  async _handleCopySummary() {
    if (!this._currentSummaryText) return;
    try {
      await navigator.clipboard.writeText(this._currentSummaryText);
      if (this.summaryCopyBtn) {
        const originalText = this.summaryCopyBtn.textContent;
        this.summaryCopyBtn.textContent = this._t("copied", "已复制");
        setTimeout(() => {
          if (this.summaryCopyBtn) {
            this.summaryCopyBtn.textContent = originalText;
          }
        }, 2000);
      }
    } catch (e) {
      logger.warn("copy summary failed", e);
    }
  }

  /**
   * 触发视频总结核心生成流程
   *
   * @param {object} [options={}]
   * @param {boolean} [options.force=false] 是否强制忽略缓存重新生成
   */
  async generateSummary({ force = false } = {}) {
    if (this._isSummarizing) return;

    const config = await this._resolveSummaryConfig();
    if (!config || !config.summaryApiSlug || config.summaryApiSlug === "-") {
      this._renderSummaryGuide();
      return;
    }

    const params = this._getSummaryParams(config);
    const { videoId, title, description, transcript, apiSetting, prompt, to } =
      params;

    if (!transcript || transcript.trim().length < 10) {
      this._renderSummaryError(
        this._t("summary_waiting_subtitles", "等待字幕加载完成后再生成总结...")
      );
      return;
    }

    this._isSummarizing = true;
    this._renderSummaryLoading();

    try {
      const summarySig = await getVideoSummarySignature(params);
      const summary = await apiSummarizeVideo({
        videoId,
        title,
        description,
        transcript,
        apiSetting,
        prompt,
        to,
        force,
      });

      if (summary) {
        this._summaryCache.set(summarySig, summary);
        this._currentSummaryText = summary;
        this._renderSummaryContent(summary);
      } else {
        this._renderSummaryError(
          this._t("summary_failed", "生成视频总结失败，请检查服务配置或重试")
        );
      }
    } catch (err) {
      logger.error("generateSummary error", err);
      this._renderSummaryError(
        err?.message ||
          this._t("summary_failed", "生成视频总结失败，请检查服务配置或重试")
      );
    } finally {
      this._isSummarizing = false;
    }
  }
}
