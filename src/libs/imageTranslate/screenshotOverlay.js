import { logger } from "../log";
/**
 * @file screenshotOverlay.js
 * @description 页面坐标选区、可滚动长截图捕获与交互式框选层。
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { sendBgMsg } from "../msg";
import {
  MSG_CAPTURE_VISIBLE_TAB,
  MSG_IMAGE_TRANSLATE_EXECUTE,
  MSG_IMAGE_TRANSLATE_CANCEL,
  APP_CONSTS,
} from "../../config";
import { cropAndCompressImage, blobToDataUrl } from "./imageReader";
import { downloadImageBlob } from "./downloadImage";
import DualActionButton from "../../views/ImageTranslate/DualActionButton";
import ImageLayoutOverlay from "../../views/ImageTranslate/ImageLayoutOverlay";
import {
  isApiConfigured,
  supportsApiCapability,
} from "../../config/serviceSelection";

export class ScreenshotOverlay {
  #container = null;
  #reactRoot = null;
  #overlayElement = null;
  #selectionElement = null;
  #selectionFrame = null;
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
  #downloadBusy = false;
  #taskBusy = false;
  #cropSize = null;
  #onLayoutChange = null;
  #onSelectionChange = null;
  #cleanupScroll = null;
  #cleanupGesture = null;
  #autoScrollFrame = null;
  #autoScrollPoint = null;
  #autoScrollUpdate = null;
  #coarsePointer = window.matchMedia?.("(pointer: coarse)").matches || false;
  #onLayoutStart = null;
  #onLocalBusyChange = null;
  #onToggleBox = null;

  get #busy() {
    return (
      this.#cropBusy ||
      this.#downloadBusy ||
      this.#taskBusy ||
      this.#layoutState === "loading"
    );
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

    this.#currentSessionId++;
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

    // 2. 记录页面坐标基准。截图模式保持页面可滚动，选区使用文档坐标。
    this.#dpr = window.devicePixelRatio || 1;

    // 3. 构建覆盖层；底层直接显示网页原始内容。
    this.#initDom();
    this.#bindScroll();
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
      touch-action: pan-x pan-y;
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


  #bindScroll() {
    const onScroll = () => this.#scheduleSelectionPaint();
    window.addEventListener("scroll", onScroll, { passive: true });
    this.#cleanupScroll = () => {
      window.removeEventListener("scroll", onScroll);
    };
  }

  // 指针靠近视口边缘时持续滚动页面，并用最新 scrollX/Y 重算页面坐标。
  #updateEdgeAutoScroll(clientX, clientY, update) {
    this.#autoScrollPoint = { clientX, clientY };
    this.#autoScrollUpdate = update;
    update(clientX, clientY);

    if (this.#autoScrollFrame !== null) return;

    const edgeSize = 72;
    const maxSpeed = 40;
    const tick = () => {
      this.#autoScrollFrame = null;
      const point = this.#autoScrollPoint;
      const callback = this.#autoScrollUpdate;
      if (!point || !callback || !this.#cleanupGesture || this.#busy) return;

      const getSpeed = (position, size) => {
        if (position < edgeSize) {
          const ratio = Math.min(1, (edgeSize - position) / edgeSize);
          return -Math.max(4, Math.ceil(Math.pow(ratio, 1.5) * maxSpeed));
        }
        if (position > size - edgeSize) {
          const ratio = Math.min(1, (position - (size - edgeSize)) / edgeSize);
          return Math.max(4, Math.ceil(Math.pow(ratio, 1.5) * maxSpeed));
        }
        return 0;
      };

      const dx = getSpeed(point.clientX, window.innerWidth);
      const dy = getSpeed(point.clientY, window.innerHeight);
      if (!dx && !dy) return;

      const beforeX = window.scrollX;
      const beforeY = window.scrollY;
      window.scrollBy(dx, dy);
      if (window.scrollX !== beforeX || window.scrollY !== beforeY) {
        callback(point.clientX, point.clientY);
        this.#autoScrollFrame = requestAnimationFrame(tick);
      }
    };
    this.#autoScrollFrame = requestAnimationFrame(tick);
  }

  #stopEdgeAutoScroll() {
    if (this.#autoScrollFrame !== null) {
      cancelAnimationFrame(this.#autoScrollFrame);
      this.#autoScrollFrame = null;
    }
    this.#autoScrollPoint = null;
    this.#autoScrollUpdate = null;
  }

  #invalidateSelection() {
    this.setLayoutState(null);
    this.#cropSize = null;
    this.#onSelectionChange?.();
  }

  #finishSelection() {
    this.#cancelSelectionFrame();
    this.#render();
    if (
      this.#isConfirmed &&
      this.#selection?.w >= 10 &&
      this.#selection?.h >= 10
    ) {
      this.#confirmSelection("update");
    }
  }

  #cancelSelectionFrame() {
    if (this.#selectionFrame === null) return;
    cancelAnimationFrame(this.#selectionFrame);
    this.#selectionFrame = null;
  }

  #scheduleSelectionPaint() {
    if (this.#selectionFrame !== null) return;
    this.#selectionFrame = requestAnimationFrame(() => {
      this.#selectionFrame = null;
      const sel = this.#selection;
      const visible = Boolean(sel && sel.w >= 10 && sel.h >= 10);
      // Mount or remove controls only when crossing the selection threshold.
      if (visible !== Boolean(this.#selectionElement)) {
        flushSync(() => this.#render());
      }
      this.#paintSelectionGeometry();
      if (this.#layoutState === "active") this.#render();
    });
  }

  #paintSelectionGeometry() {
    const sel = this.#selection;
    if (!sel || !this.#overlayElement) return;
    const style = this.#overlayElement.style;
    const x = sel.x - window.scrollX;
    const y = sel.y - window.scrollY;
    style.setProperty("--kt-selection-x", `${x}px`);
    style.setProperty("--kt-selection-y", `${y}px`);
    style.setProperty("--kt-selection-width", `${sel.w}px`);
    style.setProperty("--kt-selection-height", `${sel.h}px`);
    style.setProperty(
      "--kt-selection-toolbar-top",
      `${Math.max(8, Math.min(window.innerHeight - 40, y > 38 ? y - 34 : y + 8))}px`
    );
  }

  #onContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.destroy(true);
    this.#onCancel?.();
  };

  // 根据鼠标悬停位置显示选区边框对应的缩放指针。
  #onSelectionPointerMove = (e) => {
    if (this.#busy || this.#cleanupGesture || !this.#selection) return;

    const rect = this.#selectionElement.getBoundingClientRect();
    const hitSize = this.#coarsePointer ? 22 : 12;

    const withinHorizontal =
      e.clientX >= rect.left - hitSize &&
      e.clientX <= rect.right + hitSize;
    const withinVertical =
      e.clientY >= rect.top - hitSize &&
      e.clientY <= rect.bottom + hitSize;

    const nearLeft =
      withinVertical && Math.abs(e.clientX - rect.left) <= hitSize;
    const nearRight =
      withinVertical && Math.abs(e.clientX - rect.right) <= hitSize;
    const nearTop =
      withinHorizontal && Math.abs(e.clientY - rect.top) <= hitSize;
    const nearBottom =
      withinHorizontal && Math.abs(e.clientY - rect.bottom) <= hitSize;

    let dir = "";
    if (nearTop) dir += "n";
    else if (nearBottom) dir += "s";
    if (nearLeft) dir += "w";
    else if (nearRight) dir += "e";

    const cursor = dir
      ? dir === "n" || dir === "s"
        ? "ns-resize"
        : dir === "e" || dir === "w"
          ? "ew-resize"
          : dir === "nw" || dir === "se"
            ? "nwse-resize"
            : "nesw-resize"
      : "move";

    this.#selectionElement.style.cursor = cursor;
  };

  #onSelectionPointerLeave = () => {
    if (this.#selectionElement && !this.#cleanupGesture) {
      this.#selectionElement.style.cursor = this.#busy ? "default" : "move";
    }
  };

  #onPointerDown = (e) => {
    if (
      e.button !== 0 ||
      e.isPrimary === false ||
      this.#cleanupGesture ||
      this.#busy
    )
      return;
    const target = e.target;

    // 点击在控制按钮、线框或缩放手柄上时由其自身处理
    if (
      target.closest?.(
        "button, .kt-image-dual-btn-container, .kt-screenshot-handle, .kt-image-layout-overlay"
      )
    ) {
      return;
    }

    if (this.#selection) {
      const rect = {
        left: this.#selection.x - window.scrollX,
        top: this.#selection.y - window.scrollY,
        right: this.#selection.x + this.#selection.w - window.scrollX,
        bottom: this.#selection.y + this.#selection.h - window.scrollY,
      };
      const hitSize = this.#coarsePointer ? 22 : 12;
      const withinHorizontal =
        e.clientX >= rect.left - hitSize && e.clientX <= rect.right + hitSize;
      const withinVertical =
        e.clientY >= rect.top - hitSize && e.clientY <= rect.bottom + hitSize;
      const nearLeft = withinVertical && Math.abs(e.clientX - rect.left) <= hitSize;
      const nearRight = withinVertical && Math.abs(e.clientX - rect.right) <= hitSize;
      const nearTop = withinHorizontal && Math.abs(e.clientY - rect.top) <= hitSize;
      const nearBottom = withinHorizontal && Math.abs(e.clientY - rect.bottom) <= hitSize;
      let dir = "";
      if (nearTop) dir += "n";
      else if (nearBottom) dir += "s";
      if (nearLeft) dir += "w";
      else if (nearRight) dir += "e";
      if (dir) {
        this.#startResize(dir, e);
        return;
      }
    }

    const pointerId = e.pointerId;
    const startX = e.clientX + window.scrollX;
    const startY = e.clientY + window.scrollY;
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
      flushSync(() => this.#invalidateSelection());
      changed = true;
      // 重新开始框选
      this.#isSelecting = true;
      this.#selection = { x: startX, y: startY, w: 0, h: 0 };
      this.#dragStart = { startX, startY };
      this.#layoutState = "idle";
      this.#layoutRegions = [];
    }

    const updateSelection = (clientX, clientY) => {
      if (this.#busy) return;
      const pageX = clientX + window.scrollX;
      const pageY = clientY + window.scrollY;
      if (!changed && (pageX !== startX || pageY !== startY)) {
        flushSync(() => this.#invalidateSelection());
        changed = true;
      }
      if (this.#isSelecting) {
        const x = Math.min(this.#dragStart.startX, pageX);
        const y = Math.min(this.#dragStart.startY, pageY);
        const w = Math.abs(pageX - this.#dragStart.startX);
        const h = Math.abs(pageY - this.#dragStart.startY);
        this.#selection = { x, y, w, h };
        this.#scheduleSelectionPaint();
      } else if (this.#isDragging) {
        const dx = pageX - this.#dragStart.mouseX;
        const dy = pageY - this.#dragStart.mouseY;
        const maxX = Math.max(0, Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth) - this.#selection.w);
        const maxY = Math.max(0, Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight) - this.#selection.h);
        this.#selection.x = Math.max(0, Math.min(maxX, this.#dragStart.selX + dx));
        this.#selection.y = Math.max(0, Math.min(maxY, this.#dragStart.selY + dy));
        this.#scheduleSelectionPaint();
      }
    };

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      this.#updateEdgeAutoScroll(moveEvent.clientX, moveEvent.clientY, updateSelection);
    };

    const onPointerUp = (event) => {
      if (event.pointerId !== pointerId) return;
      this.#isSelecting = false;
      this.#isDragging = false;
      this.#stopEdgeAutoScroll();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      this.#cleanupGesture = null;

      if (
        this.#selection &&
        (this.#selection.w < 10 || this.#selection.h < 10)
      ) {
        this.#selection = null;
        this.#layoutState = "idle";
        this.#layoutRegions = [];
      }
      if (
        event.type === "pointercancel" &&
        this.#isConfirmed &&
        !this.#selection
      ) {
        this.destroy(true);
        this.#onCancel?.();
        return;
      }
      if (changed) this.#finishSelection();
      else {
        this.#cancelSelectionFrame();
        this.#render();
      }
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    this.#cleanupGesture = () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
    };
  };

  #startResize = (dir, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (
      e.button !== 0 ||
      e.isPrimary === false ||
      this.#cleanupGesture ||
      this.#busy ||
      !this.#selection
    )
      return;
    this.#isResizing = true;
    this.#resizeDir = dir;
    let changed = false;

    const pointerId = e.pointerId;
    const startX = e.clientX + window.scrollX;
    const startY = e.clientY + window.scrollY;
    const initSel = { ...this.#selection };

    const updateResize = (clientX, clientY) => {
      if (!this.#isResizing || !this.#selection || this.#busy) return;
      const dx = clientX + window.scrollX - startX;
      const dy = clientY + window.scrollY - startY;
      const pageWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth);
      const pageHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight);
      let left = initSel.x;
      let right = initSel.x + initSel.w;
      let top = initSel.y;
      let bottom = initSel.y + initSel.h;
      if (dir.includes("e")) right = Math.max(0, Math.min(pageWidth, right + dx));
      if (dir.includes("s")) bottom = Math.max(0, Math.min(pageHeight, bottom + dy));
      if (dir.includes("w")) left = Math.max(0, Math.min(pageWidth, left + dx));
      if (dir.includes("n")) top = Math.max(0, Math.min(pageHeight, top + dy));
      const x = Math.min(left, right);
      const y = Math.min(top, bottom);
      const w = Math.abs(right - left);
      const h = Math.abs(bottom - top);
      if (w > 10 && h > 10) {
        if (!changed && (dx || dy)) {
          flushSync(() => this.#invalidateSelection());
          changed = true;
        }
        this.#selection = { x, y, w, h };
        this.#scheduleSelectionPaint();
      }
    };

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      this.#updateEdgeAutoScroll(moveEvent.clientX, moveEvent.clientY, updateResize);
    };

    const onPointerUp = (event) => {
      if (event.pointerId !== pointerId) return;
      this.#isResizing = false;
      this.#resizeDir = null;
      this.#stopEdgeAutoScroll();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      this.#cleanupGesture = null;
      if (changed) this.#finishSelection();
      else {
        this.#cancelSelectionFrame();
        this.#render();
      }
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    this.#cleanupGesture = () => {
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
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
      if (!this.#selection || this.#busy) return;

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
        const selectionCanvas = await this.#captureSelectionCanvas(
          { ...this.#selection },
          this.#abortController.signal
        );
        const { blob, width, height } = await cropAndCompressImage(
          selectionCanvas,
          {
            width: selectionCanvas.width,
            height: selectionCanvas.height,
            dpr: 1,
            maxEdge: 4096,
            type: "image/jpeg",
            quality: 0.86,
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
          logger
            .child("image-translate")
            .warn("[ScreenshotOverlay] Layout error:", err);
          alert(
            err?.code === "SCREENSHOT_UNSUPPORTED" ||
              err?.code === "SCREENSHOT_FAILED" ||
              err?.code === "IMAGE_ENCODE_FAILED"
              ? this.#getScreenshotErrorMessage(err)
              : err?.message ||
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
      left: ${sel.x - window.scrollX}px;
      top: ${sel.y - window.scrollY}px;
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

  #getScreenshotErrorMessage(error) {
    if (error?.code === "IMAGE_ENCODE_FAILED") {
      return this.#i18n(
        "image_screenshot_encode_failed",
        "无法压缩截图，请重试"
      );
    }
    if (error?.code === "SCREENSHOT_UNSUPPORTED") {
      return this.#i18n(
        "image_screenshot_unsupported",
        "当前浏览器不支持截图翻译"
      );
    }
    if (error?.code === "SCREENSHOT_FAILED") {
      return this.#i18n(
        "image_screenshot_failed",
        "截图失败，请检查页面访问权限后重试"
      );
    }
    return (
      error?.message ||
      this.#i18n(
        "image_screenshot_failed",
        "截图失败，请检查页面访问权限后重试"
      )
    );
  }

  async #captureSelectionCanvas(selection, signal) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (!viewportWidth || !viewportHeight) {
      throw new Error(
        this.#i18n(
          "image_screenshot_invalid_viewport",
          "当前页面视口尺寸无效，无法截图"
        )
      );
    }
    const doc = document.documentElement;
    const pageWidth = Math.max(
      doc.scrollWidth,
      document.body?.scrollWidth || 0,
      viewportWidth
    );
    const pageHeight = Math.max(
      doc.scrollHeight,
      document.body?.scrollHeight || 0,
      viewportHeight
    );
    const maxScrollX = Math.max(0, pageWidth - viewportWidth);
    const maxScrollY = Math.max(0, pageHeight - viewportHeight);
    const overlap = Math.min(
      160,
      Math.floor(Math.min(viewportWidth, viewportHeight) * 0.2)
    );
    const stepX = Math.max(1, viewportWidth - overlap);
    const stepY = Math.max(1, viewportHeight - overlap);
    const endX = selection.x + selection.w;
    const endY = selection.y + selection.h;
    const originalScroll = { x: window.scrollX, y: window.scrollY };
    const hiddenElements = [
      this.#container,
      document.getElementById(APP_CONSTS.imageBoxID),
      this.#highlightElement,
    ]
      .filter(Boolean)
      .map((element) => ({
        element,
        visibility: element.style.visibility,
      }));
    const hideOverlays = () => {
      for (const { element } of hiddenElements) {
        element.style.visibility = "hidden";
      }
    };
    const restoreOverlays = () => {
      for (const { element, visibility } of hiddenElements) {
        element.style.visibility = visibility;
      }
    };
    const scrollStyle = [document.documentElement, document.body].map(
      (element) => ({
        element,
        behavior: element.style.getPropertyValue("scroll-behavior"),
        behaviorPriority: element.style.getPropertyPriority("scroll-behavior"),
        snap: element.style.getPropertyValue("scroll-snap-type"),
        snapPriority: element.style.getPropertyPriority("scroll-snap-type"),
      })
    );
    for (const { element } of scrollStyle) {
      element.style.setProperty("scroll-behavior", "auto", "important");
      element.style.setProperty("scroll-snap-type", "none", "important");
    }
    const starts = (start, end, viewport, maxScroll, step) => {
      const values = [];
      let current = Math.min(Math.max(0, start), maxScroll);
      values.push(current);
      while (current + viewport < end) {
        const next = Math.min(current + step, maxScroll);
        if (next <= current) break;
        values.push(next);
        current = next;
      }
      return values;
    };
    const xStarts = starts(
      selection.x,
      endX,
      viewportWidth,
      maxScrollX,
      stepX
    );
    const yStarts = starts(
      selection.y,
      endY,
      viewportHeight,
      maxScrollY,
      stepY
    );
    let canvas = null;
    let context = null;
    let outputScaleX = 1;
    let outputScaleY = 1;
    let scaleLimit = 1;
    const actualRowPositions = [];
    const actualColumnPositions = [];
    const sessionId = this.#currentSessionId;

    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const loadImage = (dataUrl) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
      });

    try {
      for (let row = 0; row < yStarts.length; row++) {
        for (let column = 0; column < xStarts.length; column++) {
          if (sessionId !== this.#currentSessionId || signal?.aborted) {
            throw new Error(
              this.#i18n("image_screenshot_cancelled", "截图任务已取消")
            );
          }
          window.scrollTo(xStarts[column], yStarts[row]);
          await nextFrame();
          await nextFrame();
          hideOverlays();
          await nextFrame();
          await nextFrame();
          const response = await sendBgMsg(MSG_CAPTURE_VISIBLE_TAB);
          if (!response?.dataUrl) {
            if (response?.unsupported) {
              const error = new Error();
              error.code = "SCREENSHOT_UNSUPPORTED";
              throw error;
            }
            throw new Error(
              response?.error ||
                this.#i18n(
                  "image_screenshot_capture_failed",
                  "无法获取当前页面截图，请重试"
                )
            );
          }
          const image = await loadImage(response.dataUrl).catch(() => {
            throw new Error(
              this.#i18n(
                "image_screenshot_image_load_failed",
                "无法读取截图图像，请重试"
              )
            );
          });
          restoreOverlays();
          if (sessionId !== this.#currentSessionId || signal?.aborted) {
            throw new Error(
              this.#i18n("image_screenshot_cancelled", "截图任务已取消")
            );
          }

          if (!image.naturalWidth || !image.naturalHeight) {
            throw new Error(
              this.#i18n(
                "image_screenshot_invalid_dimensions",
                "截图图像尺寸无效"
              )
            );
          }
          const scaleX = image.naturalWidth / viewportWidth;
          const scaleY = image.naturalHeight / viewportHeight;
          if (!canvas) {
            const maxArea = 25_000_000;
            scaleLimit = Math.min(
              1,
              Math.sqrt(
                maxArea / (selection.w * scaleX * selection.h * scaleY)
              ),
              32767 / (selection.w * scaleX),
              32767 / (selection.h * scaleY)
            );
            outputScaleX = scaleX * scaleLimit;
            outputScaleY = scaleY * scaleLimit;
            canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(selection.w * outputScaleX));
            canvas.height = Math.max(1, Math.ceil(selection.h * outputScaleY));
            context = canvas.getContext("2d");
            if (!context) {
              throw new Error(
                this.#i18n(
                  "image_screenshot_canvas_failed",
                  "无法创建长截图画布"
                )
              );
            }
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            this.#dpr = outputScaleX;
          }

          const actualX = window.scrollX;
          const actualY = window.scrollY;
          if (column === 0) actualRowPositions[row] = actualY;
          if (row === 0) actualColumnPositions[column] = actualX;
          // 不要把上一块与当前块之间的整个重叠区域都裁掉：
          // 两块恰好相接时，Canvas 对浮点边界的栅格化仍可能留下空像素。
          // 保留至少 2 个最终画布像素的覆盖量，让后绘制的截图块覆盖接缝。
          const seamBleedX = Math.max(2, 2 / outputScaleX);
          const seamBleedY = Math.max(2, 2 / outputScaleY);
          const skipLeft =
            column > 0
              ? Math.max(
                  0,
                  actualColumnPositions[column - 1] +
                    viewportWidth -
                    actualX -
                    seamBleedX
                )
              : 0;
          const skipTop =
            row > 0
              ? Math.max(
                  0,
                  actualRowPositions[row - 1] +
                    viewportHeight -
                    actualY -
                    seamBleedY
                )
              : 0;
          const left = Math.max(selection.x, actualX + skipLeft);
          const top = Math.max(selection.y, actualY + skipTop);
          const right = Math.min(endX, actualX + viewportWidth);
          const bottom = Math.min(endY, actualY + viewportHeight);
          if (right <= left || bottom <= top) continue;

          // 将相邻截图块的边界统一吸附到最终画布的整数像素，避免
          // 浮点坐标在 Canvas 栅格化时留下透明缝隙（导出 JPEG 后会变成黑线）。
          // 使用 floor/ceil 让相邻块在边界处至少覆盖同一列/行像素，形成轻微重叠。
          const destLeft = Math.max(
            0,
            Math.floor((left - selection.x) * outputScaleX)
          );
          const destTop = Math.max(
            0,
            Math.floor((top - selection.y) * outputScaleY)
          );
          const destRight = Math.min(
            canvas.width,
            Math.ceil((right - selection.x) * outputScaleX)
          );
          const destBottom = Math.min(
            canvas.height,
            Math.ceil((bottom - selection.y) * outputScaleY)
          );
          const destWidth = destRight - destLeft;
          const destHeight = destBottom - destTop;
          if (destWidth <= 0 || destHeight <= 0) continue;

          // 反算整数目标边界对应的源图坐标。边界向外扩展的不足 1px
          // 会从当前截图块的重叠区域取样，避免只扩展目标矩形却拉伸边缘像素。
          const rawSourceX =
            (selection.x + destLeft / outputScaleX - actualX) * scaleX;
          const rawSourceY =
            (selection.y + destTop / outputScaleY - actualY) * scaleY;
          const rawSourceRight =
            rawSourceX + (destWidth / outputScaleX) * scaleX;
          const rawSourceBottom =
            rawSourceY + (destHeight / outputScaleY) * scaleY;

          // floor/ceil 扩展目标边界后，边缘块反算出的源坐标可能略微越界。
          // 将源区域限制在截图实际尺寸内，并同步收缩目标区域，不能让
          // drawImage 因源区域越界而整体跳过绘制。
          const sourceX = Math.max(0, rawSourceX);
          const sourceY = Math.max(0, rawSourceY);
          const sourceRight = Math.min(image.naturalWidth, rawSourceRight);
          const sourceBottom = Math.min(image.naturalHeight, rawSourceBottom);
          const sourceWidth = sourceRight - sourceX;
          const sourceHeight = sourceBottom - sourceY;
          if (sourceWidth <= 0 || sourceHeight <= 0) continue;

          const clippedDestLeft = Math.max(
            0,
            Math.floor(
              destLeft + ((sourceX - rawSourceX) / scaleX) * outputScaleX
            )
          );
          const clippedDestTop = Math.max(
            0,
            Math.floor(
              destTop + ((sourceY - rawSourceY) / scaleY) * outputScaleY
            )
          );
          const clippedDestRight = Math.min(
            canvas.width,
            Math.ceil(
              destLeft + ((sourceRight - rawSourceX) / scaleX) * outputScaleX
            )
          );
          const clippedDestBottom = Math.min(
            canvas.height,
            Math.ceil(
              destTop + ((sourceBottom - rawSourceY) / scaleY) * outputScaleY
            )
          );
          const clippedDestWidth = clippedDestRight - clippedDestLeft;
          const clippedDestHeight = clippedDestBottom - clippedDestTop;
          if (clippedDestWidth <= 0 || clippedDestHeight <= 0) continue;

          context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            clippedDestLeft,
            clippedDestTop,
            clippedDestWidth,
            clippedDestHeight
          );
          if (row !== yStarts.length - 1 || column !== xStarts.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 520));
          }
        }
      }
      if (!canvas) {
        throw new Error(
          this.#i18n(
            "image_screenshot_empty_selection",
            "没有捕获到选区内容"
          )
        );
      }
      return canvas;
    } finally {
      restoreOverlays();
      window.scrollTo(originalScroll.x, originalScroll.y);
      for (const {
        element,
        behavior,
        behaviorPriority,
        snap,
        snapPriority,
      } of scrollStyle) {
        element.style.removeProperty("scroll-behavior");
        element.style.removeProperty("scroll-snap-type");
        if (behavior) {
          element.style.setProperty(
            "scroll-behavior",
            behavior,
            behaviorPriority
          );
        }
        if (snap) {
          element.style.setProperty("scroll-snap-type", snap, snapPriority);
        }
      }
      await nextFrame();
    }
  }

  async #downloadSelection() {
    if (this.#busy || !this.#selection) return;
    const selection = { ...this.#selection };
    const session = this.#currentSessionId;
    this.#downloadBusy = true;
    this.#render();
    try {
      const canvas = await this.#captureSelectionCanvas(selection);
      const { blob } = await cropAndCompressImage(canvas, {
        width: canvas.width,
        height: canvas.height,
        dpr: 1,
        maxEdge: 4096,
        type: "image/jpeg",
        quality: 0.86,
      });
      if (session === this.#currentSessionId)
        downloadImageBlob(blob, "screenshot");
    } catch (err) {
      if (session === this.#currentSessionId) {
        alert(this.#getScreenshotErrorMessage(err));
      }
    } finally {
      if (session === this.#currentSessionId) {
        this.#downloadBusy = false;
        this.#render();
      }
    }
  }

  async #confirmSelection(action) {
    if (action === "menu" && this.#onToggleBox?.()) return;
    if (this.#busy) return;
    if (!this.#selection) {
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
      const canvas = await this.#captureSelectionCanvas(sel);
      const { blob, width, height } = await cropAndCompressImage(canvas, {
        width: canvas.width,
        height: canvas.height,
        dpr: 1,
        maxEdge: 4096,
        type: "image/jpeg",
        quality: 0.86,
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
      logger
        .child("image-translate")
        .error("[ScreenshotOverlay] Crop failed:", err);
      this.#isConfirmed = wasConfirmed;
      if (this.#container && !wasConfirmed)
        this.#container.style.zIndex = "2147483647";
      alert(this.#getScreenshotErrorMessage(err));
    } finally {
      if (this.#currentSessionId === sessionId) {
        this.#cropBusy = false;
        this.#onLocalBusyChange?.(false);
        this.#render();
      }
    }
  }

  #render() {
    if (!this.#reactRoot) return;

    const sel = this.#selection;
    const hasSelection = sel && sel.w >= 10 && sel.h >= 10;
    const hasLayoutService = Boolean(this.#getActiveLayoutApi());
    
    const handles = hasSelection
      ? [
          { dir: "nw", cursor: "nwse-resize" },
          { dir: "n", cursor: "ns-resize" },
          { dir: "ne", cursor: "nesw-resize" },
          { dir: "e", cursor: "ew-resize" },
          { dir: "se", cursor: "nwse-resize" },
          { dir: "s", cursor: "ns-resize" },
          { dir: "sw", cursor: "nesw-resize" },
          { dir: "w", cursor: "ew-resize" },
        ]
      : [];

    this.#reactRoot.render(
      <div
        ref={(element) => {
          this.#overlayElement = element;
          this.#paintSelectionGeometry();
        }}
        onPointerDown={this.#onPointerDown}
        onContextMenu={this.#onContextMenu}
        style={{
          "--kt-selection-x": `${(sel?.x || 0) - window.scrollX}px`,
          "--kt-selection-y": `${(sel?.y || 0) - window.scrollY}px`,
          "--kt-selection-width": `${sel?.w || 0}px`,
          "--kt-selection-height": `${sel?.h || 0}px`,
          "--kt-selection-toolbar-top": `${Math.max(8, Math.min(window.innerHeight - 40, sel ? (sel.y - window.scrollY > 38 ? sel.y - window.scrollY - 34 : sel.y - window.scrollY + 8) : 8))}px`,
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        {/* 半透明全屏蒙版，选区内显示页面原始内容 */}
        <div
          className="kt-screenshot-mask"
          style={{
            all: "initial",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: hasSelection
              ? "rgba(0, 0, 0, 0.64)"
              : "rgba(0, 0, 0, 0.4)",
            clipPath: hasSelection
              ? "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, var(--kt-selection-x) var(--kt-selection-y), var(--kt-selection-x) calc(var(--kt-selection-y) + var(--kt-selection-height)), calc(var(--kt-selection-x) + var(--kt-selection-width)) calc(var(--kt-selection-y) + var(--kt-selection-height)), calc(var(--kt-selection-x) + var(--kt-selection-width)) var(--kt-selection-y), var(--kt-selection-x) var(--kt-selection-y))"
              : "none",
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
                this.#coarsePointer
                  ? "image_screenshot_touch_tip"
                  : "image_screenshot_esc_tip",
                this.#coarsePointer
                  ? "拖动框选区域，可滚动页面扩展选区，点击 × 取消"
                  : "拖拽框选区域，可滚动页面扩展选区，按 Esc 取消"
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
                minWidth: this.#coarsePointer ? 44 : undefined,
                minHeight: this.#coarsePointer ? 44 : undefined,
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
            ref={(element) => {
              this.#selectionElement = element;
            }}
            onPointerMove={this.#onSelectionPointerMove}
            onPointerLeave={this.#onSelectionPointerLeave}
            style={{
              position: "absolute",
              left: "var(--kt-selection-x)",
              top: "var(--kt-selection-y)",
              width: "var(--kt-selection-width)",
              height: "var(--kt-selection-height)",
              border: "2px solid #00c853",
              cursor: this.#busy ? "default" : "move",
              boxSizing: "border-box",
            }}
          />
        )}

        {/* 选区内交互式版面线框层 */}
        {hasSelection && this.#layoutState === "active" && (
          <ImageLayoutOverlay
            regions={this.#layoutRegions}
            imageRect={{
              left: sel.x - window.scrollX,
              top: sel.y - window.scrollY,
              width: sel.w,
              height: sel.h,
            }}
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
              onPointerDown={(e) => this.#startResize(h.dir, e)}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: `calc(var(--kt-selection-x) + ${h.dir.includes("w") ? "0px" : h.dir.includes("e") ? "var(--kt-selection-width)" : "var(--kt-selection-width) / 2"} - 4px)`,
                top: `calc(var(--kt-selection-y) + ${h.dir.includes("n") ? "0px" : h.dir.includes("s") ? "var(--kt-selection-height)" : "var(--kt-selection-height) / 2"} - 4px)`,
                width: this.#coarsePointer ? "44px" : "8px",
                height: this.#coarsePointer ? "44px" : "8px",
                margin: this.#coarsePointer ? "-18px" : 0,
                borderRadius: "2px",
                cursor: h.cursor,
                zIndex: 20,
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: this.#coarsePointer ? 18 : 0,
                  top: this.#coarsePointer ? 18 : 0,
                  width: 8,
                  height: 8,
                  backgroundColor: "#ffffff",
                  border: "2px solid #00c853",
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            </div>
          ))}

        {/* 选区右上角操作条在打开翻译弹框后继续保留 */}
        {hasSelection && (
          <DualActionButton
            style={{
              top: "var(--kt-selection-toolbar-top)",
              left: "clamp(calc(var(--kt-image-toolbar-width, 154px) + 8px), calc(var(--kt-selection-x) + var(--kt-selection-width)), calc(100vw - 8px))",
              transform: "translateX(-100%)",
            }}
            visible={true}
            i18n={this.#i18n}
            layoutState={this.#layoutState}
            showLayoutOverlay={this.#showLayoutOverlay}
            hasLayoutService={hasLayoutService}
            onMenuClick={() => this.#confirmSelection("menu")}
            onLayoutClick={(action) => this.#handleLayoutClick(action)}
            onTranslateClick={() => this.#confirmSelection("all")}
            onDownloadClick={() => this.#downloadSelection()}
            downloadDisabled={this.#busy}
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
    this.#cancelSelectionFrame();
    this.#stopEdgeAutoScroll();
    this.#cleanupGesture?.();
    this.#cleanupGesture = null;
    this.#cleanupScroll?.();
    this.#cleanupScroll = null;
    this.#isSelecting = false;
    this.#isDragging = false;
    this.#isResizing = false;
    this.#cropBusy = false;
    this.#downloadBusy = false;
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
