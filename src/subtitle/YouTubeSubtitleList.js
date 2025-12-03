import { logger } from "../libs/log.js";

/**
 * YouTube 字幕列表管理器
 * 负责在 YouTube 视频播放时显示同步滚动的字幕列表和生词本
 */
export class YouTubeSubtitleList {
  constructor(videoElement) {
    this.videoEl = videoElement;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.bilingualSubtitles = [];
    // 现在存储包含完整信息的对象数组：{word, phonetic, definition, examples, timestamp}
    this.vocabulary = [];

    this.container = null;
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.loopAutoScroll = null;

    this.activeTab = "subtitles"; // 'subtitles' or 'vocabulary'

    this.handleWordAdded = this.handleWordAdded.bind(this);
    document.addEventListener("kiss-add-word", this.handleWordAdded);

    // 监听来自选项页面的跳转消息
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "KISS_TRANSLATOR_JUMP_TO_TIME") {
        if (this.videoEl) {
          this.videoEl.currentTime = event.data.time / 1000;
          if (this.videoEl.paused) {
            this.videoEl.play();
          }
        }
      }
    });
  }

  handleWordAdded(event) {
    if (event.detail && event.detail.word) {
      // 现在可以接收完整的单词信息，包括时间戳
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
   * Public method to add a word to the vocabulary list.
   * @param {string} word The word to add.
   * @param {string} phonetic The phonetic of the word.
   * @param {string} definition The definition of the word.
   * @param {Array} examples The examples of the word usage.
   * @param {number} timestamp The timestamp when the word appeared in the video.
   */
  addWord(
    word,
    phonetic = "",
    definition = "",
    examples = [],
    timestamp = null
  ) {
    if (word) {
      // 检查单词是否已存在
      const existingIndex = this.vocabulary.findIndex(
        (item) => item.word === word
      );
      if (existingIndex !== -1) {
        // 如果单词已存在且提供了新的信息，则更新信息
        const currentItem = this.vocabulary[existingIndex];
        if (phonetic && !currentItem.phonetic) {
          currentItem.phonetic = phonetic;
        }
        if (definition && !currentItem.definition) {
          currentItem.definition = definition;
        }
        if (
          examples.length > 0 &&
          (!currentItem.examples || currentItem.examples.length === 0)
        ) {
          currentItem.examples = examples;
        }
        // 更新时间戳（如果提供）
        if (timestamp && !currentItem.timestamp) {
          currentItem.timestamp = timestamp;
        }
      } else {
        // 添加新单词
        this.vocabulary.push({
          word,
          phonetic,
          definition,
          examples,
          timestamp,
        });
      }
      this._renderVocabulary();
    }
  }

  _renderVocabulary() {
    if (!this.vocabularyListEl) return;

    this.vocabularyListEl.innerHTML = ""; // Clear existing words

    // Create export button
    const exportContainer = document.createElement("div");
    exportContainer.style.cssText = `
      padding: 10px 16px;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: flex-end;
      flex-shrink: 0;
    `;

    if (this.vocabulary.length > 0) {
      const exportButton = document.createElement("button");
      exportButton.textContent = "导出JSON";
      exportButton.style.cssText = `
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-right: 8px;
      `;

      exportButton.addEventListener("click", () => {
        this.exportVocabularyAsJson();
      });

      exportContainer.appendChild(exportButton);

      // 添加CSV导出按钮
      const exportCsvButton = document.createElement("button");
      exportCsvButton.textContent = "导出CSV";
      exportCsvButton.style.cssText = `
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-right: 8px;
      `;

      exportCsvButton.addEventListener("click", () => {
        this.exportVocabularyAsCsv();
      });

      exportContainer.appendChild(exportCsvButton);

      // 添加TXT导出按钮
      const exportTxtButton = document.createElement("button");
      exportTxtButton.textContent = "导出TXT";
      exportTxtButton.style.cssText = `
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-right: 8px;
      `;

      exportTxtButton.addEventListener("click", () => {
        this.exportVocabularyAsTxt();
      });

      exportContainer.appendChild(exportTxtButton);

      // 添加MD导出按钮
      const exportMdButton = document.createElement("button");
      exportMdButton.textContent = "导出MD";
      exportMdButton.style.cssText = `
        padding: 6px 12px;
        background: #1e88e5;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      `;

      exportMdButton.addEventListener("click", () => {
        this.exportVocabularyAsMd();
      });

      exportContainer.appendChild(exportMdButton);
    }

    // Create vocabulary list with grouped display
    const vocabListContainer = document.createElement("div");
    vocabListContainer.style.cssText = `
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      padding: 0 16px;
      min-height: 0; /* 允许flex项目收缩到更小 */
    `;

    const vocabList = document.createElement("div");
    vocabList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 16px 0;
      width: 100%;
    `;

    this.vocabulary.forEach((item) => {
      const vocabItem = document.createElement("div");
      vocabItem.style.cssText = `
        padding: 12px;
        border-bottom: 1px solid #eee;
        word-wrap: break-word;
        word-break: break-word;
      `;

      // Word and phonetic line
      const wordLine = document.createElement("div");
      wordLine.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      `;

      const wordElement = document.createElement("div");
      wordElement.textContent = item.word;
      wordElement.style.cssText = `
        font-weight: bold;
        font-size: 16px;
      `;

      let phoneticElement = null;
      if (item.phonetic) {
        phoneticElement = document.createElement("div");
        // 只显示音标本身，并用方括号包围，去除任何可能存在的"US"标签
        const cleanPhonetic = item.phonetic
          .replace(/US\s*/g, "")
          .replace(/[\[\]]/g, "");
        phoneticElement.textContent = `[${cleanPhonetic}]`;
        phoneticElement.style.cssText = `
          color: #666;
          font-style: italic;
          font-size: 14px;
        `;
      }

      // 时间戳元素
      let timestampElement = null;
      if (item.timestamp) {
        timestampElement = document.createElement("button");
        timestampElement.textContent = `${this.millisToMinutesAndSeconds(item.timestamp)}`;
        timestampElement.style.cssText = `
          color: #1e88e5;
          background: none;
          border: none;
          padding: 0 4px;
          font-size: 14px;
          cursor: pointer;
          text-transform: none;
        `;

        // 点击时间戳跳转到对应时间
        timestampElement.addEventListener("click", () => {
          if (this.videoEl) {
            this.videoEl.currentTime = item.timestamp / 1000;
            if (this.videoEl.paused) {
              this.videoEl.play();
            }
          }
        });
      }

      wordLine.appendChild(wordElement);
      if (phoneticElement) {
        wordLine.appendChild(phoneticElement);
      }
      if (timestampElement) {
        wordLine.appendChild(timestampElement);
      }

      vocabItem.appendChild(wordLine);

      // Definition line
      if (item.definition) {
        const definitionElement = document.createElement("div");
        definitionElement.textContent = item.definition;
        definitionElement.style.cssText = `
          color: #333;
          margin-top: 8px;
          margin-bottom: 8px;
          font-size: 14px;
          line-height: 1.4;
        `;
        vocabItem.appendChild(definitionElement);
      }

      // Examples line
      if (item.examples && item.examples.length > 0) {
        const examplesElement = document.createElement("div");
        examplesElement.style.cssText = `
          color: #666;
          font-size: 13px;
          line-height: 1.4;
        `;

        item.examples.forEach((example, index) => {
          const exampleElement = document.createElement("div");
          exampleElement.style.cssText = `
            margin-bottom: 8px;
          `;

          const engExample = document.createElement("div");
          engExample.textContent = example.eng;

          const chsExample = document.createElement("div");
          chsExample.textContent = example.chs;
          chsExample.style.cssText = `
            color: #888;
            font-style: italic;
          `;

          exampleElement.appendChild(engExample);
          exampleElement.appendChild(chsExample);
          examplesElement.appendChild(exampleElement);
        });

        vocabItem.appendChild(examplesElement);
      }

      vocabList.appendChild(vocabItem);
    });

    vocabListContainer.appendChild(vocabList);
    this.vocabularyListEl.appendChild(exportContainer);
    this.vocabularyListEl.appendChild(vocabListContainer);
  }

  /**
   * Export vocabulary list as JSON file
   */
  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;

    // Get the video ID from the current YouTube page
    const videoId = this._getYouTubeVideoId();

    // Process vocabulary data to clean phonetic symbols
    const processedVocabulary = this.vocabulary.map((item) => {
      // Create a copy of the item
      const newItem = { ...item };

      // Clean phonetic - remove "US" label and brackets, then wrap with brackets
      if (item.phonetic) {
        const cleanPhonetic = item.phonetic
          .replace(/US\s*/g, "")
          .replace(/[\[\]]/g, "");
        newItem.phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      }

      return newItem;
    });

    // Create data with video information
    const exportData = {
      videoInfo: {
        title: this._getYouTubeVideoTitle(),
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        exportTime: new Date().toISOString(),
      },
      vocabulary: processedVocabulary,
    };

    // Create JSON data with all fields
    const jsonData = JSON.stringify(exportData, null, 2);

    // Create blob and download
    const blob = new Blob([jsonData], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Export vocabulary list as CSV file
   */
  exportVocabularyAsCsv() {
    if (this.vocabulary.length === 0) return;

    // Get the video ID from the current YouTube page
    const videoId = this._getYouTubeVideoId();

    // Create CSV header with multiple example columns
    const header =
      "Word,Phonetic,Definition,Example1,Translation1,Example2,Translation2,Video Link";

    // Create CSV rows
    const rows = this.vocabulary.map((item) => {
      // 转义特殊字符，特别是双引号
      const escapeCSVField = (field) => {
        if (!field) return '""';
        // 替换双引号为两个双引号，然后用双引号包围整个字段
        return `"${field.toString().replace(/"/g, '""')}"`;
      };

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
      const cleanPhonetic = item.phonetic
        ? item.phonetic.replace(/US\s*/g, "").replace(/[\[\]]/g, "")
        : "";
      const phonetic = cleanPhonetic ? `[${cleanPhonetic}]` : "";
      const definition = item.definition || "";

      // 获取前两个例句及其翻译
      let example1 = "";
      let translation1 = "";
      let example2 = "";
      let translation2 = "";

      if (item.examples && item.examples.length > 0) {
        example1 = item.examples[0].eng || "";
        translation1 = item.examples[0].chs || "";
      }

      if (item.examples && item.examples.length > 1) {
        example2 = item.examples[1].eng || "";
        translation2 = item.examples[1].chs || "";
      }

      // 创建完整的YouTube链接
      let videoLink = "";
      if (item.timestamp && videoId) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        videoLink = `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}s`;
      }

      return `${escapeCSVField(item.word)},${escapeCSVField(phonetic)},${escapeCSVField(definition)},${escapeCSVField(example1)},${escapeCSVField(translation1)},${escapeCSVField(example2)},${escapeCSVField(translation2)},${escapeCSVField(videoLink)}`;
    });

    // Create CSV content with info rows and header
    const csvContent = [
      // 添加文件信息（视频标题和链接）
      `"${this._getYouTubeVideoTitle()}",,,,,,,`,
      `"${videoId ? `https://www.youtube.com/watch?v=${videoId}` : "生词本导出文件"}",,,,,,,`,
      `,,,,,,,,`,
      // 表头
      header,
      // 数据行
      ...rows,
    ].join("\n");

    // Combine header and rows with BOM to support Chinese characters in Excel
    const csvData = "\uFEFF" + csvContent;

    // Create blob and download
    const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Export vocabulary list as TXT file
   */
  exportVocabularyAsTxt() {
    if (this.vocabulary.length === 0) return;

    // Get the video ID and title from the current YouTube page
    const videoId = this._getYouTubeVideoId();
    const videoTitle = this._getYouTubeVideoTitle();
    const videoLink = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "";

    // Create TXT data with full word information but without markdown symbols
    const lines = [];

    // Add video title and link at the beginning
    lines.push("生词本导出文件");
    lines.push(`视频标题: ${videoTitle}`);
    if (videoLink) {
      lines.push(`视频链接: ${videoLink}`);
    }
    lines.push(`导出时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    this.vocabulary.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.word}`);

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
      const cleanPhonetic = item.phonetic
        ? item.phonetic.replace(/US\s*/g, "").replace(/[\[\]]/g, "")
        : "";
      if (cleanPhonetic) {
        lines.push(`   音标: [${cleanPhonetic}]`);
      }

      if (item.definition) {
        lines.push(`   释义: ${item.definition}`);
      }

      if (item.examples && item.examples.length > 0) {
        lines.push("   例句:");
        item.examples.slice(0, 2).forEach((example, exIndex) => {
          lines.push(`   ${exIndex + 1}. ${example.eng}`);
          if (example.chs) {
            lines.push(`      ${example.chs}`);
          }
        });
      }

      // 添加视频链接
      if (item.timestamp && videoId) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLinkWithTime = `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}s`;
        lines.push(`   视频链接: ${videoLinkWithTime}`);
      }

      lines.push(""); // 空行分隔
    });

    const txtData = lines.join("\n");

    // Create blob and download
    const blob = new Blob([txtData], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Export vocabulary list as MD file
   */
  exportVocabularyAsMd() {
    if (this.vocabulary.length === 0) return;

    // Get the video ID and title from the current YouTube page
    const videoId = this._getYouTubeVideoId();
    const videoTitle = this._getYouTubeVideoTitle();
    const videoLink = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "";

    // Create MD content
    const lines = [];
    lines.push("# 生词本导出文件");
    lines.push(`**视频标题:** ${videoTitle}`);
    if (videoLink) {
      lines.push(`**视频链接:** [${videoLink}](${videoLink})`);
    }
    lines.push(`**导出时间:** ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    this.vocabulary.forEach((item, index) => {
      lines.push(`${index + 1}. **${item.word}**`);

      // 清理音标，去除"US"标签和其他方括号，只保留音标本身，并用方括号包裹
      const cleanPhonetic = item.phonetic
        ? item.phonetic.replace(/US\s*/g, "").replace(/[\[\]]/g, "")
        : "";
      if (cleanPhonetic) {
        lines.push(`   *音标 Phonetic:* [${cleanPhonetic}]`);
      }

      if (item.definition) {
        lines.push(`   *释义 Definition:* ${item.definition}`);
      }

      if (item.examples && item.examples.length > 0) {
        lines.push("   *例句 Examples:*");
        item.examples.slice(0, 2).forEach((example, exIndex) => {
          lines.push(`   ${exIndex + 1}. ${example.eng}`);
          if (example.chs) {
            lines.push(`      ${example.chs}`);
          }
        });
      }

      // 添加视频链接
      if (item.timestamp && videoId) {
        const totalSeconds = Math.floor(item.timestamp / 1000);
        const videoLinkWithTime = `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}s`;
        lines.push(
          `   *视频链接 Video Link:* [跳转到视频时间点](${videoLinkWithTime})`
        );
      }

      lines.push(""); // 空行分隔
    });

    const mdData = lines.join("\n");

    // Create blob and download
    const blob = new Blob([mdData], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kiss-vocabulary-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  initialize(subtitleEvents) {
    this.subtitleData = subtitleEvents.filter(
      (k) =>
        k?.segs &&
        Boolean(
          k?.segs
            .map((s) => s.utf8 || "")
            .join("")
            .replace(/\s+/g, " ")
            .trim()
        )
    );
    this.subtitleDataTime = subtitleEvents.map((k) => k.tStartMs);
    if (this.subtitleData.length > 0) {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  setBilingualSubtitles(bilingualData) {
    this.bilingualSubtitles = bilingualData;
    if (this.subtitleListEl) {
      this.updateBilingualSubtitles();
    } else {
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;
    const items = this.subtitleListEl.querySelectorAll(".kiss-youtube-item");
    for (
      let i = 0;
      i < items.length && i < this.bilingualSubtitles.length;
      i++
    ) {
      const item = items[i];
      const sub = this.bilingualSubtitles[i];
      if (sub) {
        if (typeof sub.start === "number") {
          item.dataset.time = sub.start;
          const timeSpan = item.querySelector("span:first-child");
          if (timeSpan) {
            timeSpan.textContent = `${this.millisToMinutesAndSeconds(sub.start)} `;
          }
        }
        const textSpan = item.querySelector(".kiss-youtube-original");
        if (textSpan && sub.text) textSpan.textContent = sub.text;
        const translationEl = item.querySelector(".kiss-youtube-translation");
        if (translationEl && sub.translation) {
          translationEl.textContent = sub.translation;
          translationEl.style.display = "block";
        } else if (translationEl) {
          translationEl.style.display = "none";
        }
      }
    }
    for (let i = this.bilingualSubtitles.length; i < items.length; i++) {
      const item = items[i];
      const translationEl = item.querySelector(".kiss-youtube-translation");
      if (translationEl) translationEl.style.display = "none";
    }
  }

  millisToMinutesAndSeconds(millis) {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  getClosest(data, value) {
    if (!data || data.length === 0) return 0;
    let closest = data[0];
    for (let i = 0; i < data.length; i++) {
      if (data[i] <= value) {
        closest = data[i];
      } else {
        break;
      }
    }
    return closest;
  }

  createSubtitleList() {
    if (!this.videoEl) return;

    this.container = document.getElementById(
      "kiss-youtube-subtitle-list-container"
    );
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      Object.assign(this.container.style, {
        height: "calc(100vh - 250px)",
        maxHeight: "none",
        zIndex: "999",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(10px)",
        top: "60px",
        right: "0",
        fontSize: "14px",
        padding: "0",
        marginRight: "24px",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "8px",
        minWidth: "320px",
        maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
      });
      const secondary = document.getElementById("secondary");
      if (secondary) secondary.prepend(this.container);
    }

    // --- Tab UI Creation ---
    this.container.innerHTML = ""; // Clear previous content

    const tabHeader = document.createElement("div");
    tabHeader.style.cssText = `
      display: flex;
      border-bottom: 1px solid #eee;
      padding: 0 16px;
      flex-shrink: 0;
    `;

    const subtitleTab = document.createElement("button");
    subtitleTab.textContent = "双语字幕";

    const vocabularyTab = document.createElement("button");
    vocabularyTab.textContent = "生词本";

    const styleTab = (tab, isActive) => {
      tab.style.cssText = `
        padding: 12px 16px;
        cursor: pointer;
        border: none;
        background: transparent;
        font-size: 15px;
        font-weight: ${isActive ? "600" : "500"};
        color: ${isActive ? "#1e88e5" : "#555"};
        border-bottom: 2px solid ${isActive ? "#1e88e5" : "transparent"};
        margin-bottom: -1px;
      `;
    };

    styleTab(subtitleTab, this.activeTab === "subtitles");
    styleTab(vocabularyTab, this.activeTab === "vocabulary");

    const tabContentContainer = document.createElement("div");
    tabContentContainer.style.cssText = `
        overflow: hidden;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        height: calc(100% - 40px); /* 减去tab header的高度 */
    `;

    // --- Subtitle List Panel ---
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "kiss-youtube-subtitle-list";
    this.subtitleListEl.style.display =
      this.activeTab === "subtitles" ? "block" : "none";
    const subtitleListUl = document.createElement("ul");
    subtitleListUl.style.cssText = `list-style-type: none; padding: 0; margin: 0;`;
    subtitleListUl.addEventListener("click", (e) => {
      const li = e.target.closest(".kiss-youtube-item");
      if (li && li.dataset.time)
        this.videoEl.currentTime = parseFloat(li.dataset.time) / 1000;
    });
    this.subtitleListEl.appendChild(subtitleListUl);
    this.subtitleListEl.style.padding = "8px 16px 16px 16px";

    // --- Vocabulary List Panel ---
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    // 设置词汇表区域为 flex column 布局
    this.vocabularyListEl.style.cssText = `
      display: ${this.activeTab === "vocabulary" ? "flex" : "none"};
      flex-direction: column;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
    `;

    // --- Tab Switching Logic ---
    subtitleTab.addEventListener("click", () => {
      this.activeTab = "subtitles";
      styleTab(subtitleTab, true);
      styleTab(vocabularyTab, false);
      this.subtitleListEl.style.display = "flex";
      this.vocabularyListEl.style.display = "none"; // 保持为 none
    });
    vocabularyTab.addEventListener("click", () => {
      this.activeTab = "vocabulary";
      styleTab(subtitleTab, false);
      styleTab(vocabularyTab, true);
      this.subtitleListEl.style.display = "none";
      this.vocabularyListEl.style.display = "flex"; // 改为 flex
    });

    tabHeader.appendChild(subtitleTab);
    tabHeader.appendChild(vocabularyTab);
    tabContentContainer.appendChild(this.subtitleListEl);
    tabContentContainer.appendChild(this.vocabularyListEl);
    this.container.appendChild(tabHeader);
    this.container.appendChild(tabContentContainer);

    // --- Populate Subtitle List ---
    const itemCount = Math.max(
      this.bilingualSubtitles.length,
      this.subtitleData.length
    );
    for (let i = 0; i < itemCount; i++) {
      const el = this.subtitleData[i];
      const { segs = [], tStartMs, dDurationMs } = el || {};
      const li = document.createElement("li");
      li.id = `kiss-youtube-item-${i}`;
      li.className = "kiss-youtube-item";
      li.style.cssText = `cursor: pointer; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; transition: all 0.2s ease; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;
      const subTime = this.bilingualSubtitles[i]
        ? this.bilingualSubtitles[i].start
        : el
          ? tStartMs
          : null;
      if (subTime !== null) li.dataset.time = subTime;
      const timeSpan = document.createElement("span");
      timeSpan.textContent =
        subTime !== null
          ? `${this.millisToMinutesAndSeconds(subTime)} `
          : "--:-- ";
      timeSpan.style.cssText = `color: #1e88e5; font-weight: 600; margin-right: 10px; font-size: 12px; background: rgba(30, 136, 229, 0.1); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px;`;
      const textContainer = document.createElement("div");
      textContainer.style.cssText = `flex-grow: 1;`;
      const textSpan = document.createElement("div");
      textSpan.className = "kiss-youtube-original";
      if (this.bilingualSubtitles[i]) {
        textSpan.textContent = this.bilingualSubtitles[i].text || "";
      } else if (el) {
        textSpan.textContent = segs
          .map((k) => k.utf8 || "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        textSpan.textContent = "";
      }
      textSpan.style.cssText = `color: #333; font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;
      const translationEl = document.createElement("div");
      translationEl.className = "kiss-youtube-translation";
      if (
        this.bilingualSubtitles[i] &&
        this.bilingualSubtitles[i].translation
      ) {
        translationEl.textContent = this.bilingualSubtitles[i].translation;
        translationEl.style.display = "block";
      } else {
        translationEl.style.display = "none";
      }
      translationEl.style.cssText = `color: #666; font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;
      li.addEventListener("mouseenter", () => {
        li.style.backgroundColor = "rgba(30, 136, 229, 0.05)";
        li.style.transform = "translateX(4px)";
      });
      li.addEventListener("mouseleave", () => {
        li.style.backgroundColor = "transparent";
        li.style.transform = "translateX(0)";
      });
      if (el) {
        li.dataset.startTime = tStartMs;
        li.dataset.endTime = tStartMs + (dDurationMs || 0);
      }
      textContainer.appendChild(textSpan);
      textContainer.appendChild(translationEl);
      li.appendChild(timeSpan);
      li.appendChild(textContainer);
      subtitleListUl.appendChild(li);
    }

    // Populate initial vocabulary list if any
    this._renderVocabulary();
  }

  setupEventListeners() {
    if (!this.container || !this.videoEl) return;
    this.container.addEventListener("mouseenter", () => this.turnOffAutoSub());
    this.container.addEventListener("mouseleave", () => this.turnOnAutoSub());
    this.videoEl.addEventListener("ended", () => this.turnOffAutoSub());
  }

  turnOnAutoSub() {
    this.turnOffAutoSub();
    this.loopAutoScroll = setInterval(() => {
      if (!this.videoEl || this.activeTab !== "subtitles") return; // Only scroll if subtitle tab is active
      const currentTimeMs = this.videoEl.currentTime * 1000;
      let currentIndex = -1;
      if (this.bilingualSubtitles.length > 0) {
        for (let i = 0; i < this.bilingualSubtitles.length; i++) {
          const sub = this.bilingualSubtitles[i];
          if (currentTimeMs >= sub.start && currentTimeMs <= sub.end) {
            currentIndex = i;
            break;
          }
        }
        if (currentIndex === -1) {
          for (let i = this.bilingualSubtitles.length - 1; i >= 0; i--) {
            if (currentTimeMs >= this.bilingualSubtitles[i].start) {
              currentIndex = i;
              break;
            }
          }
        }
      } else if (this.subtitleDataTime.length > 0) {
        const closestTime = this.getClosest(
          this.subtitleDataTime,
          currentTimeMs
        );
        currentIndex = this.subtitleDataTime.indexOf(closestTime);
      }
      if (this.subtitleListEl && currentIndex !== -1) {
        const allItems =
          this.subtitleListEl.querySelectorAll(".kiss-youtube-item");
        allItems.forEach((el) => {
          el.style.fontWeight = "normal";
          el.style.backgroundColor = "transparent";
        });
        const liElement = this.subtitleListEl.querySelector(
          `#kiss-youtube-item-${currentIndex}`
        );
        if (liElement) {
          liElement.style.fontWeight = "600";
          liElement.style.backgroundColor = "rgba(30, 136, 229, 0.1)";
          const container = this.subtitleListEl.parentElement;
          const targetScrollTop =
            liElement.offsetTop -
            container.clientHeight / 2 +
            liElement.clientHeight / 2;
          container.scrollTo({ top: targetScrollTop, behavior: "smooth" });
        }
      }
    }, 100);
  }

  turnOffAutoSub() {
    if (this.loopAutoScroll) {
      clearInterval(this.loopAutoScroll);
      this.loopAutoScroll = null;
    }
  }

  destroy() {
    this.turnOffAutoSub();
    document.removeEventListener("kiss-add-word", this.handleWordAdded);
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.bilingualSubtitles = [];
    this.vocabulary = [];
  }

  /**
   * Get YouTube video ID from the current page
   */
  _getYouTubeVideoId() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get("v");
    } catch (e) {
      return null;
    }
  }

  /**
   * Get YouTube video title from the current page
   */
  _getYouTubeVideoTitle() {
    try {
      const titleElement = document.querySelector("h1 yt-formatted-string");
      return titleElement ? titleElement.textContent : "YouTube Video";
    } catch (e) {
      return "YouTube Video";
    }
  }
}
