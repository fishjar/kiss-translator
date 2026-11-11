import { readFileSync } from "fs";
import path from "path";
import { POPUP_STYLES } from "./styles";
import { POPUP_TEXT_STYLES } from "./PopupTextPanel.styles";
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

function getTextRuleBodies(selector) {
  return parseTopLevelRules(POPUP_TEXT_STYLES)
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
    // 展开态不得画主色环（那会被读成鼠标也带焦点框），只允许底色加深。
    for (const selector of [
      '.kt-popup-language-select[aria-expanded="true"]',
      '.kt-popup-style-select[aria-expanded="true"]',
    ]) {
      const body = getRuleBodies(selector)[0];
      expect(body).toBeDefined();
      expect(body).not.toContain("box-shadow");
      expect(body).toContain("background: var(--kt-sf");
    }
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

  test("covers the language menu paper and rows in dark mode with tokens", () => {
    const darkLangMenu = getRuleBodies(
      '.kt-m3-root[data-theme="dark"] .kt-popup-language-menu'
    )[0];
    expect(darkLangMenu).toContain("--kt-popup-muted: var(--kt-onv)");
    expect(darkLangMenu).not.toContain("--kt-popup-focus:");
    const darkLangItem = getRuleBodies(
      '.kt-m3-root[data-theme="dark"] .kt-popup-language-menu .MuiMenuItem-root'
    )[0];
    expect(darkLangItem).toContain("--kt-popup-muted: var(--kt-onv)");
    expect(darkLangItem).not.toContain("#5F6368");
  });

  test("menu rows carry no bespoke checkmark; the theme slot paints checks", () => {
    expect(POPUP_STYLES).not.toContain("--kt-popup-selected");
    // 例外：pattern-option（匹配范围单选，RadioButton 指示）恢复选中实底；
    // 其余 .MuiMenuItem-root.Mui-selected 行仍禁自带底色（选中仅由主题勾号表达）。
    const bespokeSelectedBackgrounds = parseTopLevelRules(POPUP_STYLES).filter(
      (rule) =>
        rule.members.some((selector) =>
          selector.includes(".MuiMenuItem-root.Mui-selected")
        ) &&
        rule.members.every(
          (selector) => !selector.includes("kt-popup-pattern-option")
        ) &&
        rule.body.includes("background")
    );
    expect(bespokeSelectedBackgrounds).toEqual([]);
    expect(POPUP_STYLES).not.toContain("color: var(--kt-onsec)");
    expect(POPUP_STYLES).not.toContain("kt-popup-menu-check");
    // 主题基槽勾形绘制已在 M3Theme 整体退役：Popup 菜单内不得有任何
    // ::before 勾形规则（含历史剥除/封杀规则，均已死）。
    expect(getRuleBodies(".kt-popup-menu .MuiMenuItem-root::before")).toEqual(
      []
    );
    // 选中指示唯一来源 = 行首分发器勾选字形（PopupTextPanel CheckBox 字形
    // 交换、pattern 行首 radio 图标）——历史剥除规则不得回流。
    expect(POPUP_STYLES).not.toContain(
      ".kt-popup-text-service-option.Mui-selected::before"
    );
    expect(POPUP_STYLES).not.toContain(
      ".kt-popup-pattern-option.MuiMenuItem-root::before"
    );
  });

  test("popup menu rows use the theme's currentColor 8% hover state layer", () => {
    const hoverBodies = getCssAtRuleBodies(
      POPUP_STYLES,
      "@media (hover: hover)"
    );
    expect(
      hoverBodies.some((body) =>
        /\.kt-popup-menu \.MuiMenuItem-root:hover\s*\{/.test(body)
      )
    ).toBe(true);
    expect(
      hoverBodies.some((body) =>
        body.includes("background: color-mix(in srgb, currentColor 8%, transparent)")
      )
    ).toBe(true);
  });

  test("keeps animated indicators independent of pointer targets", () => {
    const indicatorRule = getRuleBodies(".kt-popup-segment-indicator")[0];
    expect(indicatorRule).toContain("position: absolute");
    expect(indicatorRule).toContain("pointer-events: none");
    expect(indicatorRule).toContain("transition: transform");
  });

  test("text-service options keep zero persistent row background and drop the hand-drawn box", () => {
    // 整行零底色：数据多选严禁整行持久选中染色。
    const selectedRules = getTextRuleBodies(
      '.kt-popup-text-service-menu .kt-popup-text-service-option.MuiMenuItem-root[aria-checked="true"]'
    );
    expect(selectedRules).toHaveLength(0);
    // 自绘勾选盒退役：两态一律取图标分发器同族字形（components/MenuCheckGlyph），
    // 不再手绘方框与 mask 勾笔画。
    expect(getTextRuleBodies(".kt-popup-text-service-checkbox")).toHaveLength(
      0
    );
    expect(
      getTextRuleBodies(".kt-popup-text-service-checkbox--checked")
    ).toHaveLength(0);
  });

  test("pattern options paint the secondary-container when selected", () => {
    // 特异性 (0,4,0)：同上，基槽状态规则编译形态最高 (0,3,0)，此处恒胜。
    const selectedRule = getRuleBodies(
      ".kt-popup-pattern-menu .kt-popup-pattern-option.MuiMenuItem-root.Mui-selected"
    )[0];
    expect(selectedRule).toContain("background: var(--kt-secc)");
    expect(selectedRule).toContain("color: var(--kt-onsecc)");
    const svgRule = getRuleBodies(
      ".kt-popup-pattern-option.MuiMenuItem-root.Mui-selected > svg"
    )[0];
    expect(svgRule).toContain("color: var(--kt-onsecc)");
    // 选中实底上的副标题：small 的显式 --kt-onv 须被 onsecc 单独覆盖，
    // 否则 secc 底上呈现 sf0 底的次要文字色（对比不足）。
    const smallRule = getRuleBodies(
      ".kt-popup-pattern-menu .kt-popup-pattern-option.MuiMenuItem-root.Mui-selected .kt-popup-pattern-copy small"
    )[0];
    expect(smallRule).toContain("color: var(--kt-onsecc)");
    const hoverBodies = getCssAtRuleBodies(POPUP_STYLES, "@media (hover: hover)");
    expect(
      hoverBodies.some(
        (body) =>
          body.includes(
            ".kt-popup-pattern-menu .kt-popup-pattern-option.MuiMenuItem-root.Mui-selected:hover"
          ) && body.includes("color-mix(in srgb, var(--kt-onsecc) 8%, var(--kt-secc))")
      )
    ).toBe(true);
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

  test("popup display-mode micro segmentation carries the exemption note in source", () => {
    // 豁免必须代码注明：PopupCont.js 微型分段移除 Checkmark 的注记在场即锁；
    // 与上方零 ::before 断言互补。
    const source = readFileSync(path.join(__dirname, "PopupCont.js"), "utf8");
    expect(source).toContain("NARROW_SEGMENT_CHECKMARK_EXEMPTION");
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
    expect(
      (POPUP_STYLES.match(/--kt-popup-translated-text:/g) || []).length
    ).toBe(1);
    expect(
      (POPUP_STYLES.match(/--kt-popup-danger-hover:/g) || []).length
    ).toBe(1);
    expect(
      (POPUP_STYLES.match(/--kt-popup-focus:/g) || []).length
    ).toBe(1);
    expect(POPUP_STYLES).toContain(
      "color-mix(in srgb, var(--kt-on) 5%, transparent)"
    );
  });
});

describe("segmented track tokens", () => {
  test("tracks drop to sf0 and the selected segment carries secc/onsecc", () => {
    expect(getRuleBodies(".kt-popup-services-block")[0]).toContain(
      "background: var(--kt-sf0)"
    );
    expect(getRuleBodies(".kt-popup-display-mode")[0]).toContain(
      "background: var(--kt-sf0)"
    );
    expect(getRuleBodies(".kt-popup-segment-indicator")[0]).toContain(
      "background: var(--kt-secc)"
    );
    // 指示器即 services 分段的选中段承载，服务行选中文字色同批切换 onsecc。
    expect(getRuleBodies('.kt-popup-service[aria-checked="true"]')[0]).toContain(
      "color: var(--kt-onsecc)"
    );
    expect(
      getRuleBodies('.kt-popup-display-mode button[aria-checked="true"]')[0]
    ).toContain("color: var(--kt-onsecc)");
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
    expect(enabledRule).toContain("background: var(--kt-secc)");
    expect(enabledRule).toContain("color: var(--kt-onsecc)");
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
    ).toContain("box-shadow: inset 0 0 0 2px var(--kt-onsecc)");
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
