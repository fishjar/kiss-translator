import {
  calculateAdaptiveAccentFamilies,
  calculateAdaptiveIconColor,
  calculateAdaptivePrimaryFamily,
  createM3CssVariableDeclarations,
  createM3CssVariables,
  FOCUS_SILENT_CSS,
  hexToHsl,
  hslToHex,
  ICON_COLOR_PRESETS,
  M3_BRAND_COLORS,
  M3_GLOBAL_CSS,
  resolveIconColor,
  resolveIconColorHex,
  resolveM3Colors,
  resolveM3ThemeMode,
} from "./m3";
import { getCssAtRuleBodies, stripTopLevelAtRuleBlocks } from "./testUtils";
import {
  LOCKED_MIN_TARGET_HEIGHT_PX,
  MIN_TARGET_HEIGHT_PX,
} from "../components/TextareaResizeGrip";

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
    // primary 与 accent 两族 12 键由用户色相家族覆盖（缺省 iconColor 回落
    // 默认 hue 191.4）；brand 通道的 primary/secondaryContainer 均被派生
    // 家族遮蔽，仅剩语义色等键直通 CSS 变量。
    const colors = resolveM3Colors("dark", "cyan");
    expect(createM3CssVariables(colors)).toEqual(
      expect.objectContaining({
        "--kt-secc": "#384143",
        "--kt-onsecc": "#abbbbe",
        "--kt-terc": "#3b3a41",
        "--kt-onterc": "#afacba",
        "--kt-bg": "#131314",
        "--kt-on": "#E3E3E3",
      })
    );
    expect(colors.primary).toBe(
      calculateAdaptivePrimaryFamily(191.4, "dark").primary
    );
    expect(colors.primaryContainer).toBe(
      calculateAdaptivePrimaryFamily(191.4, "dark").primaryContainer
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
    //   .kt-m3-root textarea（×2）
    //   .kt-m3-root textarea.kt-resizable-textarea:not([aria-hidden="true"])::-webkit-scrollbar
    //   .kt-m3-root .kt-height-locked textarea:not([aria-hidden="true"])
    const selectorText = M3_GLOBAL_CSS.replace(/@supports[^{]*\{/g, "");
    const textareaSelectors =
      selectorText.match(/[^\n{}]*textarea[^\n{}]*\{/g) ?? [];
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
    // 手柄焦点指示为 m3.js 显式规则，不静默依赖全局级联——Shadow DOM
    // 场景或后续全局 :focus/:focus-visible 规则调整（如新增 input 类豁免）
    // 不会静默丢失焦点环。口径：鼠标 :focus 零指示，键盘 :focus-visible
    // 画 3px 主色内嵌环（inset box-shadow，不外扩）；内嵌而非外扩的理由：
    // 手柄盒紧贴字段右下角并与操作按钮簇共边，外扩环会伸入按钮实心圆的
    // 绘制区被叠成缺角。无 :focus-visible 支持的旧内核（本仓 gecko 构建
    // 下限为 78.0，早于 Firefox 85）经 :focus 兜底画同一内嵌环，宁滥勿缺。
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
        /\.kt-m3-root \.kt-resize-grip:focus-visible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*inset 0 0 0 3px var\(--kt-pri\);/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.kt-resize-grip:focus-visible\s*\{[^}]*outline-offset:/.test(
          body
        )
      )
    ).toBe(false);
    const gripBaseCss = stripTopLevelAtRuleBlocks(M3_GLOBAL_CSS);
    expect(gripBaseCss).toMatch(
      /\.kt-m3-root \.kt-resize-grip:focus\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*inset 0 0 0 3px var\(--kt-pri\);/
    );
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.kt-resize-grip:focus\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*none;/.test(
          body
        )
      )
    ).toBe(true);
    // forced-colors 域 UA 忽略 box-shadow，内嵌环失效 → 该域必须换系统色描边。
    // 描边只允许出现在该域：非强制色彩域的唯一环源仍是内嵌 box-shadow，外扩
    // 环会被右下角操作簇 z-index 叠成缺角。数量取下界：他处 HC 兜底块合法可增。
    const forcedColorBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@media (forced-colors: active)"
    );
    expect(forcedColorBodies.length).toBeGreaterThanOrEqual(1);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-m3-root \.kt-resize-grip:focus\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;/.test(
          body
        )
      )
    ).toBe(true);
    // 顺序硬闸：兜底块须排在手柄 :focus-visible 规则之后，否则同特异性下被其
    // outline:none 压制，修复静默失效。
    expect(
      M3_GLOBAL_CSS.indexOf(
        "@media (forced-colors: active) {\n  .kt-m3-root .kt-resize-grip:focus"
      )
    ).toBeGreaterThan(
      M3_GLOBAL_CSS.indexOf(".kt-m3-root .kt-resize-grip:focus-visible")
    );
    const cssOutsideForcedColors = forcedColorBodies.reduce(
      (css, body) => css.replace(body, () => ""),
      M3_GLOBAL_CSS
    );
    expect(cssOutsideForcedColors).not.toMatch(
      /\.kt-m3-root \.kt-resize-grip:focus(?:-visible)?\s*\{[^}]*outline:\s*3px/
    );
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

