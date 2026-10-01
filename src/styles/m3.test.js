import {
  createM3CssVariableDeclarations,
  createM3CssVariables,
  M3_BRAND_COLORS,
  M3_GLOBAL_CSS,
  resolveM3Colors,
  resolveM3ThemeMode,
} from "./m3";
import { getCssAtRuleBodies } from "./testUtils";

describe("M3 brand colors", () => {
  test("matches the handoff tokens for alternate brands", () => {
    expect(M3_BRAND_COLORS.cyan.light).toEqual(
      expect.objectContaining({
        primary: "#006874",
        primaryContainer: "#97F0FF",
      })
    );
    expect(M3_BRAND_COLORS.violet.dark).toEqual(
      expect.objectContaining({
        primary: "#D0BCFF",
        primaryContainer: "#4F378B",
      })
    );
  });

  test("generates CSS variables from the same resolved token object", () => {
    const colors = resolveM3Colors("dark", "cyan");
    expect(createM3CssVariables(colors)).toEqual(
      expect.objectContaining({
        "--kt-pri": "#4FD8EB",
        "--kt-pric": "#004F58",
        "--kt-bg": "#131314",
        "--kt-on": "#E3E3E3",
      })
    );
    expect(createM3CssVariableDeclarations(colors)).toContain(
      "--kt-pri: #4FD8EB;"
    );
    expect(resolveM3ThemeMode("auto", true)).toBe("dark");
  });
});

describe("M3 global motion", () => {
  test("respects reduced motion preferences", () => {
    expect(M3_GLOBAL_CSS).toContain("prefers-reduced-motion: reduce");
  });

  test("lets component typography override the native button reset", () => {
    expect(M3_GLOBAL_CSS).toContain(
      ":where(.kt-m3-root button:not(.MuiButtonBase-root))"
    );
    expect(M3_GLOBAL_CSS).not.toMatch(/\.kt-m3-root button,\s*\n/);
  });
});

describe("M3 resizable textareas", () => {
  test("keeps the scrollbar width rules, drops the native resizer restyle, and ships the locked-height CSS", () => {
    expect(M3_GLOBAL_CSS).toMatch(
      /textarea\.kt-resizable-textarea:not\(\[aria-hidden="true"\]\)::\-webkit-scrollbar\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/
    );
    expect(M3_GLOBAL_CSS).not.toContain(
      "@supports selector(textarea::-webkit-resizer)"
    );
    expect(M3_GLOBAL_CSS).not.toContain("::-webkit-resizer");
    expect(M3_GLOBAL_CSS).toMatch(
      /\.kt-m3-root \.kt-height-locked\.MuiInputBase-root\s*\{[^}]*min-height:\s*0 !important;/
    );
    expect(M3_GLOBAL_CSS).toMatch(
      /\.kt-m3-root \.kt-height-locked textarea:not\(\[aria-hidden="true"\]\)\s*\{[^}]*height:\s*100% !important;[^}]*min-height:\s*0 !important;[^}]*max-height:\s*none !important;[^}]*overflow:\s*auto !important;[^}]*box-sizing:\s*border-box !important;[^}]*padding-bottom:\s*24px !important;/
    );
    expect(M3_GLOBAL_CSS).not.toContain(".MuiFilledInput-root::after");
    expect(M3_GLOBAL_CSS).not.toContain(
      ".kt-popup-translation-textarea::after"
    );
  });

  test("scopes every textarea-facing selector to a kt- container class", () => {
    // 前缀护栏：M3_GLOBAL_CSS 中任何面向 textarea 元素的选择器都必须被
    // .kt-m3-root / .kt-height-locked / .kt-resizable-textarea 之一限定，
    // 严禁出现无前缀的全局 textarea 规则（泄漏会污染宿主页面与扩展
    // popup 之外的任意原生 textarea）。@supports 头先行剥除，块内选择器
    // 逐条核验；合法选择器全集以 m3.js 实际内容为唯一事实来源，当前为：
    //   .kt-m3-root textarea（×2，:172/:178）
    //   .kt-m3-root textarea.kt-resizable-textarea:not([aria-hidden="true"])::-webkit-scrollbar（:232）
    //   .kt-m3-root .kt-height-locked textarea:not([aria-hidden="true"])（:241）
    const selectorText = M3_GLOBAL_CSS.replace(/@supports[^{]*\{/g, "");
    const textareaSelectors = selectorText.match(/[^\n{}]*textarea[^\n{}]*\{/g) ?? [];
    expect(textareaSelectors.length).toBeGreaterThanOrEqual(3);
    for (const raw of textareaSelectors) {
      const selector = raw.replace(/\{$/, "").trim();
      expect(
        /\.kt-(m3-root|height-locked|resizable-textarea)/.test(selector)
      ).toBe(true);
    }
  });
});

describe("M3 keyboard focus", () => {
  test("ships an explicit grip focus ring instead of relying on the global cascade", () => {
    // B7 决策反转：手柄焦点指示升格为 m3.js 显式规则，不再静默依赖全局
    // 级联——Shadow DOM 场景或后续全局 :focus/:focus-visible 规则调整
    // （如新增 input 类豁免）不会静默丢失焦点环。口径与全局级联一致：
    // 鼠标 :focus 零指示，键盘 :focus-visible 3px 主色环 + 2px 偏移；
    // 旧内核经 :focus 直接走零指示分支（与全局 :focus 豁免同口径）。
    expect(M3_GLOBAL_CSS).toMatch(
      /\.kt-m3-root \.kt-resize-grip:focus\s*\{[^}]*outline:\s*none;/
    );
    const focusVisibleBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports selector(:focus-visible)"
    );
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.kt-resize-grip:focus\s*\{[^}]*outline:\s*none;/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.kt-resize-grip:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*outline-offset:\s*2px;/.test(
          body
        )
      )
    ).toBe(true);
  });

  test("keeps the primary focus ring solid after progressive enhancement", () => {
    const fallbackRule = M3_GLOBAL_CSS.match(
      /\.kt-m3-root :focus\s*\{([^}]*)\}/
    )?.[1];

    expect(fallbackRule).toContain("outline: 3px solid var(--kt-pri)");
    expect(fallbackRule).toContain("outline-offset: 2px");
    expect(fallbackRule).not.toContain("color-mix");
    expect(M3_GLOBAL_CSS).toContain("@supports selector(:focus-visible)");
    expect(M3_GLOBAL_CSS).not.toMatch(
      /:focus-visible\s*\{[^}]*outline-color:\s*color-mix/
    );
  });

  test("delegates MUI input focus rendering to the field container", () => {
    expect(M3_GLOBAL_CSS).toMatch(
      /\.kt-m3-root \.MuiInputBase-input:focus\s*\{[^}]*outline:\s*none;/
    );
    const focusVisibleBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports selector(:focus-visible)"
    );
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.MuiInputBase-input:focus-visible\s*\{[^}]*outline:\s*none;/.test(
          body
        )
      )
    ).toBe(true);
    expect(M3_GLOBAL_CSS).toMatch(
      /\.kt-m3-root \.MuiButtonBase-root input:focus,[\s\S]*?\.MuiSlider-input:focus\s*\{[^}]*outline:\s*none;/
    );
    expect(
      focusVisibleBodies.some((body) =>
        /\.MuiButtonBase-root input:focus-visible,[\s\S]*?\.MuiSlider-input:focus-visible\s*\{[^}]*outline:\s*none;/.test(
          body
        )
      )
    ).toBe(true);
  });
});
