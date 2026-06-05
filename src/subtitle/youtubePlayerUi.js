import { APP_NAME } from "../config";
import DomManager from "../libs/domManager.js";
import { createLogoSVG } from "../libs/svg.js";
import { Menus } from "./Menus.js";

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
      this.#menuManager.updateProps(this.#getMenuProps());
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

    const toggleButton = document.createElement("button");
    toggleButton.className = "ytp-button kiss-subtitle-button";
    toggleButton.title = APP_NAME;

    toggleButton.appendChild(createLogoSVG());
    kissControls.appendChild(toggleButton);

    // 使用 DomManager 挂载 React 菜单，避免直接把菜单结构散落到 provider 编排层。
    this.#menuManager = new DomManager({
      id: "kiss-subtitle-menus",
      className: "notranslate",
      reactComponent: Menus,
      rootElement: kissControls,
      props: this.#getMenuProps(),
    });

    toggleButton.onclick = () => {
      if (!this.#isMenuShow) {
        this.#isMenuShow = true;
        this.#toggleButton?.replaceChildren(
          createLogoSVG({ isSelected: true })
        );
        this.#menuManager.show();
        this.updateMenuProps();
      } else {
        this.#isMenuShow = false;
        this.#toggleButton?.replaceChildren(createLogoSVG());
        this.#menuManager.hide();
      }
    };
    this.#toggleButton = toggleButton;

    ytControls?.prepend(kissControls);
  }

  /**
   * 移除已注入的字幕菜单按钮并销毁对应菜单挂载实例。
   *
   * @returns {void}
   */
  removeToggleButton() {
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
    const ytCaption = document.querySelector(YT_CAPTION_SELECTOR);
    ytCaption && (ytCaption.style.top = "-10000px");
  }

  /**
   * 恢复 YouTube 原生字幕窗口的位置。
   *
   * @returns {void}
   */
  showYtCaption() {
    const ytCaption = document.querySelector(YT_CAPTION_SELECTOR);
    ytCaption && (ytCaption.style.top = "0");
  }

  /**
   * 创建并插入播放器上方通知气泡。
   *
   * @returns {void}
   */
  createNotificationElement() {
    const notificationEl = document.createElement("div");
    notificationEl.className = "kiss-notification";
    Object.assign(notificationEl.style, {
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0, 0, 0, 0.5)",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      zIndex: "2147483647",
      opacity: "0",
      transition: "opacity 0.3s ease-in-out",
      pointerEvents: "none",
      fontSize: "16px",
      lineHeight: "1.4",
      width: "auto",
      maxWidth: "min(360px, calc(100% - 32px))",
      textAlign: "left",
      boxSizing: "border-box",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    });

    const videoEl = this.#getVideoEl();
    const videoContainer = videoEl?.parentElement?.parentElement;
    if (videoContainer) {
      videoContainer.appendChild(notificationEl);
      this.#notificationEl = notificationEl;
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

    if (!this.#notificationEl) this.createNotificationElement();
    if (!this.#notificationEl) return;

    this.#notificationEl.textContent = message;
    this.#notificationEl.style.opacity = "1";
    clearTimeout(this.#notificationTimeout);
    this.#notificationTimeout = setTimeout(() => {
      this.hideNotification();
    }, duration);
  }
}
