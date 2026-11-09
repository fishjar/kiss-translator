import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  records: [] as any[],
  device: { webgpu: false, wasmSimd: true },
}));
vi.mock("./core/modelManager", () => ({
  sharedModelManager: { init: async () => {}, list: () => state.records },
}));
vi.mock("./core/deviceManager", () => ({
  detectDevice: async () => state.device,
}));
vi.mock("./core/ocrClient", () => ({ OcrClient: class {} }));
vi.mock("./core/vlmClient", () => ({ VlmClient: class {} }));
vi.mock("./runtime/runtimeHostAdapter", () => ({ runtimeHost: {} }));
import { serviceModelOptions } from "./fileOperations";
import { CATALOG, OCR_GROUPS } from "./core/catalog";
beforeEach(() => {
  state.records = [];
  state.device = { webgpu: false, wasmSimd: true };
});
it("includes every service model and OCR group even without any downloaded files", async () => {
  const items = (await serviceModelOptions()).flatMap((group) => group.items);
  for (const model of CATALOG.filter(
    (model) => !["ocr-detection", "ocr-recognition"].includes(model.task)
  ))
    expect(items.some((item) => item.id === model.id)).toBe(true);
  for (const group of OCR_GROUPS)
    expect(
      items.find((item) => item.id === group.id)?.installed
    ).toBe(false);
  expect(items.every((item) => item.installed === false)).toBe(true);
  expect(items.find((item) => item.id === "hy-mt2-1.8b")?.unavailableReasons).toEqual([]);
});
it("requires both OCR components and checks actual device support independently of download state", async () => {
  const group = OCR_GROUPS[0];
  state.records = [
    { state: "installed", manifest: CATALOG.find((m) => m.id === group.detId) },
  ];
  let items = (await serviceModelOptions()).flatMap((group) => group.items);
  expect(
    items.find((item) => item.id === group.id)?.installed
  ).toBe(false);
  state.records.push({
    state: "installed",
    manifest: CATALOG.find((m) => m.id === group.recId),
  });
  const gpuOnly = CATALOG.find(
    (m) => m.task === "asr" && !m.backend.includes("wasm")
  )!;
  state.records.push({ state: "installed", manifest: gpuOnly });
  items = (await serviceModelOptions()).flatMap((group) => group.items);
  expect(
    items.find((item) => item.id === group.id)?.unavailableReasons
  ).toEqual([]);
  expect(items.find((item) => item.id === group.id)?.installed).toBe(true);
  expect(
    items.find((item) => item.id === gpuOnly.id)?.unavailableReasons
  ).toEqual(["当前环境不支持 WebGPU"]);
  state.device.webgpu = true;
  items = (await serviceModelOptions()).flatMap((group) => group.items);
  expect(
    items.find((item) => item.id === gpuOnly.id)?.unavailableReasons
  ).toEqual([]);
});

it("separates OCR groups from VLM models and retains installed custom models", async () => {
  state.records = [{ state: "installed", manifest: {
    id: "custom-vlm", name: "Custom VLM", task: "ocr-vlm", backend: ["wasm"],
  } }];
  const groups = await serviceModelOptions();
  expect(groups.slice(0, 2).map((group) => group.category)).toEqual(["ocr", "vlm"]);
  expect(groups[0].items.map((item) => item.id)).toEqual(OCR_GROUPS.map((group) => group.id));
  expect(groups[1].items.map((item) => item.id)).toEqual([
    ...CATALOG.filter((model) => model.task === "ocr-vlm").map((model) => model.id),
    "custom-vlm",
  ]);
  expect(groups[1].items.at(-1)?.unavailableReasons).toEqual([]);
  const ids = groups.flatMap((group) => group.items.map((item) => item.id));
  expect(new Set(ids).size).toBe(ids.length);
});
