// 纯度闸：对全部非测试 .js/.mjs 源码扫描旧档残留，防注释谎值/三端漏改/孤儿键
// ——这是"MD3 档已彻底移除"的唯一机器闸（r1 A1/A4）。
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

describe("legacy style literals purity", () => {
  test("no legacy md3 style token or md3 coordinate transform in source", () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      // 生成器自身与生成物目录豁免：生成器脚本名/注释天然含 md3 历史说明，
      // 生成物已重生成且由 lucideIcons 守卫专责，不在此重复扫描。
      if (file.includes(`${path.sep}components${path.sep}icons${path.sep}`))
        continue;
      if (file.endsWith("gen-lucide-icons.mjs")) continue;
      const text = readFileSync(file, "utf8");
      // PR #17 评审 Nitpick #7：pnpm format 的 glob 不含 .mjs，格式化工具
      // 不会把 'md3' 重写为 "md3"；须同时匹配两种引号，否则 .mjs 里的
      // 'md3' 字面量漏检。
      if (text.includes('"md3"') || text.includes("'md3'")) {
        offenders.push(`${file}: legacy iconStyle token "md3"`);
      }
      if (text.includes("scale(0.025)")) {
        offenders.push(`${file}: md3 coordinate transform scale(0.025)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
