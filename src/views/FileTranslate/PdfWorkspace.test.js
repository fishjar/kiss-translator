/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import PdfWorkspace from "./PdfWorkspace";
import { openPdf } from "../../libs/pdf/pdfDocument";
jest.mock("./State", () => { const context = { scenes: { pdf: {} }, models: [] }; return { useFileTranslation: () => ({ context, connected: true, client: { request: mockRequest }, openSettings: jest.fn() }) }; });
jest.mock("../../libs/pdf/pdfDocument", () => ({ openPdf: jest.fn(), renderPdfRegion: jest.fn() }));
jest.mock("../../libs/pdf/pdfParser", () => ({ parsePdfDocument: jest.fn(), detectPdfLayout: jest.fn(), MissingDocumentModel: class extends Error {} }));
jest.mock("../../libs/pdf/structure", () => ({ buildToc: () => [{ id: "chapter", title: "Chapter", page: 1, y: 0, depth: 0 }] }));
jest.mock("../../libs/document/markdown", () => ({ parseDocumentMarkdown: () => [], translateDocumentBlocks: jest.fn() }));
jest.mock("../../libs/document/export", () => ({ exportDocument: jest.fn() }));
jest.mock("./PdfPage", () => { const React = require("react"); return () => React.createElement("div", { "data-pdf-page": "1", "data-scale": "1" }, "Page"); });
const mockRequest = jest.fn();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const originalObserver = globalThis.ResizeObserver, originalScroll = HTMLElement.prototype.scrollTo;
beforeEach(() => {
  globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { this.cb([{ contentRect: { width: 900 } }]); } disconnect() {} };
  HTMLElement.prototype.scrollTo = jest.fn();
  localStorage.removeItem("kiss_pdf_reader");
  openPdf.mockResolvedValue({ pdf: { numPages: 1 }, bookmarks: [], destroy: jest.fn() });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); globalThis.ResizeObserver = originalObserver; HTMLElement.prototype.scrollTo = originalScroll; });
test("PDF drawer starts closed at 270px, preserves navigation and has no footer or split handle", async () => {
  await act(async () => root.render(<PdfWorkspace file={new File(["pdf"], "test.pdf")} />));
  const drawer = container.querySelector(".kt-toc-drawer");
  expect(drawer.style.width).toBe("270px");
  expect(drawer.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector(".kt-pdf-status")).toBeNull();
  expect(container.querySelectorAll('[role="separator"]')).toHaveLength(1);
  const toggleBtn = container.querySelector('[aria-label="展开目录"]');
  expect(toggleBtn.style.border).toBe("");
  expect(toggleBtn.classList.contains("MuiIconButton-colorPrimary")).toBe(false);
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
  parsePdfDocument.mockResolvedValue({ complete: true, blocks: [], assets: [] });
  const pending = [];
  mockRequest.mockImplementation((method, params, { signal }) => new Promise((resolve) => pending.push({ text: params.text, resolve, signal })));
  let translated;
  translateDocumentBlocks.mockImplementation(async (blocks, translate, signal) => {
    translated = await translate("a".repeat(12000) + "b".repeat(12000) + "c", signal);
  });
  const ref = createRef();
  await act(async () => root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />));
  await act(async () => { await ref.current.parse(); });
  let run;
  await act(async () => { run = ref.current.translate(); });
  expect(pending.map((item) => item.text.length)).toEqual([12000, 12000, 1]);
  await act(async () => {
    [...pending].reverse().forEach(({ text, resolve }) => resolve({ text: text[0].toUpperCase() }));
    await run;
  });
  expect(translated).toBe("ABC");
});

test("PDF layout detection activates wireframe switch and clicking region toggles its enabled state", async () => {
  const { detectPdfLayout, parsePdfDocument } = require("../../libs/pdf/pdfParser");
  detectPdfLayout.mockResolvedValue({
    1: [
      { id: "box-1", type: "paragraph", bbox: [10, 10, 100, 100], enabled: true },
      { id: "box-2", type: "header", bbox: [10, 200, 100, 250], enabled: true },
    ],
  });

  const ref = createRef();
  await act(async () => root.render(<PdfWorkspace ref={ref} file={new File(["pdf"], "test.pdf")} />));

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
  parsePdfDocument.mockResolvedValue({ complete: true, blocks: [], assets: [] });
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
