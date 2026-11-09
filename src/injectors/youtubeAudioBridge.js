import {
  nativeAudioFormat,
  selectedAacFormat,
  youtubeAudioFormats,
  SabrAudioSession,
  sabrUrl,
  SABR_BODY_LIMIT,
  SABR_RESPONSE_LIMIT,
  joinBytes,
  formatKey,
} from "../subtitle/asr/sabrProtocol";
import { YOUTUBE_AUDIO_PROTOCOL } from "../subtitle/asr/audioBridgeProtocol";
import { VideoPlaybackAbrRequest } from "googlevideo/protos";

const fail = (code) => Object.assign(new Error(code), { code });

/** Attached to the existing caption Fetch hook; no second wrapper or extra injection. */
export function installYoutubeAudioBridge({
  fetch: nativeFetch,
  getPlayer,
  getVideoId,
}) {
  const origin = window.location.origin;
  let disposed = false,
    version = 0,
    requestVersion = 0,
    captureSequence = 0,
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
    candidates = candidates.filter(
      (entry) =>
        entry.videoId === getVideoId() &&
        (!entry.expiresAt || entry.expiresAt > Date.now())
    );
  };
  const stop = () => {
    requestVersion++;
    active = undefined;
    requests.forEach((controller) => controller.abort());
  };
  const clear = () => {
    version++;
    candidates = [];
    captureFailure = undefined;
    lastNative = undefined;
    stop();
    reads.forEach((controller) => controller.abort());
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
    const videoId = getVideoId();
    const response = playerResponse();
    const runtimeTrack = getPlayer().getAudioTrack?.();
    const formats = youtubeAudioFormats(response);
    const selectedTrack =
      (formats.some((entry) => entry.audioTrack?.id === runtimeTrack?.id)
        ? runtimeTrack?.id
        : undefined) ||
      formats.find((entry) => entry.audioTrack?.audioIsDefault)?.audioTrack.id;
    let candidate = [...candidates]
      .reverse()
      .find(
        (entry) =>
          !selectedTrack ||
          (entry.trackId ||
            formats.find(
              (format) => formatKey(format) === formatKey(entry.format)
            )?.audioTrack?.id) === selectedTrack
      );
    const native =
      candidate?.format ||
      (lastNative?.videoId === videoId &&
      (!selectedTrack || lastNative.trackId === selectedTrack)
        ? lastNative.format
        : null);
    const available = formats.filter(
      (entry) =>
        entry.mimeType?.startsWith("audio/mp4") &&
        entry.audioTrack?.id &&
        (!selectedTrack || entry.audioTrack.id === selectedTrack)
    );
    const baseline = available.filter(
      (entry) => entry.audioTrack.id === "default" && !entry.xtags
    );
    const format = native
      ? selectedAacFormat(response, native, videoId)
      : available.length === 1
        ? selectedAacFormat(response, available[0], videoId)
        : baseline.length === 1
          ? selectedAacFormat(response, baseline[0], videoId)
          : null;
    if (!format) throw missingCapture();
    if (!candidate) candidate = parameterCandidate(response, format);
    if (!native && !candidate) throw missingCapture();
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
        sourceLanguage:
          format.audioTrack.id === "default"
            ? "auto"
            : format.audioTrack.id.replace(/\.\d+$/, ""),
      },
      format: {
        itag: format.itag,
        lastModified: String(format.lastModified),
        xtags: format.xtags || "",
      },
      candidate,
    };
  };
  // Used only when download is requested; passive capture remains the primary source.
  const parameterCandidate = (response, format) => {
    const url = sabrUrl(response.streamingData?.serverAbrStreamingUrl);
    const config =
      response.playerConfig?.mediaCommonConfig?.mediaUstreamerRequestConfig
        ?.videoPlaybackUstreamerConfig;
    const clientName = Number(
      window.ytcfg?.get?.("INNERTUBE_CONTEXT_CLIENT_NAME")
    );
    const clientVersion = window.ytcfg?.get?.(
      "INNERTUBE_CONTEXT_CLIENT_VERSION"
    );
    if (
      !url ||
      typeof config !== "string" ||
      !Number.isInteger(clientName) ||
      clientName <= 0 ||
      typeof clientVersion !== "string" ||
      !clientVersion
    )
      return;
    const decode = (value) =>
      Uint8Array.from(
        atob(value.replaceAll("-", "+").replaceAll("_", "/")),
        (char) => char.charCodeAt(0)
      );
    try {
      const poToken = response.serviceIntegrityDimensions?.poToken;
      const body = VideoPlaybackAbrRequest.encode({
        clientAbrState: {},
        selectedFormatIds: [],
        bufferedRanges: [],
        preferredAudioFormatIds: [format],
        preferredVideoFormatIds: [],
        preferredSubtitleFormatIds: [],
        field1000: [],
        videoPlaybackUstreamerConfig: decode(config),
        streamerContext: {
          clientInfo: { clientName, clientVersion },
          ...(typeof poToken === "string" && { poToken: decode(poToken) }),
          sabrContexts: [],
          unsentSabrContexts: [],
        },
      }).finish();
      if (body.length > SABR_BODY_LIMIT) return;
      return {
        videoId: getVideoId(),
        url: url.href,
        body,
        format,
        trackId: format.audioTrack.id,
        credentials: "include",
      };
    } catch {
      return;
    }
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
        sequence: ++captureSequence,
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
        if (entry.version !== version || entry.videoId !== getVideoId()) return;
        if (getPlayer()?.matches?.(".ad-showing,.ad-interrupting")) return;
        const responseData = getPlayer()?.getPlayerResponse?.();
        const knownFormats =
          responseData?.videoDetails?.videoId === entry.videoId
            ? youtubeAudioFormats(responseData)
            : undefined;
        const format = nativeAudioFormat(
          body,
          bytes,
          entry.videoId,
          knownFormats
        );
        const trackId = knownFormats?.find(
          (item) => formatKey(item) === formatKey(format)
        )?.audioTrack?.id;
        if (
          candidates.some(
            (item) => item.trackId === trackId && item.sequence > entry.sequence
          )
        )
          return;
        candidates = candidates.filter((item) => item.trackId !== trackId);
        const expire = Number(sabrUrl(entry.url)?.searchParams.get("expire"));
        candidates.push({
          videoId: entry.videoId,
          url: entry.url,
          credentials: entry.credentials,
          body,
          format,
          trackId,
          sequence: entry.sequence,
          expiresAt: expire > 0 ? expire * 1000 : undefined,
          at: Date.now(),
        });
        lastNative = { videoId: entry.videoId, format, trackId };
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
      // Kept for older clients; ASR configuration does not own passive capture.
      return;
    }
    if (action === "clear") {
      stop();
      return;
    }
    if (videoId !== getVideoId() || !/^[\w-]{11}$/.test(videoId || "")) {
      post({ type: "response", requestId, videoId, code: "STALE_VIDEO" });
      return;
    }
    const controller = new AbortController();
    requests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    const generation = requestVersion;
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
        if (generation !== requestVersion) throw fail("STALE_VIDEO");
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
          candidate,
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
        if (generation !== requestVersion || active !== current)
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
          if (response.status === 401 || response.status === 403) {
            candidates = candidates.filter(
              (entry) => entry !== current.candidate
            );
          }
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
      if (generation !== requestVersion || videoId !== getVideoId())
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
