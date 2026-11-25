import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import MuiTranslate from "@mui/icons-material/Translate";
import {
  TranslateIcon,
  FavoriteIcon,
  FavoriteBorderIcon,
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
import * as LucideIcons from "./lucide";
import { setIconStyleSnapshot } from "../../styles/iconStyleStore";

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

const renderGFill = (Icon) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Icon />);
  });
  const fill = container.querySelector("svg g")?.getAttribute("fill") ?? null;
  act(() => root.unmount());
  container.remove();
  return fill;
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

  test("renders lucide glyphs by default without explicit selection", () => {
    // 出厂默认闸：经隔离注册表（jest.isolateModules）取未执行过任何
    // setIconStyleSnapshot 的模块图——react/react-dom/分发器/lucide 同出
    // 该图，渲染用图内 act/createRoot，不与外层 React 实例混用（混实例
    // 会触发 invalid hook call）。
    let fresh;
    jest.isolateModules(() => {
      fresh = {
        React: require("react"),
        Client: require("react-dom/client"),
        TranslateIcon: require("./index").TranslateIcon,
        LucideTranslateIcon: require("./lucide").TranslateIcon,
      };
    });
    const renderFresh = (Icon) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = fresh.Client.createRoot(container);
      fresh.React.act(() => {
        root.render(fresh.React.createElement(Icon));
      });
      const markup = container.querySelector("svg").innerHTML;
      fresh.React.act(() => root.unmount());
      container.remove();
      return markup;
    };
    expect(renderFresh(fresh.TranslateIcon)).toBe(
      renderFresh(fresh.LucideTranslateIcon)
    );
  });

  test("renders lucide glyphs when lucide is explicitly selected", () => {
    setIconStyleSnapshot("lucide");
    expect(renderPath(TranslateIcon)).toBe(renderPath(LucideTranslateIcon));
  });

  test("forwards ref to the rendered svg node in both style branches", () => {
    // 分支等价锁：ref 契约对 lucide/mui 两分支都成立（forwardRef 直落
    // 最终渲染的 svg 根），且两分支产物互异。React 18 卸载时会把
    // createRef.current 置 null——instanceof 与 innerHTML 断言必须
    // 在卸载前捕获。
    const markups = {};
    for (const style of ["lucide", "mui"]) {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      const ref = React.createRef();
      setIconStyleSnapshot(style);
      act(() => {
        root.render(<TranslateIcon ref={ref} />);
      });
      expect(ref.current).toBeInstanceOf(SVGSVGElement);
      markups[style] = container.querySelector("svg").innerHTML;
      act(() => root.unmount());
      container.remove();
    }
    expect(markups.lucide).not.toBe(markups.mui);
  });

  test("subscription updates the rendered icon after mount", () => {
    // 既有两条用例均在挂载前 setIconStyleSnapshot，
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

  test("lucide favorite halves render the pinned fills", () => {
    // 元数据断言证不了产物：实渲 g 的 fill 必须与 FILLED 单点契约一致
    // （Favorite=currentColor / FavoriteBorder=none），且整段产物互异。
    setIconStyleSnapshot("lucide");
    expect(renderGFill(FavoriteIcon)).toBe("currentColor");
    expect(renderGFill(FavoriteBorderIcon)).toBe("none");
    expect(renderPath(FavoriteIcon)).not.toBe(renderPath(FavoriteBorderIcon));
  });

  test("newly dispatched keys have entries in both assembly sources", () => {
    // 回接守卫：14 个新增键在 GLYPH_META 与分发器装配导出中均须在场；
    // mui 预期基名手写（不从 GLYPH_META.mui 派生——派生即自比较，改派
    // 漂移抓不住），双分支渲染与上游逐字比对。
    const NEW_KEYS = [
      ["AutoAwesomeIcon", "AutoAwesome"],
      ["BoltIcon", "Bolt"],
      ["Brightness4Icon", "Brightness4"],
      ["Brightness7Icon", "Brightness7"],
      ["ExtensionIcon", "Extension"],
      ["FormatSizeRoundedIcon", "FormatSizeRounded"],
      ["GitHubIcon", "GitHub"],
      ["InputIcon", "Input"],
      ["IntegrationInstructionsIcon", "IntegrationInstructions"],
      ["RuleIcon", "Rule"],
      ["SettingsIcon", "Settings"],
      ["TelegramIcon", "Telegram"],
      ["TerminalIcon", "Terminal"],
      ["PowerSettingsNewIcon", "PowerSettingsNew"],
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
    for (const [name, muiName] of NEW_KEYS) {
      expect(metaNames.has(name)).toBe(true);
      const Icon = dispatcherExports[name];
      expect(Icon).toBeDefined();
      // mui 分支：动态 require MUI 图标模块（外部模块，无 React 单例问题）
      setIconStyleSnapshot("mui");
      const muiModule = require(`@mui/icons-material/${muiName}`);
      expect(renderPath(Icon)).toBe(renderPath(muiModule.default || muiModule));
      // lucide 分支：使用已导入的 LucideIcons 命名空间
      setIconStyleSnapshot("lucide");
      expect(renderPath(Icon)).toBe(renderPath(LucideIcons[name]));
    }
  });
});
