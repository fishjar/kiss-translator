// 多选下拉勾选框在册闸：判定看值形状，不看组件类型。
// 漏一个多选面＝用户所述"只认标准组件、不标准的找不出来"的第 6 次复发。
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "..");
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
const REL = (...parts) => path.join(...parts);

// 在册多选面（本轮 git grep 实测枚举，非估算）：
const PRIMITIVES = [
  REL("components", "TerminologySelect.js"),
  REL("subtitle", "Menus.js"),
  REL("views", "Options", "SettingsCard.js"),
  REL("views", "Popup", "PopupTextPanel.js"),
];
const DIRECT_SITES = [
  REL("views", "Selection", "TranForm.js"),
  REL("views", "Options", "Setting.js"),
  REL("views", "Options", "CapabilityOptions.js"),
];
const DELEGATES = [
  REL("views", "FileTranslate", "ServiceSelect.js"),
  REL("views", "Options", "ServiceSelect.js"),
  REL("views", "Options", "Tranbox.js"),
];
// MUI Select 形态载体注册表：无 renderValue 时 MUI 会把选中 MenuItem 的
// children 子树（含 MenuCheckGlyph）渲染进关闭态 trigger。凡在册且含内联
// 字形的多选面必须声明 renderValue（trigger 纯度闸）。
const MUI_SELECT_SITES = [
  REL("components", "TerminologySelect.js"),
  REL("views", "Options", "CapabilityOptions.js"),
  REL("views", "Options", "Setting.js"),
  REL("views", "Options", "SettingsCard.js"),
  REL("views", "Selection", "TranForm.js"),
];
// 非 MUI Select 的自绘多选面（手写 role/aria-checked 或 showCheckbox 约定），
// 反向守卫：不得误加 renderValue。
const NON_MUI_SITES = [
  REL("subtitle", "Menus.js"),
  REL("views", "Popup", "PopupTextPanel.js"),
];

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory())
      return SKIP_DIRS.has(entry) ? [] : walk(full);
    if (!/\.jsx?$/.test(entry) || entry.includes(".test.")) return [];
    return [full];
  });

const MULTI_MARKERS = [
  /SelectProps=\{\{[^}]*\bmultiple\b/,
  /<Select\s+[^>]*\bmultiple\b/,
  /multiple=\{/,
  // JSX 开标签内的裸 multiple 属性（Autocomplete 等非 Select 组件形态）；
  // (?=[\s/>]) 排除 multiple={...} 值表达式形态（已被上一标记覆盖），
  // [^<>]* 不跨标签边界，天然排除散文与解构。
  /<[A-Za-z][^<>]*\smultiple(?=[\s/>])/,
];

describe("multi-select checkbox coverage", () => {
  test("primitives render the dispatcher glyph", () => {
    for (const file of PRIMITIVES) {
      expect(readFileSync(path.join(SRC, file), "utf8")).toContain(
        "MenuCheckGlyph"
      );
    }
  });

  test("direct multi-select sites render the dispatcher glyph", () => {
    for (const file of DIRECT_SITES) {
      expect(readFileSync(path.join(SRC, file), "utf8")).toContain(
        "MenuCheckGlyph"
      );
    }
  });

  test("bare multiple JSX attributes on non-Select components are detected", () => {
    // 裸 multiple 属性形态（Autocomplete 等非 Select 载体）必须被
    // MULTI_MARKERS 命中，否则未在册的非标准多选面会静默漏检。
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test('<Autocomplete\n  multiple\n/>')
      )
    ).toBe(true);
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test('<Autocomplete multiple disableCloseOnSelect />')
      )
    ).toBe(true);
    // 非 multiple 属性不命中。
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test('<Autocomplete disableCloseOnSelect />')
      )
    ).toBe(false);
  });

  test("delegating wrappers stay delegated and do not paint their own box", () => {
    for (const file of DELEGATES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      // 事实口径：三在册透传面的 `multiple` 形态各异（`multiple={multiple}`、
      // 解构缺省 `multiple = false`、裸布尔属性 `multiple`），共同事实是都携带
      // multiple 标识符并转发给原语；`MULTI_MARKERS[2]`（仅 `multiple={`）
      // 会误杀后两种形态。i18n key "translate_service_multiple" 因下划线属
      // 单词字符而不命中 \bmultiple\b，无误判面。
      expect(text).toMatch(/\bmultiple\b/);
      expect(text).not.toContain("MenuCheckGlyph");
    }
  });

  test("every scanned file follows the registered multi-select contract", () => {
    // 未登记文件：命中任一 MULTI_MARKERS 即 offender（整体豁免取消，
    // 在册面也参与扫描——它们按各自约定核对，而非无条件放行）。
    // DELEGATES 透传面：必须携带 multiple 标识且零 MenuCheckGlyph。
    // 其余在册面（PRIMITIVES/DIRECT_SITES）：必须渲染 MenuCheckGlyph。
    // 说明性事实：文本扫描无法可靠做"入口数=字形数"的逐条目配对——
    // 自绘面（如 Menus.js）以单个 MenuCheckGlyph 定义服务多行渲染，
    // 计数相等断言会误红；条目级保障由"未登记零命中 + 在册面逐文件
    // 字形/透传约定"两层承载。
    const registered = [...PRIMITIVES, ...DIRECT_SITES, ...DELEGATES];
    const offenders = walk(SRC)
      .map((file) => path.relative(SRC, file).split(path.sep).join(path.sep))
      .filter((relative) => {
        const text = readFileSync(path.join(SRC, relative), "utf8");
        if (registered.includes(relative)) {
          if (DELEGATES.includes(relative)) {
            const isDelegating = /\bmultiple\b/.test(text);
            const paintsOwn = text.includes("MenuCheckGlyph");
            return !isDelegating || paintsOwn;
          }
          return !text.includes("MenuCheckGlyph");
        }
        return MULTI_MARKERS.some((marker) => marker.test(text));
      });
    expect(offenders).toEqual([]);
  });

  test("registered MUI Select multi-select sites with inline glyphs must declare renderValue", () => {
    for (const file of MUI_SELECT_SITES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      if (!text.includes("MenuCheckGlyph")) continue;
      expect({ file, hasRenderValue: text.includes("renderValue") }).toEqual({
        file,
        hasRenderValue: true,
      });
    }
  });

  test("non-MUI checkbox surfaces must not adopt renderValue", () => {
    for (const file of NON_MUI_SITES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      expect(text).not.toContain("renderValue");
    }
  });
});
