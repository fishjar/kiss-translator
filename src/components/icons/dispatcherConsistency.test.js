/* eslint-disable testing-library/no-container */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { GLYPH_META } from "./lucide";
import { setIconStyleSnapshot } from "../../styles/m3";
import * as dispatcher from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 轻量一致性覆盖：GLYPH_META 登记的每个图标在分发器导出中必须存在，且在
// mui 与 lucide 两种图标风格快照下均可渲染为有效 svg（含子元素）——分发
// 器缺省 lucide 路径此前零覆盖，双形态各渲染一次补齐。
describe("icons dispatcher consistency", () => {
  afterEach(() => {
    // 无论成败恢复全局快照为缺省 lucide（与 OptionsTheme.test.js 同纪律）
    setIconStyleSnapshot("lucide");
  });

  test.each(GLYPH_META.map((meta) => [meta.name, meta]))(
    "%s is exported by the dispatcher and renders as a valid svg in both icon styles",
    (name, meta) => {
      const Comp = dispatcher[name];
      // MUI 经静态 muiName 识别 SvgIcon（InputAdornment 等装饰位按此判定），
      // 分发器包装后必须补回该标识，否则被当作普通元素
      expect(Comp.muiName).toBe("SvgIcon");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      try {
        // mui 形态：MUI 件 svg 直接挂 path（fill 实心），无描边 g 组。
        // 快照切换包裹 act：挂载中的组件经 useSyncExternalStore 订阅快照
        // store，act 外改快照会触发 act 警告刷屏（语义不变，仅批处理）
        act(() => {
          setIconStyleSnapshot("mui");
        });
        act(() => {
          root.render(<Comp data-testid={meta.kebab} />);
        });
        const muiSvg = container.querySelector("svg");
        expect(muiSvg).not.toBeNull();
        expect(muiSvg.children.length).toBeGreaterThan(0);
        // 分发器判别锁：mui 快照下渲染的是 MUI 件（fill 实心 path），
        // 不得混入 lucide 件的描边 g 组——与下方 lucide 正向锁同选择器
        // 配对，双向互证两形态可区分（分发器 mui 分支错挂 lucide 件即红）
        expect(muiSvg.querySelector("g[stroke='currentColor']")).toBeNull();

        // lucide 形态：分发器件经 useSyncExternalStore 订阅快照 store，
        // act 内切快照后已挂载组件必须自动重渲染为 lucide 形态——不再次
        // render，订阅断裂即红。本仓库 lucide 件经 createSvgIcon 包装，
        // stroke 在内层 g 而非 svg 根
        act(() => {
          setIconStyleSnapshot("lucide");
        });
        const lucideSvg = container.querySelector("svg");
        expect(lucideSvg).not.toBeNull();
        expect(lucideSvg.children.length).toBeGreaterThan(0);
        expect(
          lucideSvg.querySelector("g[stroke='currentColor']")
        ).not.toBeNull();
      } finally {
        act(() => root.unmount());
        container.remove();
      }
    }
  );

  test("keeps brand-distinct lucide glyphs for GitHub and Telegram", () => {
    // lucide 风格下 GitHubIcon 曾复用 external-link 通用字形（GLYPH_META
    // kebab=external-link，与 OpenInNewIcon 同形）——品牌图形换为 lucide
    // 历史 github 描边路径；Telegram 的 lucide 上游无品牌图标，send 纸
    // 飞机即 telegram 可辨识图形（保留 send 形态）。断言锁品牌替换不漂移。
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const renderPaths = (Comp) => {
      act(() => {
        root.render(<Comp />);
      });
      return Array.from(container.querySelectorAll("path"))
        .map((p) => p.getAttribute("d"))
        .join("\n");
    };
    try {
      const githubD = renderPaths(dispatcher.GitHubIcon);
      // 不再是 external-link 通用形（旧形首段 M15 3h6v6），且含 lucide
      // github 品牌路径特征段
      expect(githubD).not.toContain("M15 3h6v6");
      expect(githubD).toContain("c3 0 6-2 6-5.5");
      const telegramD = renderPaths(dispatcher.TelegramIcon);
      // telegram 保留 send 纸飞机形态（lucide 上游无 telegram 品牌图标）
      expect(telegramD).toContain("M14.536 21.686");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
