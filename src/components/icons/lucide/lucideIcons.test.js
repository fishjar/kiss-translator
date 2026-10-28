// Generated lucide icons module smoke (green-guard): the module under test exists only
// after `node src/scripts/gen-lucide-icons.mjs` has run, so this file never serves as a
// red-light probe — it guards the generated artifact's shape and the name→glyph contract.
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as Lucide from "./index";
import { GLYPH_META } from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const renderIconSvg = (Icon) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Icon />);
  });
  const svg = container.querySelector("svg");
  act(() => root.unmount());
  container.remove();
  return svg;
};

// 单一真源契约：所有"判等/判异"从 GLYPH_META（生成器由 MAPPING/FILLED 单点
// emit）的 (kebab, fill) 派生，绝不手写名单——手写表与 MAPPING 漂移会产生
// "首跑即红且红因非缺陷"的自相矛盾（r2 已实证）。
// 判等键 = `${kebab}|${fill}`；fill=currentColor 为实心"开"态，none 为描边。
// 守卫不 import 构建脚本本身（jest 27 无法解析 .mjs），元数据经产物内联，
// 随每次生成同步刷新，等价于同一真源。
const NAME_TO_KEBAB = Object.fromEntries(
  GLYPH_META.map(({ name, kebab }) => [name, kebab])
);
const FILLED = new Set(
  GLYPH_META.filter(({ fill }) => fill === "currentColor").map(
    ({ name }) => name
  )
);

const glyphKey = (name) => {
  const kebab = NAME_TO_KEBAB[name];
  if (!kebab) return undefined;
  return `${kebab}|${FILLED.has(name) ? "currentColor" : "none"}`;
};

// 从 GLYPH_META 派生判等组：同一 glyphKey 的名聚为一组（含 Xxx/XxxRounded 族）。
const deriveEqualGroups = () => {
  const byKey = new Map();
  for (const { name } of GLYPH_META) {
    const key = glyphKey(name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(name);
  }
  return [...byKey.values()];
};

// lucide-static 1.61.0 上游数据事实：trash.svg 与 trash-2.svg 的形状子元素
// 逐字相同（仅 class 属性不同，生成器丢弃 class），故 Delete(trash) 与
// DeleteOutline/DeleteOutlineRounded(trash-2) 渲染结果必然一致。这是上游
// 同形异名，非本仓误映射——MAPPING 忠实映射了两个不同的上游 kebab。
// 显式列举（而非"任意相同即放过"）使新增静默重复必须显式登记才可豁免。
const UPSTREAM_IDENTICAL_KEBABS = [["trash", "trash-2"]];

const upstreamIdentical = (kebabA, kebabB) =>
  UPSTREAM_IDENTICAL_KEBABS.some(
    ([a, b]) => (kebabA === a && kebabB === b) || (kebabA === b && kebabB === a)
  );

// 从 GLYPH_META 派生判异对：glyphKey 不同的任意两名须渲染不同 DOM。这是防
// "不同 kebab 被误映射成同一 kebab"的证伪锚——误映射会令两键趋同，本组相应
// 断言变红。上游同形异名（见 UPSTREAM_IDENTICAL_KEBABS）显式豁免。
const deriveDistinctPairs = () => {
  const names = GLYPH_META.map(({ name }) => name);
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (glyphKey(names[i]) === glyphKey(names[j])) continue;
      if (upstreamIdentical(NAME_TO_KEBAB[names[i]], NAME_TO_KEBAB[names[j]])) {
        continue;
      }
      pairs.push([names[i], names[j]]);
    }
  }
  return pairs;
};

// 渲染为实心（fill=currentColor）的"开"态语义字形；其余必须描边。
// 显式名单（导出名口径）是 FILLED 生成器集合的契约锁：扩充实心档必须在此显式
// 登记，防止生成器单点静默放宽后无任何守卫变红。
const SOLID_GLYPHS = new Set(["FavoriteIcon", "PushPinIcon"]);

const groupFill = (svg) => svg.querySelector("g")?.getAttribute("fill");

