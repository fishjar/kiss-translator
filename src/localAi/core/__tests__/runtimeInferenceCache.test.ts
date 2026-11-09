import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { RuntimeManager } from "../../runtime/runtimeManager";
import { DEFAULT_SETTINGS } from "../types";
import { CATALOG } from "../catalog";
import { resolveModelTarget } from "../modelTarget";
vi.mock("../settings", async (original) => ({ ...(await original<any>()),
  loadSettings: async () => ({ ...DEFAULT_SETTINGS, autoUnloadMinutes: 0, exclusiveResourceMode: false }),
}));
vi.mock("../inputLimits", async (original) => ({ ...(await original<any>()),
  prepareImage: async (blob: Blob) => ({ blob, original: { width: 10, height: 10 }, size: { width: 10, height: 10 } }),
}));
beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
let id = 0;
const cases: any[] = [
  ["asr", "transcribe", { audio: new Float32Array([1, 2]), language: "en" }, { segments: [{ start: 0, end: 1, text: "hello" }] }],
  ["ocr", "recognize", { blob: new Blob(["image"]) }, { items: [{ text: "hello", poly: [[0, 0], [1, 1]] }] }],
  ["doc", "analyze", { blob: new Blob(["image"]) }, { regions: [], imageSize: { width: 10, height: 10 } }],
  ["llm", "chat", { messages: [{ role: "user", content: "hello" }], maxTokens: 20 }, { text: "done", elapsedMs: 1 }],
  ["vlm", "chat", { messages: [{ role: "user", content: "read", images: [new TextEncoder().encode("image").buffer] }], maxTokens: 20 }, { text: "done", elapsedMs: 1 }],
  ["decision", "predict", { state: { scene: "doc" }, questions: { q: { criteria: ["a", "b"] } } }, { answers: { q: { choice: "a", confidence: 1 } } }],
];
async function setup(service: any, result: any) {
  const manager = new RuntimeManager();
  await (manager as any).settingsReady;
  (manager as any).sessions.set(service, { service, modelId: "model", sessionVersion: 1,
    state: "ready", backend: "wasm", loadSpec: { dir: "model", device: "wasm" } });
  const record: any = { state: "installed", manifest: { id: "model", dir: "model", version: "1", files: [] }, downloadedAt: 1 };
  vi.spyOn(manager.modelManager, "init").mockResolvedValue(undefined);
  vi.spyOn(manager.modelManager, "list").mockReturnValue([record]);
  const dispatch = vi.spyOn(manager as any, "dispatch").mockImplementation(async (_req: any, _progress: any, stream: any) => {
    if (result?.text && stream) stream({ type: "token", text: result.text });
    return { result: structuredClone(result) };
  });
  const run = (method: string, payload: any, cacheMode?: any, hooks?: any) => manager.handleRequest({
    id: `cache-${++id}`, service, method, payload, options: { sessionVersion: 1, cacheMode },
  }, hooks);
  return { manager, record, dispatch, run };
}
it.each(cases)("%s reuses completed inference across runtime reconstruction", async (service, method, payload, result) => {
  const first = await setup(service, result);
  expect((await first.run(method, payload)).ok).toBe(true);
  const second = await setup(service, result);
  const streams = vi.fn(), progress = vi.fn();
  const hit = await second.run(method, payload, undefined, { onStream: streams, onProgress: progress });
  expect(hit.usage).toMatchObject({ cacheHit: true, queueMs: 0, inferenceMs: 0 });
  expect(second.dispatch).not.toHaveBeenCalled();
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ status: "CACHE_HIT" }));
  expect(streams.mock.calls.map((call) => call[0].text)).toEqual(["llm", "vlm"].includes(service) ? ["done"] : []);
});
it("refresh replaces the same key; off does not read or write", async () => {
  const { run, dispatch } = await setup("llm", { text: "first" });
  const payload = cases[3][2];
  await run("chat", payload);
  dispatch.mockResolvedValue({ result: { text: "second" } });
  expect((await run("chat", { ...payload, cacheMode: "refresh" }, "refresh")).result).toMatchObject({ text: "second" });
  expect((await run("chat", payload)).result).toMatchObject({ text: "second" });
  dispatch.mockResolvedValue({ result: { text: "off" } });
  await run("chat", payload, "off");
  expect((await run("chat", payload)).result).toMatchObject({ text: "second" });
  expect(dispatch).toHaveBeenCalledTimes(3);
});
it("does not cache TTS binary output", async () => {
  const { run, dispatch } = await setup("tts", { audio: new Float32Array([1]), sampleRate: 24000 });
  await run("synthesize", { text: "hello", voice: "voice", speed: 1 });
  await run("synthesize", { text: "hello", voice: "voice", speed: 1 });
  expect(dispatch).toHaveBeenCalledTimes(2);
});
it("invalidates changed model files and checks session versions before returning a hit", async () => {
  const { run, manager, record, dispatch } = await setup("llm", { text: "done" });
  const payload = cases[3][2];
  await run("chat", payload);
  record.downloadedAt = 2;
  await run("chat", payload);
  expect(dispatch).toHaveBeenCalledTimes(2);
  (manager as any).sessions.get("llm").sessionVersion = 2;
  expect((await run("chat", payload)).error?.code).toBe("MODEL_SWITCHED");
  expect(dispatch).toHaveBeenCalledTimes(2);
});
it("does not cache failed, empty or aborted generation", async () => {
  const { run, dispatch } = await setup("llm", { text: "" });
  const payload = cases[3][2];
  await run("chat", payload); await run("chat", payload);
  dispatch.mockResolvedValue({ result: { text: "partial", aborted: true } });
  await run("chat", payload); await run("chat", payload);
  dispatch.mockRejectedValue(new Error("inference failed"));
  await run("chat", payload); await run("chat", payload);
  expect(dispatch).toHaveBeenCalledTimes(6);
});
it("bypasses cache when model identity or storage is unavailable", async () => {
  const { run, manager, dispatch } = await setup("llm", { text: "done" });
  const payload = cases[3][2];
  vi.mocked(manager.modelManager.list).mockReturnValue([]);
  await run("chat", payload); await run("chat", payload);
  expect(dispatch).toHaveBeenCalledTimes(2);
  vi.stubGlobal("indexedDB", { open: () => { throw new Error("disabled storage"); } });
  const other = await setup("llm", { text: "done" });
  expect((await other.run("chat", payload)).ok).toBe(true);
  expect((await other.run("chat", payload)).ok).toBe(true);
  expect(other.dispatch).toHaveBeenCalledTimes(2);
});
it("caches local model translation without losing the text response", async () => {
  const { manager, dispatch } = await setup("llm", { text: "translated" });
  const model = CATALOG.find((m) => m.task === "llm")!;
  const target = resolveModelTarget("llm", { modelRef: model.id });
  vi.spyOn(manager.modelManager, "get").mockReturnValue({ manifest: model, state: "installed", files: {} } as any);
  (manager as any).sessions.set("llm", { service: "llm", modelId: target.modelId, sessionVersion: 1,
    state: "ready", backend: "wasm", loadSpec: target.spec });
  (manager as any).loadedSpecs.set("llm", JSON.stringify(target.spec));
  vi.spyOn(manager as any, "hasServiceInstance").mockReturnValue(true);
  const run = () => manager.handleRequest({ id: `translate-${++id}`, service: "translation", method: "translate",
    payload: { modelRef: model.id, text: "original", toLang: "zh" } });
  expect((await run()).result).toBe("translated");
  expect((await run()).usage?.cacheHit).toBe(true);
  expect(dispatch).toHaveBeenCalledTimes(1);
});
