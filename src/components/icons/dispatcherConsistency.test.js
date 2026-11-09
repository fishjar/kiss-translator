// GLYPH_META ↔ 分发器导出 ↔ 渲染成功 三角一致锁：遍历生成器 emit 的
// GLYPH_META 全量条目，断言分发器逐名导出且 MUI/Lucide 两风格渲染均不抛错。
// 与 dispatcherCoverage（Phase A 增量名单逐字等价）及 consumerDispatchPurity
// （分发纯性）分工不同：本文件只锁三角一致与 SSR 快照渲染可用。
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import * as Dispatcher from "./index";
import { GLYPH_META } from "./lucide";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderSvg = (Icon) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Icon />);
  });
  const svg = container.querySelector("svg");
  act(() => root.unmount());
  container.remove();
  return svg;
};

describe("dispatcher ↔ GLYPH_META ↔ render consistency", () => {
  afterEach(() => {
    setIconStyleSnapshot("lucide");
  });

  test("every GLYPH_META entry is exported by the dispatcher and renders in both styles", () => {
    expect(GLYPH_META.length).toBeGreaterThan(0);
    for (const { name, mui } of GLYPH_META) {
      const Icon = Dispatcher[name];
      // 三角第一边：生成器元数据 ↔ 分发器导出
      expect(Icon).toBeDefined();
      // 三角第二边：两风格渲染均产出 svg 且不抛错
      setIconStyleSnapshot("lucide");
      const lucideSvg = renderSvg(Icon);
      expect(lucideSvg).not.toBeNull();
      expect(lucideSvg.tagName.toLowerCase()).toBe("svg");
      setIconStyleSnapshot("mui");
      const muiSvg = renderSvg(Icon);
      expect(muiSvg).not.toBeNull();
      expect(muiSvg.tagName.toLowerCase()).toBe("svg");
      // mui 分支渲染的是登记的 MUI 模块基名（GitHub 品牌例外亦走 1:1 缺省回落）
      expect(muiSvg.getAttribute("data-testid")).toBe(`${mui}Icon`);
    }
  });

  test("dispatcher exports nothing beyond GLYPH_META", () => {
    const metaNames = new Set(GLYPH_META.map(({ name }) => name));
    const extra = Object.keys(Dispatcher).filter((name) => !metaNames.has(name));
    expect(extra).toEqual([]);
  });

  test("SSR snapshot rendering works without getServerSnapshot errors", () => {
    // useSyncExternalStore 服务端渲染必须提供 getServerSnapshot 第三参，
    // 否则 renderToString 对每个图标抛 "Missing getServerSnapshot"。
    for (const { name } of GLYPH_META) {
      const Icon = Dispatcher[name];
      const html = renderToString(React.createElement(Icon));
      expect(html).toContain("<svg");
    }
  });
});
