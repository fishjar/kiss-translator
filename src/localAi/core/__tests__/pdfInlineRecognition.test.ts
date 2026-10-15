import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { detectPdfLayout, parsePdfDocument } from "../../../libs/pdf/pdfParser";
import { blockToMarkdown, buildLines, paragraphBlocks, rawPageFromText, readingOrder } from "../../../libs/pdf/structure";
import navierLayout from "./fixtures/pdfNavierLayout.json";
import { textRegion } from "../../../libs/pdf/formulaGeometry";
import nativeAbsoluteFormulas from "./fixtures/pdfNativeAbsoluteFormulas.json";
import nativeDisplayFormulas from "./fixtures/pdfNativeDisplayFormulas.json";
import nativeParagraph from "./fixtures/pdfNativeParagraph.json";
import { parseDocumentMarkdown } from "../../../libs/document/markdown";
import nativeFormulaText from "./fixtures/pdfNativeFormulaText.json";
import { renderPdfRegion } from "../../../libs/pdf/pdfDocument";

vi.mock("../../../libs/pdf/pdfDocument", () => ({
  PDFJS: { OPS: {} },
  renderPdfRegion: vi.fn(async () => new Blob(["crop"], { type: "image/png" })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Worker", class {
    onmessage: any;
    terminate() {}
    postMessage(data: any) {
      if (data.type === "page") {
        this.onmessage({ data: { id: data.id, result: { raw: rawPageFromText(data.content, data.viewport, data.page) } } });
        return;
      }
      const result = data.type === "raw"
        ? { blocks: paragraphBlocks(data.raw, buildLines(data.raw), data.regions) }
        : data.blocks;
      this.onmessage({ data: { id: data.id, result } });
    }
  });
});
afterEach(() => vi.unstubAllGlobals());

const spans = [
  { id: "word", text: "Energy", bbox: [30, 50, 65, 60], baseline: 60, fontSize: 10, font: "regular" },
  { id: "math", text: "�χ", bbox: [70, 50, 110, 60], baseline: 60, fontSize: 10, font: "regular" },
];
const region = { id: "inline", type: "inline-formula", bbox: [68, 48, 112, 62], enabled: true };
const config = (recognize: any, regions = [region]) => ({
  mode: "smart", enableJev: false, models: [], visionServiceSlug: "vlm",
  recognitionService: { apiSlug: "vlm", capability: "parseImage" },
  vlmPromptSlug: "document-only", services: [{ apiSlug: "vlm", recognitionSignature: "paddle-vl" }],
  client: { recognize }, onProgress: vi.fn(), layoutRegions: { 1: regions },
  previous: { pages: [{ page: 1, width: 600, height: 800, textGeometryVersion: 1, spans, graphics: { images: [], paths: [] } }] },
});
const pdf = { numPages: 1, getPage: vi.fn(async () => ({})) };

