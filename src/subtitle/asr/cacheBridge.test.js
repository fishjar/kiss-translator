import { Blob as NodeBlob } from "buffer";
import { deserialize, serialize } from "v8";
import { IDBFactory } from "fake-indexeddb";
import { AsrCacheStore } from "./cacheStore";
import { AsrCacheClient, ASR_CACHE_PORT } from "./cacheBridge";
import { installAsrCacheBackend } from "./cacheBackground";
import { AudioDownloadManager } from "./downloadManager";
import { AsrVideoSession } from "./videoSession";
import { webcrypto } from "crypto";
import { TextEncoder } from "util";

jest.mock("../../libs/browser", () => ({ browser: { runtime: {} } }));
const event = () => {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    emit: (...args) => [...listeners].forEach((fn) => fn(...args)),
  };
};
function bus(
  sender = {
    id: "extension",
    frameId: 0,
    documentId: "document",
    tab: { id: 1 },
    url: "https://www.youtube.com/watch?v=kSQknoHMFtk",
  }
) {
  const connections = [];
  const browser = {
    runtime: {
      id: "extension",
      getURL: (path) => `chrome-extension://extension${path}`,
      onConnect: event(),
      onStartup: event(),
    },
    tabs: { get: jest.fn(async () => ({ url: sender.url })) },
  };
  browser.runtime.connect = ({ name }) => {
    let closed = false;
    const client = { name, onMessage: event(), onDisconnect: event() };
    const server = { name, sender: { ...sender }, onMessage: event(), onDisconnect: event() };
    client.postMessage = (data) => {
      if (closed) throw Error("disconnected");
      setTimeout(() => {
        if (!closed) server.onMessage.emit(data);
      }, 0);
    };
    server.postMessage = (data) => {
      if (closed) throw Error("disconnected");
      setTimeout(() => {
        if (!closed) client.onMessage.emit(data);
      }, 0);
    };
    client.disconnect = server.disconnect = () => {
      if (closed) return;
      closed = true;
      client.onDisconnect.emit();
      server.onDisconnect.emit();
    };
    connections.push({ client, server });
    setTimeout(() => browser.runtime.onConnect.emit(server), 0);
    return client;
  };
  return { browser, connections };
}
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
const chunk = {
  startSample: 0,
  endSample: 32000,
  stage: "translated",
  segments: [{
    start: 0, end: 2, text: "hello",
    words: [{ start: 0.1, end: 0.8, text: "hello" }],
  }],
  subtitles: [{ start: 0, end: 2000, text: "hello", translation: "你好" }],
};
const originals = {
  Blob: globalThis.Blob,
  structuredClone: globalThis.structuredClone,
};
let store, client, remove;
beforeEach(() => {
  globalThis.Blob = NodeBlob;
  globalThis.structuredClone = (value) => deserialize(serialize(value));
  store = new AsrCacheStore({ indexedDB: new IDBFactory() });
});
afterEach(async () => {
  client?.close();
  remove?.();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await store.close();
  globalThis.Blob = originals.Blob;
  globalThis.structuredClone = originals.structuredClone;
});

test("metadata queries do not read or transfer cached subtitle chunks", async () => {
  await store.putChunk(identity, signatures, chunk);
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  const fullRead = jest.spyOn(store, "getVideo");
  const onChunk = jest.fn();
  expect(await client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true, onChunk })).toEqual({ identity });
  expect(await client.getVideo(identity, { ...signatures, recognition: "d".repeat(64) }, { metadataOnly: true })).toBeNull();
  expect(fullRead).not.toHaveBeenCalled();
  expect(onChunk).not.toHaveBeenCalled();
  fullRead.mockRestore();
});

test("cache handshake does not wait for settings or orphan cleanup", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: () => new Promise(() => {}) });
  client = new AsrCacheClient(browser.runtime);
  expect(await client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true })).toBeNull();
});

test("old audio release never reopens the cache port after entering a session-only page", async () => {
  const { browser, connections } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("previous-video", identity);
  client.disconnect(new DOMException("Session-only page", "AbortError"));
  await client.releaseAudio("previous-video");
  expect(connections).toHaveLength(1);
  expect(client.port).toBeUndefined();
  await client.lookupCache({ videoId: identity.videoId });
  expect(connections).toHaveLength(2);
});

