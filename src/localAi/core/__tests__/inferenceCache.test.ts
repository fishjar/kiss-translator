import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { webcrypto } from "node:crypto";
import { InferenceCache, inferenceCacheKey } from "../inferenceCache";
import { DEFAULT_SETTINGS } from "../types";
const policy = { ...DEFAULT_SETTINGS };
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("hashes content, typed inputs, object order and ordered history", async () => {
  const a = Object.assign(new Blob(["image"]), { name: "a.png" });
  const b = Object.assign(new Blob(["image"]), { name: "b.png" });
  expect(await inferenceCacheKey({ a: 1, b: a })).toBe(await inferenceCacheKey({ b, a: 1 }));
  expect(await inferenceCacheKey(new Blob(["other"]))).not.toBe(await inferenceCacheKey(a));
  expect(await inferenceCacheKey(new Float32Array([1, 2]))).not.toBe(await inferenceCacheKey(new Float32Array([2, 1])));
  expect(await inferenceCacheKey(["system", "user"])).not.toBe(await inferenceCacheKey(["user", "system"]));
  expect(await inferenceCacheKey(" text ")).not.toBe(await inferenceCacheKey("text"));
});
it.each(["model", "revision", "backend", "prompt", "history", "language", "voice", "speed", "questions"])("invalidates changed %s", async (field) => {
  expect(await inferenceCacheKey({ [field]: "one" })).not.toBe(await inferenceCacheKey({ [field]: "two" }));
});
it("persists structured results across cache instances and returns independent copies", async () => {
  const first = new InferenceCache();
  const result = { items: [{ text: "hello", poly: [[1, 2], [3, 4]] }], segments: [{ text: "hi", start: 1 }], answers: { choice: "A" } };
  await first.put("result", result, await first.generation(), policy);
  result.items[0].text = "mutated";
  const second = new InferenceCache();
  const hit = await second.get("result", policy);
  expect(hit?.value.items[0].text).toBe("hello");
  hit!.value.items[0].text = "changed";
  expect((await first.get("result", policy))?.value.items[0].text).toBe("hello");
});
it.each([new Float32Array([1]), new ArrayBuffer(2), new Blob(["image"]), { audio: new Float32Array([1]) }, { image: new Blob(["crop"]) }])(
  "does not persist binary output", async (result) => {
    const cache = new InferenceCache();
    await cache.put("binary", result, await cache.generation(), policy);
    expect(await cache.get("binary", policy)).toBeNull();
  });
it("clearing prevents old and other-instance tasks from writing back", async () => {
  const first = new InferenceCache(), second = new InferenceCache();
  const old = await first.generation();
  await second.clear();
  await first.put("old", { text: "old" }, old, policy);
  expect(await first.get("old", policy)).toBeNull();
  await first.put("new", { text: "new" }, await first.generation(), policy);
  expect((await second.get("new", policy))?.value.text).toBe("new");
});
it("expires entries and enforces LRU, total and single-entry budgets", async () => {
  const cache = new InferenceCache(), token = await cache.generation();
  const small = { ...policy, inferenceCacheMB: 1 };
  vi.spyOn(Date, "now").mockReturnValue(1);
  await cache.put("a", "a".repeat(600000), token, small);
  vi.mocked(Date.now).mockReturnValue(2);
  await cache.put("b", "b".repeat(400000), token, small);
  vi.mocked(Date.now).mockReturnValue(3);
  await cache.get("a", small);
  await cache.put("c", "c".repeat(200000), token, small);
  expect(await cache.get("b", small)).toBeNull();
  expect((await cache.stats(small)).count).toBe(2);
  await cache.put("huge", "x".repeat(33 * 1048576), token, policy);
  expect(await cache.get("huge", policy)).toBeNull();
  vi.mocked(Date.now).mockReturnValue(31 * 86400000);
  expect(await cache.get("a", policy)).toBeNull();
  expect((await cache.stats(policy)).count).toBe(0);
  vi.restoreAllMocks();
});
it("skips disabled, aborted, transient and unavailable storage without throwing", async () => {
  const cache = new InferenceCache(), token = await cache.generation();
  await cache.put("off", { text: "off" }, token, { ...policy, inferenceCacheEnabled: false });
  await cache.put("aborted", { text: "partial", aborted: true }, token, policy);
  await cache.put("url", { image: "blob:temporary" }, token, policy);
  const abort = new AbortController(); abort.abort();
  await cache.put("cancel", { text: "late" }, token, policy, abort.signal);
  expect((await cache.stats(policy)).count).toBe(0);
  vi.stubGlobal("indexedDB", { open: () => { throw new Error("unavailable"); } });
  const broken = new InferenceCache();
  expect(await broken.generation()).toBeNull();
  expect(await broken.get("anything", policy)).toBeNull();
});
