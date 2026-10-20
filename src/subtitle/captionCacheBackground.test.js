import { captionCacheBackend } from "./captionCacheBackground";

const id = "kSQknoHMFtk";
const sender = {
  id: "extension",
  frameId: 0,
  url: `https://www.youtube.com/watch?v=${id}`,
  tab: { id: 1 },
};
const options = {
  id: "extension",
  url: "chrome-extension://extension/options.html#/subtitle",
};
let browser, store, handle, limit, changed;
beforeEach(() => {
  browser = {
    runtime: {
      id: "extension",
      getURL: (path) => `chrome-extension://extension${path}`,
    },
    tabs: { get: jest.fn(async () => ({ url: sender.url })) },
    storage: {
      onChanged: {
        addListener: (fn) => {
          changed = fn;
        },
      },
    },
  };
  store = {
    lookup: jest.fn(async () => ({ entry: null, generation: 0 })),
    put: jest.fn(async () => true),
    clear: jest.fn(async () => {}),
    stats: jest.fn(async () => ({ bytes: 12, count: 1 })),
  };
  limit = 100;
  handle = captionCacheBackend(browser, async () => limit, store);
});
test("YouTube may read/write its current video; only the options page may clear or inspect totals", async () => {
  await handle({ action: "lookup", videoId: id }, sender);
  expect(store.lookup).toHaveBeenCalledWith(id, 100);
  await expect(handle({ action: "clear" }, sender)).rejects.toThrow(
    "CACHE_FORBIDDEN"
  );
  expect(await handle({ action: "clear" }, options)).toBe(true);
  expect(await handle({ action: "stats" }, options)).toEqual({
    bytes: 12,
    count: 1,
  });
});
test("navigation and untrusted senders cannot write unrelated video data", async () => {
  browser.tabs.get.mockResolvedValue({
    url: "https://www.youtube.com/watch?v=tll9E6YX3sk",
  });
  await expect(
    handle({ action: "put", entry: { videoId: id }, generation: 0 }, sender)
  ).rejects.toThrow("STALE_VIDEO");
  await expect(
    handle(
      { action: "lookup", videoId: id },
      { ...sender, url: "https://example.com" }
    )
  ).rejects.toThrow("CACHE_FORBIDDEN");
  expect(store.put).not.toHaveBeenCalled();
});
test("settings changes trim the count or clear disabled storage", async () => {
  limit = 0;
  changed({ kiss_translator_setting_v2: {} }, "local");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.clear).toHaveBeenCalled();
  limit = 5;
  changed({ kiss_translator_setting_v2: {} }, "local");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(store.stats).toHaveBeenCalledWith(5);
});
