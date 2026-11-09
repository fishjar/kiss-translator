import { readFileSync } from "fs";
import path from "path";

const source = readFileSync(path.resolve(__dirname, "State.js"), "utf8");
// 首跑验红时故意写成 "#0B57D1"，确认断言敏感性后改回 "#0B57D0"（步骤 7）。
const LITERAL = "#0B57D0";

describe("State.js switch accent pinning (literal ≡ domain theme primary)", () => {
  test("domain theme primary is pinned to the declared literal", () => {
    expect(source).toContain('primary: { main: "#0B57D0" }');
    expect(LITERAL).toBe("#0B57D0");
  });

  test("literal occurrences stay pinned (drift tripwire on either side)", () => {
    // 7 处＝主题 palette.primary.main ＋ MuiMenuItem focusVisible 环（浅色档）＋
    // switchBase focusVisible 环（浅色档）＋ 选中轨道 borderColor/backgroundColor ＋
    // 两处同值契约注释。指涉一律用节名，不写行号。
    expect((source.match(/#0B57D0/g) || []).length).toBe(7);
  });

  test("dark focus ring literal stays pinned to the m3 dark primary", () => {
    // 2 处＝MuiMenuItem 与 switchBase 焦点环的暗色档字面量（三元分支各一）。
    expect((source.match(/#A8C7FA/g) || []).length).toBe(2);
  });

  test("no foreign accent literal invades the switch outline contract", () => {
    // 改钉裸色值串：焦点环色值二态化后 outline 与色值分属不同行，
    // 裸色值串口径同时覆盖静态与三元两种形态，白名单为 0B57D0|A8C7FA 双档。
    expect(source).not.toMatch(/"3px solid #(?!0B57D0|A8C7FA)/);
  });

  test("the switch focus ring is structurally present and tied to the domain primary", () => {
    // 结构契约：环必须挂在 switchBase 的 focusVisible 上（兼容静态对象与
    // ({ theme }) => 函数两种形态），描边色同时含浅/暗两档字面量与 offset——
    // 防止"环被删/被换成他色/暗档缺失"这类静默退化。
    const switchBase = source.match(
      /switchBase:\s*(?:\(\{\s*theme\s*\}\)\s*=>\s*\(\s*)?\{[\s\S]*?"&\.Mui-focusVisible":\s*\{([^}]*)\}/
    )?.[1];
    expect(switchBase).toBeDefined();
    expect(switchBase).toContain("outline:");
    expect(switchBase).toContain('"3px solid #0B57D0"');
    expect(switchBase).toContain('"3px solid #A8C7FA"');
    expect(switchBase).toContain("outlineOffset: 2");
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
});
