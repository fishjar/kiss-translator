// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  documentMarkdown,
  bindDocumentSources,
  parseDocumentMarkdown,
  renderDocumentBlock,
  renderDocumentMarkdown,
  tableCellsFromHtml,
  translateDocumentBlocks,
} from "../../../libs/document/markdown";
import { blockToMarkdown, mergeAcrossPages } from "../../../libs/pdf/structure";
import { normalizeFormula } from "../../../libs/pdf/formula";
describe("shared document Markdown", () => {
  it("renders normalized complex formula output without KaTeX errors", () => {
    const latex = normalizeFormula(String.raw`\[\frac{\partial u_i}{\partial t}+\sum_{j=1}^n u_j\frac{\partial u_i}{\partial x_j}=0\]`);
    const dom = document.createElement("div");
    dom.innerHTML = renderDocumentMarkdown(`$$\n${latex}\n$$`);
    expect(dom.querySelector(".katex")).not.toBeNull();
    expect(dom.querySelector(".katex-error")).toBeNull();
  });
  it("keeps an inline formula fallback image in its original paragraph", () => {
    const url = "blob:http://localhost/formula";
    const dom = document.createElement("div");
    dom.innerHTML = renderDocumentMarkdown(`Before ![原公式](${url}) after`, [url]);
    expect(dom.querySelectorAll("p")).toHaveLength(1);
    expect(dom.querySelector("p img")?.getAttribute("src")).toBe(url);
    expect(dom.textContent).toBe("Before  after");
  });
  it("allows only owned blob image sources without relaxing other attributes or protocols", () => {
    const url = "blob:http://localhost/owned";
    const input = `![figure](${url}) <img src="blob:http://localhost/foreign"><img src="javascript:alert(1)" onerror="alert(1)"><a href="${url}">unsafe link</a>`;
    const dom = document.createElement("div");
    dom.innerHTML = renderDocumentMarkdown(input, [url]);
    expect(dom.querySelector("img")?.getAttribute("src")).toBe(url);
    expect(dom.querySelectorAll("img[src]")).toHaveLength(1);
    expect(dom.querySelector("[onerror]")).toBeNull();
    expect(dom.querySelector("a[href]")).toBeNull();
    dom.innerHTML = renderDocumentMarkdown(input);
    expect(dom.querySelectorAll("img[src]")).toHaveLength(0);
  });
  it("translates restricted HTML without translating protected attributes or content", async () => {
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
    expect(blocks[0].bilingualRaw.match(/<img/g)).toHaveLength(2);
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


it("renders exact source anchors without changing exported Markdown", () => {
  const raw = "Before $x$ middle $x$ after";
  const block = parseDocumentMarkdown(raw)[0];
  block.sourceAnchors = [{ id: "body", type: "paragraph" }, { id: "first", type: "inline-formula" }, { id: "second", type: "inline-formula" }];
  bindDocumentSources(block.ast, [{ start: 0, end: raw.length, sourceIds: ["body"] },
    { start: 7, end: 10, sourceIds: ["first"] }, { start: 18, end: 21, sourceIds: ["second"] }], raw);
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block);
  expect(dom.querySelectorAll("p")).toHaveLength(1);
  expect(dom.textContent).toContain("Before");
  expect(dom.textContent).toContain("middle");
  expect(dom.textContent).toContain("after");
  expect(dom.querySelector('[data-pdf-source="first"] .katex')).not.toBeNull();
  expect(dom.querySelector('[data-pdf-source="second"] .katex')).not.toBeNull();
  expect(documentMarkdown([block])).toBe(raw);
  expect(renderDocumentMarkdown(documentMarkdown([block]))).not.toContain("data-pdf-source");
});

it("keeps identical formula identities through reordered translation placeholders", async () => {
  const raw = "Before $x$ then $x$";
  const block = parseDocumentMarkdown(raw)[0];
  block.sourceAnchors = [{ id: "body", type: "paragraph" }, { id: "first", type: "inline-formula" }, { id: "second", type: "inline-formula" }];
  bindDocumentSources(block.ast, [{ start: 7, end: 10, sourceIds: ["first"] }, { start: 16, end: 19, sourceIds: ["second"] }], raw);
  await translateDocumentBlocks([block], async () => "Second KTDOCMASK1END before first KTDOCMASK0END", new AbortController().signal, () => {});
  expect(block.status).toBe("done");
  const maths = block.targetAst.children.filter((node: any) => node.type === "inlineMath");
  expect(maths.map((node: any) => node.data.pdfSourceIds)).toEqual([["second"], ["first"]]);
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "target");
  expect([...dom.querySelectorAll('[data-pdf-source]')].filter((node) => node.querySelector(".katex")).map((node) => node.getAttribute("data-pdf-source"))).toEqual(["second", "first"]);
});


it("uses layout body anchors when a previous translation has no exact formula metadata", () => {
  const block = parseDocumentMarkdown("Before $x$")[0];
  block.status = "done"; block.targetRaw = "Translated $x$";
  block.targetAst = parseDocumentMarkdown(block.targetRaw)[0].ast;
  block.sourceAnchors = [{ id: "body", type: "paragraph" }, { id: "formula", type: "inline-formula" }];
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "target");
  expect(dom.querySelector('[data-pdf-source="formula"]')).toBeNull();
  expect(dom.querySelector('[data-pdf-source="body"] .katex')).not.toBeNull();
});

it("keeps source node anchors in bilingual rendering and exported content clean", async () => {
  const raw = "Before $x$ after";
  const block = parseDocumentMarkdown(raw)[0];
  block.sourceAnchors = [{ id: "body", type: "paragraph" }, { id: "formula", type: "inline-formula" }];
  bindDocumentSources(block.ast, [{ start: 0, end: 7, sourceIds: ["body"] }, { start: 7, end: 10, sourceIds: ["formula"] },
    { start: 10, end: raw.length, sourceIds: ["body"] }], raw);
  await translateDocumentBlocks([block], async () => "Translated KTDOCMASK0END text", new AbortController().signal, () => {});
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "bilingual");
  expect(dom.querySelectorAll(".katex")).toHaveLength(2);
  expect(dom.querySelector('[data-pdf-source="formula"] .katex')).not.toBeNull();
  expect(documentMarkdown([block], "bilingual")).not.toMatch(/pdfSource|data-pdf-source/);
});

