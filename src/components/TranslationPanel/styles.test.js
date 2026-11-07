import { TRANSLATION_PANEL_STYLES } from "./styles";

// 选中/按下/hover 态统一走 secondary-container 族令牌（M3 v3.1 §2.1 铁律）。
describe("TranslationPanel pressed/checked states use the secondary-container tokens", () => {
  const stateRules = (TRANSLATION_PANEL_STYLES.match(/[^{}]+\{[^}]*\}/g) ?? []).filter((rule) => /aria-pressed="true"|aria-checked="true"|button:hover/.test(rule));
    // 伪下拉对勾已移除：__menu-check 规则不再存在，stateRules 无需额外过滤。

  test("menu styles no longer contain any __menu-check rules", () => {
    const glyphRules = TRANSLATION_PANEL_STYLES.split("\n").filter(
      (line) => line.includes("{") && line.includes("__menu-check")
    );
    expect(glyphRules.length).toBe(0);
  });

  test("state rules consume the secondary-container tokens (M3 v3.1 §2.1)", () => {
    // aria-pressed="true"（按压图标钮）走 secc 族；aria-checked="true" 菜单行
    // 持久零底色（§3.1.C，状态由成对图标承载）；hover 走 State Layer 叠色。
    const seccRules = stateRules.filter((rule) =>
      /aria-pressed="true"/.test(rule)
    );
    for (const rule of seccRules) {
      expect(rule).toContain("var(--kt-secc)");
      expect(rule).toContain("var(--kt-onsecc)");
    }
    const checkedRules = stateRules.filter((rule) =>
      /aria-checked="true"/.test(rule)
    );
    expect(checkedRules).toHaveLength(1);
    expect(checkedRules[0]).toContain("background: transparent");
    expect(checkedRules[0]).not.toContain("--kt-secc");
    // hover 规则走 State Layer 叠色（color-mix currentColor 8%）。
    const hoverRules = stateRules.filter((rule) => /button:hover/.test(rule));
    for (const rule of hoverRules) {
      expect(rule).toContain("color-mix(in srgb, currentColor 8%, transparent)");
    }
  });

  test("state rules no longer consume the primary tokens for selected states", () => {
    for (const rule of stateRules) {
      expect(rule).not.toContain("--kt-pri");
      expect(rule).not.toContain("--kt-onpri");
    }
  });
});

// 菜单结构规范对齐的静态契约（容器 4dp/8px 0/边框；条目 48px/0 16px/无圆角；前置勾标）。
describe("tranbox header menu follows the M3 structural spec", () => {
  const menuRule = TRANSLATION_PANEL_STYLES.match(
    /\.kt-tranbox-header__menu\s*\{([^}]*)\}/
  )?.[1];
  const buttonRule = TRANSLATION_PANEL_STYLES.match(
    /\.kt-tranbox-header__menu button\s*\{([^}]*)\}/
  )?.[1];

  test("menu container uses the 4dp corner with 8px vertical padding and a hairline border", () => {
    expect(menuRule).toContain("border-radius: 4px");
    expect(menuRule).toContain("padding: 8px 0");
    expect(menuRule).toContain("border: 1px solid var(--kt-linev)");
  });

  test("menu buttons are 48px tall with 16px inline padding and no corner radius", () => {
    expect(buttonRule).toContain("min-height: 48px");
    expect(buttonRule).toContain("padding: 0 16px");
    expect(buttonRule).not.toContain("border-radius");
    // 菜单行内间距统一 12dp 几何口径（dropdown-audit P2-3）。
    expect(buttonRule).toContain("gap: 12px");
  });

  test("menu check glyph rules have been removed (fake dropdown check eliminated)", () => {
    expect(TRANSLATION_PANEL_STYLES).not.toContain("__menu-check");
  });


});
