const audioWaitLabel = (reason) =>
  ({
    NEED_PLAYBACK: "youtube_asr_waiting",
    WAITING_FOR_PLAYER: "youtube_asr_waiting_player",
    AUDIO_CAPTURE_MISSING: "youtube_asr_waiting_capture",
    NATIVE_AUDIO_NOT_CONFIRMED: "youtube_asr_waiting_capture",
    INVALID_SABR_BODY: "youtube_asr_waiting_capture",
    INCOMPLETE_UMP: "youtube_asr_waiting_capture",
    AUDIO_TIMEOUT: "youtube_asr_waiting_bridge",
  })[reason] || "youtube_asr_preparing_audio";

/** Keep a bounded diagnostic, never request URLs or configured credentials. */
export function asrFailure(cause, service = {}) {
  const errorCode = /^[A-Z_]{1,64}$/.test(cause?.code)
    ? cause.code
    : "ASR_FAILED";
  let errorDetail = typeof cause?.message === "string" ? cause.message : "";
  const redact = (config) => {
    for (const [key, value] of Object.entries(config || {})) {
      if (value && typeof value === "object") redact(value);
      else if (
        /key|token|secret|password|authorization/i.test(key) &&
        typeof value === "string" &&
        value
      )
        errorDetail = errorDetail.split(value).join("[redacted]");
    }
  };
  redact(service);
  errorDetail = errorDetail
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s,"';}]+/gi,
      "$1[redacted]"
    )
    .replace(/sk-[\w-]+/g, "[redacted]")
    .split(/[\r\n]/)[0]
    .slice(0, 240);
  if (/^\s*(?:\{|\[\s*[[{"\d]|<)/.test(errorDetail)) errorDetail = "";
  return { errorCode, errorDetail };
}

/** Semantic events only, independent of progress refreshes and menu visibility. */
export function asrFeedbackEvents(state, i18n) {
  const events = [];
  const add = (key, label, error = false) =>
    events.push({ key, message: i18n(label), error });
  if (state.phase === "waiting") add("start", "youtube_asr_started");
  if (state.phase === "cached" || state.cacheRestored)
    add("cached", "youtube_asr_cached");
  if (state.phase === "complete") add("complete", "youtube_asr_complete");
  if (state.timingSource === "audio-chunk")
    add("chunk-timing", "youtube_asr_chunk_timing_hint");
  if (state.timestampDowngraded)
    add("downgraded", "youtube_asr_timestamp_downgraded");
  const audio = state.audio || {};
  const waitReason = audio.code || state.waitReason;
  if (state.phase === "waiting" && waitReason)
    add(`waiting:${waitReason}`, audioWaitLabel(waitReason));
  if (audio.code === "AUDIO_QUOTA") add("quota", "youtube_asr_quota", true);
  else if (audio.phase === "error")
    add(`audio:${audio.code}`, "youtube_asr_audio_error", true);
  if (audio.cooldownUntil > Date.now())
    add(
      `cooldown:${audio.cooldownUntil}`,
      "youtube_caption_rate_limited",
      true
    );
  if (state.recognitionError || state.error)
    add(
      `recognition:${state.recognitionError || state.error}`,
      {
        NEED_PLAYBACK: "youtube_asr_playback_timeout",
        WAITING_FOR_PLAYER: "youtube_asr_player_timeout",
        AUDIO_CAPTURE_MISSING: "youtube_asr_capture_missing",
        NATIVE_AUDIO_NOT_CONFIRMED: "youtube_asr_capture_invalid",
        INVALID_SABR_BODY: "youtube_asr_capture_invalid",
        INCOMPLETE_UMP: "youtube_asr_capture_invalid",
        INVALID_AUDIO_RESPONSE: "youtube_asr_capture_invalid",
        AUDIO_RESPONSE_TOO_LARGE: "youtube_asr_capture_invalid",
        AUDIO_HTTP_ERROR: "youtube_asr_audio_error",
        AAC_TRACK_UNAVAILABLE: "youtube_asr_codec_unsupported",
        AUDIO_IDENTITY_MISSING: "youtube_asr_capture_invalid",
        AUDIO_DECODE_FAILED: "youtube_asr_decode_error",
        AAC_UNSUPPORTED: "youtube_asr_codec_unsupported",
        INVALID_RESPONSE: "youtube_asr_invalid_response",
        SERVICE_UNAVAILABLE: "youtube_asr_service_unavailable",
        CAPABILITY_UNSUPPORTED: "youtube_asr_service_unavailable",
        AUDIO_NETWORK: "youtube_asr_audio_error",
        AUDIO_TIMEOUT: "youtube_caption_timeout",
        AUDIO_STALLED: "youtube_caption_timeout",
      }[state.recognitionError || state.error] || "youtube_asr_error",
      true
    );
  if (state.translationError)
    add(
      `translation:${state.translationError}`,
      "youtube_asr_translation_failed",
      true
    );
  if (state.cacheSaved === false) add("cache", "youtube_asr_unsaved", true);
  if (state.cacheDeleteError)
    add("cache-delete", "youtube_asr_cache_delete_failed", true);
  if (state.exportError)
    add(`export:${state.exportError}`, "youtube_asr_export_error", true);
  return events;
}
