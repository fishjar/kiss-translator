import { captionTrackId, parseTimedText } from "./youtubeCaptionSource";

const cueKey = ({ start, end, text }) => JSON.stringify([start, end, text]);

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export const captionCacheLimit = (value) =>
  Number.isInteger(value) && value >= 0 && value <= 1000 ? value : 100;

/** Extension-owned data only. One retained subtitle track per video, evicted by LRU. */
export class CaptionCacheStore {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
  }
  async open() {
    if (!this.database)
      this.database = new Promise((resolve, reject) => {
        const req = this.indexedDB.open("kiss-youtube-captions", 2);
        req.onupgradeneeded = () => {
          for (const name of ["videos", "meta", "index"]) {
            if (req.result.objectStoreNames.contains(name))
              req.result.deleteObjectStore(name);
            req.result.createObjectStore(
              name,
              name === "meta" ? undefined : { keyPath: "videoId" }
            );
          }
        };
        req.onsuccess = () => {
          req.result.onversionchange = () => {
            req.result.close();
            this.database = null;
          };
          resolve(req.result);
        };
        req.onerror = () => {
          this.database = null;
          reject(req.error);
        };
      });
    return this.database;
  }
  async run(fn) {
    const db = await this.open();
    const tx = db.transaction(["videos", "meta", "index"], "readwrite");
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error("CACHE_FAILED"));
    });
    try {
      const result = await fn(
        tx.objectStore("videos"),
        tx.objectStore("meta"),
        tx.objectStore("index")
      );
      await done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await done.catch(() => {});
      throw error;
    }
  }
  async trim(videos, index, limit) {
    const rows = (await request(index.getAll())).sort(
      (a, b) => b.lastUsed - a.lastUsed
    );
    let bytes = 0;
    rows.forEach((row, position) => {
      bytes += row.bytes;
      if (position >= limit || bytes > 200 * 1024 * 1024) {
        videos.delete(row.videoId);
        index.delete(row.videoId);
      }
    });
  }
  lookup(videoId, limit) {
    return this.run(async (videos, meta, index) => {
      await this.trim(videos, index, limit);
      const generation = (await request(meta.get("generation"))) || 0;
      const entry = limit ? await request(videos.get(videoId)) : undefined;
      if (entry)
        index.put({ videoId, bytes: entry.bytes, lastUsed: Date.now() });
      return { entry: entry || null, generation };
    });
  }
  put(input, generation, limit) {
    if (!limit) return Promise.resolve(false);
    if (!/^[\w-]{11}$/.test(input?.videoId || ""))
      throw new Error("INVALID_VIDEO");
    const track = Object.fromEntries(
      ["vssId", "languageCode", "kind", "name"]
        .filter((key) => input.track?.[key] !== undefined)
        .map((key) => [key, input.track[key]])
    );
    if (typeof track.languageCode !== "string")
      throw new Error("INVALID_TRACK");
    const events = parseTimedText(JSON.stringify({ events: input.events }));
    const serializedEvents = JSON.stringify(events);
    const cues = input.bilingual?.cues?.map(
      ({ start, end, text, translation }) => {
        if (
          !Number.isFinite(start) ||
          start < 0 ||
          !Number.isFinite(end) ||
          end <= start ||
          typeof text !== "string" ||
          (translation !== undefined && typeof translation !== "string")
        )
          throw new Error("INVALID_CUE");
        return { start, end, text, translation: translation || "" };
      }
    );
    const entry = {
      videoId: input.videoId,
      track,
      trackKey: captionTrackId(track),
      events,
      fullDescription: String(input.fullDescription || "").slice(0, 100000),
      ...(cues?.length && {
        bilingual: {
          segmentationSignature: input.bilingual.segmentationSignature,
          translationSignature: input.bilingual.translationSignature,
          toLang: input.bilingual.toLang,
          complete: input.bilingual.complete === true,
          cues,
        },
      }),
      lastUsed: Date.now(),
    };
    return this.run(async (videos, meta, index) => {
      if (((await request(meta.get("generation"))) || 0) !== generation)
        return false;
      const previous = await request(videos.get(entry.videoId));
      if (
        previous?.trackKey === entry.trackKey &&
        previous.events.length === events.length &&
        previous.events[0]?.tStartMs === events[0]?.tStartMs &&
        previous.events[0]?.dDurationMs === events[0]?.dDurationMs &&
        previous.events.at(-1)?.tStartMs === events.at(-1)?.tStartMs &&
        previous.events.at(-1)?.dDurationMs === events.at(-1)?.dDurationMs &&
        JSON.stringify(previous.events) === serializedEvents
      ) {
        const old = previous.bilingual;
        const next = entry.bilingual;
        if (!next) entry.bilingual = old;
        else if (
          old?.segmentationSignature === next.segmentationSignature &&
          old.translationSignature === next.translationSignature
        ) {
          const oldCues = new Map(old.cues.map((cue) => [cueKey(cue), cue]));
          next.cues = next.cues.map((cue) => ({
            ...cue,
            translation:
              cue.translation || oldCues.get(cueKey(cue))?.translation || "",
          }));
          if (!next.complete) {
            const updates = new Map(next.cues.map((cue) => [cueKey(cue), cue]));
            if (old.complete) {
              next.cues = old.cues.map(
                (cue) => updates.get(cueKey(cue)) || cue
              );
              next.complete = true;
            } else {
              next.cues.push(
                ...old.cues.filter(
                  (cue) =>
                    !next.cues.some(
                      (update) =>
                        update.start < cue.end && update.end > cue.start
                    )
                )
              );
            }
          }
          next.cues.sort((a, b) => a.start - b.start);
        }
      }
      entry.bytes = new Blob([JSON.stringify(entry)]).size;
      if (entry.bytes > 8 * 1024 * 1024) return false;
      videos.put(entry);
      index.put({
        videoId: entry.videoId,
        bytes: entry.bytes,
        lastUsed: entry.lastUsed,
      });
      await this.trim(videos, index, limit);
      return true;
    });
  }
  clear() {
    return this.run(async (videos, meta, index) => {
      const generation = (await request(meta.get("generation"))) || 0;
      videos.clear();
      index.clear();
      meta.put(generation + 1, "generation");
    });
  }
  stats(limit) {
    return this.run(async (videos, meta, index) => {
      await this.trim(videos, index, limit);
      const rows = await request(index.getAll());
      return {
        count: rows.length,
        bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
      };
    });
  }
  async close() {
    if (this.database) (await this.database).close();
    this.database = null;
  }
}
