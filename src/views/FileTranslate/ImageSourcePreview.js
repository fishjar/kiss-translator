import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";

export const hasImagePolygon = (poly) => poly?.length >= 3 && poly.every((point) =>
    Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]));

export default function ImageSourcePreview({ src, alt, poly }) {
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
  const valid = hasImagePolygon(poly);
  return (
    <Box ref={container} sx={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
      <Box component="img" ref={image} src={src} alt={alt} onLoad={measure}
        sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 1, boxShadow: 1 }} />
      {bounds && valid && (
        <Box component="svg" aria-hidden="true" data-testid="image-region-overlay"
          viewBox={`0 0 ${bounds.naturalWidth} ${bounds.naturalHeight}`}
          sx={{ position: "absolute", left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, pointerEvents: "none", color: "primary.main" }}>
          <polygon points={poly.map((point) => point.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </Box>
      )}
    </Box>
  );
}
