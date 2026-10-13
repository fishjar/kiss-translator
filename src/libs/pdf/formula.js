import katex from "katex";
export { formulaContainsSpan } from "./formulaGeometry";

export function normalizeFormula(output) {
  let text = String(output || "").trim();
  const fence = text.match(/^```(?:latex|tex|markdown)?\s*\n([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1].trim();
  for (;;) {
    const current = text;
    const pair = [["$$", "$$"], ["\\[", "\\]"], ["\\(", "\\)"], ["$", "$"]]
      .find(([start, end]) => current.length >= start.length + end.length &&
        current.startsWith(start) && current.endsWith(end) &&
        !current.slice(start.length, -end.length).includes(end));
    if (!pair) return text;
    text = text.slice(pair[0].length, -pair[1].length).trim();
  }
}

export function validateFormula(text, displayMode) {
  if (!text) throw new Error("公式识别结果为空");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text))
    throw new Error("公式包含无法解码的字符");
  katex.renderToString(text, { displayMode, throwOnError: true, trust: false });
}

const area = (box) => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
const intersection = (a, b) => area([
  Math.max(a[0], b[0]), Math.max(a[1], b[1]),
  Math.min(a[2], b[2]), Math.min(a[3], b[3]),
]);

export function deduplicateFormulaRegions(regions) {
  const formulas = regions.filter((r) => ["formula", "inline-formula"].includes(r.type));
  const removed = new Set();
  for (let i = 0; i < formulas.length; i++) {
    if (removed.has(formulas[i])) continue;
    for (let j = i + 1; j < formulas.length; j++) {
      if (removed.has(formulas[j])) continue;
      const a = formulas[i], b = formulas[j];
      const aa = area(a.bbox), ba = area(b.bbox), overlap = intersection(a.bbox, b.bbox);
      if (!aa || !ba) continue;
      let discard;
      if (overlap / (aa + ba - overlap) >= 0.9)
        discard = a.type === "inline-formula" && b.type === "formula" ? a : b;
      else if (overlap / Math.min(aa, ba) >= 0.95)
        discard = aa >= ba ? b : a;
      if (discard) removed.add(discard);
      if (discard === a) break;
    }
  }
  return regions.filter((r) => !removed.has(r));
}
