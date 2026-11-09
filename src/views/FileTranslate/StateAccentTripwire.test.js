import { readFileSync } from "fs";
import path from "path";
import { hslToHex, resolveM3Colors } from "../../styles/m3";

const source = readFileSync(path.resolve(__dirname, "State.js"), "utf8");

describe("State.js switch accent pinning (literal ≡ domain theme primary)", () => {
  test("domain theme primary is pinned to the declared literal", () => {
    // 主色三元：iconColor 未桥接时回落声明字面量（桥接后走 m3 自适应族），
    // 回落档必须仍钉死在本字面量上，防桥接改动把默认主色悄悄换掉。
    // 三元经 prettier 换行，用空白容忍的形态匹配。
    expect(source).toMatch(
      /primary:\s*context\.iconColor\s*\?\s*\{\s*main:\s*accentColors\.primary\s*\}\s*:\s*\{\s*main:\s*"#0B57D0"\s*\}/
    );
  });

  test("dark focus ring literal stays pinned to the m3 dark primary", () => {
    // 至少 3 处暗档字面量回退（MuiMenuItem、switchBase、:has() 兜底）：
    // 浅档走主题主色引用后，暗档回退是 #A8C7FA 在源中仅存的形态。
    expect((source.match(/#A8C7FA/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  test("light ring tracks the domain theme primary and dark ring keeps the literal fallback", () => {
    // 浅档焦点环走主题主色引用（iconColor 桥接后随 accent 联动）；暗档保留
    // 定型字面量回退——默认 accent 色相（DEFAULT_ICON_COLOR #90b2ba，teal 系）
    // 不等于暗色焦点环定型色 #A8C7FA，且对比度闸按 #A8C7FA 钉死。
    expect(source).toMatch(/3px solid \$\{theme\.palette\.primary\.main\}/);
    expect(source).toMatch(
      /3px solid \$\{\s*context\.iconColor\s*\?\s*accentColors\.primary\s*:\s*"#A8C7FA"/
    );
  });

  test("the switch focus ring is structurally present and tied to the domain primary", () => {
    // 结构契约：环必须挂在 switchBase 的 focusVisible 上，描边浅档走主题
    // 主色引用、暗档走字面量回退三元，offset 必须在场——防止"环被删/
    // 被换成他色/暗档缺失"这类静默退化。捕获窗以 outlineOffset 收口：
    // 模板字符串内嵌 ${} 的右括号会截断 [^}] 型捕获。
    const switchBase = source.match(
      /switchBase:\s*(?:\(\{\s*theme\s*\}\)\s*=>\s*\(\s*)?\{[\s\S]*?"&:focus-visible":\s*\{([\s\S]*?outlineOffset: 2)\s*,\s*\}/
    )?.[1];
    expect(switchBase).toBeDefined();
    expect(switchBase).toContain("outline:");
    // 空白归一为单空格：prettier 换行/缩进不影响形态匹配，token 间距保留。
    const flat = switchBase.replace(/\s+/g, " ");
    expect(flat).toContain("3px solid ${theme.palette.primary.main}");
    expect(flat).toContain(
      'context.iconColor ? accentColors.primary : "#A8C7FA"'
    );
    expect(flat).toContain("outlineOffset: 2");
    expect(source).toMatch(
      /"@supports selector\(:has\(\*\)\)":\s*\{[\s\S]*?"&:has\(\.MuiSwitch-input:focus-visible\)":\s*\{([\s\S]*?)\}/
    );
  });

  test("dark-mode focus ring contrast meets the WCAG non-text floor", () => {
    const m3 = readFileSync(
      path.resolve(__dirname, "../../styles/m3.js"),
      "utf8"
    );
    expect(m3).toContain('surface: "#1E1F20"');
    // 暗色焦点环取 m3.js 暗色档 primary 定型值（颜色体系既有档位，非新造色）。
    const DARK_LITERAL = "#A8C7FA";
    const lum = (hex) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) =>
          c > 0.03928 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
        )
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
    const ratio = (lum(DARK_LITERAL) + 0.05) / (lum("#1E1F20") + 0.05);
    const measured = Number(ratio.toFixed(3));
    // 缺口已由暗色 #A8C7FA 焦点环闭环（实测 ≈9.6:1 ≥ 3:1）。
    expect(measured).toBeGreaterThanOrEqual(3);
  });

  test("the checked thumb pairs with the bridged track via the family onPrimary", () => {
    // 桥接暗档选中轨道为自适应族亮色（L≈70），固定白 thumb 对比不足 3:1
    // （如 #b3a2c3 对白 2.37:1）且轨道无独立边界；thumb 须与轨道同族配对
    // （on-primary 配 primary），未桥接档轨道为定型深蓝、白 thumb 对比
    // 充足维持原样。抽样色相上 thumb(同族 onPrimary) 对轨道(同族 primary)
    // 不得低于 3:1。
    const checked = source.match(
      /"&\.Mui-checked":\s*\{([\s\S]*?)"& \+ \.MuiSwitch-track"/
    )?.[1];
    expect(checked).toBeDefined();
    const flat = checked.replace(/\s+/g, " ");
    expect(flat).toContain("context.iconColor ? accentColors.onPrimary");
    expect(flat).toContain(': "#fff"');
    const lum = (hex) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) =>
          c > 0.03928 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
        )
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
    const hues = [0, 59.5, 60, 65, 92.9, 191.4, 220, 270, 337.1];
    for (const hue of hues) {
      const accent = resolveM3Colors("dark", "blue", hslToHex(hue, 32, 34));
      const ratio =
        (lum(accent.primary) + 0.05) / (lum(accent.onPrimary) + 0.05);
      expect(Number(ratio.toFixed(3))).toBeGreaterThanOrEqual(3);
    }
  });

  test("iconColor-bridged dark focus ring meets the same contrast floor", () => {
    // iconColor 桥接后的暗档环走 accentColors.primary（resolveM3Colors 自
    // 适应族）：抽样全部合法色相，桥接环对暗底均不低于同一 3:1 下限。
    const lum = (hex) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) =>
          c > 0.03928 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
        )
        .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);
    const hues = [0, 59.5, 60, 65, 92.9, 191.4, 220, 270, 337.1];
    for (const hue of hues) {
      // iconColor 存储格式为连续色相环 Hex：以该色相的图标色作为桥接入参。
      const accent = resolveM3Colors("dark", "blue", hslToHex(hue, 32, 34));
      const ratio = (lum(accent.primary) + 0.05) / (lum("#1E1F20") + 0.05);
      expect(Number(ratio.toFixed(3))).toBeGreaterThanOrEqual(3);
    }
  });
});
