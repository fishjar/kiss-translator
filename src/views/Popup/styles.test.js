import { POPUP_STYLES } from "./styles";
import {
  getCssAtRuleBodies,
  stripTopLevelAtRuleBlocks,
} from "../../styles/testUtils";

// Remove comments and balanced at-rule blocks before parsing flat rules.
function parseTopLevelRules(css) {
  const stripped = stripTopLevelAtRuleBlocks(css);
  return [...stripped.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    members: match[1].split(",").map((selector) => selector.trim()),
    body: match[2],
  }));
}

function getRuleBodies(selector) {
  return parseTopLevelRules(POPUP_STYLES)
    .filter((rule) => rule.members.includes(selector))
    .map((rule) => rule.body);
}

describe("toolbar popup sizing", () => {
  test("exposes natural dimensions for native popup autosizing", () => {
    const shellRule = getRuleBodies(".kt-popup-shell")[0];
    const scrollRule = getRuleBodies(".kt-popup-scroll")[0];

    expect(shellRule).toContain("width: 396px");
    expect(shellRule).toContain("max-width: none");
    expect(shellRule).toContain("min-width: 0");
    expect(shellRule).toContain("max-height: none");
    expect(shellRule).toContain("overflow: visible");
    expect(shellRule).not.toMatch(/overflow-[xy]:/);
    expect(shellRule).not.toMatch(/max-(?:width|height):\s*100v[wh]/);
    expect(scrollRule).toContain("height: auto");
    expect(scrollRule).toContain("overflow: visible");
    expect(POPUP_STYLES).not.toContain("kt-popup-scroll--expanded");
    expect(getRuleBodies(".kt-popup-shell--text")[0]).toContain(
      "min-height: var(--kt-popup-page-height)"
    );
    expect(
      getRuleBodies(".kt-popup-shell--text > .kt-popup-scroll--text")[0]
    ).toContain("overflow: visible");
    expect(getRuleBodies("html.kt-toolbar-popup--text")[0]).toContain(
      "overflow-y: auto"
    );
    expect(getRuleBodies(".kt-popup-chrome")[0]).toContain("position: sticky");
  });

  test("lets the theme own the on-primary token", () => {
    expect(POPUP_STYLES).not.toMatch(/--kt-onpri\s*:/);
  });

  test("does not clip service focus rings or change layout for open menus", () => {
    const servicesRule = getRuleBodies(".kt-popup-services")[0];
    expect(servicesRule).toContain("overflow: visible");
    expect(servicesRule).not.toContain("overflow: hidden");
    expect(POPUP_STYLES).not.toContain("kt-popup-services--open");
    expect(POPUP_STYLES).not.toContain("kt-popup-style-chips--open");
  });

  test("does not constrain native autosizing to its initial short viewport", () => {
    const shortViewportRules = getCssAtRuleBodies(
      POPUP_STYLES,
      "@media (max-height: 599px)"
    );
    expect(shortViewportRules).toEqual([]);
    expect(getRuleBodies(".kt-popup-shell:focus")[0]).toContain(
      "outline: none"
    );
    expect(getRuleBodies(".kt-popup-shell:focus-visible")[0]).toContain(
      "outline: none"
    );
  });

  test("contains long language labels independently of their controls", () => {
    const labelRule = getRuleBodies(".kt-popup-language-value")[0];
    expect(labelRule).toContain("min-width: 0");
    expect(labelRule).toContain("text-overflow: ellipsis");
    expect(labelRule).toContain("white-space: nowrap");
    const controlRule = getRuleBodies(".kt-popup-language-select")[0];
    expect(controlRule).not.toContain("overflow: hidden");
  });
});

