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
      this.createSubtitleList(this.subtitleData);
      this.setupEventListeners();
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
   * @param {number} value - 当前时间值
   * @returns {number} 最接近的时间点
   */
  getClosest(data, value) {
    if (!data || data.length === 0) return 0;
    const closest = data.reduce(function (prev, curr) {
      return Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev;
    });
    return closest;
  }

  /**
   * 创建字幕列表
   * @param {Array} data - 字幕数据
   */
  createSubtitleList(data) {
    if (!this.videoEl) return;
    
    // 创建或获取字幕列表容器
    this.container = document.getElementById("kiss-youtube-subtitle-list-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "kiss-youtube-subtitle-list-container";
      
      // 设置容器样式
      Object.assign(this.container.style, {
        height: "100%",
        maxHeight: "400px",
        zIndex: "999",
        background: "white",
        top: "0",
        right: "0",
        fontSize: "14px",
        padding: "12px",
        marginRight: "24px",
        overflow: "auto",
        border: "1px solid #ccc",
        borderRadius: "4px",
        minWidth: "300px",
        maxWidth: "400px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
      });
      
      // 插入到secondary区域（YouTube右侧栏）
      const secondary = document.getElementById("secondary");
      if (secondary) {
        secondary.prepend(this.container);
      }
    }
    
    // 创建字幕列表
    const listElement = document.createElement("div");
    listElement.id = "kiss-youtube-subtitle-list";
    
    const subtitleList = document.createElement("ul");
    subtitleList.style.cssText = `
      list-style-type: none;
      padding: 0;
      margin: 0;
    `;
    
    data.forEach((el) => {
      const { segs = [], tStartMs } = el;
      if (!segs.length) return;
      
      const li = document.createElement("li");
      li.id = `kiss-youtube-item-${tStartMs}`;
      li.className = "kiss-youtube-item";
      li.style.cssText = `
        cursor: pointer;
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        transition: background-color 0.2s;
      `;
      
      // 添加时间戳
      const timeSpan = document.createElement("span");
      timeSpan.textContent = `${this.millisToMinutesAndSeconds(tStartMs)}: `;
      timeSpan.style.cssText = `
        color: #1e88e5;
        font-weight: bold;
        margin-right: 8px;
      `;
      
      // 添加点击事件跳转到指定时间
      timeSpan.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.videoEl.currentTime = tStartMs / 1000;
      });
      
      // 添加字幕文本
      const textSpan = document.createElement("span");
      textSpan.textContent = segs
        .map((k) => k.utf8 || "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      textSpan.style.cssText = `
        color: #333;
      `;
      
      // 添加整个列表项的点击事件
      li.addEventListener("click", () => {
        this.videoEl.currentTime = tStartMs / 1000;
      });
      
      // 添加悬停效果
      li.addEventListener("mouseenter", () => {
        li.style.backgroundColor = "rgb(233, 229, 229)";
      });
      
      li.addEventListener("mouseleave", () => {
        li.style.backgroundColor = "transparent";
      });
      
      li.appendChild(timeSpan);
      li.appendChild(textSpan);
      subtitleList.appendChild(li);
    });
    
    listElement.appendChild(subtitleList);
    this.container.innerHTML = "";
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
      
      const currentTime = this.videoEl.currentTime;
      const scrollTo = this.getClosest(this.subtitleDataTime, currentTime * 1000);
      
      if (this.subtitleListEl) {
        const liElement = this.subtitleListEl.querySelector(`#kiss-youtube-item-${scrollTo}`);
        if (liElement) {
          // 高亮当前字幕行
          const allItems = this.subtitleListEl.querySelectorAll('.kiss-youtube-item');
          allItems.forEach(el => {
            el.style.color = "black";
            el.style.fontWeight = "normal";
          });
          
          liElement.style.color = "red";
          liElement.style.fontWeight = "bold";
          
          // 自动滚动到可视区域
          const container = this.subtitleListEl.parentElement;
          const ofs = liElement.offsetTop;
          if (ofs > 300) {
            container.scrollTop = ofs - 300;
          }
        }
      }
    }, 150);
  }

  /**
   * 关闭自动滚动字幕
   */
  turnOffAutoSub() {
    if this.loopAutoScroll) {
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
  }
}