describe("lucide icons module (generated)", () => {
  const entries = Object.entries(Lucide).filter(
    ([name]) => name !== "GLYPH_META"
  );
  // 签名口径取 <g> 子树 outerHTML：svg 根的 data-testid 随导出名变化，
  // 混入 outerHTML 会让"同 glyph 判等"永假（不同名的 testid 必然不同）。
  const markup = Object.fromEntries(
    entries.map(([name, Icon]) => [
      name,
      renderIconSvg(Icon).querySelector("g").outerHTML,
    ])
  );

  test("exports exactly the mapped icon components", () => {
    expect(entries).toHaveLength(188);
    for (const [name, Icon] of entries) {
      expect(typeof Icon === "function" || Boolean(Icon && Icon.$$typeof)).toBe(
        true
      );
      expect(name.endsWith("Icon")).toBe(true);
    }
  });

  test("glyph metadata covers every export with a unique name", () => {
    // 派生元数据与导出集合同一集合：GLYPH_META 增删后若与导出漂移即红。
    expect(GLYPH_META).toHaveLength(188);
    const metaNames = new Set(GLYPH_META.map(({ name }) => name));
    expect(metaNames).toEqual(new Set(entries.map(([name]) => name)));
    for (const { name, kebab, fill } of GLYPH_META) {
      expect(kebab).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(["none", "currentColor"]).toContain(fill);
    }
  });

  test("every icon renders stroke-wrapped shapes in a 24px viewBox", () => {
    for (const [, Icon] of entries) {
      const svg = renderIconSvg(Icon);
      expect(svg).not.toBeNull();
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      const group = svg.querySelector("g");
      expect(group).not.toBeNull();
      expect(group.getAttribute("stroke")).toBe("currentColor");
      expect(group.getAttribute("stroke-width")).toBe("2");
      expect(group.childNodes.length).toBeGreaterThan(0);
    }
  });

  test("no md3 transform artifact remains in the lucide glyph", () => {
    for (const [, Icon] of entries) {
      const svg = renderIconSvg(Icon);
      expect(svg.outerHTML).not.toContain("scale(0.025)");
    }
  });

  test("data-testid follows the displayName convention", () => {
    for (const [name, Icon] of entries) {
      const svg = renderIconSvg(Icon);
      expect(svg.getAttribute("data-testid")).toBe(name);
    }
  });

  test("mapping-derived equal groups render identical markup", () => {
    for (const group of deriveEqualGroups()) {
      for (const name of group) {
        if (name === group[0]) continue;
        expect(markup[group[0]]).toBe(markup[name]);
      }
    }
  });

  test("mapping-derived distinct pairs render different markup", () => {
    // 全对判异（glyphKey 不同且非上游同形异名即须不同 DOM）：误映射令两键
    // 趋同即变红。
    const pairs = deriveDistinctPairs();
    // 反自证：188 名须产出上万对，空数组意味着派生键整体失配、判异覆盖消失。
    expect(pairs.length).toBeGreaterThan(15000);
    for (const [a, b] of pairs) {
      expect(markup[a]).not.toBe(markup[b]);
    }
  });

  test("upstream-identical kebab exemptions are real and complete", () => {
    // 豁免表的双向自证：①表内每对确实渲染相同（否则豁免是凭空放行）；
    // ②表外不存在渲染相同的跨 kebab 对（否则表漏登记、判异闸被静默绕过）。
    for (const [a, b] of UPSTREAM_IDENTICAL_KEBABS) {
      const nameA = GLYPH_META.find(({ kebab }) => kebab === a).name;
      const nameB = GLYPH_META.find(({ kebab }) => kebab === b).name;
      expect(markup[nameA]).toBe(markup[nameB]);
    }
    const byMarkup = new Map();
    for (const { name, kebab } of GLYPH_META) {
      const stripped = markup[name];
      if (!byMarkup.has(stripped)) byMarkup.set(stripped, new Set());
      byMarkup.get(stripped).add(kebab);
    }
    const unlisted = [...byMarkup.values()].filter(
      (kebabs) =>
        kebabs.size > 1 &&
        !UPSTREAM_IDENTICAL_KEBABS.some(
          ([a, b]) => kebabs.has(a) && kebabs.has(b)
        )
    );
    expect(unlisted).toEqual([]);
  });

  test("every export is covered by the derived contract tables", () => {
    // 反自证：派生表须恰好覆盖全部 188 名（防 MAPPING 增删后表悄悄失覆盖）。
    const inEqual = new Set(deriveEqualGroups().flat());
    const inDistinct = new Set(deriveDistinctPairs().flat());
    for (const { name } of GLYPH_META) {
      expect(inEqual.has(name)).toBe(true);
      expect(inDistinct.has(name)).toBe(true);
    }
  });

  test("filled semantic-open glyphs are solid, the rest are stroked", () => {
    for (const [name, Icon] of entries) {
      const svg = renderIconSvg(Icon);
      if (SOLID_GLYPHS.has(name)) {
        expect(groupFill(svg)).toBe("currentColor");
      } else {
        expect(groupFill(svg)).toBe("none");
      }
    }
  });

  test("the explicit solid list matches the emitted glyph metadata", () => {
    // 契约对账：显式名单与 emit 的 fill=currentColor 集合必须同集合，
    // 任一方向漂移即红（防生成器单点静默放宽实心档）。
    expect(FILLED).toEqual(SOLID_GLYPHS);
  });

  test("spot-checked icon names map to expected kebab glyphs", () => {
    // PR #17 评审 Nitpick #5（聚焦子集）：评审方标注 Poor tradeoff——全表
    // 重复维护 153 名成本高于 MAPPING 漂移风险，故仅锁语义关键名（12 个）。
    // 覆盖核心风险面：生成器 MAPPING 静默漂移时，至少常用名必须红。
    // Fact Supremacy 修正：CopyIcon/SettingsIcon/ChevronDownIcon 不在
    // MAPPING（MAPPING 用 ContentCopy/SettingsRounded/ArrowDropDown），
    // 按磁盘事实修正。
    const KEBAB_SPOT_CHECK = {
      TranslateIcon: "languages",
      CloseIcon: "x",
      ContentCopyIcon: "copy",
      SearchIcon: "search",
      SettingsRoundedIcon: "settings",
      ArrowDropDownIcon: "chevron-down",
      ExpandMoreIcon: "chevron-down",
      AddIcon: "plus",
      RemoveIcon: "minus",
      MenuIcon: "menu",
      SaveIcon: "save",
      DeleteIcon: "trash",
    };
    for (const [name, kebab] of Object.entries(KEBAB_SPOT_CHECK)) {
      expect(NAME_TO_KEBAB[name]).toBe(kebab);
    }
  });
});
