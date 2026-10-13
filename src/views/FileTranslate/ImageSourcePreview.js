import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import { hasCompleteCoordinates } from "../../fileTranslation/recognition";

export const hasImagePolygon = (poly) => hasCompleteCoordinates([{ text: "region", poly }]);

export default function ImageSourcePreview({
  src, alt, rows = [], showRegions = true, disabled = false,
  onToggleRegion, regionLabel, selectLabel, excludeLabel,
}) {
  const container = useRef(null);
  const image = useRef(null);
  const [bounds, setBounds] = useState(null);
  const measure = () => {
    const element = image.current;
    if (!element?.naturalWidth || !container.current) return;
    const rect = element.getBoundingClientRect();
    const parent = container.current.getBoundingClientRect();
    setBounds({ left: rect.left - parent.left, top: rect.top - parent.top,
      width: rect.width, height: rect.height, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight });
  };
  useEffect(() => {
    setBounds(null);
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(image.current);
    return () => observer.disconnect();
  }, [src]);
  return (
    <Box ref={container} sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
      <Box component="img" ref={image} src={src} alt={alt} onLoad={measure}
        sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 1, boxShadow: 1 }} />
      {bounds && showRegions && rows.some((row) => hasImagePolygon(row.poly)) && (
        <Box component="svg" data-testid="image-region-overlay"
          viewBox={`0 0 ${bounds.naturalWidth} ${bounds.naturalHeight}`}
          sx={{ position: "absolute", left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, pointerEvents: "none", color: "primary.main" }}>
          {rows.map((row, index) => {
            if (!hasImagePolygon(row.poly)) return null;
            const enabled = row.enabled !== false;
            const label = `${regionLabel?.(row, index) || row.source} — ${enabled ? excludeLabel : selectLabel}`;
            const toggle = (event) => {
              event.stopPropagation();
              if (!disabled) onToggleRegion?.(index);
            };
            return (
              <Box component="polygon" key={index} role="button" tabIndex={disabled ? -1 : 0}
                aria-label={label} aria-pressed={enabled} aria-disabled={disabled}
                points={row.poly.map((point) => point.join(",")).join(" ")}
                fill={enabled ? "rgba(25, 118, 210, 0.08)" : "rgba(158, 158, 158, 0.15)"}
                stroke={enabled ? "#1976d2" : "#9e9e9e"} strokeDasharray={enabled ? undefined : "4 3"}
                strokeWidth="1.5" vectorEffect="non-scaling-stroke" onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(event);
                  }
                }}
                sx={{ pointerEvents: "all", outline: "none", cursor: disabled ? "default" : "pointer",
                  "&:focus-visible": { strokeWidth: 3 } }}>
                <title>{label}</title>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