test("a missing ready response fails promptly and a fresh connection can retry", async () => {
  const { browser } = bus();
  client = new AsrCacheClient(browser.runtime);
  await expect(client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true }))
    .rejects.toHaveProperty("code", "CACHE_CONNECTION_TIMEOUT");
  expect(client.ready).toBeUndefined();
  remove = installAsrCacheBackend(browser, store);
  expect(await client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true })).toBeNull();
});

test("abort while connecting releases the queue immediately and permits a fresh query", async () => {
  const { browser } = bus();
  client = new AsrCacheClient(browser.runtime);
  const controller = new AbortController();
  const pending = client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true, signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(client.ready).toBeUndefined();
  remove = installAsrCacheBackend(browser, store);
  expect(await client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true })).toBeNull();
});

test("a stalled metadata query times out as cache failure and releases the old port", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  const read = jest.spyOn(store, "getVideoMetadata").mockImplementation(() => new Promise(() => {}));
  client = new AsrCacheClient(browser.runtime);
  await expect(client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true }))
    .rejects.toHaveProperty("code", "CACHE_TIMEOUT");
  expect(client.port).toBeUndefined();
  read.mockRestore();
  expect(await client.getVideo({ videoId: identity.videoId }, undefined, { metadataOnly: true })).toBeNull();
});

test("extension-owned cache streams subtitle chunks, transfers binary segments with acknowledgements and cleans up on disconnect", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 0 });
  client = new AsrCacheClient(browser.runtime);
  await client.putChunk(identity, signatures, chunk);
  const onChunk = jest.fn();
  expect(
    (await client.getVideo(identity, signatures, { onChunk })).translation
      .complete
  ).toBe(true);
  expect(onChunk).toHaveBeenCalledWith(
    expect.objectContaining({
      ...chunk,
      timingSource: "asr",
      segments: chunk.segments.map((cue) => ({ ...cue, timingSource: "asr" })),
      subtitles: chunk.subtitles.map((cue) => ({
        ...cue,
        timingSource: "asr",
      })),
    })
  );
  await client.beginAudio("session", identity);
  const data = new Uint8Array([1, 2, 3]).buffer;
  await client.putAudio("session", { index: 0, startMs: 0, endMs: 0, data });
  expect(await client.listAudio("session")).toHaveLength(1);
  expect(new Uint8Array((await client.getAudio("session", 0)).data)).toEqual(
    new Uint8Array([1, 2, 3])
  );
  client.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await store.listAudioSessions()).toEqual([]);
  expect(
    (await store.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
});

test("cancelled streaming reads release the protocol slot so another cache request can complete", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.putChunk(identity, signatures, chunk);
  const controller = new AbortController();
  const read = client.getVideo(identity, signatures, {
    signal: controller.signal,
    onChunk: () => controller.abort(),
  });
  await expect(read).rejects.toHaveProperty("name", "AbortError");
  expect(
    (await client.getVideo(identity, signatures)).recognition.complete
  ).toBe(true);
});

test("subframes and other sites cannot open the cache port; navigation cannot write the old video's cache", async () => {
  const { browser } = bus({
    id: "extension",
    frameId: 1,
    url: "https://www.youtube.com/watch?v=kSQknoHMFtk",
    tab: { id: 1 },
  });
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await expect(client.getVideo(identity, signatures)).rejects.toHaveProperty(
    "code",
    "CACHE_DISCONNECTED"
  );
  remove();
  const next = bus();
  remove = installAsrCacheBackend(next.browser, store);
  client = new AsrCacheClient(next.browser.runtime);
  next.browser.tabs.get.mockResolvedValue({
    url: "https://www.youtube.com/watch?v=bs7WQKv4_ZU",
  });
  await expect(
    client.putChunk(identity, signatures, chunk)
  ).rejects.toHaveProperty("code", "STALE_VIDEO");
  expect(await store.getVideo(identity, signatures)).toBeNull();
});

