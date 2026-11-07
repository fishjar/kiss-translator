import { readFileSync } from "fs";
import path from "path";

const read = (rel) => readFileSync(path.resolve(__dirname, rel), "utf8");
const count = (source, pattern) => (source.match(pattern) || []).length;

// v5 T8 语义绿豁免钉死：独立 pattern 清单（#00c853 hex 与 rgba(0, 200, 83
// 伴生形态合并为一个 tripwire 的两种 pattern，各 pattern 独立计数；
// 严禁与其他 hex 断言清单（如 #209cee）混用）。
const expectations = [
  { file: "imageSourceHighlight.js", hex: 1, rgba: 1 },
  { file: "screenshotOverlay.js", hex: 4, rgba: 1 },
];

describe("image translate semantic green exemption tripwire (v5 T8)", () => {
  test.each(expectations)(
    "$file: every semantic-green literal carries an adjacent exempt marker",
    ({ file, hex, rgba }) => {
      const source = read(file);
      expect(count(source, /#00c853/g)).toBe(hex);
      expect(count(source, /rgba\(0, 200, 83/g)).toBe(rgba);
      // 逐处相邻校验：两种形态字面量按文件序合并遍历，各自前缀段
      // （自上一字面量起）须携带其专属 semantic-green-exempt 豁免说明。
      let prev = -1;
      for (const { index } of source.matchAll(/#00c853|rgba\(0, 200, 83/g)) {
        expect(source.slice(prev + 1, index)).toMatch(/semantic-green-exempt/);
        prev = index;
      }
    }
  );
});
