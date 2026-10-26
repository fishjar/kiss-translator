import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { DEFAULT_SETTINGS } from "../types";
const state = vi.hoisted(() => ({ api: null as any }));
vi.mock("../../../libs/storage", () => ({ getSettingWithDefault: async () => ({ transApis: [state.api] }) }));
vi.mock("../../../config/serviceSelection", () => ({ isApiAvailableFor: (api: any) => !api.isDisabled }));
vi.mock("../../../providers/cache", () => ({ providerCacheSignature: async (api: any) => JSON.stringify(api) }));
vi.mock("../../../providers/instances", () => ({ validateServiceConfig: vi.fn() }));
let cachedFileResult: any;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
  state.api = { apiSlug: "remote", apiType: "Plugin", model: "one", provider: { implementation: { kind: "script" } } };
  ({ cachedFileResult } = await import("../../../fileTranslation/resultCache"));
});
afterEach(() => vi.unstubAllGlobals());
const invoke = (run: any, options: any = {}) => cachedFileResult({ api: state.api,
  capability: "parseImage", input: { image: new Blob(["pixels"]), prompt: "formula", imageSize: { width: 10, height: 20 } },
  policy: DEFAULT_SETTINGS, run, ...options });
it("reuses text/coordinates, emits a hit without inference, refresh replaces the entry", async () => {
  const run = vi.fn().mockResolvedValue({ text: "x", items: [{ text: "x", poly: [[1, 2], [3, 4]] }] });
  await invoke(run);
  const progress = vi.fn();
  const hit = await invoke(run, { onProgress: progress });
  expect(run).toHaveBeenCalledTimes(1);
  expect(progress.mock.calls).toEqual([[{ type: "cache-hit" }]]);
  hit.items[0].text = "mutation";
  expect((await invoke(run)).items[0].text).toBe("x");
  run.mockResolvedValue({ text: "new" });
  await invoke(run, { cacheMode: "refresh" });
  expect((await invoke(run)).text).toBe("new");
  expect(run).toHaveBeenCalledTimes(2);
});
it.each(["model", "prompt", "size", "content", "apiUrl", "apiKey", "pluginVersion"])("invalidates changed %s", async (field) => {
  const run = vi.fn().mockResolvedValue({ text: "x" });
  await invoke(run);
  if (field === "model") state.api.model = "two";
  if (["apiUrl", "apiKey", "pluginVersion"].includes(field)) state.api[field] = "changed";
  const input = { image: new Blob([field === "content" ? "other" : "pixels"]),
    prompt: field === "prompt" ? "table" : "formula", imageSize: { width: field === "size" ? 30 : 10, height: 20 } };
  await invoke(run, { input });
  expect(run).toHaveBeenCalledTimes(2);
});
it("canonicalizes configuration order and ignores input filenames", async () => {
  const run = vi.fn().mockResolvedValue({ text: "x" });
  await invoke(run);
  state.api = Object.fromEntries(Object.entries(state.api).reverse());
  await invoke(run, { input: { prompt: "formula", imageSize: { height: 20, width: 10 },
    image: Object.assign(new Blob(["pixels"]), { name: "other.png" }) } });
  expect(run).toHaveBeenCalledTimes(1);
});
it("rechecks disabled services before serving hits", async () => {
  const run = vi.fn().mockResolvedValue({ text: "x" });
  await invoke(run);
  state.api.isDisabled = true;
  await expect(invoke(run)).rejects.toThrow("不可用");
  expect(run).toHaveBeenCalledTimes(1);
});
it("does not store empty, invalid, binary, failed, aborted or off results", async () => {
  for (const result of [{ text: "" }, { text: "x", image: new Blob(["binary"]) }]) {
    const run = vi.fn().mockResolvedValue(result);
    await invoke(run); await invoke(run);
    expect(run).toHaveBeenCalledTimes(2);
  }
  const bad = vi.fn().mockResolvedValue({ text: "invalid" });
  const validate = () => { throw new Error("invalid"); };
  await expect(invoke(bad, { validate })).rejects.toThrow("invalid");
  await invoke(bad, { cacheMode: "off" });
  await invoke(bad, { cacheMode: "off" });
  expect(bad).toHaveBeenCalledTimes(3);
  const abort = new AbortController(); abort.abort();
  await expect(invoke(bad, { signal: abort.signal })).rejects.toThrow("已取消");
  const failed = vi.fn().mockRejectedValue(new Error("failed"));
  await expect(invoke(failed)).rejects.toThrow("failed");
  await expect(invoke(failed)).rejects.toThrow("failed");
  expect(failed).toHaveBeenCalledTimes(2);
});
it("uses runtime caching for local calls without duplicating storage", async () => {
  state.api.apiType = "LocalAI";
  const run = vi.fn().mockResolvedValue({ text: "local" });
  await invoke(run); await invoke(run);
  expect(run).toHaveBeenCalledTimes(2);
});
it("degrades to inference when IndexedDB is unavailable", async () => {
  vi.stubGlobal("indexedDB", { open: () => { throw new Error("storage"); } });
  const run = vi.fn().mockResolvedValue({ text: "x" });
  await invoke(run); await invoke(run);
  expect(run).toHaveBeenCalledTimes(2);
});
it.each(["clear", "cancel", "disable"])("does not write an in-flight result after %s", async (action) => {
  let finish: any;
  const abort = new AbortController();
  const run = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const pending = invoke(run, { signal: abort.signal });
  const settled = pending.catch((error: any) => error);
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  if (action === "clear") {
    const { InferenceCache } = await import("../inferenceCache");
    await new InferenceCache().clear();
  } else if (action === "cancel") abort.abort();
  else state.api.isDisabled = true;
  finish({ text: "old" });
  await settled;
  state.api.isDisabled = false;
  const fresh = vi.fn().mockResolvedValue({ text: "fresh" });
  expect((await invoke(fresh)).text).toBe("fresh");
  expect(fresh).toHaveBeenCalledTimes(1);
});