describe("MUI-managed focus exemptions", () => {
  // MuiSelect-select（combobox 触发元）不再豁免：有语义必有环，其键盘指示由
  // 下方"Select 触发元焦点环"三段配对承担（见 Select trigger ring describe）。
  const BASELINE_SELECTORS = [".kt-m3-root .MuiMenuItem-root:focus"];
  const ALL_SELECTORS = [
    ".kt-m3-root .MuiMenuItem-root:focus",
    ".kt-m3-root .MuiMenuItem-root:focus-visible",
  ];
  test("select trigger keeps a visible keyboard ring instead of exemption", () => {
    // 触发元不得再被豁免清零：任何以 outline:none 收尾的豁免规则都不得指向
    // MuiSelect-select（环规则合法含该选择器，但形态是 3px 外扩而非 none）。
    expect(
      /\.kt-m3-root \.MuiSelect-select:(?:focus|focus-visible)\s*\{[^}]*outline:\s*none;/.test(
        M3_GLOBAL_CSS
      )
    ).toBe(false);
    // 现代内核：主色外扩环。
    const modernBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports selector(:focus-visible)"
    );
    expect(
      modernBodies.some((body) =>
        /\.kt-m3-root \.MuiSelect-select:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*outline-offset:\s*2px;/.test(
          body
        )
      )
    ).toBe(true);
    // forced-colors：描边色交强制引擎的配对环。
    const hcBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@media (forced-colors: active)"
    );
    expect(
      hcBodies.some((body) =>
        /\.kt-m3-root \.MuiSelect-select:focus-visible\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*2px;/.test(
          body
        )
      )
    ).toBe(true);
    // 旧内核（Safari ≤15.4 等）：@supports not 包裹的 :focus 兜底环——现代
    // 内核整块跳过，"鼠标 :focus 零指示"姿态零破坏。
    const legacyBodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports not selector(:focus-visible)"
    );
    expect(
      legacyBodies.some((body) =>
        /\.kt-m3-root \.MuiSelect-select:focus\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*outline-offset:\s*2px;/.test(
          body
        )
      )
    ).toBe(true);
    // 顺序硬闸：div.MuiSelect-select 的 class 链含 MuiInputBase-input，同特异性
    // (0,3,0) 的 input 豁免块若排在恢复环之后，环被 outline:none 级联压死。
    // 恢复段必须整体位于豁免块之后。
    const lastExemptionIndex = M3_GLOBAL_CSS.lastIndexOf(
      ".kt-m3-root .MuiInputBase-input:focus-visible { outline: none; }"
    );
    const modernRingIndex = M3_GLOBAL_CSS.indexOf(
      ".kt-m3-root .MuiSelect-select:focus-visible {"
    );
    expect(lastExemptionIndex).toBeGreaterThan(-1);
    expect(modernRingIndex).toBeGreaterThan(lastExemptionIndex);
  });
  test("baseline branch exempts MUI-managed focus controls", () => {
    for (const sel of BASELINE_SELECTORS) {
      expect(M3_GLOBAL_CSS).toMatch(
        new RegExp(
          sel.replace(/[.:]/g, "\\$&") + "\\s*\\{[^}]*outline:\\s*none;"
        )
      );
    }
  });
  test("@supports block exempts MUI-managed focus controls", () => {
    const bodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@supports selector(:focus-visible)"
    );
    for (const sel of ALL_SELECTORS) {
      const re = new RegExp(
        sel.replace(/[.:]/g, "\\$&") + "\\s*\\{[^}]*outline:\\s*none;"
      );
      expect(bodies.some((body) => re.test(body))).toBe(true);
    }
  });
  test("forced-colors keeps a keyboard focus ring on MuiMenuItem", () => {
    // 有语义必有环。上述豁免把 MenuItem 的 :focus/:focus-visible 全部
    // outline:none，而 MUI 的 focusVisible 指示走 boxShadow——强制颜色域会丢弃
    // box-shadow，键盘聚焦的 MenuItem 将无任何可见指示。本块只覆盖 :focus-visible
    //（键盘语境），描边色交强制引擎，指针模态行为零变化。
    const bodies = getCssAtRuleBodies(
      M3_GLOBAL_CSS,
      "@media (forced-colors: active)"
    );
    expect(
      bodies.some((body) =>
        /\.kt-m3-root \.MuiMenuItem-root:focus-visible\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;/.test(
          body
        )
      )
    ).toBe(true);
    // Portal 形态：MUI Menu 挂 body 后菜单项不在 .kt-m3-root 内，
    // 纸容器（MuiMenu-paper slot 类）作用域须独立承载同一描边。
    expect(
      bodies.some((body) =>
        /\.MuiMenu-paper \.MuiMenuItem-root:focus-visible\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;/.test(
          body
        )
      )
    ).toBe(true);
  });
  test("focus-silent fallback silences plain :focus for legacy kernels", () => {
    // 不支持 :focus-visible 的旧内核把含该伪类的选择器列表整条丢弃，
    // 标记元素须有 standalone 的 :focus 静默规则兜底；规则不得与
    // :focus-visible 混排同一选择器列表（旧引擎遇无效选择器整条丢弃）。
    // 按完整规则块解析：先剥块注释（注释文本含 :focus-visible 字面量，
    // 不剥会被并入相邻块造成误判），再以行终态切块——选择器行以 { 开块、
    // 声明块以 } 收束，单行声明规则以 ; 收束。
    const parseBlocks = (css) => {
      const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const blocks = [];
      let current = [];
      let inDecl = false;
      for (const rawLine of body.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        current.push(line);
        if (line.endsWith("{")) {
          inDecl = true;
        } else if (line.endsWith("}") || (!inDecl && line.endsWith(";"))) {
          blocks.push(current.join("\n"));
          current = [];
          inDecl = false;
        }
      }
      return blocks;
    };
    // 成员行＝含标记属性的选择器行；standalone 判定用 :focus 负向断言，
    // 避免 :focus-visible 的 :focus 子串误命中。
    const selectorLines = (block) =>
      block
        .split("\n")
        .filter((line) => line.includes('[data-kt-focus-silent="true"]'))
        .map((line) => line.split("{")[0]);
    const hasStandaloneFocus = (block) =>
      selectorLines(block).some((line) => /:focus(?![\w-])/.test(line));
    const hasFocusVisible = (block) =>
      selectorLines(block).some((line) => line.includes(":focus-visible"));
    const blocks = parseBlocks(FOCUS_SILENT_CSS);
    const fallbackBlocks = blocks.filter(
      (block) => hasStandaloneFocus(block) && !hasFocusVisible(block)
    );
    expect(fallbackBlocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      if (hasStandaloneFocus(block)) {
        // 旧内核对含 :focus-visible 的选择器列表整条丢弃，同一规则块内
        // standalone :focus 与 :focus-visible 成员混排即令回退失效。
        expect(hasFocusVisible(block)).toBe(false);
        expect(block).toContain("outline: none !important;");
      }
    }
    // 混排反例自证：standalone 块混入 :focus-visible 成员须被判为混排，
    // 锁定本解析的检出能力（反例为测试内本地字符串，实现本体不改）。
    const mixedSample =
      '[data-kt-focus-silent="true"]:focus,\n' +
      '[data-kt-focus-silent="true"]:focus-visible {\n' +
      "  outline: none !important;\n" +
      "}";
    const mixedBlocks = parseBlocks(mixedSample).filter(
      (block) => hasStandaloneFocus(block) && hasFocusVisible(block)
    );
    expect(mixedBlocks.length).toBe(1);
    // 键盘指示角色（menuitem 等）与 MuiMenuItem 的回退共享同一规则块，
    // 该块须同时清 outline 与 box-shadow；menuitem 以组内逗号成员身份在场。
    const fallbackBlock = FOCUS_SILENT_CSS.match(
      /\[data-kt-focus-silent="true"\]\.MuiMenuItem-root:focus\s*\{[^}]*\}/
    );
    expect(fallbackBlock?.[0]).toContain("outline: none !important;");
    expect(fallbackBlock?.[0]).toContain("box-shadow: none !important;");
    expect(FOCUS_SILENT_CSS).toContain(
      '[data-kt-focus-silent="true"][role="menuitem"]:focus,'
    );
  });
  test("box-shadow ring control families are listed in both silent blocks", () => {
    // ToggleButton 的键盘环是 inset box-shadow（M3Theme 的 &&:focus-visible
    // 键），通用 outline 规则压不住；原生 button 无 role 属性不匹配
    // [role="button"]；tab 与 AccordionSummary 同属 box-shadow 环家族。
    // 三类控件须同时入 :focus-visible 清单与 :focus 旧内核回退清单。
    for (const tail of [
      '[role="tab"]',
      ".MuiToggleButton-root",
      ".MuiAccordionSummary-root",
    ]) {
      expect(FOCUS_SILENT_CSS).toContain(
        `[data-kt-focus-silent="true"]${tail}:focus-visible,`
      );
      expect(FOCUS_SILENT_CSS).toContain(
        `[data-kt-focus-silent="true"]${tail}:focus,`
      );
    }
  });
});

