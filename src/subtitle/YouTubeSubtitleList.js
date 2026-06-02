import { logger } from "../libs/log.js";
import { downloadBlobFile } from "../libs/utils.js";
import { buildBilingualVtt } from "./vtt.js";
import { getSettingWithDefault } from "../libs/storage.js";

/**
 * YouTube 字幕列表管理器
 * * 功能：
 * 1. 在 YouTube 视频侧边显示同步滚动的双语字幕列表。
 * 2. 支持字幕点击跳转视频进度。
 * 3. 提供字幕下载功能 (VTT)。
 * 4. 集成生词本功能，支持添加、查看及多种格式导出。
 */
export class YouTubeSubtitleList {
  /**
   * @param {HTMLVideoElement} videoElement YouTube 的视频播放器 DOM 元素
   */
  constructor(videoElement) {
    this.videoEl = videoElement;

    // --- 数据源 ---
    // 统一双语字幕数据结构: { start: number, end: number, text: string, translation: string }
    this.bilingualSubtitles = [];
    // 生词数据结构: { word, phonetic, definition, examples: [], timestamp }
    this.vocabulary = [];

    // --- DOM 引用 ---
    this.container = null; // 右侧悬浮面板主容器
    this.subtitleListEl = null; // 字幕列表面板元素
    this.vocabularyListEl = null; // 生词本面板元素
    this.subtitleScrollContainer = null; // 字幕列表的专用独立滚动容器
    this._cachedSubtitleItems = []; // 缓存字幕列表项 DOM 节点数组，减少重新 queryQuerySelector 造成的重排开销，提升滚动性能

    // --- 状态管理 ---
    this.loopAutoScroll = null; // 自动滚动的定时器 ID
    this.activeTab = "subtitles"; // 当前激活的 Tab: 'subtitles' 或 'vocabulary'
    this._lastActiveIndex = -1; // 上一次高亮的字幕索引位置
    this._virtualHeights = [];
    this._virtualOffsets = [0];
    this._virtualStart = -1;
    this._virtualEnd = -1;
    this._virtualRenderRaf = null;
    this._virtualRenderForce = false;
    this._estimatedItemHeight = 76;
    this._subtitleItemGap = 4;
    this._virtualTopPadding = 16;
    this._virtualBottomPadding = 16;
    this._virtualOverscan = 8;
    this._pendingCenterIndex = -1;
    this._eventListenersAttached = false;
    this._vocabularyDirty = false; // 生词本是否需要重新渲染的标志位（在生词本不可见时添加了单词，切换过来时再重新渲染）
    this._chunkRenderCancel = null; // 当前分块渲染的取消器函数，用于随时中断未完成的渲染流程

    // --- 事件绑定 ---
    this.handleWordAdded = this.handleWordAdded.bind(this);
    this.handleJumpMessage = this.handleJumpMessage.bind(this);
    this.handleSubtitleScroll = this.handleSubtitleScroll.bind(this);
    this.handleContainerMouseEnter = this.handleContainerMouseEnter.bind(this);
    this.handleContainerMouseLeave = this.handleContainerMouseLeave.bind(this);
    this.handleVideoEnded = this.handleVideoEnded.bind(this);
    this.handleVideoPause = this.handleVideoPause.bind(this);
    this.handleVideoPlay = this.handleVideoPlay.bind(this);
    // 监听在视频字幕上划词或 Hover 翻译弹窗抛出的“添加生词到生词本”自定义事件
    document.addEventListener("kiss-add-word", this.handleWordAdded);

    // 监听来自扩展配置选项页面等第三方发送的消息，用以点击生词时同步跳转视频进度
    window.addEventListener("message", this.handleJumpMessage);
  }

