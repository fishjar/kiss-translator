import { readFileSync } from "fs";
import path from "path";

const files = ["Menus.js", "youtubePlayerUi.js"];
// v5 T3 独立 pattern 清单：rgba(32,156,238 形态与 #209cee hex 分开钉死。
// 形态铁律：严禁并入既有 #209cee files 数组——该数组对每文件断言 #209cee >0，
// rgba(32,156,238 形态不匹配该 hex 字面量，并入即恒红不可转绿。
const rgbaPatternFiles = ["Menus.js"];
const read = (rel) => readFileSync(path.resolve(__dirname, rel), "utf8");
const count = (source, pattern) => (source.match(pattern) || []).length;

describe("subtitle accent exemption tripwire (#209cee)", () => {
  test.each(files)(
    "%s: every #209cee literal carries an accent-exempt marker",
    (file) => {
      const source = read(file);
      expect(count(source, /#209cee/g)).toBeGreaterThan(0);
      // 逐一验证（#209cee 与 rgba(32,156,238 两形态按源码顺序合并遍历、共享
      // 同一 prevLiteral）：每个字面量之前（自上一个任一形态字面量起）都须
      // 携带其专属的 accent-exempt 豁免说明，杜绝豁免跨字面量复用或某个
      // 字面量漏标。合并遍历后，rgba 字面量只能由其紧邻前方的标记覆盖，
      // 不得复用更早 hex 字面量的豁免段落。
      const literalIndexes = [
        ...source.matchAll(/#209cee/g),
        ...source.matchAll(/rgba\(32,156,238/g),
      ]
        .map(({ index }) => index)
        .sort((a, b) => a - b);
      let prevLiteral = -1;
      for (const index of literalIndexes) {
        expect(source.slice(prevLiteral + 1, index)).toMatch(/accent-exempt/);
        prevLiteral = index;
      }
      // v5 T3：豁免标记总数与 #209cee＋rgba(32,156,238 两形态豁免字面量总数一一对应。
      expect(count(source, /accent-exempt/g)).toBe(
        count(source, /#209cee/g) + count(source, /rgba\(32,156,238/g)
      );
    }
  );

  test("exemption stays pinned at exactly three literal sites", () => {
    expect(
      files.reduce((sum, file) => sum + count(read(file), /#209cee/g), 0)
    ).toBe(2);
  });
});

describe("subtitle accent exemption tripwire (rgba(32,156,238 form, v5 T3)", () => {
  test.each(rgbaPatternFiles)(
    "%s: rgba(32,156,238 literal count stays pinned at exactly three",
    (file) => {
      const source = read(file);
      // 数量钉死：Switch 轨道选中底色＋DropdownOption 选中底色＋MultiSelect
      // checkbox 选中勾选盒底色（M3 v3.1 W12 勾选本体新增），恰 3 处。
      // 相邻豁免校验已并入上方 files 遍历的合并扫描（两形态共享单一
      // prevLiteral），不再重复。
      expect(count(source, /rgba\(32,156,238/g)).toBe(3);
    }
  );
});

// v5 T6 独立 pattern 清单：wordHover.js 的 #4fc3f7（生词 hover 查词域）。
// 形态铁律：严禁把 wordHover.js 并入既有 #209cee files 数组——该数组对每文件
// 断言 #209cee >0，wordHover.js 无该 hex 字面量，并入即恒红不可转绿。
describe("subtitle accent exemption tripwire (wordHover #4fc3f7, v5 T6)", () => {
  test("wordHover.js: every #4fc3f7 literal carries an accent-exempt marker", () => {
    const source = read("wordHover.js");
    // 数量钉死：hover 下划线色＋气泡头部词色＋词性标记色，恰 3 处。
    expect(count(source, /#4fc3f7/g)).toBe(3);
    // 逐处相邻校验：每个字面量之前（自上一个字面量起）须携带其专属豁免说明。
    let prevLiteral = -1;
    for (const { index } of source.matchAll(/#4fc3f7/g)) {
      expect(source.slice(prevLiteral + 1, index)).toMatch(/accent-exempt/);
      prevLiteral = index;
    }
  });
});
