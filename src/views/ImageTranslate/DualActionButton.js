/**
 * @file DualActionButton.js
 * @description 网页图片悬停及截图框选操作按钮组（菜单、布局分析、翻译、下载、可选取消）。
 */

import React, { useLayoutEffect, useRef, useState } from "react";
import { hslToHex } from "../../styles/m3";
import { useIconAccent } from "../../hooks/useIconAccent";
import {
  TranslateRoundedIcon,
  TuneRoundedIcon,
  ViewQuiltRoundedIcon,
  CloseRoundedIcon,
  DownloadRoundedIcon,
} from "../../components/icons";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import Portal from "@mui/material/Portal";
import CircularProgress from "@mui/material/CircularProgress";

export default function DualActionButton({
  onMenuClick,
  onLayoutClick,
  onTranslateClick,
  onCancelClick,
  onDownloadClick,
  downloadDisabled = false,
  layoutState = "idle", // "idle" | "loading" | "active"
  showLayoutOverlay = true,
  hasLayoutService = true,
  onMouseEnter,
  onMouseLeave,
  style = {},
  visible = true,
  i18n = (k, d) => d || k,
}) {
  // 悬浮操作栏游离于 M3Theme 之外（挂在宿主页面 body），无 CSS 变量可消费：
  // 恒浅口径主色族取自 useIconAccent；hover 为同色相 L=28 深化
  // （hslToHex(hue, 32, 28) 相对 light 主色 hslToHex(hue, 32, 34) 的加深档）。
  const { hue: accentHue, accent } = useIconAccent();
  const accentHover = hslToHex(accentHue, 32.0, 28.0);

  const containerRef = useRef(null);
  const downloadPending = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    element.style.setProperty(
      "--kt-image-toolbar-width",
      `${element.offsetWidth}px`
    );
    const rect = element.getBoundingClientRect();
    const shift =
      rect.left < 8
        ? 8 - rect.left
        : Math.min(0, window.innerWidth - 8 - rect.right);
    const baseLeft = parseFloat(style.left);
    if (shift && Number.isFinite(baseLeft)) {
      element.style.left = `${baseLeft + shift}px`;
    }
  }, [style.left, style.top, visible, onDownloadClick, onCancelClick]);

  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (downloadPending.current || downloadDisabled) return;
    downloadPending.current = true;
    setDownloading(true);
    setDownloadError(false);
    try {
      await onDownloadClick();
    } catch {
      setDownloadError(true);
    } finally {
      downloadPending.current = false;
      setDownloading(false);
    }
  };
  if (!visible) return null;

  const handleMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onMenuClick?.(e);
  };

  const handleLayout = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (layoutState === "loading") {
      onLayoutClick?.("cancel");
    } else if (layoutState === "active") {
      onLayoutClick?.("toggle");
    } else {
      onLayoutClick?.("start");
    }
  };

  const handleTranslate = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onTranslateClick?.(e);
  };

  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancelClick?.(e);
  };

  const layoutTitle =
    layoutState === "loading"
      ? i18n("image_btn_layout_cancel", "取消分析")
      : layoutState === "active"
        ? showLayoutOverlay
          ? i18n("image_btn_layout_hide", "隐藏版面线框")
          : i18n("image_btn_layout_show", "显示版面线框")
        : i18n("image_hover_btn_layout", "布局分析");

  const isLayoutActive = layoutState === "active" && showLayoutOverlay;

  return (
    <div
      ref={containerRef}
      className="kt-image-dual-btn-container notranslate"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        display: "inline-flex",
        alignItems: "center",
        zIndex: 2147483640,
        backgroundColor: "rgba(30, 30, 30, 0.88)",
        backdropFilter: "blur(8px)",
        borderRadius: "6px",
        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.28)",
        padding: "2px",
        gap: "2px",
        userSelect: "none",
        pointerEvents: "auto",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        ...style,
      }}
    >
      {/* 1. 菜单按钮 (纯 Icon) */}
      <button
        type="button"
        className="kt-image-dual-btn kt-image-dual-btn--menu"
        title={i18n("image_hover_btn_menu", "菜单")}
        aria-label={i18n("image_hover_btn_menu", "菜单")}
        onClick={handleMenu}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          background: "transparent",
          border: "none",
          color: "#ffffff",
          borderRadius: "4px",
          cursor: "pointer",
          outline: "none",
          padding: 0,
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.16)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <TuneRoundedIcon style={{ fontSize: "16px" }} />
      </button>

      <span
        style={{
          width: "1px",
          height: "12px",
          backgroundColor: "rgba(255, 255, 255, 0.25)",
        }}
      />

      {/* 2. 布局分析按钮 (纯 Icon 多态切换) */}
      <button
        type="button"
        className="kt-image-dual-btn kt-image-dual-btn--layout"
        title={layoutTitle}
        aria-label={layoutTitle}
        aria-pressed={isLayoutActive}
        onClick={handleLayout}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          background: isLayoutActive ? accent.primary : "transparent",
          border: "none",
          color: isLayoutActive
            ? accent.onPrimary
            : hasLayoutService
              ? "#ffffff"
              : "rgba(255, 255, 255, 0.4)",
          borderRadius: "4px",
          cursor: "pointer",
          outline: "none",
          padding: 0,
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          if (!isLayoutActive) {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.16)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isLayoutActive) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        {layoutState === "loading" ? (
          <CircularProgress size={14} sx={{ color: "#ffffff" }} />
        ) : (
          <ViewQuiltRoundedIcon style={{ fontSize: "16px" }} />
        )}
      </button>

      <span
        style={{
          width: "1px",
          height: "12px",
          backgroundColor: "rgba(255, 255, 255, 0.25)",
        }}
      />

      {/* 3. 翻译按钮 (纯 Icon 高亮蓝底) */}
      <button
        type="button"
        className="kt-image-dual-btn kt-image-dual-btn--translate"
        title={i18n("image_hover_btn_translate", "翻译")}
        aria-label={i18n("image_hover_btn_translate", "翻译")}
        onClick={handleTranslate}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "26px",
          height: "26px",
          background: accent.primary,
          border: "none",
          color: accent.onPrimary,
          borderRadius: "4px",
          cursor: "pointer",
          outline: "none",
          padding: 0,
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = accentHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = accent.primary;
        }}
      >
        <TranslateRoundedIcon style={{ fontSize: "16px" }} />
      </button>

      {onDownloadClick && (
        <>
          <span
            style={{
              width: "1px",
              height: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.25)",
            }}
          />
          <button
            type="button"
            className="kt-image-dual-btn kt-image-dual-btn--download"
            title={i18n("image_download", "下载图片")}
            aria-label={i18n("image_download", "下载图片")}
            disabled={downloading || downloadDisabled}
            onClick={handleDownload}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              background: "transparent",
              border: "none",
              color: "#ffffff",
              borderRadius: "4px",
              cursor: downloading || downloadDisabled ? "default" : "pointer",
              opacity: downloadDisabled ? 0.4 : 1,
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.16)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {downloading ? (
              <CircularProgress size={14} sx={{ color: "#ffffff" }} />
            ) : (
              <DownloadRoundedIcon style={{ fontSize: "16px" }} />
            )}
          </button>
        </>
      )}

      <Portal>
        <Snackbar
          data-kiss-ui=""
          className="notranslate"
          sx={{ zIndex: 2147483647 }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          open={downloadError}
          autoHideDuration={5000}
          onClose={(_, reason) => {
            if (reason !== "clickaway") setDownloadError(false);
          }}
          anchorOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setDownloadError(false)}
          >
            {i18n("image_download_failed", "图片下载失败，请重试")}
          </Alert>
        </Snackbar>
      </Portal>

      {/* 取消按钮 (可选，截图选框模式下渲染) */}
      {Boolean(onCancelClick) && (
        <>
          <span
            style={{
              width: "1px",
              height: "12px",
              backgroundColor: "rgba(255, 255, 255, 0.25)",
            }}
          />
          <button
            type="button"
            className="kt-image-dual-btn kt-image-dual-btn--cancel"
            title={i18n("image_hover_btn_cancel", "取消")}
            aria-label={i18n("image_hover_btn_cancel", "取消")}
            onClick={handleCancel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "26px",
              height: "26px",
              background: "transparent",
              border: "none",
              color: "#ffffff",
              borderRadius: "4px",
              cursor: "pointer",
              outline: "none",
              padding: 0,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                "rgba(255, 255, 255, 0.16)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <CloseRoundedIcon style={{ fontSize: "16px" }} />
          </button>
        </>
      )}
    </div>
  );
}
