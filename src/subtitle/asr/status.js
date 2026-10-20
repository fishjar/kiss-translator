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

export const ASR_ERROR_LABELS = {
  LANGUAGE_UNCERTAIN: "youtube_asr_language_uncertain",
  LANGUAGE_DETECTION_PENDING: "youtube_asr_language_pending",
  LANGUAGE_DETECTION_UNAVAILABLE: "youtube_asr_language_uncertain",
  UNSUPPORTED_LANGUAGE: "youtube_asr_language_unsupported",
  NEED_PLAYBACK: "youtube_asr_need_playback",
  WAITING_FOR_PLAYER: "youtube_asr_player_timeout",
  AUDIO_CAPTURE_MISSING: "youtube_asr_capture_missing",
  NATIVE_AUDIO_NOT_CONFIRMED: "youtube_asr_capture_invalid",
  INVALID_SABR_BODY: "youtube_asr_capture_invalid",
  INCOMPLETE_UMP: "youtube_asr_capture_invalid",
  INVALID_AUDIO_RESPONSE: "youtube_asr_capture_invalid",
  AUDIO_RESPONSE_TOO_LARGE: "youtube_asr_capture_invalid",
  AUDIO_HTTP_ERROR: "youtube_asr_http_error",
  AUDIO_AUTH_EXPIRED: "youtube_asr_auth_expired",
  AUDIO_RATE_LIMITED: "youtube_caption_rate_limited",
  ATTESTATION_PENDING: "youtube_asr_attestation_error",
  ATTESTATION_REJECTED: "youtube_asr_attestation_error",
  AUDIO_EMPTY: "youtube_asr_audio_empty",
  AUDIO_NO_PROGRESS: "youtube_asr_audio_timeout",
  AUDIO_GAP: "youtube_asr_capture_invalid",
  AUDIO_SEGMENT_MISMATCH: "youtube_asr_capture_invalid",
  INVALID_AUDIO_SEGMENT: "youtube_asr_capture_invalid",
  AUDIO_DURATION_MISMATCH: "youtube_asr_capture_invalid",
  AUDIO_IDENTITY_MISMATCH: "youtube_asr_capture_invalid",
  AAC_TRACK_UNAVAILABLE: "youtube_asr_codec_unsupported",
  AUDIO_IDENTITY_MISSING: "youtube_asr_capture_invalid",
  AUDIO_DECODE_FAILED: "youtube_asr_decode_error",
  AAC_UNSUPPORTED: "youtube_asr_codec_unsupported",
  INVALID_RESPONSE: "youtube_asr_invalid_response",
  SERVICE_UNAVAILABLE: "youtube_asr_service_unavailable",
  CAPABILITY_UNSUPPORTED: "youtube_asr_service_unavailable",
  AUDIO_NETWORK: "youtube_asr_network_error",
  AUDIO_TIMEOUT: "youtube_asr_audio_timeout",
  AUDIO_STALLED: "youtube_asr_audio_timeout",
  CACHE_CONNECTION_TIMEOUT: "youtube_asr_cache_connection_timeout",
  CACHE_TIMEOUT: "youtube_asr_cache_timeout",
  AUDIO_CACHE_MISSING: "youtube_asr_cache_read_error",
  AUDIO_SESSION_MISSING: "youtube_asr_cache_read_error",
  CACHE_DISCONNECTED: "youtube_asr_cache_read_error",
  CACHE_CLOSED: "youtube_asr_cache_read_error",
  AUDIO_CACHE_FAILED: "youtube_asr_cache_write_error",
  CACHE_WRITE_FAILED: "youtube_asr_cache_write_error",
  CACHE_READ_FAILED: "youtube_asr_cache_read_error",
  ASR_FAILED: "youtube_asr_error",
  TRANSLATION_FAILED: "youtube_asr_translation_failed",
};

export function asrErrorDescription(code, i18n) {
  const key = ASR_ERROR_LABELS[code];
  if (!code || typeof i18n !== "function") return undefined;
  return key ? i18n(key) : `${i18n("youtube_asr_task_failed")} [${/^[A-Z_]{1,64}$/.test(code) ? code : "UNKNOWN_ERROR"}]`;
}

export function asrStoppedDescription(state, i18n) {
  const failures = state.failures?.length ? state.failures : [{
    stage: "recognition", code: state.error || state.recognitionError || state.audio?.code || state.translationError,
  }];
  const labels = { audio: "youtube_asr_audio_label", cutting: "youtube_asr_cutting_label",
    recognition: "youtube_asr_recognition_label", translation: "youtube_asr_translation_label" };
  const groups = new Map();
  for (const failure of failures) {
    const key = `${failure.stage}:${failure.code}`;
    const group = groups.get(key) || { ...failure, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].map(failure =>
    `${i18n(labels[failure.stage] || labels.recognition)}: ${asrErrorDescription(failure.code, i18n) || i18n("youtube_asr_task_failed")}${failure.count > 1 ? ` ×${failure.count}` : ""}`
  ).join("; ");
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
  if (state.stoppedByError && !state.retrying && !state.paused) {
    events.push({ key: `stopped:${JSON.stringify(state.failures || state.error)}`,
      message: asrStoppedDescription(state, i18n), error: true });
  }
  if (audio.cooldownUntil > Date.now() && !state.stoppedByError)
    add(
      `cooldown:${audio.cooldownUntil}`,
      "youtube_caption_rate_limited",
      false
    );
  if (state.cacheSaved === false && state.cacheMode !== "session")
    events.push({ key: "cache", error: false, message: state.cacheWarning === "CACHE_WRITE_FAILED"
      ? i18n("youtube_asr_cache_session_fallback")
      : asrErrorDescription(state.cacheWarning, i18n) || i18n("youtube_asr_unsaved") });
  if (state.cacheDeleteError)
    add("cache-delete", "youtube_asr_cache_delete_failed", true);
  if (state.exportError)
    add(`export:${state.exportError}`, "youtube_asr_export_error", true);
  return events;
}
