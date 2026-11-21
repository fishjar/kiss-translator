import { readFileSync } from "fs";
import path from "path";

const read = (relative) =>
  readFileSync(path.resolve(__dirname, relative), "utf8");

describe("pure icon foundation boundary", () => {
  // 模块说明符按引号形态与后缀无关判定：单/双引号、带或不带 .js 与
  // /index 后缀的等价导入一视同仁。
  const STORE_IMPORT_RE =
    /from\s+['"]\.\.\/\.\.\/styles\/iconStyleStore(?:\/index)?(?:\.js)?['"]/;
  // m3 主题面包含颜色与无障碍样式，分发器只允许消费 iconStyleStore；
  // 覆盖 from 导入、副作用 import 与 require 三种装配形态。
  const M3_IMPORT_RE =
    /(?:from\s+|import\s+|require\(\s*)['"](?:\.\.\/)+styles\/m3(?:\/index)?(?:\.js)?['"]/;

  test("dispatcher imports only the icon-style store", () => {
    const dispatcher = read("index.js");
    expect(dispatcher).toMatch(STORE_IMPORT_RE);
    expect(dispatcher).not.toMatch(M3_IMPORT_RE);
  });

  test("m3 import guard covers side-effect and require forms", () => {
    const guardedForms = [
      `import "../../styles/m3";`,
      `import '../styles/m3';`,
      `import "../../styles/m3/index.js";`,
      `const m3 = require("../../styles/m3");`,
      `require('../styles/m3/index.js')`,
    ];
    for (const sample of guardedForms) {
      expect(sample).toMatch(M3_IMPORT_RE);
    }
  });

  test("icon-style store has no color or accessibility surface", () => {
    const store = read("../../styles/iconStyleStore.js");
    expect(store).not.toMatch(
      /icon[C]olor|ICON_COLO[R]_PRESETS|FOCUS_SILEN[T]_CSS|focusModalit[y]|scriptFocu[s]|--kt[-]/
    );
  });
});
