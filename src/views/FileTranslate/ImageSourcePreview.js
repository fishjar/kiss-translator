import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { alpha, useTheme } from "@mui/material/styles";
import { hasCompleteCoordinates } from "../../fileTranslation/recognition";
import { getRegionLabel } from "./layoutRegionLabels";

export const hasImagePolygon = (poly) =>
  hasCompleteCoordinates([{ text: "region", poly }]);

export default function ImageSourcePreview({
  src,
  alt,
  rows = [],
  showRegions = true,
  disabled = false,
  onToggleRegion,
  regionLabel,
  selectLabel,
  excludeLabel,
  i18n,
}) {
  const container = useRef(null);
  const image = useRef(null);
  const [bounds, setBounds] = useState(null);
  const theme = useTheme();
  // 白底图像上浅色主色的 8% 叠加近乎不可见：填充与描边同取 augmentColor
  // 派生暗档（与 PdfPage.js 白底描边同口径，不取 contrastText——那是主色底
  // 上文字的前景色）；标签配色（primary.main 底 + contrastText 前景）不动。
  const enabledFill = alpha(theme.palette.primary.dark, 0.08);
  const disabledFill = alpha(theme.palette.grey[500], 0.15);
  const enabledStroke = theme.palette.primary.dark;
  const disabledStroke = theme.palette.grey[500];
  const measure = () => {
    const element = image.current;
    if (!element?.naturalWidth || !container.current) return;
    const rect = element.getBoundingClientRect();
    const parent = container.current.getBoundingClientRect();
    setBounds({
      left: rect.left - parent.left,
      top: rect.top - parent.top,
      width: rect.width,
      height: rect.height,
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    });
  };
  useEffect(() => {
    setBounds(null);
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(image.current);
    return () => observer.disconnect();
  }, [src]);
  return (
    <Box
      ref={container}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 0,
      }}
    >
      <Box
        component="img"
        ref={image}
        src={src}
        alt={alt}
        onLoad={measure}
        sx={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          borderRadius: 1,
          boxShadow: 1,
        }}
      />
      {bounds &&
        showRegions &&
        rows.some((row) => hasImagePolygon(row.poly)) && (
          <>
            <Box
              component="svg"
              data-testid="image-region-overlay"
              viewBox={`0 0 ${bounds.naturalWidth} ${bounds.naturalHeight}`}
              sx={{
                position: "absolute",
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
                pointerEvents: "none",
                color: "primary.main",
              }}
            >
              {rows.map((row, index) => {
                if (!hasImagePolygon(row.poly)) return null;
                const enabled = row.enabled !== false;
                const label = `${regionLabel?.(row, index) || row.source} — ${enabled ? excludeLabel : selectLabel}`;
                const toggle = (event) => {
                  event.stopPropagation();
                  if (!disabled) onToggleRegion?.(index);
                };
                return (
                  <Box
                    component="polygon"
                    key={index}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={label}
                    aria-pressed={enabled}
                    aria-disabled={disabled}
                    points={row.poly.map((point) => point.join(",")).join(" ")}
                    fill={enabled ? enabledFill : disabledFill}
                    stroke={enabled ? enabledStroke : disabledStroke}
                    strokeDasharray={enabled ? undefined : "4 3"}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                    onClick={toggle}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(event);
                      }
                    }}
                    sx={{
                      // 禁用态保留指针命中：点击仍由处理器拦截（阻止切换＋
                      // stopPropagation），不穿透到下层图像。
                      pointerEvents: "all",
                      outline: "none",
                      cursor: disabled ? "default" : "pointer",
                      "&:focus-visible": { strokeWidth: 3 },
                    }}
                  >
                    <title>{label}</title>
                  </Box>
                );
              })}
            </Box>
            {rows.map((row, index) => {
              if (!hasImagePolygon(row.poly)) return null;
              const enabled = row.enabled !== false;
              const [left, top] = row.poly.reduce(
                ([x, y], point) => [
                  Math.min(x, point[0]),
                  Math.min(y, point[1]),
                ],
                [Infinity, Infinity]
              );
              const x = (left * bounds.width) / bounds.naturalWidth;
              return (
                <Box
                  component="span"
                  key={index}
                  data-testid="image-layout-type"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled) onToggleRegion?.(index);
                  }}
                  sx={{
                    position: "absolute",
                    left: bounds.left + x,
                    top:
                      bounds.top +
                      (top * bounds.height) / bounds.naturalHeight -
                      2,
                    transform: "translateY(-100%)",
                    display: "flex",
                    alignItems: "center",
                    maxWidth: Math.max(14, bounds.width - x),
                    fontSize: "10px",
                    lineHeight: "12px",
                    padding: "1px 4px",
                    backgroundColor: enabled
                      ? theme.palette.primary.main
                      : theme.palette.grey[600],
                    // 前景随主题：启用态对 primary.main 取主题对比文字色，禁用态对该
                    // 灰底取最优前景；二者均不硬编码白色，避免浅色主题下白字不可辨。
                    color: enabled
                      ? theme.palette.primary.contrastText
                      : theme.palette.getContrastText(theme.palette.grey[600]),
                    borderRadius: "3px 3px 0 0",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                    opacity: 0.9,
                    // 同多边形：禁用态标签仍拦截点击，不穿透。
                    pointerEvents: "auto",
                    cursor: disabled ? "default" : "pointer",
                  }}
                >
                  <span
                    style={{ overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {getRegionLabel(row.type, row.label, i18n)}
                    {!enabled &&
                      ` (${i18n?.("pdf_region_excluded", "排除") || "排除"})`}
                  </span>
                </Box>
              );
            })}
          </>
        )}
    </Box>
  );
}
