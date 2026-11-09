import { describe, expect, it } from "vitest";
import { textRegion } from "../../../libs/pdf/formulaGeometry";
import { nativeTableRegions } from "../../../libs/pdf/nativeTables";
import {
  buildLines,
  blockToMarkdown,
  buildToc,
  mergeAcrossPages,
  paragraphBlocks,
  rawPageFromText,
  readingOrder,
} from "../../../libs/pdf/structure";
const line = (id: string, x: number, y: number, w = 200) => ({
  id,
  text: id,
  bbox: [x, y, x + w, y + 10],
  fontSize: 10,
  spans: [],
});
describe("PDF structural flow", () => {
  it("protects repeated native math without changing letters within prose", () => {
    expect(
      blockToMarkdown({
        type: "paragraph",
        text: "Energy y + y",
        inlineMath: ["y", "y"],
      })
    ).toBe("Energy $y$ + $y$");
  });
  it("keeps detected inline math in its paragraph and marks it for translation protection", () => {
    const spans = [
      {
        id: "word",
        text: "Energy",
        bbox: [30, 50, 65, 60],
        baseline: 60,
        fontSize: 10,
        font: "regular",
      },
      {
        id: "formula",
        text: "E=mc²",
        bbox: [70, 50, 110, 60],
        baseline: 60,
        fontSize: 10,
        font: "regular",
      },
    ];
    const raw = { page: 1, width: 600, height: 800, spans };
    const blocks = paragraphBlocks(raw, buildLines(raw), [
      { id: "inline", type: "inline-formula", bbox: [68, 48, 112, 62] },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blockToMarkdown(blocks[0])).toContain("$E=mc²$");
    expect(blocks[0].spanIds).toEqual(["word", "formula"]);
  });
  it("does not classify normal prose as headings when figure labels dominate line counts", () => {
    const body = {
      ...line(
        "Normal prose with enough text to establish the body font",
        30,
        30
      ),
      fontSize: 12,
      baseline: 42,
      spans: [
        {
          id: "body",
          font: "regular",
          fontSize: 12,
          text: "Normal prose with enough text to establish the body font",
        },
      ],
    };
    const labels = Array.from({ length: 10 }, (_, i) => ({
      ...line("x", 330, 100 + i * 10),
      fontSize: 6,
      baseline: 106 + i * 10,
      spans: [{ id: `label-${i}`, font: "chart", fontSize: 6, text: "x" }],
    }));
    const blocks = paragraphBlocks({ page: 1, width: 600, height: 800 }, [
      body,
      ...labels,
    ]);
    expect(blocks.find((b) => b.spanIds.includes("body")).type).toBe(
      "paragraph"
    );
  });
  it("detects aligned numeric tables but keeps numbered two-column prose", () => {
    const spans = ["Header", "First", "Second"].flatMap((text, row) => [
      {
        text,
        bbox: [30, 50 + row * 16, 70, 60 + row * 16],
        baseline: 60 + row * 16,
        fontSize: 10,
      },
      {
        text: row ? String(row * 10) : "Value",
        bbox: [130, 50 + row * 16, 170, 60 + row * 16],
        baseline: 60 + row * 16,
        fontSize: 10,
      },
    ]);
    expect(nativeTableRegions({ page: 1, spans })).toHaveLength(1);
    expect(
      nativeTableRegions({
        page: 1,
        spans: spans.map((s) => ({
          ...s,
          text: "[1] Paragraph with a citation 2026",
        })),
      })
    ).toHaveLength(0);
  });
  it("merges repeated-header tables without mutating cached pages", () => {
    const pages = [
      { page: 1, width: 600, height: 800 },
      { page: 2, width: 600, height: 800 },
    ];
    const blocks = [1, 2].map((page) => ({
      id: `table-${page}`,
      type: "table",
      source: "native",
      markdown: `| Key | Value |\n| --- | --- |\n| row${page} | ${page} |`,
      fragments: [
        {
          page,
          bbox: [30, page === 1 ? 680 : 30, 300, page === 1 ? 780 : 100],
          lineIds: [],
        },
      ],
      spanIds: [],
      cells: [
        { rowStart: 0, rowEnd: 1, text: "Key" },
        { rowStart: 0, rowEnd: 1, text: "Value" },
        { rowStart: 1, rowEnd: 2, text: `row${page}` },
        { rowStart: 1, rowEnd: 2, text: String(page) },
      ],
    }));
    const before = JSON.stringify(blocks);
    const merged = mergeAcrossPages(blocks, pages);
    expect(merged).toHaveLength(1);
    expect(merged[0].fragments).toHaveLength(2);
    expect(merged[0].cells.at(-1).rowStart).toBe(2);
    expect(JSON.stringify(blocks)).toBe(before);
    expect(mergeAcrossPages(blocks, pages)[0].markdown).toBe(
      merged[0].markdown
    );
  });
  it("reads full-width title, then left column, then right column", () => {
    const lines = [
      line("right1", 330, 50),
      line("left2", 30, 80),
      line("title", 30, 10, 500),
      line("right2", 330, 80),
      line("left1", 30, 50),
    ];
    expect(readingOrder(lines, 600, 800).map((l) => l.id)).toEqual([
      "title",
      "left1",
      "left2",
      "right1",
      "right2",
    ]);
  });
  it("separates widely spaced spans on the same baseline", () => {
    const raw = rawPageFromText(
      {
        items: [
          {
            str: "Left",
            fontName: "f",
            transform: [10, 0, 0, 10, 30, 700],
            width: 150,
          },
          {
            str: "Right",
            fontName: "f",
            transform: [10, 0, 0, 10, 330, 700],
            width: 150,
          },
        ],
        styles: { f: { ascent: 0.8 } },
      },
      {
        transform: [1, 0, 0, -1, 0, 800],
        scale: 1,
        width: 600,
        height: 800,
        rotation: 0,
      },
      1
    );
    expect(buildLines(raw).map((l) => l.text)).toEqual(["Left", "Right"]);
  });
  it("merges a continuing paragraph while retaining both page fragments", () => {
    const make = (page: number, text: string, box: number[]) => ({
      id: `b${page}`,
      type: "paragraph",
      source: "native",
      fontSize: 10,
      text,
      bbox: box,
      spanIds: [`s${page}`],
      fragments: [{ page, bbox: box, lineIds: [`l${page}`] }],
    });
    const result = mergeAcrossPages(
      [
        make(1, "contin-", [30, 740, 250, 760]),
        make(2, "uation", [30, 60, 250, 80]),
      ],
      [
        { page: 1, height: 800, width: 600 },
        { page: 2, height: 800, width: 600 },
      ]
    );
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("continuation");
    expect(result[0].fragments).toHaveLength(2);
  });
  it("keeps finished paragraphs separate", () => {
    const blocks = [1, 2].map((page) => ({
      id: `b${page}`,
      type: "paragraph",
      source: "native",
      fontSize: 10,
      text: page === 1 ? "Finished." : "another",
      spanIds: [],
      fragments: [
        {
          page,
          bbox: [30, page === 1 ? 740 : 60, 250, page === 1 ? 760 : 80],
          lineIds: [],
        },
      ],
    }));
    expect(
      mergeAcrossPages(blocks, [
        { page: 1, height: 800, width: 600 },
        { page: 2, height: 800, width: 600 },
      ])
    ).toHaveLength(2);
  });
  it("prefers bookmark navigation and fills missing Markdown headings", () => {
    const blocks = [
      {
        id: "intro",
        type: "heading",
        text: "Introduction",
        level: 1,
        fragments: [{ page: 1, bbox: [20, 100, 200, 120] }],
      },
      {
        id: "methods",
        type: "heading",
        text: "Methods",
        level: 2,
        fragments: [{ page: 2, bbox: [20, 100, 200, 120] }],
      },
    ];
    const toc = buildToc(
      [{ id: "book", title: "Intro bookmark", page: 1, y: 100, depth: 0 }],
      blocks,
      3
    );
    expect(toc.map((e) => e.title)).toEqual(["Intro bookmark", "Methods"]);
    expect(toc[0].blockId).toBe("intro");
  });
  it("does not discard native content outside detector regions", () => {
    const raw = { page: 1, width: 600, height: 800, spans: [] };
    const l = { ...line("Unmatched", 30, 60), spans: [{ id: "s1" }] };
    expect(paragraphBlocks(raw, [l], [])[0].text).toBe("Unmatched");
  });
});

it("does not merge neighboring text regions or unassigned prose across layout boundaries", () => {
  const spans = [
    { id: "first", text: "First region", font: "regular", fontSize: 10, baseline: 60, bbox: [30, 50, 100, 60] },
    { id: "second", text: "Second region", font: "regular", fontSize: 10, baseline: 60.0001, bbox: [102, 50, 170, 60] },
    { id: "outside", text: "Outside detector", font: "regular", fontSize: 10, baseline: 75, bbox: [30, 65, 100, 75] },
  ];
  const raw = { page: 1, width: 600, height: 800, spans };
  const regions = [{ id: "first-region", type: "paragraph", bbox: [28, 48, 101, 62] },
    { id: "second-region", type: "paragraph", bbox: [102, 48, 172, 62] }];
  expect(buildLines(raw, regions)).toHaveLength(3);
  expect(paragraphBlocks(raw, buildLines(raw, regions), regions).map((block) => block.text))
    .toEqual(["First region", "Second region", "Outside detector"]);
});


it.each([[0, 0, 72], [NaN, -0.2, 72], [0.7, -0.2, 73], [0, -1, 72]])(
  "uses valid font metrics or the existing fallback for ascent %s and descent %s", (ascent, descent, expectedTop) => {
  const raw = rawPageFromText({ items: [{ str: "x", fontName: "f", transform: [10, 0, 0, 10, 20, 20], width: 5 }],
    styles: { f: { ascent, descent } } }, { transform: [1, 0, 0, -1, 0, 100], scale: 1, width: 100, height: 100 }, 1);
  expect(raw.spans[0].bbox[1]).toBe(expectedTop);
  expect(raw.spans[0].baseline).toBe(80);
});

it("prioritizes explicit formula numbers and the smallest formula without deleting neighboring text", () => {
  const body = { id: "body", type: "paragraph", bbox: [0, 0, 300, 100] };
  const outer = { id: "outer", type: "formula", bbox: [20, 20, 200, 70] };
  const inner = { id: "inner", type: "inline-formula", bbox: [30, 30, 80, 50] };
  const number = { id: "number", type: "formula_number", bbox: [180, 30, 195, 50] };
  const regions = [body, outer, inner, number];
  expect(textRegion([35, 35, 70, 45], regions)?.id).toBe("inner");
  expect(textRegion([180, 35, 190, 45], regions)?.id).toBe("number");
  expect(textRegion([220, 35, 260, 45], regions)?.id).toBe("body");
  expect(textRegion([35, 35, 70, 45], [inner, { ...inner, id: "tied" }])?.id).toBe("inner");
});
