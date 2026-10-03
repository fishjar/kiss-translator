// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  documentMarkdown,
  parseDocumentMarkdown,
  renderDocumentBlock,
  tableCellsFromHtml,
  translateDocumentBlocks,
} from "../../../libs/document/markdown";
describe("shared document Markdown", () => {
  it("translates restricted HTML without translating attributes or duplicating resources", async () => {
    const blocks = parseDocumentMarkdown(
      '<div><p>Guide <a href="https://example.com">Link</a></p><pre>const x=1</pre><img src="data:image/png;base64,AQID"></div>'
    );
    await translateDocumentBlocks(
      blocks,
      async (text) => text.replace(/Guide|Link/g, (s) => `译${s}`),
      new AbortController().signal
    );
    expect(blocks[0].status).toBe("done");
    expect(blocks[0].targetRaw).toContain('href="https://example.com"');
    expect(blocks[0].targetRaw).toContain("译Guide");
    expect(blocks[0].targetRaw).toContain("const x=1");
    expect(blocks[0].bilingualRaw.match(/<img/g)).toHaveLength(1);
  });
  it("preserves nested-parenthesis destinations and link titles", async () => {
    const blocks = parseDocumentMarkdown(
      '[Guide](https://example.com/a_(b) "Reference")'
    );
    await translateDocumentBlocks(
      blocks,
      async (text) => text.replace("Guide", "指南"),
      new AbortController().signal
    );
    expect(blocks[0].status).toBe("done");
    const link = blocks[0].targetAst.children[0];
    expect(link.url).toBe("https://example.com/a_(b)");
    expect(link.title).toBe("Reference");
    expect(blocks[0].targetRaw).toContain("指南");
  });
  it("protects math, code and link destinations while translating headings and lists", async () => {
    const blocks = parseDocumentMarkdown(
      "# Heading\n\nText $x^2$ and `code` [Guide](https://example.com).\n\n- First\n- Second\n\n```js\nx()\n```\n\n$$\ny=1\n$$"
    );
    await translateDocumentBlocks(
      blocks,
      async (text) =>
        text.replace(/Heading|Text|Guide|First|Second/g, (s) => `译${s}`),
      new AbortController().signal
    );
    const target = documentMarkdown(blocks, "target");
    expect(target).toContain("# 译Heading");
    expect(target).toContain("$x^2$");
    expect(target).toContain("`code`");
    expect(target).toContain("https://example.com");
    expect(target).toContain("译First");
    expect(target).toContain("x()");
    expect(renderDocumentBlock(blocks[1], "target")).toContain("katex");
  });
  it("preserves merged-cell geometry in translated HTML tables", async () => {
    const blocks = parseDocumentMarkdown(
      '<table><tr><th colspan="2">Title</th></tr><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></table>'
    );
    const cells = tableCellsFromHtml(blocks[0].raw);
    expect(cells[0].colEnd).toBe(2);
    expect(cells[1].rowEnd).toBe(3);
    await translateDocumentBlocks(
      blocks,
      async (text) => `译${text}`,
      new AbortController().signal
    );
    expect(blocks[0].targetRaw).toContain('colspan="2"');
    expect(blocks[0].targetRaw).toContain('rowspan="2"');
    expect(blocks[0].bilingualRaw).toContain("kt-source");
  });
  it("flags corrupted placeholders and retries only failed blocks", async () => {
    const blocks = parseDocumentMarkdown("Plain\n\nMath $x^2$");
    const translate = vi.fn(async (text) =>
      text.replace(/KTDOCMASK\d+END/g, "broken")
    );
    await translateDocumentBlocks(
      blocks,
      translate,
      new AbortController().signal
    );
    expect(blocks[0].status).toBe("done");
    expect(blocks[1].status).toBe("error");
    const retry = vi.fn(async (text) => text);
    await translateDocumentBlocks(blocks, retry, new AbortController().signal);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(blocks[1].status).toBe("done");
  });
  it("removes executable HTML and dangerous links", () => {
    const blocks = parseDocumentMarkdown(
      '<img src="x" onerror="alert(1)"><script>alert(1)</script>'
    );
    expect(renderDocumentBlock(blocks[0])).not.toContain("onerror");
    expect(renderDocumentBlock(blocks[0])).not.toContain("<script");
  });
  it("keeps completed blocks on cancellation", async () => {
    const blocks = parseDocumentMarkdown("One\n\nTwo");
    const abort = new AbortController();
    await expect(
      translateDocumentBlocks(
        blocks,
        async (text) => text,
        abort.signal,
        (done) => {
          if (done === 1) abort.abort();
        }
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(blocks[0].status).toBe("done");
    expect(blocks[1].status).toBe("idle");
  });
});


it("submits all document blocks, list items and table cells before any response", async () => {
  const source = [...Array.from({ length: 51 }, (_, i) => `Paragraph${i}`), "- First\n- Second", "<table><tr><td>CellA</td><td>CellB</td></tr></table>"].join("\n\n");
  const blocks = parseDocumentMarkdown(source);
  const pending: Array<{ text: string; resolve: (text: string) => void }> = [];
  const translate = vi.fn((text: string) => new Promise<string>((resolve) => pending.push({ text, resolve })));
  const run = translateDocumentBlocks(blocks, translate, new AbortController().signal);
  expect(pending).toHaveLength(55);
  [...pending].reverse().forEach(({ text, resolve }) => resolve(`译${text}`));
  await run;
  expect(blocks.every((block) => block.status === "done")).toBe(true);
  expect(blocks[0].targetRaw).toContain("译Paragraph0");
  expect(blocks[51].targetRaw.indexOf("译First")).toBeLessThan(blocks[51].targetRaw.indexOf("译Second"));
  expect(blocks[52].targetRaw.indexOf("译CellA")).toBeLessThan(blocks[52].targetRaw.indexOf("译CellB"));
});


it("cancels late document results without overwriting block state", async () => {
  const blocks = parseDocumentMarkdown("One\n\nTwo");
  const pending: Array<(text: string) => void> = [];
  const abort = new AbortController();
  const progress = vi.fn();
  const run = translateDocumentBlocks(blocks, () => new Promise<string>((resolve) => pending.push(resolve)), abort.signal, progress);
  expect(pending).toHaveLength(2);
  abort.abort();
  pending.forEach((resolve) => resolve("late"));
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(blocks.map((block) => block.status)).toEqual(["idle", "idle"]);
  expect(blocks.every((block) => !block.targetRaw)).toBe(true);
  expect(progress.mock.calls.every(([done]) => done === 0)).toBe(true);
});

it("a failed document block does not cancel independent blocks", async () => {
  const blocks = parseDocumentMarkdown("One\n\nTwo");
  await translateDocumentBlocks(blocks, async (text) => {
    if (text === "One") throw new Error("offline");
    return "译Two";
  }, new AbortController().signal);
  expect(blocks.map((block) => block.status)).toEqual(["error", "done"]);
  expect(blocks[1].targetRaw).toContain("译Two");
});