test("clearing all subtitles is restricted to the extension options page", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.putChunk(identity, signatures, chunk);
  await expect(client.clearSubtitles()).rejects.toHaveProperty(
    "code",
    "CACHE_ACCESS_DENIED"
  );
  client.close();
  remove();
  const options = bus({
    id: "extension",
    frameId: 0,
    url: "chrome-extension://extension/options.html",
  });
  remove = installAsrCacheBackend(options.browser, store);
  client = new AsrCacheClient(options.browser.runtime);
  await client.clearSubtitles();
  expect(await store.getVideo(identity, signatures)).toBeNull();
  expect(ASR_CACHE_PORT).toBe("kiss-youtube-asr-cache-v1");
});

test("SPA navigation may remove its own temporary audio but cannot read it or change old subtitles", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("old-audio", identity);
  browser.tabs.get.mockResolvedValue({
    url: "https://www.youtube.com/watch?v=bs7WQKv4_ZU",
  });
  await expect(client.listAudio("old-audio")).rejects.toHaveProperty(
    "code",
    "STALE_VIDEO"
  );
  await client.removeAudio("old-audio");
  expect(await store.listAudioSessions()).toEqual([]);
});

test("background restart clears orphan audio while retaining saved captions", async () => {
  await store.beginAudio("orphan", identity, {
    tabId: 1,
    documentId: "document",
  });
  await store.putChunk(identity, signatures, chunk);
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 0 });
  client = new AsrCacheClient(browser.runtime);
  expect(
    (await client.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
  expect(await store.listAudioSessions()).toEqual([]);
});

test("options page can query cache stats and clear audio cache", async () => {
  await store.putChunk(identity, signatures, chunk);
  await store.beginAudio("audio-1", identity);
  await store.putAudio("audio-1", {
    index: 0,
    startMs: 0,
    endMs: 0,
    data: new Uint8Array([1, 2, 3]).buffer,
  });

  const options = bus({
    id: "extension",
    frameId: 0,
    url: "chrome-extension://extension/options.html",
  });
  remove = installAsrCacheBackend(options.browser, store, {
    getAudioCacheLimit: async () => 100,
  });
  client = new AsrCacheClient(options.browser.runtime);

  const stats = await client.getStats();
  expect(stats.subtitles.count).toBe(1);
  expect(stats.subtitles.bytes).toBeGreaterThan(0);
  expect(stats.audio.count).toBe(1);
  expect(stats.audio.bytes).toBe(3);

  await client.clearAudio();
  expect(await store.listAudioSessions()).toEqual([]);
  const statsAfter = await client.getStats();
  expect(statsAfter.audio.count).toBe(0);
  expect(statsAfter.audio.bytes).toBe(0);
  expect(statsAfter.subtitles.count).toBe(1);
});

test("video page can delete its audio cache via deleteAudio", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);

  await client.beginAudio("vid-audio", identity);
  await client.putAudio("vid-audio", {
    index: 0,
    startMs: 0,
    endMs: 0,
    data: new Uint8Array([1, 2, 3]).buffer,
  });
  expect(await store.listAudioSessions()).toHaveLength(1);

  await client.deleteAudio("vid-audio", identity);
  expect(await store.listAudioSessions()).toEqual([]);
});

test("audio sessions are retained across disconnect and restart when audioCacheLimit > 0", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, {
    getAudioCacheLimit: async () => 100,
  });
  client = new AsrCacheClient(browser.runtime);

  await client.beginAudio("persist-session", identity);
  await client.putAudio("persist-session", {
    index: 0,
    startMs: 0,
    endMs: 0,
    data: new Uint8Array([1, 2, 3]).buffer,
  });

  client.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(await store.listAudioSessions()).toHaveLength(1);

  remove();
  const next = bus();
  remove = installAsrCacheBackend(next.browser, store, {
    getAudioCacheLimit: async () => 100,
  });
  const nextClient = new AsrCacheClient(next.browser.runtime);
  expect(await store.listAudioSessions()).toHaveLength(1);
  nextClient.close();
});

test.each(["connect", "startup", "release", "disconnect"])("settings read failure during %s preserves audio and text", async (stage) => {
  await store.beginAudio("saved-audio", identity);
  await store.putAudio("saved-audio", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1]).buffer });
  await store.putChunk(identity, signatures, chunk);
  const { browser } = bus();
  const getAudioCacheLimit = jest.fn(async () => { throw Error("settings unavailable"); });
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit });
  client = new AsrCacheClient(browser.runtime);
  await client.connect();
  if (stage === "startup") browser.runtime.onStartup.emit();
  if (stage === "release" || stage === "disconnect") {
    await client.beginAudio("saved-audio", identity);
    if (stage === "release") await client.releaseAudio("saved-audio");
    else client.close();
  }
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(getAudioCacheLimit).toHaveBeenCalled();
  expect(await store.listAudio("saved-audio")).toHaveLength(1);
  expect((await store.getVideo(identity, signatures)).translation.complete).toBe(true);
});

