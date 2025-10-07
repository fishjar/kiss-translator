import { logger } from "../libs/log.js";

/**
 * @class BilingualSubtitleManager
 * @description 负责在视频上显示和翻译字幕的核心逻辑
 */
export class BilingualSubtitleManager {
  #videoEl;
  #formattedSubtitles = [];
  #translationService;
  #captionWindowEl = null;
  #currentSubtitleIndex = -1;
  #preTranslateSeconds = 60;
  #setting = {};

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
    this.#captionWindowEl?.parentElement?.remove();
    this.#formattedSubtitles = [];
  }

  /**
   * 创建并配置用于显示字幕的 DOM 元素。
   */
  #createCaptionWindow() {
    const container = document.createElement("div");
    container.className = `kiss-caption-window-container notranslate`;
    container.style.cssText = `position:absolute; width:100%; height:100%; left:0; top:0;`;

    this.#captionWindowEl = document.createElement("div");
    this.#captionWindowEl.className = `kiss-caption-window`;
    this.#captionWindowEl.style.cssText = this.#setting.windowStyle;

    container.appendChild(this.#captionWindowEl);

    const videoContainer = this.#videoEl.parentElement?.parentElement;
    if (!videoContainer) {
      logger.warn("could not find videoContainer");
      return;
    }

    videoContainer.style.position = "relative";
    videoContainer.appendChild(container);
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
    if (!this.#captionWindowEl) return;

    if (subtitle) {
      const p1 = document.createElement("p");
      p1.style.cssText = this.#setting.originStyle;
      p1.textContent = subtitle.text;

      const p2 = document.createElement("p");
      p2.style.cssText = this.#setting.originStyle;
      p2.textContent = subtitle.translation || "...";

      if (this.#setting.isBilingual) {
        this.#captionWindowEl.replaceChildren(p1, p2);
      } else {
        this.#captionWindowEl.replaceChildren(p2);
      }

      this.#captionWindowEl.style.opacity = "1";
    } else {
      this.#captionWindowEl.style.opacity = "0";
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
      const { toLang, apiSetting } = this.#setting;
      const [translatedText] = await this.#translationService({
        text: subtitle.text,
        fromLang: "en",
        toLang,
        apiSetting,
      });
      subtitle.translation = translatedText;
    } catch (error) {
      logger.error("Translation failed for:", subtitle.text, error);
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
}
