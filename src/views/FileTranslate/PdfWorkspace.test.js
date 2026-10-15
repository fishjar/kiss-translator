/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import PdfWorkspace from "./PdfWorkspace";
import { openPdf } from "../../libs/pdf/pdfDocument";
jest.mock("./State", () => {
  const context = { scenes: { pdf: {} }, models: [] };
  return {
    useFileTranslation: () => ({
      context,
      connected: true,
      client: { request: mockRequest, session: { capabilities: ["doc"] } },
      openSettings: jest.fn(),
    }),
  };
});
jest.mock("../../libs/pdf/pdfDocument", () => ({
  openPdf: jest.fn(),
  renderPdfRegion: jest.fn(),
}));
jest.mock("../../libs/pdf/pdfParser", () => ({
  parsePdfDocument: jest.fn(),
  detectPdfLayout: jest.fn(),
  MissingDocumentModel: class extends Error {},
}));
jest.mock("../../libs/pdf/structure", () => ({
  buildToc: () => [
    { id: "chapter", title: "Chapter", page: 1, y: 0, depth: 0 },
  ],
}));
jest.mock("../../libs/document/markdown", () => ({
  parseDocumentMarkdown: () => [],
  restoreDocumentBilingual: (block) => block,
  translateDocumentBlocks: jest.fn(),
  renderDocumentBlock: (block, mode, blocks, allowed, assetUrls) =>
    block.type === "image"
      ? assetUrls?.get("assets/crop.png")
        ? `<img src="${assetUrls.get("assets/crop.png")}" data-document-asset="assets/crop.png">`
        : "<span>Image resource unavailable</span>"
      : block.sourceAnchors?.length
        ? '<p><span data-pdf-source="body" tabindex="0">source</span> <span data-pdf-source="first" tabindex="0"><span class="katex">x</span></span> and <span data-pdf-source="second" tabindex="0"><span class="katex">x</span></span></p>'
        : "<p>source</p>",
  blockMarkdown: (block) => block.raw,
  documentMarkdown: () => "",
  isTranslatableBlock: () => true,
}));
jest.mock("../../libs/document/export", () => ({ exportDocument: jest.fn() }));
jest.mock("./PdfPage", () => {
  const React = require("react");
  return ({ number, highlight }) =>
    React.createElement(
      "div",
      {
        "data-pdf-page": String(number),
        "data-scale": "1",
        "data-highlight": JSON.stringify(highlight),
      },
      "Page"
    );
});
const mockRequest = jest.fn();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const originalObserver = globalThis.ResizeObserver,
  originalScroll = HTMLElement.prototype.scrollTo;
beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ contentRect: { width: 900 } }]);
    }
    disconnect() {}
  };
  HTMLElement.prototype.scrollTo = jest.fn();
  localStorage.removeItem("kiss_pdf_reader");
  openPdf.mockResolvedValue({
    pdf: { numPages: 1 },
    bookmarks: [],
    destroy: jest.fn(),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalObserver;
  HTMLElement.prototype.scrollTo = originalScroll;
});
test("source view retains invalid formula output while reading view renders its fallback", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  parsePdfDocument.mockResolvedValue({
    complete: true,
    assets: [],
    warnings: [],
    blocks: [
      {
        id: "formula",
        type: "formula",
        raw: "![原公式](blob:crop)",
        fragments: [],
        formulaDiagnostics: [
          { regionId: "r1", output: "\\unknown{x}", error: "invalid formula" },
        ],
      },
    ],
  });
  const ref = createRef();
  await act(async () =>
    root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />)
  );
  await act(async () => ref.current.parse());
  expect(container.querySelector(".kt-pdf-markdown").textContent).not.toContain(
    "\\unknown{x}"
  );
  const sourceButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "源码"
  );
  act(() => sourceButton.click());
  expect(container.querySelector(".kt-pdf-source").textContent).toContain(
    "\\unknown{x}"
  );
  expect(container.querySelector(".kt-pdf-source").textContent).toContain(
    "invalid formula"
  );
});
test("PDF drawer starts closed at 270px, preserves navigation and has no footer or split handle", async () => {
  await act(async () =>
    root.render(<PdfWorkspace file={new File(["pdf"], "test.pdf")} />)
  );
  const drawer = container.querySelector(".kt-toc-drawer");
  expect(drawer.style.width).toBe("270px");
  expect(drawer.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector(".kt-pdf-status")).toBeNull();
  expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  const toggleBtn = container.querySelector('[aria-label="展开目录"]');
  expect(toggleBtn.style.border).toBe("");
  expect(toggleBtn.classList.contains("MuiIconButton-colorPrimary")).toBe(
    false
  );
  act(() => toggleBtn.click());
  expect(drawer.getAttribute("aria-hidden")).toBe("false");
  expect(toggleBtn.getAttribute("aria-label")).toBe("折叠目录");
  expect(toggleBtn.classList.contains("MuiIconButton-colorPrimary")).toBe(true);
  act(() => drawer.querySelector(".MuiListItemButton-root").click());
  expect(drawer.getAttribute("aria-hidden")).toBe("false");
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
  expect(container.textContent).toContain("该目录位置暂无对应 Markdown 内容");
  expect(openPdf).toHaveBeenCalledTimes(1);
});