describe("锁定态最小高度不变量", () => {
  test("锁定下限扣除 root 纵向 padding(17) 与热区内边距(24) 后仍容纳单行(23)", () => {
    // INV-1：LOCKED_MIN − 17 − 24 ≥ 23（等价：锁定下限内容盒 ≥ 单行）
    expect(LOCKED_MIN_TARGET_HEIGHT_PX - 17 - 24).toBeGreaterThanOrEqual(23);
  });

  test("未锁定口径下限保持 40 不回归", () => {
    expect(MIN_TARGET_HEIGHT_PX).toBe(40);
  });
});

describe("icon style keys and icon color palette", () => {
  test("icon color hex lookup normalizes case and whitespace, passes any valid 6-digit hex, falls back on invalid input", () => {
    expect(resolveIconColorHex("#90b2ba")).toBe("#90b2ba");
    expect(resolveIconColorHex(" #90B2BA ")).toBe("#90b2ba");
    expect(resolveIconColorHex("#123abc")).toBe("#123abc");
    expect(resolveIconColorHex("nope")).toBe("#90b2ba");
    expect(resolveIconColorHex("#fff")).toBe("#90b2ba");
    expect(resolveIconColorHex(undefined)).toBe("#90b2ba");
    // 非字符串类型一律回落默认色（类型守卫回归锁）：数字、对象、null
    // 不进正则校验即回落，不抛错也不产生伪 hex。
    expect(resolveIconColorHex(null)).toBe("#90b2ba");
    expect(resolveIconColorHex(123456)).toBe("#90b2ba");
    expect(resolveIconColorHex({ hex: "#00ff00" })).toBe("#90b2ba");
    expect(resolveIconColorHex(["#00ff00"])).toBe("#90b2ba");
    expect(resolveIconColorHex(true)).toBe("#90b2ba");
  });

  test("achromatic hex falls back to the default color instead of reading as red hue", () => {
    // hexToHsl 对 r=g=b 恒返回 h=0；若原样接受，下游只取色相的消费方
    //（自适应强调色、滑轨反解）会把黑白灰读成红色相。
    expect(resolveIconColorHex("#808080")).toBe("#90b2ba");
    expect(resolveIconColorHex("#FFFFFF")).toBe("#90b2ba");
    expect(resolveIconColorHex("#000000")).toBe("#90b2ba");
    expect(hexToHsl(resolveIconColorHex("#808080")).h).not.toBe(0);
    // 格式校验与彩度非零的合法值处理不变。
    expect(resolveIconColorHex("#00ff00")).toBe("#00ff00");
    expect(resolveIconColorHex("#90b2ba")).toBe("#90b2ba");
    expect(resolveIconColorHex("#12345")).toBe("#90b2ba");
  });
});