describe("popup menus", () => {
  test("contains scrolling inside theme-aware menus", () => {
    const menuRule = getRuleBodies(".kt-popup-menu.MuiPaper-root")[0];
    expect(menuRule).toContain("width: max-content");
    expect(menuRule).toContain("overflow-y: auto");
    expect(menuRule).toContain("overscroll-behavior: contain");
    expect(menuRule).toContain("background: var(--kt-sf0)");
    expect(menuRule).toContain("color: var(--kt-on)");
    expect(menuRule).toContain("border-radius: 4px");
    expect(menuRule).toContain("padding: 8px 0");
    expect(menuRule).toContain("border: 1px solid var(--kt-linev)");
    const languageRule = getRuleBodies(".kt-popup-language-menu.MuiPaper-root");
    expect(
      languageRule.some((body) => body.includes("scrollbar-gutter: stable"))
    ).toBe(true);
    expect(
      languageRule.some((body) =>
        body.includes("min(320px, calc(100% - 16px))")
      )
    ).toBe(true);
  });

  test("menu rows carry no bespoke checkmark; the theme slot paints checks", () => {
    expect(POPUP_STYLES).not.toContain("--kt-popup-selected");
    expect(POPUP_STYLES).not.toMatch(
      /\.MuiMenuItem-root\.Mui-selected[^{]*\{[^}]*background/
    );
    expect(POPUP_STYLES).not.toContain("color: var(--kt-onsec)");
    expect(POPUP_STYLES).not.toContain("kt-popup-menu-check");
    // 主题基槽必须在 Popup 菜单内保持存活，否则选中行无任何勾指示。
    expect(getRuleBodies(".kt-popup-menu .MuiMenuItem-root::before")).toEqual(
      []
    );
    // 多选行以自带 checkbox 为唯一指示，主题勾绘制须剥离（槽几何保留）。
    expect(
      getRuleBodies(".kt-popup-text-service-option.Mui-selected::before")[0]
    ).toContain("mask-image: none");
    // 匹配范围菜单为单指示：radio 对 20px 恒挂载承担指示位，主题基槽整体剥除。
    expect(
      getRuleBodies(".kt-popup-pattern-option.MuiMenuItem-root::before")[0]
    ).toContain("content: none");
  });

  test("keeps animated indicators independent of pointer targets", () => {
    const indicatorRule = getRuleBodies(".kt-popup-segment-indicator")[0];
    expect(indicatorRule).toContain("position: absolute");
    expect(indicatorRule).toContain("pointer-events: none");
    expect(indicatorRule).toContain("transition: transform");
  });

  test("segmented rows carry no ::before checkmark slot (toggle switches must not render a check)", () => {
    expect(getRuleBodies(".kt-popup-display-mode button::before")).toHaveLength(0);
    expect(
      getRuleBodies('.kt-popup-display-mode button[aria-checked="true"]::before')
    ).toHaveLength(0);
    expect(getRuleBodies(".kt-popup-global-feature::before")).toHaveLength(0);
    expect(
      getRuleBodies('.kt-popup-global-feature[aria-pressed="true"]::before')
    ).toHaveLength(0);
  });

  test("menu geometry follows the spec: gap 12, chip 32, switch 52x32 with press states", () => {
    expect(getRuleBodies(".kt-popup-pattern-option.MuiMenuItem-root")[0]).toContain(
      "gap: 12px"
    );
    expect(getRuleBodies(".kt-popup-service-option.MuiMenuItem-root")[0]).toContain(
      "gap: 12px"
    );
    expect(
      getRuleBodies(".kt-popup-language-option.MuiMenuItem-root")[0]
    ).toContain("gap: 12px");
    expect(
      getRuleBodies(".kt-popup-language-menu .MuiMenuItem-root")[0]
    ).toContain("gap: 12px");
    expect(getRuleBodies(".kt-popup-style-grid")[0]).toContain(
      "grid-auto-rows: 32px"
    );
    expect(getRuleBodies(".kt-popup-style-chip")[0]).toContain("height: 32px");
    const switchRule = getRuleBodies(".kt-popup-switch")[0];
    expect(switchRule).toContain("width: 52px");
    expect(switchRule).toContain("height: 32px");
    expect(switchRule).toContain("border: 1.5px solid var(--kt-line)");
    const thumbRule = getRuleBodies(".kt-popup-switch > span")[0];
    expect(thumbRule).toContain("width: 16px");
    expect(thumbRule).toContain("height: 16px");
    const checkedThumbRule = getRuleBodies(
      '.kt-popup-switch[data-checked="true"] > span'
    )[0];
    expect(checkedThumbRule).toContain("width: 24px");
    expect(checkedThumbRule).toContain("height: 24px");
    const pressRule = getRuleBodies("button:active > .kt-popup-switch > span")[0];
    expect(pressRule).toContain("width: 28px");
    const pressCheckedRule = getRuleBodies(
      'button:active > .kt-popup-switch[data-checked="true"] > span'
    )[0];
    expect(pressCheckedRule).toContain("left: 21px");
  });

  test("popup light-mode defaults consume tokens instead of hardcoded literals", () => {
    expect(POPUP_STYLES).not.toContain("#A8C7FA");
    expect(POPUP_STYLES).not.toContain("#0842A0");
    expect(POPUP_STYLES).not.toContain("#FCEEEE");
    expect(POPUP_STYLES).not.toContain("rgba(31,31,31");
    expect(POPUP_STYLES).toContain("var(--kt-popup-focus, var(--kt-pri))");
    expect(POPUP_STYLES).toContain("--kt-popup-translated-text: var(--kt-onpric)");
    expect(POPUP_STYLES).toContain("--kt-popup-danger-hover: var(--kt-errc)");
    expect(POPUP_STYLES).toContain(
      "color-mix(in srgb, var(--kt-on) 5%, transparent)"
    );
  });
});

describe("persistent global feature segments", () => {
  test("shares available width without inheriting blocked site dimming", () => {
    const groupRule = getRuleBodies(".kt-popup-global-features")[0];
    const segmentRule = getRuleBodies(".kt-popup-global-feature")[0];
    expect(groupRule).toContain("height: 38px");
    expect(groupRule).toContain("display: flex");
    expect(groupRule).toContain("border: 1px solid var(--kt-sf4)");
    expect(groupRule).toContain("border-radius: 12px");
    expect(segmentRule).toContain("flex: 1");
    expect(segmentRule).toContain("min-width: 0");
    expect(segmentRule).toContain("height: 36px");
    expect(
      getRuleBodies(".kt-popup-global-feature + .kt-popup-global-feature")[0]
    ).toContain("border-left: 1px solid var(--kt-sf4)");
    const featureRules = parseTopLevelRules(POPUP_STYLES).filter((rule) =>
      rule.members.some((selector) =>
        selector.includes("kt-popup-global-feature")
      )
    );
    for (const rule of featureRules) {
      expect(rule.members.join(" ")).not.toContain("--blocked");
      expect(rule.body).not.toMatch(/opacity:\s*\.38|pointer-events:\s*none/);
    }
    expect(POPUP_STYLES).not.toContain("kt-popup-header__global");
    expect(POPUP_STYLES).not.toContain("kt-popup-header__badge");
    expect(POPUP_STYLES).not.toContain("kt-popup-global-menu");
  });

  test("keeps enabled, disabled, pending and failure states visibly distinct", () => {
    const enabledRule = getRuleBodies(
      '.kt-popup-global-feature[aria-pressed="true"]'
    )[0];
    expect(enabledRule).toContain("background: var(--kt-pri)");
    expect(enabledRule).toContain("color: var(--kt-onpri)");
    expect(getRuleBodies(".kt-popup-global-feature")[0]).toContain(
      "color: var(--kt-onv)"
    );
    expect(
      getRuleBodies('.kt-popup-global-feature[aria-busy="true"]')[0]
    ).toContain("opacity: 1");
    expect(
      getRuleBodies('.kt-popup-global-feature[data-error="true"]')[0]
    ).toContain("color: var(--kt-err)");
    expect(getRuleBodies(".kt-popup-global-feature > span")[0]).toContain(
      "text-overflow: ellipsis"
    );
    expect(
      getRuleBodies(".kt-popup-global-feature:focus-visible")[0]
    ).toContain("box-shadow: inset");
    expect(
      getRuleBodies(
        '.kt-popup-global-feature[aria-pressed="true"]:focus-visible'
      )[0]
    ).toContain("box-shadow: inset 0 0 0 2px var(--kt-onpri)");
  });
});

describe("separate translation window layout", () => {
  const windowShellRule = getRuleBodies(".kt-popup-shell--window")[0];
  const panelRule = getRuleBodies(
    ".kt-popup-shell--window .kt-popup-text-panel"
  )[0];
  const textareaSelector =
    '.kt-popup-shell--window .kt-translation-result textarea:not([aria-hidden="true"])';

  test("fills the native window without applying toolbar popup constraints", () => {
    expect(windowShellRule).toContain("width: 100%");
    expect(windowShellRule).toContain("max-height: none");
    expect(windowShellRule).toContain("overflow: visible");
    expect(windowShellRule).toContain("min-height: 100dvh");
    expect(windowShellRule).not.toContain("min-height: 100vh");
    expect(windowShellRule).not.toMatch(/width:\s*min\(/);
    expect(panelRule).toContain("width: 100%");
    expect(panelRule).toContain("min-width: 0");
    expect(panelRule).toContain("margin: 0");
    expect(panelRule).not.toContain("margin-inline: auto");
  });

  test("does not animate geometry while fitting the standalone window", () => {
    expect(
      getRuleBodies(".kt-popup-shell--window .kt-popup-text-panel").some(
        (body) => body.includes("animation: none")
      )
    ).toBe(true);
  });

  test("keeps source and results compact without forced stretch or oversized min-height", () => {
    const panelBodies = getRuleBodies(
      ".kt-popup-shell--window .kt-popup-text-panel"
    );
    expect(panelBodies.some((body) => body.includes("display: flex"))).toBe(
      true
    );
    expect(
      panelBodies.some((body) => body.includes("flex-direction: column"))
    ).toBe(true);
    expect(
      panelBodies.some((body) => body.includes("min-height: 100dvh"))
    ).toBe(true);
    const sourceRule = getRuleBodies(
      '.kt-popup-shell--window .kt-translation-source textarea:not([aria-hidden="true"])'
    )[0];
    expect(sourceRule).toContain("min-height: 28px");
    expect(sourceRule).not.toContain("min-height: 72px");
    const resultRule = getRuleBodies(
      ".kt-popup-shell--window .kt-translation-result"
    )[0];
    expect(resultRule).toContain("flex: 0 0 auto");
    expect(resultRule).toContain("min-height: 0");
    expect(resultRule).not.toContain("min-height: 180px");
    const textareaRule = getRuleBodies(textareaSelector)[0];
    expect(textareaRule).toContain("min-height: 28px");
    expect(textareaRule).not.toContain("min-height: 140px");
    expect(textareaRule).not.toContain("height: auto !important");
    expect(textareaRule).not.toContain("flex: 1");
  });

  test("leaves textarea resize ownership to TranCont and preserves locked height", () => {
    const textareaRule = getRuleBodies(textareaSelector)[0];
    expect(textareaRule).toBeDefined();
    expect(textareaRule).not.toMatch(/resize\s*:/);
    expect(textareaRule).not.toMatch(/(?:^|[^-])height\s*:/);
    // Higher specificity keeps the locked height independent of injection order.
    const lockedRule = getRuleBodies(
      '.kt-popup-shell--window .kt-translation-result .kt-height-locked textarea:not([aria-hidden="true"])'
    )[0];
    expect(lockedRule).toBeDefined();
    expect(lockedRule).toContain("height: 100% !important");
  });
});

describe("popup stylesheet top-level rule parsing", () => {
  test("parses commented rules without polluted selectors", () => {
    const cssRules = parseTopLevelRules(POPUP_STYLES);
    const textareaRule = cssRules.find((rule) =>
      rule.members.includes(
        '.kt-popup-shell--window .kt-translation-result textarea:not([aria-hidden="true"])'
      )
    );
    expect(textareaRule).toBeDefined();
    expect(textareaRule.body).toContain("min-height: 28px");
    for (const rule of cssRules) {
      for (const member of rule.members) {
        expect(member.startsWith("@")).toBe(false);
        expect(member).not.toContain("{");
      }
    }
  });
});

describe("stripTopLevelAtRuleBlocks (shared at-rule stripper)", () => {
  test("strips keyframes blocks", () => {
    const css =
      "@keyframes spin { from { transform: none; } to { transform: rotate(1turn); } } .a { color: red; }";
    const result = stripTopLevelAtRuleBlocks(css);
    expect(result).not.toContain("@keyframes");
    expect(result).toContain(".a { color: red; }");
  });

  test("strips nested at-rules", () => {
    const css =
      "@media (max-width: 100px) { @supports (display: grid) { .b { display: grid; } } } .c { margin: 0; }";
    const result = stripTopLevelAtRuleBlocks(css);
    expect(result).not.toContain("@media");
    expect(result).not.toContain("@supports");
    expect(result).not.toContain(".b");
    expect(result).toContain(".c { margin: 0; }");
  });

  test("keeps plain rules and blockless at-statements", () => {
    const css = "@import url(x.css); .d { color: blue; } .e { color: green; }";
    const result = stripTopLevelAtRuleBlocks(css);
    expect(result).toContain("@import url(x.css);");
    expect(result).toContain(".d { color: blue; }");
    expect(result).toContain(".e { color: green; }");
  });

  test("normalizes non-string input", () => {
    expect(stripTopLevelAtRuleBlocks(undefined)).toBe("");
    expect(stripTopLevelAtRuleBlocks(null)).toBe("");
  });

  test("keeps incomplete at-rules as plain text without hanging", () => {
    expect(stripTopLevelAtRuleBlocks("@media")).toBe("@media");
    const unclosed = stripTopLevelAtRuleBlocks("@media { .a { color: red }");
    expect(unclosed).toContain("@media");
    expect(unclosed).toContain(".a { color: red }");
  });
});
