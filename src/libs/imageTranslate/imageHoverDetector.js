import { logger } from "../log";
/**
 * @file imageHoverDetector.js
 * @description 网页图片悬停检测器：负责悬停识别合格 <img>并在图片外上方展示操作条，支持布局分析、线框点选与按需翻译。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import DualActionButton from "../../views/ImageTranslate/DualActionButton";
import ImageLayoutOverlay from "../../views/ImageTranslate/ImageLayoutOverlay";
import { sendBgMsg } from "../msg";
import {
  MSG_IMAGE_TRANSLATE_EXECUTE,
  MSG_IMAGE_TRANSLATE_CANCEL,
} from "../../config";
import { readImageAsBlob, blobToDataUrl } from "./imageReader";
import { downloadImageBlob } from "./downloadImage";
import {
  isApiConfigured,
  supportsApiCapability,
} from "../../config/serviceSelection";

export class ImageHoverDetector {
  #setting;
  #rule;
  #onOpenBox;
  #onToggleBox;
  #onToggleLayoutOverlay;
  #onActivateImage;
  #suspended = false;
  #isIframe;
  #i18n;

  #activeImage = null;
  #hoverTimer = null;
  #hideTimer = null;
  #container = null;
  #reactRoot = null;
  #isPointerOnButtons = false;
  #layoutCache = new WeakMap();
  #managedLayout = false;
  #openRequest = null;
  #downloadVersion = 0;

  // 布局分析状态
  #layoutState = "idle"; // "idle" | "loading" | "active"
  #layoutRegions = [];
  #showLayoutOverlay = true;
  #isPinned = false;
  #abortController = null;
  #layoutTaskId = null;

  #handleMouseOver = null;
  #handleMouseOut = null;
  #handleScrollOrResize = null;
  #handleDocumentClick = null;
  #handleKeyDown = null;
  #mutationObserver = null;

  constructor({
    setting,
    rule,
    onOpenBox,
    onToggleBox,
    onToggleLayoutOverlay,
    onActivateImage,
    isIframe = false,
    i18n,
  }) {
    this.#setting = setting;
    this.#rule = rule;
    this.#onOpenBox = onOpenBox;
    this.#onToggleBox = onToggleBox;
    this.#onToggleLayoutOverlay = onToggleLayoutOverlay;
    this.#onActivateImage = onActivateImage;
    this.#isIframe = isIframe;
    this.#i18n = i18n || ((k, d) => d || k);

    if (this.#isIframe) return;

    this.#initContainer();
    this.#bindEvents();
  }

  get #enabled() {
    return this.#rule?.imageTransOpen !== "false";
  }

  get #minWidth() {
    const w = Number(this.#rule?.imageMinWidth);
    return Number.isFinite(w) && w > 0 ? w : 120;
  }

  get #minHeight() {
    const h = Number(this.#rule?.imageMinHeight);
    return Number.isFinite(h) && h > 0 ? h : 80;
  }

  #getActiveLayoutApi() {
    const apis = this.#setting?.transApis || [];
    const layoutApiSlug = this.#setting?.imageTranslateSetting?.layoutApiSlug;
    if (layoutApiSlug) {
      const match = apis.find(
        (a) =>
          !a.isDisabled &&
          isApiConfigured(a) &&
          supportsApiCapability(a, "analyzeLayout") &&
          a.apiSlug === layoutApiSlug
      );
      if (match) return match;
    }
    return apis.find(
      (a) =>
        !a.isDisabled &&
        isApiConfigured(a) &&
        supportsApiCapability(a, "analyzeLayout")
    );
  }

  #initContainer() {
    this.#container = document.createElement("div");
    this.#container.className = "kt-image-hover-root notranslate";
    this.#container.style.cssText =
      "position: absolute; top: 0; left: 0; width: 0; height: 0; pointer-events: none; z-index: 2147483640;";
    document.body.appendChild(this.#container);
    this.#reactRoot = ReactDOM.createRoot(this.#container);
  }

  #bindEvents() {
    this.#handleMouseOver = (e) => {
      if (!this.#enabled || this.#suspended) return;
      const target = e.target;
      if (this.#isEligibleImage(target)) {
        const cached = this.#layoutCache.get(target);
        if (cached && cached.source !== (target.currentSrc || target.src)) {
          this.setLayoutState("idle", [], true, target);
        }
        if (this.#activeImage === target && this.#isButtonsVisible()) {
          clearTimeout(this.#hideTimer);
          return;
        }

        clearTimeout(this.#hoverTimer);
        clearTimeout(this.#hideTimer);
        // 鼠标移入合格图片立即展示按钮组，消除延迟感
        this.#showButtonsForImage(target);
      }
    };

    this.#handleMouseOut = (e) => {
      const target = e.target;
      if (target === this.#activeImage && !this.#isPinned) {
        clearTimeout(this.#hoverTimer);
        this.#hideTimer = setTimeout(() => {
          if (!this.#isPointerOnButtons && !this.#isPinned) {
            this.#hideButtons();
          }
        }, 300);
      }
    };

    this.#handleScrollOrResize = () => {
      if (this.#activeImage) {
        if (!this.#activeImage.isConnected) {
          this.#hideButtons(true);
        } else {
          this.#updateButtonPosition();
        }
      }
    };

    this.#handleDocumentClick = (e) => {
      if (!this.#isPinned || !this.#activeImage) return;
      if (
        e.target.closest?.(
          ".kt-image-hover-root, .kt-image-dual-btn-container, .kt-image-layout-overlay"
        )
      ) {
        return;
      }
      this.#hideButtons(true);
    };

    this.#handleKeyDown = (e) => {
      if (e.key === "Escape" && this.#isPinned) {
        this.#hideButtons(true);
      }
    };

    document.addEventListener("mouseover", this.#handleMouseOver, true);
    document.addEventListener("mouseout", this.#handleMouseOut, true);
    document.addEventListener("click", this.#handleDocumentClick, true);
    window.addEventListener("keydown", this.#handleKeyDown, true);
    window.addEventListener("scroll", this.#handleScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", this.#handleScrollOrResize, {
      passive: true,
    });

    this.#mutationObserver = new MutationObserver(() => {
      if (this.#activeImage && !this.#activeImage.isConnected) {
        this.#hideButtons(true);
      }
    });
    this.#mutationObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  #isEligibleImage(el) {
    if (!el || el.tagName !== "IMG") return false;
    if (el.closest?.(".notranslate, [translate='no'], .kt-image-hover-root"))
      return false;

    // 排除未完成加载或天然尺寸为 0 的图片
    if (!el.complete || el.naturalWidth === 0 || el.naturalHeight === 0)
      return false;

    // 检查排除选择器
    const ignoreSelector =
      this.#rule?.imageIgnoreSelector ||
      "[class*='logo'], [id*='logo'], [class*='icon'], [id*='icon'], [class*='avatar']";
    try {
      if (ignoreSelector && el.matches(ignoreSelector)) return false;
    } catch {}

    // 检查自定义匹配选择器
    const customSelector = this.#rule?.imageSelector;
    if (customSelector && customSelector !== "img") {
      try {
        if (!el.matches(customSelector)) return false;
      } catch {}
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < this.#minWidth || rect.height < this.#minHeight) {
      return false;
    }

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      parseFloat(style.opacity) === 0
    ) {
      return false;
    }

    return true;
  }

  #showButtonsForImage(img) {
    if (!this.#isEligibleImage(img)) return;
    if (this.#activeImage !== img) {
      this.#hideButtons(true);
      const cached = this.#layoutCache.get(img);
      if (cached?.source === (img.currentSrc || img.src)) {
        this.#layoutState = "active";
        this.#layoutRegions = cached.regions;
        this.#showLayoutOverlay = cached.visible;
        this.#managedLayout = cached.managed;
        this.#isPinned = true;
      }
    }
    this.#activeImage = img;
    this.#renderButtons();
  }

  #updateButtonPosition() {
    if (!this.#activeImage || !this.#isButtonsVisible()) return;
    this.#renderButtons();
  }

  async #downloadImage() {
    const image = this.#activeImage;
    const source = image?.currentSrc || image?.src;
    const version = this.#downloadVersion;
    const isCurrent = () =>
      image === this.#activeImage &&
      version === this.#downloadVersion &&
      source === (image?.currentSrc || image?.src);
    try {
      const { blob } = await readImageAsBlob(image, { maxEdge: Infinity });
      if (isCurrent()) downloadImageBlob(blob);
    } catch (err) {
      if (isCurrent()) throw err;
    }
  }

  async #handleLayoutClick(action) {
    if (this.#suspended) return;
    this.#onActivateImage?.(this.#activeImage);
    if (action === "cancel") {
      this.setLayoutState("idle");
      return;
    }

    if (action === "toggle") {
      this.#showLayoutOverlay = !this.#showLayoutOverlay;
      this.#onToggleLayoutOverlay?.(this.#showLayoutOverlay, this.#activeImage);
      this.#renderButtons();
      return;
    }

    if (action === "start") {
      const activeApi = this.#getActiveLayoutApi();
      if (!activeApi) {
        // 未配置布局服务，弹窗提示并引导
        alert(
          this.#i18n(
            "image_no_layout_service_tip",
            "未配置界面分析服务，请在上方选择或前往设置"
          )
        );
        this.#openBox("menu");
        return;
      }

      this.#layoutState = "loading";
      this.#isPinned = true;
      this.#renderButtons();

      const taskId = crypto.randomUUID();
      this.#layoutTaskId = taskId;
      this.#abortController = new AbortController();
      try {
        const { blob } = await readImageAsBlob(this.#activeImage);
        const dataUrl = await blobToDataUrl(blob);
        if (this.#layoutTaskId !== taskId) return;
        const res = await sendBgMsg(MSG_IMAGE_TRANSLATE_EXECUTE, {
          taskId,
          action: "layout",
          dataUrl,
          scene: this.#setting?.imageTranslateSetting,
        });

        if (
          this.#layoutTaskId !== taskId ||
          this.#abortController?.signal?.aborted
        ) {
          return;
        }

        const regions = res?.result?.layout?.regions || [];
        this.#layoutRegions = regions.map((r, i) => ({
          ...r,
          order: i,
          enabled: true,
        }));
        this.#layoutState = "active";
        this.#showLayoutOverlay = true;
        this.#cacheLayout();
      } catch (err) {
        if (
          this.#layoutTaskId === taskId &&
          !this.#abortController?.signal?.aborted
        ) {
          logger
            .child("image-translate")
            .warn("[ImageHoverDetector] Layout analysis error:", err);
          alert(
            err?.message ||
              this.#i18n("image_process_failed", "分析布局失败，请重试")
          );
          this.#layoutState = "idle";
        }
      } finally {
        if (this.#layoutTaskId === taskId) {
          this.#layoutTaskId = null;
          this.#abortController = null;
          this.#renderButtons();
        }
      }
    }
  }

  #toggleRegion(index) {
    if (!this.#layoutRegions[index]) return;
    this.#layoutRegions[index] = {
      ...this.#layoutRegions[index],
      enabled: this.#layoutRegions[index].enabled === false,
    };
    this.#renderButtons();
  }

  #cacheLayout() {
    if (this.#activeImage && this.#layoutState === "active") {
      this.#layoutCache.set(this.#activeImage, {
        source: this.#activeImage.currentSrc || this.#activeImage.src,
        regions: this.#layoutRegions,
        visible: this.#showLayoutOverlay,
        managed: this.#managedLayout,
      });
    }
  }

  async #openBox(action) {
    if (this.#suspended) return;
    if (action === "menu" && this.#onToggleBox?.(this.#activeImage)) return;
    if (this.#openRequest) return;
    const imageElement = this.#activeImage;
    const selectedRegions =
      this.#layoutState === "active" ? this.#layoutRegions : null;
    if (
      action === "all" &&
      selectedRegions?.every((r) => r.enabled === false)
    ) {
      alert(
        this.#i18n(
          "image_select_at_least_one_region",
          "请至少选择一个区域进行翻译"
        )
      );
      return;
    }
    const request = {};
    this.#openRequest = request;
    this.#isPinned = true;
    try {
      await this.#onOpenBox?.({
        imageElement,
        action,
        selectedRegions,
        showLayoutOverlay: this.#showLayoutOverlay,
        isCurrent: () =>
          this.#openRequest === request && this.#activeImage === imageElement,
      });
    } finally {
      if (this.#openRequest === request) this.#openRequest = null;
    }
  }

  #renderButtons() {
    if (!this.#activeImage || !this.#reactRoot) return;
    this.#cacheLayout();

    const rect = this.#activeImage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.#hideButtons(true);
      return;
    }

    // 按钮组移到图片外上方（留 6px 间隙）
    const btnHeight = 30;
    let top = rect.top + window.scrollY - btnHeight - 6;
    const left = rect.right + window.scrollX;

    // 如果图片贴近顶端，上方不足 36px，则降级放置在图片下方外部
    if (rect.top < btnHeight + 8) {
      top = rect.bottom + window.scrollY + 6;
    }

    const hasLayoutService = Boolean(this.#getActiveLayoutApi());

    this.#reactRoot.render(
      <>
        {/* 原图交互式线框层 */}
        {this.#layoutState === "active" && !this.#managedLayout && (
          <ImageLayoutOverlay
            regions={this.#layoutRegions}
            imageRect={rect}
            naturalWidth={this.#activeImage.naturalWidth}
            naturalHeight={this.#activeImage.naturalHeight}
            visible={this.#showLayoutOverlay}
            onToggleRegion={(idx) => this.#toggleRegion(idx)}
          />
        )}

        {/* 外置悬浮操作栏 */}
        <DualActionButton
          style={{
            top: `${Math.max(0, top)}px`,
            left: `${Math.max(0, left)}px`,
            transform: "translateX(-100%)",
          }}
          visible={true}
          i18n={this.#i18n}
          layoutState={this.#layoutState}
          showLayoutOverlay={this.#showLayoutOverlay}
          hasLayoutService={hasLayoutService}
          onMouseEnter={() => {
            this.#isPointerOnButtons = true;
            clearTimeout(this.#hideTimer);
          }}
          onMouseLeave={() => {
            this.#isPointerOnButtons = false;
            if (!this.#isPinned) {
              this.#hideTimer = setTimeout(() => {
                if (!this.#isPinned) {
                  this.#hideButtons();
                }
              }, 300);
            }
          }}
          onMenuClick={() => this.#openBox("menu")}
          onLayoutClick={(action) => this.#handleLayoutClick(action)}
          onTranslateClick={() => this.#openBox("all")}
          onDownloadClick={() => this.#downloadImage()}
        />
      </>
    );
  }

  #isButtonsVisible() {
    return Boolean(this.#activeImage);
  }

  suspend() {
    this.#suspended = true;
    this.#hideButtons(true);
  }

  resume(imageElement = null) {
    this.#suspended = false;
    if (imageElement) this.#showButtonsForImage(imageElement);
  }

  #hideButtons(force = false) {
    if (this.#isPinned && !force) return;
    this.#downloadVersion++;
    clearTimeout(this.#hoverTimer);
    clearTimeout(this.#hideTimer);
    if (this.#layoutTaskId) {
      sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, { taskId: this.#layoutTaskId });
      this.#layoutTaskId = null;
    }
    this.#abortController?.abort();
    this.#abortController = null;
    this.#cacheLayout();
    this.#openRequest = null;
    this.#managedLayout = false;
    this.#activeImage = null;
    this.#isPointerOnButtons = false;
    this.#isPinned = false;
    this.#layoutState = "idle";
    this.#layoutRegions = [];
    this.#showLayoutOverlay = true;
    this.#reactRoot?.render(null);
  }

  setLayoutState(
    state,
    regions = [],
    showOverlay = true,
    imageElement = this.#activeImage,
    managed = false
  ) {
    if (imageElement) {
      if (state === "active") {
        this.#layoutCache.set(imageElement, {
          source: imageElement.currentSrc || imageElement.src,
          regions,
          visible: showOverlay,
          managed,
        });
      } else {
        this.#layoutCache.delete(imageElement);
      }
    }
    if (imageElement !== this.#activeImage) return;
    if (state === "idle") {
      this.#openRequest = null;
      if (this.#layoutTaskId) {
        sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, { taskId: this.#layoutTaskId });
        this.#layoutTaskId = null;
      }
      this.#abortController?.abort();
      this.#abortController = null;
    }
    this.#layoutState = state;
    this.#layoutRegions = regions;
    this.#showLayoutOverlay = showOverlay;
    this.#managedLayout = managed;
    this.#isPinned = state === "active";
    if (this.#isButtonsVisible()) {
      this.#renderButtons();
    }
  }

  updateConfig(setting, rule) {
    const previousLayout = JSON.stringify([
      this.#setting?.imageTranslateSetting?.layoutApiSlug,
      this.#getActiveLayoutApi(),
    ]);
    this.#setting = setting;
    this.#rule = rule;
    const layoutChanged =
      previousLayout !==
      JSON.stringify([
        setting?.imageTranslateSetting?.layoutApiSlug,
        this.#getActiveLayoutApi(),
      ]);
    if (layoutChanged) {
      this.#layoutCache = new WeakMap();
      this.setLayoutState("idle");
    }
    if (!this.#enabled) {
      this.#hideButtons(true);
    }
    return layoutChanged;
  }

  destroy() {
    this.#hideButtons(true);
    if (this.#handleMouseOver) {
      document.removeEventListener("mouseover", this.#handleMouseOver, true);
      document.removeEventListener("mouseout", this.#handleMouseOut, true);
      document.removeEventListener("click", this.#handleDocumentClick, true);
      window.removeEventListener("keydown", this.#handleKeyDown, true);
      window.removeEventListener("scroll", this.#handleScrollOrResize, true);
      window.removeEventListener("resize", this.#handleScrollOrResize);
    }
    this.#mutationObserver?.disconnect();
    this.#reactRoot?.unmount();
    this.#container?.remove();
    this.#container = null;
    this.#reactRoot = null;
  }
}