describe("morandi icon hue ring color math", () => {
  test("ICON_COLOR_PRESETS canonical ring hexes reproduce the morandi ring", () => {
    for (const preset of ICON_COLOR_PRESETS) {
      expect(hslToHex(preset.hue, 23.3, 64.7)).toBe(preset.darkHex);
    }
  });

  test("hslToHex is hue-continuous across the 0/360 wrap", () => {
    expect(hslToHex(360, 23.3, 64.7)).toBe(hslToHex(0, 23.3, 64.7));
  });

  test("hexToHsl recovers preset hues within quantization tolerance", () => {
    for (const preset of ICON_COLOR_PRESETS) {
      const { h, s, l } = hexToHsl(preset.darkHex);
      expect(Math.abs(h - preset.hue)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(s - 23.3)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(l - 64.7)).toBeLessThanOrEqual(0.5);
    }
  });

  test("calculateAdaptiveIconColor maps preset hues per theme (contract literals)", () => {
    // 深色对冲公式：L = 69 - 2.5·sin(h°) + 1.5·cos(2h°)，S = 21.5。
    expect(calculateAdaptiveIconColor(0, "dark")).toBe("#c4a4a4");
    expect(calculateAdaptiveIconColor(44.3, "dark")).toBe("#beb49a");
    expect(calculateAdaptiveIconColor(92.9, "dark")).toBe("#a4b993");
    expect(calculateAdaptiveIconColor(191.4, "dark")).toBe("#a5bfc5");
    expect(calculateAdaptiveIconColor(270, "dark")).toBe("#b3a2c3");
    expect(calculateAdaptiveIconColor(337.1, "dark")).toBe("#c5a5b1");
    // 浅色下压：S = 32、L = 34（对比度修正后的常量）。
    expect(calculateAdaptiveIconColor(0, "light")).toBe("#723b3b");
    expect(calculateAdaptiveIconColor(44.3, "light")).toBe("#72643b");
    expect(calculateAdaptiveIconColor(92.9, "light")).toBe("#54723b");
    expect(calculateAdaptiveIconColor(191.4, "light")).toBe("#3b6872");
    expect(calculateAdaptiveIconColor(270, "light")).toBe("#573b72");
    expect(calculateAdaptiveIconColor(337.1, "light")).toBe("#723b50");
    // 缺省主题为 dark；越界 hue 按 mod 360 归一。
    expect(calculateAdaptiveIconColor(0)).toBe("#c4a4a4");
    expect(calculateAdaptiveIconColor(360, "light")).toBe(
      calculateAdaptiveIconColor(0, "light")
    );
  });

  test("resolveIconColor maps stored canonical hex to theme-adaptive color", () => {
    expect(resolveIconColor("#ba9090", "dark")).toBe("#c4a4a4");
    expect(resolveIconColor("#ba9090", "light")).toBe("#723b3b");
    expect(resolveIconColor("#90b2ba", "dark")).toBe("#a5bfc5");
    expect(resolveIconColor("  #90B2BA  ", "light")).toBe("#3b6872");
    // 非法/缺省回落默认（默认 hue 191.4 的模式自适应色）。
    expect(resolveIconColor(undefined, "dark")).toBe("#a5bfc5");
    expect(resolveIconColor("nope", "light")).toBe("#3b6872");
  });
});

