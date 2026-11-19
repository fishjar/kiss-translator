// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { visualDocumentBlocks } from "../../../libs/document/visualResult";
import {
  blockMarkdown,
  renderDocumentBlock,
  documentMarkdown,
  renderDocumentMarkdown,
  translateDocumentBlocks,
} from "../../../libs/document/markdown";
import { mergeAcrossPages } from "../../../libs/pdf/structure";

const options = {
  id: "p1-r1",
  page: 1,
  bbox: [20, 30, 220, 130],
  fingerprint: "snapshot",
};
const result = (items: any[]) => ({
  format: "markdown",
  imageSize: { width: 100, height: 50 },
  items,
});

it("keeps a full response with unequal source and target paragraphs as one bilingual group", async () => {
  const blocks = visualDocumentBlocks(
    result([
      {
        text: "First\n\nSecond",
        translation: "完整译文",
        translationLanguage: "zh_CN",
        translationFromImage: true,
      },
    ]),
    options
  );
  const translate = vi.fn();
  await translateDocumentBlocks(
    blocks,
    translate,
    new AbortController().signal
  );
  expect(translate).not.toHaveBeenCalled();
  expect(blocks).toHaveLength(1);
  expect(blockMarkdown(blocks[0], "target")).toBe("完整译文");
  expect(blockMarkdown(blocks[0], "bilingual")).toBe(
    "First\n\nSecond\n\n完整译文"
  );
  expect(
    renderDocumentMarkdown(documentMarkdown(blocks, "bilingual"))
  ).toContain("完整译文");
});

it("keeps translation-only output and its source image in all export views", async () => {
  const blocks = visualDocumentBlocks(
    result([
      { text: "", translation: "只有译文", translationLanguage: "zh-CN" },
    ]),
    { ...options, sourceFallback: "![Source](assets/source.png)" }
  );
  expect(blocks[0].visualResult.text).toBe("");
  expect(blockMarkdown(blocks[0], "source")).toContain("assets/source.png");
  expect(blockMarkdown(blocks[0], "target")).toBe("只有译文");
  const translate = vi.fn();
  await translateDocumentBlocks(
    blocks,
    translate,
    new AbortController().signal
  );
  expect(translate).not.toHaveBeenCalled();
});

it("only translates missing region content and maps crop coordinates into the page", async () => {
  const blocks = visualDocumentBlocks(
    result([
      {
        id: "a",
        text: "Hello",
        translation: "你好",
        translationLanguage: "zh-CN",
        regionPoly: [
          [0, 0],
          [50, 0],
          [50, 20],
          [0, 20],
        ],
      },
      {
        id: "b",
        text: "World",
        translation: "",
        regionPoly: [
          [50, 20],
          [100, 20],
          [100, 50],
          [50, 50],
        ],
      },
    ]),
    options
  );
  const translate = vi.fn(async () => "世界");
  await translateDocumentBlocks(
    blocks,
    translate,
    new AbortController().signal
  );
  expect(translate).toHaveBeenCalledTimes(1);
  expect(translate.mock.calls[0][0]).toBe("World");
  expect(blocks[0].bbox).toEqual([20, 30, 120, 70]);
  expect(blocks[1].bbox).toEqual([120, 70, 220, 130]);
  expect(blockMarkdown(blocks[1], "target")).toBe("世界");
});

it("retains independent errors and never falls back from an absent source", async () => {
  const blocks = visualDocumentBlocks(
    result([{ text: "", error: "No original text" }]),
    options
  );
  const translate = vi.fn();
  await translateDocumentBlocks(
    blocks,
    translate,
    new AbortController().signal
  );
  expect(translate).not.toHaveBeenCalled();
  expect(blocks[0].status).toBe("error");
});

it("does not interpret plain text markup as HTML", () => {
  const blocks = visualDocumentBlocks(
    {
      ...result([
        {
          text: "<b>Source</b>",
          translation: "<b>Target</b>",
          translationLanguage: "zh-CN",
        },
      ]),
      format: "text",
    },
    options
  );
  expect(renderDocumentMarkdown(blockMarkdown(blocks[0], "target"))).toContain(
    "&lt;b&gt;Target&lt;/b&gt;"
  );
});

it("keeps visual groups out of cross-page paragraph merging", () => {
  const first = visualDocumentBlocks(
    result([
      { text: "Unfinished", translation: "前页", translationLanguage: "zh-CN" },
    ]),
    { ...options, bbox: [20, 700, 220, 790] }
  );
  const second = visualDocumentBlocks(
    result([
      {
        text: "continuation",
        translation: "后页",
        translationLanguage: "zh-CN",
      },
    ]),
    { ...options, page: 2, bbox: [20, 10, 220, 30] }
  );
  expect(
    mergeAcrossPages(
      [...first, ...second],
      [
        { page: 1, height: 800 },
        { page: 2, height: 800 },
      ]
    )
  ).toHaveLength(2);
});

it("renders source anchors from visual content instead of the empty legacy AST", () => {
  const block = visualDocumentBlocks(
    result([
      {
        text: "Visible source",
        translation: "Visible target",
        translationLanguage: "zh-CN",
      },
    ]),
    options
  )[0];
  block.sourceAnchors = [{ id: "body", type: "paragraph" }];
  expect(renderDocumentBlock(block, "source")).toContain("Visible source");
  expect(renderDocumentBlock(block, "target")).toContain("Visible target");
  expect(renderDocumentBlock(block, "bilingual")).toContain("Visible source");
  expect(renderDocumentBlock(block, "bilingual")).toContain("Visible target");
});