it("keeps a display formula and fallback image bound to their layout frame", () => {
  for (const raw of ["$$\nx^2\n$$", "![Original formula](blob:formula)"]) {
    const block = parseDocumentMarkdown(raw)[0];
    block.sourceAnchors = [{ id: "display", type: "formula" }];
    bindDocumentSources(block.ast, [{ start: 0, end: raw.length, sourceIds: ["display"] }], raw);
    const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "source", [], ["blob:formula"]);
    expect(dom.querySelector('[data-pdf-source="display"]')).not.toBeNull();
  }
});


it("keeps different layout anchors when a hyphenated paragraph continues on the next page", () => {
  const parts = ["trans-", "lation continues"].map((text, index) => {
    const page = index + 1, bbox = [30, index ? 30 : 740, 250, index ? 50 : 760];
    const anchor = { id: `p${page}:body`, regionId: "body", type: "paragraph", page, bbox };
    return { id: `p${page}`, type: "paragraph", source: "native", fontSize: 10, text,
      fragments: [{ page, bbox, lineIds: [] }], sourceAnchors: [anchor], textSources: [{ start: 0, end: text.length, anchor }] };
  });
  const merged = mergeAcrossPages(parts, [{ page: 1, width: 600, height: 800 }, { page: 2, width: 600, height: 800 }])[0];
  const ranges: any[] = [], markdown = blockToMarkdown(merged, ranges);
  const block = parseDocumentMarkdown(markdown)[0]; block.sourceAnchors = merged.sourceAnchors;
  bindDocumentSources(block.ast, ranges, markdown);
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block);
  expect(dom.querySelector('[data-pdf-source="p1:body"]')?.textContent).toBe("trans");
  expect(dom.querySelector('[data-pdf-source="p2:body"]')?.textContent).toBe("lation continues");
  expect(dom.textContent?.trim()).toBe("translation continues");
  expect(dom.querySelectorAll("p")).toHaveLength(1);
});