test("writes use the last valid count limit when settings temporarily fail", async () => {
  const { browser } = bus();
  let unavailable = false;
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => {
    if (unavailable) throw Error("settings unavailable");
    return 3;
  } });
  const put = jest.spyOn(store, "putAudio");
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("saved-audio", identity);
  unavailable = true;
  await client.putAudio("saved-audio", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1]).buffer });
  expect(put).toHaveBeenCalledWith("saved-audio", expect.anything(), expect.objectContaining({ audioVideoCountLimit: 3 }));
  put.mockRestore();
});

test("missing settings use the default write limit without deleting persisted audio", async () => {
  await store.beginAudio("existing", identity);
  await store.putAudio("existing", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([9]).buffer });
  const { browser } = bus();
  const put = jest.spyOn(store, "putAudio");
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("existing", identity);
  await client.putAudio("existing", { index: 1, startMs: 0, endMs: 1000, data: new Uint8Array([8]).buffer });
  expect(put).toHaveBeenCalledWith("existing", expect.anything(), expect.objectContaining({ audioVideoCountLimit: 100 }));
  expect(await store.listAudio("existing")).toHaveLength(2);
  put.mockRestore();
});

test("startup cleanup with caching disabled preserves audio held by a live page", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 0 });
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("live-audio", identity);
  await client.putAudio("live-audio", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1]).buffer });
  browser.runtime.onStartup.emit();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(await client.getAudio("live-audio", 0)).toBeTruthy();
  await client.releaseAudio("live-audio");
  expect(await store.listAudioSessions()).toHaveLength(0);
});

test.each([false, true])("new backend/client/database restore persistent audio, partial=%s", async (partial) => {
  const factory = store.indexedDB;
  const name = store.name;
  const audioPart = index => ({ index, startMs: index ? (index - 1) * 1000 : 0, endMs: index * 1000, data: new Uint8Array([index, 7]).buffer });
  const first = bus();
  remove = installAsrCacheBackend(first.browser, store, { getAudioCacheLimit: async () => 100 });
  client = new AsrCacheClient(first.browser.runtime);
  await client.putChunk(identity, signatures, chunk);
  await client.beginAudio("legacy-persistent", identity);
  for (const index of partial ? [0, 1] : [0, 1, 2]) await client.putAudio("legacy-persistent", audioPart(index));
  client.close();
  await new Promise(resolve => setTimeout(resolve, 20));
  remove();
  await store.close();
  store = new AsrCacheStore({ name, indexedDB: factory });
  const next = bus();
  remove = installAsrCacheBackend(next.browser, store, { getAudioCacheLimit: async () => 100 });
  client = new AsrCacheClient(next.browser.runtime);
  const bridge = {
    open: jest.fn(async () => ({ identity })), clear: jest.fn(),
    next: jest.fn(async () => ({ segments: [audioPart(2)], expectedSegments: 2, expectedEndMs: 2000 })),
  };
  const manager = new AudioDownloadManager({ identity, bridge, cache: client });
  try {
    await manager.acquire("asr").ready;
    expect(manager.sessionId).toBe("legacy-persistent");
    if (partial) expect(bridge.open).toHaveBeenCalledWith(identity.videoId, "legacy-persistent", 1000, expect.anything());
    else expect(bridge.open).not.toHaveBeenCalled();
    let index = 0;
    for await (const part of manager.segmentsFor()) {
      expect(new Uint8Array(part.data)).toEqual(new Uint8Array([index++, 7]));
    }
    expect(index).toBe(3);
    expect((await client.getVideo(identity, signatures)).translation.complete).toBe(true);
  } finally {
    await manager.dispose();
  }
});

