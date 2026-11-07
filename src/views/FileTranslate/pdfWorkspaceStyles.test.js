import { readFileSync } from "fs";
import path from "path";

const css = readFileSync(
  path.resolve(__dirname, "PdfWorkspace.css"),
  "utf8"
);

describe("pdf workspace recognition spinner tokenization", () => {
  test("spinner color consumes the M3 primary token, not a raw hex", () => {
    const rule = css.match(/\.kt-pdf-recognition-pending\s*\{([^}]*)\}/)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toContain("color: var(--kt-pri)");
    expect(rule).not.toMatch(/color:\s*#/);
  });

  test("workspace root binds --kt-pri to the theme primary (independent entry has no .kt-m3-root)", () => {
    // 独立入口（FileTranslate 窗口）不挂 .kt-m3-root，CSS 侧 var(--kt-pri)
    // 会走继承回退、指示器颜色与主题主色脱钩；根 Box 须以 sx 把 --kt-pri
    // 绑定到 theme.palette.primary.main，令牌随主题走（css 面禁 raw hex，
    // 由上一用例锁定）。
    const src = readFileSync(path.resolve(__dirname, "PdfWorkspace.js"), "utf8");
    expect(src).toMatch(
      /"--kt-pri":\s*\(theme\)\s*=>\s*theme\.palette\.primary\.main/
    );
  });
});

describe("pdf workspace warning literal exemption (v5 T5)", () => {
  test("#b78a26 stays pinned at exactly one site with an adjacent warning-exempt comment", () => {
    // 文档警示域语义色豁免钉死：精确 1 处，且逐处相邻校验——
    // 字面量上方相邻行必须携带 warning-exempt 豁免说明
    // （slice 至字面量起点，故相邻行断言以 border-left 声明收尾）。
    expect((css.match(/#b78a26/g) || []).length).toBe(1);
    const { index } = css.match(/#b78a26/);
    expect(css.slice(0, index)).toMatch(
      /warning-exempt[^\n]*\n\s*border-left:\s*3px solid\s*$/
    );
  });
});
