// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { renderPdfRegion } from "../../../libs/pdf/pdfDocument";
vi.mock("pdfjs-dist/build/pdf.mjs", () => ({ GlobalWorkerOptions: {} }));
afterEach(() => vi.restoreAllMocks());

it("whitens only overlapping image pixels in the recognition crop", async () => {
  const context = { fillRect: vi.fn(), fillStyle: "" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["crop"])));
  const page = { getViewport: ({ scale }: any) => ({ width: 600 * scale, height: 800 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })) };
  await renderPdfRegion(page, [10, 20, 50, 60], undefined, 2,
    [[15, 25, 25, 40], [40, 50, 80, 90], [100, 100, 120, 120]]);
  expect(context.fillStyle).toBe("white");
  expect(context.fillRect.mock.calls).toEqual([[10, 10, 20, 30], [60, 60, 20, 20]]);
});

it("does not publish a crop after cancellation during PDF rendering", async () => {
  const context = { fillRect: vi.fn(), fillStyle: "" };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as any);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");
  let finish: any;
  const cancel = vi.fn();
  const page = { getViewport: () => ({ width: 600, height: 800 }),
    render: () => ({ promise: new Promise((resolve) => { finish = resolve; }), cancel }) };
  const abort = new AbortController();
  const view = renderPdfRegion(page, [10, 20, 50, 60], abort.signal, 2);
  abort.abort();
  finish();
  await expect(view).rejects.toMatchObject({ name: "AbortError" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(encode).not.toHaveBeenCalled();
});
