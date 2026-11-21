// 分发纯度闸：非测试、非分发器装配源的源码
// 不得直连 @mui/icons-material/*，必须从 components/icons 取图标。
// 本文件自身是闸门载体，不承载图标调用点；新增调用点应改分发器输入，
// 直改本文件会破坏闸的语义。
//
// 启发式边界声明：本扫描器为单遍词法启发式，不承诺语法完备——个别
// JS/JSX 形态（如 `throw` 之后的正则字面量、`)` 之后的正则字面量、
// JSX 文本中的 URL `//`）不在拦截范围，可能漏报；本闸不再为追新词法
// 形态扩展，需要完备语法判定时应改用 AST 解析或以人工审查兜底。
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "build",
  ".git",
  ".kilo",
  "coverage",
  "public",
  "testdata",
  "tmp",
]);
// 分发器本体与生成器天然 import MUI/Lucide 上游，逐字豁免。
const ALLOWED_IMPORTERS = new Set([
  path.join(SRC, "components", "icons", "index.js"),
  path.join(SRC, "components", "icons", "lucide", "index.js"),
  path.join(SRC, "scripts", "gen-lucide-icons.mjs"),
]);

// 消费者文件扩展名闸：js/jsx/mjs 均为纯度检查域。
const CONSUMER_FILE_RE = /\.(js|jsx|mjs)$/;

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(entry) ? [] : walk(full);
    if (!CONSUMER_FILE_RE.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

// 直连 MUI 图标的形态：带 from 的具名/默认导入、裸副作用导入、动态导入、
// require 调用，以及模板插值表达式内的上述任何可执行形态。
// 单遍扫描器：注释与普通字符串按整单元跳过；模板串只跳过文本段，
// `${...}` 插值表达式递归扫描；正则字面量整体按非代码文本处理（启发式
// 判定起点，覆盖本闸关注的源码形态），避免正则内引号吞掉后续真实导入。
// 关键字仅词边界处配对，且关键字前不得为 `.`（排除 `x.from()`）。说明符匹配
// `^@mui\/icons-material(?:(\/)|$)`。
// 前一单词为这些关键字时，其后紧跟的 `/` 是正则字面量起点（标识符后
// 跟 `/` 仍是除法）。
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "void",
  "delete",
  "instanceof",
  "do",
  "else",
  "new",
]);

const isRegexLiteralStart = (text, i) => {
  let j = i - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 0) return true;
  if (/[A-Za-z0-9_$]/.test(text[j])) {
    // 前为词字符：回扫完整单词再判，避免把单词中段误当起点。
    let k = j;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(text[k])) k--;
    return REGEX_PRECEDING_KEYWORDS.has(text.slice(k + 1, j + 1));
  }
  // 箭头函数体形态（`=> /.../ `）：`/` 前一非空白字符为 `>` 且其前恰为
  // `=`（双字符箭头算子）才判为正则起点；JSX 自闭合 `<Foo ... />` 的尾斜杠
  // 前虽也是 `>`，但其前不可能是 `=`（那会是未闭合的属性值），不得命中。
  if (text[j] === ">" && j > 0 && text[j - 1] === "=") return true;
  return "=(,:[!&|?{};".includes(text[j]);
};