test("PDF translation submits long-text fragments together and joins by source order", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  // A fast parse has no local model dependency; the test exercises the workspace bridge callback.
  const { useFileTranslation } = require("./State");
  useFileTranslation().context.scenes.pdf.parseMode = "fast";
  parsePdfDocument.mockResolvedValue({
    complete: true,
    blocks: [{ id: "long", raw: "long", ast: { type: "paragraph" } }],
    assets: [],
  });
  const pending = [];
  mockRequest.mockImplementation(
    (method, params, { signal }) =>
      new Promise((resolve) =>
        pending.push({ text: params.text, resolve, signal })
      )
  );
  let translated;
  translateDocumentBlocks.mockImplementation(
    async (blocks, translate, signal) => {
      translated = await translate(
        "a".repeat(12000) + "b".repeat(12000) + "c",
        signal
      );
    }
  );
  const ref = createRef();
  await act(async () =>
    root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />)
  );
  await act(async () => {
    await ref.current.parse();
  });
  let run;
  await act(async () => {
    run = ref.current.translate();
  });
  expect(pending.map((item) => item.text.length)).toEqual([12000, 12000, 1]);
  await act(async () => {
    [...pending]
      .reverse()
      .forEach(({ text, resolve }) => resolve({ text: text[0].toUpperCase() }));
    await run;
  });
  expect(translated).toBe("ABC");
});

test("PDF layout detection activates wireframe switch and clicking region toggles its enabled state", async () => {
  const {
    detectPdfLayout,
    parsePdfDocument,
  } = require("../../libs/pdf/pdfParser");
  detectPdfLayout.mockResolvedValue({
    1: [
      {
        id: "box-1",
        type: "paragraph",
        bbox: [10, 10, 100, 100],
        enabled: true,
      },
      { id: "box-2", type: "header", bbox: [10, 200, 100, 250], enabled: true },
    ],
  });

  const ref = createRef();
  await act(async () =>
    root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />)
  );

  // 初始状态下布局开关处于禁用状态
  const switchInput = container.querySelector('input[type="checkbox"]');
  expect(switchInput.disabled).toBe(true);

  // 执行 detectLayout
  await act(async () => {
    await ref.current.detectLayout();
  });
  expect(detectPdfLayout).toHaveBeenCalledTimes(1);

  // 开关被激活并自动打开
  expect(switchInput.disabled).toBe(false);
  expect(switchInput.checked).toBe(true);

  // 切换 box-1 为禁用状态
  act(() => {
    ref.current.toggleRegion(1, "box-1");
  });

  // 验证 recognizeText 调用 parsePdfDocument 时传入更新后的 layoutRegions（box-1 的 enabled 为 false）
  parsePdfDocument.mockResolvedValue({
    complete: true,
    blocks: [],
    assets: [],
  });
  await act(async () => {
    await ref.current.recognizeText();
  });
  expect(parsePdfDocument).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      layoutRegions: {
        1: [
          expect.objectContaining({ id: "box-1", enabled: false }),
          expect.objectContaining({ id: "box-2", enabled: true }),
        ],
      },
    })
  );
});

test("layout pages appear during detection and late updates after cancel are ignored", async () => {
  const { detectPdfLayout } = require("../../libs/pdf/pdfParser");
  let finish, progress;
  detectPdfLayout.mockImplementation((_pdf, options) => {
    progress = options.onProgress;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace ref={ref} file={new File(["pdf"], "progress.pdf")} />
    )
  );
  let run;
  await act(async () => {
    run = ref.current.detectLayout();
  });
  const first = {
    1: [
      { id: "first", type: "paragraph", bbox: [0, 0, 100, 100], enabled: true },
    ],
  };
  act(() => progress({ stage: "布局检测", done: 1, total: 2 }, first));
  const switchInput = container.querySelector('input[type="checkbox"]');
  expect(switchInput.disabled).toBe(false);
  expect(switchInput.checked).toBe(true);
  expect(ref.current.hasLayoutResult).toBe(false);
  expect(ref.current.getProgress().done).toBe(1);
  act(() => ref.current.abort());
  act(() => progress({ stage: "布局检测", done: 2, total: 2 }, {}));
  await act(async () => {
    finish({});
    await run;
  });
  expect(switchInput.disabled).toBe(false);
  expect(ref.current.hasLayoutResult).toBe(false);
  expect(ref.current.getProgress()).toBeNull();
});

