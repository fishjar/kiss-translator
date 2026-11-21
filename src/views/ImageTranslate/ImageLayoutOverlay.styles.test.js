import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { alpha, createTheme } from "@mui/material/styles";
import ImageLayoutOverlay from "./ImageLayoutOverlay";
import { useIconAccent } from "../../hooks/useIconAccent";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 行为断言口径：不读源码、不做字符串/出现次数匹配，直接渲染组件验证
// 实际输出的 fill/stroke 属性值。期望值经同一运行时链路计算（单值口径：
// 禁用灰 alpha(grey[800],0.15) 填充＋stroke＋
// badge 同用单值 grey[800]；禁用态序号文字对该灰底取 getContrastText 前景；
// 启用态走 useIconAccent 的深调主色族）。
const theme = createTheme();

const REGIONS = [
  {
    bbox: [10, 10, 100, 50],
    polygon: [
      [10, 10],
      [100, 10],
      [100, 50],
      [10, 50],
    ],
    enabled: true,
  },
  {
    bbox: [110, 10, 200, 50],
    polygon: [
      [110, 10],
      [200, 10],
      [200, 50],
      [110, 50],
    ],
    enabled: false,
  },
];

let accentPrimary;
let accentOnPrimary;
function AccentProbe() {
  const accent = useIconAccent().accent;
  accentPrimary = accent.primary;
  accentOnPrimary = accent.onPrimary;
  return null;
}

function renderOverlay() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <>
        <AccentProbe />
        <ImageLayoutOverlay
          regions={REGIONS}
          imageRect={{ left: 0, top: 0, width: 210, height: 60 }}
          naturalWidth={210}
          naturalHeight={60}
        />
      </>
    );
  });
  return { container, unmount: () => act(() => root.unmount()) };
}

describe("image layout overlay disabled grey tokenization", () => {
  it("fills enabled polygon with translucent accent and disabled with translucent grey", () => {
    const { container, unmount } = renderOverlay();
    try {
      // DOM 序＝绘制序：[选中衬底(fill none), 选中内核, 禁用内核]。
      const polygons = [...container.querySelectorAll("polygon")];
      expect(polygons).toHaveLength(3);
      expect(polygons[0].getAttribute("fill")).toBe("none");
      expect(polygons[1].getAttribute("fill")).toBe(alpha(accentPrimary, 0.14));
      expect(polygons[2].getAttribute("fill")).toBe(
        alpha(theme.palette.grey[800], 0.15)
      );
    } finally {
      unmount();
      container.remove();
    }
  });

  it("underlays the selected stroke with onPrimary and strokes polygon with accent/grey", () => {
    const { container, unmount } = renderOverlay();
    try {
      // DOM 序＝绘制序（SVG 先绘在下）：[选中衬底, 选中内核, 禁用内核]。
      const [underlay, enabledPolygon, disabledPolygon] = [
        ...container.querySelectorAll("polygon"),
      ];
      expect(underlay.getAttribute("fill")).toBe("none");
      expect(underlay.getAttribute("stroke")).toBe(accentOnPrimary);
      expect(underlay.getAttribute("stroke-width")).toBe("4");
      expect(enabledPolygon.getAttribute("stroke")).toBe(accentPrimary);
      expect(enabledPolygon.getAttribute("stroke-width")).toBe("2");
      expect(disabledPolygon.getAttribute("stroke")).toBe(
        theme.palette.grey[800]
      );
      // 角标徽章与 polygon 描边同源：启用徽章走 accent，禁用徽章与
      // 禁用描边共用单值 grey[800]，不分级。
      const badgeRects = [...container.querySelectorAll("rect")];
      expect(badgeRects).toHaveLength(2);
      expect(badgeRects[0].getAttribute("fill")).toBe(accentPrimary);
      expect(badgeRects[1].getAttribute("fill")).toBe(theme.palette.grey[800]);
    } finally {
      unmount();
      container.remove();
    }
  });

  it("renders badge text foreground white when enabled and contrast-fit over grey when disabled", () => {
    const { container, unmount } = renderOverlay();
    try {
      const texts = [...container.querySelectorAll("text")];
      expect(texts).toHaveLength(2);
      expect(texts[0].getAttribute("fill")).toBe("#ffffff");
      expect(texts[1].getAttribute("fill")).toBe(
        theme.palette.getContrastText(theme.palette.grey[800])
      );
    } finally {
      unmount();
      container.remove();
    }
  });
});