describe("adaptive primary family theming", () => {
  test("calculateAdaptivePrimaryFamily maps preset hues per theme (contract literals)", () => {
    // 浅色：primary 与图标自适应同公式（S=32/L=34），onPrimary 白，容器高 Tone90。
    expect(calculateAdaptivePrimaryFamily(0, "light")).toEqual({
      primary: "#723b3b",
      onPrimary: "#FFFFFF",
      primaryContainer: "#eddede",
      onPrimaryContainer: "#432323",
    });
    expect(calculateAdaptivePrimaryFamily(44.3, "light")).toEqual({
      primary: "#72643b",
      onPrimary: "#FFFFFF",
      primaryContainer: "#ede9de",
      onPrimaryContainer: "#433b23",
    });
    expect(calculateAdaptivePrimaryFamily(92.9, "light")).toEqual({
      primary: "#54723b",
      onPrimary: "#FFFFFF",
      primaryContainer: "#e5edde",
      onPrimaryContainer: "#314323",
    });
    expect(calculateAdaptivePrimaryFamily(191.4, "light")).toEqual({
      primary: "#3b6872",
      onPrimary: "#FFFFFF",
      primaryContainer: "#deeaed",
      onPrimaryContainer: "#233d43",
    });
    expect(calculateAdaptivePrimaryFamily(270, "light")).toEqual({
      primary: "#573b72",
      onPrimary: "#FFFFFF",
      primaryContainer: "#e6deed",
      onPrimaryContainer: "#332343",
    });
    expect(calculateAdaptivePrimaryFamily(337.1, "light")).toEqual({
      primary: "#723b50",
      onPrimary: "#FFFFFF",
      primaryContainer: "#eddee4",
      onPrimaryContainer: "#43232f",
    });
    // 深色：primary 与 onPrimaryContainer 同为对冲公式自适应色（基准 69），
    // onPrimary 深压（S=30/L=16），容器低 Tone（S=14/L=24）。
    expect(calculateAdaptivePrimaryFamily(0, "dark")).toEqual({
      primary: "#c4a4a4",
      onPrimary: "#351d1d",
      primaryContainer: "#463535",
      onPrimaryContainer: "#c4a4a4",
    });
    expect(calculateAdaptivePrimaryFamily(44.3, "dark")).toEqual({
      primary: "#beb49a",
      onPrimary: "#352f1d",
      primaryContainer: "#464135",
      onPrimaryContainer: "#beb49a",
    });
    expect(calculateAdaptivePrimaryFamily(92.9, "dark")).toEqual({
      primary: "#a4b993",
      onPrimary: "#28351d",
      primaryContainer: "#3c4635",
      onPrimaryContainer: "#a4b993",
    });
    expect(calculateAdaptivePrimaryFamily(191.4, "dark")).toEqual({
      primary: "#a5bfc5",
      onPrimary: "#1d3035",
      primaryContainer: "#354346",
      onPrimaryContainer: "#a5bfc5",
    });
    expect(calculateAdaptivePrimaryFamily(270, "dark")).toEqual({
      primary: "#b3a2c3",
      onPrimary: "#291d35",
      primaryContainer: "#3d3546",
      onPrimaryContainer: "#b3a2c3",
    });
    expect(calculateAdaptivePrimaryFamily(337.1, "dark")).toEqual({
      primary: "#c5a5b1",
      onPrimary: "#351d26",
      primaryContainer: "#46353b",
      onPrimaryContainer: "#c5a5b1",
    });
  });

  test("resolveM3Colors overrides the primary family after the brand spread and keeps semantic colors", () => {
    // 色相优先：cyan brand 的 primary 四键被用户色相家族遮蔽。
    const darkColors = resolveM3Colors("dark", "cyan", "#ba9090");
    const darkFamily = calculateAdaptivePrimaryFamily(0, "dark");
    expect(darkColors.primary).toBe(darkFamily.primary);
    expect(darkColors.onPrimary).toBe(darkFamily.onPrimary);
    expect(darkColors.primaryContainer).toBe(darkFamily.primaryContainer);
    expect(darkColors.onPrimaryContainer).toBe(darkFamily.onPrimaryContainer);
    // accent 家族紧随 primary 展开：brand 的 secondaryContainer 同被派生遮蔽；
    // 语义色恒等 M3_COLORS 原值。
    expect(darkColors.secondaryContainer).toBe(
      calculateAdaptiveAccentFamilies(0, "dark").secondaryContainer
    );
    expect(darkColors.tertiaryContainer).toBe(
      calculateAdaptiveAccentFamilies(0, "dark").tertiaryContainer
    );
    expect(darkColors.error).toBe("#F2B8B5");
    expect(darkColors.success).toBe("#6DD58C");
    const lightColors = resolveM3Colors("light", "violet", "#90b2ba");
    expect(lightColors.primary).toBe(
      calculateAdaptivePrimaryFamily(191.4, "light").primary
    );
    expect(lightColors.error).toBe("#B3261E");
    expect(lightColors.success).toBe("#146C2E");
  });

  test("primary family and resolved icon share the single adaptive-icon-color formula", () => {
    // 等价改调的值锁：calculateAdaptivePrimaryFamily.primary 与
    // resolveM3Colors().icon 必须与 calculateAdaptiveIconColor 全档同值。
    // 消除同式内联与二次反解后，三处表达式单点收敛，本锁防漂移回归。
    for (const theme of ["dark", "light"]) {
      for (const hue of [0, 44.3, 92.9, 191.4, 270, 337.1, 359.5]) {
        expect(calculateAdaptivePrimaryFamily(hue, theme).primary).toBe(
          calculateAdaptiveIconColor(hue, theme)
        );
      }
    }
    const darkColors = resolveM3Colors("dark", "cyan", "#ba9090");
    expect(darkColors.icon).toBe(calculateAdaptiveIconColor(0, "dark"));
    const lightColors = resolveM3Colors("light", "violet", "#90b2ba");
    expect(lightColors.icon).toBe(calculateAdaptiveIconColor(191.4, "light"));
  });

  test("primary family feeds the kt CSS variables", () => {
    const colors = resolveM3Colors("dark", "blue", "#ba9090");
    const vars = createM3CssVariables(colors);
    expect(vars["--kt-pri"]).toBe(colors.primary);
    expect(vars["--kt-onpri"]).toBe(colors.onPrimary);
    expect(vars["--kt-pric"]).toBe(colors.primaryContainer);
    expect(vars["--kt-sec"]).toBe(colors.secondary);
    expect(vars["--kt-onsec"]).toBe(colors.onSecondary);
    expect(vars["--kt-onpric"]).toBe(colors.onPrimaryContainer);
  });
});