test("PDF layout uses the selected service instance rather than requiring a local model ID", async () => {
  const { detectPdfLayout } = require("../../libs/pdf/pdfParser");
  detectPdfLayout.mockResolvedValue({});
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace
        ref={ref}
        file={new File(["pdf"], "test.pdf")}
        activeLayoutApi={{
          apiSlug: "external-layout",
          enabledCapabilities: ["analyzeLayout"],
          layoutAvailable: true,
        }}
        hasLayoutService={true}
      />
    )
  );
  await act(async () => ref.current.detectLayout());
  expect(detectPdfLayout).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ layoutServiceId: "external-layout" })
  );
});

test("未配置界面分析服务时拒绝执行布局检测并提示错误", async () => {
  const { detectPdfLayout } = require("../../libs/pdf/pdfParser");
  detectPdfLayout.mockClear();

  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace
        ref={ref}
        file={new File(["pdf"], "test.pdf")}
        hasLayoutService={false}
      />
    )
  );

  await act(async () => {
    await ref.current.detectLayout();
  });

  // 未配置界面服务时不应调用 detectPdfLayout
  expect(detectPdfLayout).not.toHaveBeenCalled();
  // 界面提示未配置界面分析服务
  expect(container.textContent).toContain("未配置界面分析服务");
});

test("one-click translation reparses after changing the selected recognition service", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  const { documentRecognitionKey } = require("../../libs/pdf/recognition");
  const { context } = require("./State").useFileTranslation();
  context.scenes.pdf = {
    parseMode: "fast",
    recognitionService: { apiSlug: "first", capability: "parseImage" },
  };
  const file = new File(["pdf"], "cache.pdf");
  const ref = createRef();
  parsePdfDocument.mockClear();
  parsePdfDocument.mockImplementation(async (_pdf, config) => ({
    complete: true,
    blocks: [],
    assets: [],
    recognitionKey: documentRecognitionKey(config),
  }));
  translateDocumentBlocks.mockResolvedValue([]);
  await act(async () => root.render(<PdfWorkspace ref={ref} file={file} />));
  await act(async () => ref.current.oneClickTranslate());
  expect(parsePdfDocument).toHaveBeenCalledTimes(1);
  await act(async () => ref.current.oneClickTranslate());
  expect(parsePdfDocument).toHaveBeenCalledTimes(1);
  context.scenes = {
    pdf: {
      parseMode: "fast",
      recognitionService: { apiSlug: "second", capability: "recognizeText" },
    },
  };
  await act(async () => root.render(<PdfWorkspace ref={ref} file={file} />));
  await act(async () => ref.current.oneClickTranslate());
  expect(parsePdfDocument).toHaveBeenCalledTimes(2);
  expect(parsePdfDocument.mock.calls[1][1].recognitionService).toEqual({
    apiSlug: "second",
    capability: "recognizeText",
  });
});

test("one-click passes its newly detected layout and parsed blocks directly into translation", async () => {
  const {
    parsePdfDocument,
    detectPdfLayout,
  } = require("../../libs/pdf/pdfParser");
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  const { context } = require("./State").useFileTranslation();
  context.scenes.pdf = { parseMode: "smart" };
  const layout = {
    1: [
      {
        id: "region",
        type: "paragraph",
        bbox: [0, 0, 100, 100],
        enabled: true,
      },
    ],
  };
  const block = {
    id: "fresh",
    raw: "source",
    ast: { type: "paragraph", children: [] },
    fragments: [{ page: 1, bbox: [0, 0, 100, 100] }],
  };
  detectPdfLayout.mockClear();
  detectPdfLayout.mockResolvedValue(layout);
  parsePdfDocument.mockResolvedValue({
    complete: true,
    blocks: [block],
    assets: [],
    layoutRegions: layout,
  });
  translateDocumentBlocks.mockClear();
  translateDocumentBlocks.mockResolvedValue([]);
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace
        ref={ref}
        file={new File(["pdf"], "fresh.pdf")}
        hasLayoutService
        activeLayoutApi={{
          apiSlug: "layout",
          modelRef: "doc",
          device: "webgpu",
        }}
      />
    )
  );
  await act(async () => ref.current.oneClickTranslate());
  expect(detectPdfLayout).toHaveBeenCalledTimes(1);
  expect(parsePdfDocument.mock.calls.at(-1)[1].layoutRegions).toEqual(layout);
  expect(translateDocumentBlocks).toHaveBeenCalledTimes(1);
  expect(translateDocumentBlocks.mock.calls[0][0][0].id).toBe("fresh");
});

