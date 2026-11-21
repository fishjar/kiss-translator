import { OPTIONS_STYLES } from "./styles";
import { getCssAtRuleBodies } from "../../styles/testUtils";

describe("settings segmented controls", () => {
  test("keeps selected and focused states inside the segmented track", () => {
    const trackRule = OPTIONS_STYLES.match(
      /(?:^|\n)\.kt-settings-segmented\s*\{([^}]*)\}/
    )?.[1];
    const buttonRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented > button\s*\{([^}]*)\}/
    )?.[1];
    const fallbackFocusRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented > button:focus\s*\{([^}]*)\}/
    )?.[1];
    const focusVisibleBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@supports selector(:focus-visible)"
    );
    const enhancedFocusRule = focusVisibleBodies
      .map(
        (body) =>
          body.match(
            /\.kt-settings-segmented > button:focus-visible\s*\{([^}]*)\}/
          )?.[1]
      )
      .find(Boolean);
    const labelRule = OPTIONS_STYLES.match(
      /\.kt-settings-segmented__label\s*\{([^}]*)\}/
    )?.[1];

    expect(trackRule).toContain("overflow: hidden");
    expect(trackRule).toContain("padding: 3px");
    expect(trackRule).toContain("width: 100%");
    expect(trackRule).toContain("min-width: 0");
    expect(trackRule).toContain("max-width: 100%");
    expect(buttonRule).toContain("min-height: 36px");
    expect(buttonRule).toContain("min-width: 0");
    expect(buttonRule).toContain("overflow: hidden");
    expect(labelRule).toContain("white-space: normal");
    expect(labelRule).toContain("overflow-wrap: anywhere");
    expect(fallbackFocusRule).toContain("outline: none");
    expect(fallbackFocusRule).toContain(
      "box-shadow: inset 0 0 0 2px var(--kt-pri)"
    );
    expect(fallbackFocusRule).not.toContain("color-mix");
    expect(enhancedFocusRule).toContain("outline: none");
    expect(enhancedFocusRule).toContain("box-shadow: inset");
    expect(OPTIONS_STYLES).toContain("@supports selector(:focus-visible)");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.MuiSwitch-root\.MuiSwitch-sizeSmall \.MuiSwitch-switchBase\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/
    );
  });
});

