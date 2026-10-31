import { TRANSLATION_PANEL_STYLES } from "./styles";

// 选中/按下/hover 态统一走主色强形态 token 的静态契约（规则文本不变式）。
describe("TranslationPanel pressed/checked states use the primary strong selected tokens", () => {
  const stateRules = (TRANSLATION_PANEL_STYLES.match(/[^{}]+\{[^}]*\}/g) ?? []).filter((rule) => /aria-pressed="true"|aria-checked="true"|button:hover/.test(rule));
    // 伪下拉对勾已移除：__menu-check 规则不再存在，stateRules 无需额外过滤。

  test("menu styles no longer contain any __menu-check rules", () => {
    const glyphRules = TRANSLATION_PANEL_STYLES.split("\n").filter(
      (line) => line.includes("{") && line.includes("__menu-check")
    );
    expect(glyphRules.length).toBe(0);
  });

  test("pressed, checked and hover state rules consume the primary tokens", () => {
    expect(stateRules.length).toBe(5);
    for (const rule of stateRules) {
      expect(rule).toContain("var(--kt-pri)");
      expect(rule).toContain("var(--kt-onpri)");
    }
  });

  test("state rules no longer consume the secondary container tokens", () => {
    for (const rule of stateRules) {
      expect(rule).not.toContain("--kt-secc");
      expect(rule).not.toContain("--kt-onsecc");
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
