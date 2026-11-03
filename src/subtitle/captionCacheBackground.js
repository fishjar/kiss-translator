import { CaptionCacheStore, captionCacheLimit } from "./captionCacheStore";
import { youtubeVideoId } from "./youtubeCaptionSource";

export function captionCacheBackend(
  browser,
  getLimit,
  store = new CaptionCacheStore()
) {
  browser.storage.onChanged?.addListener((changes, area) => {
    if (
      area === "local" &&
      Object.keys(changes).some((key) => /setting/i.test(key))
    )
      void getLimit()
        .then(captionCacheLimit)
        .then((limit) => (limit === 0 ? store.clear() : store.stats(limit)))
        .catch(() => {});
  });
  return async ({ action, videoId, entry, generation } = {}, sender) => {
    const root = browser.runtime.getURL("/");
    const options =
      sender?.id === browser.runtime.id &&
      sender.url?.startsWith(root) &&
      new URL(sender.url).pathname === "/options.html";
    if (!options) {
      const source = new URL(sender?.url || "about:blank");
      if (
        sender?.id !== browser.runtime.id ||
        sender.frameId !== 0 ||
        source.origin !== "https://www.youtube.com"
      )
        throw new Error("CACHE_FORBIDDEN");
      if (!["lookup", "put"].includes(action))
        throw new Error("CACHE_FORBIDDEN");
      const id = videoId || entry?.videoId;
      const tab = await browser.tabs.get(sender.tab.id);
      if (
        !/^[\w-]{11}$/.test(id || "") ||
        new URL(tab.url).origin !== "https://www.youtube.com" ||
        youtubeVideoId(tab.url) !== id
      )
        throw new Error("STALE_VIDEO");
    }
    const limit = captionCacheLimit(await getLimit());
    if (action === "lookup") return store.lookup(videoId, limit);
    if (action === "put") return store.put(entry, generation, limit);
    if (action === "clear") return store.clear().then(() => true);
    if (action === "stats") return store.stats(limit);
    throw new Error("INVALID_CACHE_ACTION");
  };
}
