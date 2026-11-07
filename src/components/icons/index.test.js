import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import MuiTranslate from "@mui/icons-material/Translate";
import { TranslateIcon } from "./index";
import {
  AutoAwesomeIcon,
  BoltIcon,
  Brightness4Icon,
  Brightness7Icon,
  ExtensionIcon,
  FormatSizeRoundedIcon,
  GitHubIcon,
  InputIcon,
  IntegrationInstructionsIcon,
  RuleIcon,
  SettingsIcon,
  TelegramIcon,
  TerminalIcon,
  PowerSettingsNewIcon,
} from "./index";
import { TranslateIcon as LucideTranslateIcon, GLYPH_META } from "./lucide";
import { setIconStyleSnapshot } from "../../styles/m3";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Lucide 字形为多 path（如 languages 含数条），故比较整段 svg innerHTML 而非首 path d；
// MUI 经典为单/少 path，innerHTML 亦能可靠区分两分支。
const renderPath = (Icon) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Icon />);
  });
  const markup = container.querySelector("svg").innerHTML;
  act(() => root.unmount());
  container.remove();
  return markup;
};

describe("icon style dispatcher", () => {
  afterEach(() => {
    setIconStyleSnapshot("lucide");
  });

  test("renders MUI glyphs when iconStyle is mui", () => {
    setIconStyleSnapshot("mui");
    const d = renderPath(TranslateIcon);
    expect(d).toBe(renderPath(MuiTranslate));
    expect(d).not.toBe(renderPath(LucideTranslateIcon));
  });

  test("renders lucide glyphs by default", () => {
    expect(renderPath(TranslateIcon)).toBe(renderPath(LucideTranslateIcon));
  });

  test("forwards ref to the rendered svg node", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = React.createRef();
    act(() => {
      root.render(<TranslateIcon ref={ref} />);
    });
    // forwardRef 契约：ref 落到最终渲染的 svg 根节点（lucide 与 MUI 分支一致）。
    expect(ref.current).toBeInstanceOf(SVGSVGElement);
    act(() => root.unmount());
    container.remove();
  });

  test("subscription updates the rendered icon after mount", () => {
    // PR #17 评审 Nitpick #3：既有两条用例均在挂载前 setIconStyleSnapshot，
    // 未覆盖 useSyncExternalStore 订阅在挂载后的响应——本用例补该缺口。
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    setIconStyleSnapshot("lucide");
    act(() => root.render(<TranslateIcon />));
    expect(container.querySelector("svg").innerHTML).toBe(
      renderPath(LucideTranslateIcon)
    );
    act(() => setIconStyleSnapshot("mui"));
    expect(container.querySelector("svg").innerHTML).toBe(
      renderPath(MuiTranslate)
    );
    act(() => root.unmount());
    container.remove();
  });

  test("FavoriteBorder lucide half maps to the plain heart and differs from Favorite by fill", () => {
    const meta = GLYPH_META.find((m) => m.name === "FavoriteBorderIcon");
    expect(meta.kebab).toBe("heart");
    const favoriteMeta = GLYPH_META.find((m) => m.name === "FavoriteIcon");
    expect(favoriteMeta.kebab).toBe("heart");
    expect(meta.fill).toBe("none");
    expect(favoriteMeta.fill).toBe("currentColor");
    expect(favoriteMeta.mui).toBe("Favorite");
    expect(meta.mui).toBe("FavoriteBorder");
  });

  test("newly dispatched keys have entries in both assembly sources", () => {
    // D 项回接守卫：14 个新增键（F6-F8 取证）在 GLYPH_META 与分发器装配
    // 导出名中均须在场；mui 分支覆盖缺口由本守卫补位（不扩 ADDED 37 清单）。
    const NEW_KEYS = [
      "AutoAwesomeIcon",
      "BoltIcon",
      "Brightness4Icon",
      "Brightness7Icon",
      "ExtensionIcon",
      "FormatSizeRoundedIcon",
      "GitHubIcon",
      "InputIcon",
      "IntegrationInstructionsIcon",
      "RuleIcon",
      "SettingsIcon",
      "TelegramIcon",
      "TerminalIcon",
      "PowerSettingsNewIcon",
    ];
    const metaNames = new Set(GLYPH_META.map(({ name }) => name));
    // 分发器实际导出同步锁定：GLYPH_META 在场 ≠ 装配导出在场，双闸合一。
    const dispatcherExports = {
      AutoAwesomeIcon,
      BoltIcon,
      Brightness4Icon,
      Brightness7Icon,
      ExtensionIcon,
      FormatSizeRoundedIcon,
      GitHubIcon,
      InputIcon,
      IntegrationInstructionsIcon,
      RuleIcon,
      SettingsIcon,
      TelegramIcon,
      TerminalIcon,
      PowerSettingsNewIcon,
    };
    for (const name of NEW_KEYS) {
      expect(metaNames.has(name)).toBe(true);
      expect(dispatcherExports[name]).toBeDefined();
    }
  });
});
