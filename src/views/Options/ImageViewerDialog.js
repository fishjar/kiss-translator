import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import { useI18n } from "../../hooks/I18n";

/**
 * 原图与译图大图放大查看器（沉浸式半透明毛玻璃背景、无边框、悬浮胶囊工具栏）
 */
export default function ImageViewerDialog({
  open,
  onClose,
  sourceUrl,
  translatedUrl,
  initialTab = "source",
  activeTab: activeTabProp,
  filename = "image",
}) {
  const i18n = useI18n();
  const effectiveInitialTab = activeTabProp || initialTab;
  const [activeTab, setActiveTab] = useState(effectiveInitialTab);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const containerRef = useRef(null);

  // 当弹窗打开或激活项变化时初始化状态
  useEffect(() => {
    if (open) {
      const tabToUse = activeTabProp || initialTab;
      setActiveTab(
        tabToUse === "translated" && translatedUrl ? "translated" : "source"
      );
      setScale(1);
      setPosition({ x: 0, y: 0 });
      hasDraggedRef.current = false;
    }
  }, [open, initialTab, activeTabProp, translatedUrl]);

  const currentUrl = activeTab === "translated" && translatedUrl ? translatedUrl : sourceUrl;

  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleZoom = useCallback((factor) => {
    setScale((prev) => {
      const next = prev * factor;
      return Math.min(Math.max(next, 0.2), 8);
    });
  }, []);

  // 滚轮平滑缩放
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;
    handleZoom(factor);
  }, [handleZoom]);

  // 鼠标拖拽平移
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
      startX: e.clientX,
      startY: e.clientY,
    };
  }, [position]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaX = Math.abs(e.clientX - dragStartRef.current.startX);
    const deltaY = Math.abs(e.clientY - dragStartRef.current.startY);
    if (deltaX > 4 || deltaY > 4) {
      hasDraggedRef.current = true;
    }
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 点击背景空白处关闭
  const handleBackdropClick = (e) => {
    if (e.target === containerRef.current && !hasDraggedRef.current) {
      onClose();
    }
  };

  // 快捷键支持（空格/方向键切换原图与译图，Escape 退出）
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      } else if (
        (e.key === " " || e.key === "ArrowLeft" || e.key === "ArrowRight") &&
        translatedUrl
      ) {
        e.preventDefault();
        setActiveTab((prev) => (prev === "source" ? "translated" : "source"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, translatedUrl]);

  // 下载当前查看的图片
  const handleDownloadCurrent = () => {
    if (!currentUrl) return;
    const anchor = document.createElement("a");
    anchor.href = currentUrl;
    const base = filename.replace(/\.[^.]+$/, "");
    anchor.download = `${base}-${activeTab === "translated" ? "translated" : "source"}.png`;
    anchor.click();
  };

  return (
    <Dialog
      fullScreen
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          bgcolor: "rgba(0, 0, 0, 0.65)",
          color: "#fff",
          backdropFilter: "blur(8px)",
          overflow: "hidden",
          border: "none",
          boxShadow: "none",
        },
      }}
    >
      {/* 顶部居中悬浮胶囊工具栏 */}
      <Box
        sx={{
          position: "absolute",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          bgcolor: "rgba(24, 24, 27, 0.75)",
          backdropFilter: "blur(14px)",
          borderRadius: 9999,
          p: 0.5,
          px: 1,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
          border: "none",
        }}
      >
        {/* 原图 / 译图 对比切换（存在译图时呈现 ToggleButtonGroup，否则展示标题提示） */}
        {translatedUrl ? (
          <>
            <ToggleButtonGroup
              size="small"
              value={activeTab}
              exclusive
              onChange={(e, val) => val && setActiveTab(val)}
              sx={{
                bgcolor: "transparent",
                "& .MuiToggleButton-root": {
                  color: "rgba(255, 255, 255, 0.75)",
                  border: "none",
                  px: 1.75,
                  py: 0.4,
                  fontSize: 13,
                  fontWeight: 500,
                  borderRadius: 9999,
                  textTransform: "none",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    bgcolor: "rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                  },
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "#fff",
                    fontWeight: 600,
                    "&:hover": {
                      bgcolor: "primary.dark",
                    },
                  },
                },
              }}
            >
              <ToggleButton value="source">{i18n("source_image_title", "原图预览")}</ToggleButton>
              <ToggleButton value="translated">{i18n("translated_image_title", "译图结果")}</ToggleButton>
            </ToggleButtonGroup>
            <Divider
              orientation="vertical"
              flexItem
              sx={{
                borderColor: "rgba(255, 255, 255, 0.18)",
                my: 0.75,
                mx: 0.5,
              }}
            />
          </>
        ) : (
          <>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.85)",
                px: 1.5,
                fontSize: 13,
              }}
            >
              {i18n("source_image_title", "原图预览")}
            </Typography>
            <Divider
              orientation="vertical"
              flexItem
              sx={{
                borderColor: "rgba(255, 255, 255, 0.18)",
                my: 0.75,
                mx: 0.5,
              }}
            />
          </>
        )}

        {/* 极简缩放操作按钮：[-] [↺] [+] */}
        <IconButton
          size="small"
          color="inherit"
          title={i18n("zoom_out", "缩小")}
          onClick={() => handleZoom(0.85)}
          sx={{
            color: "rgba(255, 255, 255, 0.85)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)", color: "#fff" },
            p: 0.75,
          }}
        >
          <RemoveRoundedIcon fontSize="small" />
        </IconButton>

        <IconButton
          size="small"
          color="inherit"
          title={i18n("reset_zoom", "复位 (1:1)")}
          onClick={handleReset}
          sx={{
            color: "rgba(255, 255, 255, 0.85)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)", color: "#fff" },
            p: 0.75,
          }}
        >
          <RestartAltRoundedIcon fontSize="small" />
        </IconButton>

        <IconButton
          size="small"
          color="inherit"
          title={i18n("zoom_in", "放大")}
          onClick={() => handleZoom(1.15)}
          sx={{
            color: "rgba(255, 255, 255, 0.85)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)", color: "#fff" },
            p: 0.75,
          }}
        >
          <AddRoundedIcon fontSize="small" />
        </IconButton>

        {/* 缩放比例数值 */}
        <Typography
          variant="caption"
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255, 255, 255, 0.8)",
            minWidth: 42,
            textAlign: "center",
            userSelect: "none",
            px: 0.5,
          }}
        >
          {`${Math.round(scale * 100)}%`}
        </Typography>

        <Divider
          orientation="vertical"
          flexItem
          sx={{
            borderColor: "rgba(255, 255, 255, 0.18)",
            my: 0.75,
            mx: 0.5,
          }}
        />

        {/* 保存图片按钮 */}
        <IconButton
          size="small"
          color="inherit"
          title={i18n("download_image", "保存图片")}
          onClick={handleDownloadCurrent}
          sx={{
            color: "rgba(255, 255, 255, 0.85)",
            "&:hover": { bgcolor: "rgba(255, 255, 255, 0.12)", color: "#fff" },
            p: 0.75,
          }}
        >
          <FileDownloadRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* 右上角独立悬浮圆形关闭按钮 */}
      <IconButton
        color="inherit"
        title={i18n("close", "关闭 (Esc)")}
        onClick={onClose}
        sx={{
          position: "absolute",
          top: 24,
          right: 28,
          zIndex: 20,
          bgcolor: "rgba(24, 24, 27, 0.75)",
          backdropFilter: "blur(14px)",
          color: "rgba(255, 255, 255, 0.9)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
          border: "none",
          width: 40,
          height: 40,
          transition: "all 0.18s ease",
          "&:hover": {
            bgcolor: "rgba(45, 45, 52, 0.9)",
            color: "#fff",
            transform: "scale(1.05)",
          },
        }}
      >
        <CloseRoundedIcon sx={{ fontSize: 20 }} />
      </IconButton>

      {/* 图片主展示区（支持平移、滚轮缩放与点击背景退出） */}
      <Box
        ref={containerRef}
        onClick={handleBackdropClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleReset}
        sx={{
          flex: 1,
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          position: "relative",
        }}
      >
        {currentUrl && (
          <Box
            component="img"
            src={currentUrl}
            alt="大图查看"
            draggable={false}
            sx={{
              maxWidth: "88vw",
              maxHeight: "82vh",
              objectFit: "contain",
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: isDragging ? "none" : "transform 0.08s ease-out",
              pointerEvents: "none",
              borderRadius: 2,
              boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.65)",
              border: "none",
            }}
          />
        )}

        {/* 底部操作说明浮层 */}
        <Box
          sx={{
            position: "absolute",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            bgcolor: "rgba(24, 24, 27, 0.75)",
            backdropFilter: "blur(14px)",
            px: 2.5,
            py: 0.75,
            borderRadius: 9999,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            border: "none",
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: "rgba(255, 255, 255, 0.8)", fontWeight: 500 }}
          >
            {translatedUrl
              ? i18n(
                  "viewer_hint_with_tab",
                  "滚轮缩放 · 拖拽平移 · 双击复位 · 空格键快速切换原图与译图"
                )
              : i18n("viewer_hint", "滚轮缩放 · 拖拽平移 · 双击复位")}
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}
