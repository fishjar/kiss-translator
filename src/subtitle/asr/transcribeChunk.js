import { serviceInvocationOptions } from "../../providers/timeout";
import { invokeService } from "../../providers/serviceRuntime";
import { invokeBridgedService } from "../../providers/bridgeInvocation";
import { createAssetStore } from "../../providers/transport";
import { validateResult } from "../../providers/validation";
import { providerError } from "../../providers/capabilities";
import { enabledApiCapabilities } from "../../config/serviceSelection";
import { ASR_SAMPLE_RATE, ASR_MAX_WAV_BYTES, asrWav } from "./audioChunks";
import { asrChunkDurationSeconds, isLocalAsrService } from "./timing";
import { isHostedLocalAsr } from "../../providers/localAsrRouting";
import { alignedAsrWords } from "../../providers/asrWords";
import { logger } from "../../libs/log";
import { startLogTask } from "../../libs/diagnostics/task";

/** One independent ASR file. The session scheduler owns serialization/retries. */
export async function transcribeAudioChunk(
  service,
  chunk,
  {
    signal,
    language,
    onProgress,
    prepareAudio,
    maxBytes = ASR_MAX_WAV_BYTES,
    maxDurationSeconds = Infinity,
  } = {}
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
  const local = isLocalAsrService(service);
  let leadingSeconds = 0;
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
  const task = startLogTask("subtitle-asr", { serviceId: service.apiSlug });
  let call, events;
  try {
    let file;
    if (local)
      file = new File([asrWav(audio)], "input.wav", { type: "audio/wav" });
    else {
      if (!prepareAudio)
        throw providerError(
          "INVALID_INPUT",
          "Compressed ASR audio is required."
        );
      const prepared = await prepareAudio();
      checkCancelled();
      const logicalStart = startSample / ASR_SAMPLE_RATE;
      if (
        !prepared?.blob ||
        prepared.blob.type !== "audio/mp4" ||
        !Number.isFinite(prepared.startMs) ||
        !Number.isFinite(prepared.endMs) ||
        prepared.startMs < 0 ||
        prepared.startMs > logicalStart * 1000 + 0.001 ||
        prepared.endMs < endSample / 16 - 0.001
      )
        throw providerError("INVALID_INPUT", "Invalid M4A audio interval.");
      if (
        (prepared.endMs - prepared.startMs) / 1000 >
        Math.min(asrChunkDurationSeconds(service), maxDurationSeconds) + 1e-6
      )
        throw providerError(
          "INPUT_LIMIT_EXCEEDED",
          "Split audio before transcription."
        );
      leadingSeconds = logicalStart - prepared.startMs / 1000;
      file = new File([prepared.blob], "input.m4a", { type: "audio/mp4" });
    }
    if (file.size > Math.min(maxBytes, ASR_MAX_WAV_BYTES))
      throw providerError(
        "RESOURCE_BUDGET_EXCEEDED",
        "Split audio to fit the service asset budget."
      );
    const input = {
      audio: assets.put(file),
      requireTimestamps: false,
      ...(language && { language }),
    };
    const external =
      service.provider?.implementation &&
      service.provider.implementation.kind !== "native";
    const hosted = external || isHostedLocalAsr(service, "transcribe");
    const options = serviceInvocationOptions(service, {
      assets,
      // The host bridge disconnects immediately on abort. Keep its bounded in-flight
      // request until settlement so reopening the same video cannot bypass the slot.
      signal: hosted ? undefined : signal,
      streaming: "disabled",
    });
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
    task.finish();
    if (result.languagePending)
      return {
        startSample,
        endSample,
        languagePending: true,
        segments: [],
        events: [],
      };
    let timingSource = result.segments?.length ? "asr" : "audio-chunk";
    let segments = [];
    if (timingSource === "asr") {
      let lastStart = -1;
      let valid = true;
      const parsed = [];
      for (const seg of result.segments) {
        const text = seg.text || "";
        const rawStart = Number(seg.start) - leadingSeconds;
        const rawEnd = Number(seg.end) - leadingSeconds;
        if (
          !local &&
          rawEnd > rawStart &&
          (rawEnd <= 0 || rawStart >= duration)
        )
          continue;
        // 方案 B：对时间戳进行容差钳位，避免短音频末尾或微小浮点溢出导致整块抛弃
        const start = Math.max(0, Math.min(duration, rawStart));
        const end = Math.max(start, Math.min(duration, rawEnd));
        // Standalone trailing punctuation has no acoustic duration. Attach it to
        // the preceding cue without discarding genuine sentence/word timings.
        const previous = parsed[parsed.length - 1];
        if (
          Number.isFinite(start) &&
          end === start &&
          start >= lastStart &&
          previous &&
          /^[\p{P}\s]+$/u.test(text) &&
          text.trim()
        ) {
          const punctuation = text.trim();
          previous.text += punctuation;
          if (previous.words)
            previous.words[previous.words.length - 1].text += punctuation;
          continue;
        }
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < lastStart ||
          (text.trim() && end <= start)
        ) {
          logger.child("subtitle").warn(
            "[YouTube ASR] timestamp fallback",
            JSON.stringify({
              startSample,
              endSample,
              duration,
              reason:
                !Number.isFinite(start) || !Number.isFinite(end)
                  ? "non-finite"
                  : start < lastStart
                    ? "unordered"
                    : "zero-duration",
              segment: parsed.length,
              start: rawStart,
              end: rawEnd,
              textLength: text.length,
              wordCount: seg.words?.length || 0,
            })
          );
          valid = false;
          break;
        }
        lastStart = start;
        const rawWords = alignedAsrWords(seg);
        const words = rawWords
          ?.filter((word) =>
            word.start === word.end
              ? word.start - leadingSeconds >= start &&
                word.end - leadingSeconds <= end
              : word.end - leadingSeconds > start &&
                word.start - leadingSeconds < end
          )
          .map((word) => ({
            ...word,
            start: Math.max(start, Math.min(end, word.start - leadingSeconds)),
            end: Math.max(start, Math.min(end, word.end - leadingSeconds)),
          }));
        const clippedText =
          rawWords && words.length !== rawWords.length
            ? words.map((word) => word.text).join("")
            : text;
        const offset = startSample / ASR_SAMPLE_RATE;
        parsed.push({
          start: startSample / ASR_SAMPLE_RATE + start,
          end: startSample / ASR_SAMPLE_RATE + end,
          text: clippedText,
          ...(words?.length && {
            words: words.map((word) => ({
              ...word,
              start: word.start + offset,
              end: word.end + offset,
            })),
          }),
        });
      }
      if (valid) {
        segments = parsed;
      } else {
        // 时间戳异常无法修复时，平滑降级为整段音频起止时间
        timingSource = "audio-chunk";
      }
    }
    if (timingSource === "audio-chunk") {
      const fullText = (
        result.text ||
        result.segments
          ?.map((s) => s.text)
          .filter(Boolean)
          .join(" ") ||
        ""
      ).trim();
      segments = fullText
        ? [
            {
              start: startSample / ASR_SAMPLE_RATE,
              end: endSample / ASR_SAMPLE_RATE,
              text: fullText,
            },
          ]
        : [];
    }
    logger.child("subtitle").debug(
      "[YouTube ASR] timing result",
      JSON.stringify({
        startSample,
        endSample,
        timingSource,
        inputSegments: result.segments?.length || 0,
        inputWords:
          result.segments?.reduce(
            (sum, seg) => sum + (seg.words?.length || 0),
            0
          ) || 0,
        outputSegments: segments.length,
        outputWords: segments.reduce(
          (sum, seg) => sum + (seg.words?.length || 0),
          0
        ),
      })
    );
    return {
      startSample,
      endSample,
      silent: false,
      timingSource,
      ...(result.language && { language: result.language }),
      ...(result.languageConfidence !== undefined && {
        languageConfidence: result.languageConfidence,
      }),
      segments,
      events: segments
        .flatMap((segment) => alignedAsrWords(segment) || [segment])
        .filter((segment) => segment.text.trim())
        .map((segment) => ({
          tStartMs: segment.start * 1000,
          dDurationMs: (segment.end - segment.start) * 1000,
          segs: [{ utf8: segment.text }],
        })),
    };
  } catch (error) {
    task.finish(error);
    throw error;
  } finally {
    call?.cancel();
    await call?.finished;
    await events?.catch(() => {});
    assets.clear();
  }
}