describe("settings layout boundaries", () => {
  test("draws the search focus ring on the pill container", () => {
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-search:focus-within\s*\{[^}]*outline:\s*3px solid var\(--kt-pri\);[^}]*outline-offset:\s*2px;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-m3-root \.kt-options-search input:focus\s*\{[^}]*outline:\s*none;/
    );
    const focusVisibleBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@supports selector(:focus-visible)"
    );
    expect(
      focusVisibleBodies.some((body) =>
        /\.kt-m3-root \.kt-options-search input:focus-visible\s*\{[^}]*outline:\s*none;/.test(
          body
        )
      )
    ).toBe(true);
  });

  test("keeps layout grids flat and scopes prose list spacing", () => {
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-options-page \.MuiGrid-container\s*\{[^}]*border/
    );
    expect(OPTIONS_STYLES).not.toMatch(/\.kt-options-page ul/);
    expect(OPTIONS_STYLES).toMatch(/\.kt-about-markdown ul/);
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-card\s*\{[^}]*list-style:\s*none;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-overview-settings > \.MuiGrid-container\s*\{[^}]*border:\s*1px solid var\(--kt-linev\);[^}]*border-radius:\s*12px;/
    );

    const overviewGridRule = OPTIONS_STYLES.match(
      /\.kt-overview-settings > \.MuiGrid-container\s*\{([^}]*)\}/
    )?.[1];
    expect(overviewGridRule).toContain("width: 100%");
    expect(overviewGridRule).toContain("margin: 0");
    expect(OPTIONS_STYLES).not.toMatch(
      /\.kt-options-page > \.MuiBox-root > \.MuiStack-root\s*\{[^}]*gap:/
    );

    const formControlLabelRule = OPTIONS_STYLES.match(
      /\.kt-options-page \.MuiFormControlLabel-root\s*\{([^}]*)\}/
    )?.[1];
    expect(formControlLabelRule).toContain("margin-inline: 0");
    expect(formControlLabelRule).not.toMatch(/(?:^|;)\s*margin:\s*0/);
    expect(formControlLabelRule).not.toContain("background");
    expect(formControlLabelRule).not.toContain("padding");
    expect(formControlLabelRule).not.toContain("border-radius");
  });

  test("owns advanced spacing outside the MUI accordion", () => {
    const shellRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced-shell\s*\{([^}]*)\}/
    )?.[1];
    const accordionRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced\.MuiAccordion-root,\s*\.kt-settings-advanced\.MuiAccordion-root\.Mui-expanded\s*\{([^}]*)\}/
    )?.[1];
    const contentRule = OPTIONS_STYLES.match(
      /\.kt-settings-advanced \.kt-settings-advanced__content\s*\{([^}]*)\}/
    )?.[1];

    expect(shellRule).toContain("margin-top: 18px");
    expect(accordionRule).toContain("margin: 0");
    expect(contentRule).not.toContain("!important");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-about-details \.kt-settings-advanced \.kt-settings-advanced__content\s*\{[^}]*padding:\s*0;/
    );
  });

  test("draws the style-library capsule group as a two-member split button", () => {
    const groupRule = OPTIONS_STYLES.match(
      /\.kt-style-split-group\s*\{([^}]*)\}/
    )?.[1];
    const leadingRule = OPTIONS_STYLES.match(
      /\.kt-style-split-group__leading\s*\{([^}]*)\}/
    )?.[1];
    const trailingRule = OPTIONS_STYLES.match(
      /\.kt-style-split-group__trailing\s*\{([^}]*)\}/
    )?.[1];
    const rotatedChevron = OPTIONS_STYLES.match(
      /\.kt-style-split-group__trailing\[aria-expanded="true"\] svg\s*\{([^}]*)\}/
    )?.[1];
    // 组：inline-flex、成员间 2px 缝、成员等高拉伸。
    expect(groupRule).toContain("display: inline-flex");
    expect(groupRule).toContain("gap: 2px");
    expect(groupRule).toContain("align-items: stretch");
    // 外 full 内 4px 胶囊收口（token 化、零 hex）。
    expect(leadingRule).toContain("border-radius: 9999px 4px 4px 9999px");
    expect(trailingRule).toContain("border-radius: 4px 9999px 9999px 4px");
    // chevron 随展开态 180°（镜像箭头钮既有语义）。
    expect(rotatedChevron).toContain("rotate(180deg)");
    for (const body of [groupRule, leadingRule, trailingRule]) {
      expect(body).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    }
  });

  test("uses the wider drawer breakpoint and container-driven narrow layout", () => {
    expect(OPTIONS_STYLES).toContain("@media (max-width: 1179px)");
    expect(OPTIONS_STYLES).toContain(
      "@container options-main (max-width: 620px)"
    );
  });

  test("collapses the style waterfall inside the container narrow layout", () => {
    // 样式瀑布流的窄屏折叠归位容器查询体系（NARROW 常量本体、两处插值
    // 自动同步）：flex 容器用 flex-direction 折叠，v1 的 grid 死属性清除；
    // 游离的 @media (max-width: 680px) 独立规则不得再出现。
    const containerBody = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@container options-main (max-width: 620px)"
    )[0];
    const fallbackBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@supports not (container-type: inline-size)"
    );
    const fallbackMediaBody = getCssAtRuleBodies(
      fallbackBodies[0],
      "@media (max-width: 656px)"
    )[0];

    for (const body of [containerBody, fallbackMediaBody]) {
      // 交叉轴必须随主轴改向同步声明：折叠为 column 后 align-items 管水平轴，
      // 基类 flex-start 会令列容器收缩左堆——窄屏须 stretch。
      expect(body).toContain(
        ".kt-style-grid { flex-direction: column; align-items: stretch; }"
      );
      // 列容器升格透明：卡成网格直接项目，宽度=网格全宽（恒不变），根除展开
      // 拉宽与同列共振捆绑。
      expect(body).toContain(".kt-style-grid__column { display: contents; }");
      // 行级豁免：样式库行窄屏保持水平、控制簇居右，不随全局 column 竖排。
      expect(
        body
      ).toContain(
        ".kt-settings-row.kt-settings-row--inline-control { flex-direction: row; align-items: center; }"
      );
      expect(body).toContain(
        ".kt-settings-row.kt-settings-row--inline-control .kt-settings-row__control { width: auto; max-width: 58%; justify-content: flex-end; }"
      );
      // 胶囊组窄屏 icon-only：文案节点隐藏但 textContent 保留（搜索恒命中）。
      expect(body).toContain(
        ".kt-style-split-group__label { display: none; }"
      );
      // 窄屏 display:contents 后网格 gap 与卡 margin-bottom 会双计间距，折叠归零卡 margin。
      expect(body).toContain(
        ".kt-style-card { margin-bottom: 0; }"
      );
      expect(body).not.toContain(
        ".kt-style-grid { grid-template-columns: 1fr; }"
      );
    }
    expect(OPTIONS_STYLES).not.toContain(
      "@media (max-width: 680px) { .kt-style-grid"
    );
  });

  test.each([
    ["options-main", 620, 656],
    ["options-main", 720, 756],
    ["playground", 760, 796],
  ])(
    "preserves the %s %ipx layout without container support at a %ipx viewport",
    (container, contentWidth, viewportWidth) => {
      const fallbackBodies = getCssAtRuleBodies(
        OPTIONS_STYLES,
        "@supports not (container-type: inline-size)"
      );
      expect(fallbackBodies).toHaveLength(1);

      const viewportBodies = getCssAtRuleBodies(
        fallbackBodies[0],
        `@media (max-width: ${viewportWidth}px)`
      );
      const containerBodies = getCssAtRuleBodies(
        OPTIONS_STYLES,
        `@container ${container} (max-width: ${contentWidth}px)`
      );
      expect(viewportBodies).toHaveLength(1);
      expect(containerBodies).toHaveLength(1);
      expect(viewportBodies[0].trim()).toBe(containerBodies[0].trim());
    }
  );

  test("keeps the sticky mobile header opaque without color-mix support", () => {
    const mobileBody = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@media (max-width: 1179px)"
    )[0];
    const headerRule = mobileBody.match(
      /\.kt-options-mobile-header\s*\{([^}]*)\}/
    )?.[1];
    expect(headerRule).toContain("background: var(--kt-bg)");
    expect(headerRule).not.toContain("color-mix");

    const enhancedBodies = getCssAtRuleBodies(
      mobileBody,
      "@supports (background: color-mix(in srgb, white 92%, transparent))"
    );
    expect(enhancedBodies).toHaveLength(1);
    expect(enhancedBodies[0]).toMatch(
      /\.kt-options-mobile-header\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--kt-bg\) 92%, transparent\);/
    );
  });

  test("lays out the Playground by its own available width", () => {
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground\s*\{[^}]*container:\s*playground \/ inline-size;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-config__grid\.MuiGrid-container\s*\{[^}]*repeat\(auto-fit, minmax\(230px, 1fr\)\)/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator\.MuiStack-root\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator__results\s*\{[^}]*grid-column:\s*2;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-translator__auxiliary\s*\{[^}]*grid-column:\s*1 \/ -1;/
    );
    expect(OPTIONS_STYLES).toContain(
      "@container playground (max-width: 760px)"
    );
  });

  test("keeps resizable Playground fields outside the rounded clip", () => {
    const textFieldRule = OPTIONS_STYLES.match(
      /\.kt-options-page \.kt-translation-text-field \.MuiInputBase-root\s*\{([^}]*)\}/
    )?.[1];

    expect(textFieldRule).toContain("overflow: visible");
    expect(textFieldRule).toContain("border-radius: 16px");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.kt-translation-text-field__actions\s*\{[^}]*right:\s*24px;[^}]*bottom:\s*24px;[^}]*z-index:\s*1;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.kt-translation-text-field \.MuiInputBase-inputMultiline\s*\{[^}]*padding:\s*30px 66px 62px 16px;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.kt-translation-text-field__actions \.MuiIconButton-root\.Mui-focusVisible\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*inset 0 0 0 3px var\(--kt-pri\);/
    );
    const forcedColorBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@media (forced-colors: active)"
    );
    const cssOutsideForcedColors = forcedColorBodies.reduce(
      (acc, body) => acc.replace(body, () => ""),
      OPTIONS_STYLES
    );
    expect(cssOutsideForcedColors).not.toMatch(
      /\.kt-translation-text-field__actions \.MuiIconButton-root\.Mui-focusVisible\s*\{[^}]*outline:\s*3px/
    );
    expect(forcedColorBodies.length).toBeGreaterThanOrEqual(1);
    expect(
      forcedColorBodies.some((body) =>
        /\.kt-options-page \.kt-translation-text-field__actions \.MuiIconButton-root\.Mui-focusVisible\s*\{[^}]*outline:\s*3px solid;[^}]*outline-offset:\s*-3px;/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      OPTIONS_STYLES.indexOf(
        ".kt-options-page .kt-translation-text-field__actions .MuiIconButton-root.Mui-focusVisible"
      )
    ).toBeLessThan(OPTIONS_STYLES.indexOf("@media (forced-colors: active)"));
    const hoverBodies = getCssAtRuleBodies(
      OPTIONS_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-translation-text-field__actions \.MuiIconButton-root:hover\s*\{[^}]*var\(--kt-onsecc\) 8%/.test(
          body
        )
      )
    ).toBe(true);
    expect(
      hoverBodies.some((body) => /\.kt-options-nav__link:hover/.test(body)) &&
        hoverBodies.some((body) =>
          /\.kt-options-sidebar__close:hover/.test(body)
        )
    ).toBe(true);
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-translation-text-field__actions \.MuiIconButton-root\.Mui-focusVisible\s*\{[^}]*var\(--kt-onsecc\) 10%/
    );
  });

  test("retains full shapes only for pill-shaped controls", () => {
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-search\s*\{[^}]*border-radius:\s*999px;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-nav__link\s*\{[^}]*border-radius:\s*999px;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-card\s*\{[^}]*border-radius:\s*12px;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-playground-config\s*\{[^}]*border-radius:\s*16px;/
    );
  });

  test("keeps wrapped rule accordions visually separated", () => {
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-options-page \.kt-rule-accordion:not\(:last-child\)\s*\{[^}]*margin-bottom:\s*8px;/
    );
  });

  test("keeps selected method cards from shifting their content", () => {
    const selectedRule = OPTIONS_STYLES.match(
      /\.kt-sync-method\[aria-checked="true"\]\s*\{([^}]*)\}/
    )?.[1];

    expect(selectedRule).toContain("border-color: var(--kt-pri)");
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-sync-method\[aria-checked="true"\] svg\s*\{[^}]*color:\s*currentColor;/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-settings-segmented > button\s*\{[^}]*transition:[^;}]*background-color[^;}]*color[^;}]*box-shadow/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-sync-method\s*\{[^}]*transition:[^;}]*background-color[^;}]*color/
    );
    expect(OPTIONS_STYLES).toMatch(
      /\.kt-sync-method__description\s*\{[^}]*transition:[^;}]*color[^;}]*opacity/
    );
    expect(selectedRule).toContain("box-shadow: inset 0 0 0 1px var(--kt-pri)");
    expect(selectedRule).not.toContain("border: 2px");
  });

  test("gives both state-layer opacity transitions a non-zero duration", () => {
    // --kt-spring 是纯缓动曲线（m3.js:185 无时长分量），transition 简写缺
    // duration 时长为 0s，hover/active 的 opacity 0→.08/.12 会直接跳变。
    // 两处 state-layer ::before 均须带 .15s（与同卡 border-color .15s 同口径）。
    for (const selector of [
      "\\.kt-style-card__toggle \\.m3-state-layer::before",
      "\\.kt-template-item \\.m3-state-layer::before",
    ]) {
      const rule = OPTIONS_STYLES.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
        ?.[1];
      expect(rule).toContain("opacity: 0");
      expect(rule).toMatch(
        /transition:\s*opacity\s+\.15s\s+var\(--kt-spring,\s*cubic-bezier\(\.3, 1\.4, \.4, 1\)\)/
      );
    }
  });
});