test("explicit recognition retains native pages and resources while reusing recognition cache", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { context } = require("./State").useFileTranslation();
  context.scenes.pdf = { parseMode: "fast" };
  const previous = {
    complete: true,
    blocks: [],
    assets: [{ url: "blob:owned" }],
    pages: [{ page: 1 }],
    cache: new Map([
      ["layout:1", {}],
      ["recognition:old", {}],
    ]),
  };
  parsePdfDocument.mockResolvedValue(previous);
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace ref={ref} file={new File(["pdf"], "reuse.pdf")} />
    )
  );
  await act(async () => ref.current.parse());
  parsePdfDocument.mockResolvedValue({
    complete: true,
    blocks: [],
    assets: [],
  });
  await act(async () => ref.current.recognizeText());
  const cached = parsePdfDocument.mock.calls.at(-1)[1].previous;
  expect(cached.pages).toBe(previous.pages);
  expect(cached.assets).toBe(previous.assets);
  expect(cached.cache.has("layout:1")).toBe(true);
  expect(cached.cache.has("recognition:old")).toBe(true);
  expect(cached.completedPages).toEqual([]);
});

async function sourceWorkspace(fragments, extra = {}) {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { useFileTranslation: getFileTranslation } = require("./State");
  getFileTranslation().context.scenes.pdf.parseMode = "fast";
  openPdf.mockResolvedValue({
    pdf: { numPages: 2 },
    bookmarks: [],
    destroy: jest.fn(),
  });
  parsePdfDocument.mockResolvedValue({
    complete: true,
    assets: [],
    warnings: [],
    blocks: [
      {
        id: "body",
        type: "paragraph",
        raw: "paragraph",
        fragments,
        ...extra,
      },
    ],
  });
  const ref = createRef();
  await act(async () =>
    root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />)
  );
  await act(async () => ref.current.parse());
  HTMLElement.prototype.scrollTo.mockClear();
  return {
    ref,
    block: container.querySelector('[data-document-block="body"]'),
    highlights: () =>
      JSON.parse(
        container.querySelector('[data-pdf-page="1"]').dataset.highlight
      ),
  };
}
const sourcePositions = [
  { page: 1, bbox: [20, 30, 150, 50] },
  { page: 1, bbox: [20, 60, 150, 80] },
  { page: 2, bbox: [20, 30, 150, 50] },
];

test("hover highlights every source fragment without scrolling; toolbar locates selected pages", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions);
  act(() =>
    block.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toEqual(sourcePositions);
  expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  expect(block.querySelectorAll(".kt-pdf-block-actions")).toHaveLength(1);
  expect(block.querySelector(".kt-pdf-block-actions").textContent).toBe(
    "定位原文 · 第 1, 2 页"
  );
  act(() => block.querySelector(".kt-pdf-block-actions button").click());
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
  act(() =>
    block.dispatchEvent(
      new MouseEvent("mouseout", {
        bubbles: true,
        relatedTarget: document.body,
      })
    )
  );
  expect(highlights()).toEqual(sourcePositions);
  act(() => block.querySelector('[aria-label="选择原文页码"]').click());
  const pageButton = [...document.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent === "第 2 页"
  );
  act(() => pageButton.click());
  expect(highlights()).toEqual([sourcePositions[2]]);
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(2);
});

test("keyboard Enter locates source, cancellation clears source highlighting", async () => {
  const { ref, block, highlights } = await sourceWorkspace(sourcePositions);
  act(() => block.focus());
  expect(highlights()).toEqual(sourcePositions);
  expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  act(() =>
    block.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledTimes(1);
  act(() => ref.current.abort());
  expect(highlights()).toEqual([]);
});

test("touch reveals the toolbar, outside tap dismisses it, and source-less blocks have no locator", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions);
  const touch = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(touch, "pointerType", { value: "touch" });
  act(() => block.dispatchEvent(touch));
  expect(block.classList.contains("kt-pdf-block-active")).toBe(true);
  expect(highlights()).toEqual(sourcePositions);
  act(() =>
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
  );
  expect(block.classList.contains("kt-pdf-block-active")).toBe(false);
  expect(highlights()).toEqual([]);
});

