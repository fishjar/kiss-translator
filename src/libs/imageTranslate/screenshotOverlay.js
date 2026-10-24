import { logger } from "../log";
/**
 * @file screenshotOverlay.js
 * @description 网页视口截图固化、全屏蒙版与可交互框选层（支持多重取消、选区保留、版面分析与线框点选）。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { sendBgMsg } from "../msg";
import {
  MSG_CAPTURE_VISIBLE_TAB,
  MSG_IMAGE_TRANSLATE_EXECUTE,
  MSG_IMAGE_TRANSLATE_CANCEL,
  APP_CONSTS,
} from "../../config";
import { cropAndCompressImage, blobToDataUrl } from "./imageReader";
import DualActionButton from "../../views/ImageTranslate/DualActionButton";
import ImageLayoutOverlay from "../../views/ImageTranslate/ImageLayoutOverlay";
import {
  isApiConfigured,
  supportsApiCapability,
} from "../../config/serviceSelection";

export class ScreenshotOverlay {
  #container = null;
  #reactRoot = null;
  #imgElement = null;
  #dpr = 1;

  #onComplete = null;
  #onCancel = null;
  #i18n = null;
  #setting = null;

  #selection = null; // { x, y, w, h }
  #isSelecting = false;
  #isDragging = false;
  #isResizing = false;
  #resizeDir = null;
  #dragStart = null;

  // 布局分析状态
  #layoutState = "idle"; // "idle" | "loading" | "active"
  #layoutRegions = [];
  #showLayoutOverlay = true;
  #abortController = null;
  #layoutTaskId = null;
  #currentSessionId = 0;
  #isConfirmed = false; // 是否已点击确认/翻译并弹出翻译窗
  #cropBusy = false;
  #taskBusy = false;
  #cropSize = null;
  #onLayoutChange = null;
  #onSelectionChange = null;
  #cleanupScroll = null;
  #cleanupGesture = null;
  #onLayoutStart = null;
  #onLocalBusyChange = null;
  #onToggleBox = null;

  get #busy() {
    return this.#cropBusy || this.#taskBusy || this.#layoutState === "loading";
  }

  setTaskState(busy) {
    this.#taskBusy = busy;
    this.#render();
  }

  setLayoutState(regions, visible = true) {
    this.#layoutRegions = regions || [];
    this.#layoutState = regions === null ? "idle" : "active";
    this.#showLayoutOverlay = visible;
    if (regions === null && this.#layoutTaskId) {
      sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, { taskId: this.#layoutTaskId });
      this.#layoutTaskId = null;
      this.#abortController?.abort();
      this.#abortController = null;
      this.#onLocalBusyChange?.(false);
    }
    this.#render();
  }

  #highlightElement = null; // 备用高亮框

  #handleKeyDown = null;
  #handleResize = null;

  constructor({ i18n, setting } = {}) {
    this.#i18n = i18n || ((k, d) => d || k);
    this.#setting = setting;
  }

  updateSetting(setting) {
    this.#setting = setting;
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

  async start({
    onComplete,
    onCancel,
    onLayoutChange,
    onSelectionChange,
    onLayoutStart,
    onLocalBusyChange,
    onToggleBox,
  }) {
    if (document.hidden || document.visibilityState !== "visible") {
      onCancel?.();
      return;
    }

    // 1. 彻底清除页面上所有残留的截图蒙版 DOM，防止多层堆叠
    document
      .querySelectorAll(".kt-screenshot-overlay-root")
      .forEach((e) => e.remove());
    this.destroy();

    const sessionId = ++this.#currentSessionId;
    this.#onComplete = onComplete;
    this.#onCancel = onCancel;
    this.#onLayoutChange = onLayoutChange;
    this.#onSelectionChange = onSelectionChange;
    this.#onLayoutStart = onLayoutStart;
    this.#onLocalBusyChange = onLocalBusyChange;
    this.#onToggleBox = onToggleBox;
    this.#layoutState = "idle";
    this.#layoutRegions = [];
    this.#showLayoutOverlay = true;
    this.#isConfirmed = false;

    // 2. 请求后台捕获当前视口静态快照
    let captureRes;
    try {
      captureRes = await sendBgMsg(MSG_CAPTURE_VISIBLE_TAB);
    } catch (err) {
      logger.child("image-translate").error("[ScreenshotOverlay] Capture visible tab failed:", err);
      if (this.#currentSessionId === sessionId) {
        this.#onCancel?.();
      }
      return;
    }

    if (
      this.#currentSessionId !== sessionId ||
      document.hidden ||
      document.visibilityState !== "visible" ||
      !captureRes?.dataUrl
    ) {
      if (this.#currentSessionId === sessionId) this.#onCancel?.();
      return;
    }

    // 3. 加载图片以获取实际像素尺寸及换算 DPR
    const img = new Image();
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = captureRes.dataUrl;
      });
    } catch {
      if (this.#currentSessionId === sessionId) {
        this.#onCancel?.();
      }
      return;
    }

    if (
      this.#currentSessionId !== sessionId ||
      document.hidden ||
      document.visibilityState !== "visible"
    ) {
      if (this.#currentSessionId === sessionId) this.#onCancel?.();
      return;
    }

    this.#imgElement = img;
    this.#dpr =
      img.naturalWidth / window.innerWidth || window.devicePixelRatio || 1;

    // 4. 构建全屏蒙版容器
    this.#initDom();
    this.#lockScroll();
    this.#bindWindowEvents();
    this.#render();
  }

  #initDom() {
    this.#container = document.createElement("div");
    this.#container.className = "kt-screenshot-overlay-root notranslate";
    this.#container.tabIndex = -1;
    this.#container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      user-select: none;
      cursor: crosshair;
      overflow: hidden;
      outline: none;
    `;

    document.body.appendChild(this.#container);
    this.#container.focus();
    this.#reactRoot = ReactDOM.createRoot(this.#container);
  }

  #bindWindowEvents() {
    this.#handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.destroy(true);
        this.#onCancel?.();
      } else if (
        !this.#isPopupEvent(e) &&
        [
          " ",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "PageUp",
          "PageDown",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        e.preventDefault();
      }
    };

    this.#handleResize = () => {
      this.destroy(true);
      this.#onCancel?.();
    };

    window.addEventListener("keydown", this.#handleKeyDown, true);
    document.addEventListener("keydown", this.#handleKeyDown, true);
    window.addEventListener("resize", this.#handleResize, { passive: true });
  }

  #isPopupEvent(event) {
    return event
      .composedPath()
      .some((node) => node.id === APP_CONSTS.imageBoxID);
  }

  #lockScroll() {
    const position = { x: window.scrollX, y: window.scrollY };
    const saved = [document.documentElement, document.body].map((element) => ({
      element,
      properties: [
        "overflow",
        "overflow-x",
        "overflow-y",
        "scrollbar-gutter",
      ].map((name) => ({
        name,
        value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name),
      })),
    }));
    for (const { element } of saved) {
      element.style.setProperty("overflow-x", "hidden", "important");
      element.style.setProperty("overflow-y", "hidden", "important");
    }
    document.documentElement.style.setProperty(
      "scrollbar-gutter",
      "stable",
      "important"
    );
    const preventScroll = (event) => {
      if (!this.#isPopupEvent(event)) event.preventDefault();
    };
    window.addEventListener("wheel", preventScroll, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchmove", preventScroll, {
      capture: true,
      passive: false,
    });
    this.#cleanupScroll = () => {
      window.removeEventListener("wheel", preventScroll, true);
      window.removeEventListener("touchmove", preventScroll, true);
      for (const { element, properties } of saved) {
        for (const { name } of properties) element.style.removeProperty(name);
        for (const { name, value, priority } of properties) {
          if (value) element.style.setProperty(name, value, priority);
        }
      }
      if (window.scrollX !== position.x || window.scrollY !== position.y) {
        window.scrollTo(position.x, position.y);
      }
    };
  }

  #invalidateSelection() {
    this.setLayoutState(null);
    this.#cropSize = null;
    this.#onSelectionChange?.();
  }

  #finishSelection() {
    this.#render();
    if (
      this.#isConfirmed &&
      this.#selection?.w >= 10 &&
      this.#selection?.h >= 10
    ) {
      this.#confirmSelection("update");
    }
  }

  #onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.destroy(true);
    this.#onCancel?.();
  };

  #onMouseDown = (e) => {
    if (e.button !== 0 || this.#busy) return;
    const target = e.target;

    // 点击在控制按钮、线框或缩放手柄上时由其自身处理
    if (
      target.closest?.(
        ".kt-image-dual-btn-container, .kt-screenshot-handle, .kt-image-layout-overlay"
      )
    ) {
      return;
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let changed = false;

    // 点击在已有选区内时支持拖拽移动选区
    if (this.#selection && this.#isInSelection(startX, startY)) {
      this.#isDragging = true;
      this.#dragStart = {
        mouseX: startX,
        mouseY: startY,
        selX: this.#selection.x,
        selY: this.#selection.y,
      };
    } else {
      this.#invalidateSelection();
      changed = true;
      // 重新开始框选
      this.#isSelecting = true;
      this.#selection = { x: startX, y: startY, w: 0, h: 0 };
      this.#dragStart = { startX, startY };
      this.#layoutState = "idle";
      this.#layoutRegions = [];
    }

    const onMouseMove = (moveEvent) => {
      if (this.#busy) return;
      if (
        !changed &&
        (moveEvent.clientX !== startX || moveEvent.clientY !== startY)
      ) {
        this.#invalidateSelection();
        changed = true;
      }
      if (this.#isSelecting) {
        const curX = moveEvent.clientX;
        const curY = moveEvent.clientY;
        const x = Math.min(this.#dragStart.startX, curX);
        const y = Math.min(this.#dragStart.startY, curY);
        const w = Math.abs(curX - this.#dragStart.startX);
        const h = Math.abs(curY - this.#dragStart.startY);
        this.#selection = { x, y, w, h };
        this.#render();
      } else if (this.#isDragging) {
        const dx = moveEvent.clientX - this.#dragStart.mouseX;
        const dy = moveEvent.clientY - this.#dragStart.mouseY;
        const maxX = window.innerWidth - this.#selection.w;
        const maxY = window.innerHeight - this.#selection.h;
        this.#selection.x = Math.max(
          0,
          Math.min(maxX, this.#dragStart.selX + dx)
        );
        this.#selection.y = Math.max(
          0,
          Math.min(maxY, this.#dragStart.selY + dy)
        );
        this.#render();
      }
    };

    const onMouseUp = () => {
      this.#isSelecting = false;
      this.#isDragging = false;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      this.#cleanupGesture = null;

      if (
        this.#selection &&
        (this.#selection.w < 10 || this.#selection.h < 10)
      ) {
        this.#selection = null;
        this.#layoutState = "idle";
        this.#layoutRegions = [];
      }
      if (changed) this.#finishSelection();
      else this.#render();
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    this.#cleanupGesture = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  };

  #startResize = (dir, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (this.#busy || !this.#selection) return;
    this.#isResizing = true;
    this.#resizeDir = dir;
    let changed = false;

    const startX = e.clientX;
    const startY = e.clientY;
    const initSel = { ...this.#selection };

    const onMouseMove = (moveEvent) => {
      if (!this.#isResizing || !this.#selection || this.#busy) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let { x, y, w, h } = initSel;

      if (dir.includes("e")) w += dx;
      if (dir.includes("s")) h += dy;
      if (dir.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (dir.includes("n")) {
        y += dy;
        h -= dy;
      }

      if (w > 10 && h > 10) {
        if (!changed && (dx || dy)) {
          this.#invalidateSelection();
          changed = true;
        }
        this.#selection = { x, y, w, h };
        this.#render();
      }
    };

    const onMouseUp = () => {
      this.#isResizing = false;
      this.#resizeDir = null;
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      this.#cleanupGesture = null;
      if (changed) this.#finishSelection();
      else this.#render();
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("mouseup", onMouseUp, true);
    this.#cleanupGesture = () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mouseup", onMouseUp, true);
    };
  };

  #isInSelection(px, py) {
    if (!this.#selection) return false;
    const { x, y, w, h } = this.#selection;
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  async #handleLayoutClick(action) {
    if (action === "cancel") {
      if (this.#layoutTaskId)
        sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, { taskId: this.#layoutTaskId });
      this.#layoutTaskId = null;
      this.#abortController?.abort();
      this.#abortController = null;
      this.#layoutState = "idle";
      this.#onLocalBusyChange?.(false);
      this.#render();
      return;
    }

    if (action === "toggle") {
      this.#showLayoutOverlay = !this.#showLayoutOverlay;
      this.#onLayoutChange?.(this.#layoutRegions, this.#showLayoutOverlay);
      this.#render();
      return;
    }

    if (action === "start") {
      if (!this.#selection || !this.#imgElement || this.#busy) return;

      const activeApi = this.#getActiveLayoutApi();
      if (!activeApi) {
        alert(
          this.#i18n(
            "image_no_layout_service_tip",
            "未配置界面分析服务，请在上方选择或前往设置"
          )
        );
        this.#confirmSelection("menu");
        return;
      }

      this.#layoutState = "loading";
      this.#onLayoutStart?.();
      this.#onLocalBusyChange?.(true);
      this.#render();

      const taskId = crypto.randomUUID();
      this.#layoutTaskId = taskId;
      this.#abortController = new AbortController();
      try {
        const { blob, width, height } = await cropAndCompressImage(
          this.#imgElement,
          {
            x: this.#selection.x,
            y: this.#selection.y,
            width: this.#selection.w,
            height: this.#selection.h,
            dpr: this.#dpr,
          }
        );

        const dataUrl = await blobToDataUrl(blob);
        if (this.#layoutTaskId !== taskId) return;
        this.#cropSize = { width, height };
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
        if (!res?.success) throw new Error(res?.error || "分析布局失败");
        this.#layoutRegions = regions.map((r, i) => ({
          ...r,
          order: i,
          enabled: true,
        }));
        this.#layoutState = "active";
        this.#showLayoutOverlay = true;
        this.#onLayoutChange?.(this.#layoutRegions);
      } catch (err) {
        if (
          this.#layoutTaskId === taskId &&
          !this.#abortController?.signal?.aborted
        ) {
          logger.child("image-translate").warn("[ScreenshotOverlay] Layout error:", err);
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
          this.#onLocalBusyChange?.(false);
          this.#render();
        }
      }
    }
  }

  #toggleRegion(index) {
    if (!this.#layoutRegions[index] || this.#busy) return;
    this.#layoutRegions[index] = {
      ...this.#layoutRegions[index],
      enabled: this.#layoutRegions[index].enabled === false,
    };
    this.#render();
    this.#onLayoutChange?.(this.#layoutRegions);
  }

  #createPersistentHighlight(sel) {
    this.clearHighlight();
    const highlight = document.createElement("div");
    highlight.className = "kt-screenshot-persistent-highlight notranslate";
    highlight.style.cssText = `
      position: fixed;
      left: ${sel.x}px;
      top: ${sel.y}px;
      width: ${sel.w}px;
      height: ${sel.h}px;
      border: 2px dashed #00c853;
      background: rgba(0, 200, 83, 0.08);
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
      z-index: 2147483640;
      pointer-events: none;
      box-sizing: border-box;
      border-radius: 4px;
    `;
    document.body.appendChild(highlight);
    this.#highlightElement = highlight;
  }

  clearHighlight() {
    this.#highlightElement?.remove();
    this.#highlightElement = null;
    document
      .querySelectorAll(".kt-screenshot-persistent-highlight")
      .forEach((e) => e.remove());
  }

  async #confirmSelection(action) {
    if (action === "menu" && this.#onToggleBox?.()) return;
    if (this.#busy) return;
    if (!this.#selection || !this.#imgElement) {
      this.destroy();
      this.#onCancel?.();
      return;
    }

    let selectedRegions = null;
    if (this.#layoutState === "active") {
      selectedRegions = this.#layoutRegions;
      if (
        action === "all" &&
        !selectedRegions.some((r) => r.enabled !== false)
      ) {
        alert(
          this.#i18n(
            "image_select_at_least_one_region",
            "请至少选择一个区域进行翻译"
          )
        );
        return;
      }
    }

    const sel = { ...this.#selection };
    const img = this.#imgElement;
    const dpr = this.#dpr;
    const sessionId = this.#currentSessionId;
    const wasConfirmed = this.#isConfirmed;
    this.#cropBusy = true;
    this.#onLocalBusyChange?.(true);

    // 保留蒙版与操作条，并让翻译弹窗显示在截图层之上。
    this.#isConfirmed = true;
    if (this.#container) {
      this.#container.style.zIndex = "2147483640";
    }
    this.#render();

    try {
      const { blob, width, height } = await cropAndCompressImage(img, {
        x: sel.x,
        y: sel.y,
        width: sel.w,
        height: sel.h,
        dpr,
      });
      if (this.#currentSessionId !== sessionId) return;
      this.#cropSize = { width, height };
      this.#onComplete?.({
        blob,
        action,
        selection: sel,
        selectedRegions,
        showLayoutOverlay: this.#showLayoutOverlay,
      });
    } catch (err) {
      if (this.#currentSessionId !== sessionId) return;
      logger.child("image-translate").error("[ScreenshotOverlay] Crop failed:", err);
      this.#isConfirmed = wasConfirmed;
      if (this.#container && !wasConfirmed)
        this.#container.style.zIndex = "2147483647";
      alert(
        err.message ||
          this.#i18n("image_process_failed", "截图处理失败，请重试")
      );
    } finally {
      if (this.#currentSessionId === sessionId) {
        this.#cropBusy = false;
        this.#onLocalBusyChange?.(false);
        this.#render();
      }
    }
  }

  #render() {
    if (!this.#reactRoot || !this.#imgElement) return;

    const sel = this.#selection;
    const hasSelection = sel && sel.w >= 10 && sel.h >= 10;
    const hasLayoutService = Boolean(this.#getActiveLayoutApi());

    const handles = hasSelection
      ? [
          { dir: "nw", x: sel.x - 4, y: sel.y - 4, cursor: "nwse-resize" },
          {
            dir: "n",
            x: sel.x + sel.w / 2 - 4,
            y: sel.y - 4,
            cursor: "ns-resize",
          },
          {
            dir: "ne",
            x: sel.x + sel.w - 4,
            y: sel.y - 4,
            cursor: "nesw-resize",
          },
          {
            dir: "e",
            x: sel.x + sel.w - 4,
            y: sel.y + sel.h / 2 - 4,
            cursor: "ew-resize",
          },
          {
            dir: "se",
            x: sel.x + sel.w - 4,
            y: sel.y + sel.h - 4,
            cursor: "nwse-resize",
          },
          {
            dir: "s",
            x: sel.x + sel.w / 2 - 4,
            y: sel.y + sel.h - 4,
            cursor: "ns-resize",
          },
          {
            dir: "sw",
            x: sel.x - 4,
            y: sel.y + sel.h - 4,
            cursor: "nesw-resize",
          },
          {
            dir: "w",
            x: sel.x - 4,
            y: sel.y + sel.h / 2 - 4,
            cursor: "ew-resize",
          },
        ]
      : [];

    this.#reactRoot.render(
      <div
        onMouseDown={this.#onMouseDown}
        onContextMenu={this.#onContextMenu}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        {/* 静态截屏底图 */}
        <img
          src={this.#imgElement.src}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            objectFit: "fill",
            pointerEvents: "none",
          }}
        />

        {/* 静态半透明全屏蒙版 */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            pointerEvents: "none",
          }}
        />

        {/* 顶部操作提示条 */}
        {!this.#isConfirmed && (
          <div
            style={{
              position: "absolute",
              top: "16px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(20, 20, 20, 0.88)",
              color: "#ffffff",
              padding: "6px 14px 6px 18px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 500,
              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              pointerEvents: "auto",
              zIndex: 10,
            }}
          >
            <span>
              {this.#i18n(
                "image_screenshot_esc_tip",
                "拖拽框选文字区域，按 Esc 取消"
              )}
            </span>
            <button
              type="button"
              title={this.#i18n("image_hover_btn_cancel", "取消")}
              onClick={() => {
                this.destroy(true);
                this.#onCancel?.();
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#ffffff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0,
                borderRadius: "50%",
                opacity: 0.8,
              }}
            >
              <CloseRoundedIcon style={{ fontSize: "16px" }} />
            </button>
          </div>
        )}

        {/* 选区高亮框 (绿色相框，避免与蓝色布局线框混淆) */}
        {hasSelection && (
          <div
            className="kt-screenshot-selection"
            style={{
              position: "absolute",
              left: `${sel.x}px`,
              top: `${sel.y}px`,
              width: `${sel.w}px`,
              height: `${sel.h}px`,
              border: "2px solid #00c853",
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.4)",
              cursor: this.#busy ? "default" : "move",
              boxSizing: "border-box",
            }}
          >
            {/* 选区内明亮原图透显 */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundImage: `url(${this.#imgElement.src})`,
                backgroundPosition: `-${sel.x}px -${sel.y}px`,
                backgroundSize: `${window.innerWidth}px ${window.innerHeight}px`,
                backgroundRepeat: "no-repeat",
              }}
            />
          </div>
        )}

        {/* 选区内交互式版面线框层 */}
        {hasSelection && this.#layoutState === "active" && (
          <ImageLayoutOverlay
            regions={this.#layoutRegions}
            imageRect={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
            naturalWidth={this.#cropSize?.width || sel.w * this.#dpr}
            naturalHeight={this.#cropSize?.height || sel.h * this.#dpr}
            isFixed={true}
            visible={this.#showLayoutOverlay}
            onToggleRegion={(idx) => this.#toggleRegion(idx)}
          />
        )}

        {/* 8 方向缩放手柄，任务执行时隐藏 */}
        {!this.#busy &&
          handles.map((h) => (
            <div
              key={h.dir}
              className="kt-screenshot-handle"
              onMouseDown={(e) => this.#startResize(h.dir, e)}
              style={{
                position: "absolute",
                left: `${h.x}px`,
                top: `${h.y}px`,
                width: "8px",
                height: "8px",
                backgroundColor: "#ffffff",
                border: "2px solid #00c853",
                borderRadius: "2px",
                cursor: h.cursor,
                zIndex: 20,
              }}
            />
          ))}

        {/* 选区右上角操作条在打开翻译弹框后继续保留 */}
        {hasSelection && (
          <DualActionButton
            style={{
              top: `${sel.y > 38 ? sel.y - 34 : sel.y + 8}px`,
              left: `${Math.max(10, sel.x + sel.w - 118)}px`,
            }}
            visible={true}
            i18n={this.#i18n}
            layoutState={this.#layoutState}
            showLayoutOverlay={this.#showLayoutOverlay}
            hasLayoutService={hasLayoutService}
            onMenuClick={() => this.#confirmSelection("menu")}
            onLayoutClick={(action) => this.#handleLayoutClick(action)}
            onTranslateClick={() => this.#confirmSelection("all")}
            onCancelClick={() => {
              this.destroy(true);
              this.#onCancel?.();
            }}
          />
        )}
      </div>
    );
  }

  destroy(clearHighlight = true) {
    this.#currentSessionId++;
    this.#cleanupGesture?.();
    this.#cleanupGesture = null;
    this.#cleanupScroll?.();
    this.#cleanupScroll = null;
    this.#isSelecting = false;
    this.#isDragging = false;
    this.#isResizing = false;
    this.#cropBusy = false;
    this.#taskBusy = false;
    this.#cropSize = null;
    if (this.#handleKeyDown) {
      window.removeEventListener("keydown", this.#handleKeyDown, true);
      document.removeEventListener("keydown", this.#handleKeyDown, true);
      window.removeEventListener("resize", this.#handleResize);
    }
    if (this.#layoutTaskId) {
      sendBgMsg(MSG_IMAGE_TRANSLATE_CANCEL, { taskId: this.#layoutTaskId });
      this.#layoutTaskId = null;
    }
    this.#abortController?.abort();
    this.#abortController = null;
    try {
      this.#reactRoot?.unmount();
    } catch {}
    this.#container?.remove();
    this.#container = null;
    this.#reactRoot = null;
    this.#imgElement = null;
    this.#selection = null;
    this.#layoutState = "idle";
    this.#layoutRegions = [];

    // 物理清除页面上所有残留的截图蒙版 DOM，确保彻底退出截图翻译状态
    document
      .querySelectorAll(".kt-screenshot-overlay-root")
      .forEach((e) => e.remove());

    if (clearHighlight) {
      this.clearHighlight();
    }
  }
}
