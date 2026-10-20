import { YOUTUBE_AUDIO_PROTOCOL } from "./audioBridgeProtocol";
import { mediaIdentity } from "./cacheStore";

const fail = (code) => Object.assign(new Error(code), { code });
const aborted = (signal) =>
  signal?.reason || new DOMException("Cancelled", "AbortError");

export class YoutubeAudioBridgeClient {
  constructor(onCapture = () => {}) {
    this.pending = new Map();
    this.sequence = 0;
    this.prefix = `audio-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    this.onMessage = (event) => {
      const data = event.data;
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        data?.protocol !== YOUTUBE_AUDIO_PROTOCOL
      )
        return;
      if (data.type === "capture" && /^[\w-]{11}$/.test(data.videoId || "")) {
        onCapture(data.videoId);
        return;
      }
      const pending = this.pending.get(data.requestId);
      if (
        data.type !== "response" ||
        !pending ||
        data.videoId !== pending.videoId
      )
        return;
      if (pending.cancelled) {
        pending.finish(aborted(pending.signal));
        return;
      }
      if (data.code) {
        const cause = fail(
          /^[A-Z_]{1,64}$/.test(data.code)
            ? data.code
            : "INVALID_AUDIO_RESPONSE"
        );
        if (
          Number.isInteger(data.status) &&
          data.status >= 100 &&
          data.status <= 599
        )
          cause.status = data.status;
        if (
          typeof data.retryAfter === "string" &&
          data.retryAfter.length <= 128
        )
          cause.retryAfter = data.retryAfter;
        pending.finish(cause);
        return;
      }
      try {
        const result = data.result;
        if (pending.action === "next") {
          if (!Array.isArray(result?.segments) || result.segments.length > 1000)
            throw fail("INVALID_AUDIO_RESPONSE");
          let bytes = 0;
          for (const segment of result.segments) {
            if (
              !Number.isSafeInteger(segment.index) ||
              segment.index < 0 ||
              !Number.isFinite(segment.startMs) ||
              segment.startMs < 0 ||
              !Number.isFinite(segment.endMs) ||
              segment.endMs < segment.startMs ||
              !(segment.data instanceof ArrayBuffer) ||
              !segment.data.byteLength ||
              (bytes += segment.data.byteLength) > 8 * 1024 * 1024
            )
              throw fail("INVALID_AUDIO_RESPONSE");
          }
          if (
            result.expectedSegments !== undefined &&
            (!Number.isSafeInteger(result.expectedSegments) ||
              result.expectedSegments <= 0)
          )
            throw fail("INVALID_AUDIO_RESPONSE");
          if (
            result.expectedEndMs !== undefined &&
            (!Number.isFinite(result.expectedEndMs) ||
              result.expectedEndMs <= 0)
          )
            throw fail("INVALID_AUDIO_RESPONSE");
          if (
            !Number.isFinite(result.backoffMs) ||
            result.backoffMs < 0 ||
            !Number.isInteger(result.protection)
          )
            throw fail("INVALID_AUDIO_RESPONSE");
        } else {
          const identity = mediaIdentity(result?.identity);
          if (
            identity.videoId !== pending.videoId ||
            result.videoId !== pending.videoId ||
            !Number.isInteger(result.format?.itag) ||
            !/^\d+$/.test(result.format?.lastModified || "") ||
            typeof result.format?.xtags !== "string" ||
            result.format.xtags.length > 4096
          )
            throw fail("INVALID_AUDIO_RESPONSE");
        }
        pending.finish(null, result);
      } catch {
        pending.finish(fail("INVALID_AUDIO_RESPONSE"));
      }
    };
    window.addEventListener("message", this.onMessage);
  }
  post(data) {
    window.postMessage(
      { protocol: YOUTUBE_AUDIO_PROTOCOL, type: "request", ...data },
      window.location.origin
    );
  }
  request(action, videoId, payload = {}, signal) {
    if (this.closed) return Promise.reject(fail("AUDIO_BRIDGE_CLOSED"));
    if (signal?.aborted) return Promise.reject(aborted(signal));
    const requestId = `${this.prefix}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const cancel = () => {
        pending.cancelled = true;
        this.post({
          action: "cancel",
          videoId,
          requestId: `${requestId}-cancel`,
          cancelRequestId: requestId,
        });
        if (signal?.aborted) pending.finish(aborted(signal));
      };
      const timer = setTimeout(
        () => {
          cancel();
          pending.finish(
            pending.cancelled && signal?.aborted
              ? aborted(signal)
              : fail("AUDIO_TIMEOUT")
          );
        },
        action === "next" ? 20000 : 3000
      );
      const pending = {
        videoId,
        action,
        signal,
        cancelled: false,
        finish: (cause, result) => {
          if (!this.pending.delete(requestId)) return;
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          if (cause) reject(cause);
          else resolve(result);
        },
      };
      this.pending.set(requestId, pending);
      signal?.addEventListener("abort", cancel, { once: true });
      this.post({ action, videoId, requestId, ...payload });
      if (signal?.aborted) cancel();
    });
  }
  snapshot(videoId, signal) {
    return this.request("snapshot", videoId, {}, signal);
  }
  open(videoId, sessionId, positionMs = 0, signal) {
    return this.request("open", videoId, { sessionId, positionMs }, signal);
  }
  next(videoId, sessionId, signal) {
    return this.request("next", videoId, { sessionId }, signal);
  }
  configure(enabled) {
    this.post({
      action: "configure",
      enabled,
      requestId: `${this.prefix}-${++this.sequence}`,
    });
  }
  clear() {
    this.post({
      action: "clear",
      requestId: `${this.prefix}-${++this.sequence}`,
    });
  }
  dispose() {
    if (this.closed) return;
    this.clear();
    this.closed = true;
    this.pending.forEach((pending) =>
      pending.finish(new DOMException("Cancelled", "AbortError"))
    );
    window.removeEventListener("message", this.onMessage);
  }
}