test("a block without valid source locations has no locator, and file changes clear highlights", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions);
  act(() =>
    block.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toHaveLength(3);
  await act(async () =>
    root.render(<PdfWorkspace file={new File(["other"], "other.pdf")} />)
  );
  expect(highlights()).toEqual([]);
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  parsePdfDocument.mockResolvedValue({
    complete: true,
    assets: [],
    warnings: [],
    blocks: [{ id: "none", raw: "none", fragments: [] }],
  });
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace ref={ref} file={new File(["pdf"], "empty.pdf")} />
    )
  );
  await act(async () => ref.current.parse());
  expect(
    container.querySelector(
      '[data-document-block="none"] .kt-pdf-block-actions'
    )
  ).toBeNull();
});

test("clicked highlighting lasts two seconds and entering another block switches immediately", async () => {
  const { ref } = await sourceWorkspace(sourcePositions);
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const otherPosition = { page: 2, bbox: [200, 100, 300, 120] };
  parsePdfDocument.mockResolvedValue({
    complete: true,
    assets: [],
    warnings: [],
    blocks: [
      {
        id: "body",
        type: "paragraph",
        raw: "first",
        fragments: sourcePositions,
      },
      {
        id: "other",
        type: "paragraph",
        raw: "second",
        fragments: [otherPosition],
      },
    ],
  });
  await act(async () => ref.current.parse(true));
  const first = container.querySelector('[data-document-block="body"]');
  const other = container.querySelector('[data-document-block="other"]');
  const highlights = () =>
    JSON.parse(
      container.querySelector('[data-pdf-page="1"]').dataset.highlight
    );
  jest.useFakeTimers();
  try {
    act(() => first.querySelector(".kt-pdf-block-actions button").click());
    expect(highlights()).toEqual(sourcePositions);
    act(() => jest.advanceTimersByTime(1999));
    expect(highlights()).toEqual(sourcePositions);
    act(() => jest.advanceTimersByTime(1));
    expect(highlights()).toEqual([]);
    act(() => first.querySelector(".kt-pdf-block-actions button").click());
    act(() =>
      other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    );
    expect(highlights()).toEqual([otherPosition]);
    act(() =>
      other.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        })
      )
    );
    expect(highlights()).toEqual([]);
  } finally {
    jest.useRealTimers();
  }
});

const layoutAnchors = [
  { id: "body", type: "paragraph", page: 1, bbox: [20, 20, 400, 120] },
  { id: "first", type: "inline-formula", page: 1, bbox: [100, 40, 150, 60] },
  { id: "second", type: "inline-formula", page: 1, bbox: [200, 70, 250, 90] },
];

test("hovering math uses its layout child frame and the floating locator follows that formula", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions, {
    sourceAnchors: layoutAnchors,
  });
  const math = block.querySelector('[data-pdf-source="first"] .katex');
  act(() => math.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(highlights()).toEqual([layoutAnchors[1]]);
  expect(block.querySelector(".kt-pdf-block-actions").textContent).toBe(
    "定位原文 · 第 1 页"
  );
  expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  act(() => block.querySelector(".kt-pdf-block-actions button").click());
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 0 });
  act(() =>
    block
      .querySelector('[data-pdf-source="second"] .katex')
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toEqual([layoutAnchors[2]]);
  act(() =>
    block
      .querySelector('[data-pdf-source="body"]')
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toEqual([layoutAnchors[0]]);
});

test("touch and keyboard use exact formula anchors without changing block layout", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions, {
    sourceAnchors: layoutAnchors,
  });
  const formula = block.querySelector('[data-pdf-source="second"]');
  const touch = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(touch, "pointerType", { value: "touch" });
  act(() => formula.dispatchEvent(touch));
  expect(highlights()).toEqual([layoutAnchors[2]]);
  expect(block.classList.contains("kt-pdf-block-active")).toBe(true);
  act(() => formula.focus());
  act(() =>
    formula.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    )
  );
  expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith({ top: 30 });
  expect(block.querySelectorAll("p")).toHaveLength(1);
  expect(block.querySelectorAll(".kt-pdf-block-actions")).toHaveLength(1);
});

