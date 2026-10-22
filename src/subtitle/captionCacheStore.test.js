import { IDBFactory } from "fake-indexeddb";
import { serialize, deserialize } from "v8";
import { CaptionCacheStore, captionCacheLimit } from "./captionCacheStore";

const input = (videoId = "kSQknoHMFtk") => ({
  videoId,
  track: {
    languageCode: "en",
    vssId: ".en",
    baseUrl: "https://signed.invalid/token",
  },
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "hello" }] }],
  fullDescription: "description",
  bilingual: {
    segmentationSignature: "rules-v1",
    translationSignature: "translation-v1",
    toLang: "zh-CN",
    complete: true,
    cues: [{ start: 0, end: 1000, text: "hello", translation: "你好" }],
  },
});
let store, originalClone;
beforeEach(() => {
  originalClone = globalThis.structuredClone;
  globalThis.structuredClone = (value) => deserialize(serialize(value));
  store = new CaptionCacheStore(new IDBFactory());
});
afterEach(async () => {
  await store.close();
  globalThis.structuredClone = originalClone;
  jest.restoreAllMocks();
});

test("a fresh connection restores raw captions and bilingual results without summaries, runtime state or signed URLs", async () => {
  const { generation } = await store.lookup("kSQknoHMFtk", 100);
  await store.put({ ...input(), summary: "must not persist" }, generation, 100);
  await store.close();
  const result = await store.lookup("kSQknoHMFtk", 100);
  expect(result.entry.events).toEqual(input().events);
  expect(result.entry.bilingual.cues).toEqual([
    { start: 0, end: 1000, text: "hello", translation: "你好" },
  ]);
  expect(result.entry.track.baseUrl).toBeUndefined();
  expect(result.entry.summary).toBeUndefined();
  expect(result.entry.segmentation).toBeUndefined();
});

test("video count uses LRU; reducing the count and disabling storage immediately evict records", async () => {
  let clock = 1;
  jest.spyOn(Date, "now").mockImplementation(() => clock++);
  await store.put(input(), 0, 2);
  await store.put(input("tll9E6YX3sk"), 0, 2);
  await store.lookup("kSQknoHMFtk", 2);
  await store.put(input("abcdefghijk"), 0, 2);
  expect((await store.lookup("tll9E6YX3sk", 2)).entry).toBeNull();
  expect((await store.lookup("kSQknoHMFtk", 2)).entry).not.toBeNull();
  expect((await store.stats(1)).count).toBe(1);
  expect((await store.stats(0)).count).toBe(0);
  expect(await store.put(input(), 0, 0)).toBe(false);
});

test("clear prevents an in-flight page from writing its old snapshot back, including after restart", async () => {
  const { generation } = await store.lookup("kSQknoHMFtk", 100);
  await store.put(input(), generation, 100);
  await store.clear();
  await store.close();
  expect(await store.put(input(), generation, 100)).toBe(false);
  const next = await store.lookup("kSQknoHMFtk", 100);
  expect(next.entry).toBeNull();
  expect(await store.put(input(), next.generation, 100)).toBe(true);
});

test.each([0, 100, 1000])("retention limit accepts %s", (limit) =>
  expect(captionCacheLimit(limit)).toBe(limit)
);
test.each([-1, 1001, 1.5, undefined])(
  "invalid retention limit %s falls back to 100",
  (limit) => expect(captionCacheLimit(limit)).toBe(100)
);

test("concurrent partial snapshots retain successful translations and complete structure", async () => {
  await store.put(input(), 0, 100);
  const partial = input();
  partial.bilingual.complete = false;
  partial.bilingual.cues[0].translation = "";
  await store.put(partial, 0, 100);
  const saved = (await store.lookup(partial.videoId, 100)).entry;
  expect(saved.bilingual.complete).toBe(true);
  expect(saved.bilingual.cues[0].translation).toBe("你好");
  const rawOnly = input();
  delete rawOnly.bilingual;
  await store.put(rawOnly, 0, 100);
  expect((await store.lookup(partial.videoId, 100)).entry.bilingual).toEqual(
    saved.bilingual
  );
});

test("different translation signatures never merge old translations", async () => {
  await store.put(input(), 0, 100);
  const changed = input();
  changed.bilingual.translationSignature = "different-language";
  changed.bilingual.cues[0].translation = "";
  await store.put(changed, 0, 100);
  expect(
    (await store.lookup(changed.videoId, 100)).entry.bilingual.cues[0]
      .translation
  ).toBe("");
});

test("partial snapshots replace overlapping structures without duplicating cues", async () => {
  const first = input();
  first.bilingual.complete = false;
  await store.put(first, 0, 100);
  const next = input();
  next.bilingual.complete = false;
  next.bilingual.cues = [
    { start: 0, end: 500, text: "he", translation: "" },
    { start: 500, end: 1000, text: "llo", translation: "" },
  ];
  await store.put(next, 0, 100);
  expect((await store.lookup(next.videoId, 100)).entry.bilingual.cues).toEqual(
    next.bilingual.cues
  );
});

test("opening the new cache format discards development records from version one", async () => {
  const db = await new Promise((resolve, reject) => {
    const req = store.indexedDB.open("kiss-youtube-captions", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("videos", { keyPath: "videoId" });
      req.result.createObjectStore("meta");
      req.result.createObjectStore("index", { keyPath: "videoId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve) => {
    const tx = db.transaction("videos", "readwrite");
    tx.objectStore("videos").put({ ...input(), summary: "legacy" });
    tx.oncomplete = resolve;
  });
  db.close();
  expect((await store.lookup(input().videoId, 100)).entry).toBeNull();
  expect(await store.stats(100)).toEqual({ count: 0, bytes: 0 });
});

test.each(["length", "time", "middle"])(
  "changed raw caption %s never inherits old bilingual results",
  async (change) => {
    const first = input();
    first.events = [0, 1000, 2000].map((tStartMs) => ({
      tStartMs,
      dDurationMs: 1000,
      segs: [{ utf8: "original" }],
    }));
    await store.put(first, 0, 100);
    const next = {
      ...first,
      events: first.events.map((event) => ({
        ...event,
        segs: [...event.segs],
      })),
    };
    delete next.bilingual;
    if (change === "length") next.events.pop();
    else if (change === "time") next.events[2].tStartMs = 2100;
    else next.events[1].segs = [{ utf8: "edited middle" }];
    await store.put(next, 0, 100);
    expect(
      (await store.lookup(first.videoId, 100)).entry.bilingual
    ).toBeUndefined();
  }
);
