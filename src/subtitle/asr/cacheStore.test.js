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

test("language variants coexist, preserve detected language and share the original audio session", async () => {
  const chinese = { ...identity, recognitionLanguage: "zh-hans" };
  const english = { ...identity, recognitionLanguage: "en" };
  await store.beginAudio("shared-audio", identity);
  await store.putAudio("shared-audio", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([0]).buffer });
  await store.putChunk(chinese, signatures, block(0, 2, { language: "zh", languageConfidence: 0.95 }));
  await store.putChunk(english, signatures, block(0, 2, { language: "en" }));
  expect((await store.getVideo(chinese, signatures)).chunks[0]).toMatchObject({ language: "zh", languageConfidence: 0.95 });
  expect((await store.getVideo(english, signatures)).chunks[0].language).toBe("en");
  expect((await store.findAudioSession(identity)).sessionId).toBe("shared-audio");
});

test("version 1 upgrade backfills identity indexes without changing text, session IDs or audio bytes", async () => {
  await store.putChunk(identity, signatures, block(0, 2));
  await store.beginAudio("legacy-session", identity);
  for (const index of [0, 1, 2]) await store.putAudio("legacy-session", {
    index, startMs: index ? (index - 1) * 1000 : 0, endMs: index * 1000,
    data: new Uint8Array([index, 9, 7]).buffer,
  });
  const names = ["videos", "chunks", "audioSessions", "audioIndex", "audio"];
  const rows = await store.run(names, "readonly", async table => {
    const result = {};
    for (const name of names) result[name] = await new Promise(resolve => {
      const req = table(name).getAll(); req.onsuccess = () => resolve(req.result);
    });
    return result;
  });
  delete rows.videos[0].identity;
  delete rows.audioSessions[0].identity;
  await store.close();
  const indexedDB = new IDBFactory();
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("kiss-youtube-asr", 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      for (const name of names) {
        const table = req.result.createObjectStore(name, {
          keyPath: name === "videos" ? "key" : name === "audioSessions" ? "sessionId" : "id",
        });
        if (name === "chunks") table.createIndex("video", "key");
        if (["audio", "audioIndex"].includes(name)) table.createIndex("session", "sessionId");
        for (const row of rows[name]) table.put(row);
      }
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
  });
  store = new AsrCacheStore({ indexedDB });
  const lookup = await store.lookupCache({ videoId: identity.videoId });
  expect((await store.open()).version).toBe(2);
  expect(lookup.subtitle.identity).toEqual(identity);
  expect(lookup.audio.sessionId).toBe("legacy-session");
  expect(lookup.audio.index).toHaveLength(3);
  expect(lookup.audio.index.every(row => !row.data)).toBe(true);
  expect((await store.getVideoByVideoId(identity.videoId)).chunks[0].subtitles[0].translation).toBe("你好");
  for (const index of [0, 1, 2])
    expect(new Uint8Array((await store.getAudio("legacy-session", index)).data)).toEqual(new Uint8Array([index, 9, 7]));
});
beforeEach(() => {
  globalThis.structuredClone = (value) => deserialize(serialize(value));
  store = new AsrCacheStore({ indexedDB: new IDBFactory() });
});
afterEach(async () => {
  await store.close();
  globalThis.structuredClone = originalClone;
});

