import { logger } from "../libs/log.js";
import { downloadBlobFile } from "../libs/utils.js";
import { buildBilingualVtt } from "./vtt.js";

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
    // 统一字幕数据结构: { start: number, end: number, text: string, translation: string }
    this.bilingualSubtitles = [];
    // 生词数据结构: { word, phonetic, definition, examples: [], timestamp }
    this.vocabulary = [];

    // --- DOM 引用 ---
    this.container = null; // 主容器
    this.subtitleListEl = null; // 字幕列表面板
    this.vocabularyListEl = null; // 生词本面板
    this.subtitleScrollContainer = null; //
    this._cachedSubtitleItems = []; // 缓存字幕列表项 DOM，减少 querySelector 调用，提升滚动性能

    // --- 状态管理 ---
    this.loopAutoScroll = null; // 自动滚动的定时器 ID
    this.activeTab = "subtitles"; // 当前激活的 Tab: 'subtitles' 或 'vocabulary'
    this._lastActiveIndex = -1; // 上一次高亮的字幕索引

    // --- 事件绑定 ---
    this.handleWordAdded = this.handleWordAdded.bind(this);
    document.addEventListener("kiss-add-word", this.handleWordAdded);

    // 监听来自外部（如选项页面）的跳转指令
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
        this.jumpToTime(event.data.time);
      }
    });
  }

  // ==================================================================================
  // Public API: 初始化与数据更新
  // ==================================================================================

  /**
   * 初始化字幕列表
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
   * 更新字幕数据（例如切换语言或翻译完成后）
   * @param {Array} subtitles 标准化的字幕数组
   */
  setBilingualSubtitles(subtitles) {
    this.bilingualSubtitles = subtitles || [];

    if (this.subtitleListEl) {
      // 如果 UI 已存在，尝试增量更新以提升性能
      this.updateBilingualSubtitles();
    } else if (this.bilingualSubtitles.length > 0) {
      // 如果 UI 不存在，创建 UI
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 销毁实例，清理 DOM 和事件监听
   */
  destroy() {
    this.turnOffAutoSub();
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
  // Logic: 核心业务逻辑 (跳转、添加单词、下载)
  // ==================================================================================

  /**
   * 跳转视频到指定时间
   * @param {number} timeMs 毫秒时间戳
   */
  jumpToTime(timeMs) {
    if (this.videoEl && Number.isFinite(timeMs)) {
      this.videoEl.currentTime = timeMs / 1000;
      if (this.videoEl.paused) {
        this.videoEl.play();
      }
    }
  }

  /**
   * 处理添加单词事件
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
   * 添加或更新单词到生词本
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
      // 单词已存在，合并/更新信息
      const currentItem = this.vocabulary[existingIndex];
      if (phonetic) currentItem.phonetic = phonetic;
      if (definition) currentItem.definition = definition;
      if (examples.length > 0) currentItem.examples = examples;
      if (timestamp) currentItem.timestamp = timestamp;
    } else {
      // 新增单词
      this.vocabulary.push({ word, phonetic, definition, examples, timestamp });
    }
    // 重新渲染生词本界面
    this._renderVocabulary();
  }

  /**
   * 下载当前双语字幕为 VTT 文件
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
   * 创建主容器和列表结构
   */
  createSubtitleList() {
    if (!this.videoEl) return;

    // 1. 确保主容器存在
    this._ensureContainer();

    // 2. 如果容器为空，初始化 Tab 结构和面板
    if (this.container.children.length === 0) {
      this._renderTabsAndStructure();
    }

    // 3. 渲染字幕列表内容
    const ul = this.subtitleListEl.querySelector("ul");
    ul.replaceChildren();
    this._cachedSubtitleItems = []; // 重置缓存

    // 使用 DocumentFragment 批量插入，减少重排
    const fragment = document.createDocumentFragment();
    this.bilingualSubtitles.forEach((sub, i) => {
      const li = this._createSubtitleListItem(sub, i);
      this._cachedSubtitleItems.push(li);
      fragment.appendChild(li);
    });
    ul.appendChild(fragment);

    // 4. 渲染生词本（初始为空或已有数据）
    this._renderVocabulary();
  }

  /**
   * 确保主悬浮容器存在并设置样式
   */
  _ensureContainer() {
    this.container = document.getElementById(
      "kiss-youtube-subtitle-list-container"
    );
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      this.container.className = "notranslate";
      Object.assign(this.container.style, {
        height: "calc(100vh - 220px)",
        maxHeight: "none",
        zIndex: "999",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(10px)",
        top: "60px",
        right: "0",
        fontSize: "14px",
        padding: "0",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "8px",
        minWidth: "320px",
        maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
      });
      // 将容器插入到 YouTube 页面右侧栏 (secondary) 的顶部
      const secondary = document.getElementById("secondary");
      if (secondary) secondary.prepend(this.container);
    }
  }

  /**
   * 渲染 Tabs 头部和内容区域结构
   */
  _renderTabsAndStructure() {
    // --- Header & Tabs (保持不变) ---
    const tabHeader = document.createElement("div");
    tabHeader.style.cssText = `display: flex; border-bottom: 1px solid #eee; padding: 0 16px; flex-shrink: 0;`;

    const subtitleTab = document.createElement("button");
    subtitleTab.textContent = "双语字幕";
    const vocabularyTab = document.createElement("button");
    vocabularyTab.textContent = "生词本";

    const styleTab = (tab, isActive) => {
      tab.style.cssText = `padding: 12px 16px; cursor: pointer; border: none; background: transparent; font-size: 15px; font-weight: ${isActive ? "600" : "500"}; color: ${isActive ? "#1e88e5" : "#555"}; border-bottom: 2px solid ${isActive ? "#1e88e5" : "transparent"}; margin-bottom: -1px; outline: none;`;
    };

    // --- Content Area ---
    const tabContentContainer = document.createElement("div");
    // 【修改点 1】这里改为 overflow: hidden，不再让外层滚动
    tabContentContainer.style.cssText = `overflow: hidden; flex-grow: 1; display: flex; flex-direction: column; height: calc(100% - 40px);`;

    // 1. Subtitle Panel
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "kiss-youtube-subtitle-list";
    // 【修改点 2】Subtitle Panel 改为 Flex Column 布局，高度 100%
    this.subtitleListEl.style.cssText = `display: flex; flex-direction: column; height: 100%; overflow: hidden;`;

    //    1.1 Subtitle Action Bar (固定在顶部)
    const subActionBar = document.createElement("div");
    subActionBar.style.cssText = `padding: 10px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: center; flex-shrink: 0;`;

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "下载字幕 (VTT)";
    downloadBtn.style.cssText = `padding: 6px 12px; background: #1e88e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;`;
    downloadBtn.addEventListener("click", this.downloadSubtitles.bind(this));

    subActionBar.appendChild(downloadBtn);
    this.subtitleListEl.appendChild(subActionBar);

    //    1.2 Subtitle Scroll Container (【新增】专门的滚动容器)
    this.subtitleScrollContainer = document.createElement("div");
    this.subtitleScrollContainer.style.cssText = `overflow-y: auto; flex: 1; padding: 0 16px; position: relative;`;

    //    1.3 Subtitle List UL
    const subUl = document.createElement("ul");
    // padding 移到 scrollContainer 上或者保持在这里，这里 margin: 0 即可
    subUl.style.cssText = `list-style-type: none; padding: 16px 0; margin: 0;`;

    this.subtitleScrollContainer.appendChild(subUl);
    this.subtitleListEl.appendChild(this.subtitleScrollContainer);

    // 2. Vocabulary Panel (保持不变，它本来就是 Flex 结构)
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    this.vocabularyListEl.style.cssText = `display: none; flex-direction: column; height: 100%; overflow: hidden;`;

    // --- Tab Switching Logic ---
    subtitleTab.addEventListener("click", () => {
      this.activeTab = "subtitles";
      styleTab(subtitleTab, true);
      styleTab(vocabularyTab, false);
      // 注意：这里用 flex 还是 block 取决于外层布局，display: flex 配合 flex-direction: column 更好
      this.subtitleListEl.style.display = "flex";
      this.vocabularyListEl.style.display = "none";
    });
    vocabularyTab.addEventListener("click", () => {
      this.activeTab = "vocabulary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, true);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "flex";
      this._renderVocabulary();
    });

    styleTab(subtitleTab, true);
    styleTab(vocabularyTab, false);

    tabHeader.append(subtitleTab, vocabularyTab);
    tabContentContainer.append(this.subtitleListEl, this.vocabularyListEl);
    this.container.append(tabHeader, tabContentContainer);
  }

  /**
   * 创建单个字幕行元素
   */
  _createSubtitleListItem(sub, index) {
    const li = document.createElement("li");
    li.id = `kiss-youtube-item-${index}`;
    li.className = "kiss-youtube-item";
    li.dataset.time = sub.start;
    li.style.cssText = `cursor: pointer; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; transition: all 0.2s ease; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;

    // 时间戳
    const timeSpan = document.createElement("span");
    timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
    timeSpan.style.cssText = `color: #1e88e5; font-weight: 600; margin-right: 10px; font-size: 12px; background: rgba(30, 136, 229, 0.1); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px;`;

    // 文本容器
    const textContainer = document.createElement("div");
    textContainer.style.cssText = `flex-grow: 1;`;

    // 原文
    const textSpan = document.createElement("div");
    textSpan.className = "kiss-youtube-original";
    textSpan.textContent = sub.text || "";
    textSpan.style.cssText = `color: #333; font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;

    // 译文
    const translationEl = document.createElement("div");
    translationEl.className = "kiss-youtube-translation";
    translationEl.textContent = sub.translation || "";
    translationEl.style.display = sub.translation ? "block" : "none";
    translationEl.style.cssText = `color: #666; font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;

    // 事件
    li.addEventListener("click", () => this.jumpToTime(sub.start));
    li.addEventListener("mouseenter", () => {
      if (!li.classList.contains("active-subtitle"))
        li.style.backgroundColor = "rgba(30, 136, 229, 0.05)";
    });
    li.addEventListener("mouseleave", () => {
      if (!li.classList.contains("active-subtitle"))
        li.style.backgroundColor = "transparent";
    });

    textContainer.appendChild(textSpan);
    textContainer.appendChild(translationEl);
    li.appendChild(timeSpan);
    li.appendChild(textContainer);

    return li;
  }

  /**
   * 更新现有的双语字幕列表 (Diff Update)
   * 策略：如果数据长度不变，仅更新文本内容以提高性能；如果长度变了，重建列表。
   */
  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;

    // 1. 结构变化检测
    if (this.bilingualSubtitles.length !== this._cachedSubtitleItems.length) {
      const ul = this.subtitleListEl.querySelector("ul");
      if (ul) {
        ul.replaceChildren();
        this._cachedSubtitleItems = [];
        const fragment = document.createDocumentFragment();
        this.bilingualSubtitles.forEach((sub, i) => {
          const li = this._createSubtitleListItem(sub, i);
          this._cachedSubtitleItems.push(li);
          fragment.appendChild(li);
        });
        ul.appendChild(fragment);
      }
      return;
    }

    // 2. 内容更新 (DOM 复用)
    for (let i = 0; i < this.bilingualSubtitles.length; i++) {
      const sub = this.bilingualSubtitles[i];
      const item = this._cachedSubtitleItems[i];

      if (item && sub) {
        // 更新时间绑定
        item.dataset.time = sub.start;
        // 更新时间显示
        const timeSpan = item.firstElementChild;
        if (timeSpan)
          timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
        // 更新原文
        const textSpan = item.querySelector(".kiss-youtube-original");
        if (textSpan) textSpan.textContent = sub.text || "";
        // 更新译文
        const translationEl = item.querySelector(".kiss-youtube-translation");
        if (translationEl) {
          translationEl.textContent = sub.translation || "";
          translationEl.style.display = sub.translation ? "block" : "none";
        }
      }
    }
  }

  // ==================================================================================
  // Vocabulary Rendering & Export: 生词本相关
  // ==================================================================================

  /**
   * 渲染整个生词本面板
   */
  _renderVocabulary() {
    if (!this.vocabularyListEl) return;

    this.vocabularyListEl.replaceChildren();
    const exportContainer = this._createExportContainer();
    const vocabListContainer = this._createVocabListContainer();

    this.vocabularyListEl.appendChild(exportContainer);
    this.vocabularyListEl.appendChild(vocabListContainer);
  }

  /**
   * 创建生词本的导出按钮区域
   */
  _createExportContainer() {
    const exportContainer = document.createElement("div");
    exportContainer.style.cssText = `padding: 10px 16px; border-bottom: 1px solid #eee; display: flex; justify-content: center; flex-shrink: 0; gap: 8px;`;

    if (this.vocabulary.length > 0) {
      const createBtn = (text, handler) => {
        const btn = document.createElement("button");
        btn.textContent = text;
        btn.style.cssText = `padding: 6px 12px; background: #1e88e5; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;`;
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
      const emptyTip = document.createElement("span");
      emptyTip.textContent = "暂无生词，在字幕中添加";
      emptyTip.style.color = "#999";
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
   * 创建单个生词卡片元素
   */
  _createVocabItemElement(item) {
    const vocabItem = document.createElement("div");
    vocabItem.style.cssText = `padding: 12px; border-bottom: 1px solid #eee; word-wrap: break-word; word-break: break-word;`;

    // 1. 单词行 (单词 + 音标 + 时间跳转)
    const wordLine = document.createElement("div");
    wordLine.style.cssText = `display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;`;

    const wordEl = document.createElement("div");
    wordEl.textContent = item.word;
    wordEl.style.cssText = `font-weight: bold; font-size: 16px;`;
    wordLine.appendChild(wordEl);

    if (item.phonetic) {
      const phEl = document.createElement("div");
      const cleanPhonetic = item.phonetic;
      phEl.textContent = `[${cleanPhonetic}]`;
      phEl.style.cssText = `color: #666; font-style: italic; font-size: 14px;`;
      wordLine.appendChild(phEl);
    }

    if (item.timestamp) {
      const tsBtn = document.createElement("button");
      tsBtn.textContent = `${this.millisToMinutesAndSeconds(item.timestamp)}`;
      tsBtn.style.cssText = `color: #1e88e5; background: none; border: none; padding: 0 4px; font-size: 14px; cursor: pointer;`;
      tsBtn.addEventListener("click", () => this.jumpToTime(item.timestamp));
      wordLine.appendChild(tsBtn);
    }
    vocabItem.appendChild(wordLine);

    // 2. 释义
    if (item.definition) {
      const defEl = document.createElement("div");
      defEl.textContent = item.definition;
      defEl.style.cssText = `color: #333; margin: 8px 0; font-size: 14px; line-height: 1.4;`;
      vocabItem.appendChild(defEl);
    }

    // 3. 例句
    if (item.examples && item.examples.length > 0) {
      const exContainer = document.createElement("div");
      exContainer.style.cssText = `color: #666; font-size: 13px; line-height: 1.4;`;
      item.examples.forEach((ex) => {
        const exItem = document.createElement("div");
        exItem.style.marginBottom = "8px";
        const eng = document.createElement("div");
        eng.textContent = ex.eng;
        exItem.appendChild(eng);
        if (ex.chs) {
          const chs = document.createElement("div");
          chs.textContent = ex.chs;
          chs.style.cssText = `color: #888; font-style: italic;`;
          exItem.appendChild(chs);
        }
        exContainer.appendChild(exItem);
      });
      vocabItem.appendChild(exContainer);
    }

    return vocabItem;
  }

  // --- 导出实现 ---

  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;
    const videoId = this._getYouTubeVideoId();

    const processedVocabulary = this.vocabulary.map((item) => {
      const newItem = { ...item };
      // 清理音标格式
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

    // 添加 BOM \uFEFF 解决 Excel 中文乱码
    const csvContent = [
      `"${this._getYouTubeVideoTitle()}",,,,,,,`,
      `"${videoId ? `https://www.youtube.com/watch?v=${videoId}` : "生词本"}",,,,,,,`,
      `,,,,,,,,`,
      header,
      ...rows,
    ].join("\n");

    this._downloadFile("\uFEFF" + csvContent, "text/csv;charset=utf-8;", "csv");
  }

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

  setupEventListeners() {
    if (!this.container || !this.videoEl) return;
    // 鼠标悬停时停止自动滚动，提升用户体验
    this.container.addEventListener("mouseenter", () => this.turnOffAutoSub());
    this.container.addEventListener("mouseleave", () => this.turnOnAutoSub());

    // 视频事件联动
    this.videoEl.addEventListener("ended", () => this.turnOffAutoSub());
    this.videoEl.addEventListener("pause", () => this.turnOffAutoSub());
    this.videoEl.addEventListener("play", () => this.turnOnAutoSub());
  }

  /**
   * 启动自动滚动检测循环
   */
  turnOnAutoSub() {
    this.turnOffAutoSub();
    if (this.videoEl.paused) return;

    this.loopAutoScroll = setInterval(() => {
      if (
        !this.videoEl ||
        this.activeTab !== "subtitles" ||
        this.bilingualSubtitles.length === 0
      )
        return;

      const currentTimeMs = this.videoEl.currentTime * 1000;
      let currentIndex = this._binarySearchSubtitle(currentTimeMs);

      if (
        this.subtitleListEl &&
        currentIndex !== -1 &&
        this._cachedSubtitleItems[currentIndex]
      ) {
        // 移除旧高亮
        if (
          this._lastActiveIndex !== -1 &&
          this._cachedSubtitleItems[this._lastActiveIndex]
        ) {
          const lastEl = this._cachedSubtitleItems[this._lastActiveIndex];
          lastEl.style.fontWeight = "normal";
          lastEl.style.backgroundColor = "transparent";
          lastEl.classList.remove("active-subtitle");
        }

        // 添加新高亮
        const currentEl = this._cachedSubtitleItems[currentIndex];
        currentEl.style.fontWeight = "600";
        currentEl.style.backgroundColor = "rgba(30, 136, 229, 0.1)";
        currentEl.classList.add("active-subtitle");
        this._lastActiveIndex = currentIndex;

        // 【修复点】：移除未使用的 targetScrollTop 变量，使用 clean 的居中计算逻辑
        const container = this.subtitleScrollContainer;
        if (container) {
          const elementTop = currentEl.offsetTop;
          const containerHeight = container.clientHeight;
          const elementHeight = currentEl.clientHeight;

          container.scrollTo({
            // 计算公式：元素顶部位置 - 容器一半高度 + 元素一半高度 = 元素居中
            top: elementTop - containerHeight / 2 + elementHeight / 2,
            behavior: "smooth",
          });
        }
      }
    }, 200);
  }

  /**
   * 二分查找：根据当前时间找到对应的字幕索引
   * 复杂度 O(log n)，远优于线性查找
   */
  _binarySearchSubtitle(timeMs) {
    let left = 0;
    let right = this.bilingualSubtitles.length - 1;
    let bestMatch = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const sub = this.bilingualSubtitles[mid];

      if (timeMs >= sub.start && timeMs <= sub.end) {
        return mid; // 精确命中时间区间
      } else if (timeMs < sub.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
        bestMatch = mid; // 如果没有精确命中，记录最接近的上一句
      }
    }
    return bestMatch;
  }

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
   * 将文件内容转为 Blob 并触发下载
   */
  _downloadFile(content, mimeType, extension) {
    const blob = new Blob([content], { type: mimeType });
    downloadBlobFile(
      blob,
      `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.${extension}`
    );
  }

  /**
   * 格式化时间：毫秒 -> MM:SS
   */
  millisToMinutesAndSeconds(millis) {
    if (!Number.isFinite(millis)) return "0:00";
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  _getYouTubeVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("v");
    } catch (e) {
      return null;
    }
  }

  _getYouTubeVideoTitle() {
    try {
      const titleElement = document.querySelector("h1 yt-formatted-string");
      return titleElement ? titleElement.textContent : "YouTube Video";
    } catch (e) {
      return "YouTube Video";
    }
  }
}
