import { normalizeFormula } from "./formula";

const center = (box) => (box[1] + box[3]) / 2;
const overlapsY = (a, b) => Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
const bodyTypes = ["paragraph", "text", "heading", "caption"];
function modelTag(latex) {
  const match = /\\tag\*?\s*\{/.exec(latex);
  if (!match) return null;
  let depth = 1, end = match.index + match[0].length;
  const start = end;
  for (; end < latex.length && depth; end++) {
    if (latex[end - 1] === "\\") continue;
    if (latex[end] === "{") depth++;
    if (latex[end] === "}") depth--;
  }
  return latex.slice(start, end - 1).trim().replace(/^\\text\{([^{}]*)\}$/, "$1");
}

// Disjoint body-column extents identify gutters; spanning headings are excluded.
function gutters(regions, width) {
  const extents = regions.filter((r) => bodyTypes.includes(r.type) &&
    r.bbox[2] - r.bbox[0] >= width * 0.15 && r.bbox[2] - r.bbox[0] < width * 0.7)
    .map((r) => [r.bbox[0], r.bbox[2]]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const extent of extents) {
    const prior = merged.at(-1);
    if (prior && extent[0] <= prior[1]) prior[1] = Math.max(prior[1], extent[1]);
    else merged.push([...extent]);
  }
  return merged.slice(1).map((extent, index) => (merged[index][1] + extent[0]) / 2);
}

export function pairEquationNumbers(blocks, regions, width, onConflict = () => {}) {
  const active = regions.filter((r) => r.enabled !== false), cuts = gutters(active, width);
  const numbers = blocks.filter((b) => b.type === "formula_number" && active.some((r) => r.id === b.regionId));
  const formulas = blocks.filter((b) => b.type === "formula" && active.some((r) => r.id === b.regionId));
  const used = new Set(), replacements = new Map();
  for (const number of numbers) {
    const candidates = formulas.filter((formula) => {
      const f = formula.bbox, n = number.bbox;
      if (used.has(formula.id) || formula.fragments?.[0]?.page !== number.fragments?.[0]?.page ||
        n[0] < f[2] || n[0] - f[2] > width * 0.25 ||
        overlapsY(f, n) < Math.min(f[3] - f[1], n[3] - n[1]) * 0.5 ||
        cuts.some((x) => f[2] <= x && n[0] >= x)) return false;
      return !active.some((r) => bodyTypes.includes(r.type) && r.bbox[0] < n[0] && r.bbox[2] > f[2] &&
        overlapsY(r.bbox, [f[2], Math.max(f[1], n[1]), n[0], Math.min(f[3], n[3])]) > 0);
    }).sort((a, b) => Math.abs(center(a.bbox) - center(number.bbox)) - Math.abs(center(b.bbox) - center(number.bbox)) ||
      number.bbox[0] - a.bbox[2] - (number.bbox[0] - b.bbox[2]));
    const formula = candidates[0];
    const text = number.text?.trim(), label = text?.replace(/^\((.*)\)$/, "$1").trim();
    if (!formula || !label || /[\\{}$%&#_^~]/.test(label)) continue;
    let markdown = formula.markdown;
    if (markdown?.startsWith("$$")) {
      const latex = normalizeFormula(markdown), tag = modelTag(latex);
      if (tag !== null && tag !== label) {
        onConflict(formula, `公式编号冲突：模型编号 ${tag}，布局编号 ${text}`);
        continue;
      }
      markdown = `$$\n${latex}${tag !== null ? "" : `\\tag{${label}}`}\n$$`;
    } else markdown = `${markdown} ${text}`;
    used.add(formula.id); used.add(number.id);
    replacements.set(formula.id, { ...formula, markdown,
      equationNumber: { text, label, anchor: number.sourceAnchors?.[0] },
      sourceAnchors: [...(formula.sourceAnchors || []), ...(number.sourceAnchors || [])],
      fragments: [...formula.fragments, ...number.fragments], spanIds: [...formula.spanIds, ...number.spanIds] });
  }
  return blocks.filter((b) => !used.has(b.id) || replacements.has(b.id)).map((b) => replacements.get(b.id) || b);
}
