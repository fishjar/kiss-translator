/**
 * @file imageTranslateManager.js
 * @description 网页图片翻译协调管理器：统一管理图片悬停识别、屏幕截图框选与浮动翻译弹窗的生命周期。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

import { APP_CONSTS } from "../../config/app";
import { isolateShadowHost, mountShadowHost } from "../shadowHost";
import { isIframe } from "../iframe";
import { newI18n } from "../../config/i18n";
import { checkScreenshotSupport } from "./screenshotSupport";
import { ImageHoverDetector } from "./imageHoverDetector";
import { ScreenshotOverlay } from "./screenshotOverlay";
import { ImageSourceHighlight } from "./imageSourceHighlight";
import ImageLayoutOverlay from "../../views/ImageTranslate/ImageLayoutOverlay";
import { readImageAsBlob } from "./imageReader";
import ImageTranslate from "../../views/ImageTranslate";

export class ImageTranslateManager {
  #setting;
  #rule;
  #isIframe;
  #i18n;

  #hoverDetector = null;
  #screenshotOverlay = null;
  #sourceHighlight = new ImageSourceHighlight();

  // 原图布局线框全局挂载
  #currentImageElement = null;
  #layoutOverlayContainer = null;
  #layoutOverlayReactRoot = null;
  #layoutRegions = [];
  #showLayoutOverlay = true;
  #sourceType = "image";
  #requestVersion = 0;
  #screenshotSession = 0;
  #imageAction = "menu";
  #onScreenshotSessionChange;
  #screenshotActive = false;

  #container = null;
  #shadowContainer = null;
  #cleanupHostMount = null;
  #reactRoot = null;
  #cache = null;

  #boxProps = {
    showBox: false,
    imageBlob: null,
    imageDataUrl: null,
    initialAutoTranslate: false,
  };

  #messageListener = null;

  constructor({
    setting,
    rule,
    isIframe: iframeFlag,
    onScreenshotSessionChange,
  } = {}) {
    this.#setting = setting;
    this.#rule = rule;
    this.#isIframe = iframeFlag ?? isIframe;
    this.#onScreenshotSessionChange = onScreenshotSessionChange;
    this.#i18n = newI18n(this.#setting?.uiLang || "zh");

    // iframe 内部不启用悬停与截图，避免层级穿透与重叠冲突
    if (!this.#isIframe) {
      this.#initHoverDetector();
      this.#initScreenshotOverlay();
    }
  }

  #initHoverDetector() {
    this.#hoverDetector = new ImageHoverDetector({
      setting: this.#setting,
      rule: this.#rule,
      isIframe: this.#isIframe,
      i18n: this.#i18n,
      onActivateImage: (imageElement) => {
        if (
          this.#sourceType === "screenshot" ||
          (this.#currentImageElement &&
            imageElement !== this.#currentImageElement)
        ) {
          this.closeBox();
          this.#hoverDetector?.resume(imageElement);
        }
      },
      onToggleBox: (imageElement) => {
        if (
          this.#sourceType !== "image" ||
          imageElement !== this.#currentImageElement
        )
          return false;
        return this.#toggleBox();
      },
      onToggleLayoutOverlay: (show, imageElement) => {
        if (imageElement !== this.#currentImageElement) return;
        this.#showLayoutOverlay = show;
        this.#renderLayoutOverlay();
      },
      onOpenBox: async ({
        imageElement,
        action,
        selectedRegions,
        showLayoutOverlay,
        isCurrent,
      }) => {
        if (!isCurrent()) return;
        this.openBox({
          imageElement,
          selectedRegions,
          showLayoutOverlay,
          sourceBusy: true,
        });
        return this.#prepareImage(imageElement, action);
      },
    });
  }

  #toggleBox() {
    if (!this.#boxProps.showBox) return false;
    this.#boxProps = {
      ...this.#boxProps,
      boxVisible: this.#boxProps.boxVisible === false,
    };
    this.#render();
    return true;
  }

  async #prepareImage(imageElement, action) {
    this.#imageAction = action;
    const version = this.#boxProps.requestVersion;
    const isCurrent = () =>
      this.#boxProps.showBox && this.#boxProps.requestVersion === version;
    this.#boxProps = { ...this.#boxProps, sourceBusy: true, sourceError: "" };
    flushSync(() => this.#render());
    // 让弹框先完成绘制，再开始 Canvas 导出或跨域读取。
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 0))
    );
    if (!isCurrent()) return;
    try {
      const { blob } = await readImageAsBlob(imageElement);
      if (!isCurrent()) return;
      this.#boxProps = {
        ...this.#boxProps,
        imageBlob: blob,
        sourceBusy: false,
        initialAutoTranslate: action === "all",
      };
    } catch (err) {
      if (!isCurrent()) return;
      this.#boxProps = {
        ...this.#boxProps,
        sourceBusy: false,
        sourceError:
          err.message ||
          this.#i18n("image_read_error", "读取图片失败，请使用截图翻译"),
      };
    }
    this.#render();
  }

  #initScreenshotOverlay() {
    this.#screenshotOverlay = new ScreenshotOverlay({
      i18n: this.#i18n,
      setting: this.#setting,
    });
  }

  #setScreenshotActive(active) {
    if (this.#screenshotActive === active) return;
    this.#screenshotActive = active;
    this.#onScreenshotSessionChange?.(active);
  }

  /**
   * 启动全屏截图框选
   */
  async startScreenshot() {
    if (this.#isIframe) return;
    const requestVersion = this.#requestVersion;
    if (!(await checkScreenshotSupport(this.#i18n))) return;
    if (requestVersion !== this.#requestVersion) return;

    this.closeBox({ keepScreenshotActive: true });
    flushSync(() => this.#hoverDetector?.suspend());
    const session = ++this.#screenshotSession;
    this.#sourceType = "screenshot";
    this.#setScreenshotActive(true);
    const isCurrent = () =>
      session === this.#screenshotSession && this.#sourceType === "screenshot";
    // 捕获的是已经绘制的页面，必须先让清理后的页面完成绘制。
    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(resolve, 0))
    );
    if (!isCurrent()) return;
    this.#screenshotOverlay?.start({
      onToggleBox: () => isCurrent() && this.#toggleBox(),
      onComplete: ({
        blob,
        action,
        selection,
        selectedRegions,
        showLayoutOverlay,
      }) => {
        if (!isCurrent()) return;
        this.openBox({
          blob,
          selection,
          selectedRegions,
          showLayoutOverlay,
          sourceType: "screenshot",
          autoTranslate: action === "all",
        });
        this.#screenshotOverlay?.setTaskState?.(action === "all");
      },
      onLayoutChange: (regions, visible = true) => {
        if (!isCurrent()) return;
        this.#layoutRegions = regions;
        this.#showLayoutOverlay = visible;
        this.#boxProps = { ...this.#boxProps, selectedRegions: regions };
        this.#render();
      },
      onSelectionChange: () => {
        if (!isCurrent() || !this.#boxProps.showBox) return;
        this.#layoutRegions = [];
        this.#boxProps = {
          ...this.#boxProps,
          imageBlob: null,
          selectedRegions: null,
          initialAutoTranslate: false,
          sourceBusy: true,
          requestVersion: ++this.#requestVersion,
        };
        this.#render();
      },
      onLayoutStart: () => {
        if (!isCurrent() || !this.#boxProps.showBox) return;
        this.#layoutRegions = [];
        this.#boxProps = {
          ...this.#boxProps,
          selectedRegions: null,
          initialAutoTranslate: false,
          requestVersion: ++this.#requestVersion,
        };
        this.#render();
      },
      onLocalBusyChange: (busy) => {
        if (!isCurrent() || !this.#boxProps.showBox) return;
        this.#boxProps = { ...this.#boxProps, sourceBusy: busy };
        this.#render();
      },
      onCancel: () => {
        if (isCurrent()) this.closeBox();
      },
    });
  }

  #ensureMounted() {
    if (!this.#container) {
      this.#container = document.createElement("div");
      this.#container.id = APP_CONSTS.imageBoxID;
      this.#container.className = "notranslate";
      isolateShadowHost(this.#container);

      this.#cleanupHostMount = mountShadowHost(this.#container, undefined, {
        onReconnect: () => this.#refreshStyles(),
      });

      this.#shadowContainer = this.#container.attachShadow({ mode: "open" });
      const shadowWrapper = document.createElement("div");
      shadowWrapper.className = `${APP_CONSTS.imageBoxID}_wrapper notranslate`;
      this.#shadowContainer.appendChild(shadowWrapper);

      this.#reactRoot = ReactDOM.createRoot(shadowWrapper);
      this.#refreshStyles();
    }
  }

  #refreshStyles() {
    this.#cache?.sheet?.flush?.();
    this.#cache = createCache({
      key: APP_CONSTS.imageBoxID,
      prepend: true,
      container: this.#shadowContainer,
    });
    this.#render();
  }

  #render() {
    if (!this.#reactRoot || !this.#cache) return;
    const requestVersion = this.#boxProps.requestVersion;
    const isCurrent = () => requestVersion === this.#boxProps.requestVersion;
    const imageElement = this.#currentImageElement;

    this.#reactRoot.render(
      <React.StrictMode>
        <CacheProvider value={this.#cache}>
          <ImageTranslate
            {...this.#boxProps}
            onCancelSource={
              this.#sourceType === "image"
                ? () => {
                    if (isCurrent()) this.closeBox();
                  }
                : undefined
            }
            onRetrySource={() => {
              if (isCurrent() && imageElement)
                this.#prepareImage(imageElement, this.#imageAction);
            }}
            onTaskStateChange={({ busy, requestVersion: version }) => {
              if (
                version !== this.#boxProps.requestVersion ||
                this.#sourceType !== "screenshot"
              )
                return;
              this.#screenshotOverlay?.setTaskState?.(busy);
            }}
            setShowBox={(show) => {
              if (!show && isCurrent()) {
                this.closeBox();
              }
            }}
            onLayoutDetected={(regions, { replace = false } = {}) => {
              if (!isCurrent()) return;
              if (
                regions &&
                (replace || (regions.length > 0 && !this.#layoutRegions.length))
              ) {
                this.#layoutRegions = regions;
                this.#showLayoutOverlay = true;
                this.#renderLayoutOverlay();
                // 同步将图片上方的悬停按钮置为激活态
                if (this.#sourceType === "image")
                  this.#hoverDetector?.setLayoutState(
                    "active",
                    regions,
                    true,
                    this.#currentImageElement,
                    true
                  );
                if (replace) {
                  this.#boxProps = {
                    ...this.#boxProps,
                    selectedRegions: regions,
                  };
                  this.#render();
                }
              }
            }}
            onSettingResetLayout={() => {
              if (!isCurrent()) return;
              // 分析服务变化或手动重新分析时重置布局。
              this.#clearLayoutOverlay();
              if (this.#sourceType === "image")
                this.#hoverDetector?.setLayoutState(
                  "idle",
                  [],
                  true,
                  this.#currentImageElement
                );
              this.#boxProps = { ...this.#boxProps, selectedRegions: null };
              this.#render();
            }}
            uiLang={this.#setting?.uiLang}
          />
        </CacheProvider>
      </React.StrictMode>
    );
  }

  #renderLayoutOverlay() {
    if (this.#sourceType === "screenshot") {
      this.#screenshotOverlay?.setLayoutState?.(
        this.#layoutRegions,
        this.#showLayoutOverlay
      );
      return;
    }
    if (
      !this.#currentImageElement ||
      !this.#layoutRegions?.length ||
      !this.#showLayoutOverlay
    ) {
      if (this.#layoutOverlayContainer) {
        this.#layoutOverlayContainer.style.display = "none";
      }
      return;
    }
    if (!this.#layoutOverlayContainer) {
      this.#layoutOverlayContainer = document.createElement("div");
      this.#layoutOverlayContainer.className =
        "kt-image-manager-layout-root notranslate";
      this.#layoutOverlayContainer.style.cssText =
        "position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483641;";
      document.body.appendChild(this.#layoutOverlayContainer);
      this.#layoutOverlayReactRoot = ReactDOM.createRoot(
        this.#layoutOverlayContainer
      );
    }
    this.#layoutOverlayContainer.style.display = "block";
    const rect = this.#currentImageElement.getBoundingClientRect();
    this.#layoutOverlayReactRoot.render(
      <ImageLayoutOverlay
        regions={this.#layoutRegions}
        imageRect={rect}
        naturalWidth={this.#currentImageElement.naturalWidth}
        naturalHeight={this.#currentImageElement.naturalHeight}
        visible={this.#showLayoutOverlay}
        onToggleRegion={(idx) => {
          this.#layoutRegions = this.#layoutRegions.map((r, i) =>
            i === idx ? { ...r, enabled: r.enabled === false } : r
          );
          this.#renderLayoutOverlay();
          this.#hoverDetector?.setLayoutState(
            "active",
            this.#layoutRegions,
            this.#showLayoutOverlay,
            this.#currentImageElement,
            true
          );
          // 同步更新弹窗的选区并通知选区版本变更
          this.#boxProps = {
            ...this.#boxProps,
            selectedRegions: this.#layoutRegions,
            selectedRegionsVersion: Date.now(),
          };
          this.#render();
        }}
      />
    );
  }

  #clearLayoutOverlay() {
    if (this.#sourceType === "screenshot")
      this.#screenshotOverlay?.setLayoutState?.(null);
    try {
      this.#layoutOverlayReactRoot?.unmount();
    } catch {}
    this.#layoutOverlayContainer?.remove();
    this.#layoutOverlayContainer = null;
    this.#layoutOverlayReactRoot = null;
    this.#layoutRegions = [];
    document
      .querySelectorAll(".kt-image-manager-layout-root")
      .forEach((e) => e.remove());
  }

  /**
   * 打开图片翻译弹窗
   * @param {Object} options
   * @param {Blob} [options.blob]
   * @param {string} [options.dataUrl]
   * @param {boolean} [options.autoTranslate]
   * @param {HTMLElement} [options.imageElement]
   * @param {Object} [options.selection]
   * @param {Array} [options.selectedRegions]
   */
  openBox({
    blob = null,
    dataUrl = null,
    autoTranslate = false,
    imageElement = null,
    selection = null,
    selectedRegions = null,
    showLayoutOverlay = true,
    sourceType = "image",
    sourceBusy = false,
  } = {}) {
    if (sourceType !== "screenshot") {
      this.closeBox();
      this.#hoverDetector?.resume(imageElement);
    }
    this.#sourceType = sourceType;
    this.#ensureMounted();
    this.#currentImageElement = imageElement;
    this.#showLayoutOverlay = showLayoutOverlay;
    if (imageElement) {
      this.#sourceHighlight.highlight(imageElement);
    }
    if (selectedRegions && selectedRegions.length > 0) {
      this.#layoutRegions = selectedRegions;
      // 先提交接管后的线框，再让悬停层移除自己的线框。
      flushSync(() => this.#renderLayoutOverlay());
      if (sourceType === "image")
        this.#hoverDetector?.setLayoutState(
          "active",
          selectedRegions,
          showLayoutOverlay,
          imageElement,
          true
        );
    } else {
      this.#clearLayoutOverlay();
    }
    const now = ++this.#requestVersion;
    this.#boxProps = {
      showBox: true,
      boxVisible: true,
      imageBlob: blob,
      imageDataUrl: dataUrl,
      selectedRegions,
      initialAutoTranslate: Boolean(autoTranslate),
      requestVersion: now,
      selectedRegionsVersion: now,
      sourceBusy,
      sourceError: "",
    };
    this.#render();
  }

  /**
   * 关闭图片翻译弹窗
   */
  closeBox({ keepScreenshotActive = false } = {}) {
    this.#screenshotSession++;
    // 先作废所有回调，再同步提交关闭状态，立即取消组件持有的任务。
    this.#boxProps = {
      ...this.#boxProps,
      showBox: false,
      imageBlob: null,
      imageDataUrl: null,
      selectedRegions: null,
      initialAutoTranslate: false,
      sourceBusy: false,
      sourceError: "",
      requestVersion: ++this.#requestVersion,
    };
    flushSync(() => {
      if (this.#currentImageElement && this.#layoutRegions.length) {
        this.#hoverDetector?.setLayoutState(
          "active",
          this.#layoutRegions,
          this.#showLayoutOverlay,
          this.#currentImageElement,
          false
        );
      }
      this.#hoverDetector?.suspend();
      this.#render();
    });
    this.#sourceHighlight.clear();
    this.#clearLayoutOverlay();
    this.#currentImageElement = null;
    this.#screenshotOverlay?.destroy(true);
    this.#sourceType = "image";
    this.#hoverDetector?.resume();
    if (!keepScreenshotActive) this.#setScreenshotActive(false);
  }

  /**
   * 更新规则
   */
  updateRule(rule) {
    this.#rule = rule;
    this.#hoverDetector?.updateConfig(this.#setting, this.#rule);
  }

  /**
   * 更新设置
   */
  updateSetting(setting) {
    this.#setting = setting;
    this.#i18n = newI18n(this.#setting?.uiLang || "zh");
    const layoutChanged = this.#hoverDetector?.updateConfig(
      this.#setting,
      this.#rule
    );
    if (layoutChanged) {
      this.#clearLayoutOverlay();
      if (this.#sourceType === "image")
        this.#hoverDetector?.setLayoutState(
          "idle",
          [],
          true,
          this.#currentImageElement
        );
      this.#boxProps = { ...this.#boxProps, selectedRegions: null };
    }
    this.#screenshotOverlay?.updateSetting?.(this.#setting);
    if (this.#boxProps.showBox) {
      this.#render();
    }
  }

  /**
   * 销毁并释放所有资源
   */
  destroy() {
    this.closeBox();
    this.#sourceHighlight?.clear();
    this.#sourceHighlight = null;
    this.#clearLayoutOverlay();
    this.#hoverDetector?.destroy?.();
    this.#hoverDetector = null;

    this.#screenshotOverlay?.destroy?.();
    this.#screenshotOverlay = null;

    this.#cleanupHostMount?.();
    this.#cleanupHostMount = null;
    this.#reactRoot?.unmount?.();
    this.#reactRoot = null;
    this.#cache?.sheet?.flush?.();
    this.#cache = null;
    this.#container?.remove?.();
    this.#container = null;
    this.#shadowContainer = null;
  }
}
