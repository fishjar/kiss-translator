// 多选下拉勾选框覆盖闸：判定看值形状，不看组件类型。
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

// 扫描覆盖的多选面清单（仅登记已接入分发器字形的面）：
const PRIMITIVES = [
  REL("subtitle", "Menus.js"),
  REL("views", "Options", "SettingsCard.js"),
];
const DIRECT_SITES = [
  REL("views", "Selection", "TranForm.js"),
];
// 待转换多选面：字形接线尚未落地，登记于此防止契约误报；
// 各自转换落地后须移入上方严格清单，不得滞留。
const PENDING_CONVERSIONS = [
  REL("components", "TerminologySelect.js"),
  REL("views", "Options", "CapabilityOptions.js"),
  REL("views", "Options", "Setting.js"),
  REL("views", "Popup", "PopupTextPanel.js"),
];
const DELEGATES = [
  REL("views", "FileTranslate", "ServiceSelect.js"),
  REL("views", "Options", "ServiceSelect.js"),
  REL("views", "Options", "Tranbox.js"),
];
// MUI Select 形态载体注册表：无 renderValue 时 MUI 会把选中 MenuItem 的
// children 子树（含 MenuCheckGlyph）渲染进关闭态 trigger。凡清单内且含内联
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
  // (?=[\s/>]) 排除 multiple={...} 值表达式形态（已被上一标记覆盖）。
  // 开标签内容 = "非尖/花括号字符 或 一层花括号表达式" 的受控片段：
  // 属性内箭头函数/比较符的 `>` 藏在表达式花括号里不截断匹配（如
  // <Select onChange={(e) => set(e)} multiple>），裸 `>`（真标签结束）仍
  // 终止开标签——散文与后续标签不会被误并进匹配（fail-loud 且无误报）。
  /<[A-Za-z](?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\smultiple(?=[\s/>])/,
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
    // MULTI_MARKERS 命中，否则清单外的非标准多选面会静默漏检。
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
    // 属性内箭头函数的 `>` 不得截断匹配：multiple 出现在含箭头函数属性
    // 之后的开标签内，仍须被识别（漏检即静默放过非标准多选面）。
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test(
          '<Select\n  onChange={(event) => setValue(event.target.value)}\n  multiple\n/>'
        )
      )
    ).toBe(true);
    // 非 multiple 属性不命中。
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test('<Autocomplete disableCloseOnSelect />')
      )
    ).toBe(false);
    // 散文/后续标签内的 multiple 不被误并（开标签在裸 `>` 处终止）。
    expect(
      MULTI_MARKERS.some((marker) =>
        marker.test('<Autocomplete />\n  the multiple paths are listed')
      )
    ).toBe(false);
  });

  test("delegating wrappers stay delegated and do not paint their own box", () => {
    for (const file of DELEGATES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      // 事实口径：三个透传面的 `multiple` 形态各异（`multiple={multiple}`、
      // 解构缺省 `multiple = false`、裸布尔属性 `multiple`），共同事实是都携带
      // multiple 标识符并转发给原语；`MULTI_MARKERS[2]`（仅 `multiple={`）
      // 会误杀后两种形态。i18n key "translate_service_multiple" 因下划线属
      // 单词字符而不命中 \bmultiple\b，无误判面。
      expect(text).toMatch(/\bmultiple\b/);
      expect(text).not.toContain("MenuCheckGlyph");
    }
  });

  test("every scanned file follows the registered multi-select contract", () => {
    // 清单外文件：命中任一 MULTI_MARKERS 即 offender（整体豁免取消，
    // 清单内文件也参与扫描——它们按各自约定核对，而非无条件放行）。
    // DELEGATES 透传面：必须携带 multiple 标识且零 MenuCheckGlyph。
    // 其余清单面（PRIMITIVES/DIRECT_SITES）：必须渲染 MenuCheckGlyph。
    // 说明性事实：文本扫描无法可靠做"入口数=字形数"的逐条目配对——
    // 自绘面（如 Menus.js）以单个 MenuCheckGlyph 定义服务多行渲染，
    // 计数相等断言会误红；条目级保障由"清单外零命中 + 清单内逐文件
    // 字形/透传约定"两层承载。
    const registered = [...PRIMITIVES, ...DIRECT_SITES, ...DELEGATES];
    const offenders = walk(SRC)
      .map((file) => path.relative(SRC, file))
      .filter((relative) => {
        const text = readFileSync(path.join(SRC, relative), "utf8");
        // 待转换面豁免：多选标记在场是已知事实，字形接线由后续分支落地。
        if (PENDING_CONVERSIONS.includes(relative)) return false;
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
    const renderValueOffenders = [];
    for (const file of MUI_SELECT_SITES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      if (!text.includes("MenuCheckGlyph")) continue;
      // 注释里的说明性文字不得充当契约满足：剔除块注释与整行 // 注释后，
      // 须以 JSX 属性（renderValue=）或对象字面量属性（renderValue:）形态
      // 声明；裸词提及（如 import 或散文）不计数。静态扫描无法做"每个
      // 多选 Select 逐一配对"的条目级判定，该层保障仍由条目级运行时
      // 夹具承载——这一文件级口径是有意取舍，可接受。
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !/^\s*\/\//.test(line))
        .join("\n");
      const renderValueDeclarations = code.match(/\brenderValue\s*[=:]/g) ?? [];
      if (renderValueDeclarations.length === 0) {
        renderValueOffenders.push(file);
      }
    }
    expect(renderValueOffenders).toEqual([]);
  });

  test("non-MUI checkbox surfaces must not adopt renderValue", () => {
    for (const file of NON_MUI_SITES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      expect(text).not.toContain("renderValue");
    }
  });

  test("pending conversions still carrying the glyph must be promoted", () => {
    // 待转换清单是登记表不是长期豁免：豁免文件一旦接线 MenuCheckGlyph，
    // 本断言即红并点名文件，提示把它移入上方严格清单。
    const promotedOffenders = [];
    for (const file of PENDING_CONVERSIONS) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      if (text.includes("MenuCheckGlyph")) {
        promotedOffenders.push(file);
      }
    }
    expect(promotedOffenders).toEqual([]);
  });
});