it("restores both formulas from real navier_stokes.pdf native text without duplicate glyph fragments", async () => {
  const raw = rawPageFromText(nativeFormulaText, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const formulas = navierLayout.regions.filter((region) => ["velocity", "force"].includes(region.id));
  const outputs = ["u(x,t)=(u_i(x,t))_{1\\leq i\\leq n}\\in\\mathbb{R}^n", "f=(f_i(x,t))_{1\\leq i\\leq n}"];
  const recognize = vi.fn().mockResolvedValueOnce({ text: outputs[0] }).mockResolvedValueOnce({ text: outputs[1] });
  const options = config(recognize, formulas);
  options.previous.pages = [raw];
  const result = await parsePdfDocument(pdf, options);
  const markdown = result.blocks.map((block: any) => block.raw).join("\n");
  expect(markdown).not.toContain("\u0001");
  expect(markdown).not.toContain("KTPDFINLINE");
  for (const output of outputs) expect(markdown.split(output)).toHaveLength(2);
  expect(markdown).toContain("These equations are to be solved for an unknown velocity vector");
  expect(markdown).toContain("and to the forces arising from pressure and friction");
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(result.warnings).toEqual([]);
});

it("replaces a formula and its detached control-character subscript exactly once", async () => {
  const source = [
    { ...spans[0], text: "velocity" },
    { ...spans[1], text: "u(x,t)=(ui(x,t))", bbox: [70, 50, 150, 60] },
    { ...spans[0], id: "after", text: "remains smooth", bbox: [155, 50, 240, 60] },
    { ...spans[1], id: "limits", text: "1\u0001i\u0001n", fontSize: 7, baseline: 69, bbox: [110, 62, 140, 69] },
  ];
  const bounds = { ...region, bbox: [68, 48, 152, 70] };
  const recognize = vi.fn(async () => ({ text: "u(x,t)=(u_i(x,t))_{1\\leq i\\leq n}" }));
  const options = config(recognize, [bounds]);
  options.previous.pages[0].spans = source;
  expect(buildLines(options.previous.pages[0])).toHaveLength(2);
  const result = await parsePdfDocument(pdf, options);
  const markdown = result.blocks.map((block: any) => block.raw).join("\n");
  expect(markdown).toBe("velocity $u(x,t)=(u_i(x,t))_{1\\leq i\\leq n}$ remains smooth");
  expect(markdown).not.toContain("\u0001");
  expect(markdown).not.toContain("KTPDFINLINE");
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(source[3].text).toBe("1\u0001i\u0001n");
});

it("keeps unmapped glyphs outside recognized regions as original images, not guessed symbols", async () => {
  const recognize = vi.fn(async () => ({ text: "\\chi^2" }));
  const options = config(recognize);
  options.previous.pages[0].spans = [...spans,
    { ...spans[0], id: "clean", text: "unchanged native prose".repeat(8), bbox: [30, 100, 300, 110], baseline: 110 },
    { ...spans[1], id: "unmapped", text: "1\u0002i\u0002n", bbox: [30, 140, 90, 150], baseline: 150 }];
  const result = await parsePdfDocument(pdf, options);
  const markdown = result.blocks.map((block: any) => block.raw).join("\n");
  expect(markdown).toContain("unchanged native prose");
  expect(markdown).toMatch(/!\[第 1 页原文段落回退\]\(assets\//);
  expect(markdown).not.toContain("\u0002");
  expect(result.warnings.some((warning: any) => warning.message.includes("字符映射"))).toBe(true);
  expect(result.assets).toHaveLength(1);
  expect(recognize).toHaveBeenCalledTimes(1);
});

it("rejects unmapped characters in VLM formula output and preserves the crop", async () => {
  const output = "x\u0001y";
  const result = await parsePdfDocument(pdf, config(vi.fn(async () => ({ text: output }))));
  expect(result.blocks[0].raw).toMatch(/^Energy !\[/);
  expect(result.blocks[0].formulaDiagnostics[0].output).toBe(output);
  expect(result.warnings[0].message).toContain("无法解码");
});

it("rebuilds selected output without repeating successful region recognition", async () => {
  const recognize = vi.fn(async () => ({ text: "\\chi^2" }));
  const options = config(recognize);
  const first = await parsePdfDocument(pdf, options);
  const rebuild = { ...first, complete: false, completedPages: [], pageBlocks: [] };
  await parsePdfDocument(pdf, { ...options, previous: rebuild });
  expect(recognize).toHaveBeenCalledTimes(1);
  const excluded = await parsePdfDocument(pdf, { ...options, previous: rebuild,
    layoutRegions: { 1: [{ ...region, enabled: false }] } });
  expect(excluded.blocks.map((b: any) => b.raw).join(" ")).not.toContain("$\\chi^2$");
  await parsePdfDocument(pdf, { ...options, previous: rebuild, cacheMode: "refresh" });
  expect(recognize).toHaveBeenCalledTimes(2);
});

it("refreshes only the failed target and emits no inference loading on runtime hits", async () => {
  const second = { ...region, id: "second", bbox: [120, 48, 150, 62] };
  const recognize = vi.fn(async (_blob, _selection, _signal, options) => {
    options.onProgress?.({ type: "cache-hit" });
    return { text: "x^2" };
  });
  const options = config(recognize, [region, second]);
  const first = await parsePdfDocument(pdf, options);
  expect(options.onProgress.mock.calls.some(([progress]: any) => progress.startedAt)).toBe(false);
  expect(options.onProgress.mock.calls.some(([progress]: any) => progress.stage === "缓存命中")).toBe(true);
  recognize.mockClear();
  await parsePdfDocument(pdf, { ...options, previous: first, retryRegion: { page: 1, regionId: "inline" } });
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(recognize.mock.calls[0][3].cacheMode).toBe("refresh");
});

it("publishes completed layout pages before the next page finishes", async () => {
  let finish: any;
  const answer = { imageSize: { width: 600, height: 800 }, regions: [region] };
  const analyzeLayout = vi.fn().mockResolvedValueOnce(answer)
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const onProgress = vi.fn();
  const pending = detectPdfLayout({ numPages: 2, getPage: async () => ({
    getViewport: () => ({ width: 600, height: 800 }),
  }) }, { client: { analyzeLayout }, layoutServiceId: "layout", onProgress });
  await vi.waitFor(() => expect(analyzeLayout).toHaveBeenCalledTimes(2));
  expect(onProgress).toHaveBeenCalledTimes(1);
  const partial = onProgress.mock.calls[0][1];
  expect(Object.keys(partial)).toEqual(["1"]);
  finish(answer);
  const result = await pending;
  expect(Object.keys(result)).toEqual(["1", "2"]);
  expect(Object.keys(partial)).toEqual(["1"]);
});

it("does not publish layout results arriving after cancellation", async () => {
  const abort = new AbortController();
  const onProgress = vi.fn();
  await expect(detectPdfLayout({ numPages: 1, getPage: async () => ({
    getViewport: () => ({ width: 600, height: 800 }),
  }) }, { layoutServiceId: "layout", signal: abort.signal, onProgress,
    client: { analyzeLayout: async () => {
      abort.abort();
      return { imageSize: { width: 600, height: 800 }, regions: [region] };
    } },
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(onProgress).not.toHaveBeenCalled();
});

it("recognizes native inline formulas with formula mode and keeps LaTeX inside the paragraph", async () => {
  const recognize = vi.fn(async () => ({ text: "$$\\chi^2$$" }));
  const result = await parsePdfDocument(pdf, config(recognize));
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(recognize.mock.calls[0].slice(1)).toEqual([
    { apiSlug: "vlm", capability: "parseImage" }, undefined,
    expect.objectContaining({ taskMode: "formula", promptSlug: "" }),
  ]);
  expect(renderPdfRegion).toHaveBeenCalledWith({}, region.bbox, undefined, 2);
  expect(result.ir.blocks).toHaveLength(1);
  expect(blockToMarkdown(result.ir.blocks[0])).toBe("Energy $\\chi^2$");
  expect(result.blocks[0].ast.children).toContainEqual(expect.objectContaining({ type: "inlineMath", value: "\\chi^2" }));
  expect(result.warnings).toEqual([]);
  expect(spans[1].text).toBe("�χ");
  expect(region).not.toHaveProperty("latex");
  await parsePdfDocument(pdf, { ...config(recognize), previous: { ...result, pageBlocks: [] } });
  expect(recognize).toHaveBeenCalledTimes(1);
});

it("keeps failed inline recognition as an inline image, records the reason and allows retry", async () => {
  const recognize = vi.fn(async () => { throw new Error("model failed"); });
  const result = await parsePdfDocument(pdf, config(recognize));
  expect(blockToMarkdown(result.ir.blocks[0])).toMatch(/^Energy !\[第 1 页原公式\]\(assets\//);
  expect(result.assets).toHaveLength(1);
  expect(result.warnings[0]).toMatchObject({ regionId: "inline", message: "model failed" });
  expect(result.cache.size).toBe(0);
  expect(region).not.toHaveProperty("inlineRecognitionFailed");
  recognize.mockImplementation(async () => ({ text: "\\chi^2" }));
  const retry = await parsePdfDocument(pdf, { ...config(recognize), previous: result,
    retryRegion: { page: 1, regionId: region.id } });
  expect(blockToMarkdown(retry.ir.blocks[0])).toBe("Energy $\\chi^2$");
  expect(retry.warnings).toEqual([]);
});

it("reuses completed fallback Blobs with stable paths without inference or recropping", async () => {
  const recognize = vi.fn(async () => ({ text: "\\unknowncommand{x}" }));
  const first = await parsePdfDocument(pdf, config(recognize));
  expect(first.assets[0]).not.toHaveProperty("url");
  vi.mocked(renderPdfRegion).mockClear();
  recognize.mockClear();
  const reused = await parsePdfDocument(pdf, { ...config(recognize), previous: first });
  expect(reused.assets[0].blob).toBe(first.assets[0].blob);
  expect(reused.blocks[0].raw).toContain(`assets/${first.assets[0].name}`);
  expect(recognize).not.toHaveBeenCalled();
  expect(renderPdfRegion).not.toHaveBeenCalled();
});

it.each(["\\[\\chi^2\\]", "\\(\\chi^2\\)", "$\\chi^2$", "$$\\chi^2$$", "```latex\n\\[\\chi^2\\]\n```"])(
  "normalizes display formula wrappers: %s", async (text) => {
    const result = await parsePdfDocument(pdf, config(vi.fn(async () => ({ text })), [{ ...region, type: "formula" }]));
    expect(result.ir.blocks.find((block: any) => block.type === "formula").markdown).toBe("$$\n\\chi^2\n$$");
    expect(result.warnings).toEqual([]);
  });

it.each(["\\unknowncommand{x}", "", "\\frac{a}{"])("preserves invalid formula output and falls back to its crop: %s", async (text) => {
  const result = await parsePdfDocument(pdf, config(vi.fn(async () => ({ text })), [{ ...region, type: "formula" }]));
  expect(result.blocks.find((block: any) => block.type === "formula").raw).toMatch(/^!\[/);
  expect(result.blocks.find((block: any) => block.type === "formula").formulaDiagnostics[0]).toMatchObject({ output: text });
  expect(result.warnings).toHaveLength(1);
  expect(result.assets).toHaveLength(1);
});

it("recognizes a containing display formula once and removes internal limit fragments", async () => {
  const outer = { ...region, id: "outer", type: "formula", bbox: [68, 48, 140, 80] };
  const recognize = vi.fn(async () => ({ text: "\\sum_{j=1}^n u_j" }));
  const options = config(recognize, [region, outer]);
  options.previous.pages[0].spans = [...spans,
    { ...spans[1], id: "limit", text: "j=1", bbox: [70, 76, 90, 81], baseline: 81 }];
  const result = await parsePdfDocument(pdf, options);
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(result.layoutRegions[1].map((r: any) => r.id)).toEqual(["outer"]);
  expect(result.blocks.filter((block: any) => block.type === "formula")).toHaveLength(1);
  expect(result.blocks.filter((block: any) => block.type !== "formula").map((b: any) => b.raw).join(" ")).toBe("Energy");
});

it("does not invoke VLM for an excluded inline region", async () => {
  const recognize = vi.fn();
  const result = await parsePdfDocument(pdf, config(recognize, [{ ...region, enabled: false }]));
  expect(recognize).not.toHaveBeenCalled();
  expect(blockToMarkdown(result.ir.blocks[0])).toBe("Energy");
});

it("keeps undecodable Fast native math as an original crop without invoking VLM", async () => {
  const recognize = vi.fn();
  const result = await parsePdfDocument(pdf, { ...config(recognize), mode: "fast" });
  expect(recognize).not.toHaveBeenCalled();
  expect(blockToMarkdown(result.ir.blocks[0])).toMatch(/^Energy !\[第 1 页原公式\]\(assets\//);
  expect(result.warnings[0].message).toContain("字符映射");
});

it("keeps standalone formulas on the existing display-math path", async () => {
  const recognize = vi.fn(async () => ({ text: "\\chi^2" }));
  const result = await parsePdfDocument(pdf, config(recognize, [{ ...region, type: "formula" }]));
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(result.ir.blocks.find((block: any) => block.type === "formula").markdown)
    .toBe("$$\n\\chi^2\n$$");
});

it("publishes native prose before inference and keeps incomplete pages resumable", async () => {
  let finish: any;
  const recognize = vi.fn((_blob, _selection, _signal, options) => {
    options.onProgress?.({ type: "inference" });
    return new Promise((resolve) => { finish = resolve; });
  });
  const options = config(recognize);
  const updates: any[] = [];
  options.onProgress = vi.fn((progress, partial) => updates.push({ progress, partial }));
  const pending = parsePdfDocument(pdf, options);
  await vi.waitFor(() => expect(recognize).toHaveBeenCalledTimes(1));
  const active = updates.at(-1);
  expect(active.progress).toMatchObject({ page: 1, regionId: "inline", done: 0, total: 1 });
  expect(active.partial.blocks[0].raw).toBe("Energy _待识别…_");
  expect(active.partial.completedPages).toEqual([]);
  expect(active.partial.complete).toBe(false);
  finish({ text: "\\chi^2" });
  const completed = await pending;
  expect(completed.completedPages).toEqual([1]);
  expect(active.partial.completedPages).toEqual([]);
  expect(active.partial.blocks[0].raw).toBe("Energy _待识别…_");

  const resumed = await parsePdfDocument(pdf, { ...options, previous: active.partial });
  expect(resumed.complete).toBe(true);
  expect(blockToMarkdown(resumed.ir.blocks[0])).toBe("Energy $\\chi^2$");
  expect(recognize).toHaveBeenCalledTimes(1);
});

it("keeps complete figures without native labels or nested recognition tasks", async () => {
  const recognize = vi.fn();
  const image = { id: "figure", type: "image", bbox: [68, 48, 120, 80], enabled: true };
  const options = config(recognize, [image, region]);
  const result = await parsePdfDocument(pdf, options);
  expect(recognize).not.toHaveBeenCalled();
  expect(result.ir.blocks.filter((block: any) => block.type === "image")).toHaveLength(1);
  expect(result.blocks.map((block: any) => block.raw).join("\n")).not.toContain("�χ");
  expect(result.blocks.find((block: any) => block.type === "image").regionId).toBe("figure");
  expect(spans[1].text).toBe("�χ");
});

it("does not recognize an image-only page as a whole scanned document", async () => {
  const recognize = vi.fn();
  const options = config(recognize, [{ ...region, type: "image" }]);
  options.previous.pages[0].spans = [];
  const result = await parsePdfDocument(pdf, options);
  expect(recognize).not.toHaveBeenCalled();
  expect(result.ir.blocks).toHaveLength(1);
  expect(result.ir.blocks[0].type).toBe("image");
});

it("masks overlapping figure pixels in an automatic text crop", async () => {
  const recognize = vi.fn(async () => ({ text: "Energy" }));
  const image = { id: "figure", type: "image", bbox: [68, 48, 120, 80], enabled: true };
  const options = config(recognize, [image, { ...region, type: "paragraph", bbox: [30, 40, 130, 90] }]);
  options.previous.pages[0].spans = [];
  await parsePdfDocument(pdf, options);
  expect(renderPdfRegion).toHaveBeenCalledWith({}, [30, 40, 130, 90], undefined, 2, [image.bbox]);
  expect(recognize).toHaveBeenCalledTimes(1);
});

it("retains finished regions after cancellation and recognizes only unfinished regions on resume", async () => {
  const abort = new AbortController();
  const recognize = vi.fn().mockResolvedValueOnce({ text: "\\chi^2" })
    .mockImplementationOnce((_blob, _service, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("cancel", "AbortError")), { once: true });
    }));
  const options = config(recognize, [region, { ...region, id: "second", bbox: [140, 48, 160, 62] }]);
  const pending = parsePdfDocument(pdf, { ...options, signal: abort.signal }).catch((error) => error);
  await vi.waitFor(() => expect(recognize).toHaveBeenCalledTimes(2));
  abort.abort();
  const cancelled = await pending;
  expect(cancelled.name).toBe("AbortError");
  expect(cancelled.partial.completedPages).toEqual([]);
  recognize.mockResolvedValue({ text: "\\beta" });
  const resumed = await parsePdfDocument(pdf, { ...options, previous: cancelled.partial });
  expect(recognize).toHaveBeenCalledTimes(3);
  expect(resumed.complete).toBe(true);
  expect(resumed.completedPages).toEqual([1]);
  expect(blockToMarkdown(resumed.ir.blocks[0])).toContain("$\\chi^2$");
});


it("restores the complete real first paragraph in native order through pending and resolved math", () => {
  const raw = rawPageFromText(nativeParagraph, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  const body = navierLayout.regions.find((region) => region.id === "body");
  const outputs = ["\\mathbb{R}^n(n=2\\text{ or }3)", "u(x,t)=(u_i(x,t))_{1\\leq i\\leq n}\\in\\mathbb{R}^n",
    "p(x,t)\\in\\mathbb{R}", "x\\in\\mathbb{R}^n", "t\\geq", "\\mathbb{R}^n"];
  const formulas = navierLayout.regions.filter((region) => region.type === "inline-formula" && region.id !== "force")
    .map((region, index) => ({ ...region, latex: outputs[index] }));
  const nativeLines = buildLines(raw, [body]);
  expect(nativeLines).toHaveLength(4);
  const restore = (regions: any[]) => paragraphBlocks(raw, nativeLines, [body, ...regions]);
  const final = restore(formulas);
  expect(final).toHaveLength(1);
  const markdown = blockToMarkdown(final[0]);
  expect(markdown).not.toMatch(/KTPDFINLINE|\$\$/);
  expect(markdown).not.toContain(String.fromCharCode(1));
  expect(markdown).not.toContain("\n");
  expect(markdown).toContain("fluid in $\\mathbb{R}^n(n=2\\text{ or }3)$ These equations");
  expect(markdown).toContain("velocity vector $u(x,t)");
  expect(markdown).toContain("and pressure $p(x,t)");
  expect(markdown).toContain("to incompressible fluids filling all of $\\mathbb{R}^n$");
  const nodes: any[] = [];
  const visit = (node: any) => { if (node.type === "inlineMath") nodes.push(node); node.children?.forEach(visit); };
  parseDocumentMarkdown(markdown).forEach((block: any) => visit(block.ast));
  expect(nodes).toHaveLength(6);
  const pending = restore(formulas.map((region) => ({ ...region, latex: undefined, pendingRecognition: true })));
  expect(pending.map((block) => block.spanIds)).toEqual(final.map((block) => block.spanIds));
  expect(pending.map((block) => block.bbox)).toEqual(final.map((block) => block.bbox));
  const reverse = restore([...formulas].reverse());
  expect(blockToMarkdown(reverse[0])).toBe(markdown);
});

it("falls back the entire containing paragraph without child inference or duplicate text", async () => {
  const paragraph = { id: "body", type: "paragraph", bbox: [20, 40, 300, 90], enabled: true };
  const child = { ...region, bbox: [68, 48, 90, 62] };
  const recognize = vi.fn(async () => ({ text: "Recovered paragraph" }));
  const options = config(recognize, [paragraph, child]);
  options.previous.pages[0].spans = [spans[0],
    { ...spans[1], text: "x", bbox: [70, 50, 80, 60] },
    { ...spans[0], id: "broken", text: "1\u0001i", bbox: [120, 50, 140, 60] }];
  const result = await parsePdfDocument(pdf, options);
  expect(recognize).not.toHaveBeenCalled();
  expect(result.blocks).toHaveLength(1);
  expect(result.blocks[0].raw).toContain("原文区域回退");
  expect(result.blocks[0].raw).not.toContain("Energy");
  expect(renderPdfRegion).toHaveBeenCalledWith({}, paragraph.bbox, undefined, 1.8);
  expect(result.blocks[0].fragments[0].bbox).toEqual(paragraph.bbox);
  expect(result.blocks[0].sourceAnchors[0].regionId).toBe("body");
  expect(result.warnings[0].regionId).toBe("body");
  const retry = await parsePdfDocument(pdf, { ...options, previous: result, retryRegion: { page: 1, regionId: "body" } });
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(retry.blocks[0].raw).toBe("Recovered paragraph");
  expect(retry.warnings).toEqual([]);
});

it("serializes adjacent math once without changing its LaTeX or creating display delimiters", () => {
  const block = { text: "KTPDFINLINE0ENDKTPDFINLINE1END", inlineMath: [
    { token: true, text: "KTPDFINLINE0END", latex: "x" },
    { token: true, text: "KTPDFINLINE1END", latex: "x^2" },
    { text: "x", latex: "wrong" },
  ] };
  expect(blockToMarkdown(block)).toBe("$x$ $x^2$");
});

it("rebuilds old paragraph results but retains successful inference and layout caches", async () => {
  const recognize = vi.fn(async () => ({ text: "x^2" }));
  const options = config(recognize);
  const first = await parsePdfDocument(pdf, options);
  const previous = { ...first, recognitionKey: first.recognitionKey.replace("formula-v9", "formula-v7"),
    pageBlocks: [[{ markdown: "broken old paragraph" }]],
    assets: [{ name: "page-1-native-glyph-old.png", url: "blob:old", blob: new Blob(["old crop"]) }] };
  const next = await parsePdfDocument(pdf, { ...options, previous });
  expect(recognize).toHaveBeenCalledTimes(1);
  expect(next.blocks[0].raw).toBe("Energy $x^2$");
  expect(next.assets).toEqual([]);
  expect(next.layoutRegions[1]).toEqual(first.layoutRegions[1]);
});

it("keeps real display formulas and their numbers ordered without detached summation limits", async () => {
  const raw = rawPageFromText(nativeDisplayFormulas, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const regions = navierLayout.regions.filter((region) => region.type === "formula");
  const outputs = [String.raw`\frac{\partial u_i}{\partial t}+\sum_{j=1}^n u_j\frac{\partial u_i}{\partial x_j}=\nu\Delta u_i-\frac{\partial p}{\partial x_i}+f_i(x,t)`,
    String.raw`\operatorname{div}u=\sum_{i=1}^n\frac{\partial u_i}{\partial x_i}=0`];
  const recognize = vi.fn().mockResolvedValueOnce({ text: outputs[0] }).mockResolvedValueOnce({ text: outputs[1] });
  const options = config(recognize, regions);
  options.previous.pages = [raw];
  const result = await parsePdfDocument(pdf, options);
  const markdown = result.blocks.map((block: any) => block.raw).join("\n");
  expect(markdown).not.toContain(String.fromCharCode(1));
  expect(markdown).not.toMatch(/(?:^|\n)(?:j|i)=1(?:$|\n)/);
  for (const formula of outputs) expect(markdown.split(formula)).toHaveLength(2);
  expect(markdown).toContain("(1)");
  expect(markdown).toContain("(2)");
  expect(readingOrder(result.ir.blocks, raw.width, raw.height).map((block: any) => block.regionId || block.text))
    .toEqual(["display-0", "(1)", "display-1", "(2)"]);
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(result.warnings).toEqual([]);
});


it("uses real detection bounds to consume summation limits once and keeps formula numbers", async () => {
  const raw = rawPageFromText(nativeDisplayFormulas, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const regions = navierLayout.regions.filter((region) => ["formula", "formula_number"].includes(region.type));
  const recognize = vi.fn().mockResolvedValueOnce({ text: "\\sum_{j=1}^n u_j" }).mockResolvedValueOnce({ text: "\\sum_{i=1}^n u_i" });
  const options = config(recognize, regions);
  options.previous.pages = [raw];
  const result = await parsePdfDocument(pdf, options);
  expect(result.ir.blocks.filter((block: any) => block.source === "native")).toEqual([]);
  expect(result.blocks.map((block: any) => block.equationNumber?.text)).toEqual(["(1)", "(2)"]);
  expect(result.blocks.map((block: any) => block.raw).join("\n")).toContain("\\tag{1}");
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(raw.spans.find((span: any) => span.text === "j" && span.baseline > 395)?.bbox[1]).toBeCloseTo(389.23, 2);
  expect(textRegion(raw.spans.find((span: any) => span.text === "=1").bbox, regions)?.id).toBe("display-0");
  const rebuild = { ...result, complete: false, pageBlocks: [], completedPages: [] };
  await parsePdfDocument(pdf, { ...options, previous: rebuild });
  expect(recognize).toHaveBeenCalledTimes(2);
});

it("restores the real first paragraph without an extra R and keeps every formula anchor", async () => {
  const raw = rawPageFromText(nativeParagraph, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const regions = navierLayout.regions.filter((region) => region.bbox[1] < 351);
  const outputs = ["\\mathbb{R}^n(n=2\\text{ or }3)", "u(x,t)=(u_i(x,t))_{1\\leq i\\leq n}\\in\\mathbb{R}^n",
    "p(x,t)\\in\\mathbb{R}", "x\\in\\mathbb{R}^n", "t\\geq", "\\mathbb{R}^n"];
  const recognize = vi.fn(); outputs.forEach((text) => recognize.mockResolvedValueOnce({ text }));
  const options = config(recognize, regions); options.previous.pages = [raw];
  const result = await parsePdfDocument(pdf, options);
  expect(result.blocks).toHaveLength(1);
  expect(result.blocks[0].raw).not.toContain("KTPDFINLINE");
  expect(result.blocks[0].raw).not.toContain(String.fromCharCode(1));
  const maths: any[] = [];
  const walk = (node: any) => { if (node.type === "inlineMath") maths.push(node); node.children?.forEach(walk); };
  walk(result.blocks[0].ast);
  expect(maths).toHaveLength(6);
  expect(maths.map((node) => node.data.pdfSourceIds[0])).toEqual(["p1:dimension", "p1:velocity", "p1:pressure", "p1:position", "p1:time", "p1:filling"]);
  expect(result.blocks[0].sourceAnchors.find((anchor: any) => anchor.id === "p1:body")?.bbox).toEqual(regions[0].bbox);
  expect(recognize).toHaveBeenCalledTimes(6);
});

it("repairs old text geometry without repeating successful inference or page resources", async () => {
  const content = nativeDisplayFormulas;
  const raw = rawPageFromText(content, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const regions = navierLayout.regions.filter((region) => ["formula", "formula_number"].includes(region.type));
  const recognize = vi.fn(async () => ({ text: "x^2" }));
  const options = config(recognize, regions); options.previous.pages = [raw];
  const first = await parsePdfDocument(pdf, options);
  const getTextContent = vi.fn(async () => content);
  const page = { getTextContent, getViewport: () => ({ transform: [1, 0, 0, -1, 0, 792], width: 612, height: 792, rotation: 0 }) };
  const legacy = { ...first, pages: [{ ...raw, textGeometryVersion: 0 }], recognitionKey: first.recognitionKey.replace("formula-v9", "formula-v7") };
  const fixed = await parsePdfDocument({ numPages: 1, getPage: async () => page }, { ...options, previous: legacy });
  expect(getTextContent).toHaveBeenCalledOnce();
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(fixed.pages[0].textGeometryVersion).toBe(1);
  expect(fixed.pages[0].graphics).toBe(raw.graphics);
  expect(legacy.pages[0].textGeometryVersion).toBe(0);
});


it("keeps pending and fallback formula nodes attached to the same real layout frame", async () => {
  const recognize = vi.fn(async () => ({ text: "\\unknown{x}" }));
  const options = config(recognize);
  const updates: any[] = [];
  options.onProgress = (_progress, snapshot) => updates.push(snapshot);
  const result = await parsePdfDocument(pdf, options);
  const pending = updates.find((snapshot) => snapshot.blocks[0]?.raw.includes("待识别"));
  const pendingNode = pending.blocks[0].ast.children.find((node: any) => node.type === "emphasis");
  const fallback = result.blocks[0].ast.children.find((node: any) => node.type === "image");
  expect(pendingNode.children[0].data.pdfSourceIds).toEqual(["p1:inline"]);
  expect(pending.blocks[0].pendingSourceIds).toEqual(["p1:inline"]);
  expect(result.blocks[0].pendingSourceIds).toEqual([]);
  expect(fallback.data.pdfSourceIds).toEqual(["p1:inline"]);
  expect(result.blocks[0].sourceAnchors.find((anchor: any) => anchor.id === "p1:inline").bbox).toEqual(region.bbox);
});


it("publishes safely while repairing a partial cached document and reading its next page", async () => {
  const raw = rawPageFromText(nativeDisplayFormulas, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const regions = navierLayout.regions.filter((region) => ["formula", "formula_number"].includes(region.type));
  const recognize = vi.fn(async () => ({ text: "x^2" }));
  const options = config(recognize, regions); options.previous.pages = [raw];
  const first = await parsePdfDocument(pdf, options);
  const tail = { items: [{ str: "Trailing narrative.", fontName: "regular", width: 140, transform: [10, 0, 0, 10, 30, 737] }], styles: { regular: { ascent: 0.7 } } };
  const progress = vi.fn();
  const result = await parsePdfDocument({ numPages: 2, getPage: async (page) => ({
    getViewport: () => ({ transform: [1, 0, 0, -1, 0, 792], width: 612, height: 792, rotation: 0 }),
    getTextContent: async () => page === 1 ? nativeDisplayFormulas : tail, getStructTree: async () => null,
    getOperatorList: async () => ({ fnArray: [], argsArray: [] }), getAnnotations: async () => [],
  }) }, { ...options, onProgress: progress, layoutRegions: { 1: regions, 2: [] },
    previous: { ...first, pages: [{ ...raw, textGeometryVersion: 0 }] } });
  expect(result.pages).toHaveLength(2);
  expect(result.blocks.some((block: any) => block.raw.includes("Trailing narrative"))).toBe(true);
  expect(progress).toHaveBeenCalled();
  expect(recognize).toHaveBeenCalledTimes(2);
});

// Actual PP-DocLayoutV3 bounds read from the Chrome preview, in PDF points.
const absoluteFormulaRegions = [
  { id: "absolute-4", type: "formula", enabled: true, bbox: [132.81085330347145, 645.2769003359463, 482.5650839865622, 661.439045912654] },
  { id: "absolute-5", type: "formula", enabled: true, bbox: [113.86283986562152, 681.5507502799552, 481.5425711086226, 697.6022150055991] },
];

it("removes four unmatched absolute-value fragments using real native text and detection bounds", async () => {
  const raw = rawPageFromText(nativeAbsoluteFormulas, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] };
  const residuals = raw.spans.filter((span: any) => span.text === "∣" && !textRegion(span.bbox, absoluteFormulaRegions));
  expect(residuals).toHaveLength(4);
  const recognize = vi.fn(async () => ({ text: "|x|\\leq C" }));
  const options = config(recognize, absoluteFormulaRegions); options.previous.pages = [raw];
  const updates: any[] = []; options.onProgress = (_progress, snapshot) => updates.push(snapshot);
  const first = await parsePdfDocument(pdf, options);
  expect(first.ir.blocks.filter((block: any) => block.text?.trim() === "∣")).toEqual([]);
  expect(first.blocks.map((block: any) => block.raw).join("\n")).toContain("(4)");
  expect(first.blocks.map((block: any) => block.raw).join("\n")).toContain("(5)");
  expect(updates.every((snapshot) => !snapshot.blocks.some((block: any) => block.raw.trim() === "∣"))).toBe(true);
  expect(recognize).toHaveBeenCalledTimes(2);
  const legacy = { ...first, recognitionKey: first.recognitionKey.replace("formula-v9", "formula-v7") };
  const rebuilt = await parsePdfDocument(pdf, { ...options, previous: legacy });
  expect(rebuilt.ir.blocks.filter((block: any) => block.text?.trim() === "∣")).toEqual([]);
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(rebuilt.pages[0]).toBe(raw);
  expect(raw.spans.filter((span: any) => span.text === "∣")).toHaveLength(8);
});

it.each([
  ["positive overlap", [45, 40, 55, 52], [], true, false],
  ["no overlap", [20, 40, 30, 48], [], true, true],
  ["edge contact", [45, 40, 55, 50], [], true, true],
  ["body ownership", [45, 40, 55, 52], [{ id: "body", type: "paragraph", bbox: [40, 38, 60, 48], enabled: true }], true, true],
  ["number ownership", [45, 40, 55, 52], [{ id: "number", type: "formula_number", bbox: [40, 38, 60, 48], enabled: true }], true, true],
  ["deselected formula", [45, 40, 55, 52], [], false, true],
])("only suppresses unassigned fragments for %s", async (_name, bbox, extra, enabled, retained) => {
  const regions: any[] = [{ id: "whole", type: "formula", bbox: [40, 50, 100, 70], enabled }, ...extra as any[]];
  const recognize = vi.fn(async () => ({ text: "x^2" }));
  const options = config(recognize, regions);
  options.previous.pages[0].spans = [{ ...spans[0], id: "residual", text: "fragment", bbox: bbox as number[], baseline: 46 }];
  const result = await parsePdfDocument(pdf, options);
  expect(result.ir.blocks.some((block: any) => block.spanIds.includes("residual"))).toBe(retained);
});

it("keeps a complete formula fallback without unmatched native fragments", async () => {
  const options = config(vi.fn(async () => ({ text: "\\unknown{x}" })), absoluteFormulaRegions);
  const raw = rawPageFromText(nativeAbsoluteFormulas, { transform: [1, 0, 0, -1, 0, 792], scale: 1, width: 612, height: 792 }, 1);
  raw.graphics = { images: [], paths: [] }; options.previous.pages = [raw];
  const result = await parsePdfDocument(pdf, options);
  expect(result.ir.blocks.filter((block: any) => block.text?.trim() === "∣")).toEqual([]);
  expect(result.blocks.filter((block: any) => block.raw.includes("原文区域回退"))).toHaveLength(2);
  expect(result.warnings).toHaveLength(2);
});