test("disconnecting during beginAudio does not delete an existing persistent session", async () => {
  await store.beginAudio("existing", identity);
  await store.putAudio("existing", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([9]).buffer });
  const original = store.beginAudio.bind(store);
  let finish;
  const begin = jest.spyOn(store, "beginAudio").mockImplementation(async (...args) => {
    const result = await original(...args);
    await new Promise(resolve => { finish = resolve; });
    return result;
  });
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 100 });
  client = new AsrCacheClient(browser.runtime);
  const pending = client.beginAudio("existing", identity);
  const rejected = expect(pending).rejects.toHaveProperty("code", "CACHE_CLOSED");
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  client.close();
  finish();
  await rejected;
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(await store.listAudio("existing")).toHaveLength(1);
  begin.mockRestore();
});

test.each([0, 100])("cancelled new audio sessions are removed only when caching is explicitly disabled (%s)", async limit => {
  const original = store.beginAudio.bind(store);
  let finish;
  const begin = jest.spyOn(store, "beginAudio").mockImplementation(async (...args) => {
    const result = await original(...args);
    await new Promise(resolve => { finish = resolve; });
    return result;
  });
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => limit });
  client = new AsrCacheClient(browser.runtime);
  const pending = client.beginAudio("new-session", identity);
  const rejected = expect(pending).rejects.toHaveProperty("code", "CACHE_CLOSED");
  while (!finish) await new Promise(resolve => setTimeout(resolve, 1));
  client.close();
  finish();
  await rejected;
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(await store.listAudioSessions()).toHaveLength(limit ? 1 : 0);
  begin.mockRestore();
});

test("releaseAudio unprotects old session allowing in-page navigation to evict old videos under limit", async () => {
  const env = bus();
  remove = installAsrCacheBackend(env.browser, store, {
    getAudioCacheLimit: async () => 1,
  });
  client = new AsrCacheClient(env.browser.runtime);

  const vid1 = { ...identity, videoId: "11111111111" };
  const vid2 = { ...identity, videoId: "22222222222" };
  const seg = { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1, 2, 3]).buffer };

  env.browser.tabs.get.mockImplementation(async () => ({
    url: "https://www.youtube.com/watch?v=11111111111",
  }));
  await client.beginAudio("sess-1", vid1);
  await client.putAudio("sess-1", seg);
  expect(await store.listAudioSessions()).toHaveLength(1);

  // Video 1 ends and is released (e.g. YouTube in-page navigation):
  await client.releaseAudio("sess-1");

  // In the same tab (port), user navigates to Video 2:
  env.browser.tabs.get.mockImplementation(async () => ({
    url: "https://www.youtube.com/watch?v=22222222222",
  }));
  await client.beginAudio("sess-2", vid2);
  await client.putAudio("sess-2", seg);

  // Video 1 was unprotected, so when count limit is 1, Video 1 is evicted!
  const remaining = await store.listAudioSessions();
  expect(remaining).toHaveLength(1);
  expect(remaining[0].sessionId).toBe("sess-2");
});

test("when audioCacheLimit=0, closing one tab does not destroy shared audio for another active tab", async () => {
  const env = bus();
  remove = installAsrCacheBackend(env.browser, store, {
    getAudioCacheLimit: async () => 0,
  });
  const client1 = new AsrCacheClient(env.browser.runtime);
  const client2 = new AsrCacheClient(env.browser.runtime);

  const sharedSession = "audio-shared-kSQknoHMFtk";
  const seg = { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1, 2, 3]).buffer };

  await client1.beginAudio(sharedSession, identity);
  await client2.beginAudio(sharedSession, identity);

  await client1.putAudio(sharedSession, seg);
  expect(await store.listAudioSessions()).toHaveLength(1);

  // Tab 1 closes or calls releaseAudio:
  await client1.releaseAudio(sharedSession);
  client1.close();
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Because client 2 is still active on sharedSession, audio is NOT deleted:
  expect(await store.listAudioSessions()).toHaveLength(1);
  const audio = await client2.getAudio(sharedSession, 0);
  expect(audio).not.toBeNull();

  // Tab 2 now releases and closes:
  await client2.releaseAudio(sharedSession);
  client2.close();
  await new Promise((resolve) => setTimeout(resolve, 20));

  // All users left: temporary audio is cleanly deleted!
  expect(await store.listAudioSessions()).toHaveLength(0);
});