describe("adaptive accent families theming", () => {
  test("calculateAdaptiveAccentFamilies maps preset hues per theme (contract literals)", () => {
    // light：secondary 同色相 S=18/L=34、容器 S=18/L=86、on 容器 S=18/L=20；
    // 容器档由 S=16/L=90 加深为 S=18/L=86：白轨道上选中片曾与轨道同色
    // （#eae1e1 对白仅 1.28:1），浅色模式分段控件读不出选中态。
    // tertiary 色相 +60°、S=12。dark：S 阶梯 13/9、容器 S=9/L=24、on 主调走对冲公式。
    expect(calculateAdaptiveAccentFamilies(0, "light")).toEqual({
      secondary: "#664747",
      onSecondary: "#FFFFFF",
      secondaryContainer: "#e2d5d5",
      onSecondaryContainer: "#3c2a2a",
      tertiaryContainer: "#e8e8e3",
      onTertiaryContainer: "#39392d",
    });
    expect(calculateAdaptiveAccentFamilies(0, "dark")).toEqual({
      secondary: "#beaaaa",
      onSecondary: "#312121",
      secondaryContainer: "#433838",
      onSecondaryContainer: "#beaaaa",
      tertiaryContainer: "#41413a",
      onTertiaryContainer: "#b0b0a1",
    });
    expect(calculateAdaptiveAccentFamilies(191.4, "dark")).toEqual({
      secondary: "#abbbbe",
      onSecondary: "#212e31",
      secondaryContainer: "#384143",
      onSecondaryContainer: "#abbbbe",
      tertiaryContainer: "#3b3a41",
      onTertiaryContainer: "#afacba",
    });
    // 越界 hue 归一与缺省主题（dark）；非 "light" 一律走 dark 分支。
    expect(calculateAdaptiveAccentFamilies(360)).toEqual(
      calculateAdaptiveAccentFamilies(0)
    );
    expect(calculateAdaptiveAccentFamilies(-60, "light")).toEqual(
      calculateAdaptiveAccentFamilies(300, "light")
    );
  });

  test("solid tertiary/onTertiary are not emitted (dead-token removal, contract B)", () => {
    for (const theme of ["light", "dark"]) {
      const f = calculateAdaptiveAccentFamilies(191.4, theme);
      expect(f.tertiary).toBeUndefined();
      expect(f.onTertiary).toBeUndefined();
      expect(typeof f.tertiaryContainer).toBe("string");
      expect(typeof f.onTertiaryContainer).toBe("string");
    }
  });

  test("unwritten snapshot falls back to the default icon color hue", () => {
    // 缺省/非法输入单点收敛默认 hue 191.4（快照未写入窗口的守门断言）。
    expect(resolveM3Colors("dark").secondaryContainer).toBe(
      calculateAdaptiveAccentFamilies(
        hexToHsl(resolveIconColorHex(undefined)).h,
        "dark"
      ).secondaryContainer
    );
  });
});

