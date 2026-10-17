import { IDBFactory } from "fake-indexeddb";
import { serialize, deserialize } from "v8";
import { AsrCacheStore, mediaCacheKey } from "./cacheStore";

const identity = {
  videoId: "kSQknoHMFtk",
  trackId: "en-US.4",
  mediaVersion: "140.123",
  durationMs: 2000,
  sourceLanguage: "en",
};
const signatures = {
  recognition: "a".repeat(64),
  segmentation: "b".repeat(64),
  translation: "c".repeat(64),
};
const block = (start, end, extra = {}) => ({
  startSample: start * 16000,
  endSample: end * 16000,
  stage: "translated",
  segments: [{ start, end, text: "hello" }],
  subtitles: [
    {
      start: start * 1000,
      end: end * 1000,
      text: "hello",
      translation: "你好",
    },
  ],
  ...extra,
});
let store;
const originalClone = globalThis.structuredClone;
beforeEach(() => {
  globalThis.structuredClone = (value) => deserialize(serialize(value));
  store = new AsrCacheStore({ indexedDB: new IDBFactory() });
});
afterEach(async () => {
  await store.close();
  globalThis.structuredClone = originalClone;
});

test("atomic per-block writes restore partial coverage, silence and fully translated subtitles", async () => {
  await store.putChunk(identity, signatures, block(0, 1));
  let cached = await store.getVideo(identity, signatures);
  expect(cached.recognition).toMatchObject({ percent: 50, complete: false });
  expect(cached.chunks[0].subtitles[0].translation).toBe("你好");
  await store.putChunk(
    identity,
    signatures,
    block(1, 2, { silent: true, segments: [], subtitles: [] })
  );
  cached = await store.getVideo(identity, signatures);
  expect(cached.recognition.complete).toBe(true);
  expect(cached.translation.complete).toBe(true);
  await store.close();
  expect(
    (await store.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
});

test("configuration invalidation is layered; changing media identity never reuses another track", async () => {
  await store.putChunk(identity, signatures, block(0, 2));
  expect(
    await store.getVideo({ ...identity, trackId: "ja.10" }, signatures)
  ).toBeNull();
  expect(
    await store.getVideo({ ...identity, durationMs: 2001 }, signatures)
  ).toBeNull();
  expect(
    await store.getVideo({ ...identity, mediaVersion: "140.124" }, signatures)
  ).toBeNull();
  expect(
    await store.getVideo(identity, {
      ...signatures,
      recognition: "d".repeat(64),
    })
  ).toBeNull();
  const translated = await store.getVideo(identity, {
    ...signatures,
    translation: "d".repeat(64),
  });
  expect(translated.recognition.complete).toBe(true);
  expect(translated.translation.complete).toBe(false);
  expect(translated.chunks[0].subtitles[0].translation).toBe("");
  const segmented = await store.getVideo(identity, {
    ...signatures,
    segmentation: "d".repeat(64),
  });
  expect(segmented.chunks[0].segments).toHaveLength(1);
  expect(segmented.chunks[0].subtitles).toEqual([]);
});

test("new recognition replaces old blocks atomically and corrupted records only remove that video", async () => {
  await store.putChunk(identity, signatures, block(0, 1));
  const other = { ...identity, videoId: "bs7WQKv4_ZU" };
  await store.putChunk(other, signatures, block(0, 2));
  const newer = { ...signatures, recognition: "d".repeat(64) };
  await store.putChunk(identity, newer, block(1, 2));
  expect((await store.getVideo(identity, newer)).recognition.percent).toBe(50);
  await store.run(["chunks"], "readwrite", (s) =>
    s("chunks").put({
      id: `${mediaCacheKey(identity)}:16000`,
      key: mediaCacheKey(identity),
      startSample: -1,
    })
  );
  expect(await store.getVideo(identity, newer)).toBeNull();
  expect((await store.getVideo(other, signatures)).recognition.complete).toBe(
    true
  );
});

test("LRU evicts the least recently viewed video; quota failure preserves previous complete records", async () => {
  let clock = 0;
  store.now = () => ++clock;
  const a = identity,
    b = { ...identity, videoId: "bs7WQKv4_ZU" },
    c = { ...identity, videoId: "jNQXAC9IVRw" };
  await store.putChunk(a, signatures, block(0, 2));
  await store.putChunk(b, signatures, block(0, 2));
  const rows = await store.run(
    ["videos"],
    "readonly",
    (s) =>
      new Promise((resolve) => {
        const req = s("videos").getAll();
        req.onsuccess = () => resolve(req.result);
      })
  );
  store.subtitleLimit = rows.reduce((sum, row) => sum + row.bytes, 0) + 32;
  await store.getVideo(a, signatures);
  await store.putChunk(c, signatures, block(0, 2));
  expect(await store.getVideo(b, signatures)).toBeNull();
  expect(await store.getVideo(a, signatures)).not.toBeNull();
  await expect(
    store.putChunk(
      c,
      signatures,
      block(0, 2, { segments: [{ start: 0, end: 2, text: "x".repeat(4000) }] })
    )
  ).rejects.toHaveProperty("code", "SUBTITLE_QUOTA");
  expect(await store.getVideo(a, signatures)).not.toBeNull();
});

test("only normalized text/identity/config hashes are stored, never tokens or request URLs", async () => {
  await store.putChunk({ ...identity, signedUrl: "secret" }, signatures, {
    ...block(0, 2),
    token: "secret",
    url: "secret",
    audio: "secret",
  });
  const data = await store.getVideo(identity, signatures);
  expect(JSON.stringify(data)).not.toContain("secret");
});

test("failed retries retain successful captions and overlapping source blocks cannot duplicate subtitles", async () => {
  await store.putChunk(identity, signatures, block(0, 1));
  await store.putChunk(
    identity,
    signatures,
    block(0, 1, {
      stage: "failed",
      segments: [],
      subtitles: [],
      errorCode: "NETWORK",
    })
  );
  expect((await store.getVideo(identity, signatures)).chunks[0].stage).toBe(
    "translated"
  );
  await expect(
    store.putChunk(identity, signatures, block(0.5, 2))
  ).rejects.toHaveProperty("code", "CACHE_INTERVAL_OVERLAP");
  expect((await store.getVideo(identity, signatures)).recognition.percent).toBe(
    50
  );
});

test("only an explicit decoded EOF proof can cover small codec clock rounding; a distant last cue cannot", async () => {
  const tail = block(0, 1.999875);
  await store.putChunk(identity, signatures, tail);
  expect(
    (await store.getVideo(identity, signatures)).translation.complete
  ).toBe(false);
  await store.putChunk(identity, signatures, { ...tail, endOfMedia: true });
  expect(
    (await store.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
  await expect(
    store.putChunk(identity, signatures, { ...block(0, 1), endOfMedia: true })
  ).rejects.toHaveProperty("code", "INVALID_CACHE_CHUNK");
});

const segment = (index, value = 1) => ({
  index,
  startMs: index ? (index - 1) * 1000 : 0,
  endMs: index ? index * 1000 : 0,
  data: new Uint8Array([value, 2, 3]).buffer,
});

test("compressed audio duplicates are deduplicated, index reads omit binary data, cleanup keeps subtitles", async () => {
  await store.putChunk(identity, signatures, block(0, 2));
  await store.beginAudio("session-1", identity);
  expect(await store.putAudio("session-1", segment(0))).toBe(true);
  expect(await store.putAudio("session-1", segment(1))).toBe(true);
  expect(await store.putAudio("session-1", segment(1))).toBe(false);
  await expect(
    store.putAudio("session-1", segment(1, 2))
  ).rejects.toHaveProperty("code", "AUDIO_SEGMENT_MISMATCH");
  expect(
    (await store.listAudio("session-1")).map(({ index, data }) => [index, data])
  ).toEqual([
    [0, undefined],
    [1, undefined],
  ]);
  expect((await store.getAudio("session-1", 1)).data.byteLength).toBe(3);
  await store.close();
  await store.clearAudio();
  expect(await store.listAudioSessions()).toEqual([]);
  expect(
    (await store.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
});

test("audio per-video and total limits pause writes without losing existing segments", async () => {
  store.audioVideoLimit = 5;
  store.audioLimit = 7;
  await store.beginAudio("a", identity);
  await store.beginAudio("b", { ...identity, trackId: "ja.10" });
  await store.beginAudio("c", { ...identity, videoId: "bs7WQKv4_ZU" });
  await store.putAudio("a", segment(0));
  await expect(store.putAudio("b", segment(0))).rejects.toHaveProperty(
    "code",
    "AUDIO_QUOTA"
  );
  await store.putAudio("c", segment(0));
  await expect(store.putAudio("c", segment(1))).rejects.toHaveProperty(
    "code",
    "AUDIO_QUOTA"
  );
  expect(await store.listAudio("a")).toHaveLength(1);
  await store.removeAudio("a");
  expect(await store.listAudio("a")).toEqual([]);
});

test("response timing survives cache restoration and unused segmentation changes", async () => {
  await store.putChunk(
    identity,
    signatures,
    block(0, 1, { timingSource: "audio-chunk" })
  );
  await store.putChunk(identity, signatures, block(1, 2));
  await store.close();
  const cached = await store.getVideo(identity, signatures);
  expect(cached.translation.complete).toBe(true);
  expect(cached.chunks.map((chunk) => chunk.timingSource)).toEqual([
    "audio-chunk",
    "asr",
  ]);
  expect(cached.chunks[0].subtitles[0].timingSource).toBe("audio-chunk");
  const changed = await store.getVideo(identity, {
    ...signatures,
    segmentation: "d".repeat(64),
  });
  expect(changed.chunks[0].stage).toBe("translated");
  expect(changed.chunks[0].subtitles[0].translation).toBe("你好");
  expect(changed.chunks[1].stage).toBe("recognized");
  const translation = await store.getVideo(identity, {
    ...signatures,
    segmentation: "d".repeat(64),
    translation: "e".repeat(64),
  });
  expect(translation.chunks[0].stage).toBe("segmented");
  expect(translation.chunks[0].subtitles[0]).toMatchObject({
    timingSource: "audio-chunk",
    start: 0,
    end: 1000,
    translation: "",
  });
});
