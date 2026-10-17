import { Blob as NodeBlob } from "buffer";
import { deserialize, serialize } from "v8";
import { IDBFactory } from "fake-indexeddb";
import { AsrCacheStore } from "./cacheStore";
import { AsrCacheClient, ASR_CACHE_PORT } from "./cacheBridge";
import { installAsrCacheBackend } from "./cacheBackground";

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
    const server = { name, sender, onMessage: event(), onDisconnect: event() };
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
  segments: [{ start: 0, end: 2, text: "hello" }],
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

test("extension-owned cache streams subtitle chunks, transfers binary segments with acknowledgements and cleans up on disconnect", async () => {
  const { browser } = bus();
  remove = installAsrCacheBackend(browser, store);
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
  remove = installAsrCacheBackend(browser, store);
  client = new AsrCacheClient(browser.runtime);
  expect(
    (await client.getVideo(identity, signatures)).translation.complete
  ).toBe(true);
  expect(await store.listAudioSessions()).toEqual([]);
});
