import { useEffect, useRef, useState } from "react";
import { PDFJS } from "../../libs/pdf/pdfDocument";
import "pdfjs-dist/web/pdf_viewer.css";

const REGION_TYPE_LABELS = {
  paragraph: "正文",
  text: "正文",
  content: "正文",
  abstract: "摘要",
  doc_title: "文档标题",
  paragraph_title: "标题",
  heading: "标题",
  figure_title: "图标题",
  table: "表格",
  chart: "图表",
  formula: "公式",
  formula_number: "公式序号",
  image: "图片",
  header: "页眉",
  footer: "页脚",
  number: "页码",
  reference: "参考文献",
  reference_content: "文献内容",
  footnote: "脚注",
  vision_footnote: "脚注",
  algorithm: "算法",
  aside_text: "旁注",
  seal: "印章",
};

function getRegionLabel(type, label) {
  return (
    REGION_TYPE_LABELS[type] ||
    REGION_TYPE_LABELS[label] ||
    type ||
    label ||
    "区域"
  );
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
          第 {number} 页
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
            const typeLabel = getRegionLabel(r.type, r.label);

            return (
              <div
                key={r.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRegion?.(number, r.id);
                }}
                title={`${typeLabel} - ${
                  isEnabled ? "点击排除文本识别" : "已排除，点击恢复识别"
                }`}
                style={{
                  position: "absolute",
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  pointerEvents: "auto",
                  cursor: "pointer",
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
                    top: 0,
                    left: 0,
                    fontSize: "10px",
                    lineHeight: "12px",
                    padding: "1px 4px",
                    backgroundColor: isEnabled ? "#1976d2" : "#757575",
                    color: "#fff",
                    borderRadius: "0 0 3px 0",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    opacity: 0.9,
                  }}
                >
                  {typeLabel}
                  {!isEnabled && " (排除)"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {highlight?.page === number && (
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: highlight.bbox[0] * scale,
            top: highlight.bbox[1] * scale,
            width: (highlight.bbox[2] - highlight.bbox[0]) * scale,
            height: (highlight.bbox[3] - highlight.bbox[1]) * scale,
            background: "#ffcc0038",
            outline: "2px solid #f5b400",
            zIndex: 4,
          }}
        />
      )}
    </div>
  );
}