describe("icon hue WCAG contrast envelope", () => {
  function relativeLuminance(hex) {
    const [r, g, b] = [1, 3, 5]
      .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((c) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrastRatio(hexA, hexB) {
    const la = relativeLuminance(hexA);
    const lb = relativeLuminance(hexB);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  test("adaptive icon color keeps WCAG AA contrast on dark panels and white", () => {
    // 采样全域 15° 步长 + 实测最差点（深 240°、浅 59–60°）与全部预设 hue。
    // 采样点显式覆盖已知全域极小点（深 240°、浅 59–60°）；若调整映射公式，
    // 须同步复核极小点后补采，防止粗采样漏检新出现的极小谷。
    const hues = [];
    for (let h = 0; h <= 360; h += 15) hues.push(h);
    hues.push(59, 59.5, 60, 240, 0, 44.3, 92.9, 191.4, 270, 337.1);
    for (const h of hues) {
      const dark = calculateAdaptiveIconColor(h, "dark");
      expect(contrastRatio(dark, "#2d2d2d")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark, "#33363b")).toBeGreaterThanOrEqual(4.5);
      const light = calculateAdaptiveIconColor(h, "light");
      expect(contrastRatio(light, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("light secondaryContainer stays readable against both neutral tracks", () => {
    // 选中片（secondaryContainer，浅档 S18/L86）对两条轨道的对比下限闸：
    // 轨道实测分布为 surface #FFFFFF（设置/popup 分段）与
    // surfaceContainer #F0F4F9（MUI 通用 Tabs 轨道）。选中片与浅色轨道
    // 易混同，故此处锁填充色与轨道的对比下限本身。
    const gateHues = [];
    for (let h = 0; h <= 360; h += 5) gateHues.push(h);
    gateHues.push(59, 59.5, 60, 65, 44.3, 92.9, 191.4, 270, 337.1);
    for (const h of gateHues) {
      const { secondaryContainer, onSecondaryContainer } =
        calculateAdaptiveAccentFamilies(h, "light");
      expect(
        contrastRatio(secondaryContainer, "#FFFFFF")
      ).toBeGreaterThanOrEqual(1.26);
      expect(
        contrastRatio(secondaryContainer, "#F0F4F9")
      ).toBeGreaterThanOrEqual(1.14);
      expect(
        contrastRatio(secondaryContainer, onSecondaryContainer)
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("selected hover composite keeps WCAG AA contrast with onSurface foreground", () => {
    // 选中行悬停合成底＝color-mix(in srgb, secondaryContainer 92%,
    // currentColor 8%)，悬停前景换 onSurface（M3Theme hover 前景杠杆）。
    // 合成底对 onSurface 须在两主题全域 ≥4.5；旧口径（前景
    // onSecondaryContainer）dark 最小 3.954 即缺陷面。sRGB 逐通道插值
    // 与 CSS color-mix(in srgb) 语义一致。
    const colorMix = (a, b, ratio) => {
      const channels = (hex) =>
        [1, 3, 5].map((offset) =>
          Number.parseInt(hex.slice(offset, offset + 2), 16)
        );
      const [ca, cb] = [channels(a), channels(b)];
      const mixed = ca.map((channel, index) =>
        Math.round(channel * ratio + cb[index] * (1 - ratio))
      );
      return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    };
    const familyHues = [];
    for (let h = 0; h <= 360; h += 5) familyHues.push(h);
    familyHues.push(59, 59.5, 60, 93.5, 0, 44.3, 92.9, 191.4, 270, 337.1);
    let darkFloor = Infinity;
    for (const h of familyHues) {
      for (const theme of ["light", "dark"]) {
        const f = calculateAdaptiveAccentFamilies(h, theme);
        const { onSurface } = resolveM3Colors(theme);
        const hoverBackground = colorMix(f.secondaryContainer, onSurface, 0.92);
        const ratio = contrastRatio(hoverBackground, onSurface);
        if (theme === "dark") darkFloor = Math.min(darkFloor, ratio);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
    // dark 域实测极小点（hue0 邻域）显式闸：合成底对 onSurface 下限
    // 6.35 量级，远离 4.5 破线区。
    expect(darkFloor).toBeGreaterThanOrEqual(6);
  });

  test("primary and accent families keep WCAG AA contrast across the full hue ring", () => {
    // 三级强调色 12 组配对（primary 4 + accent 8）全域包络；5° 步长 73 点 +
    // 连续域 0.5° 实测极小点密采（59/60/35/91/93.5/100.5/102.5 等），
    // 连续域真值下限 4.5279（dark tertiaryContainer，h=35，满足 AA），下限 4.5 守门。
    const familyHues = [];
    for (let h = 0; h <= 360; h += 5) familyHues.push(h);
    familyHues.push(
      59,
      59.5,
      60,
      240,
      35,
      91,
      93.5,
      100.5,
      102.5,
      44.3,
      92.9,
      191.4,
      270,
      337.1
    );
    for (const h of familyHues) {
      for (const theme of ["light", "dark"]) {
        const p = calculateAdaptivePrimaryFamily(h, theme);
        expect(contrastRatio(p.primary, p.onPrimary)).toBeGreaterThanOrEqual(
          4.5
        );
        expect(
          contrastRatio(p.primaryContainer, p.onPrimaryContainer)
        ).toBeGreaterThanOrEqual(4.5);
        const f = calculateAdaptiveAccentFamilies(h, theme);
        expect(
          contrastRatio(f.secondary, f.onSecondary)
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(f.secondaryContainer, f.onSecondaryContainer)
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(f.tertiaryContainer, f.onTertiaryContainer)
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("m3 global css legacy focus-visible fallback", () => {
  test("MenuItem keeps a keyboard ring on engines without :focus-visible", () => {
    // 旧内核整块跳过 @supports 与 :focus-visible HC 块，而 MenuItem 豁免
    // （outline:none）无条件生效——键盘聚焦菜单项零指示（HC 域更因
    // boxShadow 被引擎丢弃而全盲）。旧内核兜底块须在豁免之后声明，
    // 且不得以裸规则出现在顶层；扫描按块体全集，不依赖块在文本中的位置。
    const css = M3_GLOBAL_CSS;
    const legacyBodies = getCssAtRuleBodies(
      css,
      "@supports not selector(:focus-visible)"
    );
    expect(
      legacyBodies.some((body) =>
        /\.kt-m3-root \.MuiMenuItem-root:focus\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;/.test(
          body
        )
      )
    ).toBe(true);
    // 顺序守卫：兜底块须后置于无条件豁免（同特异性靠源序胜出）。
    expect(
      css.indexOf("@supports not selector(:focus-visible)")
    ).toBeGreaterThan(css.indexOf(".kt-m3-root .MuiMenuItem-root:focus {"));
    // 结构闸：兜底 3px 环禁止裸规则现于顶层（现代内核鼠标姿态锁定）。
    expect(stripTopLevelAtRuleBlocks(css)).not.toMatch(
      /\.MuiMenuItem-root:focus\s*\{[^}]*outline:\s*3px solid;/
    );
    // 棘轮闸：自持焦点环不得绑 .Mui-focusVisible 类门控。
    expect(css).not.toContain(".Mui-focusVisible");
  });
});