test("a delayed release preserves audio reacquired while settings are loading", async () => {
  const { browser } = bus();
  const getAudioCacheLimit = jest.fn(async () => 0);
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit });
  client = new AsrCacheClient(browser.runtime);
  const next = new AsrCacheClient(browser.runtime);
  let finishSettings;
  try {
    await next.connect();
    await client.beginAudio("shared-release", identity);
    await client.putAudio("shared-release", {
      index: 0, startMs: 0, endMs: 0, data: new Uint8Array([7]).buffer,
    });
    getAudioCacheLimit.mockImplementationOnce(() => new Promise(resolve => {
      finishSettings = resolve;
    }));
    const releasing = client.releaseAudio("shared-release");
    while (!finishSettings) await new Promise(resolve => setTimeout(resolve, 1));
    await next.beginAudio("shared-release", identity);
    finishSettings(0);
    await releasing;
    const audio = await next.getAudio("shared-release", 0);
    expect(audio).not.toBeNull();
    expect(new Uint8Array(audio.data)).toEqual(new Uint8Array([7]));
    await next.releaseAudio("shared-release");
    expect(await store.listAudioSessions()).toHaveLength(0);
  } finally {
    finishSettings?.(0);
    next.close();
  }
});

test("reacquiring audio waits for an already-started deletion", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 0 });
  client = new AsrCacheClient(browser.runtime);
  const next = new AsrCacheClient(browser.runtime);
  const original = store.removeAudio.bind(store);
  const beginAudio = store.beginAudio.bind(store);
  const operations = [];
  let finishDeletion;
  const deleting = jest.spyOn(store, "removeAudio").mockImplementationOnce(async id => {
    await new Promise(resolve => { finishDeletion = resolve; });
    operations.push("delete");
    return original(id);
  });
  const beginning = jest.spyOn(store, "beginAudio");
  try {
    await next.connect();
    await client.beginAudio("shared-deletion", identity);
    beginning.mockImplementation((...args) => {
      operations.push("begin");
      return beginAudio(...args);
    });
    const releasing = client.releaseAudio("shared-deletion");
    while (!finishDeletion) await new Promise(resolve => setTimeout(resolve, 1));
    let acquired = false;
    const acquiring = next.beginAudio("shared-deletion", identity).then(() => { acquired = true; });
    while (browser.tabs.get.mock.calls.length < 2)
      await new Promise(resolve => setTimeout(resolve, 1));
    await new Promise(resolve => setTimeout(resolve, 1));
    expect(acquired).toBe(false);
    finishDeletion();
    await Promise.all([releasing, acquiring]);
    expect(operations).toEqual(["delete", "begin"]);
    await next.putAudio("shared-deletion", {
      index: 0, startMs: 0, endMs: 0, data: new Uint8Array([8]).buffer,
    });
    expect(await next.getAudio("shared-deletion", 0)).not.toBeNull();
    await next.releaseAudio("shared-deletion");
    expect(await store.listAudioSessions()).toHaveLength(0);
  } finally {
    finishDeletion?.();
    deleting.mockRestore();
    beginning.mockRestore();
    next.close();
  }
});

test("client can query and delete video subtitles using only { videoId } through cache backend", async () => {
  const env = bus();
  remove = installAsrCacheBackend(env.browser, store);
  const client = new AsrCacheClient(env.browser.runtime);

  const block = {
    startSample: 0,
    endSample: 16000,
    stage: "translated",
    subtitles: [{ start: 0, end: 1000, text: "Hello", translation: "你好" }],
    silent: false,
    timingSource: "asr",
  };
  const signatures = {
    recognition: "a".repeat(64),
    segmentation: "b".repeat(64),
    translation: "c".repeat(64),
  };

  await client.putChunk(identity, signatures, block);

  // Query using only videoId
  const result = await client.getVideo({ videoId: identity.videoId });
  expect(result).not.toBeNull();
  expect(result.identity).toEqual(identity);
  expect(result.chunks).toHaveLength(1);

  // Delete using only videoId
  await client.deleteVideo({ videoId: identity.videoId });
  const afterDelete = await client.getVideo({ videoId: identity.videoId });
  expect(afterDelete).toBeNull();
  client.close();
});




