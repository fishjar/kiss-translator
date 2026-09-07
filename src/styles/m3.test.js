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
  test("keeps the native resize hit area usable without styling measurement nodes", () => {
    expect(M3_GLOBAL_CSS).toMatch(
      /textarea\.kt-resizable-textarea:not\(\[aria-hidden="true"\]\)::\-webkit-scrollbar\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/
    );
    const resizerBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports selector(textarea::-webkit-resizer)"
    );
    expect(resizerBodies).toHaveLength(1);
    expect(
      resizerBodies.some((body) =>
        /textarea\.kt-resizable-textarea:not\(\[aria-hidden="true"\]\)::\-webkit-resizer\s*\{[^}]*background-color:\s*transparent;[^}]*background-image:\s*linear-gradient\([\s\S]*?var\(--kt-onv\)[\s\S]*?background-position:\s*right 6px bottom 6px;[^}]*background-size:\s*10px 10px;/.test(
          body
        )
      )
    ).toBe(true);
    expect(M3_GLOBAL_CSS).not.toContain(".MuiFilledInput-root::after");
    expect(M3_GLOBAL_CSS).not.toContain(
      ".kt-popup-translation-textarea::after"
    );
    expect(M3_GLOBAL_CSS.match(/::\-webkit-resizer\s*\{/g) || []).toHaveLength(
      1
    );
  });
});

describe("M3 keyboard focus", () => {
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