test("prose without a body layout anchor falls back to block positions instead of a neighboring formula", async () => {
  const { block, highlights } = await sourceWorkspace(sourcePositions, {
    sourceAnchors: [layoutAnchors[1]],
  });
  act(() =>
    block
      .querySelector('[data-pdf-source="body"]')
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toEqual(sourcePositions);
  act(() =>
    block
      .querySelector('[data-pdf-source="first"] .katex')
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
  );
  expect(highlights()).toEqual([layoutAnchors[1]]);
});

test("fallback previews reuse assets, retry once, and release on file change and unmount", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  let serial = 0;
  URL.createObjectURL = jest.fn(() => `blob:crop-${++serial}`);
  URL.revokeObjectURL = jest.fn();
  try {
    const file = new File(["pdf"], "assets.pdf"),
      ref = createRef();
    const asset = {
      name: "crop.png",
      blob: new Blob(["pixels"]),
      url: "blob:legacy",
    };
    parsePdfDocument.mockResolvedValue({
      complete: true,
      assets: [asset],
      blocks: [{ id: "image", type: "image", raw: "![crop](blob:legacy)" }],
    });
    await act(async () => root.render(<PdfWorkspace ref={ref} file={file} />));
    await act(async () => ref.current.parse());
    expect(container.querySelector("img").getAttribute("src")).toBe(
      "blob:crop-1"
    );
    await act(async () => root.render(<PdfWorkspace ref={ref} file={file} />));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    act(() => container.querySelector("img").dispatchEvent(new Event("error")));
    expect(container.querySelector("img").getAttribute("src")).toBe(
      "blob:crop-2"
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop-1");
    act(() => container.querySelector("img").dispatchEvent(new Event("error")));
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("Image resource unavailable");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    await act(async () =>
      root.render(
        <PdfWorkspace ref={ref} file={new File(["other"], "other.pdf")} />
      )
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop-2");
    expect(container.querySelector("[data-document-block]")).toBeNull();
    await act(async () => ref.current.parse());
    act(() => root.unmount());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop-3");
    root = createRoot(container);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

const incrementalBlock = (page, ready = true) => ({
  id: `page-${page}`,
  raw: `source-${page}`,
  translationReady: ready,
  type: "paragraph",
  ast: {
    type: "paragraph",
    children: [{ type: "text", value: `source-${page}` }],
  },
  fragments: [{ page, bbox: [0, 100, 100, 120] }],
});
async function incrementalWorkspace() {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  require("./State").useFileTranslation().context.scenes.pdf = {
    parseMode: "fast",
  };
  openPdf.mockResolvedValue({
    pdf: { numPages: 3 },
    bookmarks: [],
    destroy: jest.fn(),
  });
  let progress, finish, fail;
  parsePdfDocument.mockImplementation((_pdf, options) => {
    progress = options.onProgress;
    return new Promise((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
  });
  translateDocumentBlocks.mockImplementation(
    async (blocks, translate, signal, onProgress) => {
      for (const block of blocks) {
        block.status = "busy";
        onProgress(0, blocks.length);
        block.targetRaw = await translate(block.raw, signal, block);
        block.bilingualRaw = block.raw + " translated";
        block.targetAst = {
          type: "paragraph",
          children: [{ type: "text", value: block.targetRaw }],
        };
        block.bilingualAst = { type: "paragraph", children: [] };
        block.status = "done";
        onProgress(1, blocks.length);
      }
    }
  );
  mockRequest.mockReset().mockResolvedValue({ text: "translated" });
  const ref = createRef(),
    state = jest.fn();
  await act(async () =>
    root.render(
      <PdfWorkspace
        ref={ref}
        file={new File(["pdf"], "incremental.pdf")}
        onStateChange={state}
      />
    )
  );
  const snapshot = (blocks, complete = false) => ({
    assets: [],
    blocks,
    complete,
    completedPages: blocks
      .filter((b) => b.translationReady)
      .map((b) => b.fragments[0].page),
  });
  return {
    ref,
    state,
    snapshot,
    publish: (value) =>
      progress({ stage: "恢复结构", done: 1, total: 3 }, value),
    finish: (value) => finish(value),
    fail: (error) => fail(error),
  };
}

test("automatic translation starts on page completion and remains busy until its queue drains", async () => {
  const test = await incrementalWorkspace();
  let run, finishTranslation;
  await act(async () => {
    run = test.ref.current.oneClickTranslate();
  });
  await act(async () =>
    test.publish(
      test.snapshot([incrementalBlock(1), incrementalBlock(2, false)])
    )
  );
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
  ]);
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTranslation = resolve;
      })
  );
  await act(async () =>
    test.publish(test.snapshot([incrementalBlock(1), incrementalBlock(2)]))
  );
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
    "source-2",
  ]);
  await act(async () =>
    test.finish(test.snapshot([incrementalBlock(1), incrementalBlock(2)], true))
  );
  expect(test.state.mock.calls.at(-1)[0].busy).toBe(true);
  expect(test.ref.current.getBlocks()[0].status).toBe("done");
  await act(async () => {
    finishTranslation({ text: "second translated" });
    await run;
  });
  expect(test.state.mock.calls.at(-1)[0].busy).toBe(false);
  expect(test.ref.current.getBlocks().map((block) => block.status)).toEqual([
    "done",
    "done",
  ]);
});

