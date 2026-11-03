import {
  captionUrl,
  captionTrackId,
  parseTimedText,
  selectCaptionTrack,
} from "./youtubeCaptionSource";

export const YOUTUBE_CAPTION_PROTOCOL = "kiss-youtube-captions-v1";
const fail = (code) => Object.assign(new Error(code), { code });
const aborted = () => new DOMException("Aborted", "AbortError");

export class YouTubeCaptionBridgeClient {
  pending = new Map();
  sequence = 0;
  constructor(onCapture = () => {}) {
    this.onCapture = onCapture;
    this.onMessage = (event) => {
      const data = event.data;
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        data?.protocol !== YOUTUBE_CAPTION_PROTOCOL
      )
        return;
      if (data.type === "response") {
        const pending = this.pending.get(data.requestId);
        if (!pending || (data.videoId && data.videoId !== pending.videoId))
          return;
        const result = data.result;
        const valid = data.code
          ? typeof data.code === "string" && data.code.length < 64
          : result &&
            typeof result === "object" &&
            (pending.action === "fetch"
              ? Number.isInteger(result.status) &&
                result.status >= 100 &&
                result.status < 600 &&
                typeof result.body === "string" &&
                result.body.length <= 8 * 1024 * 1024
              : result.videoId === pending.videoId &&
                Array.isArray(result.captionTracks) &&
                result.captionTracks.length <= 200 &&
                Array.isArray(result.captures) &&
                result.captures.length <= 4);
        pending.finish(
          !valid ? fail("INVALID_FORMAT") : data.code ? fail(data.code) : null,
          result
        );
      } else if (
        data.type === "capture" &&
        typeof data.url === "string" &&
        captionUrl(data.url, data.videoId) &&
        (data.response === undefined || typeof data.response === "string")
      ) {
        if (data.response?.length > 8 * 1024 * 1024) return;
        this.onCapture(data);
      }
    };
    window.addEventListener("message", this.onMessage);
  }
  post(data) {
    window.postMessage(
      { protocol: YOUTUBE_CAPTION_PROTOCOL, type: "request", ...data },
      window.location.origin
    );
  }
  request(action, videoId, { signal, ...data } = {}) {
    if (signal?.aborted) return Promise.reject(aborted());
    const requestId = `caption-${Date.now()}-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        this.pending.delete(requestId);
        error ? reject(error) : resolve(result);
      };
      const cancel = () => {
        this.post({
          action: "cancel",
          requestId: `${requestId}-cancel`,
          targetId: requestId,
        });
        finish(aborted());
      };
      const timer = setTimeout(() => {
        this.post({
          action: "cancel",
          requestId: `${requestId}-timeout`,
          targetId: requestId,
        });
        finish(fail("TIMEOUT"));
      }, 8500);
      this.pending.set(requestId, { videoId, action, finish });
      signal?.addEventListener("abort", cancel, { once: true });
      this.post({ action, videoId, requestId, ...data });
    });
  }
  clear() {
    this.post({ action: "clear", requestId: `clear-${++this.sequence}` });
  }
  dispose() {
    this.clear();
    window.removeEventListener("message", this.onMessage);
    Array.from(this.pending.values()).forEach((p) => p.finish(aborted()));
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function retryAfterDeadline(value, now = Date.now()) {
  if (!value) return now + 30000;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? now + Math.max(0, seconds) * 1000
    : Math.max(now, Date.parse(value) || now + 30000);
}

export function captionCandidates(snapshot, track, videoId) {
  const matches = (value) => {
    const url = captionUrl(value, videoId);
    if (
      !url ||
      url.searchParams.get("lang") !== track.languageCode ||
      (url.searchParams.get("kind") || "") !== (track.kind || "")
    )
      return null;
    // A named track must not silently resolve to a different same-language track.
    const selected = captionUrl(track.baseUrl, videoId);
    if (
      selected?.searchParams.has("name") &&
      url.searchParams.get("name") !== selected.searchParams.get("name")
    )
      return null;
    return url;
  };
  const values = [
    ...(snapshot.captures || [])
      .slice()
      .reverse()
      .map((c) => c.url),
    ...(snapshot.runtimeTracks || [])
      .filter((t) => !track.vssId || !t.vssId || t.vssId === track.vssId)
      .map((t) => t.baseUrl),
    track.baseUrl,
  ];
  const urls = values
    .map(matches)
    .filter(Boolean)
    .map((url) => {
      url.searchParams.delete("tlang");
      url.searchParams.set("fmt", "json3");
      return url.href;
    });
  return [...new Set(urls)];
}

function capturedTrackMatches(capture, track, videoId) {
  const url = captionUrl(capture.url, videoId);
  const base = captionUrl(track.baseUrl, videoId);
  return (
    url &&
    !url.searchParams.has("tlang") &&
    url.searchParams.get("lang") === track.languageCode &&
    (url.searchParams.get("kind") || "") === (track.kind || "") &&
    (!base?.searchParams.has("name") ||
      url.searchParams.get("name") === base.searchParams.get("name"))
  );
}

export class YouTubeCaptionAcquirer {
  constructor(bridge, onState = () => {}) {
    this.bridge = bridge;
    this.onState = onState;
  }
  cancel() {
    this.controller?.abort();
    this.controller = null;
    this.inFlight = null;
  }
  acquire(videoId, cachedEntry) {
    if (this.inFlight?.videoId === videoId) return this.inFlight.promise;
    this.cancel();
    const controller = new AbortController();
    this.controller = controller;
    const promise = this.run(videoId, controller.signal, cachedEntry).finally(
      () => {
        if (this.controller === controller) {
          this.inFlight = null;
          this.controller = null;
        }
      }
    );
    this.inFlight = { videoId, promise };
    return promise;
  }
  async run(videoId, signal, cachedEntry) {
    const scope = new AbortController();
    const cancel = () => scope.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => scope.abort(), 30000);
    const state = (patch) => {
      if (!scope.signal.aborted) this.onState(patch);
    };
    const request = (action, data) =>
      this.bridge.request(action, videoId, { ...data, signal: scope.signal });
    let lastError = fail("TIMEOUT"),
      retries = 0,
      rateRetries = 0,
      refreshed = false,
      metadataTried = false;
    const attempted = new Set();
    const startedAt = Date.now();
    state({ phase: "loading", code: null, cooldownUntil: 0 });
    try {
      while (!scope.signal.aborted) {
        let snapshot = await request("snapshot");
        if (
          !snapshot?.ready &&
          !metadataTried &&
          Date.now() - startedAt >= 1500
        ) {
          metadataTried = true;
          const metadata = await request("metadata").catch((error) => {
            if (error.name === "AbortError") throw error;
            return null;
          });
          if (metadata?.videoId === videoId && metadata.ready)
            snapshot = metadata;
        }
        // Captured source responses remain usable if optional player metadata is missing.
        if (!snapshot?.ready && snapshot?.videoId === videoId) {
          const captures = (snapshot.captures || []).filter((c) => {
            const url = captionUrl(c.url, videoId);
            return (
              c.response &&
              url &&
              !url.searchParams.has("tlang") &&
              url.searchParams.get("lang")
            );
          });
          const identities = new Set(
            captures.map((c) => {
              const url = new URL(c.url);
              return [
                url.searchParams.get("lang"),
                url.searchParams.get("kind"),
                url.searchParams.get("name"),
              ].join("|");
            })
          );
          if (identities.size === 1 && captures.length) {
            const capture = captures[captures.length - 1],
              url = new URL(capture.url);
            try {
              const events = parseTimedText(capture.response);
              return {
                videoId,
                events,
                source: "capture",
                track: {
                  baseUrl: url.href,
                  languageCode: url.searchParams.get("lang"),
                  kind: url.searchParams.get("kind") || "",
                  name: url.searchParams.get("name") || "",
                },
              };
            } catch (error) {
              lastError = error;
            }
          }
        }
        if (snapshot?.videoId !== videoId || !snapshot.ready || snapshot.isAd) {
          state({ phase: snapshot?.paused ? "waiting_playback" : "waiting" });
          await wait(400, scope.signal);
          continue;
        }
        let track = selectCaptionTrack(snapshot);
        if (!track && !metadataTried) {
          metadataTried = true;
          const metadata = await request("metadata").catch((error) => {
            if (error.name === "AbortError") throw error;
            return null;
          });
          if (metadata?.videoId === videoId && !snapshot.captionTracks?.length)
            snapshot = metadata;
          track = selectCaptionTrack(snapshot);
        }
        if (!track) {
          if (!snapshot.captionTracks?.length) throw fail("NO_SUBTITLES");
          if (!refreshed) {
            refreshed = true;
            await request("refresh");
            await wait(500, scope.signal);
            continue;
          }
          throw fail("TRACK_UNAVAILABLE");
        }
        if (
          cachedEntry?.videoId === videoId &&
          cachedEntry.trackKey === captionTrackId(track)
        ) {
          return { ...cachedEntry, videoId, track, source: "cache" };
        }
        state({ phase: "loading", track });
        const captures = (snapshot.captures || []).slice().reverse();
        for (const capture of captures) {
          if (
            !capture.response ||
            !capturedTrackMatches(capture, track, videoId)
          )
            continue;
          try {
            return {
              videoId,
              track,
              events: parseTimedText(capture.response),
              fullDescription: snapshot.fullDescription,
              source: "capture",
            };
          } catch (error) {
            lastError = error;
          }
        }
        let retryPending = false;
        for (const url of captionCandidates(snapshot, track, videoId)) {
          if (attempted.has(url)) continue;
          attempted.add(url);
          try {
            const response = await request("fetch", { url });
            if (response.status === 429) {
              const until = retryAfterDeadline(response.retryAfter);
              state({
                phase: "cooldown",
                code: "RATE_LIMITED",
                cooldownUntil: until,
              });
              const remaining = until - Date.now();
              if (remaining >= 8000 || rateRetries++ >= 2)
                throw Object.assign(fail("RATE_LIMITED"), {
                  cooldownUntil: until,
                });
              await wait(Math.max(1000, remaining), scope.signal);
              attempted.delete(url);
              lastError = fail("RATE_LIMITED");
              retryPending = true;
              break;
            }
            if (response.status >= 500) throw fail("SERVER_ERROR");
            if (response.status === 401 || response.status === 403)
              throw fail("TOKEN_EXPIRED");
            if (response.status !== 200)
              throw fail(
                response.status === 404 ? "UNAVAILABLE" : "HTTP_ERROR"
              );
            const events = parseTimedText(response.body);
            // Re-read the runtime selection so a track change cannot commit an old response.
            const latest = await request("snapshot");
            if (
              latest.videoId !== videoId ||
              captionTrackId(selectCaptionTrack(latest) || {}) !==
                captionTrackId(track)
            )
              throw fail("STALE_TRACK");
            return {
              videoId,
              track,
              events,
              fullDescription: snapshot.fullDescription,
              source: "request",
            };
          } catch (error) {
            if (
              [
                "RATE_LIMITED",
                "TOO_LARGE",
                "UNAVAILABLE",
                "STALE_TRACK",
              ].includes(error.code) ||
              error.name === "AbortError"
            )
              throw error;
            lastError = error;
            if (["NETWORK", "SERVER_ERROR", "TIMEOUT"].includes(error.code)) {
              if (retries >= 2) throw error;
              await wait(retries++ === 0 ? 1000 : 3000, scope.signal);
              attempted.delete(url);
              retryPending = true;
              break;
            }
          }
        }
        if (retryPending) continue;
        if (!refreshed) {
          refreshed = true;
          await request("refresh");
          state({ phase: snapshot.paused ? "waiting_playback" : "loading" });
        } else if (lastError.code !== "RATE_LIMITED" && retries >= 2)
          throw lastError;
        await wait(500, scope.signal);
      }
      throw lastError;
    } catch (error) {
      if (signal.aborted) throw aborted();
      if (scope.signal.aborted)
        throw fail(lastError.code === "TIMEOUT" ? "TIMEOUT" : lastError.code);
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      scope.abort();
    }
  }
}