it("renders numbered formulas with separate formula and tag source anchors in every view", () => {
  const block: any = parseDocumentMarkdown("$$\nx^2\\tag{1}\n$$")[0];
  block.type = "formula";
  block.sourceAnchors = [{ id: "formula", type: "formula" }, { id: "number", type: "formula_number" }];
  block.ast.data = { ...block.ast.data, pdfSourceIds: ["formula"] };
  block.equationNumber = { text: "(1)", label: "1", anchor: block.sourceAnchors[1] };
  for (const mode of ["source", "target", "bilingual"]) {
    const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, mode);
    expect(dom.querySelectorAll(".katex-display")).toHaveLength(1);
    expect(dom.querySelector('[data-pdf-source="formula"] .katex')).not.toBeNull();
    expect(dom.querySelector('.tag[data-pdf-source="number"]')?.textContent).toBe("(1)");
  }
  expect(documentMarkdown([block], "target")).toContain("\\tag{1}");
  expect(documentMarkdown([block])).not.toContain("pdf-source");
  expect(renderDocumentMarkdown(documentMarkdown([block]))).not.toContain("data-pdf-source");
});

it("keeps numbered fallback images in one row in preview and generic export rendering", async () => {
  const raw = "![原公式](blob:formula) (4)";
  const block: any = parseDocumentMarkdown(raw)[0];
  block.type = "formula";
  block.sourceAnchors = [{ id: "formula", type: "formula" }, { id: "number", type: "formula_number" }];
  bindDocumentSources(block.ast, [{ start: 0, end: 20, sourceIds: ["formula"] }, { start: 20, end: raw.length, sourceIds: ["number"] }], raw);
  block.equationNumber = { text: "(4)", label: "4", anchor: block.sourceAnchors[1] };
  block.ast.children[0].data = { pdfSourceIds: ["formula"] };
  block.ast.children[1].data = { pdfSourceIds: ["number"] };
  const translate = vi.fn();
  await translateDocumentBlocks([block], translate, new AbortController().signal, () => {});
  expect(translate).not.toHaveBeenCalled();
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block, "source", [], ["blob:formula"]);
  expect(dom.querySelectorAll("p.kt-equation-fallback")).toHaveLength(1);
  expect(dom.querySelector('img[data-pdf-source="formula"]')).not.toBeNull();
  expect(dom.querySelector('.kt-equation-number[data-pdf-source="number"]')?.textContent.trim()).toBe("(4)");
  dom.innerHTML = renderDocumentMarkdown(documentMarkdown([block]), ["blob:formula"]);
  expect(dom.querySelector('.kt-equation-fallback img')).not.toBeNull();
  expect(dom.querySelector('.kt-equation-number')?.textContent.trim()).toBe("(4)");
  expect(dom.querySelector('[data-pdf-source]')).toBeNull();
});


it.each(["Before _待识别…_ after", "_待识别…_", "_待提取图片…_"])("renders identified pending recognition as an inline spinner: %s", (raw) => {
  const block: any = parseDocumentMarkdown(raw)[0];
  block.sourceAnchors = [{ id: "pending", type: "formula" }];
  block.pendingSourceIds = ["pending"];
  bindDocumentSources(block.ast, [{ start: 0, end: raw.length, sourceIds: ["pending"] }], raw);
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block);
  expect(dom.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  expect(dom.querySelector('.kt-pdf-recognition-pending[data-pdf-source="pending"]')).not.toBeNull();
  expect(dom.textContent).not.toContain("待识别");
  expect(dom.textContent).not.toContain("待提取图片");
  expect(dom.textContent).toBe(raw.startsWith("Before") ? "Before  after" : "");
  expect(documentMarkdown([block])).toBe(raw);
  expect(documentMarkdown([block])).not.toContain("progressbar");
  expect(renderDocumentMarkdown(documentMarkdown([block]))).not.toContain("kt-pdf-recognition-pending");
  block.pendingSourceIds = [];
  expect(renderDocumentBlock(block)).not.toContain("kt-pdf-recognition-pending");
  expect(renderDocumentBlock(block)).toContain(raw.includes("待识别") ? "待识别" : "待提取图片");
});


it("renders a pending placeholder touching ordinary text without consuming adjacent characters", () => {
  const raw = "Before _待识别…_0 after", start = 7, end = start + "_待识别…_".length;
  const block: any = parseDocumentMarkdown(raw)[0];
  block.sourceAnchors = [{ id: "body", type: "paragraph" }, { id: "pending", type: "inline-formula" }];
  block.pendingSourceIds = ["pending"];
  bindDocumentSources(block.ast, [{ start: 0, end: start, sourceIds: ["body"] }, { start, end, sourceIds: ["pending"] },
    { start: end, end: raw.length, sourceIds: ["body"] }], raw);
  const dom = document.createElement("div"); dom.innerHTML = renderDocumentBlock(block);
  expect(dom.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  expect(dom.textContent).toBe("Before 0 after");
});
