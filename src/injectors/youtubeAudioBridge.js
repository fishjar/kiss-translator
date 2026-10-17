import {
  nativeAudioFormat,
  selectedAacFormat,
  SabrAudioSession,
  sabrUrl,
  SABR_BODY_LIMIT,
  SABR_RESPONSE_LIMIT,
  joinBytes,
  formatKey,
} from "../subtitle/asr/sabrProtocol";
import { YOUTUBE_AUDIO_PROTOCOL } from "../subtitle/asr/audioBridgeProtocol";

const fail = (code) => Object.assign(new Error(code), { code });

/** Attached to the existing caption Fetch hook; no second wrapper or extra injection. */
export function installYoutubeAudioBridge({
  fetch: nativeFetch,
  getPlayer,
  getVideoId,
}) {
  const origin = window.location.origin;
  let enabled = true,
    disposed = false,
    version = 0,
    candidates = [],
    active,
    lastNative,
    captureFailure;
  const reads = new Set(),
    requests = new Map();
  const post = (data) => {
    if (!disposed)
      window.postMessage(
        { protocol: YOUTUBE_AUDIO_PROTOCOL, ...data },
        origin,
        data.result?.segments?.map((segment) => segment.data) || []
      );
  };
  const prune = () => {
    candidates = candidates
      .filter(
        (entry) =>
          entry.videoId === getVideoId() && Date.now() - entry.at < 60000
      )
      .slice(-4);
  };
  const clear = (keepIdentity = false) => {
    version++;
    candidates = [];
    captureFailure = undefined;
    active = undefined;
    if (!keepIdentity) lastNative = undefined;
    reads.forEach((controller) => controller.abort());
    requests.forEach((controller) => controller.abort());
  };
  const playerResponse = () => {
    const player = getPlayer();
    if (
      !player ||
      player.matches?.(".ad-showing,.ad-interrupting") ||
      player.getVideoData?.().video_id !== getVideoId()
    )
      throw fail("WAITING_FOR_PLAYER");
    return player.getPlayerResponse?.();
  };
  const missingCapture = () => {
    if (
      captureFailure?.videoId === getVideoId() &&
      Date.now() - captureFailure.at < 60000
    )
      return fail(captureFailure.code);
    const playing = getPlayer()?.querySelector?.("video")?.paused === false;
    return fail(playing ? "AUDIO_CAPTURE_MISSING" : "NEED_PLAYBACK");
  };
  const rememberFailure = (entry, cause) => {
    if (
      !entry ||
      entry.controller.signal.aborted ||
      entry.version !== version ||
      entry.videoId !== getVideoId()
    )
      return;
    captureFailure = {
      videoId: entry.videoId,
      at: Date.now(),
      code: /^[A-Z_]{1,64}$/.test(cause.code)
        ? cause.code
        : "INVALID_AUDIO_RESPONSE",
    };
  };
  const snapshot = async () => {
    prune();
    const candidate = candidates[candidates.length - 1];
    const videoId = getVideoId();
    const native =
      candidate?.format ||
      (lastNative?.videoId === videoId ? lastNative.format : null);
    if (!native) throw missingCapture();
    const response = playerResponse();
    const format = selectedAacFormat(response, native, videoId);
    const runtimeTrack = getPlayer().getAudioTrack?.();
    if (
      typeof runtimeTrack?.id === "string" &&
      response.streamingData?.adaptiveFormats?.some(
        (entry) => entry.audioTrack?.id === runtimeTrack.id
      ) &&
      runtimeTrack.id !== format.audioTrack.id
    )
      throw fail("AUDIO_IDENTITY_MISMATCH");
    const durationMs = Math.round(
      Number(format.approxDurationMs) ||
        Number(getPlayer().getDuration?.()) * 1000
    );
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
      throw fail("WAITING_FOR_PLAYER");
    const fingerprint = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(format.xtags || "")
        )
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    if (videoId !== getVideoId()) throw fail("STALE_VIDEO");
    return {
      videoId,
      identity: {
        videoId,
        trackId: format.audioTrack.id,
        mediaVersion: `${format.itag}.${format.lastModified}.${fingerprint}`,
        durationMs,
        sourceLanguage: format.audioTrack.id.replace(/\.\d+$/, ""),
      },
      format: {
        itag: format.itag,
        lastModified: String(format.lastModified),
        xtags: format.xtags || "",
      },
      candidate,
    };
  };
  const readBytes = async (stream, signal, limit) => {
    if (!stream) throw fail("AUDIO_EMPTY");
    const reader = stream.getReader(),
      chunks = [];
    let bytes = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      if (signal.aborted) throw fail("REQUEST_CANCELLED");
      while (true) {
        const part = await reader.read();
        if (signal.aborted) throw fail("REQUEST_CANCELLED");
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > limit) throw fail("AUDIO_RESPONSE_TOO_LARGE");
        chunks.push(part.value);
      }
      return joinBytes(chunks);
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  };
  const prepare = (args) => {
    let entry;
    try {
      prune();
      const [input, init] = args,
        videoId = getVideoId();
      const url =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input?.url;
      const request =
        typeof Request !== "undefined" && input instanceof Request
          ? input
          : null;
      if (
        !enabled ||
        disposed ||
        !videoId ||
        reads.size >= 2 ||
        !sabrUrl(url) ||
        String(init?.method || request?.method || "GET").toUpperCase() !==
          "POST"
      )
        return;
      const controller = new AbortController();
      reads.add(controller);
      entry = {
        videoId,
        url,
        version,
        controller,
        credentials: init?.credentials || request?.credentials || "same-origin",
      };
      entry.timer = setTimeout(() => controller.abort(), 8000);
      const body = init?.body;
      if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
        const view =
          body instanceof ArrayBuffer
            ? new Uint8Array(body)
            : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
        if (!view.length || view.length > SABR_BODY_LIMIT)
          throw fail("INVALID_SABR_BODY");
        entry.body = Promise.resolve(view.slice());
      } else if (request)
        entry.body = readBytes(
          request.clone().body,
          controller.signal,
          SABR_BODY_LIMIT
        );
      else throw fail("INVALID_SABR_BODY");
      entry.body.catch(() => {});
      return entry;
    } catch (cause) {
      rememberFailure(entry, cause);
      release(entry);
      return;
    }
  };
  const release = (entry) => {
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.controller.abort();
    reads.delete(entry.controller);
  };
  const observe = (promise, entry) => {
    if (!entry) return;
    // Clone before the player's handlers can consume the original response.
    const copy = promise.then(
      (response) => (entry.controller.signal.aborted ? null : response.clone()),
      () => null
    );
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(fail("REQUEST_CANCELLED"));
      entry.controller.signal.addEventListener("abort", abort, { once: true });
      if (entry.controller.signal.aborted) abort();
    });
    void Promise.race([
      cancelled,
      (async () => {
        const body = await entry.body,
          response = await copy;
        if (entry.controller.signal.aborted) return;
        if (!response?.ok) throw fail("AUDIO_HTTP_ERROR");
        if (
          !response.headers
            .get("content-type")
            ?.includes("application/vnd.yt-ump")
        )
          throw fail("INVALID_AUDIO_RESPONSE");
        const bytes = await readBytes(
          response.body,
          entry.controller.signal,
          SABR_RESPONSE_LIMIT
        );
        if (
          entry.version !== version ||
          entry.videoId !== getVideoId() ||
          !enabled
        )
          return;
        if (getPlayer()?.matches?.(".ad-showing,.ad-interrupting")) return;
        const responseData = getPlayer()?.getPlayerResponse?.();
        const knownFormats =
          responseData?.videoDetails?.videoId === entry.videoId
            ? responseData.streamingData?.adaptiveFormats
            : undefined;
        const format = nativeAudioFormat(
          body,
          bytes,
          entry.videoId,
          knownFormats
        );
        candidates.push({
          videoId: entry.videoId,
          url: entry.url,
          credentials: entry.credentials,
          body,
          format,
          at: Date.now(),
        });
        lastNative = { videoId: entry.videoId, format };
        captureFailure = undefined;
        prune();
        post({ type: "capture", videoId: entry.videoId });
      })(),
    ])
      .catch((cause) => rememberFailure(entry, cause))
      .finally(() => {
        entry.controller.signal.removeEventListener("abort", abort);
        release(entry);
      });
  };
  const onMessage = async (event) => {
    const data = event.data;
    if (
      disposed ||
      event.source !== window ||
      event.origin !== origin ||
      data?.protocol !== YOUTUBE_AUDIO_PROTOCOL ||
      data.type !== "request"
    )
      return;
    const { action, requestId, videoId, sessionId } = data;
    if (!/^[\w-]{1,128}$/.test(requestId || "")) return;
    if (action === "cancel") {
      requests.get(data.cancelRequestId)?.abort();
      return;
    }
    if (action === "configure") {
      enabled = data.enabled === true;
      if (!enabled) clear();
      return;
    }
    if (action === "clear") {
      clear(true);
      return;
    }
    if (videoId !== getVideoId() || !/^[\w-]{11}$/.test(videoId || "")) {
      post({ type: "response", requestId, videoId, code: "STALE_VIDEO" });
      return;
    }
    const controller = new AbortController();
    requests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    const generation = version;
    try {
      let result;
      if (action === "snapshot") {
        const { candidate, ...metadata } = await snapshot();
        result = metadata;
      } else if (action === "open") {
        if (!/^[\w-]{1,128}$/.test(sessionId || "") || requests.size > 1)
          throw fail("AUDIO_BUSY");
        const { candidate, ...metadata } = await snapshot();
        if (!candidate) throw missingCapture();
        if (generation !== version) throw fail("STALE_VIDEO");
        const positionMs = data.positionMs ?? 0;
        if (
          !Number.isSafeInteger(positionMs) ||
          positionMs < 0 ||
          positionMs > metadata.identity.durationMs
        )
          throw fail("INVALID_AUDIO_RANGE");
        const url = sabrUrl(candidate.url);
        const signed = (url.searchParams.get("sparams") || "").split(",");
        if (!signed.includes("cpn"))
          url.searchParams.set(
            "cpn",
            btoa(
              String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12)))
            )
              .replaceAll("+", "-")
              .replaceAll("/", "_")
          );
        if (!signed.includes("alr")) url.searchParams.set("alr", "no");
        active = {
          sessionId,
          url,
          signed,
          sequence: 0,
          positionMs,
          metadata,
          credentials: candidate.credentials,
          session: new SabrAudioSession({
            body: candidate.body,
            format: metadata.format,
            videoId,
          }),
        };
        result = metadata;
      } else if (action === "next") {
        if (!active || active.sessionId !== sessionId || requests.size > 1)
          throw fail("AUDIO_SESSION_MISSING");
        const current = active;
        const metadata = await snapshot();
        if (generation !== version || active !== current)
          throw fail("STALE_VIDEO");
        if (
          formatKey(metadata.format) !== formatKey(current.metadata.format) ||
          metadata.identity.trackId !== current.metadata.identity.trackId
        )
          throw fail("AUDIO_IDENTITY_MISMATCH");
        if (!current.signed.includes("rn"))
          current.url.searchParams.set("rn", String(current.sequence++));
        const response = await nativeFetch(current.url.href, {
          method: "POST",
          body: current.session.request(current.positionMs),
          headers: {
            "content-type": "application/x-protobuf",
            accept: "application/vnd.yt-ump",
          },
          credentials: current.credentials,
          signal: controller.signal,
        });
        if (!response.ok) {
          const cause = fail(
            response.status === 401 || response.status === 403
              ? "AUDIO_AUTH_EXPIRED"
              : response.status === 429
                ? "AUDIO_RATE_LIMITED"
                : "AUDIO_HTTP_ERROR"
          );
          cause.status = response.status;
          cause.retryAfter = response.headers.get("Retry-After");
          throw cause;
        }
        const bytes = await readBytes(
          response.body,
          controller.signal,
          SABR_RESPONSE_LIMIT
        );
        if (!bytes.length) throw fail("AUDIO_EMPTY");
        result = current.session.consume(bytes);
        const end = Math.max(
          current.positionMs,
          ...result.segments
            .filter((segment) => segment.index > 0)
            .map((segment) => segment.endMs)
        );
        current.positionMs = Math.ceil(end);
      } else throw fail("INVALID_AUDIO_REQUEST");
      if (controller.signal.aborted) throw fail("TIMEOUT");
      if (generation !== version || videoId !== getVideoId())
        throw fail("STALE_VIDEO");
      post({ type: "response", requestId, videoId, result });
    } catch (cause) {
      post({
        type: "response",
        requestId,
        videoId,
        code: controller.signal.aborted
          ? "TIMEOUT"
          : /^[A-Z_]{1,64}$/.test(cause.code)
            ? cause.code
            : "AUDIO_NETWORK",
        status: cause.status,
        retryAfter: cause.retryAfter,
      });
    } finally {
      clearTimeout(timer);
      requests.delete(requestId);
    }
  };
  const expiry = setInterval(prune, 5000);
  window.addEventListener("message", onMessage);
  return {
    prepare,
    observe,
    abortPrepared: release,
    clear,
    dispose() {
      disposed = true;
      clear();
      clearInterval(expiry);
      window.removeEventListener("message", onMessage);
    },
  };
}
