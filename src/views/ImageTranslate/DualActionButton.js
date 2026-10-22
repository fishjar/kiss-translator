/**
 * @file DualActionButton.js
 * @description 网页图片悬停及截图框选操作按钮组（菜单、布局分析、翻译、可选取消）。
 */

import React from "react";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import ViewQuiltRoundedIcon from "@mui/icons-material/ViewQuiltRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CircularProgress from "@mui/material/CircularProgress";

export default function DualActionButton({
  onMenuClick,
  onLayoutClick,
  onTranslateClick,
  onCancelClick,
  layoutState = "idle", // "idle" | "loading" | "active"
  showLayoutOverlay = true,
  hasLayoutService = true,
  onMouseEnter,
  onMouseLeave,
  style = {},
  visible = true,
  i18n = (k, d) => d || k,
}) {
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
          background: isLayoutActive ? "#1976d2" : "transparent",
          border: "none",
          color: isLayoutActive
            ? "#ffffff"
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
          background: "#1976d2",
          border: "none",
          color: "#ffffff",
          borderRadius: "4px",
          cursor: "pointer",
          outline: "none",
          padding: 0,
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#1565c0";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#1976d2";
        }}
      >
        <TranslateRoundedIcon style={{ fontSize: "16px" }} />
      </button>

      {/* 4. 取消按钮 (可选，截图选框模式下渲染) */}
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
