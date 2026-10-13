import { expect, it, vi } from "vitest";
import { pairEquationNumbers } from "../../../libs/pdf/equationNumbers";
import equations from "./fixtures/pdfNavierEquationLayout.json";
import layout from "./fixtures/pdfNavierLayout.json";

const block = (id: string, type: string, bbox: number[], text: string, page = 1) => ({
  id, regionId: id, type, bbox, text, markdown: type === "formula" ? text : undefined,
  fragments: [{ page, bbox }], spanIds: [], sourceAnchors: [{ id: `p${page}:${id}`, regionId: id, type, page, bbox }],
});
const regions = (blocks: any[]) => blocks.map((b) => ({ id: b.id, type: b.type, bbox: b.bbox, enabled: true }));
const f = (id = "f", bbox = [40, 50, 200, 80], text = "$$\nx^2\n$$") => block(id, "formula", bbox, text);
const n = (id = "n", bbox = [230, 60, 245, 70], text = "(1)") => block(id, "formula_number", bbox, text);

it("pairs actual detected Navier formula and number bounds without changing region identities", () => {
  const selected = layout.regions.filter((r) => ["formula", "formula_number"].includes(r.type));
  const blocks = selected.map((r) => block(r.id, r.type, r.bbox, r.type === "formula" ? "$$\nx\n$$" : r.id === "number-0" ? "(1)" : "(2)"));
  const output = pairEquationNumbers(blocks, selected, 612);
  expect(output).toHaveLength(2);
  expect(output.map((b: any) => b.markdown)).toEqual(["$$\nx\\tag{1}\n$$", "$$\nx\\tag{2}\n$$"]);
  expect(output[0].sourceAnchors.map((a: any) => a.regionId)).toEqual(["display-0", "number-0"]);
  expect(blocks).toHaveLength(4);
});

it.each([
  ["different page", n("n", undefined, undefined), false],
  ["insufficient vertical overlap", n("n", [230, 79, 245, 90]), false],
  ["left number", n("n", [10, 60, 25, 70]), false],
  ["distant number", n("n", [400, 60, 415, 70]), false],
  ["multiline formula", n(), true],
])("checks geometric eligibility for %s", (name, number, paired) => {
  if (name === "different page") number.fragments[0].page = 2;
  const blocks = [f(), number];
  expect(pairEquationNumbers(blocks, regions(blocks), 600)).toHaveLength(paired ? 1 : 2);
});

it("keeps paragraph references, disabled numbers, and inline formulas independent", () => {
  for (const variant of ["paragraph", "disabled", "inline-formula"]) {
    const blocks = [f(), n()]; const layout = regions(blocks);
    if (variant === "paragraph") blocks[1].type = layout[1].type = "paragraph";
    if (variant === "disabled") layout[1].enabled = false;
    if (variant === "inline-formula") blocks[0].type = layout[0].type = variant;
    expect(pairEquationNumbers(blocks, layout, 600)).toHaveLength(2);
  }
});

it("does not cross another body region or a detected column gutter", () => {
  const blocks = [f(), n()];
  const blocker = { id: "body", type: "paragraph", enabled: true, bbox: [205, 50, 220, 80] };
  expect(pairEquationNumbers(blocks, [...regions(blocks), blocker], 600)).toHaveLength(2);
  const columns = [f("left", [100, 50, 245, 80]), n("right", [350, 60, 365, 70])];
  const bodies = [[30, 100, 250, 180], [340, 100, 560, 180]].map((bbox, i) => ({ id: `body-${i}`, type: "paragraph", bbox, enabled: true }));
  expect(pairEquationNumbers(columns, [...regions(columns), ...bodies], 600)).toHaveLength(2);
});

it("pairs closest vertical candidate once and uses source order for ties", () => {
  const blocks = [f("first"), f("second", [40, 50, 200, 90]), n(), n("duplicate")];
  const output = pairEquationNumbers(blocks, regions(blocks), 600);
  expect(output.map((b: any) => b.id)).toEqual(["first", "second"]);
  expect(output.map((b: any) => b.equationNumber.anchor.regionId)).toEqual(["n", "duplicate"]);
  const tied = [f("first"), f("second"), n()];
  expect(pairEquationNumbers(tied, regions(tied), 600)[0].equationNumber.anchor.regionId).toBe("n");
});

it("keeps pending and full image fallbacks in one numbered paragraph", () => {
  for (const text of ["_待识别…_", "![原公式](blob:formula)"]) {
    const blocks = [f("f", undefined, text), n()];
    const output = pairEquationNumbers(blocks, regions(blocks), 600);
    expect(output[0].markdown).toBe(`${text} (1)`);
    expect(output[0].bbox).toEqual(blocks[0].bbox);
  }
});

it("avoids duplicate model tags and reports conflicting tags without changing model output", () => {
  const same = [f("f", undefined, "$$\nx\\tag{1}\n$$"), n()];
  expect(pairEquationNumbers(same, regions(same), 600)[0].markdown).toBe(same[0].markdown);
  const conflicting = [f("f", undefined, "$$\nx\\tag{2}\n$$"), n()];
  const warn = vi.fn();
  expect(pairEquationNumbers(conflicting, regions(conflicting), 600, warn)).toEqual(conflicting);
  expect(warn).toHaveBeenCalledOnce();
});

it("preserves an existing formatted tag without appending a duplicate", () => {
  const blocks = [f("f", undefined, "$$\nx\\tag{\\text{1}}\n$$"), n()];
  expect(pairEquationNumbers(blocks, regions(blocks), 600)[0].markdown).toBe(blocks[0].markdown);
});

it("pairs all five actual detected equations on the Navier first page", () => {
  const blocks = equations.regions.map((r) => block(r.id, r.type, r.bbox, r.type === "formula" ? "$$\nx\n$$" : `(${r.id.split("-")[1]})`));
  const output = pairEquationNumbers(blocks, equations.regions, 612);
  expect(output.map((b: any) => b.equationNumber.label)).toEqual(["1", "2", "3", "4", "5"]);
});
