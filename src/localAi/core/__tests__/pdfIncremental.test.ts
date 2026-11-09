import { expect, it } from "vitest";
import { incrementalPdfBlocks } from "../../../libs/pdf/incremental";

const pages = [1, 2, 3].map((page) => ({ page, width: 600, height: 800 }));
const paragraph = (page: number, text = "continued", y = 700) => ({ id: `p${page}`, type: "paragraph", source: "native", text,
  fontSize: 12, fragments: [{ page, bbox: [50, y, 500, y + 20] }], spanIds: [], textSources: [], sourceAnchors: [] });
it("admits only completed pages and delays the open continuation boundary", () => {
  const stable = paragraph(1, "Stable.", 200), tail = paragraph(1), pending = paragraph(2, "still recognizing", 50);
  const blocks = incrementalPdfBlocks([[stable, tail], [pending]], pages, [1], 3);
  expect(blocks.map((b) => b.translationReady)).toEqual([true, false, false]);
});
it("merges a confirmed continuation once and releases a closed boundary", () => {
  const first = paragraph(1, "inter-"), second = paragraph(2, "national result.", 50);
  const blocks = incrementalPdfBlocks([[first], [second]], pages, [1, 2], 3);
  expect(blocks).toHaveLength(1);
  expect(blocks[0].text).toBe("international result.");
  expect(blocks[0].translationReady).toBe(true);
  expect(blocks[0].fragments.map((f) => f.page)).toEqual([1, 2]);
  expect(first.text).toBe("inter-");
});
it("holds a multi-page continuation until the final page closes it", () => {
  const first = paragraph(1), second = { ...paragraph(2, "continued", 50), fragments: [{ page: 2, bbox: [50, 50, 500, 740] }] };
  const third = paragraph(3, "ending", 50);
  expect(incrementalPdfBlocks([[first], [second]], pages, [1, 2], 3)[0].translationReady).toBe(false);
  expect(incrementalPdfBlocks([[first], [second], [third]], pages, [1, 2, 3], 3)[0].translationReady).toBe(true);
});
it("does not merge across an incomplete page and releases explicit sentence endings", () => {
  const blocks = incrementalPdfBlocks([[paragraph(1, "Ended.")], [], [paragraph(3, "last", 50)]], pages, [1, 3], 3);
  expect(blocks).toHaveLength(2);
  expect(blocks.every((b) => b.translationReady)).toBe(true);
});
it("keeps formula, number and fallback regions ready when their page is complete", () => {
  const blocks = ["formula", "formula_number", "image"].map((type) => ({ ...paragraph(1), type, source: "image" }));
  expect(incrementalPdfBlocks([blocks], pages, [1], 3).every((b) => b.translationReady)).toBe(true);
});
it("holds and merges native tables without mutating cached page rows", () => {
  const table = (page: number, y: number) => ({ ...paragraph(page, "", y), type: "table", markdown: "|Header|\n|---|\n|Row|",
    cells: [{ rowStart: 0, rowEnd: 1, text: "Header" }, { rowStart: 1, rowEnd: 2, text: "Row" }] });
  const first = table(1, 700), second = table(2, 50);
  expect(incrementalPdfBlocks([[first]], pages, [1], 3)[0].translationReady).toBe(false);
  const merged = incrementalPdfBlocks([[first], [second]], pages, [1, 2], 3);
  expect(merged).toHaveLength(1);
  expect(merged[0].cells).toHaveLength(3);
  expect(merged[0].translationReady).toBe(true);
  expect(first.cells).toHaveLength(2);
});
