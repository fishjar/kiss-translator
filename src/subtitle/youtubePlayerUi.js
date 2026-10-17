import { APP_NAME } from "../config";
import DomManager from "../libs/domManager.js";
import { createLogoSVG } from "../libs/svg.js";
import { Menus } from "./Menus.js";
import { asrFeedbackEvents } from "./asr/status";

/**
 * YouTube 播放器 UI 层。
 * 只负责按钮、菜单、通知气泡和原生字幕窗口的 DOM 操作，不处理字幕数据和翻译流程。
 */

export const VIDEO_SELECTOR = "#container video";
export const CONTROLS_SELECTOR = ".ytp-right-controls";
export const YT_CAPTION_SELECTOR = "#ytp-caption-window-container";
export const YT_AD_SELECTOR = ".video-ads";
export const YT_SUBTITLE_BUTTON_SELECTOR = "button.ytp-subtitles-button";

/**
 * 异步等待目标 DOM 元素挂载并执行回调。
 *
 * @param {string} selector CSS 选择器。
 * @param {function(HTMLElement): void} callback 找到元素后的回调函数。
 * @returns {void}
 */
export function waitForElement(selector, callback) {
  const element = document.querySelector(selector);
  if (element) {
    callback(element);
    return;
  }

  const observer = new MutationObserver((mutations, obs) => {
    const targetNode = document.querySelector(selector);
    if (targetNode) {
      obs.disconnect();
      callback(targetNode);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * 管理 YouTube 播放器上的 Kiss Translator 按钮、菜单和通知。
 */
export class YouTubePlayerUi {
  #getSetting;
  #getMenuProps;
  #getVideoEl;
  #toggleButton = null;
  #isMenuShow = false;
  #menuManager = null;
  #notificationEl = null;
  #notificationTimeout = null;
  #topContainer = null;
  #progressEl = null;
  #progressLabel = null;
  #progressBar = null;
  #progressSignature;
  #feedbackEvents = new Set();
  #feedbackSession;
  #countdownTimer;
  #pendingNotification = null;
  #notificationErrorUntil = 0;
  #menuFrame;
  #resizeObserver;
  #captionPositions = new Map();

  closeMenu = () => {
    this.#isMenuShow = false;
    this.#menuManager?.hide();
    this.#toggleButton?.setAttribute("aria-expanded", "false");
    this.#toggleButton?.replaceChildren(createLogoSVG());
    this.#toggleButton?.focus();
    cancelAnimationFrame(this.#menuFrame);
  };

  #fitMenu = () => {
    if (!this.#isMenuShow) return;
    const menu = document.querySelector("#kiss-subtitle-menus [role=dialog]");
    const player = this.#getVideoEl()?.closest(".html5-video-player");
    if (menu && player) {
      const bounds = player.getBoundingClientRect();
      menu.style.maxHeight = `${Math.max(60, bounds.height - 80)}px`;
      menu.style.maxWidth = `${Math.max(100, bounds.width - 24)}px`;
      const rect = menu.getBoundingClientRect();
      let offset = Number(menu.dataset.offset || 0);
      if (rect.right > bounds.right - 8)
        offset -= rect.right - bounds.right + 8;
      if (rect.left < bounds.left + 8) offset += bounds.left + 8 - rect.left;
      menu.dataset.offset = String(offset);
      menu.style.transform = `translateX(${offset}px)`;
    }
  };

  /**
   * 创建播放器 UI 管理器。
   *
   * @param {object} param0 参数对象。
   * @param {Function} param0.getSetting 获取当前字幕设置的函数。
   * @param {Function} param0.getMenuProps 获取菜单 React props 的函数。
   * @param {Function} param0.getVideoEl 获取当前 video DOM 的函数。
   */
  constructor({ getSetting, getMenuProps, getVideoEl }) {
    this.#getSetting = getSetting;
    this.#getMenuProps = getMenuProps;
    this.#getVideoEl = getVideoEl;
  }

  /**
   * 更新菜单组件的 props。
   *
   * @returns {void}
   */
  updateMenuProps() {
    if (this.#menuManager && this.#isMenuShow) {
      this.#menuManager.updateProps({
        ...this.#getMenuProps(),
        onClose: this.closeMenu,
      });
    }
  }

  /**
   * 向 YouTube 右侧控制栏注入 Kiss Translator 字幕菜单按钮。
   *
   * @param {HTMLElement|null} ytControls YouTube 原生右侧控制栏容器。
   * @returns {void}
   */
  injectToggleButton(ytControls) {
    if (
      this.#getSetting().hideSubtitleButton === true ||
      !ytControls ||
      ytControls.querySelector(".kiss-subtitle-button")
    ) {
      return;
    }

    const kissControls = document.createElement("div");
    kissControls.className = "notranslate kiss-subtitle-controls";
    Object.assign(kissControls.style, {
      height: "100%",
      position: "relative",
    });
    if (ytControls.matches(".html5-video-player")) {
      Object.assign(kissControls.style, {
        position: "absolute",
        bottom: "48px",
        right: "12px",
        height: "36px",
        zIndex: 60,
      });
    }

    const toggleButton = document.createElement("button");
    toggleButton.className = "ytp-button kiss-subtitle-button";
    toggleButton.title = APP_NAME;
    toggleButton.setAttribute("aria-label", APP_NAME);
    toggleButton.setAttribute("aria-haspopup", "dialog");
    toggleButton.setAttribute("aria-expanded", "false");

    toggleButton.appendChild(createLogoSVG());
    kissControls.appendChild(toggleButton);

    // 使用 DomManager 挂载 React 菜单，避免直接把菜单结构散落到 provider 编排层。
    this.#menuManager = new DomManager({
      id: "kiss-subtitle-menus",
      className: "notranslate",
      reactComponent: Menus,
      rootElement: kissControls,
      props: { ...this.#getMenuProps(), onClose: this.closeMenu },
    });

    toggleButton.onclick = () => {
      if (!this.#isMenuShow) {
        this.#isMenuShow = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        this.#menuManager.show();
        this.updateMenuProps();
        toggleButton.setAttribute("aria-expanded", "true");
        this.#menuFrame = requestAnimationFrame(() => {
          document
            .querySelector("#kiss-subtitle-menus [role=button][tabindex='0']")
            ?.focus();
          this.#fitMenu();
        });
      } else {
        this.closeMenu();
      }
    };
    this.#toggleButton = toggleButton;
    window.addEventListener("resize", this.#fitMenu);
    document.addEventListener("fullscreenchange", this.#fitMenu);
    if (typeof ResizeObserver !== "undefined") {
      this.#resizeObserver = new ResizeObserver(this.#fitMenu);
      const player = this.#getVideoEl()?.closest(".html5-video-player");
      if (player) this.#resizeObserver.observe(player);
    }

    ytControls?.prepend(kissControls);
  }

  /**
   * 移除已注入的字幕菜单按钮并销毁对应菜单挂载实例。
   *
   * @returns {void}
   */
  removeToggleButton() {
    clearTimeout(this.#notificationTimeout);
    this.resetTaskFeedback();
    this.#topContainer?.remove();
    this.#topContainer = null;
    this.#progressEl = null;
    this.#progressSignature = undefined;
    this.#notificationEl = null;
    cancelAnimationFrame(this.#menuFrame);
    this.#resizeObserver?.disconnect();
    window.removeEventListener("resize", this.#fitMenu);
    document.removeEventListener("fullscreenchange", this.#fitMenu);
    this.#isMenuShow = false;
    this.#menuManager?.destroy();
    this.#menuManager = null;
    const kissControls =
      this.#toggleButton?.closest(".kiss-subtitle-controls") ||
      document.querySelector(".kiss-subtitle-controls");
    kissControls?.remove();
    this.#toggleButton = null;
  }

  /**
   * 将 YouTube 原生字幕窗口移出屏幕，避免与双语字幕重叠。
   *
   * @returns {void}
   */
  hideYtCaption() {
    const player = this.#getVideoEl()?.closest(".html5-video-player");
    const ytCaption =
      player?.querySelector(YT_CAPTION_SELECTOR) ||
      document.querySelector(YT_CAPTION_SELECTOR);
    if (ytCaption) {
      if (!this.#captionPositions.has(ytCaption))
        this.#captionPositions.set(ytCaption, ytCaption.style.top);
      ytCaption.style.top = "-10000px";
    }
  }

  /**
   * 恢复 YouTube 原生字幕窗口的位置。
   *
   * @returns {void}
   */
  showYtCaption() {
    for (const [element, top] of this.#captionPositions)
      element.style.top = top;
    this.#captionPositions.clear();
  }

  /**
   * 创建并插入播放器上方通知气泡。
   *
   * @returns {void}
   */
  createNotificationElement() {
    const video = this.#getVideoEl();
    const player =
      video?.closest(".html5-video-player, #movie_player") ||
      video?.parentElement?.parentElement;
    if (!player) return;
    const container = document.createElement("div");
    container.className = "kiss-player-feedback";
    Object.assign(container.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "max-content",
      maxWidth: "calc(100% - 32px)",
      zIndex: "2147483647",
      pointerEvents: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "8px",
    });
    const progress = document.createElement("div");
    progress.className = "kiss-task-progress";
    progress.hidden = true;
    progress.style.cssText =
      "box-sizing:border-box;width:320px;max-width:100%;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.65);color:white;font:12px/1.5 sans-serif;";
    const label = document.createElement("div");
    const bar = document.createElement("progress");
    bar.max = 100;
    bar.style.cssText =
      "display:block;width:100%;height:4px;margin-top:4px;accent-color:#209cee;";
    progress.append(label, bar);
    const notificationEl = document.createElement("div");
    notificationEl.className = "kiss-notification";
    notificationEl.setAttribute("role", "status");
    Object.assign(notificationEl.style, {
      background: "rgba(0,0,0,.65)",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "14px",
      lineHeight: "1.4",
      maxWidth: "100%",
      boxSizing: "border-box",
      textAlign: "center",
      whiteSpace: "pre-line",
      overflowWrap: "anywhere",
    });
    container.append(progress, notificationEl);
    player.appendChild(container);
    this.#topContainer = container;
    this.#notificationEl = notificationEl;
    this.#progressEl = progress;
    this.#progressLabel = label;
    this.#progressBar = bar;
  }

  resetTaskFeedback() {
    clearInterval(this.#countdownTimer);
    this.#countdownTimer = undefined;
    this.#feedbackEvents.clear();
    this.#feedbackSession = undefined;
    this.#pendingNotification = null;
    this.#notificationErrorUntil = 0;
    this.hideNotification();
    this.setTaskProgress(null);
  }

  notifyOnce(key, message, error = false) {
    if (this.#feedbackEvents.has(key)) return;
    this.#feedbackEvents.add(key);
    this.showNotification(message, error ? 4000 : 2000);
  }

  setTaskProgress(progress) {
    const signature = JSON.stringify(progress);
    if (signature === this.#progressSignature) return;
    if (!progress && !this.#progressEl) return;
    if (!this.#notificationEl) this.createNotificationElement();
    if (!this.#progressEl) return;
    this.#progressSignature = signature;
    this.#progressEl.hidden = !progress;
    if (!progress) return;
    this.#progressLabel.textContent = progress.label;
    this.#progressBar.setAttribute("aria-label", progress.label);
    if (progress.percent === undefined)
      this.#progressBar.removeAttribute("value");
    else this.#progressBar.value = progress.percent;
  }

  updateCaptionFeedback(state, i18n) {
    clearInterval(this.#countdownTimer);
    this.#countdownTimer = undefined;
    const render = () => {
      this.setTaskProgress(
        state.cooldownUntil > Date.now()
          ? {
              label: `${i18n("youtube_caption_rate_limited")} (${Math.ceil((state.cooldownUntil - Date.now()) / 1000)}s)`,
            }
          : null
      );
      if (state.cooldownUntil <= Date.now()) {
        clearInterval(this.#countdownTimer);
        this.#countdownTimer = undefined;
      }
    };
    render();
    if (state.cooldownUntil > Date.now())
      this.#countdownTimer = setInterval(render, 250);
    const phase = state.phase;
    if (["off", "idle"].includes(phase)) return;
    const key = state.code
      ? `youtube_caption_${state.code.toLowerCase()}`
      : `youtube_caption_${phase}`;
    this.notifyOnce(
      `caption:${phase}:${state.code || ""}`,
      i18n(key),
      ["error", "empty", "cooldown"].includes(phase)
    );
  }

  updateAsrFeedback(state, i18n) {
    if (state.phase === "off") {
      const wasActive = this.#feedbackSession !== undefined;
      this.resetTaskFeedback();
      if (wasActive)
        this.notifyOnce("stopped", i18n("youtube_asr_task_stopped"));
      return;
    }
    if (
      state.feedbackSession !== undefined &&
      state.feedbackSession !== this.#feedbackSession
    ) {
      this.resetTaskFeedback();
      this.#feedbackSession = state.feedbackSession;
    }
    this.setTaskProgress(null);
    for (const event of asrFeedbackEvents(state, i18n)) {
      if (["start", "cached", "complete"].includes(event.key))
        this.notifyOnce(event.key, event.message);
    }
  }

  /**
   * 隐藏当前通知气泡。
   *
   * @returns {void}
   */
  hideNotification() {
    clearTimeout(this.#notificationTimeout);
    if (this.#notificationEl) {
      this.#notificationEl.style.opacity = "0";
    }
  }

  /**
   * 展现通知气泡，支持传入自定义停留展示时长。
   *
   * @param {string} message 通知文案。
   * @param {number} [duration=2000] 停留展示时长，单位毫秒。
   * @returns {void}
   */
  showNotification(message, duration = 2000) {
    if (this.#getSetting().showLoadNotification === false) {
      this.hideNotification();
      return;
    }

    if (duration < 4000 && this.#notificationErrorUntil > Date.now()) {
      this.#pendingNotification = message;
      return;
    }
    if (!this.#notificationEl) this.createNotificationElement();
    if (!this.#notificationEl) return;

    const sameMessage = this.#notificationEl.textContent === message;
    if (sameMessage && this.#notificationEl.style.opacity === "1") return;
    if (!sameMessage) this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    this.#notificationErrorUntil = duration >= 4000 ? Date.now() + duration : 0;
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      const pending = this.#pendingNotification;
      this.#pendingNotification = null;
      this.#notificationErrorUntil = 0;
      this.hideNotification();
      if (pending) this.showNotification(pending);
    }, duration);
  }
}
