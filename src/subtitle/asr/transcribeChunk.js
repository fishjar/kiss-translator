import { invokeService } from "../../providers/serviceRuntime";
import { invokeBridgedService } from "../../providers/bridgeInvocation";
import { createAssetStore } from "../../providers/transport";
import { validateResult } from "../../providers/validation";
import { providerError } from "../../providers/capabilities";
import { enabledApiCapabilities } from "../../config/serviceSelection";
import { ASR_SAMPLE_RATE, ASR_MAX_WAV_BYTES, asrWav } from "./audioChunks";
import { asrChunkDurationSeconds } from "./timing";
import { isHostedLocalAsr } from "../../providers/localAsrRouting";

/** One independent ASR file. The session scheduler owns serialization/retries. */
export async function transcribeAudioChunk(
  service,
  chunk,
  { signal, language, onProgress } = {}
) {
  const checkCancelled = () => {
    if (signal?.aborted)
      throw signal.reason || new DOMException("Cancelled", "AbortError");
  };
  checkCancelled();
  const { startSample, endSample, audio, silent } = chunk;
  if (
    !Number.isSafeInteger(startSample) ||
    startSample < 0 ||
    !Number.isSafeInteger(endSample) ||
    endSample <= startSample ||
    !(audio instanceof Float32Array) ||
    audio.length !== endSample - startSample
  )
    throw providerError("INVALID_INPUT", "Invalid audio chunk interval.");
  const duration = audio.length / ASR_SAMPLE_RATE;
  if (duration > asrChunkDurationSeconds(service))
    throw providerError(
      "INPUT_LIMIT_EXCEEDED",
      "Split audio before transcription."
    );
  if (silent)
    return {
      segments: [],
      events: [],
      startSample,
      endSample,
      silent: true,
      timingSource: "audio-chunk",
    };
  if (
    service.isDisabled ||
    !enabledApiCapabilities(service).includes("transcribe")
  )
    throw providerError(
      "CAPABILITY_UNSUPPORTED",
      "Video ASR requires an enabled transcription service."
    );
  const assets = createAssetStore();
  let call, events;
  try {
    const wav = asrWav(audio);
    if (wav.size > ASR_MAX_WAV_BYTES)
      throw providerError(
        "RESOURCE_BUDGET_EXCEEDED",
        "Split audio to fit the service asset budget."
      );
    const input = {
      audio: assets.put(wav),
      requireTimestamps: false,
      ...(language && { language }),
    };
    const external =
      service.provider?.implementation &&
      service.provider.implementation.kind !== "native";
    const hosted = external || isHostedLocalAsr(service, "transcribe");
    const options = {
      assets,
      // The host bridge disconnects immediately on abort. Keep its bounded in-flight
      // request until settlement so reopening the same video cannot bypass the slot.
      signal: hosted ? undefined : signal,
      streaming: "disabled",
    };
    call = hosted
      ? invokeBridgedService(service.apiSlug, "transcribe", input, options)
      : invokeService(service, "transcribe", input, options);
    if (onProgress && call.events) {
      events = (async () => {
        for await (const event of call.events)
          if (!signal?.aborted && event.type === "progress") onProgress(event);
      })();
      events.catch(() => {});
    }
    const result = await call.result;
    checkCancelled();
    validateResult("transcribe", result, input);
    const timingSource = result.segments?.length ? "asr" : "audio-chunk";
    let lastStart = -1;
    const segments =
      timingSource === "audio-chunk"
        ? result.text.trim()
          ? [
              {
                start: startSample / ASR_SAMPLE_RATE,
                end: endSample / ASR_SAMPLE_RATE,
                text: result.text,
              },
            ]
          : []
        : result.segments.map(({ start, end, text }) => {
            if (
              start < lastStart ||
              end > duration ||
              (text.trim() && end <= start)
            )
              throw providerError(
                "INVALID_RESPONSE",
                "ASR timestamps exceed the audio chunk or are unordered."
              );
            lastStart = start;
            return {
              start: startSample / ASR_SAMPLE_RATE + start,
              end: startSample / ASR_SAMPLE_RATE + end,
              text,
            };
          });
    return {
      startSample,
      endSample,
      silent: false,
      timingSource,
      segments,
      events: segments
        .filter((segment) => segment.text.trim())
        .map((segment) => ({
          tStartMs: segment.start * 1000,
          dDurationMs: (segment.end - segment.start) * 1000,
          segs: [{ utf8: segment.text }],
        })),
    };
  } finally {
    call?.cancel();
    await call?.finished;
    await events?.catch(() => {});
    assets.clear();
  }
}
