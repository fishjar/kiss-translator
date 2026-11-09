/**
 * @file ImageLayoutOverlay.js
 * @description 在原图或截图选区上方渲染交互式 SVG 矢量线框层，支持点击切换选中/取消选中。
 */

import React from "react";

export default function ImageLayoutOverlay({
  regions = [],
  imageRect = null,
  naturalWidth = 1,
  naturalHeight = 1,
  visible = true,
  isFixed = false,
  onToggleRegion,
}) {
  if (!visible || !regions?.length || !imageRect) return null;

  const left =
    (imageRect.left ?? imageRect.x ?? 0) + (isFixed ? 0 : window.scrollX);
  const top =
    (imageRect.top ?? imageRect.y ?? 0) + (isFixed ? 0 : window.scrollY);
  const width = imageRect.width ?? imageRect.w ?? 0;
  const height = imageRect.height ?? imageRect.h ?? 0;

  if (width <= 0 || height <= 0) return null;

  const viewBoxW = naturalWidth || width;
  const viewBoxH = naturalHeight || height;

  return (
    <svg
      className="kt-image-layout-overlay notranslate"
      viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
      style={{
        position: isFixed ? "fixed" : "absolute",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 2147483638,
        pointerEvents: "none",
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      {regions.map((region, index) => {
        const enabled = region.enabled !== false;
        let poly = region.polygon || region.poly;
        if ((!poly || poly.length < 3) && region.bbox) {
          const [l, t, r, b] = region.bbox;
          poly = [
            [l, t],
            [r, t],
            [r, b],
            [l, b],
          ];
        }
        if (!poly || poly.length < 3) return null;

        const points = poly.map(([x, y]) => `${x},${y}`).join(" ");

        // 计算角标坐标
        const [minX, minY] = poly.reduce(
          ([mx, my], [x, y]) => [Math.min(mx, x), Math.min(my, y)],
          [Infinity, Infinity]
        );

        return (
          <g
            key={index}
            style={{ pointerEvents: "all", cursor: "pointer" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleRegion?.(index);
            }}
          >
            <polygon
              points={points}
              fill={
                enabled
                  ? "rgba(25, 118, 210, 0.14)"
                  : "rgba(158, 158, 158, 0.15)"
              }
              stroke={enabled ? "#1976d2" : "#9e9e9e"}
              strokeDasharray={enabled ? undefined : "4 3"}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              style={{ transition: "fill 0.15s ease, stroke 0.15s ease" }}
            >
              <title>{`${region.type || "region"} #${index + 1} (${enabled ? "已选中" : "未选中"})`}</title>
            </polygon>

            {/* 序号徽章 */}
            {Number.isFinite(minX) && Number.isFinite(minY) && (
              <g pointerEvents="none">
                <rect
                  x={minX}
                  y={minY}
                  width="22"
                  height="16"
                  fill={enabled ? "#1976d2" : "#757575"}
                  rx="3"
                />
                <text
                  x={minX + 11}
                  y={minY + 12}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="system-ui, sans-serif"
                >
                  {index + 1}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