test("manual translation snapshots ready pages and retains results through later recognition", async () => {
  const test = await incrementalWorkspace();
  let recognition, first, finishTranslation;
  await act(async () => {
    recognition = test.ref.current.recognizeText();
  });
  await act(async () =>
    test.publish(
      test.snapshot([incrementalBlock(1), incrementalBlock(2, false)])
    )
  );
  expect(test.state.mock.calls.at(-1)[0].canTranslate).toBe(true);
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTranslation = resolve;
      })
  );
  await act(async () => {
    first = test.ref.current.translate();
  });
  await act(async () =>
    test.publish(test.snapshot([incrementalBlock(1), incrementalBlock(2)]))
  );
  await act(async () => test.ref.current.translate());
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishTranslation({ text: "first translated" });
    await first;
  });
  expect(test.ref.current.getBlocks()).toHaveLength(2);
  expect(test.ref.current.getBlocks()[0].targetAst.children[0].value).toBe(
    "first translated"
  );
  mockRequest.mockResolvedValue({ text: "second translated" });
  await act(async () => test.ref.current.translate());
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
    "source-2",
  ]);
  await act(async () => {
    test.finish(
      test.snapshot([incrementalBlock(1), incrementalBlock(2)], true)
    );
    await recognition;
  });
  await act(async () => test.ref.current.translate());
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(test.ref.current.getBlocks()[0].bilingualAst).toBeDefined();
});

test("cancel suppresses delayed recognition and translation results", async () => {
  const test = await incrementalWorkspace();
  let recognition, translation, finishTranslation;
  await act(async () => {
    recognition = test.ref.current.recognizeText();
  });
  await act(async () => test.publish(test.snapshot([incrementalBlock(1)])));
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTranslation = resolve;
      })
  );
  await act(async () => {
    translation = test.ref.current.translate();
  });
  act(() => test.ref.current.abort());
  expect(mockRequest.mock.calls[0][2].signal.aborted).toBe(true);
  await act(async () => {
    finishTranslation({ text: "late result" });
    test.finish(
      test.snapshot([incrementalBlock(1), incrementalBlock(2)], true)
    );
    await Promise.all([translation, recognition]);
  });
  expect(test.ref.current.getBlocks()).toHaveLength(1);
  expect(test.ref.current.getBlocks()[0].targetRaw).toBeUndefined();
  expect(test.ref.current.getBlocks()[0].status).toBe("idle");
});

test("a failed page translation retries with refresh while successful pages remain untouched", async () => {
  const test = await incrementalWorkspace();
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  let recognition;
  await act(async () => {
    recognition = test.ref.current.recognizeText();
  });
  await act(async () =>
    test.publish(test.snapshot([incrementalBlock(1), incrementalBlock(2)]))
  );
  mockRequest.mockImplementation(async (_method, params) => {
    if (params.text === "source-2" && !params.cacheMode)
      throw new Error("temporary failure");
    return { text: "translated" };
  });
  const implementation = translateDocumentBlocks.getMockImplementation();
  translateDocumentBlocks.mockImplementation(
    async (blocks, translate, signal, progress) => {
      for (const block of blocks) {
        try {
          await implementation([block], translate, signal, progress);
        } catch (error) {
          block.status = "error";
          block.error = error.message;
          progress(0, blocks.length);
        }
      }
    }
  );
  await act(async () => test.ref.current.translate());
  expect(test.ref.current.getBlocks().map((block) => block.status)).toEqual([
    "done",
    "error",
  ]);
  await act(async () => test.ref.current.translate());
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
    "source-2",
    "source-2",
  ]);
  expect(mockRequest.mock.calls.at(-1)[1].cacheMode).toBe("refresh");
  await act(async () => {
    test.finish(
      test.snapshot([incrementalBlock(1), incrementalBlock(2)], true)
    );
    await recognition;
  });
});

