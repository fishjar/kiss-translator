import { logger } from "../libs/log.js";
import { truncateWords, throttle } from "../libs/utils.js";
import { apiTranslate } from "../apis/index.js";
import { apiMicrosoftDict } from "../apis/index.js";
import { trustedTypesHelper } from "../libs/trustedTypes.js";
import { isMobile } from "../libs/mobile.js";

// 添加CSS样式用于高亮显示悬停的单词
const addWordHoverStyles = () => {
  if (document.getElementById("kiss-word-hover-styles")) return;

  const style = document.createElement("style");
  style.id = "kiss-word-hover-styles";
  style.textContent = `
    .kiss-word-hover {
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: #4fc3f7;
      text-decoration-thickness: 2px;
    }
    
    .kiss-word-tooltip {
      position: fixed;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      z-index: 2147483647;
      max-width: 300px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: Arial, sans-serif;
    }
    
    .kiss-word-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      font-weight: bold;
      font-size: 16px;
      color: #4fc3f7;
    }
    
    .kiss-word-tooltip-close {
      background: none;
      border: none;
      color: #aaa;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      margin-left: 10px;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .kiss-word-tooltip-close:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
    }
    
    .kiss-word-loading {
      color: #bbb;
      font-style: italic;
    }
    
    .kiss-word-definition {
      margin: 4px 0;
    }
    
    .kiss-word-pos {
      color: #4fc3f7;
      font-weight: bold;
    }
    
    .kiss-word-phonetic {
      color: #bbb;
      font-style: italic;
      margin-right: 10px;
    }
    
    .kiss-word-example {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #444;
    }
    
    .kiss-word-example-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .kiss-word-example-sentence {
      margin-bottom: 3px;
    }
    
    .kiss-word-example-translation {
      color: #bbb;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
};

/**
 * @class BilingualSubtitleManager
 * @description 负责在视频上显示和翻译字幕的核心逻辑
 */
export class BilingualSubtitleManager {
  #videoEl;
  #formattedSubtitles = [];
  #captionWindowEl = null;
  #paperEl = null;
  #currentSubtitleIndex = -1;
  // #preTranslateSeconds = 90;
  // #throttleSeconds = 30;
  #setting = {};
  #isAdPlaying = false;
  #throttledTriggerTranslations;
  #tooltipEl = null;
  #hoverTimeout = null; // 用于延迟显示/隐藏tooltip

  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.videoEl - 页面上的 video 元素。
   * @param {Array<object>} options.formattedSubtitles - 已格式化好的字幕数组。
   * @param {object} options.setting - 配置对象，如目标翻译语言。
   */
  constructor({ videoEl, formattedSubtitles, setting }) {
    this.#setting = setting;
    this.#videoEl = videoEl;
    this.#formattedSubtitles = formattedSubtitles;

    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeek = this.onSeek.bind(this);

    this.#throttledTriggerTranslations = throttle(
      this.#triggerTranslations.bind(this),
      (setting.throttleTrans ?? 30) * 1000
    );

    // todo: 使用 @emotion/css
    if (!isMobile && this.#setting.isEnhance !== false) {
      addWordHoverStyles();
    }
  }

  /**
   * 启动字幕显示和翻译。
   */
  start() {
    if (this.#formattedSubtitles.length === 0) {
      logger.warn("Bilingual Subtitles: No subtitles to display.");
      return;
    }

    logger.info("Bilingual Subtitle Manager: Starting...");
    this.#createCaptionWindow();
    this.#attachEventListeners();
    this.onTimeUpdate();
  }

  /**
   * 销毁实例，清理资源。
   */
  destroy() {
    logger.info("Bilingual Subtitle Manager: Destroying...");
    this.#removeEventListeners();
    this.#throttledTriggerTranslations?.cancel();
    this.#captionWindowEl?.parentElement?.parentElement?.remove();
    this.#formattedSubtitles = [];
    // 清理tooltip元素
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }

    // 清理定时器
    if (this.#hoverTimeout) {
      clearTimeout(this.#hoverTimeout);
      this.#hoverTimeout = null;
    }
  }

  /**
   * 更新广告播放状态。
   */
  setIsAdPlaying(isPlaying) {
    this.#isAdPlaying = isPlaying;
    this.onTimeUpdate();
  }

  /**
   * 创建并配置用于显示字幕的 DOM 元素。
   */
  #createCaptionWindow() {
    const container = document.createElement("div");
    container.className = `kiss-caption-container notranslate`;
    Object.assign(container.style, {
      position: "absolute",
      width: "100%",
      height: "100%",
      left: "0",
      top: "0",
      pointerEvents: "none",
    });

    const paper = document.createElement("div");
    paper.className = `kiss-caption-paper`;
    Object.assign(paper.style, {
      position: "absolute",
      width: "80%",
      left: "50%",
      bottom: "10%",
      transform: "translateX(-50%)",
      textAlign: "center",
      containerType: "inline-size",
      zIndex: "2147483647",
      pointerEvents: "auto",
      display: "none",
    });
    this.#paperEl = paper;

    this.#captionWindowEl = document.createElement("div");
    this.#captionWindowEl.className = `kiss-caption-window`;
    this.#captionWindowEl.style.cssText = this.#setting.windowStyle;
    this.#captionWindowEl.style.pointerEvents = "auto";
    this.#captionWindowEl.style.cursor = "grab";
    this.#captionWindowEl.style.opacity = "1";

    this.#paperEl.appendChild(this.#captionWindowEl);
    container.appendChild(this.#paperEl);

    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (!videoContainer) {
      logger.warn("could not find videoContainer");
      return;
    }

    videoContainer.style.position = "relative";
    videoContainer.appendChild(container);

    this.#enableDragging(this.#paperEl, container, this.#captionWindowEl);

    if (!isMobile && this.#setting.isEnhance !== false) {
      // 添加鼠标悬停事件监听器
      this.#captionWindowEl.addEventListener(
        "mouseover",
        this.#handleWordHover.bind(this),
        true
      );
      this.#captionWindowEl.addEventListener(
        "mouseout",
        this.#handleWordHoverOut.bind(this),
        true
      );
      this.#captionWindowEl.addEventListener(
        "mousemove",
        this.#handleWordMouseMove.bind(this)
      );
    }
  }

  // 处理单词悬停事件
  #handleWordHover(event) {
    const target = event.target;
    if (target.classList.contains("kiss-subtitle-word")) {
      // 清除之前的定时器
      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      target.classList.add("kiss-word-hover");

      // 停止视频播放
      if (this.#videoEl && !this.#videoEl.paused) {
        this.#videoEl.pause();
      }

      // 延迟显示tooltip，避免误触
      this.#hoverTimeout = setTimeout(() => {
        this.#showWordTooltip(
          target.dataset.word,
          event.clientX,
          event.clientY
        );
      }, 300);
    }
  }

  // 处理鼠标移出事件
  #handleWordHoverOut(event) {
    const target = event.target;
    if (target.classList.contains("kiss-subtitle-word")) {
      target.classList.remove("kiss-word-hover");

      // 清除显示定时器
      if (this.#hoverTimeout) {
        clearTimeout(this.#hoverTimeout);
        this.#hoverTimeout = null;
      }

      // 延迟隐藏tooltip
      this.#hoverTimeout = setTimeout(() => {
        this.#hideWordTooltip();
        // 恢复视频播放
        if (this.#videoEl && this.#videoEl.paused) {
          this.#videoEl.play();
        }
      }, 100);
    }

    // 如果鼠标移出了整个字幕窗口，也隐藏tooltip
    if (
      event.relatedTarget &&
      !this.#captionWindowEl.contains(event.relatedTarget)
    ) {
      this.#hideWordTooltip();
      // 恢复视频播放
      if (this.#videoEl && this.#videoEl.paused) {
        this.#videoEl.play();
      }
    }
  }

  // 处理鼠标移动事件
  #handleWordMouseMove(event) {
    // 不再跟随鼠标移动，保持tooltip在固定位置
    // 移除之前的逻辑
  }

  // 显示单词提示框
  async #showWordTooltip(word, x, y) {
    // 如果已经存在提示框，则先移除
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
    }

    // 创建提示框
    this.#tooltipEl = document.createElement("div");
    this.#tooltipEl.className = "kiss-word-tooltip";
    this.#tooltipEl.innerHTML = trustedTypesHelper.createHTML(
      '<div class="kiss-word-loading">Looking up...</div>'
    );

    // 将提示框定位在播放器右上角
    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (videoContainer) {
      const containerRect = videoContainer.getBoundingClientRect();
      const tooltipWidth = 300;
      const tooltipHeight = 400;

      // 定位在播放器右上角，距离右边缘45px，上下边缘各20px
      const left = containerRect.right - tooltipWidth - 45;
      const top = containerRect.top + 20;

      // 确保提示框不会超出浏览器窗口右边界
      const maxLeft = window.innerWidth - tooltipWidth - 10;
      this.#tooltipEl.style.left = Math.min(maxLeft, Math.max(10, left)) + "px";
      this.#tooltipEl.style.top = Math.max(10, top) + "px";
      this.#tooltipEl.style.maxWidth = tooltipWidth + "px";
      this.#tooltipEl.style.maxHeight = tooltipHeight + "px";
      this.#tooltipEl.style.overflow = "auto";
    }

    document.body.appendChild(this.#tooltipEl);

    try {
      // 获取单词翻译
      const dictResult = await apiMicrosoftDict(word);

      // 构造美式音标字符串
      let phonetic = "";
      if (dictResult && dictResult.aus) {
        // 只使用美式音标，去除"美"标签和方括号
        const usPhonetic = dictResult.aus.find((au) => au.key === "美");
        if (usPhonetic && usPhonetic.phonetic) {
          phonetic = usPhonetic.phonetic;
        } else if (dictResult.aus.length > 0 && dictResult.aus[0].phonetic) {
          // 如果没有明确标记为"美"的音标，使用第一个音标
          phonetic = dictResult.aus[0].phonetic;
        }
      }

      // 构造释义字符串
      let definition = "";
      if (dictResult && dictResult.trs) {
        definition = dictResult.trs
          .slice(0, 3)
          .map((tr) => `${tr.pos ? tr.pos + " " : ""}${tr.def}`)
          .join("; ");
      }

      // 构造例句数组
      let examples = [];
      if (dictResult && dictResult.sentences) {
        examples = dictResult.sentences.slice(0, 2).map((sentence) => ({
          eng: sentence.eng,
          chs: sentence.chs,
        }));
      }

      // 获取当前字幕的时间戳（使用重新分段后的时间）
      const currentTimeMs = this.#getCurrentSubtitleStartTime();

      // 添加单词和完整信息到生词本
      const event = new CustomEvent("kiss-add-word", {
        detail: {
          word,
          phonetic, // 现在只包含音标本身，如 ɪnˈkredəb(ə)l
          definition,
          examples,
          timestamp: currentTimeMs, // 添加时间戳
        },
      });
      document.dispatchEvent(event);

      if (
        dictResult &&
        (dictResult.trs || dictResult.aus || dictResult.sentences)
      ) {
        let content = `<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>`;

        // 显示音标
        if (dictResult.aus && dictResult.aus.length > 0) {
          content += "<div>";
          dictResult.aus.forEach((au) => {
            if (au.phonetic) {
              content += `<span class="kiss-word-phonetic">${au.phonetic}</span>`;
            }
          });
          content += "</div>";
        }

        // 显示释义
        if (dictResult.trs) {
          dictResult.trs.slice(0, 3).forEach((tr) => {
            content += `<div class="kiss-word-definition">${tr.pos ? '<span class="kiss-word-pos">' + tr.pos + "</span> " : ""}${tr.def}</div>`;
          });
        }

        // 显示例句
        if (dictResult.sentences && dictResult.sentences.length > 0) {
          content += `<div class="kiss-word-example">
            <div class="kiss-word-example-title">例句</div>`;
          dictResult.sentences.slice(0, 2).forEach((sentence) => {
            content += `<div class="kiss-word-example-sentence">${sentence.eng}</div>
              <div class="kiss-word-example-translation">${sentence.chs}</div>`;
          });
          content += "</div>";
        }

        if (this.#tooltipEl) {
          this.#tooltipEl.innerHTML = trustedTypesHelper.createHTML(content);
        }
      } else {
        if (this.#tooltipEl) {
          this.#tooltipEl.innerHTML =
            trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
          <span>${word}</span>
          <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
        </div>
        <div class="kiss-word-definition">No definition found</div>`);
        }
      }
    } catch (error) {
      logger.info("Dictionary lookup failed for word:", word, error);

      // 获取当前字幕的时间戳
      const currentTimeMs = this.#getCurrentSubtitleStartTime();

      // 即使查询失败，也将单词添加到生词本（无完整信息）
      const event = new CustomEvent("kiss-add-word", {
        detail: {
          word,
          phonetic: "",
          definition: "",
          examples: [],
          timestamp: currentTimeMs, // 添加时间戳
        },
      });
      document.dispatchEvent(event);

      if (this.#tooltipEl) {
        this.#tooltipEl.innerHTML =
          trustedTypesHelper.createHTML(`<div class="kiss-word-tooltip-header">
        <span>${word}</span>
        <button class="kiss-word-tooltip-close" onclick="this.closest('.kiss-word-tooltip').remove()">×</button>
      </div>
      <div class="kiss-word-definition">Failed to load definition</div>`);
      }
    }
  }

  // 隐藏单词提示框
  #hideWordTooltip() {
    if (this.#tooltipEl) {
      this.#tooltipEl.remove();
      this.#tooltipEl = null;
    }
  }

  /**
   * 为指定的元素启用垂直拖动功能。
   */
  #enableDragging(dragElement, boundaryContainer, handleElement) {
    let isDragging = false;
    let startY;
    let initialBottom;
    let dragElementHeight;

    const onDragStart = (e) => {
      if (e.type === "mousedown" && e.button !== 0) return;

      e.preventDefault();

      isDragging = true;
      handleElement.style.cursor = "grabbing";
      startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY;

      initialBottom =
        boundaryContainer.getBoundingClientRect().bottom -
        dragElement.getBoundingClientRect().bottom;

      dragElementHeight = dragElement.offsetHeight;

      document.addEventListener("mousemove", onDragMove, { capture: true });
      document.addEventListener("touchmove", onDragMove, {
        capture: true,
        passive: false,
      });
      document.addEventListener("mouseup", onDragEnd, { capture: true });
      document.addEventListener("touchend", onDragEnd, { capture: true });
    };

    const onDragMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      const currentY =
        e.type === "touchmove" ? e.touches[0].clientY : e.clientY;
      const deltaY = currentY - startY;
      let newBottom = initialBottom - deltaY;

      const containerHeight = boundaryContainer.clientHeight;
      newBottom = Math.max(0, newBottom);
      newBottom = Math.min(containerHeight - dragElementHeight, newBottom);
      if (dragElementHeight > containerHeight) {
        newBottom = Math.max(0, newBottom);
      }

      dragElement.style.bottom = `${newBottom}px`;
    };

    const onDragEnd = (e) => {
      if (!isDragging) return;

      e.preventDefault();

      isDragging = false;
      handleElement.style.cursor = "grab";

      document.removeEventListener("mousemove", onDragMove, { capture: true });
      document.removeEventListener("touchmove", onDragMove, { capture: true });
      document.removeEventListener("mouseup", onDragEnd, { capture: true });
      document.removeEventListener("touchend", onDragEnd, { capture: true });

      const finalBottomPx = dragElement.style.bottom;
      setTimeout(() => {
        dragElement.style.bottom = finalBottomPx;
      }, 50);
    };

    handleElement.addEventListener("mousedown", onDragStart);
    handleElement.addEventListener("touchstart", onDragStart, {
      passive: false,
    });
  }

  /**
   * 绑定视频元素的 timeupdate 和 seeked 事件监听器。
   */
  #attachEventListeners() {
    this.#videoEl.addEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.addEventListener("seeked", this.onSeek);
  }

  /**
   * 移除事件监听器。
   */
  #removeEventListeners() {
    this.#videoEl.removeEventListener("timeupdate", this.onTimeUpdate);
    this.#videoEl.removeEventListener("seeked", this.onSeek);
  }

  /**
   * 视频播放时间更新时的回调，负责更新字幕和触发预翻译。
   */
  onTimeUpdate() {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    const subtitleIndex = this.#findSubtitleIndexForTime(currentTimeMs);

    if (subtitleIndex !== this.#currentSubtitleIndex) {
      this.#currentSubtitleIndex = subtitleIndex;
      const subtitle =
        subtitleIndex !== -1 ? this.#formattedSubtitles[subtitleIndex] : null;
      this.#updateCaptionDisplay(subtitle);
    }

    this.#throttledTriggerTranslations(currentTimeMs);
  }

  /**
   * 用户拖动进度条后的回调。
   */
  onSeek() {
    this.#currentSubtitleIndex = -1;
    this.#throttledTriggerTranslations.cancel();
    this.onTimeUpdate();
  }

  /**
   * 根据时间（毫秒）查找对应的字幕索引。
   * @param {number} currentTimeMs
   * @returns {number} 找到的字幕索引，-1 表示没找到。
   */
  #findSubtitleIndexForTime(currentTimeMs) {
    return this.#formattedSubtitles.findIndex(
      (sub) => currentTimeMs >= sub.start && currentTimeMs <= sub.end
    );
  }

  /**
   * 更新字幕窗口的显示内容。
   * @param {object | null} subtitle - 字幕对象，或 null 用于清空。
   */
  #updateCaptionDisplay(subtitle) {
    if (!this.#paperEl || !this.#captionWindowEl) return;

    if (this.#isAdPlaying) {
      this.#paperEl.style.display = "none";
      return;
    }

    if (subtitle) {
      // 创建带有单词标记的字幕内容
      const p1 = document.createElement("p");
      p1.style.cssText = this.#setting.originStyle;

      if (!isMobile && this.#setting.isEnhance !== false) {
        p1.innerHTML = trustedTypesHelper.createHTML(
          this.#wrapWordsWithSpans(subtitle.text)
        );
      } else {
        p1.textContent = truncateWords(subtitle.text);
      }

      const p2 = document.createElement("p");
      p2.style.cssText = this.#setting.translationStyle;
      p2.textContent = truncateWords(subtitle.translation) || "...";

      if (this.#setting.isBilingual) {
        this.#captionWindowEl.replaceChildren(p1, p2);
      } else {
        this.#captionWindowEl.replaceChildren(p2);
      }

      this.#paperEl.style.display = "block";
    } else {
      this.#paperEl.style.display = "none";
    }
  }

  // 将句子中的每个单词包装在span标签中
  #wrapWordsWithSpans(text) {
    // 使用正则表达式分割单词，保留空格和标点符号
    // 这个正则表达式匹配英文单词（包括带撇号的）
    return text.replace(
      /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g,
      '<span class="kiss-subtitle-word" data-word="$1">$1</span>'
    );
  }

  /**
   * 提前翻译指定时间范围内的字幕。
   * @param {number} currentTimeMs
   */
  #triggerTranslations(currentTimeMs) {
    const { preTrans = 90 } = this.#setting;
    const lookAheadMs = preTrans * 1000;

    for (const sub of this.#formattedSubtitles) {
      const isCurrent = sub.start <= currentTimeMs && sub.end >= currentTimeMs;
      const isUpcoming =
        sub.start > currentTimeMs && sub.start <= currentTimeMs + lookAheadMs;
      const needsTranslation = !sub.translation && !sub.isTranslating;

      if ((isCurrent || isUpcoming) && needsTranslation) {
        this.#translateAndStore(sub);
      }
    }
  }

  /**
   * 执行单个字幕的翻译并更新其状态。
   * @param {object} subtitle - 需要翻译的字幕对象。
   */
  async #translateAndStore(subtitle) {
    subtitle.isTranslating = true;
    try {
      const { fromLang, toLang, apiSetting } = this.#setting;
      const { trText } = await apiTranslate({
        text: subtitle.text,
        fromLang,
        toLang,
        apiSetting,
      });
      subtitle.translation = trText;
    } catch (error) {
      logger.info("Translation failed for:", subtitle.text, error);
      subtitle.translation = "[Translation failed]";
    } finally {
      subtitle.isTranslating = false;

      const currentSubtitleIndexNow = this.#findSubtitleIndexForTime(
        this.#videoEl.currentTime * 1000
      );
      if (this.#formattedSubtitles[currentSubtitleIndexNow] === subtitle) {
        this.#updateCaptionDisplay(subtitle);
      }

      // 通知外部组件字幕已更新
      if (this.onSubtitleUpdate) {
        this.onSubtitleUpdate(this.#formattedSubtitles);
      }
    }
  }

  /**
   * 追加新的字幕
   * @param {Array<object>} newSubtitlesChunk - 新的、要追加的字幕数据块。
   */
  appendSubtitles(newSubtitlesChunk) {
    if (!newSubtitlesChunk || newSubtitlesChunk.length === 0) {
      return;
    }

    logger.info(
      `Bilingual Subtitle Manager: Appending ${newSubtitlesChunk.length} new subtitles...`
    );

    // 同一个数组引用，此处无需重复添加和排序
    // this.#formattedSubtitles.push(...newSubtitlesChunk);
    // this.#formattedSubtitles.sort((a, b) => a.start - b.start);
    this.#currentSubtitleIndex = -1;
    this.onTimeUpdate();

    // 通知外部组件字幕已更新
    if (this.onSubtitleUpdate) {
      this.onSubtitleUpdate(this.#formattedSubtitles);
    }
  }

  updateSetting(obj) {
    this.#setting = { ...this.#setting, ...obj };
  }

  // 获取当前字幕的开始时间（使用重新分段后的时间）
  #getCurrentSubtitleStartTime() {
    const currentTimeMs = this.#videoEl.currentTime * 1000;
    // 查找当前时间对应的字幕
    const currentSubtitle = this.#formattedSubtitles.find(
      (sub) => currentTimeMs >= sub.start && currentTimeMs <= sub.end
    );

    // 返回重新分段后的字幕开始时间，如果没有找到则返回当前时间
    return currentSubtitle ? currentSubtitle.start : currentTimeMs;
  }
}