test("aligned words survive persistence and a fresh cache connection", async () => {
  const words = [{ start: 0.1, end: 0.8, text: "hello" }];
  await store.putChunk(identity, signatures, block(0, 2, {
    segments: [{ start: 0, end: 2, text: "hello", words }],
  }));
  await store.close();
  const restored = new AsrCacheStore({ indexedDB: store.indexedDB });
  try {
    expect((await restored.getVideo(identity, signatures)).chunks[0].segments[0].words).toEqual(words);
  } finally { await restored.close(); }
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

test("getStats returns accurate subtitle and audio stats and deleteAudio clears video audio", async () => {
  await store.putChunk(identity, signatures, block(0, 1));
  await store.beginAudio("session-stats", identity);
  await store.putAudio("session-stats", segment(0));
  await store.putAudio("session-stats", segment(1));

  const stats = await store.getStats();
  expect(stats.subtitles.count).toBe(1);
  expect(stats.subtitles.bytes).toBeGreaterThan(0);
  expect(stats.audio.count).toBe(1);
  expect(stats.audio.bytes).toBe(6);

  await store.deleteAudio("session-stats");
  const statsAfter = await store.getStats();
  expect(statsAfter.audio.count).toBe(0);
  expect(statsAfter.audio.bytes).toBe(0);
  expect(statsAfter.subtitles.count).toBe(1);
});

test("audio cache evicts oldest video when audioVideoCountLimit is exceeded", async () => {
  store.audioVideoCountLimit = 2;
  const vid1 = { ...identity, videoId: "11111111111" };
  const vid2 = { ...identity, videoId: "22222222222" };
  const vid3 = { ...identity, videoId: "33333333333" };

  store.now = () => 1000;
  await store.beginAudio("sess-1", vid1);
  await store.putAudio("sess-1", segment(0));

  store.now = () => 2000;
  await store.beginAudio("sess-2", vid2);
  await store.putAudio("sess-2", segment(0));

  store.now = () => 3000;
  await store.putAudio("sess-1", segment(1));

  store.now = () => 4000;
  await store.beginAudio("sess-3", vid3);
  await store.putAudio("sess-3", segment(0));

  const remaining = await store.listAudioSessions();
  const remainingIds = remaining.map((s) => s.sessionId);
  expect(remainingIds).toContain("sess-1");
  expect(remainingIds).toContain("sess-3");
  expect(remainingIds).not.toContain("sess-2");
  expect(await store.listAudio("sess-2")).toEqual([]);
});

test("beginAudio allows safe takeover when documentId/tabId changes and reuses existing cache", async () => {
  const vid = { ...identity, videoId: "44444444444" };
  await store.beginAudio("sess-takeover", vid, {
    tabId: 1,
    documentId: "doc-1",
  });
  await store.putAudio("sess-takeover", segment(0));
  await store.putAudio("sess-takeover", segment(1));

  // Page reloaded or navigated in new tab/document:
  await expect(
    store.beginAudio("sess-takeover", vid, {
      tabId: 1,
      documentId: "doc-2",
    })
  ).resolves.not.toThrow();

  const cached = await store.listAudio("sess-takeover");
  expect(cached).toHaveLength(2);
});

test("beginAudio rejects an identity collision without deleting existing audio", async () => {
  const vidA = { ...identity, videoId: "55555555555", trackId: "en.1" };
  const vidB = { ...identity, videoId: "55555555555", trackId: "es.1" };
  await store.beginAudio("sess-mismatch", vidA);
  await store.putAudio("sess-mismatch", segment(0));
  expect(await store.listAudio("sess-mismatch")).toHaveLength(1);

  await expect(
    store.beginAudio("sess-mismatch", vidB)
  ).rejects.toMatchObject({ code: "AUDIO_IDENTITY_MISMATCH" });
  await expect(store.putAudio("sess-mismatch", segment(0))).resolves.toBe(false);
  expect(await store.listAudio("sess-mismatch")).toHaveLength(1);
  expect((await store.findAudioSession(vidA)).sessionId).toBe("sess-mismatch");
  expect(await store.findAudioSession(vidB)).toBeNull();
});

test("audio cache evicts oldest video when total audioLimit is exceeded by a new video", async () => {
  store.audioLimit = 8;
  store.audioVideoLimit = 5;

  const vid1 = { ...identity, videoId: "aaaaaaaaaaa" };
  const vid2 = { ...identity, videoId: "bbbbbbbbbbb" };
  const vid3 = { ...identity, videoId: "ccccccccccc" };

  store.now = () => 1000;
  await store.beginAudio("a", vid1);
  await store.putAudio("a", segment(0)); // 3 bytes

  store.now = () => 2000;
  await store.beginAudio("b", vid2);
  await store.putAudio("b", segment(0)); // 3 bytes, total = 6 <= 8

  store.now = () => 3000;
  await store.beginAudio("c", vid3);
  // vid3 putting 3 bytes would make total 9 > 8. vid1 (lastUsed 1000) is evicted.
  await expect(store.putAudio("c", segment(0))).resolves.toBe(true);

  expect(await store.listAudio("a")).toHaveLength(0);
  expect(await store.listAudio("b")).toHaveLength(1);
  expect(await store.listAudio("c")).toHaveLength(1);
});

test("audio cache eviction preserves active sessions in protectedSessionIds", async () => {
  store.audioLimit = 8;
  store.audioVideoLimit = 5;
  store.audioVideoCountLimit = 2;

  const vid1 = { ...identity, videoId: "active11111" };
  const vid2 = { ...identity, videoId: "idle2222222" };
  const vid3 = { ...identity, videoId: "incomin3333" };

  store.now = () => 1000;
  await store.beginAudio("sess-active", vid1);
  await store.putAudio("sess-active", segment(0));

  store.now = () => 2000;
  await store.beginAudio("sess-idle", vid2);
  await store.putAudio("sess-idle", segment(0));

  store.now = () => 3000;
  await store.beginAudio("sess-incoming", vid3);

  // sess-active is protected, so even though sess-active has older lastUsed (1000 < 2000),
  // sess-idle is evicted instead!
  await expect(
    store.putAudio("sess-incoming", segment(0), {
      protectedSessionIds: ["sess-active"],
    })
  ).resolves.toBe(true);

  expect(await store.listAudio("sess-active")).toHaveLength(1);
  expect(await store.listAudio("sess-idle")).toHaveLength(0);
  expect(await store.listAudio("sess-incoming")).toHaveLength(1);
});

test("getVideo with only { videoId } successfully retrieves cached video and its chunks", async () => {
  await store.putChunk(identity, signatures, block(0, 1));
  await store.putChunk(identity, signatures, block(1, 2));

  // 仅使用 videoId 查询缓存
  const result = await store.getVideo({ videoId: identity.videoId });
  expect(result).not.toBeNull();
  expect(result.identity).toEqual(identity);
  expect(result.chunks).toHaveLength(2);

  // 结合签名进行查询
  const withSig = await store.getVideo(
    { videoId: identity.videoId },
    signatures
  );
  expect(withSig).not.toBeNull();
  expect(withSig.identity).toEqual(identity);

  // 签名不匹配时应返回 null
  const mismatched = await store.getVideo(
    { videoId: identity.videoId },
    {
      recognition: "f".repeat(64),
      segmentation: "f".repeat(64),
      translation: "f".repeat(64),
    }
  );
  expect(mismatched).toBeNull();
});

test("getVideoByVideoId extracts identity from key if video.identity property is missing in store", async () => {
  const identity = {
    videoId: "legacy12345",
    trackId: "track1",
    mediaVersion: "v1",
    durationMs: 1000,
    sourceLanguage: "en",
  };
  const signatures = {
    recognition: "a".repeat(64),
    segmentation: "b".repeat(64),
    translation: "c".repeat(64),
  };
  await store.putChunk(identity, signatures, {
    startSample: 0,
    endSample: 16000,
    subtitles: [{ start: 0, end: 1000, text: "Hello", translation: "你好" }],
    stage: "translated",
    endOfMedia: true,
  });

  const key = mediaCacheKey(identity);
  await store.run(["videos"], "readwrite", async (s) => {
    const meta = await new Promise((resolve, reject) => {
      const req = s("videos").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    delete meta.identity;
    s("videos").put(meta);
  });

  const res = await store.getVideo(identity, signatures);
  expect(res).not.toBeNull();
  expect(res.identity.videoId).toBe("legacy12345");
  expect(res.chunks).toHaveLength(1);
});





test("audio lookup by video ID works without subtitle cache and respects full media identity", async () => {
  expect(await store.findAudioSession({ videoId: identity.videoId })).toBeNull();
  await store.beginAudio("legacy-audio", identity);
  await store.putAudio("legacy-audio", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1]).buffer });
  expect(await store.getVideo(identity, signatures)).toBeNull();
  expect(await store.findAudioSession({ videoId: identity.videoId })).toEqual({ sessionId: "legacy-audio", identity });
  expect(await store.findAudioSession({ ...identity, trackId: "ja.10" })).toBeNull();
  expect(await store.findAudioSession({ videoId: "bs7WQKv4_ZU" })).toBeNull();
});