test("forced manual translation refreshes only its ready snapshot", async () => {
  const { parsePdfDocument, translateDocumentBlocks } = {
    ...require("../../libs/pdf/pdfParser"),
    ...require("../../libs/document/markdown"),
  };
  require("./State").useFileTranslation().context.scenes.pdf = {
    parseMode: "fast",
  };
  const first = incrementalBlock(1),
    second = incrementalBlock(2, false);
  parsePdfDocument.mockResolvedValue({
    assets: [],
    complete: false,
    blocks: [first, second],
    completedPages: [1],
  });
  mockRequest.mockReset().mockResolvedValue({ text: "translated" });
  translateDocumentBlocks.mockImplementation(
    async (blocks, translate, signal, progress) => {
      for (const block of blocks) {
        block.targetRaw = await translate(block.raw, signal, block);
        block.status = "done";
        progress(1, blocks.length);
      }
    }
  );
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace
        ref={ref}
        ignoreCache
        file={new File(["pdf"], "refresh.pdf")}
      />
    )
  );
  await act(async () => ref.current.parse());
  await act(async () => ref.current.translate());
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
  ]);
  expect(mockRequest.mock.calls[0][1].cacheMode).toBe("refresh");
});

test("automatic translation drains completed pages after a later recognition error", async () => {
  const test = await incrementalWorkspace();
  let run, finishTranslation;
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTranslation = resolve;
      })
  );
  await act(async () => {
    run = test.ref.current.oneClickTranslate();
  });
  const partial = test.snapshot([
    incrementalBlock(1),
    incrementalBlock(2, false),
  ]);
  await act(async () => test.publish(partial));
  await act(async () =>
    test.fail(Object.assign(new Error("recognition failed"), { partial }))
  );
  expect(test.state.mock.calls.at(-1)[0].busy).toBe(true);
  await act(async () => {
    finishTranslation({ text: "retained translation" });
    await run;
  });
  expect(test.ref.current.getBlocks()[0].targetRaw).toBe(
    "retained translation"
  );
  expect(container.textContent).toContain("recognition failed");
  expect(mockRequest.mock.calls.map((call) => call[1].text)).toEqual([
    "source-1",
  ]);
});

test("switching documents ignores late page and translation callbacks", async () => {
  const test = await incrementalWorkspace();
  let recognition, translation, finishTranslation;
  await act(async () => {
    recognition = test.ref.current.recognizeText();
  });
  await act(async () => test.publish(test.snapshot([incrementalBlock(1)])));
  mockRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishTranslation = resolve;
      })
  );
  await act(async () => {
    translation = test.ref.current.translate();
  });
  await act(async () =>
    root.render(
      <PdfWorkspace ref={test.ref} file={new File(["new"], "new.pdf")} />
    )
  );
  await act(async () => {
    test.publish(test.snapshot([incrementalBlock(1), incrementalBlock(2)]));
    finishTranslation({ text: "old document" });
    test.finish(test.snapshot([incrementalBlock(1)], true));
    await Promise.all([recognition, translation]);
  });
  expect(test.ref.current.getBlocks()).toEqual([]);
  expect(test.ref.current.isBusy()).toBe(false);
});

test("legacy resource repair requires manual refresh and preserves repaired result metadata", async () => {
  const { parsePdfDocument } = require("../../libs/pdf/pdfParser");
  const { translateDocumentBlocks } = require("../../libs/document/markdown");
  require("./State").useFileTranslation().context.scenes.pdf = {
    parseMode: "fast",
  };
  const block = {
    ...incrementalBlock(1),
    status: "error",
    error: "legacy resources missing",
    translationRepairRequired: true,
  };
  parsePdfDocument.mockResolvedValue({
    assets: [],
    blocks: [block],
    complete: true,
  });
  mockRequest.mockReset().mockResolvedValue({ text: "repaired" });
  translateDocumentBlocks.mockClear();
  translateDocumentBlocks.mockImplementation(
    async (blocks, translate, signal, progress) => {
      for (const block of blocks) {
        block.targetRaw = await translate(block.raw, signal, block);
        block.status = "done";
        block.bilingualVersion = 1;
        block.translationRepairRequired = false;
        progress(1, blocks.length);
      }
    }
  );
  const ref = createRef();
  await act(async () =>
    root.render(
      <PdfWorkspace ref={ref} file={new File(["pdf"], "legacy.pdf")} />
    )
  );
  await act(async () => ref.current.oneClickTranslate());
  expect(translateDocumentBlocks).not.toHaveBeenCalled();
  await act(async () => ref.current.translate());
  expect(mockRequest.mock.calls[0][1].cacheMode).toBe("refresh");
  expect(ref.current.getBlocks()[0].translationRepairRequired).toBe(false);
  expect(ref.current.getBlocks()[0].bilingualVersion).toBe(1);
});