const hasDirectMuiIconImport = (text) => {
  // 扫描 [start, end) 区间，返回 [是否命中, 停止下标]。stopAtBrace 为真时
  // 在深度配对的 `}` 处停止（下标指向该 `}`），供模板插值表达式递归复用。
  const scan = (start, end, stopAtBrace) => {
    let i = start;
    let braceDepth = 0;
    const len = end;

    while (i < len) {
      const ch = text[i];
      const next = text[i + 1];

      // 跳过行注释
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < len && text[i] !== "\n") i++;
        continue;
      }

      // 跳过块注释
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < len && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2; // skip */
        continue;
      }

      // JSX 文本中的撇号（前为词字符）不是字符串起点，按普通字符放行；
      // 合法 JS 中单引号字符串不可能紧跟在词字符之后。
      if (ch === "'" && i > start && /[A-Za-z0-9_$]/.test(text[i - 1])) {
        i++;
        continue;
      }

      // 跳过普通字符串（双引号、单引号）
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < len) {
          if (text[i] === "\\") {
            i += 2; // skip escaped character
            continue;
          }
          if (text[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        continue;
      }

      // 模板串：文本段跳过，`${...}` 插值表达式按可执行代码递归扫描。
      if (ch === "`") {
        i++;
        while (i < len) {
          if (text[i] === "\\") {
            i += 2;
            continue;
          }
          if (text[i] === "`") {
            i++;
            break;
          }
          if (text[i] === "$" && text[i + 1] === "{") {
            const [hit, closeIdx] = scan(i + 2, len, true);
            if (hit) return [true, closeIdx];
            i = closeIdx + 1; // consume 配对的 }
            continue;
          }
          i++;
        }
        continue;
      }

      // JSX 自闭合标签的 `/>`：起点集合含 `}` 会使带属性 JSX 的尾斜杠误入
      // 正则消费、吞掉其后至下一个 `/` 的真实代码；`/>` 两个字符整体放行。
      if (ch === "/" && next === ">" && isRegexLiteralStart(text, i)) {
        i += 2;
        continue;
      }

      // 正则字面量：整体按非代码文本处理，字符类与转义不构成字符串起点。
      if (ch === "/" && isRegexLiteralStart(text, i)) {
        i++;
        let inClass = false;
        while (i < len) {
          if (text[i] === "\\") {
            i += 2;
            continue;
          }
          if (inClass) {
            if (text[i] === "]") inClass = false;
            i++;
            continue;
          }
          if (text[i] === "[") {
            inClass = true;
            i++;
            continue;
          }
          if (text[i] === "/") {
            i++;
            break;
          }
          i++;
        }
        // 正则标志位
        while (i < len && /[a-zA-Z]/.test(text[i])) i++;
        continue;
      }

      // 插值表达式边界：花括号深度计数，配对 `}` 处交还调用方。
      if (stopAtBrace && ch === "}") {
        if (braceDepth === 0) return [false, i];
        braceDepth--;
        i++;
        continue;
      }
      if (stopAtBrace && ch === "{") {
        braceDepth++;
        i++;
        continue;
      }

      // 按完整 JS 标识符读取单词（含 _、$ 与数字），再与关键字精确配对：
      // 拆词会让 custom_require 的后缀命中 require 调用分支形成误报。
      // 关键字前不得为 `.`（排除 `x.from()`）
      if (/[A-Za-z_$]/.test(ch)) {
        const start = i;
        while (i < len && /[A-Za-z0-9_$]/.test(text[i])) i++;
        const word = text.slice(start, i);

        // 检查关键字前是否为 `.`
        if (start > 0 && text[start - 1] === ".") continue;

        // 跳过关键字后的空白与注释
        let j = i;
        while (j < len) {
          if (/\s/.test(text[j])) {
            j++;
            continue;
          }
          // 行注释
          if (text[j] === "/" && text[j + 1] === "/") {
            j += 2;
            while (j < len && text[j] !== "\n") j++;
            continue;
          }
          // 块注释
          if (text[j] === "/" && text[j + 1] === "*") {
            j += 2;
            while (j < len && !(text[j] === "*" && text[j + 1] === "/")) j++;
            j += 2;
            continue;
          }
          break;
        }

        // from + 引号说明符
        if (
          word === "from" &&
          j < len &&
          (text[j] === '"' || text[j] === "'" || text[j] === "`")
        ) {
          const quote = text[j];
          j++;
          const specStart = j;
          while (j < len && text[j] !== quote) {
            if (text[j] === "\\") j++; // skip escaped
            j++;
          }
          const specifier = text.slice(specStart, j);
          if (/^@mui\/icons-material(?:\/|$)/.test(specifier)) {
            return [true, i];
          }
        }

        // import + 引号（裸导入）
        if (
          word === "import" &&
          j < len &&
          (text[j] === '"' || text[j] === "'" || text[j] === "`")
        ) {
          const quote = text[j];
          j++;
          const specStart = j;
          while (j < len && text[j] !== quote) {
            if (text[j] === "\\") j++; // skip escaped
            j++;
          }
          const specifier = text.slice(specStart, j);
          if (/^@mui\/icons-material(?:\/|$)/.test(specifier)) {
            return [true, i];
          }
        }

        // import/require + ( + 引号/反引号
        if (
          (word === "import" || word === "require") &&
          j < len &&
          text[j] === "("
        ) {
          j++; // skip (
          // 跳过 ( 后的空白与注释
          while (j < len) {
            if (/\s/.test(text[j])) {
              j++;
              continue;
            }
            if (text[j] === "/" && text[j + 1] === "/") {
              j += 2;
              while (j < len && text[j] !== "\n") j++;
              continue;
            }
            if (text[j] === "/" && text[j + 1] === "*") {
              j += 2;
              while (j < len && !(text[j] === "*" && text[j + 1] === "/")) j++;
              j += 2;
              continue;
            }
            break;
          }

          if (
            j < len &&
            (text[j] === '"' || text[j] === "'" || text[j] === "`")
          ) {
            const quote = text[j];
            j++;
            const specStart = j;
            while (j < len && text[j] !== quote) {
              if (text[j] === "\\") j++; // skip escaped
              j++;
            }
            const specifier = text.slice(specStart, j);
            if (/^@mui\/icons-material(?:\/|$)/.test(specifier)) {
              return [true, i];
            }
          }
        }

        continue;
      }

      i++;
    }

    return [false, i];
  };

  const [hit] = scan(0, text.length, false);
  return hit;
};

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
    // 匹配器单测：全仓 walk 对后两种形态没有可触发样本，
    // 故用合成源码串给闸门口径本身定红/绿，不允许以"当前无违规"当覆盖证据。
    expect(
      hasDirectMuiIconImport(
        'import Favorite from "@mui/icons-material/Favorite";'
      )
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('import "@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport('const m = await import("@mui/icons-material");')
    ).toBe(true);
    // 合法形态：走分发器、走非图标包，一律不得命中。
    expect(hasDirectMuiIconImport('import { Favorite } from "../icons";')).toBe(
      false
    );
    expect(
      hasDirectMuiIconImport('import Button from "@mui/material/Button";')
    ).toBe(false);
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
      hasDirectMuiIconImport(
        'require(/* pkg */ "@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    expect(
      hasDirectMuiIconImport(
        'require( // pkg\n"@mui/icons-material/Favorite");'
      )
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
    expect(
      hasDirectMuiIconImport("import(`@mui/icons-material/Favorite`);")
    ).toBe(true);
    expect(
      hasDirectMuiIconImport("require(`@mui/icons-material/Favorite`);")
    ).toBe(true);
    // 非图标包的模板串调用形态保持不命中。
    expect(hasDirectMuiIconImport("import(`@mui/material/Button`);")).toBe(
      false
    );
    expect(hasDirectMuiIconImport("require(`@mui/material/Button`);")).toBe(
      false
    );
    // 裸 import 的 import 关键字与模块引号之间的注释不改变 JS 语义；
    // import/require 调用名与左括号之间的注释同理，均不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport('import /* pkg */ "@mui/icons-material/Favorite";')
    ).toBe(true);
    expect(
      hasDirectMuiIconImport(
        'import /* pkg */ ("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // JSX 文本中的撇号（前为词字符）不是字符串起点：其后的 require 直连
    // 不得因撇号吞掉剩余内容而漏检。
    expect(
      hasDirectMuiIconImport(
        'const x = <div>Don\'t translate</div>; require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // return 后的正则字面量是正则起点：正则内引号不平衡时不得吞掉
    // 后续 require 直连。
    expect(
      hasDirectMuiIconImport(
        'function f() { return /[\'"]/; } require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 正则内引号平衡的对照形态：两种实现下都须命中（回归守卫）。
    expect(
      hasDirectMuiIconImport(
        'function f() { return /["x"]/; } require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 关键字/调用名与引号之间零空白同样不改变 JS 语义（from"x"、import"x"）：
    // 静态 from/裸 import 的零空白形态不得绕过纯度闸。
    expect(hasDirectMuiIconImport('from"@mui/icons-material/Favorite";')).toBe(
      true
    );
    expect(
      hasDirectMuiIconImport('import"@mui/icons-material/Favorite";')
    ).toBe(true);
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
      hasDirectMuiIconImport(
        'require /* pkg */ ("@mui/icons-material/Favorite");'
      )
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
    // 注释内的导入文本不得命中：整行注释/块注释/字符串内的导入声明
    // 均为非代码文本，扫描器跳过注释与字符串单元后不应识别为真实导入。
    expect(
      hasDirectMuiIconImport(
        '// import { Favorite } from "@mui/icons-material/Favorite";'
      )
    ).toBe(false);
    expect(
      hasDirectMuiIconImport(
        '/* import { Favorite } from "@mui/icons-material/Favorite"; */'
      )
    ).toBe(false);
    expect(
      hasDirectMuiIconImport(
        'const s = "import { Favorite } from \\"@mui/icons-material/Favorite\\"";'
      )
    ).toBe(false);
    expect(
      hasDirectMuiIconImport(
        'const s = `import { Favorite } from "@mui/icons-material/Favorite"`;'
      )
    ).toBe(false);
    // 注释干扰下的真实导入仍须命中：注释不改变 JS 语义，真实导入
    // 关键字与说明符之间的注释不得绕过纯度闸。
    expect(
      hasDirectMuiIconImport(
        'import /* comment */ { Favorite } from "@mui/icons-material/Favorite";'
      )
    ).toBe(true);
    expect(
      hasDirectMuiIconImport(
        'import { Favorite } from /* comment */ "@mui/icons-material/Favorite";'
      )
    ).toBe(true);
    // 方法调用 `.from()` 不得误判为导入关键字：关键字前为 `.` 时跳过。
    expect(
      hasDirectMuiIconImport('obj.from("@mui/icons-material/Favorite");')
    ).toBe(false);
    // 标识符按完整单词读取（含 _、$ 与数字）：custom_require 的后缀不是
    // require 调用，拆词匹配会把包装函数调用误判为直连形态。
    expect(
      hasDirectMuiIconImport('custom_require("@mui/icons-material/Favorite");')
    ).toBe(false);
    expect(
      hasDirectMuiIconImport('$require("@mui/icons-material/Favorite");')
    ).toBe(false);
    // 正则字面量内的引号不得吞掉后续真实导入：字符类正则 /["']/ 之后的
    // require 直连仍须命中，正则内容不得被当作字符串起点。
    expect(
      hasDirectMuiIconImport(
        'const r = /["\']/; require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 箭头函数体的正则字面量：`=> /.../ ` 的 `/` 前一非空白字符为 `>`，
    // 须判为正则起点；否则正则内引号被当作字符串边界，吞掉后续真实导入。
    expect(
      hasDirectMuiIconImport(
        'const r = () => /["\'`]/.test(v); require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // JSX 自闭合标签的尾斜杠不是正则起点：其后 require 不得被误吞。
    expect(
      hasDirectMuiIconImport(
        '<Row onClose={() => setOpen(false)} />; require("@mui/icons-material/Favorite");'
      )
    ).toBe(true);
    // 正则字面量整体按非代码文本处理：其内部出现的图标路径文本不构成真实导入。
    expect(
      hasDirectMuiIconImport('const r = /"@mui\\/icons-material\\/Favorite"/;')
    ).toBe(false);
    // 模板插值表达式是可执行代码：表达式内的 require 直连不得借模板串绕过纯度闸。
    expect(
      hasDirectMuiIconImport(
        'const s = `${require("@mui/icons-material/Favorite").default}`;'
      )
    ).toBe(true);
    expect(
      hasDirectMuiIconImport(
        'const s = `${require("@mui/icons-material/Check")}`;'
      )
    ).toBe(true);
    // 模板串纯文本段（无插值表达式）仍按非代码文本处理：保持不命中。
    expect(hasDirectMuiIconImport("const s = `text only`;")).toBe(false);
    // 消费者文件域覆盖 .mjs：扩展名闸对 .mjs 生效，生成器为唯一豁免。
    expect(CONSUMER_FILE_RE.test("a.mjs")).toBe(true);
    expect(CONSUMER_FILE_RE.test("a.js")).toBe(true);
    expect(CONSUMER_FILE_RE.test("a.scss")).toBe(false);
    expect(
      ALLOWED_IMPORTERS.has(path.join(SRC, "scripts", "gen-lucide-icons.mjs"))
    ).toBe(true);
  });
});
