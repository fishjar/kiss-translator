import { expect, it } from "vitest";
import { deduplicateFormulaRegions, normalizeFormula, validateFormula } from "../../../libs/pdf/formula";

it.each([
  String.raw`\frac{\partial u_i}{\partial t}+\sum_{j=1}^{n}u_j\frac{\partial u_i}{\partial x_j}=0`,
  String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,
  String.raw`\begin{aligned}x&=a+b\\y&=c\end{aligned}`,
  String.raw`u_{}`,
])("accepts valid complex math without rewriting it: %s", (latex) => {
  expect(normalizeFormula(`$$\n\\[${latex}\\]\n$$`)).toBe(latex);
  expect(() => validateFormula(latex, true)).not.toThrow();
});

it("does not strip delimiters around multiple independent formulas", () => {
  expect(normalizeFormula("$a$ and $b$")).toBe("$a$ and $b$");
});

it("deduplicates near-identical formulas but retains partial overlap, neighbors and numbers", () => {
  const regions = [
    { id: "inline", type: "inline-formula", bbox: [0, 0, 100, 20] },
    { id: "display", type: "formula", bbox: [1, 0, 101, 20] },
    { id: "overlap", type: "formula", bbox: [80, 0, 150, 20] },
    { id: "next", type: "formula", bbox: [0, 30, 100, 50] },
    { id: "number", type: "number", bbox: [90, 0, 100, 20] },
  ];
  expect(deduplicateFormulaRegions(regions).map((r) => r.id)).toEqual(["display", "overlap", "next", "number"]);
  expect(regions).toHaveLength(5);
});
