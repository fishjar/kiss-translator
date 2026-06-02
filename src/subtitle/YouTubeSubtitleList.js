import { logger } from "../libs/log.js";
import { downloadBlobFile } from "../libs/utils.js";
import { buildBilingualVtt } from "./vtt.js";
import { getSettingWithDefault } from "../libs/storage.js";

/**
 * YouTube 字幕列表管理器
 *
 * 主要职责与功能：
 * 1. 负责在 YouTube 原生播放器的右侧/下方“次要推荐内容栏”中动态挂载和管理一个自适应暗黑/浅色主题的双语字幕滚动列表面板。
 * 2. 监听视频播放器的 timeupdate，在 ASR/手动字幕播放时计算高亮并自适应居中滚动对齐（基于 O(log N) 二分搜索）。
 * 3. 拦截鼠标 hover/划词事件广播，实现增量生词本收录功能。
 * 4. 支持将收录的生词以 JSON、CSV（带 Excel BOM 字符防乱码）、纯文本、Markdown 格式导出及下载。
 */
export class YouTubeSubtitleList {
  /**
   * @param {HTMLVideoElement} videoElement YouTube 的原生视频播放器 DOM 节点
   */
  constructor(videoElement) {
    this.videoEl = videoElement;

    // --- 数据源缓存 ---
    // 双语字幕主列表数组。结构：{ start: number, end: number, text: string, translation: string }
    this.bilingualSubtitles = [];
    // 生词本收录数组。结构：{ word, phonetic, definition, examples: [], timestamp }
    this.vocabulary = [];

    // --- DOM 节点引用缓存 ---
    this.container = null; // 右侧字幕/生词面板的最外层根容器节点
    this.subtitleListEl = null; // 字幕列表面板的 DOM 引用
    this.vocabularyListEl = null; // 生词本面板的 DOM 引用
    this.subtitleScrollContainer = null; // 字幕列表的专用独立纵向滚动容器
    this._cachedSubtitleItems = []; // 缓存每一个字幕行 li 节点引用的数组，避免在滚动同步高亮时高频执行 querySelector 带来的重排 (Reflow) 损耗，提升滚动性能

    // --- 状态控制 ---
    this.loopAutoScroll = null; // 自动同步滚动的轮询定时器 ID
    this.activeTab = "subtitles"; // 当前处于激活可见状态的 Tab 页签名称 ('subtitles' 或者是 'vocabulary')
    this._lastActiveIndex = -1; // 上一次被高亮标记的字幕行索引
    this._vocabularyDirty = false; // 惰性重绘标志位：若在生词 Tab 隐藏时收录了生词，先置为 true。当用户切换到生词 Tab 时再按需重绘 DOM，避免隐藏 DOM 的无效绘制开销
    this._chunkRenderCancel = null; // 记录当前分块渲染流程的取消回调函数，用于在重置或卸载时随时中断异步渲染流水线

    // --- 交互事件句柄绑定 ---
    this.handleWordAdded = this.handleWordAdded.bind(this);
    // 监听在视频字幕上 hover 或划词翻译触发后，弹窗模块向外广播的自定义 "kiss-add-word" 事件
    document.addEventListener("kiss-add-word", this.handleWordAdded);

    // 监听来自扩展侧边栏或主进程发送的跳转播放进度消息
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
        this.jumpToTime(event.data.time);
      }
    });
  }

  // ==================================================================================
  // 公有 API: 挂载初始化与数据响应机制
  // ==================================================================================

  /**
   * 初始化字幕面板并启动首次渲染与事件挂载
   * @param {Array} subtitles 初始格式化完毕的字幕数组
   */
  initialize(subtitles) {
    this.bilingualSubtitles = subtitles || [];
    if (this.bilingualSubtitles.length > 0) {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 外部更新数据源接口（如：AI 异步分块翻译追加完毕，或者切换了字幕语种）
   * 对面板应用 Diff 增量更新算法以最小化 DOM 操作代价。
   * @param {Array} subtitles 标准双语字幕数组
   */
  setBilingualSubtitles(subtitles) {
    this.bilingualSubtitles = subtitles || [];

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
   * 销毁器 - 全面解绑事件监听、注销定时器、强行中断进行中的异步分块渲染并清理 DOM 节点引用以防止内存泄漏
   */
  destroy() {
    this.turnOffAutoSub();
    this._cancelChunkRender();
    document.removeEventListener("kiss-add-word", this.handleWordAdded);
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.bilingualSubtitles = [];
    this._cachedSubtitleItems = [];
    this.vocabulary = [];
  }

  // ==================================================================================
  // 分块渲染 (Chunk Rendering) 优化层
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
   * 核心渲染优化算法：分块渲染 (Chunk Rendering) 字幕列表。
   *
   * ASR 自动字幕往往拥有数千行数据，如果一次性渲染几千个复杂的 li 节点，会导致浏览器主线程长任务 (Long Task) 爆表，
   * 页面出现明显卡顿甚至失去响应。
   * 本方法将字幕行拆分为每 100 行为一分块 (CHUNK_SIZE)，利用时间切片在主线程空闲帧中分批次挂载，保障了用户交互的平滑顺畅。
   *
   * @param {HTMLUListElement} ul - 待插入字幕行的列表根节点
   */
  _renderSubtitlesInChunks(ul) {
    const CHUNK_SIZE = 100; // 每个时间切片所处理的 DOM 数量
    const subtitles = this.bilingualSubtitles;

    this._cachedSubtitleItems = []; // 清空缓存容器

    const renderNextChunk = (startIndex) => {
      // 竞态及越界判定：如果当前索引已耗尽，或者列表已经被外部销毁，直接终止后续切片调度
      if (startIndex >= subtitles.length || !this.subtitleListEl) return;

      const end = Math.min(startIndex + CHUNK_SIZE, subtitles.length);
      const fragment = document.createDocumentFragment(); // 使用文档片段减少重绘次数
      for (let i = startIndex; i < end; i++) {
        const li = this._createSubtitleListItem(subtitles[i], i);
        this._cachedSubtitleItems[i] = li; // 缓存节点引用，提速 O(1) 高亮查表
        fragment.appendChild(li);
      }
      ul.appendChild(fragment);

      // 若未渲染完，向浏览器注册调度，在下一次空闲时间点再画下一个 Chunk
      if (end < subtitles.length && this.subtitleListEl) {
        this._scheduleIdle(() => renderNextChunk(end));
      }
    };

    renderNextChunk(0);
  }

  // ==================================================================================
  // 核心逻辑: 跳转、添加单词与字幕包下载
  // ==================================================================================

  /**
   * 跳转视频到指定的毫秒进度
   * @param {number} timeMs - 视频绝对播放点时间戳（毫秒）
   */
  jumpToTime(timeMs) {
    if (this.videoEl && Number.isFinite(timeMs)) {
      this.videoEl.currentTime = timeMs / 1000;
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
    if (this.container.children.length === 0) {
      this._renderTabsAndStructure();
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
        maxWidth: "400px",
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

      // 自适应主题：异步加载用户暗黑模式偏好，并嗅探原生系统的 prefers-color-scheme，写入对应的全局 CSS 变量系统
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
   * 绘制骨架、关闭按钮以及 Tab 切换卡
   */
  _renderTabsAndStructure() {
    // 1. 创建头部 Tab 区域
    const tabHeader = document.createElement("div");
    tabHeader.style.cssText = `display: flex; border-bottom: 1px solid var(--kt-divider); padding: 0 16px; flex-shrink: 0;`;

    const subtitleTab = document.createElement("button");
    subtitleTab.textContent = "双语字幕";
    const vocabularyTab = document.createElement("button");
    vocabularyTab.textContent = "生词本";

    // 动态控制 Tab 激活态与未激活态 CSS 的映射函数
    const styleTab = (tab, isActive) => {
      tab.style.cssText = `padding: 12px 16px; cursor: pointer; border: none; background: transparent; font-size: 15px; font-weight: ${isActive ? "600" : "500"}; color: ${isActive ? "var(--kt-primary)" : "var(--kt-text)"}; border-bottom: 2px solid ${isActive ? "var(--kt-primary)" : "transparent"}; margin-bottom: -1px; outline: none;`;
    };

    // 关闭侧边列表栏的“×”小按钮
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;";
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
      this.destroy(); // 卸载整个面板
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

    // 字幕滚动视口容器
    this.subtitleScrollContainer = document.createElement("div");
    this.subtitleScrollContainer.style.cssText = `overflow-y: auto; flex: 1; padding: 0 16px; position: relative;`;

    const subUl = document.createElement("ul");
    subUl.style.cssText = `list-style-type: none; padding: 16px 0; margin: 0;`;

    this.subtitleScrollContainer.appendChild(subUl);
    this.subtitleListEl.appendChild(this.subtitleScrollContainer);

    // ----------------------------------------------------
    // [Tab 2]: 生词本面板
    // ----------------------------------------------------
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    this.vocabularyListEl.style.cssText = `display: none; flex-direction: column; height: 100%; overflow: hidden;`;

    // Tab 点击事件联动
    subtitleTab.addEventListener("click", () => {
      this.activeTab = "subtitles";
      styleTab(subtitleTab, true);
      styleTab(vocabularyTab, false);
      this.subtitleListEl.style.display = "flex";
      this.vocabularyListEl.style.display = "none";
    });
    vocabularyTab.addEventListener("click", () => {
      this.activeTab = "vocabulary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, true);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "flex";
      // 点击切换时，若是生词被标记为 Dirty (未绘制最新变动)，在此统一重绘
      if (this._vocabularyDirty) {
        this._renderVocabulary();
        this._vocabularyDirty = false;
      }
    });

    // 缺省激活字幕 Tab
    styleTab(subtitleTab, true);
    styleTab(vocabularyTab, false);

    tabHeader.append(subtitleTab, vocabularyTab, closeBtn);
    tabContentContainer.append(this.subtitleListEl, this.vocabularyListEl);
    this.container.append(tabHeader, tabContentContainer);
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
    li.dataset.time = sub.start;
    li.style.cssText = `cursor: pointer; padding: 12px 16px; border-bottom: 1px solid var(--kt-divider); transition: opacity 0.2s ease; opacity: 0.6; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;

    // 播放起止时间标签
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
    timeSpan.style.cssText = `color: var(--kt-primary); font-weight: 600; margin-right: 10px; font-size: 12px; background: var(--kt-time-bg); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px;`;

    const textContainer = document.createElement("div");
    textContainer.style.cssText = `flex-grow: 1;`;

    // 字幕原文
    const textSpan = document.createElement("div");
    textSpan.className = "kiss-youtube-original";
    textSpan.textContent = sub.text || "";
    textSpan.style.cssText = `color: var(--kt-text); font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;

    // 字幕译文（在翻译未返回前默认隐藏 display: none）
    const translationEl = document.createElement("div");
    translationEl.className = "kiss-youtube-translation";
    translationEl.textContent = sub.translation || "";
    translationEl.style.display = sub.translation ? "block" : "none";
    translationEl.style.cssText = `color: var(--kt-subtext); font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;

    // 动作绑定：点击字幕整行，直接同步将视频进度拉至字幕开始时间轴
    li.addEventListener("click", () => this.jumpToTime(sub.start));
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

    return li;
  }

  /**
   * 差异增量更新字幕列表：
   * 针对流式加载或 AI 后续批次翻译返回的数据块进行增量挂载，避开低效的全量 DOM 清理重建。
   */
  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;

    if (this.bilingualSubtitles.length > this._cachedSubtitleItems.length) {
      // 1. 增量追加模式：数据量变多，说明有后续 AI 翻译块返回，仅对超出缓存数量的新增节点进行渲染并追加到末尾
      this._cancelChunkRender();
      const ul = this.subtitleListEl.querySelector("ul");
      if (ul) {
        const fragment = document.createDocumentFragment();
        for (
          let i = this._cachedSubtitleItems.length;
          i < this.bilingualSubtitles.length;
          i++
        ) {
          const sub = this.bilingualSubtitles[i];
          const li = this._createSubtitleListItem(sub, i);
          this._cachedSubtitleItems.push(li);
          fragment.appendChild(li);
        }
        ul.appendChild(fragment);
      }
    } else if (
      this.bilingualSubtitles.length < this._cachedSubtitleItems.length
    ) {
      // 2. 全量重设模式：数据量变少，说明切换了语言或者分句方式发生了根本变化。此时清空所有节点并开启新分块任务
      const ul = this.subtitleListEl.querySelector("ul");
      if (ul) {
        this._cancelChunkRender();
        ul.replaceChildren();
        this._renderSubtitlesInChunks(ul);
      }
      return;
    }
  }

  /**
   * 增量局部定向更新某一行字幕的译文内容：
   * 利用二分检索算法 (O(log N)) 在有序的字幕缓存数组中快速定位匹配目标时间轴的 DOM 节点，
   * 随后定向修改译文 textContent 并显示。由于无需重画周边节点，性能极佳。
   *
   * @param {object} subtitleUpdate - 含有 { start, translation } 的更新分片数据
   */
  updateSingleSubtitle(subtitleUpdate) {
    if (!this.subtitleListEl || !this._cachedSubtitleItems.length) return;

    const { start, translation } = subtitleUpdate;
    // 对有序的双语字幕数组进行二分精确匹配
    let left = 0,
      right = this.bilingualSubtitles.length - 1;
    let targetIndex = -1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sub = this.bilingualSubtitles[mid];
      if (sub.start === start) {
        targetIndex = mid;
        break;
      } else if (sub.start > start) right = mid - 1;
      else left = mid + 1;
    }

    if (targetIndex === -1) return;

    // 修改本地缓存数据
    this.bilingualSubtitles[targetIndex].translation = translation;

    // 获取缓存的 li 节点引用，进行局部修改
    const item = this._cachedSubtitleItems[targetIndex];
    if (item) {
      const translationEl = item.querySelector(".kiss-youtube-translation");
      if (translationEl) {
        translationEl.textContent = translation || "";
        translationEl.style.display = translation ? "block" : "none";
      }
    }
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

    // 鼠标划入字幕列表面板时，注销同步滚动定时器。允许用户自由用鼠标选词、划词查义或回滚浏览；
    // 鼠标移出面板时，重新激活滚动，保证视觉焦点重回当前视频播放进度。
    this.container.addEventListener("mouseenter", () => this.turnOffAutoSub());
    this.container.addEventListener("mouseleave", () => this.turnOnAutoSub());

    // 与视频的暂停、播放、结束等生命周期动作绑定联动
    this.videoEl.addEventListener("ended", () => this.turnOffAutoSub());
    this.videoEl.addEventListener("pause", () => this.turnOffAutoSub());
    this.videoEl.addEventListener("play", () => this.turnOnAutoSub());
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

      if (
        this.subtitleListEl &&
        currentIndex !== -1 &&
        this._cachedSubtitleItems[currentIndex]
      ) {
        // 清理上一次高亮字幕行的样式
        if (
          this._lastActiveIndex !== -1 &&
          this._cachedSubtitleItems[this._lastActiveIndex]
        ) {
          const lastEl = this._cachedSubtitleItems[this._lastActiveIndex];
          lastEl.style.opacity = 0.6;
          lastEl.classList.remove("active-subtitle");
        }

        // 高亮当前字幕行，并设置粗体字
        const currentEl = this._cachedSubtitleItems[currentIndex];
        currentEl.style.opacity = 1;
        currentEl.classList.add("active-subtitle");
        this._lastActiveIndex = currentIndex;

        // 计算当前高亮行在滚动面板中的垂直位置，并将字幕行居中显示
        const container = this.subtitleScrollContainer;
        if (container) {
          const elementTop = currentEl.offsetTop;
          const containerHeight = container.clientHeight;
          const elementHeight = currentEl.clientHeight;

          // 使用 'auto' 进行即时位置定位，不用 smooth 是为了防止高频微小的跳转重叠造成滚动抖动卡顿
          container.scrollTo({
            top: elementTop - containerHeight / 2 + elementHeight / 2,
            behavior: "auto",
          });
        }
      }
    }, 200);
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

      if (timeMs >= sub.start && timeMs <= sub.end) {
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
