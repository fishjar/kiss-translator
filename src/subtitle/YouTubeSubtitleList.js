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
    this.vocabulary = []; // 现在存储 {word, definition} 对象数组

    this.container = null;
    this.subtitleListEl = null;
    this.vocabularyListEl = null;
    this.loopAutoScroll = null;

    this.activeTab = "subtitles"; // 'subtitles' or 'vocabulary'

    this.handleWordAdded = this.handleWordAdded.bind(this);
    document.addEventListener("kiss-add-word", this.handleWordAdded);
  }

  handleWordAdded(event) {
    if (event.detail && event.detail.word) {
      // 现在可以接收 definition 参数
      this.addWord(event.detail.word, event.detail.definition);
    }
  }

  /**
   * Public method to add a word to the vocabulary list.
   * @param {string} word The word to add.
   * @param {string} definition The definition of the word.
   */
  addWord(word, definition = "") {
    if (word) {
      // 检查单词是否已存在
      const existingIndex = this.vocabulary.findIndex(item => item.word === word);
      if (existingIndex !== -1) {
        // 如果单词已存在且提供了新的释义，则更新释义
        if (definition && !this.vocabulary[existingIndex].definition) {
          this.vocabulary[existingIndex].definition = definition;
        }
      } else {
        // 添加新单词
        this.vocabulary.push({ word, definition });
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
      `;
      
      exportButton.addEventListener("click", () => {
        this.exportVocabularyAsJson();
      });
      
      exportContainer.appendChild(exportButton);
    }

    this.vocabularyListEl.appendChild(exportContainer);

    const wordList = document.createElement("ul");
    wordList.style.cssText = `
      list-style-type: none;
      padding: 0;
      margin: 0;
    `;

    this.vocabulary.forEach((item) => {
      const li = document.createElement("li");
      // 显示单词和释义
      if (item.definition) {
        li.innerHTML = `<div><strong>${item.word}</strong></div><div style="margin-top: 4px; font-size: 13px; color: #666;">${item.definition}</div>`;
      } else {
        li.innerHTML = `<div>${item.word}</div>`;
      }
      li.style.cssText = `
        padding: 10px 16px;
        border-bottom: 1px solid #f0f0f0;
        font-size: 14px;
        color: #333;
      `;
      wordList.appendChild(li);
    });
    this.vocabularyListEl.appendChild(wordList);
  }

  /**
   * Export vocabulary list as JSON file
   */
  exportVocabularyAsJson() {
    if (this.vocabulary.length === 0) return;

    // Create JSON data
    const jsonData = JSON.stringify(this.vocabulary, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
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

  initialize(subtitleEvents) {
    this.subtitleData = subtitleEvents.filter(
      (k) => k?.segs && Boolean(k?.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim())
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
    for (let i = 0; i < items.length && i < this.bilingualSubtitles.length; i++) {
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

    this.container = document.getElementById("kiss-youtube-subtitle-list-container");
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
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
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
        font-weight: ${isActive ? '600' : '500'};
        color: ${isActive ? '#1e88e5' : '#555'};
        border-bottom: 2px solid ${isActive ? '#1e88e5' : 'transparent'};
        margin-bottom: -1px;
      `;
    }

    styleTab(subtitleTab, this.activeTab === 'subtitles');
    styleTab(vocabularyTab, this.activeTab === 'vocabulary');
    
    const tabContentContainer = document.createElement("div");
    tabContentContainer.style.cssText = `
        overflow: auto;
        flex-grow: 1;
    `;

    // --- Subtitle List Panel ---
    this.subtitleListEl = document.createElement("div");
    this.subtitleListEl.id = "kiss-youtube-subtitle-list";
    this.subtitleListEl.style.display = this.activeTab === 'subtitles' ? 'block' : 'none';
    const subtitleListUl = document.createElement("ul");
    subtitleListUl.style.cssText = `list-style-type: none; padding: 0; margin: 0;`;
    subtitleListUl.addEventListener("click", (e) => {
      const li = e.target.closest(".kiss-youtube-item");
      if (li && li.dataset.time) this.videoEl.currentTime = parseFloat(li.dataset.time) / 1000;
    });
    this.subtitleListEl.appendChild(subtitleListUl);
    this.subtitleListEl.style.padding = "8px 16px 16px 16px";

    // --- Vocabulary List Panel ---
    this.vocabularyListEl = document.createElement("div");
    this.vocabularyListEl.id = "kiss-youtube-vocabulary-list";
    this.vocabularyListEl.style.display = this.activeTab === 'vocabulary' ? 'block' : 'none';
    this.vocabularyListEl.style.padding = "8px 0 16px 0";

    // --- Tab Switching Logic ---
    subtitleTab.addEventListener('click', () => {
        this.activeTab = 'subtitles';
        styleTab(subtitleTab, true);
        styleTab(vocabularyTab, false);
        this.subtitleListEl.style.display = 'block';
        this.vocabularyListEl.style.display = 'none';
    });
    vocabularyTab.addEventListener('click', () => {
        this.activeTab = 'vocabulary';
        styleTab(subtitleTab, false);
        styleTab(vocabularyTab, true);
        this.subtitleListEl.style.display = 'none';
        this.vocabularyListEl.style.display = 'block';
    });

    tabHeader.appendChild(subtitleTab);
    tabHeader.appendChild(vocabularyTab);
    tabContentContainer.appendChild(this.subtitleListEl);
    tabContentContainer.appendChild(this.vocabularyListEl);
    this.container.appendChild(tabHeader);
    this.container.appendChild(tabContentContainer);

    // --- Populate Subtitle List ---
    const itemCount = Math.max(this.bilingualSubtitles.length, this.subtitleData.length);
    for (let i = 0; i < itemCount; i++) {
      const el = this.subtitleData[i];
      const { segs = [], tStartMs, dDurationMs } = el || {};
      const li = document.createElement("li");
      li.id = `kiss-youtube-item-${i}`;
      li.className = "kiss-youtube-item";
      li.style.cssText = `cursor: pointer; padding: 12px 16px; border-bottom: 1px solid #f0f0f0; transition: all 0.2s ease; border-radius: 6px; margin-bottom: 4px; display: flex; align-items: flex-start;`;
      const subTime = this.bilingualSubtitles[i] ? this.bilingualSubtitles[i].start : el ? tStartMs : null;
      if (subTime !== null) li.dataset.time = subTime;
      const timeSpan = document.createElement("span");
      timeSpan.textContent = subTime !== null ? `${this.millisToMinutesAndSeconds(subTime)} ` : "--:-- ";
      timeSpan.style.cssText = `color: #1e88e5; font-weight: 600; margin-right: 10px; font-size: 12px; background: rgba(30, 136, 229, 0.1); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; line-height: 20px;`;
      const textContainer = document.createElement("div");
      textContainer.style.cssText = `flex-grow: 1;`;
      const textSpan = document.createElement("div");
      textSpan.className = "kiss-youtube-original";
      if (this.bilingualSubtitles[i]) {
        textSpan.textContent = this.bilingualSubtitles[i].text || "";
      } else if (el) {
        textSpan.textContent = segs.map((k) => k.utf8 || "").join("").replace(/\s+/g, " ").trim();
      } else {
        textSpan.textContent = "";
      }
      textSpan.style.cssText = `color: #333; font-size: 14px; line-height: 1.4; margin-bottom: 4px;`;
      const translationEl = document.createElement("div");
      translationEl.className = "kiss-youtube-translation";
      if (this.bilingualSubtitles[i] && this.bilingualSubtitles[i].translation) {
        translationEl.textContent = this.bilingualSubtitles[i].translation;
        translationEl.style.display = "block";
      } else {
        translationEl.style.display = "none";
      }
      translationEl.style.cssText = `color: #666; font-size: 13px; line-height: 1.4; font-style: italic; min-height: 18px;`;
      li.addEventListener("mouseenter", () => { li.style.backgroundColor = "rgba(30, 136, 229, 0.05)"; li.style.transform = "translateX(4px)"; });
      li.addEventListener("mouseleave", () => { li.style.backgroundColor = "transparent"; li.style.transform = "translateX(0)"; });
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
      if (!this.videoEl || this.activeTab !== 'subtitles') return; // Only scroll if subtitle tab is active
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
        const closestTime = this.getClosest(this.subtitleDataTime, currentTimeMs);
        currentIndex = this.subtitleDataTime.indexOf(closestTime);
      }
      if (this.subtitleListEl && currentIndex !== -1) {
        const allItems = this.subtitleListEl.querySelectorAll(".kiss-youtube-item");
        allItems.forEach((el) => {
          el.style.fontWeight = "normal";
          el.style.backgroundColor = "transparent";
        });
        const liElement = this.subtitleListEl.querySelector(`#kiss-youtube-item-${currentIndex}`);
        if (liElement) {
          liElement.style.fontWeight = "600";
          liElement.style.backgroundColor = "rgba(30, 136, 229, 0.1)";
          const container = this.subtitleListEl.parentElement;
          const targetScrollTop = liElement.offsetTop - container.clientHeight / 2 + liElement.clientHeight / 2;
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
}