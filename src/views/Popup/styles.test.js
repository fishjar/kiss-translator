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
  test("keeps an intrinsic preferred width and scrolls at the popup boundary", () => {
    const shellRule = getRuleBodies(".kt-popup-shell")[0];
    const scrollRule = getRuleBodies(".kt-popup-scroll")[0];

    expect(shellRule).toContain("width: 396px");
    expect(shellRule).toContain("max-width: 100%");
    expect(shellRule).toContain("min-width: 0");
    expect(shellRule).toContain("max-height: 600px");
    expect(shellRule).toContain("overflow-y: auto");
    expect(shellRule).toContain("scrollbar-width: thin");
    expect(shellRule).not.toMatch(/max-(?:width|height):\s*100v[wh]/);
    expect(scrollRule).toContain("height: auto");
    expect(scrollRule).toContain("overflow: visible");
    expect(POPUP_STYLES).not.toContain("kt-popup-scroll--expanded");
    expect(POPUP_STYLES).not.toContain("kt-popup-scroll--text");
    expect(getRuleBodies(".kt-popup-chrome")[0]).toContain("position: sticky");
  });

  test("does not clip service focus rings or change layout for open menus", () => {
    const servicesRule = getRuleBodies(".kt-popup-services")[0];
    expect(servicesRule).toContain("overflow: visible");
    expect(servicesRule).not.toContain("overflow: hidden");
    expect(POPUP_STYLES).not.toContain("kt-popup-services--open");
    expect(POPUP_STYLES).not.toContain("kt-popup-style-chips--open");
  });

  test("keeps scrolling inside short toolbar viewports", () => {
    const shortViewportRules = getCssAtRuleBodies(
      POPUP_STYLES,
      "@media (max-height: 599px)"
    );
    expect(
      shortViewportRules.some((body) =>
        body.includes(
          ".kt-popup-shell:not(.kt-popup-shell--window):not(.kt-popup-shell--content) { max-height: 100dvh; }"
        )
      )
    ).toBe(true);
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
    expect(menuRule).toContain("border-radius: 12px");
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

  test("keeps animated indicators independent of pointer targets", () => {
    const indicatorRule = getRuleBodies(".kt-popup-segment-indicator")[0];
    expect(indicatorRule).toContain("position: absolute");
    expect(indicatorRule).toContain("pointer-events: none");
    expect(indicatorRule).toContain("transition: transform");
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

  test("stretches an unlocked result through an unbroken flex chain", () => {
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
    const resultRule = getRuleBodies(
      ".kt-popup-shell--window .kt-translation-result"
    )[0];
    expect(resultRule).toContain("flex: 1");
    expect(resultRule).toContain("display: flex");
    expect(resultRule).toContain("flex-direction: column");
    expect(resultRule).toContain("min-height: 180px");
    const formControlBodies = getRuleBodies(
      ".kt-popup-shell--window .kt-translation-result > .MuiFormControl-root"
    );
    expect(formControlBodies.some((body) => body.includes("flex: 1"))).toBe(
      true
    );
    const inputBaseBodies = getRuleBodies(
      ".kt-popup-shell--window .kt-translation-result .MuiInputBase-root"
    );
    expect(inputBaseBodies.some((body) => body.includes("flex: 1"))).toBe(true);
    expect(
      inputBaseBodies.some((body) => body.includes("align-items: stretch"))
    ).toBe(true);
    const textareaRule = getRuleBodies(textareaSelector)[0];
    expect(textareaRule).toContain("flex: 1");
    expect(textareaRule).toContain("min-height: 140px");
    expect(textareaRule).toContain("height: auto !important");
    expect(textareaRule).toContain("overflow-y: auto !important");
  });

  test("leaves textarea resize ownership to TranCont and preserves locked height", () => {
    const textareaRule = getRuleBodies(textareaSelector)[0];
    expect(textareaRule).toBeDefined();
    expect(textareaRule).not.toMatch(/resize\s*:/);
    expect(textareaRule.replace("height: auto !important", "")).not.toMatch(
      /(?:^|[^-])height\s*:/
    );
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
    expect(textareaRule.body).toContain("flex: 1");
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