test("audio session lookup crosses the bridge independently of subtitle cache and rejects stale videos", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  await client.beginAudio("audio-only", identity);
  await client.putAudio("audio-only", { index: 0, startMs: 0, endMs: 0, data: new Uint8Array([1]).buffer });
  expect(await client.findAudioSession({ videoId: identity.videoId })).toEqual({ sessionId: "audio-only", identity });
  await expect(client.findAudioSession({ videoId: "bs7WQKv4_ZU" })).rejects.toHaveProperty("code", "STALE_VIDEO");
});


test.each([false, true])("clearing audio rebuilds real bridge/download sessions, in-flight=%s", async inFlight => {
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder;
  const sender = { id: "extension", frameId: 0, tab: { id: 1 }, url: `https://www.youtube.com/watch?v=${identity.videoId}` };
  const { browser } = bus(sender);
  browser.tabs.get.mockResolvedValue({ url: sender.url });
  remove = installAsrCacheBackend(browser, store, { getAudioCacheLimit: async () => 100 });
  client = new AsrCacheClient(browser.runtime);
  const second = new AsrCacheClient(browser.runtime);
  const sessions = [], resets = [];
  const begin = jest.spyOn(store, "beginAudio");
  const part = index => ({ index, startMs: index ? (index - 1) * 1000 : 0, endMs: index * 1000, data: new Uint8Array([index, 7]).buffer });
  const bridges = [];
  for (const cache of [client, second]) {
    let calls = 0;
    const bridge = {
      open: jest.fn(async () => ({ identity })), clear: jest.fn(),
      next: jest.fn(async (_, __, signal) => {
        if (inFlight && calls++ === 0) return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
        return { segments: [part(0), part(1), part(2)], expectedSegments: 2, expectedEndMs: 2000 };
      }),
    };
    bridges.push(bridge);
    const session = new AsrVideoSession({
      identity, cache, bridge, setting: { audioCacheLimit: 100, toLang: "zh-CN" },
      asrService: { apiSlug: "asr" }, signatures,
      textProcessor: {}, getLimits: async () => ({}),
    });
    await cache.putChunk(identity, signatures, chunk);
    await session.start();
    cache.onAudioCacheCleared = () => resets.push(session.resetAudio());
    sessions.push(session);
  }
  const optionsSender = { id: "extension", url: "chrome-extension://extension/options.html" };
  const waitUntil = async predicate => {
    for (let i = 0; i < 500; i++) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    throw Error("audio reset did not settle");
  };
  let options;
  try {
    const leases = sessions.map(session => session.ensureDownload().acquire("export"));
    if (inFlight) await waitUntil(() => bridges.every(bridge => bridge.next.mock.calls.length > 0));
    else await Promise.all(leases.map(lease => lease.ready));
    const oldDownloads = sessions.map(session => session.download);
    Object.assign(sender, optionsSender);
    options = new AsrCacheClient(browser.runtime);
    await options.clearAudio();
    await waitUntil(() => resets.length === 2);
    await Promise.all(resets);
    expect(oldDownloads.every(download => download.disposed && download.memory.bytes === 0)).toBe(true);
    expect(sessions.every(session => !session.cacheFailed && !session.download)).toBe(true);
    const next = sessions.map(session => session.ensureDownload().acquire("new-export"));
    await Promise.all(next.map(lease => lease.ready));
    expect(begin.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(await store.listAudio(sessions[0].download.sessionId)).toHaveLength(3);
    expect(sessions.every(session => !session.download.memoryOnly)).toBe(true);
    await sessions[0].saveBlock(chunk);
    expect((await client.getVideo(identity, signatures)).translation.complete).toBe(true);
    // Deleting from a video page also replaces the old binding before the next export.
    const old = sessions[0].download;
    await sessions[0].resetAudio(() => client.deleteAudio(old.sessionId, identity));
    expect(old.disposed).toBe(true);
    const fresh = sessions[0].ensureDownload();
    await fresh.acquire("after-delete").ready;
    expect(fresh).not.toBe(old);
    expect(fresh.memoryOnly).toBe(false);
    expect(await store.listAudio(fresh.sessionId)).toHaveLength(3);
  } finally {
    await Promise.all(sessions.map(session => session.dispose()));
    second.close();
    options?.close();
    begin.mockRestore();
  }
});
