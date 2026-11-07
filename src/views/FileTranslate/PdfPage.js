import { useEffect, useRef, useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { alpha, useTheme } from "@mui/material/styles";
import { PDFJS } from "../../libs/pdf/pdfDocument";
import { getRegionLabel } from "./layoutRegionLabels";
import "pdfjs-dist/web/pdf_viewer.css";

export default function PdfPage({
  pdf,
  number,
  width,
  zoom,
  scrollRoot,
  highlight,
  onSize,
  regions = [],
  showLayout = false,
  onToggleRegion,
  disabled = false,
  recognizingRegionId,
  i18n,
}) {
  const container = useRef(null),
    canvas = useRef(null),
    text = useRef(null),
    [visible, setVisible] = useState(false),
    [size, setSize] = useState({ width: 612, height: 792 }),
    [error, setError] = useState("");
  const theme = useTheme();
  const enabledFill = alpha(theme.palette.primary.main, 0.08);
  const disabledFill = alpha(theme.palette.grey[500], 0.15);
  // PDF 容器底为白色（background:"white"），浅色主色下 primary.main 对比不足；
  // 取 augmentColor 自动派生的更暗档作描边色（不取 contrastText——那是主色底
  // 上的文字对比色，不是描边色）。
  const enabledStroke = theme.palette.primary.dark;
  const disabledStroke = theme.palette.grey[500];
  useEffect(() => {
    let active = true;
    pdf
      .getPage(number)
      .then((page) => {
        if (active) {
          const v = page.getViewport({ scale: 1 });
          setSize({ width: v.width, height: v.height });
          onSize?.(number, { width: v.width, height: v.height });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [pdf, number, onSize]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { root: scrollRoot, rootMargin: "800px 0px" }
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [scrollRoot]);
  const scale = Math.max(0.1, (width - 32) / size.width) * zoom,
    displayWidth = size.width * scale,
    displayHeight = size.height * scale;
  useEffect(() => {
    if (!visible) {
      if (canvas.current) canvas.current.width = canvas.current.height = 0;
      text.current?.replaceChildren();
      return;
    }
    let active = true,
      renderTask,
      layer;
    (async () => {
      const page = await pdf.getPage(number);
      if (!active) return;
      const ratio = window.devicePixelRatio || 1,
        renderScale = Math.min(
          scale * ratio,
          Math.sqrt(12000000 / (size.width * size.height))
        ),
        viewport = page.getViewport({ scale: renderScale });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      renderTask = page.render({
        canvas: canvas.current,
        canvasContext: canvas.current.getContext("2d"),
        viewport,
      });
      await renderTask.promise;
      if (!active) return;
      const content = await page.getTextContent();
      if (!active) return;
      text.current.replaceChildren();
      layer = new PDFJS.TextLayer({
        textContentSource: content,
        container: text.current,
        viewport: page.getViewport({ scale }),
      });
      await layer.render();
    })().catch((e) => {
      if (active && e.name !== "RenderingCancelledException")
        setError(e.message);
    });
    return () => {
      active = false;
      renderTask?.cancel();
      layer?.cancel();
    };
  }, [pdf, number, scale, visible, size.width, size.height]);
  return (
    <div
      ref={container}
      data-pdf-page={number}
      data-scale={scale}
      style={{
        width: displayWidth,
        height: displayHeight,
        position: "relative",
        margin: "16px auto 24px",
        background: "white",
        boxShadow: "0 2px 8px #0002",
        "--scale-factor": scale,
        "--user-unit": 1,
        "--total-scale-factor": scale,
      }}
    >
      <canvas
        ref={canvas}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      <div
        ref={text}
        className="textLayer"
        style={{ position: "absolute", inset: 0 }}
      />
      {!visible && (
        <span
          style={{ position: "absolute", top: 12, left: 12, color: "#666" }}
        >
          {(i18n?.("pdf_source_page", "第 $1 页") || "第 $1 页").replace(
            "$1",
            number
          )}
        </span>
      )}
      {error && (
        <span style={{ position: "absolute", top: 12, left: 12, color: "red" }}>
          {error}
        </span>
      )}
      {showLayout && regions && regions.length > 0 && (
        <div
          className="kt-pdf-layout-layer"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {regions.map((r) => {
            const isEnabled = r.enabled !== false;
            const x = r.bbox[0] * scale;
            const y = r.bbox[1] * scale;
            const w = Math.max(6, (r.bbox[2] - r.bbox[0]) * scale);
            const h = Math.max(6, (r.bbox[3] - r.bbox[1]) * scale);
            const typeLabel = getRegionLabel(r.type, r.label, i18n);

            return (
              <div
                key={r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) onToggleRegion?.(number, r.id);
                }}
                title={`${typeLabel} - ${
                  recognizingRegionId === r.id
                    ? i18n?.("pdf_recognizing_region", "正在识别") || "正在识别"
                    : isEnabled
                      ? i18n?.(
                          "pdf_region_click_exclude",
                          "点击排除文本识别"
                        ) || "点击排除文本识别"
                      : i18n?.(
                          "pdf_region_click_include",
                          "已排除，点击恢复识别"
                        ) || "已排除，点击恢复识别"
                }`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  pointerEvents: "auto",
                  cursor: disabled ? "default" : "pointer",
                  border: isEnabled
                    ? `1.5px solid ${enabledStroke}`
                    : `1.5px dashed ${disabledStroke}`,
                  backgroundColor: isEnabled ? enabledFill : disabledFill,
                  boxSizing: "border-box",
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 2px)",
                    left: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    maxWidth: Math.max(14, displayWidth - x),
                    fontSize: "10px",
                    lineHeight: "12px",
                    padding: "1px 4px",
                    backgroundColor: isEnabled
                      ? theme.palette.primary.main
                      : theme.palette.grey[600],
                    // 前景随主题：启用态对 primary.main 取主题对比文字色，禁用态对该
                    // 灰底取最优前景；二者均不硬编码白色，避免浅色主题下白字不可辨。
                    color: isEnabled
                      ? theme.palette.primary.contrastText
                      : theme.palette.getContrastText(theme.palette.grey[600]),
                    borderRadius: "3px 3px 0 0",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    opacity: 0.9,
                  }}
                >
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {typeLabel}
                    {!isEnabled &&
                      ` (${i18n?.("pdf_region_excluded", "排除") || "排除"})`}
                  </span>
                  {recognizingRegionId === r.id && (
                    <CircularProgress
                      size={10}
                      color="inherit"
                      aria-label={
                        i18n?.("pdf_recognizing_region", "正在识别") ||
                        "正在识别"
                      }
                      sx={{ flexShrink: 0 }}
                    />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {(Array.isArray(highlight) ? highlight : highlight ? [highlight] : [])
        .filter(
          (fragment) =>
            fragment.page === number &&
            fragment.bbox?.length === 4 &&
            fragment.bbox.every(Number.isFinite) &&
            fragment.bbox[2] > fragment.bbox[0] &&
            fragment.bbox[3] > fragment.bbox[1]
        )
        .map((fragment, index) => (
          <div
            key={index}
            className="kt-pdf-source-highlight"
            style={{
              position: "absolute",
              pointerEvents: "none",
              left: fragment.bbox[0] * scale,
              top: fragment.bbox[1] * scale,
              width: (fragment.bbox[2] - fragment.bbox[0]) * scale,
              height: (fragment.bbox[3] - fragment.bbox[1]) * scale,
              // accent-exempt: source-highlight 为「源文记号黄」域语义（荧光笔标记，
              // 跨主题恒定），与布局覆盖层 primary 强调色域不同，不随主题令牌流动。
              background: "#ffcc0038",
              outline: "2px solid #f5b400",
              zIndex: 4,
            }}
          />
        ))}
    </div>
  );
}