  handleJumpMessage(event) {
    if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
      this.jumpToTime(event.data.time);
    }
  }

  handleSubtitleScroll() {
    this._scheduleVirtualRender();
  }

  handleContainerMouseEnter() {
    this.turnOffAutoSub();
  }

  handleContainerMouseLeave() {
    this.turnOnAutoSub();
  }

  handleVideoEnded() {
    this.turnOffAutoSub();
  }

  handleVideoPause() {
    this.turnOffAutoSub();
  }

  handleVideoPlay() {
    this.turnOnAutoSub();
  }

  // ==================================================================================
  // Public API: 初始化与数据更新
  // ==================================================================================

  /**
   * 初始化字幕列表并进行 UI 渲染挂载
   * @param {Array} subtitles 标准化的字幕数组
   */
  initialize(subtitles) {
    this.bilingualSubtitles = subtitles || [];
    if (this.bilingualSubtitles.length > 0) {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 外部触发更新字幕数据（例如切换视频语言、分句或者翻译完成后）
   * @param {Array} subtitles 标准化的字幕数组
   */
  setBilingualSubtitles(subtitles) {
    this.bilingualSubtitles = subtitles || [];

    if (this.subtitleListEl) {
      // 如果 UI 已存在，尝试增量渲染更新以提升性能
      this.updateBilingualSubtitles();
    } else if (this.bilingualSubtitles.length > 0) {
      // 如果 UI 不存在，重新创建
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 销毁实例，解绑所有事件、释放定时器、取消进行中的异步渲染并清理 DOM 节点防止内存泄露
   */
  destroy() {
    this.turnOffAutoSub();
    this._cancelChunkRender();
    this._cancelVirtualRender();
    this._removeEventListeners();
    document.removeEventListener("kiss-add-word", this.handleWordAdded);
    window.removeEventListener("message", this.handleJumpMessage);
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.subtitleScrollContainer = null;
    this.subtitleListUl = null;
    this.bilingualSubtitles = [];
    this._cachedSubtitleItems = [];
    this._virtualHeights = [];
    this._virtualOffsets = [0];
    this._pendingCenterIndex = -1;
    this.vocabulary = [];
  }

  // ==================================================================================
  // Chunk Rendering: 分块渲染工具方法
  // ==================================================================================

  /**
   * 取消正在进行的分块渲染，防止异步回调引发渲染混乱
   */
  _cancelChunkRender() {
    if (this._chunkRenderCancel) {
      this._chunkRenderCancel();
      this._chunkRenderCancel = null;
    }
  }

  /**
   * 在空闲时调度回调，兼容不支持 requestIdleCallback 的老旧浏览器环境
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
   * 分块异步渲染字幕列表，避免一次性创建数千个 DOM 节点导致网页严重卡顿甚至假死
   * @param {HTMLUListElement} ul 字幕列表的 ul 元素
   */
  _renderSubtitlesInChunks(ul) {
    this.subtitleListUl = ul;
    this._resetVirtualMetrics();
    this._scheduleVirtualRender(true);
  }

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

  _renderVirtualSubtitles(force = false) {
    if (!this.subtitleListUl || !this.subtitleScrollContainer) return;

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

  _measureVisibleSubtitleItems() {
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
  // Logic: 核心业务逻辑 (跳转、添加单词、下载)
  // ==================================================================================

  /**
   * 跳转视频到指定时间
   * @param {number} timeMs 毫秒时间戳
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
        this._setActiveSubtitle(targetIndex, this.activeTab === "subtitles");
      }

      // 跳转后如果视频处于暂停状态，自动恢复播放
      if (this.videoEl.paused) {
        this.videoEl.play();
      }
    }
  }

  /**
   * 监听并响应“添加生词”事件的回调函数
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
   * 添加或合并更新生词数据至局部生词本列表中
   */
  addWord(
    word,
    phonetic = "",
    definition = "",
    examples = [],
    timestamp = null
  ) {
    if (!word) return;

    const existingIndex = this.vocabulary.findIndex(
      (item) => item.word === word
    );

    if (existingIndex !== -1) {
      // 单词已存在时，进行属性合并更新（补充音标、释义、例句等）
      const currentItem = this.vocabulary[existingIndex];
      if (phonetic) currentItem.phonetic = phonetic;
      if (definition) currentItem.definition = definition;
      if (examples.length > 0) currentItem.examples = examples;
      if (timestamp) currentItem.timestamp = timestamp;
    } else {
      // 新增单词记录
      this.vocabulary.push({ word, phonetic, definition, examples, timestamp });
    }

    // 如果生词本当前处于显示 Tab，则立即重绘列表；若处于隐藏 Tab，仅标记 Dirty 并在切换时再绘制
    if (this.activeTab === "vocabulary") {
      this._renderVocabulary();
    } else {
      this._vocabularyDirty = true;
    }
  }

  /**
   * 触发下载操作：将当前的双语字幕数组整理并构造成标准的双语 VTT 格式文件下载
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

  // ==================================================================================
  // UI Rendering: 界面构建
  // ==================================================================================

  /**
   * 创建侧边悬浮面板的主 DOM 结构并触发内容分块渲染
   */
  createSubtitleList() {
    if (!this.videoEl) return;

    // 1. 确保主悬浮容器已创建在页面上
    this._ensureContainer();

    // 2. 如果容器刚刚新建尚未渲染内容，构建 Tab 页头和各 Tab 视图结构
    if (this.container.children.length === 0) {
      this._renderTabsAndStructure();
    }

    // 3. 取消任何进行中的旧分块渲染，防止数据源变化导致覆盖错位
    this._cancelChunkRender();

    // 4. 清空字幕 DOM 列表并启动异步分块渲染
    const ul = this.subtitleListEl.querySelector("ul");
    ul.replaceChildren();
    this._renderSubtitlesInChunks(ul);

    // 5. 渲染生词本列表
    this._renderVocabulary();
  }

  /**
   * 确保主悬浮容器存在并自适应暗黑/浅色模式，注入对应的 CSS 变量系统
   */
  _ensureContainer() {
    this.container = document.getElementById(
      "kiss-youtube-subtitle-list-container"
    );
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      this.container.className = "notranslate"; // 避免被其他浏览器翻译插件二次翻译
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
        maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        marginBottom: "12px",
      });
      // 默认将面板挂载到 YouTube 右侧“次要内容推荐”栏的顶部
      const secondary = document.getElementById("secondary-inner");
      if (secondary) secondary.prepend(this.container);

      // 异步读取设置项，自适应检测 YouTube 原生页面暗黑模式偏好，并注入相匹配的主题色变量系统
      (async () => {
        try {
          const setting = await getSettingWithDefault();
          const darkMode = setting?.darkMode;
          const prefersDark =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;
          const isDark =
            darkMode === "dark" || (darkMode === "auto" && prefersDark);

          const lightVars = {
            "--kt-bg": "rgba(255, 255, 255, 0.9)",
            "--kt-border": "1px solid rgba(0, 0, 0, 0.1)",
            "--kt-text": "#333",
            "--kt-subtext": "#666",
            "--kt-primary": "#1e88e5",
            "--kt-time-bg": "rgba(30, 136, 229, 0.1)",
            "--kt-divider": "rgba(240,240,240,0.6)",
            "--kt-active-bg": "rgba(30, 136, 229, 0.1)",
            "--kt-btn-bg": "var(--kt-primary)",
            "--kt-btn-color": "white",
            "--kt-btn-border": "none",
            "--kt-btn-hover-bg": "rgba(30,136,229,0.85)",
          };

          const darkVars = {
            "--kt-bg": "rgba(18,18,18,0.85)",
            "--kt-border": "1px solid rgba(255, 255, 255, 0.06)",
            "--kt-text": "#e6e6e6",
            "--kt-subtext": "#bdbdbd",
            "--kt-primary": "#90caf9",
            "--kt-time-bg": "rgba(144,202,249,0.08)",
            "--kt-divider": "rgba(255,255,255,0.06)",
            "--kt-active-bg": "rgba(144,202,249,0.12)",
            "--kt-btn-bg": "linear-gradient(180deg,#0f0f0f,#1b1b1b)",
            "--kt-btn-color": "#e6e6e6",
            "--kt-btn-border": "1px solid rgba(255,255,255,0.04)",
            "--kt-btn-hover-bg": "linear-gradient(180deg,#141414,#262626)",
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
  }

  /**
   * 渲染 Tabs 页头、关闭按钮、内容骨架区域等结构
   */
  _renderTabsAndStructure() {
    // 创建头部容器
    const tabHeader = document.createElement("div");
    tabHeader.style.cssText = `display: flex; border-bottom: 1px solid var(--kt-divider); padding: 0 16px; flex-shrink: 0;`;

    const subtitleTab = document.createElement("button");
    subtitleTab.textContent = "双语字幕";
    const vocabularyTab = document.createElement("button");
    vocabularyTab.textContent = "生词本";

    // 切换 Tab 的高亮样式定制
    const styleTab = (tab, isActive) => {
      tab.style.cssText = `padding: 12px 16px; cursor: pointer; border: none; background: transparent; font-size: 15px; font-weight: ${isActive ? "600" : "500"}; color: ${isActive ? "var(--kt-primary)" : "var(--kt-text)"}; border-bottom: 2px solid ${isActive ? "var(--kt-primary)" : "transparent"}; margin-bottom: -1px; outline: none;`;
    };

    // 关闭侧边栏的“叉叉”按钮
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;"; // × 符号
    closeBtn.title = "Close";
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
      this.destroy(); // 销毁整个容器并清理挂载事件
    });

    closeBtn.addEventListener(
      "mouseenter",
      () => (closeBtn.style.color = "var(--kt-text)")
    );
    closeBtn.addEventListener(
      "mouseleave",
      () => (closeBtn.style.color = "var(--kt-subtext)")
    );

    // 内容区主包装容器 (限制内部局部滚动，防止触发外部页面滚动)
    const tabContentContainer = document.createElement("div");
    tabContentContainer.style.cssText = `overflow: hidden; flex-grow: 1; display: flex; flex-direction: column; height: calc(100% - 40px);`;

    // 1. 字幕列表 Tab 面板
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "kiss-youtube-subtitle-list";
    this.subtitleListEl.style.cssText = `display: flex; flex-direction: column; height: 100%; overflow: hidden;`;

    //    1.1 字幕操作区工具栏 (固定在字幕上方)
    const subActionBar = document.createElement("div");
    subActionBar.style.cssText = `padding: 10px 16px; border-bottom: 1px solid var(--kt-divider); display: flex; justify-content: center; flex-shrink: 0;`;

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "下载字幕 (VTT)";
    downloadBtn.style.cssText = `padding: 6px 12px; background: var(--kt-btn-bg); color: var(--kt-btn-color); border: var(--kt-btn-border); border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 220ms ease, color 200ms ease, transform 160ms ease;`;

    downloadBtn.addEventListener("mouseenter", () => {
      try {
        const hover = getComputedStyle(this.container).getPropertyValue(
          "--kt-btn-hover-bg"
        );
        if (hover) downloadBtn.style.background = hover;
        downloadBtn.style.transform = "translateY(-1px)";
      } catch (e) {}
    });
    downloadBtn.addEventListener("mouseleave", () => {
      try {
        const normal = getComputedStyle(this.container).getPropertyValue(
          "--kt-btn-bg"
        );
        if (normal) downloadBtn.style.background = normal;
        downloadBtn.style.transform = "translateY(0)";
      } catch (e) {}
    });
    downloadBtn.addEventListener("click", this.downloadSubtitles.bind(this));

    subActionBar.appendChild(downloadBtn);
    this.subtitleListEl.appendChild(subActionBar);

    //    1.2 字幕局部独立滚动容器
    this.subtitleScrollContainer = document.createElement("div");
    this.subtitleScrollContainer.style.cssText = `overflow-y: auto; flex: 1; padding: 0 16px; position: relative;`;
    this.subtitleScrollContainer.addEventListener(
      "scroll",
      this.handleSubtitleScroll,
      { passive: true }
    );

    //    1.3 字幕列表 UL 节点
    const subUl = document.createElement("ul");
    subUl.style.cssText = `list-style-type: none; padding: 0; margin: 0; position: relative;`;
    this.subtitleListUl = subUl;

    this.subtitleScrollContainer.appendChild(subUl);
    this.subtitleListEl.appendChild(this.subtitleScrollContainer);

    // 2. 生词本 Tab 面板
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    this.vocabularyListEl.style.cssText = `display: none; flex-direction: column; height: 100%; overflow: hidden;`;

    // --- Tab 切换点击事件绑定 ---
    subtitleTab.addEventListener("click", () => {
      this.activeTab = "subtitles";
      styleTab(subtitleTab, true);
      styleTab(vocabularyTab, false);
      this.subtitleListEl.style.display = "flex";
      this.vocabularyListEl.style.display = "none";
      this._scheduleVirtualRender(true);
    });
    vocabularyTab.addEventListener("click", () => {
      this.activeTab = "vocabulary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, true);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "flex";
      // 切换到生词本时，如果生词本发生过更改（标记为 dirty），立即触发重新渲染生词列表
      if (this._vocabularyDirty) {
        this._renderVocabulary();
        this._vocabularyDirty = false;
      }
    });

    styleTab(subtitleTab, true);
    styleTab(vocabularyTab, false);

    tabHeader.append(subtitleTab, vocabularyTab, closeBtn);
    tabContentContainer.append(this.subtitleListEl, this.vocabularyListEl);
    this.container.append(tabHeader, tabContentContainer);
  }

  /**
   * 创建单个字幕行元素 (DOM)
   */
  _createSubtitleListItem(sub, index) {
    const li = document.createElement("li");
    li.id = `kiss-youtube-item-${index}`;
    li.className = "kiss-youtube-item";
    li.dataset.index = index;
    li.dataset.time = sub.start;
    li.style.cssText = `cursor: pointer; padding: 12px 16px; border-bottom: 1px solid var(--kt-divider); transition: opacity 0.2s ease; opacity: 0.6; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;

    // 播放时间指示器 span
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
    timeSpan.style.cssText = `color: var(--kt-primary); font-weight: 600; margin-right: 10px; font-size: 12px; background: var(--kt-time-bg); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px;`;

    // 字幕内容文字包装容器
    const textContainer = document.createElement("div");
    textContainer.style.cssText = `flex-grow: 1;`;

    // 字幕原始语言
    const textSpan = document.createElement("div");
    textSpan.className = "kiss-youtube-original";
    textSpan.textContent = sub.text || "";
    textSpan.style.cssText = `color: var(--kt-text); font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;

    // 字幕翻译语言
    const translationEl = document.createElement("div");
    translationEl.className = "kiss-youtube-translation";
    translationEl.textContent = sub.translation || "";
    translationEl.style.display = sub.translation ? "block" : "none";
    translationEl.style.cssText = `color: var(--kt-subtext); font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;

    // 交互事件绑定：点击字幕跳跃视频播放时间点，鼠标悬停高亮
    li.addEventListener("click", () => this.jumpToTime(sub.start, index));
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
    li._translationEl = translationEl;

    return li;
  }

  /**
   * 当字幕源更新时的增量更新算法 (Diff 增量更新)
   */
  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;

    this._resetVirtualMetrics({ preserveHeights: true });
    this._scheduleVirtualRender(true);
  }

  /**
   * 增量更新单条字幕的译文 (O(log N) 检索更新算法)
   * 用二分查找快速定位 DOM 节点并修改，避免多语言分段翻译时高频重绘整个列表
   * @param {{ start: number, end?: number, text?: string, translation: string }} subtitleUpdate 单条字幕增量信息
   */
  updateSingleSubtitle(subtitleUpdate) {
    if (!this.subtitleListEl) return;

    const { start, translation } = subtitleUpdate;
    const targetIndex = this._findSubtitleIndexByStart(start);

    if (targetIndex === -1) return;

    // 更新数据源缓存
    this.bilingualSubtitles[targetIndex].translation = translation;

    // 只更新当前可见行；不可见字幕稍后会根据数据源重新渲染。
    const item = this._cachedSubtitleItems[targetIndex];
    if (item) {
      const translationEl =
        item._translationEl || item.querySelector(".kiss-youtube-translation");
      if (translationEl) {
        translationEl.textContent = translation || "";
        translationEl.style.display = translation ? "block" : "none";
        this._scheduleVirtualRender(true);
      }
    }
  }

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
  // Vocabulary Rendering & Export: 生词本相关
  // ==================================================================================

  /**
   * 渲染/重绘生词本面板
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
   * 创建生词导出操作区头部栏
   */
  _createExportContainer() {
    const exportContainer = document.createElement("div");
    exportContainer.style.cssText = `padding: 10px 16px; border-bottom: 1px solid var(--kt-divider); display: flex; justify-content: center; flex-shrink: 0; gap: 8px;`;

    // 如果生词本不为空，显示导出格式的动作按钮
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
   * 创建生词列表容器
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
   * 创建单个生词列表项卡片 (DOM)
   */
  _createVocabItemElement(item) {
    const vocabItem = document.createElement("div");
    vocabItem.style.cssText = `border-bottom: 1px solid var(--kt-divider); word-wrap: break-word; word-break: break-word;`;

    // 1. 单词行 (单词 + 音标 + 播放跳转按钮)
    const wordLine = document.createElement("div");
    wordLine.style.cssText = `display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;`;

    const wordEl = document.createElement("div");
    wordEl.textContent = item.word;
    wordEl.style.cssText = `color: var(--kt-text); font-weight: bold; font-size: 16px;`;
    wordLine.appendChild(wordEl);

    if (item.phonetic) {
      const phEl = document.createElement("div");
      const cleanPhonetic = item.phonetic;
      phEl.textContent = `[${cleanPhonetic}]`;
      phEl.style.cssText = `color: var(--kt-subtext); font-style: italic; font-size: 14px;`;
      wordLine.appendChild(phEl);
    }

    if (item.timestamp) {
      const tsBtn = document.createElement("button");
      tsBtn.textContent = `${this.millisToMinutesAndSeconds(item.timestamp)}`;
      tsBtn.style.cssText = `color: var(--kt-primary); background: none; border: none; padding: 0 4px; font-size: 14px; cursor: pointer;`;
      tsBtn.addEventListener("click", () => this.jumpToTime(item.timestamp));
      wordLine.appendChild(tsBtn);
    }
    vocabItem.appendChild(wordLine);

    // 2. 释义段落
    if (item.definition) {
      const defEl = document.createElement("div");
      defEl.textContent = item.definition;
      defEl.style.cssText = `color: var(--kt-text); margin: 8px 0; font-size: 14px; line-height: 1.4;`;
      vocabItem.appendChild(defEl);
    }

    // 3. 例句列表
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

  // --- 导出实现 ---

  // 导出为 JSON 格式文件
  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();

    const processedVocabulary = this.vocabulary.map((item) => {
      const newItem = { ...item };
      // 清理音标中可能包含的方括号，规范化导出数据
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

  // 导出为 CSV 格式文件
  exportVocabularyAsCsv() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();
    const header =
      "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";

    const rows = this.vocabulary.map((item) => {
      const escapeCSVField = (field) => {
        if (!field) return '""';
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      const cleanPhonetic = item.phonetic;
      const phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      const ex1 = item.examples?.[0];
      const ex2 = item.examples?.[1];

      let videoLink = "";
      // 拼接跳转对应时间点的时间参数，生成跳转链接
      if (item.timestamp && videoId) {
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

    // 添加 BOM 头 \uFEFF，防止中文导出在 Windows Excel 中打开出现乱码问题
    const csvContent = [
      `"${this._getYouTubeVideoTitle()}",,,,,,,`,
      `"${videoId ? `https://www.youtube.com/watch?v=${videoId}` : "生词本"}",,,,,,,`,
      `,,,,,,,,`,
      header,
      ...rows,
    ].join("\n");

    this._downloadFile("\uFEFF" + csvContent, "text/csv;charset=utf-8;", "csv");
  }

  // 导出为 Plain Text 纯文本
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

  // 导出为 Markdown 格式
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
  // Sync Logic: 字幕同步滚动
  // ==================================================================================

  // 绑定滚动事件相关监听器
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
   * 启动以 200ms 为步长的自动字幕滚动轮询
   */
  turnOnAutoSub() {
    this.turnOffAutoSub();
    // 视频本已暂停，无需启动轮询
    if (this.videoEl.paused) return;

    this.loopAutoScroll = setInterval(() => {
      // 各种阻断条件判定
      if (
        !this.videoEl ||
        this.activeTab !== "subtitles" ||
        this.bilingualSubtitles.length === 0
      )
        return;

      const currentTimeMs = this.videoEl.currentTime * 1000;
      // 利用二分法查找当前播放进度对应的字幕索引
      let currentIndex = this._binarySearchSubtitle(currentTimeMs);
      // 如果当前行未改变，则不触发任何 DOM 修改
      if (this._lastActiveIndex === currentIndex) return;

      this._setActiveSubtitle(currentIndex, true);
    }, 200);
  }

  _setActiveSubtitle(index, shouldScroll = false) {
    const previousIndex = this._lastActiveIndex;
    this._lastActiveIndex = index;

    this._updateSubtitleItemActive(previousIndex, false);
    this._updateSubtitleItemActive(index, true);

    if (shouldScroll && index !== -1) {
      this._scrollIndexIntoView(index);
    }
  }

  _updateSubtitleItemActive(index, isActive) {
    if (index === -1) return;

    const item = this._cachedSubtitleItems[index];
    if (!item) return;

    item.style.opacity = isActive ? 1 : 0.6;
    item.classList.toggle("active-subtitle", isActive);
  }

  _scrollIndexIntoView(index, { stabilizeAfterMeasure = true } = {}) {
    const container = this.subtitleScrollContainer;
    if (!container || index < 0 || index >= this.bilingualSubtitles.length) {
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
}
