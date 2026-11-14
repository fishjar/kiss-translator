// 分发纯度闸：非测试、非分发器装配源的源码
// 不得直连 @mui/icons-material/*，必须从 components/icons 取图标。先于任何
// 调用点修改落此文件即红（7 个 P0 目标命中）。
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set([
  "node_modules", "build", ".git", ".kilo", "coverage", "public", "testdata", "tmp",
]);
// 分发器本体与生成器天然 import MUI/Lucide 上游，逐字豁免。
const ALLOWED_IMPORTERS = new Set([
  path.join(SRC, "components", "icons", "index.js"),
  path.join(SRC, "components", "icons", "lucide", "index.js"),

]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(entry) ? [] : walk(full);
    if (!/\.(js|jsx)$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

// 直连 MUI 图标的三种形态：带 from 的具名/默认导入、裸副作用导入、动态导入。
// 只查 from 形态会让后两种静默绕过纯度闸。
// 关键字/调用名与模块说明符之间的间隙：零空白或任意注释序列均可，语义不变。
// 块注释用展开式量词（[^*]*\*+(?:[^/*][^*]*\*+)*）杜绝嵌套量词指数回溯；
// 三个可选分支首字符互斥（空白 / 块注释 / 行注释），星号循环每位置至多一条
// 可行分支，无歧义。静态 from/裸 import 与动态 import()/require() 共用。
const GAP = "\\s*(?:\\/\\*[^*]*\\*+(?:[^/*][^*]*\\*+)*\\/\\s*|\\/\\/[^\\n]*\\s*)*";
const DIRECT_MUI_ICON_IMPORT_PATTERNS = [
  new RegExp(`from${GAP}["']@mui\\/icons-material(?:\\/|["'])`),
  new RegExp(`import${GAP}["']@mui\\/icons-material(?:\\/|["'])`),
  new RegExp(`import${GAP}\\(${GAP}(?:["']|\`)@mui\\/icons-material(?:\\/|["']|\`)`),
  new RegExp(`require${GAP}\\(${GAP}(?:["']|\`)@mui\\/icons-material(?:\\/|["']|\`)`),
];

const hasDirectMuiIconImport = (text) =>
  DIRECT_MUI_ICON_IMPORT_PATTERNS.some((pattern) => pattern.test(text));

describe("consumer icon-dispatch purity", () => {
  test("no consumer file imports @mui/icons-material directly", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      if (ALLOWED_IMPORTERS.has(file)) continue;
      const text = readFileSync(file, "utf8");
      if (hasDirectMuiIconImport(text)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  test("matches every direct-import form and none of the legal forms", () => {
    // 匹配器单测：全仓 walk 对后两种形态没有可触发样本（实测零命中），
    // 故用合成源码串给闸门口径本身定红/绿，不允许以"当前无违规"当覆盖证据。
    expect(
      hasDirectMuiIconImport('import Favorite from "@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(hasDirectMuiIconImport('import "@mui/icons-material/Favorite";')).toBe(
      true
    );
    expect(
      hasDirectMuiIconImport('const m = await import("@mui/icons-material");')
    ).toBe(true);
    // 合法形态：走分发器、走非图标包，一律不得命中。
    expect(hasDirectMuiIconImport('import { Favorite } from "../icons";')).toBe(
      false
    );
    expect(hasDirectMuiIconImport('import Button from "@mui/material/Button";')).toBe(
      false
    );
    // CommonJS require() 是直连图标的第四种形态，同样不得绕过纯度闸；
    // 非图标包的 require 保持不命中。
    expect(
      hasDirectMuiIconImport('require("@mui/icons-material/Favorite");')
    ).toBe(true);
    // 调用名与左括号之间的空白不改变 JS 语义：带空格的动态 import/require
    // 同样是直连图标的直连形态，不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport('import ("@mui/icons-material/Favorite");')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('require ("@mui/icons-material/Favorite");')
    ).toBe(true);
    // webpackChunkName 命名注释是动态导入的真实工程形态：调用名与模块
    // 路径之间的块注释不改变 JS 语义，同样不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport(
        'import(/* webpackChunkName: "icons" */ "@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 调用名/关键字与模块引号之间的行注释同样不改变 JS 语义：
    // from/import()/require 三种形态均不得借注释绕过纯度闸。
    expect(
      hasDirectMuiIconImport('from /* pkg */ "@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('from // pkg\n"@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('require(/* pkg */ "@mui/icons-material/Favorite");')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('require( // pkg\n"@mui/icons-material/Favorite");')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('import( // pkg\n"@mui/icons-material/Favorite");')
    ).toBe(true);
    // 非图标包的带注释 require 保持不命中。
    expect(
      hasDirectMuiIconImport('require(/* pkg */ "@mui/material/Button");')
    ).toBe(false);
    // 模板串说明符是动态 import/require 的合法 JS 形态（ESM 静态形态除外，
    // 静态 from/裸 import 不加反引号备选）：调用形态的反引号同样不得绕过纯度闸。
    expect(hasDirectMuiIconImport("import(`@mui/icons-material/Favorite`);")).toBe(
      true
    );
    expect(hasDirectMuiIconImport("require(`@mui/icons-material/Favorite`);")).toBe(
      true
    );
    // 非图标包的模板串调用形态保持不命中。
    expect(hasDirectMuiIconImport("import(`@mui/material/Button`);")).toBe(false);
    expect(hasDirectMuiIconImport("require(`@mui/material/Button`);")).toBe(false);
    // 裸 import 的 import 关键字与模块引号之间的注释不改变 JS 语义；
    // import/require 调用名与左括号之间的注释同理，均不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport('import /* pkg */ "@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('import /* pkg */ ("@mui/icons-material/Favorite");')
    ).toBe(true);
    // 关键字/调用名与引号之间零空白同样不改变 JS 语义（from"x"、import"x"）：
    // 静态 from/裸 import 的零空白形态不得绕过纯度闸。
    expect(hasDirectMuiIconImport('from"@mui/icons-material/Favorite";')).toBe(
      true
    );
    expect(hasDirectMuiIconImport('import"@mui/icons-material/Favorite";')).toBe(
      true
    );
    expect(
      hasDirectMuiIconImport('from/* pkg */"@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('import/* pkg */"@mui/icons-material/Favorite";')
    ).toBe(true);
    // 非图标包的同形态零空白保持不命中。
    expect(hasDirectMuiIconImport('from"@mui/material/Button";')).toBe(false);
    expect(hasDirectMuiIconImport('import"@mui/material/Button";')).toBe(false);
    expect(
      hasDirectMuiIconImport('require /* pkg */ ("@mui/icons-material/Favorite");')
    ).toBe(true);
    // 非图标包的同形态注释保持不命中。
    expect(
      hasDirectMuiIconImport('import /* pkg */ "@mui/material/Button";')
    ).toBe(false);
    expect(
      hasDirectMuiIconImport('import /* pkg */ ("@mui/material/Button");')
    ).toBe(false);
    expect(
      hasDirectMuiIconImport('require /* pkg */ ("@mui/material/Button");')
    ).toBe(false);
    // 双段连续注释（如 webpackChunkName 与备注并列）不改变 JS 语义：
    // 注释组须可重复匹配，两段注释的动态导入同样不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport(
        'import(/* webpackChunkName: "icons" */ /* pkg */ "@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    expect(
      hasDirectMuiIconImport(
        'require(/* a */ // b\n"@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 非图标包的双注释形态保持不命中。
    expect(
      hasDirectMuiIconImport('import(/* a */ /* b */ "@mui/material/Button");')
    ).toBe(false);
    expect(hasDirectMuiIconImport('require("@mui/material/Button");')).toBe(
      false
    );
  });
});
