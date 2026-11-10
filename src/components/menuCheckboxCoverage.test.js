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
  REL("components", "TerminologySelect.js"),
  REL("views", "Options", "CapabilityOptions.js"),
  REL("views", "Options", "Setting.js"),
];
// 待转换多选面：字形接线尚未落地，登记于此防止契约误报；
// 各自转换落地后须移入上方严格清单，不得滞留。
const PENDING_CONVERSIONS = [REL("views", "Popup", "PopupTextPanel.js")];
const DELEGATES = [
  REL("views", "FileTranslate", "ServiceSelect.js"),
  REL("views", "Options", "ServiceSelect.js"),
  // 多选经 SettingsSelect 原语渲染字形，本文件不自绘字形。
  REL("views", "Options", "StylesSetting.js"),
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

// renderValue 声明判定：剔除块注释与行尾注释（`//` 后同行文本不构成
// 声明），保留须以 JSX 属性（renderValue=）或对象字面量属性（renderValue:）
// 形态在场；字符串内的 `//` 也会被保守剔除，故同行更早的真实声明仍计数。
const hasRenderValueDeclaration = (text) => {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
  return /\brenderValue\s*[=:]/.test(code);
};

// 剥离 = 后紧跟的双/单引号属性值（含 \. 转义消费），保留 = 定位属性结构。
// 单次交替扫描：每个 = 起点按同引号原子配对消费到本值收尾引号，异种引号
// 嵌入值内整段随行——不得分轮独立配对，否则单引号串内孤立双引号会让
// 双引号轮跨 span 吞并其后真多选站点（覆盖闸假阴）。
// 仅服务 MULTI_MARKERS[1]/[3]：这两条标记的标签内容片段此前不跳过引号值，
// <Select label="Choose multiple languages"> 这类单选站点的 label 文本
// 会被 \bmultiple\b 误判为多选。SelectProps 对象字面量与 multiple={ 形态
// 属花括号表达式，引号剥离不影响也不需要，口径不动。
const stripQuotedAttributeValues = (text) =>
  text.replace(/=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, "=");

// 统一判定入口：引号剥离仅对标记 1/3（裸属性形态）生效，标记 0/2 维持
// 原文本判定。
const matchesMultiMarker = (text) =>
  MULTI_MARKERS.some((marker, index) =>
    index === 1 || index === 3
      ? marker.test(stripQuotedAttributeValues(text))
      : marker.test(text)
  );

// 多选 Select 站点的 renderValue 声明扫描：readText 可注入，供合成文本
// 单测；判定口径单源于 hasRenderValueDeclaration（剔除注释后判声明）。
const scanRenderValueOffenders = (files, readText) =>
  files.filter((file) => {
    const text = readText(file);
    if (!text.includes("MenuCheckGlyph")) return false;
    return !hasRenderValueDeclaration(text);
  });

const MULTI_MARKERS = [
  // SelectProps 值为对象字面量：受控两层花括号配平，嵌套对象（如
  // MenuProps 内再嵌对象）内的 multiple 不因首个右花括号截断而漏检。
  /SelectProps=\{\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\bmultiple\b/,
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
    expect(matchesMultiMarker("<Autocomplete\n  multiple\n/>")).toBe(true);
    expect(
      matchesMultiMarker("<Autocomplete multiple disableCloseOnSelect />")
    ).toBe(true);
    // 属性内箭头函数的 `>` 不得截断匹配：multiple 出现在含箭头函数属性
    // 之后的开标签内，仍须被识别（漏检即静默放过非标准多选面）。
    expect(
      matchesMultiMarker(
        "<Select\n  onChange={(event) => setValue(event.target.value)}\n  multiple\n/>"
      )
    ).toBe(true);
    // 非 multiple 属性不命中。
    expect(matchesMultiMarker("<Autocomplete disableCloseOnSelect />")).toBe(
      false
    );
    // 散文/后续标签内的 multiple 不被误并（开标签在裸 `>` 处终止）。
    expect(
      matchesMultiMarker("<Autocomplete />\n  the multiple paths are listed")
    ).toBe(false);
    // 属性值表达式内的箭头函数与 multiple 并存：受控花括号片段须命中。
    expect(
      matchesMultiMarker(
        "<Autocomplete getOptionLabel={(o) => o.label} multiple />"
      )
    ).toBe(true);
    // 嵌套对象内的 SelectProps.multiple 不得因首个右花括号截断而漏检：
    // SelectProps 值为嵌套对象（如 MenuProps）时 multiple 深处出现仍须命中。
    expect(
      matchesMultiMarker(
        "<TextField SelectProps={{ MenuProps: { disablePortal: true }, multiple: true }} />"
      )
    ).toBe(true);
    // 更深嵌套（multiple 之前已有两层花括号）同样不得截断漏检。
    expect(
      matchesMultiMarker(
        "<TextField SelectProps={{ a: { b: { c: 1 } }, multiple: true }} />"
      )
    ).toBe(true);
    // 嵌套对象不含 multiple 不命中。
    expect(
      matchesMultiMarker(
        "<TextField SelectProps={{ MenuProps: { disablePortal: true } }} />"
      )
    ).toBe(false);
  });

  test("quoted attribute values mentioning multiple are not multi-select markers", () => {
    // 反例：单选 Select 的 label 文本含 multiple 字样，剥离引号值后不命中。
    expect(
      matchesMultiMarker('<Select label="Choose multiple languages" />')
    ).toBe(false);
    // 正例：真多选携带同款 label，剥离后裸 multiple 属性仍命中。
    expect(
      matchesMultiMarker(
        '<Select label="Choose multiple languages" multiple />'
      )
    ).toBe(true);
    // 转义引号夹具：单引号值内含 \' 转义，剥离须正确消费转义序列，
    // 不得因引号剥离误伤而吞掉其后的 multiple。
    expect(
      matchesMultiMarker("<Select title='don\\'t crash' multiple />")
    ).toBe(true);
    // 花括号表达式形态（标记 2）不受剥离影响：同款 label + multiple={}
    // 仍命中。
    expect(
      matchesMultiMarker(
        '<Select label="Choose multiple languages" multiple={true} />'
      )
    ).toBe(true);
  });

  test("unbalanced quotes in earlier string literals do not swallow later real sites", () => {
    // 加固：单引号串内孤立双引号 + =" 起点，双引号独立配对会跨 span 吞并
    // 其后真多选站点（覆盖闸假阴）；剥离须在 = 起点按同引号原子配对，
    // 嵌入异种引号的 span 整段消费、不得向外越界。
    const source = [
      "const note = 'value = \" missing';",
      "<Select multiple />",
      'const tag = "x";',
    ].join("\n");
    expect(matchesMultiMarker(source)).toBe(true);
  });

  test("renderValue detection ignores line-end comment mentions", () => {
    // 行尾注释中的 renderValue 不构成声明：真实声明删除后不得借注释通过。
    expect(
      hasRenderValueDeclaration(
        "const label = value; // renderValue: (v) => v\n<MenuItem />"
      )
    ).toBe(false);
    // 真实声明形态仍计数。
    expect(
      hasRenderValueDeclaration("renderValue: (value) => value.label")
    ).toBe(true);
    // 字符串内的 // 不得吞掉同行更早的真实声明。
    expect(
      hasRenderValueDeclaration(
        "renderValue: (v) => `https://example.com/${v}`"
      )
    ).toBe(true);
  });

  test("renderValue scan path reports line-end-comment-only mentions as offenders", () => {
    // 磁盘实扫路径的判定口径：仅行尾注释提及 renderValue 的站点不得视为
    // 已声明——readText 注入合成文本，与磁盘遍历共用同一纯函数。
    // 合成文本须含 MenuCheckGlyph 字样以通过纯函数保留的早退守卫
    //（if (!text.includes("MenuCheckGlyph")) return false;），否则 offenders
    // 恒为空，红/绿两步均不可收敛。
    const offenders = scanRenderValueOffenders(
      ["fake/Site.js"],
      () =>
        "const label = value; // renderValue: (v) => v\n<MenuItem><MenuCheckGlyph /></MenuItem>"
    );
    expect(offenders).toEqual(["fake/Site.js"]);
    // 真实声明形态不计入 offenders。合成文本同样须含字形以越过早退守卫，
    // 使本断言经由 hasRenderValueDeclaration 真实判定路径收敛，而非守卫
    // 早退的恒空返回。
    expect(
      scanRenderValueOffenders(
        ["fake/Site.js"],
        () =>
          "renderValue: (v) => v.label\n<MenuItem><MenuCheckGlyph /></MenuItem>"
      )
    ).toEqual([]);
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
        return matchesMultiMarker(text);
      });
    expect(offenders).toEqual([]);
  });

  test("registered MUI Select multi-select sites with inline glyphs must declare renderValue", () => {
    // 注释里的说明性文字不得充当契约满足：判定口径单源于
    // hasRenderValueDeclaration（剔除块注释与行尾注释后判声明形态）。
    // 静态扫描无法做"每个多选 Select 逐一配对"的条目级判定，该层保障
    // 仍由条目级运行时夹具承载——这一文件级口径是有意取舍，可接受。
    const renderValueOffenders = scanRenderValueOffenders(
      MUI_SELECT_SITES,
      (file) => readFileSync(path.join(SRC, file), "utf8")
    );
    expect(renderValueOffenders).toEqual([]);
  });

  test("non-MUI checkbox surfaces must not adopt renderValue", () => {
    for (const file of NON_MUI_SITES) {
      const text = readFileSync(path.join(SRC, file), "utf8");
      expect(hasRenderValueDeclaration(text)).toBe(false);
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
