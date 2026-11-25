// 纯度闸：对全部非测试 .js/.mjs 源码扫描旧档残留，防注释谎值/三端漏改/孤儿键
// ——这是"MD3 档已彻底移除"的唯一机器闸。
// jest 走 babel-preset-react-app 的 CJS 转换，`import.meta.dirname` 不可用，
// 必须用 `__dirname`；本文件以 .test.js 命名由 jest 接管，不能用 node --test 直跑。
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
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return SKIP_DIRS.has(entry) ? [] : walk(full);
    }
    if (!/\.(js|mjs)$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

// 旧档令牌判定：任何引号形态（双引号、单引号、反引号）包裹的 md3 字面量
// 都判违规；裸词 md3（普通标识符）与更长词（如 md3x）不构成令牌。
const hasLegacyIconStyleToken = (text) =>
  text.includes('"md3"') || text.includes("'md3'") || text.includes("`md3`");

describe("legacy style literals purity", () => {
  test("no legacy md3 style token or md3 coordinate transform in source", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      // 生成器脚本豁免：脚本名/注释天然含 md3 历史说明，不在此扫描。
      // icons 目录生成物（index.js/lucide/index.js）实测无
      // 遗留 token，参与扫描加强闸——若生成器回归引入旧档，本闸捕获。
      if (file.endsWith("gen-lucide-icons.mjs")) continue;
      const text = readFileSync(file, "utf8");
      // pnpm format 的 glob 不含 .mjs，格式化工具不会改写引号形态；判定须
      // 覆盖双引号、单引号与反引号三种包裹形态，否则对应字面量漏检。
      if (hasLegacyIconStyleToken(text)) {
        offenders.push(`${file}: legacy iconStyle token "md3"`);
      }
      if (text.includes("scale(0.025)")) {
        offenders.push(`${file}: md3 coordinate transform scale(0.025)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("token matcher detects every quote-wrapped form and rejects lookalikes", () => {
    expect(hasLegacyIconStyleToken('const x = "md3";')).toBe(true);
    expect(hasLegacyIconStyleToken("const x = 'md3';")).toBe(true);
    expect(hasLegacyIconStyleToken("const x = `md3`;")).toBe(true);
    // 裸词与更长词不构成令牌。
    expect(hasLegacyIconStyleToken("const md3 = 1;")).toBe(false);
    expect(hasLegacyIconStyleToken('const x = "md3x";')).toBe(false);
    expect(hasLegacyIconStyleToken("const x = `md3 icon`;")).toBe(false);
  });
});
