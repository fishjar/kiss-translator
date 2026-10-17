import { coverageProgress } from "./coverage";
import { ASR_SAMPLE_RATE } from "./audioChunks";

export const SUBTITLE_CACHE_LIMIT = 200 * 1024 * 1024;
export const AUDIO_VIDEO_LIMIT = 512 * 1024 * 1024;
export const AUDIO_CACHE_LIMIT = 1024 * 1024 * 1024;
export const ASR_CACHE_VERSION = 1;
const fail = (code) => Object.assign(new Error(code), { code });
const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const bytesOf = (value) => new Blob([JSON.stringify(value)]).size;
const arrayBufferSize = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength"
).get;
const isArrayBuffer = (value) => {
  try {
    arrayBufferSize.call(value);
    return true;
  } catch {
    return false;
  }
};
const validMeta = (meta) =>
  meta?.version === ASR_CACHE_VERSION &&
  Number.isSafeInteger(meta.bytes) &&
  meta.bytes >= 0 &&
  Number.isSafeInteger(meta.dataBytes) &&
  meta.dataBytes >= 0 &&
  Number.isFinite(meta.lastUsed) &&
  Array.isArray(meta.coverage) &&
  ["recognition", "segmentation", "translation"].every((name) =>
    /^[a-f0-9]{64}$/.test(meta.signatures?.[name] || "")
  );

export function mediaIdentity(input) {
  const {
    videoId,
    trackId,
    mediaVersion,
    durationMs,
    sourceLanguage = "auto",
  } = input || {};
  if (
    !/^[\w-]{11}$/.test(videoId || "") ||
    !/^[\w.-]{1,128}$/.test(trackId || "") ||
    !/^[\w.-]{1,128}$/.test(mediaVersion || "") ||
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0 ||
    typeof sourceLanguage !== "string" ||
    !/^[\w-]{1,64}$/.test(sourceLanguage)
  )
    throw fail("INVALID_MEDIA_IDENTITY");
  return { videoId, trackId, mediaVersion, durationMs, sourceLanguage };
}
export const mediaCacheKey = (identity) =>
  JSON.stringify(Object.values(mediaIdentity(identity)));
const normalizeSignatures = (input) => {
  const result = {};
  for (const name of ["recognition", "segmentation", "translation"]) {
    if (!/^[a-f0-9]{64}$/.test(input?.[name] || ""))
      throw fail("INVALID_CACHE_SIGNATURE");
    result[name] = input[name];
  }
  return result;
};
const cues = (items, start, end, scale, timingSource) => {
  if (!Array.isArray(items) || items.length > 10000)
    throw fail("INVALID_CACHE_CHUNK");
  const minStart = start * scale;
  const maxEnd = end * scale;
  return items.map((item) => {
    if (
      !Number.isFinite(item.start) ||
      !Number.isFinite(item.end) ||
      typeof item.text !== "string" ||
      item.text.length > 1024 * 1024 ||
      (item.translation !== undefined && typeof item.translation !== "string")
    )
      throw fail("INVALID_CACHE_CHUNK");
    const clampedStart = Math.max(minStart, Math.min(maxEnd, item.start));
    const clampedEnd = Math.max(clampedStart, Math.min(maxEnd, item.end));
    return {
      start: clampedStart,
      end: clampedEnd,
      text: item.text,
      timingSource,
      ...(item.translation !== undefined && { translation: item.translation }),
      ...(item._isDraftTranslation === true && { _isDraftTranslation: true }),
    };
  });
};
export function normalizeCachedChunk(input) {
  const {
    startSample,
    endSample,
    silent = false,
    endOfMedia = false,
    timingSource = "asr",
    stage,
    errorCode,
  } = input || {};
  if (
    !Number.isSafeInteger(startSample) ||
    startSample < 0 ||
    !Number.isSafeInteger(endSample) ||
    endSample <= startSample ||
    typeof silent !== "boolean" ||
    typeof endOfMedia !== "boolean" ||
    !["asr", "audio-chunk"].includes(timingSource) ||
    !["recognized", "segmented", "translated", "failed"].includes(stage) ||
    (errorCode !== undefined && !/^[A-Z_]{1,64}$/.test(errorCode))
  )
    throw fail("INVALID_CACHE_CHUNK");
  const start = startSample / ASR_SAMPLE_RATE,
    end = endSample / ASR_SAMPLE_RATE;
  const chunk = {
    startSample,
    endSample,
    silent,
    endOfMedia,
    timingSource,
    stage,
    segments: cues(input.segments || [], start, end, 1, timingSource),
    subtitles: cues(input.subtitles || [], start, end, 1000, timingSource),
    ...(errorCode && { errorCode }),
  };
  if (bytesOf(chunk) > 8 * 1024 * 1024) throw fail("CACHE_CHUNK_TOO_LARGE");
  if (stage === "translated") {
    for (const cue of chunk.subtitles) {
      if (!cue.translation?.trim()) {
        cue.translation = cue.text || "";
      }
    }
    if (chunk.subtitles.some((cue) => cue._isDraftTranslation)) {
      throw fail("INVALID_CACHE_CHUNK");
    }
  }
  return chunk;
}

