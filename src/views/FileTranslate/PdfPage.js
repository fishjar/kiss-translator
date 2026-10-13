import { useEffect, useRef, useState } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import { PDFJS } from "../../libs/pdf/pdfDocument";
import "pdfjs-dist/web/pdf_viewer.css";

const REGION_TYPE_LABELS = {
  paragraph: ["pdf_region_body", "正文"],
  text: ["pdf_region_body", "正文"],
  content: ["pdf_region_body", "正文"],
  abstract: ["pdf_region_abstract", "摘要"],
  doc_title: ["pdf_region_document_title", "文档标题"],
  paragraph_title: ["pdf_region_title", "标题"],
  heading: ["pdf_region_title", "标题"],
  figure_title: ["pdf_region_figure_title", "图标题"],
  table: ["pdf_region_table", "表格"],
  chart: ["pdf_region_chart", "图表"],
  formula: ["pdf_region_formula", "公式"],
  formula_number: ["pdf_region_formula_number", "公式序号"],
  image: ["pdf_region_image", "图片"],
  header: ["pdf_region_header", "页眉"],
  footer: ["pdf_region_footer", "页脚"],
  number: ["pdf_region_page_number", "页码"],
  reference: ["pdf_region_reference", "参考文献"],
  reference_content: ["pdf_region_reference_content", "文献内容"],
  footnote: ["pdf_region_footnote", "脚注"],
  vision_footnote: ["pdf_region_footnote", "脚注"],
  algorithm: ["pdf_region_algorithm", "算法"],
  aside_text: ["pdf_region_aside", "旁注"],
  seal: ["pdf_region_seal", "印章"],
};

function getRegionLabel(type, label, i18n) {
  const entry = REGION_TYPE_LABELS[type] || REGION_TYPE_LABELS[label];
  return entry
    ? i18n?.(entry[0], entry[1]) || entry[1]
    : type || label || i18n?.("pdf_region_generic", "区域") || "区域";
}

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
                    ? "1.5px solid #1976d2"
                    : "1.5px dashed #9e9e9e",
                  backgroundColor: isEnabled
                    ? "rgba(25, 118, 210, 0.08)"
                    : "rgba(158, 158, 158, 0.15)",
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
                    backgroundColor: isEnabled ? "#1976d2" : "#757575",
                    color: "#fff",
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
              background: "#ffcc0038",
              outline: "2px solid #f5b400",
              zIndex: 4,
            }}
          />
        ))}
    </div>
  );
}
