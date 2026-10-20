import { AUDIO_VIDEO_LIMIT } from "./cacheStore";

/** Compressed audio belongs to this page session only; never opens IndexedDB. */
export class SessionAudioStorage {
  constructor(limit = AUDIO_VIDEO_LIMIT) {
    this.limit = limit;
    this.rows = new Map();
    this.bytes = 0;
  }
  async putAudio(sessionId, segment) {
    const key = `${sessionId}:${segment.index}`;
    const bytes = this.bytes - (this.rows.get(key)?.data.byteLength || 0) + segment.data.byteLength;
    if (bytes > this.limit)
      throw Object.assign(new Error("AUDIO_QUOTA"), { code: "AUDIO_QUOTA" });
    this.rows.set(key, segment);
    this.bytes = bytes;
  }
  async getAudio(sessionId, index) {
    return this.rows.get(`${sessionId}:${index}`) || null;
  }
  clear() {
    this.rows.clear();
    this.bytes = 0;
  }
}
