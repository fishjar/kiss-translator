import { logger } from "../libs/log.js";
import { truncateWords } from "../libs/utils.js";

/**
 * @class BilingualSubtitleManager
 * @description 负责在视频上显示和翻译字幕的核心逻辑
 */
export class BilingualSubtitleManager {
  #videoEl;
  #formattedSubtitles = [];
  #translationService;
  #captionWindowEl = null;
  #paperEl = null;
  #currentSubtitleIndex = -1;
  #preTranslateSeconds = 100;
  #setting = {};
  #isAdPlaying = false;

  /**
   * @param {object} options
   * @param {HTMLVideoElement} options.videoEl - 页面上的 video 元素。
   * @param {Array<object>} options.formattedSubtitles - 已格式化好的字幕数组。
   * @param {(text: string, toLang: string) => Promise<string>} options.translationService - 外部翻译函数。
   * @param {object} options.setting - 配置对象，如目标翻译语言。
   */
  constructor({ videoEl, formattedSubtitles, translationService, setting }) {
    this.#setting = setting;
    this.#videoEl = videoEl;
    this.#formattedSubtitles = formattedSubtitles;
    this.#translationService = translationService;

    this.onTimeUpdate = this.onTimeUpdate.bind(this);
    this.onSeek = this.onSeek.bind(this);
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
    this.#captionWindowEl?.parentElement?.parentElement?.remove();
    this.#formattedSubtitles = [];
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
  }

  /**
   * 为指定的元素启用垂直拖动功能。
   */
  #enableDragging(dragElement, boundaryContainer, handleElement) {
    let isDragging = false;
    let startY;
    let initialBottom;
    let dragElementHeight;

    const onMouseDown = (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (e.button !== 0) return;

      isDragging = true;
      handleElement.style.cursor = "grabbing";
      startY = e.clientY;

      initialBottom =
        boundaryContainer.getBoundingClientRect().bottom -
        dragElement.getBoundingClientRect().bottom;

      dragElementHeight = dragElement.offsetHeight;

      document.addEventListener("mousemove", onMouseMove, { capture: true });
      document.addEventListener("mouseup", onMouseUp, { capture: true });
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      const deltaY = e.clientY - startY;
      let newBottom = initialBottom - deltaY;

      const containerHeight = boundaryContainer.clientHeight;
      newBottom = Math.max(0, newBottom);
      newBottom = Math.min(containerHeight - dragElementHeight, newBottom);
      if (dragElementHeight > containerHeight) {
        newBottom = Math.max(0, newBottom);
      }

      dragElement.style.bottom = `${newBottom}px`;
    };

    const onMouseUp = (e) => {
      if (!isDragging) return;

      e.preventDefault();
      e.stopPropagation();

      isDragging = false;
      handleElement.style.cursor = "grab";

      document.removeEventListener("mousemove", onMouseMove, { capture: true });
      document.removeEventListener("mouseup", onMouseUp, { capture: true });

      const finalBottomPx = dragElement.style.bottom;
      setTimeout(() => {
        dragElement.style.bottom = finalBottomPx;
      }, 50);
    };

    handleElement.addEventListener("mousedown", onMouseDown);
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

    this.#triggerTranslations(currentTimeMs);
  }

  /**
   * 用户拖动进度条后的回调。
   */
  onSeek() {
    this.#currentSubtitleIndex = -1;
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
      const p1 = document.createElement("p");
      p1.style.cssText = this.#setting.originStyle;
      p1.textContent = truncateWords(subtitle.text);

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

  /**
   * 提前翻译指定时间范围内的字幕。
   * @param {number} currentTimeMs
   */
  #triggerTranslations(currentTimeMs) {
    const lookAheadMs = this.#preTranslateSeconds * 1000;

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
      const [translatedText] = await this.#translationService({
        text: subtitle.text,
        fromLang,
        toLang,
        apiSetting,
      });
      subtitle.translation = translatedText;
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

    this.#formattedSubtitles.push(...newSubtitlesChunk);
    this.#formattedSubtitles.sort((a, b) => a.start - b.start);
    this.#currentSubtitleIndex = -1;
    this.onTimeUpdate();
  }
}