/** Only construct in an extension-owned document (background owns the DB). */
export class AsrCacheStore {
  constructor({
    name = "kiss-youtube-asr",
    indexedDB = globalThis.indexedDB,
    subtitleLimit = SUBTITLE_CACHE_LIMIT,
    audioVideoLimit = AUDIO_VIDEO_LIMIT,
    audioLimit = AUDIO_CACHE_LIMIT,
    now = Date.now,
  } = {}) {
    Object.assign(this, {
      name,
      indexedDB,
      subtitleLimit,
      audioVideoLimit,
      audioLimit,
      now,
    });
  }
  async open() {
    if (!this.database)
      this.database = new Promise((resolve, reject) => {
        const req = this.indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("videos", { keyPath: "key" });
          db.createObjectStore("chunks", { keyPath: "id" }).createIndex(
            "video",
            "key"
          );
          db.createObjectStore("audioSessions", { keyPath: "sessionId" });
          db.createObjectStore("audio", { keyPath: "id" }).createIndex(
            "session",
            "sessionId"
          );
          db.createObjectStore("audioIndex", { keyPath: "id" }).createIndex(
            "session",
            "sessionId"
          );
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => {
            db.close();
            this.database = undefined;
          };
          resolve(db);
        };
        req.onerror = () => {
          this.database = undefined;
          reject(req.error);
        };
      });
    return this.database;
  }
  async run(stores, mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result, failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(failure || tx.error || fail("CACHE_WRITE_FAILED"));
      // Operations await IDB requests only, never network/crypto/timers in a transaction.
      Promise.resolve()
        .then(() => operation((name) => tx.objectStore(name)))
        .then(
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
            try {
              tx.abort();
            } catch {
              reject(error);
            }
          }
        );
    });
  }
  async eraseVideo(store, key) {
    const keys = await request(store("chunks").index("video").getAllKeys(key));
    keys.forEach((id) => store("chunks").delete(id));
    store("videos").delete(key);
  }
  async putChunk(identityInput, signatureInput, chunkInput) {
    const identity = mediaIdentity(identityInput),
      key = mediaCacheKey(identity);
    const signatures = normalizeSignatures(signatureInput),
      chunk = normalizeCachedChunk(chunkInput);
    if (chunk.endSample > Math.round(identity.durationMs * 16) + 1600)
      throw fail("INVALID_CACHE_CHUNK");
    if (
      chunk.endOfMedia &&
      Math.abs(chunk.endSample - Math.round(identity.durationMs * 16)) > 1600
    )
      throw fail("INVALID_CACHE_CHUNK");
    const size = bytesOf(chunk);
    if (size > this.subtitleLimit) throw fail("SUBTITLE_QUOTA");
    return this.run(["videos", "chunks"], "readwrite", async (store) => {
      let meta = await request(store("videos").get(key));
      if (
        meta &&
        (!validMeta(meta) ||
          meta.signatures.recognition !== signatures.recognition)
      ) {
        await this.eraseVideo(store, key);
        meta = undefined;
      }
      meta ||= {
        key,
        identity,
        signatures,
        version: ASR_CACHE_VERSION,
        bytes: 0,
        dataBytes: 0,
        coverage: [],
      };
      const id = `${key}:${chunk.startSample}`;
      const previous = await request(store("chunks").get(id));
      if (chunk.stage === "failed" && previous && previous.stage !== "failed")
        return;
      if (
        meta.coverage.some(
          (range) =>
            range.start !== chunk.startSample &&
            range.start < chunk.endSample &&
            range.end > chunk.startSample
        )
      )
        throw fail("CACHE_INTERVAL_OVERLAP");
      const row = { ...chunk, id, key, signatures };
      row.bytes = bytesOf(row) + 64;
      meta.dataBytes += row.bytes - (previous?.bytes || 0);
      meta.lastUsed = this.now();
      meta.signatures = signatures;
      meta.coverage = meta.coverage.filter(
        (entry) => entry.start !== chunk.startSample
      );
      meta.coverage.push({
        start: chunk.startSample,
        end: chunk.endOfMedia
          ? Math.round(identity.durationMs * 16)
          : chunk.endSample,
        recognized: chunk.stage !== "failed",
        translated: chunk.stage === "translated" || chunk.silent,
      });
      meta.bytes = meta.dataBytes + bytesOf(meta) + 128;
      const videos = await request(store("videos").getAll());
      for (const video of videos)
        if (video.key !== key && !validMeta(video))
          await this.eraseVideo(store, video.key);
      const validVideos = videos.filter(
        (video) => video.key !== key && validMeta(video)
      );
      let total = validVideos.reduce(
        (sum, video) => sum + video.bytes,
        meta.bytes
      );
      for (const victim of validVideos.sort(
        (a, b) => a.lastUsed - b.lastUsed
      )) {
        if (total <= this.subtitleLimit) break;
        await this.eraseVideo(store, victim.key);
        total -= victim.bytes;
      }
      if (total > this.subtitleLimit) throw fail("SUBTITLE_QUOTA");
      store("chunks").put(row);
      store("videos").put(meta);
    });
  }
  async getVideo(identityInput, signatureInput) {
    const identity = mediaIdentity(identityInput),
      key = mediaCacheKey(identity);
    const signatures = normalizeSignatures(signatureInput);
    return this.run(["videos", "chunks"], "readwrite", async (store) => {
      const meta = await request(store("videos").get(key));
      if (!meta) return null;
      if (!validMeta(meta)) {
        await this.eraseVideo(store, key);
        return null;
      }
      if (meta.signatures?.recognition !== signatures.recognition) return null;
      const rows = await request(store("chunks").index("video").getAll(key));
      let chunks;
      try {
        chunks = rows
          .map((row) => {
            const chunk = normalizeCachedChunk(row);
            if (
              chunk.endOfMedia &&
              Math.abs(chunk.endSample - Math.round(identity.durationMs * 16)) >
                1600
            )
              throw fail("CORRUPT_CACHE");
            if (row.signatures.recognition !== signatures.recognition)
              throw fail("CORRUPT_CACHE");
            if (
              chunk.timingSource !== "audio-chunk" &&
              row.signatures.segmentation !== signatures.segmentation
            )
              return {
                ...chunk,
                subtitles: [],
                stage: chunk.stage === "failed" ? "failed" : "recognized",
              };
            if (row.signatures.translation !== signatures.translation)
              return {
                ...chunk,
                subtitles: chunk.subtitles.map((cue) => ({
                  ...cue,
                  translation: "",
                })),
                stage: chunk.stage === "translated" ? "segmented" : chunk.stage,
              };
            return chunk;
          })
          .sort((a, b) => a.startSample - b.startSample);
      } catch {
        await this.eraseVideo(store, key);
        return null;
      }
      meta.lastUsed = this.now();
      store("videos").put(meta);
      const total = Math.round(identity.durationMs * 16);
      return {
        identity,
        chunks,
        recognition: coverageProgress(
          chunks
            .filter((chunk) => chunk.stage !== "failed")
            .map((chunk) => ({
              start: chunk.startSample,
              end: chunk.endOfMedia ? total : chunk.endSample,
            })),
          total
        ),
        translation: coverageProgress(
          chunks
            .filter((chunk) => chunk.silent || chunk.stage === "translated")
            .map((chunk) => ({
              start: chunk.startSample,
              end: chunk.endOfMedia ? total : chunk.endSample,
            })),
          total
        ),
      };
    });
  }
  async deleteVideo(identity) {
    const key = mediaCacheKey(identity);
    await this.run(["videos", "chunks"], "readwrite", (store) =>
      this.eraseVideo(store, key)
    );
  }
  async clearSubtitles() {
    await this.run(["videos", "chunks"], "readwrite", (store) => {
      store("videos").clear();
      store("chunks").clear();
    });
  }
  async removeFailed(identity) {
    const key = mediaCacheKey(identity);
    await this.run(["videos", "chunks"], "readwrite", async (store) => {
      const meta = await request(store("videos").get(key));
      if (!meta) return;
      const rows = await request(store("chunks").index("video").getAll(key));
      for (const row of rows)
        if (row.stage === "failed") {
          store("chunks").delete(row.id);
          meta.dataBytes -= row.bytes;
          meta.coverage = meta.coverage.filter(
            (entry) => entry.start !== row.startSample
          );
        }
      meta.bytes = meta.dataBytes + bytesOf(meta) + 128;
      store("videos").put(meta);
    });
  }
  async beginAudio(sessionId, identityInput, owner) {
    if (!/^[\w-]{1,128}$/.test(sessionId || ""))
      throw fail("INVALID_AUDIO_SESSION");
    const identity = mediaIdentity(identityInput),
      key = mediaCacheKey(identity);
    await this.run(["audioSessions"], "readwrite", async (store) => {
      const existing = await request(store("audioSessions").get(sessionId));
      if (existing && existing.key !== key)
        throw fail("AUDIO_IDENTITY_MISMATCH");
      if (
        existing &&
        (existing.owner?.tabId !== owner?.tabId ||
          existing.owner?.documentId !== owner?.documentId)
      )
        throw fail("AUDIO_SESSION_OWNED");
      if (!existing)
        store("audioSessions").put({
          sessionId,
          key,
          identity,
          bytes: 0,
          ...(owner && {
            owner: { tabId: owner.tabId, documentId: owner.documentId },
          }),
        });
    });
  }
  async putAudio(sessionId, input) {
    const { index, startMs, endMs, data } = input || {};
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      !Number.isFinite(startMs) ||
      startMs < 0 ||
      !Number.isFinite(endMs) ||
      endMs < startMs ||
      (index > 0 && endMs === startMs) ||
      !isArrayBuffer(data) ||
      !data.byteLength ||
      data.byteLength > 8 * 1024 * 1024
    )
      throw fail("INVALID_AUDIO_SEGMENT");
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (
      Number.isFinite(estimate?.quota) &&
      Number.isFinite(estimate?.usage) &&
      estimate.quota - estimate.usage < data.byteLength
    )
      throw fail("AUDIO_QUOTA");
    return this.run(
      ["audioSessions", "audio", "audioIndex"],
      "readwrite",
      async (store) => {
        const session = await request(store("audioSessions").get(sessionId));
        if (!session) throw fail("AUDIO_SESSION_MISSING");
        const id = `${sessionId}:${index}`;
        const previous = await request(store("audio").get(id));
        if (previous) {
          const oldBytes = new Uint8Array(previous.data),
            nextBytes = new Uint8Array(data);
          if (
            previous.startMs !== startMs ||
            previous.endMs !== endMs ||
            previous.data.byteLength !== data.byteLength ||
            oldBytes.some((value, i) => value !== nextBytes[i])
          )
            throw fail("AUDIO_SEGMENT_MISMATCH");
          return false;
        }
        const sessions = await request(store("audioSessions").getAll());
        const total = sessions.reduce(
          (sum, entry) => sum + entry.bytes,
          data.byteLength
        );
        const videoTotal = sessions
          .filter(
            (entry) => entry.identity.videoId === session.identity.videoId
          )
          .reduce((sum, entry) => sum + entry.bytes, data.byteLength);
        if (total > this.audioLimit || videoTotal > this.audioVideoLimit)
          throw fail("AUDIO_QUOTA");
        const metadata = {
          id,
          sessionId,
          index,
          startMs,
          endMs,
          bytes: data.byteLength,
        };
        store("audio").put({ ...metadata, data });
        store("audioIndex").put(metadata);
        store("audioSessions").put({
          ...session,
          bytes: session.bytes + data.byteLength,
        });
        return true;
      }
    );
  }
  async listAudio(sessionId) {
    return this.run(["audioIndex"], "readonly", async (store) =>
      (
        await request(store("audioIndex").index("session").getAll(sessionId))
      ).sort((a, b) => a.index - b.index)
    );
  }
  async getAudio(sessionId, index) {
    return this.run(["audio"], "readonly", (store) =>
      request(store("audio").get(`${sessionId}:${index}`))
    );
  }
  async listAudioSessions() {
    return this.run(["audioSessions"], "readonly", (store) =>
      request(store("audioSessions").getAll())
    );
  }
  async removeAudio(sessionId) {
    await this.run(
      ["audioSessions", "audio", "audioIndex"],
      "readwrite",
      async (store) => {
        const keys = await request(
          store("audioIndex").index("session").getAllKeys(sessionId)
        );
        keys.forEach((id) => {
          store("audio").delete(id);
          store("audioIndex").delete(id);
        });
        store("audioSessions").delete(sessionId);
      }
    );
  }
  async clearAudio() {
    await this.run(
      ["audioSessions", "audio", "audioIndex"],
      "readwrite",
      (store) => {
        store("audioSessions").clear();
        store("audio").clear();
        store("audioIndex").clear();
      }
    );
  }
  async close() {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}
