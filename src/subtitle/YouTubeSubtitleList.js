import { logger } from "../libs/log.js";

/**
 * YouTube 字幕列表管理器
 * 负责在 YouTube 视频播放时显示同步滚动的字幕列表
 */
export class YouTubeSubtitleList {
  constructor(videoElement) {
    this.videoEl = videoElement;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.subtitleListEl = null;
    this.loopAutoScroll = null;
    this.container = null;
    // 存储双语字幕数据（与视频播放区域显示的一致）
    this.bilingualSubtitles = [];
  }

  /**
   * 初始化字幕列表
   * @param {Array} subtitleEvents - 字幕事件数据
   */
  initialize(subtitleEvents) {
    this.subtitleData = subtitleEvents.filter(
      (k) =>
        k?.segs &&
        Boolean(
          k?.segs
            .map((k) => k.utf8 || "")
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

  /**
   * 设置双语字幕数据（与视频播放区域显示的一致）
   * @param {Array} bilingualData - 双语字幕数据
   */
  setBilingualSubtitles(bilingualData) {
    this.bilingualSubtitles = bilingualData;
    // 如果列表已创建，则更新显示
    if (this.subtitleListEl) {
      this.updateBilingualSubtitles();
    } else {
      // 如果列表还没创建，先创建列表
      this.createSubtitleList();
      this.setupEventListeners();
    }
  }

  /**
   * 更新双语字幕显示（使用与视频播放区域相同的数据）
   */
  updateBilingualSubtitles() {
    if (!this.subtitleListEl) return;
    
    const items = this.subtitleListEl.querySelectorAll('.kiss-youtube-item');
    for (let i = 0; i < items.length && i < this.bilingualSubtitles.length; i++) {
      const item = items[i];
      
      // 更新原文
      const textSpan = item.querySelector('.kiss-youtube-original');
      if (textSpan && this.bilingualSubtitles[i] && this.bilingualSubtitles[i].text) {
        textSpan.textContent = this.bilingualSubtitles[i].text;
      }
      
      // 更新翻译字幕
      const translationEl = item.querySelector('.kiss-youtube-translation');
      if (translationEl && this.bilingualSubtitles[i] && this.bilingualSubtitles[i].translation) {
        translationEl.textContent = this.bilingualSubtitles[i].translation;
        translationEl.style.display = 'block';
      } else if (translationEl) {
        translationEl.style.display = 'none';
      }
    }
    
    // 如果有更多字幕项而双语字幕数据较少，则隐藏多余的翻译元素
    for (let i = this.bilingualSubtitles.length; i < items.length; i++) {
      const item = items[i];
      const translationEl = item.querySelector('.kiss-youtube-translation');
      if (translationEl) {
        translationEl.style.display = 'none';
      }
    }
  }

  /**
   * 时间格式化函数
   * @param {number} millis - 毫秒数
   * @returns {string} 格式化后的时间字符串 (MM:SS)
   */
  millisToMinutesAndSeconds(millis) {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  /**
   * 获取最接近的时间点
   * @param {Array} data - 时间点数组
   * @param {number} value - 当前时间值（毫秒）
   * @returns {number} 最接近的时间点
   */
  getClosest(data, value) {
    if (!data || data.length === 0) return 0;
    // 查找小于或等于当前时间的最大时间点
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

  /**
   * 创建字幕列表
   */
  createSubtitleList() {
    if (!this.videoEl) return;
    
    // 创建或获取字幕列表容器
    this.container = document.getElementById("kiss-youtube-subtitle-list-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      
      // 设置容器样式
      Object.assign(this.container.style, {
        height: "calc(100vh - 250px)",
        maxHeight: "none",
        zIndex: "999",
        background: "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(10px)",
        top: "60px",
        right: "0",
        fontSize: "14px",
        padding: "16px",
        marginRight: "24px",
        overflow: "auto",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "8px",
        minWidth: "320px",
        maxWidth: "400px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif"
      });
      
      // 插入到secondary区域（YouTube右侧栏）
      const secondary = document.getElementById("secondary");
      if (secondary) {
        secondary.prepend(this.container);
      }
    }
    
    // 创建标题
    const titleElement = document.createElement("div");
    titleElement.textContent = "双语字幕列表";
    titleElement.style.cssText = `
      font-size: 16px;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    `;
    
    // 创建字幕列表
    const listElement = document.createElement("div");
    listElement.id = "kiss-youtube-subtitle-list";
    
    const subtitleList = document.createElement("ul");
    subtitleList.style.cssText = `
      list-style-type: none;
      padding: 0;
      margin: 0;
    `;
    
    // 确定要创建多少个项目
    const itemCount = Math.max(this.bilingualSubtitles.length, this.subtitleData.length);
    
    // 创建字幕项目
    for (let i = 0; i < itemCount; i++) {
      const el = this.subtitleData[i];
      const { segs = [], tStartMs, dDurationMs } = el || {};
      
      const li = document.createElement("li");
      li.id = `kiss-youtube-item-${i}`;
      li.className = "kiss-youtube-item";
      li.style.cssText = `
        cursor: pointer;
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
        transition: all 0.2s ease;
        border-radius: 6px;
        margin-bottom: 4px;
        display: flex;
        align-items: flex-start;
      `;
      
      // 添加时间戳
      const timeSpan = document.createElement("span");
      timeSpan.textContent = el ? `${this.millisToMinutesAndSeconds(tStartMs)} ` : "--:-- ";
      timeSpan.style.cssText = `
        color: #1e88e5;
        font-weight: 600;
        margin-right: 10px;
        font-size: 12px;
        background: rgba(30, 136, 229, 0.1);
        padding: 2px 6px;
        border-radius: 4px;
        flex-shrink: 0;
        line-height: 20px;
      `;
      
      // 添加点击事件跳转到指定时间
      if (el) {
        timeSpan.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.videoEl.currentTime = tStartMs / 1000;
        });
        
        // 添加整个列表项的点击事件
        li.addEventListener("click", () => {
          this.videoEl.currentTime = tStartMs / 1000;
        });
      }
      
      // 添加字幕文本容器
      const textContainer = document.createElement("div");
      textContainer.style.cssText = `
        flex-grow: 1;
      `;
      
      // 添加字幕文本（原文）
      const textSpan = document.createElement("div");
      textSpan.className = "kiss-youtube-original";
      if (this.bilingualSubtitles[i]) {
        textSpan.textContent = this.bilingualSubtitles[i].text || '';
      } else if (el) {
        textSpan.textContent = segs
          .map((k) => k.utf8 || "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      } else {
        textSpan.textContent = "";
      }
      
      textSpan.style.cssText = `
        color: #333;
        font-size: 14px;
        line-height: 1.4;
        margin-bottom: 4px;
      `;
      
      // 添加翻译字幕
      const translationEl = document.createElement("div");
      translationEl.className = "kiss-youtube-translation";
      if (this.bilingualSubtitles[i] && this.bilingualSubtitles[i].translation) {
        translationEl.textContent = this.bilingualSubtitles[i].translation;
        translationEl.style.display = 'block';
      } else {
        translationEl.style.display = 'none';
      }
      
      translationEl.style.cssText = `
        color: #666;
        font-size: 13px;
        line-height: 1.4;
        font-style: italic;
        min-height: 18px;
      `;
      
      // 添加悬停效果
      li.addEventListener("mouseenter", () => {
        li.style.backgroundColor = "rgba(30, 136, 229, 0.05)";
        li.style.transform = "translateX(4px)";
      });
      
      li.addEventListener("mouseleave", () => {
        li.style.backgroundColor = "transparent";
        li.style.transform = "translateX(0)";
      });
      
      // 存储时间信息，用于后续比较
      if (el) {
        li.dataset.startTime = tStartMs;
        li.dataset.endTime = tStartMs + (dDurationMs || 0);
      }
      
      textContainer.appendChild(textSpan);
      textContainer.appendChild(translationEl);
      
      li.appendChild(timeSpan);
      li.appendChild(textContainer);
      subtitleList.appendChild(li);
    }
    
    listElement.appendChild(subtitleList);
    this.container.innerHTML = "";
    this.container.appendChild(titleElement);
    this.container.appendChild(listElement);
    
    this.subtitleListEl = listElement;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (!this.container || !this.videoEl) return;
    
    // 添加鼠标悬停事件
    this.container.addEventListener("mouseenter", () => {
      this.turnOffAutoSub();
    });
    
    this.container.addEventListener("mouseleave", () => {
      this.turnOnAutoSub();
    });
    
    // 视频结束时关闭自动滚动
    this.videoEl.addEventListener("ended", () => {
      this.turnOffAutoSub();
    });
  }

  /**
   * 开启自动滚动字幕
   */
  turnOnAutoSub() {
    this.turnOffAutoSub();
    
    this.loopAutoScroll = setInterval(() => {
      if (!this.videoEl) return;
      
      const currentTimeMs = this.videoEl.currentTime * 1000;
      
      // 如果有双语字幕数据，使用它来确定当前字幕
      if (this.bilingualSubtitles.length > 0) {
        let currentIndex = -1;
        for (let i = 0; i < this.bilingualSubtitles.length; i++) {
          const sub = this.bilingualSubtitles[i];
          if (currentTimeMs >= sub.start && currentTimeMs <= sub.end) {
            currentIndex = i;
            break;
          }
        }
        
        if (currentIndex === -1) {
          // 如果没有精确匹配，找到最近的
          for (let i = this.bilingualSubtitles.length - 1; i >= 0; i--) {
            if (currentTimeMs >= this.bilingualSubtitles[i].start) {
              currentIndex = i;
              break;
            }
          }
        }
        
        if (this.subtitleListEl && currentIndex !== -1) {
          // 移除之前高亮的项目
          const allItems = this.subtitleListEl.querySelectorAll('.kiss-youtube-item');
          allItems.forEach(el => {
            el.style.color = "inherit";
            el.style.fontWeight = "normal";
            el.style.backgroundColor = "transparent";
            el.style.boxShadow = "none";
            el.style.transform = "translateX(0)";
          });
          
          // 高亮当前字幕行
          const liElement = this.subtitleListEl.querySelector(`#kiss-youtube-item-${currentIndex}`);
          if (liElement) {
            liElement.style.color = "#1e88e5";
            liElement.style.fontWeight = "600";
            liElement.style.backgroundColor = "rgba(30, 136, 229, 0.1)";
            liElement.style.boxShadow = "0 2px 6px rgba(30, 136, 229, 0.2)";
            
            // 自动滚动到可视区域
            const container = this.subtitleListEl.parentElement;
            const rect = liElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            if (rect.bottom > containerRect.bottom - 50) {
              container.scrollTop += rect.bottom - containerRect.bottom + 50;
            } else if (rect.top < containerRect.top + 50) {
              container.scrollTop -= containerRect.top - rect.top + 50;
            }
          }
        }
      } else if (this.subtitleDataTime.length > 0) {
        // 如果没有双语字幕数据，回退到使用原始时间数据
        const scrollTo = this.getClosest(this.subtitleDataTime, currentTimeMs);
        
        if (this.subtitleListEl) {
          // 移除之前高亮的项目
          const allItems = this.subtitleListEl.querySelectorAll('.kiss-youtube-item');
          allItems.forEach(el => {
            el.style.color = "inherit";
            el.style.fontWeight = "normal";
            el.style.backgroundColor = "transparent";
            el.style.boxShadow = "none";
            el.style.transform = "translateX(0)";
          });
          
          // 高亮当前字幕行
          const liElement = this.subtitleListEl.querySelector(`#kiss-youtube-item-${scrollTo}`);
          if (liElement) {
            liElement.style.color = "#1e88e5";
            liElement.style.fontWeight = "600";
            liElement.style.backgroundColor = "rgba(30, 136, 229, 0.1)";
            liElement.style.boxShadow = "0 2px 6px rgba(30, 136, 229, 0.2)";
            
            // 自动滚动到可视区域
            const container = this.subtitleListEl.parentElement;
            const rect = liElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            if (rect.bottom > containerRect.bottom - 50) {
              container.scrollTop += rect.bottom - containerRect.bottom + 50;
            } else if (rect.top < containerRect.top + 50) {
              container.scrollTop -= containerRect.top - rect.top + 50;
            }
          }
        }
      }
    }, 100);
  }

  /**
   * 关闭自动滚动字幕
   */
  turnOffAutoSub() {
    if (this.loopAutoScroll) {
      clearInterval(this.loopAutoScroll);
      this.loopAutoScroll = null;
    }
  }

  /**
   * 销毁字幕列表
   */
  destroy() {
    this.turnOffAutoSub();
    
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    
    this.subtitleListEl = null;
    this.subtitleData = [];
    this.subtitleDataTime = [];
    this.bilingualSubtitles = [];
  }
}