import { SELECTION_STYLES } from "./styles";
import { TRANSLATION_PANEL_STYLES } from "../../components/TranslationPanel/styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";

describe("selection Material 3 shapes", () => {
  test("bounds the overflow menu and keeps its items scrollable in short viewports", () => {
    const menuRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__menu\s*\{([^}]*)\}/
    )?.[1];
    const itemRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__menu button\s*\{([^}]*)\}/
    )?.[1];
    expect(menuRule).toContain("box-sizing: border-box");
    expect(menuRule).toContain("max-width: calc(100vw - 16px)");
    expect(menuRule).toContain("max-height: calc(100vh - 16px)");
    expect(menuRule).toContain("overflow-y: auto");
    expect(itemRule).toContain("flex-shrink: 0");
  });

  // 非 Windows 默认环境不变式：标题栏拖拽图标 cursor 仍为裸 move 关键字，
  // 与改动前逐字一致（改动前后都应通过）。
  test("keeps the plain move keyword cursor for the header drag glyph by default", () => {
    const dragRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__drag\s*\{([^}]*)\}/
    )?.[1];
    expect(dragRule).toContain("cursor: move");
  });

  // 真红主路径：TRANSLATION_PANEL_STYLES 在模块加载期定型（平台不会在会
  // 话中途改变，模块加载期求值属可接受），Windows 分支须经
  // jest.isolateModules 先行 mock navigator 再重新求值模块后断言拖拽图
  // 标携带位图光标（同根因：Windows Chromium 单色光标反白缺陷）。当前实
  // 现为字面量 cursor: move，本用例首跑必红。
  test("uses the shared bitmap cursor for the header drag glyph on Windows Chromium", () => {
    jest.isolateModules(() => {
      Object.defineProperty(window.navigator, "userAgentData", {
        configurable: true,
        value: { platform: "Windows" },
      });
      try {
        const {
          TRANSLATION_PANEL_STYLES: winStyles,
        } = require("../../components/TranslationPanel/styles");
        const dragRule = winStyles.match(
          /\.kt-tranbox-header__drag\s*\{([^}]*)\}/
        )?.[1];
        expect(dragRule).toContain("cursor: url(data:image/png;base64,");
        expect(dragRule).toContain(") 16 16, move");
      } finally {
        delete window.navigator.userAgentData;
      }
    });
  });

  test("uses restrained surface and menu radii", () => {
    expect(TRANSLATION_PANEL_STYLES).toMatch(
      /\.kt-translation-panel\s*\{[^}]*border-radius:\s*16px !important;/
    );
    expect(TRANSLATION_PANEL_STYLES).toMatch(
      /\.kt-tranbox-header__menu\s*\{[^}]*border-radius:\s*4px;/
    );
    expect(TRANSLATION_PANEL_STYLES).toMatch(
      /\.kt-tranbox-header__menu button\s*\{[^}]*border-radius:\s*8px;/
    );
    expect(TRANSLATION_PANEL_STYLES).toMatch(
      /\.kt-tranbox-header \.MuiIconButton-root\[aria-pressed="true"\]:hover\s*\{[^}]*var\(--kt-onpric\) 8%/
    );
    expect(TRANSLATION_PANEL_STYLES).toMatch(
      /\.kt-tranbox-header \.MuiIconButton-root\[aria-pressed="true"\]\.Mui-focusVisible,[\s\S]*?\[aria-pressed="true"\]:active\s*\{[^}]*var\(--kt-onpric\) 10%/
    );
    expect(TRANSLATION_PANEL_STYLES).not.toContain(
      ".KT-draggable-container .MuiStack-root { gap: 12px; }"
    );
    const hoverBodies = getCssAtRuleBodies(
      TRANSLATION_PANEL_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-tranbox-header__menu button:hover/.test(body)
      )
    ).toBe(true);
  });

  test("keeps the small translation FAB shape stable on hover", () => {
    const baseRule = SELECTION_STYLES.match(/\.KT-tranbtn\s*\{([^}]*)\}/)?.[1];
    const hoverRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:hover\s*\{([^}]*)\}/
    )?.[1];
    const activeRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:active\s*\{([^}]*)\}/
    )?.[1];

    expect(baseRule).toContain(
      "border-radius: calc(var(--kt-tranbtn-size, 32px) * .16)"
    );
    expect(baseRule).toContain("width: var(--kt-tranbtn-size, 32px)");
    expect(baseRule).toContain("height: var(--kt-tranbtn-size, 32px)");
    expect(baseRule).toContain("border: 0");
    expect(baseRule).toContain("color: var(--kt-onpric)");
    expect(baseRule).not.toContain("animation:");
    expect(baseRule).not.toMatch(/transition:[^;]*border-radius/);
    expect(SELECTION_STYLES).toMatch(
      /@media\s*\(hover:\s*hover\)\s*\{\s*\.KT-tranbtn:hover/
    );
    expect(baseRule).toContain("background: transparent");
    expect(baseRule).toContain("box-shadow: none");
    expect(hoverRule).not.toContain("background:");
    expect(activeRule).not.toContain("background:");
    expect(hoverRule).not.toContain("border-radius");
    expect(activeRule).toContain("transform: scale(.94)");
    expect(baseRule).toContain("opacity: var(--kt-tranbtn-opacity, 1)");
    expect(hoverRule).toContain("opacity: 1");
    expect(SELECTION_STYLES).toMatch(/\.KT-tranbtn:focus\s*\{[^}]*opacity: 1/);
  });

  test("keeps a complete keyboard focus fallback", () => {
    const fallbackRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:focus\s*\{([^}]*)\}/
    )?.[1];
    const visibleRule = SELECTION_STYLES.match(
      /\.KT-tranbtn:focus-visible\s*\{([^}]*)\}/
    )?.[1];

    expect(fallbackRule).toContain("outline: 2px solid var(--kt-pri)");
    expect(fallbackRule).toContain("outline-offset: 2px");
    expect(SELECTION_STYLES).toContain("@supports selector(:focus-visible)");
    expect(SELECTION_STYLES).toMatch(
      /@supports selector\(:focus-visible\)\s*\{[\s\S]*?\.KT-tranbtn:focus\s*\{[^}]*outline:\s*none;/
    );
    expect(visibleRule).toContain("outline: 2px solid var(--kt-pri)");
    expect(visibleRule).toContain("outline-offset: 2px");
  });

  test("keeps the font-size row on the menu row baseline and styles the split capsule", () => {
    const valueOf = (rule, key) =>
      rule.match(new RegExp(`${key}:\\s*([^;]+);`))?.[1];
    const itemRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__menu button\s*\{([^}]*)\}/
    )?.[1];
    const rowRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size\s*\{([^}]*)\}/
    )?.[1];
    const capsuleRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size-capsule\s*\{([^}]*)\}/
    )?.[1];
    const capsuleButtonRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size-capsule button\s*\{([^}]*)\}/
    )?.[1];
    const capsuleIconRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size-capsule button svg\s*\{([^}]*)\}/
    )?.[1];
    const capsuleDividerRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size-capsule button:last-child\s*\{([^}]*)\}/
    )?.[1];
    const capsuleOutputRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__font-size-capsule output\s*\{([^}]*)\}/
    )?.[1];
    const capsuleDisabledRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__menu \.kt-tranbox-header__font-size-capsule button:disabled\s*\{([^}]*)\}/
    )?.[1];
    const capsuleActiveRule = TRANSLATION_PANEL_STYLES.match(
      /\.kt-tranbox-header__menu \.kt-tranbox-header__font-size-capsule button:not\(:disabled\):active\s*\{([^}]*)\}/
    )?.[1];

    // 行几何与 menu 行基线逐值同步：行高/字号/间距不脱离兄弟行的演进
    // 口径（行容器为 div，无法字面继承 button 规则，以逐值相等锁钉住）。
    expect(valueOf(rowRule, "min-height")).toBe(
      valueOf(itemRule, "min-height")
    );
    expect(valueOf(rowRule, "font-size")).toBe(valueOf(itemRule, "font-size"));
    expect(valueOf(rowRule, "gap")).toBe(valueOf(itemRule, "gap"));

    // 胶囊容器：细线描边胶囊形、透明底；外高与 14px 文本行高对齐
    // （内容 20px＋上下描边），不高于左侧文字。
    expect(capsuleRule).toContain("border: 1px solid var(--kt-linev)");
    expect(capsuleRule).toContain("border-radius: 999px");
    expect(capsuleRule).toContain("background: transparent");

    // −/＋ 钮：与文本行等高的紧凑钳制、直角交容器圆角、定位锚供触控垫片。
    expect(capsuleButtonRule).toContain("min-height: 20px");
    expect(capsuleButtonRule).toContain("width: 26px");
    expect(capsuleButtonRule).toContain("padding: 0");
    expect(capsuleButtonRule).toContain("position: relative");
    expect(capsuleIconRule).toContain("width: 16px");
    expect(capsuleIconRule).toContain("height: 16px");

    // 分体式中缝：末位（增大）钮左侧细线，分隔数值与动作钮。
    expect(capsuleDividerRule).toContain(
      "border-left: 1px solid var(--kt-linev)"
    );

    // 数值播报为只读隐藏元素：视觉不占位、SR 保留 aria-live。
    expect(capsuleOutputRule).toContain("position: absolute");
    expect(capsuleOutputRule).toContain("clip-path: inset(50%)");

    // 到界禁用＝M3 disabled content 口径（38% 不透明度）。
    expect(capsuleDisabledRule).toContain("opacity: .38");

    // hover/active 走 State Layer 且以 :not(:disabled) 守卫，禁用态不吃
    // 反馈层；胶囊作用域内不得被 menu 行实底 hover 击穿、不得自绘焦点环。
    const hoverBodies = getCssAtRuleBodies(
      TRANSLATION_PANEL_STYLES,
      "@media (hover: hover)"
    );
    const capsuleHover = hoverBodies.find((body) =>
      /\.kt-tranbox-header__menu \.kt-tranbox-header__font-size-capsule button:not\(:disabled\):hover/.test(
        body
      )
    );
    expect(capsuleHover).toBeDefined();
    expect(capsuleHover).toContain(
      "color-mix(in srgb, currentColor 8%, transparent)"
    );
    expect(capsuleHover).not.toContain("var(--kt-pric)");
    expect(capsuleActiveRule).toContain(
      "color-mix(in srgb, currentColor 12%, transparent)"
    );
    const capsuleRules = [
      rowRule,
      capsuleRule,
      capsuleButtonRule,
      capsuleIconRule,
      capsuleDividerRule,
      capsuleOutputRule,
      capsuleDisabledRule,
      capsuleHover,
      capsuleActiveRule,
    ].join("\n");
    expect(capsuleRules).not.toContain(".Mui-focusVisible");
    expect(capsuleRules).not.toContain("box-shadow");
    expect(capsuleRules).not.toContain("outline");

    // 触控垫片：48px 命中区随钮心居中（触控域既有形态）。
    const coarseBodies = getCssAtRuleBodies(
      TRANSLATION_PANEL_STYLES,
      "@media (pointer: coarse)"
    );
    const touchPad = coarseBodies.find((body) =>
      /\.kt-tranbox-header__font-size-capsule button::after/.test(body)
    );
    expect(touchPad).toBeDefined();
    expect(touchPad).toContain("width: 48px");
    expect(touchPad).toContain("height: 48px");

    // 粗指针命中区：钮宽与 48px 垫片同宽 → 相邻命中区中心距 ≥ 垫片宽，
    // 增/减两枚命中区沿分隔线相接不重叠（jsdom 无命中测试能力，以几何
    // 等价断言替代触摸坐标验证）。
    const coarseBody = getCssAtRuleBodies(
      TRANSLATION_PANEL_STYLES,
      "@media (pointer: coarse)"
    ).find((body) =>
      body.includes(".kt-tranbox-header__font-size-capsule button")
    );
    expect(coarseBody).toMatch(
      /\.kt-tranbox-header__font-size-capsule button \{[^}]*width: 48px/
    );
    const hitPad = coarseBody.match(
      /\.kt-tranbox-header__font-size-capsule button::after \{([^}]*)\}/
    )?.[1];
    expect(hitPad).toContain("width: 48px");
    expect(hitPad).toContain("height: 48px");
  });
});
