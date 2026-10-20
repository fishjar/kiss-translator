import { apiTranslate, apiSubtitle, apiSummarizeContext } from "../../apis";
import { resolveApiPromptSettings } from "../../config/prompt";
import {
  availableApiForScene,
  withScenePrompt,
} from "../../config/serviceSelection";
import {
  builtinSegment,
  formatSubtitles,
  getFromLang,
} from "../youtubeSubtitleProcessing";
import { aiSegment } from "../youtubeAiSegmentation";
import { getDocInfo } from "../../libs/docInfo";
import { isSameLang } from "../youtubeCaptionTracks";
import { isNonSpeechSegment } from "../subtitleTextClassification";
import { decodeHTMLEntities } from "../../libs/html";
import { parseMathInText } from "../../libs/mathParse";
import { browser } from "../../libs/browser";
import { ASR_MAX_WAV_BYTES } from "./audioChunks";
import { alignedAsrWords } from "../../providers/asrWords";

export function resolvedAsrServices(setting) {
  const transApis = setting.transApis || [];
  const segmentationService = transApis.find(
    (service) => service.apiSlug === setting.segSlug && !service.isDisabled
  );
  return {
    asrService: availableApiForScene(
      setting,
      transApis,
      "transcribe",
      {},
      "asrApiSlug"
    ),
    segmentationService:
      segmentationService &&
      resolveApiPromptSettings(segmentationService, setting.prompts, setting),
    contextService: availableApiForScene(
      setting,
      transApis,
      "summarize",
      {},
      "aiContextSlug"
    ),
    translationService:
      setting.apiSetting &&
      resolveApiPromptSettings(
        withScenePrompt(setting.apiSetting, setting),
        setting.prompts,
        setting
      ),
  };
}

export async function effectiveAsrLimits(service) {
  if (service.apiType !== "LocalAI") return { maxBytes: ASR_MAX_WAV_BYTES };
  const { DEFAULT_SETTINGS } = await import("../../localAi/core/types");
  const saved =
    (await browser.storage.local.get("kiss-ai-settings"))["kiss-ai-settings"] ||
    {};
  const minutes =
    Number.isFinite(saved.maxAsrMinutes) && saved.maxAsrMinutes > 0
      ? saved.maxAsrMinutes
      : DEFAULT_SETTINGS.maxAsrMinutes;
  const megabytes =
    Number.isFinite(saved.maxAudioFileMB) && saved.maxAudioFileMB > 0
      ? saved.maxAudioFileMB
      : DEFAULT_SETTINGS.maxAudioFileMB;
  return {
    maxBytes: Math.min(ASR_MAX_WAV_BYTES, Math.floor(megabytes * 1024 * 1024)),
    maxModelDurationSeconds: Math.min(30, minutes * 60),
  };
}

/** Existing subtitle services, with all timings anchored to actual ASR segments. */
export function createAsrTextProcessor(setting, identity) {
  const { segmentationService, translationService } =
    resolvedAsrServices(setting);
  let fromLang = getFromLang(identity.sourceLanguage);
  let docInfo = getDocInfo(),
    enriched = false;
  const enrich = async (segments, signal, waitUntilRunning) => {
    if (enriched) return;
    enriched = true;
    const context = availableApiForScene(
      setting,
      setting.transApis,
      "summarize",
      {},
      "aiContextSlug"
    );
    if (!context) return;
    try {
      await waitUntilRunning(signal);
      const summary = await apiSummarizeContext({
        videoId: identity.videoId,
        title: docInfo.title || document.title,
        description: docInfo.description || "",
        transcript: segments.map((segment) => segment.text).join("\n"),
        apiSetting: context,
      });
      if (signal.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      if (summary) docInfo = { ...docInfo, summary };
    } catch (cause) {
      if (signal.aborted) throw signal.reason || cause;
    }
  };
  return {
    setLanguage(language) { fromLang = getFromLang(language); },
    async segment(segments, signal, waitUntilRunning = async () => {}) {
      await waitUntilRunning(signal);
      const flatEvents = segments
        .filter(
          (segment) => segment.text.trim() && !isNonSpeechSegment(segment.text)
        )
        .flatMap((segment) => alignedAsrWords(segment) || [segment])
        .map((segment) => ({
          start: segment.start * 1000,
          end: segment.end * 1000,
          text: segment.text,
        }));
      const events = flatEvents.map((segment) => ({
        tStartMs: segment.start,
        dDurationMs: segment.end - segment.start,
        segs: [{ utf8: segment.text }],
      }));
      if (!flatEvents.length) return [];
      await enrich(segments, signal, waitUntilRunning);
      await waitUntilRunning(signal);
      const fallback = () =>
        builtinSegment(events, flatEvents, fromLang, setting);
      if (!segmentationService) return fallback();
      const cues = await aiSegment({
        videoId: identity.videoId,
        fromLang,
        toLang: setting.toLang,
        chunkEvents: flatEvents,
        segApiSetting: segmentationService,
        apiSubtitle: async (options) => {
          await waitUntilRunning(signal);
          return apiSubtitle(options);
        },
        docInfo,
        signal,
        setting,
        formatSubtitles: (items, language) =>
          formatSubtitles(items, language, {
            longSentenceThreshold: setting.longSentenceThreshold,
          }),
        clearSegmentTranslation:
          setting.forceSubtitleRetranslate &&
          segmentationService.apiSlug !== setting.apiSlug,
      });
      // Boundaries must come from actual segment or aligned-word timestamps.
      if (
        cues.some(
          (cue) =>
            !flatEvents.some(
              (event) => Math.abs(event.start - cue.start) < 1
            ) || !flatEvents.some((event) => Math.abs(event.end - cue.end) < 1)
        )
      )
        return fallback();
      return cues;
    },
    async translate(cues, signal, onUpdate = () => {}, waitUntilRunning = async () => {}) {
      if (signal.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      if (
        cues.some((cue) => !cue.translation?.trim() || cue._isDraftTranslation)
      )
        await enrich(cues, signal, waitUntilRunning);
      const output = cues.map((cue) => ({ ...cue }));
      for (const cue of output) {
        await waitUntilRunning(signal);
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        if (cue.translation?.trim() && !cue._isDraftTranslation) continue;
        let text;
        if (
          isSameLang(
            fromLang,
            setting.toLang,
            setting.translateVariants ?? true
          )
        )
          text = cue.text;
        else {
          if (!translationService)
            throw Object.assign(new Error("No subtitle translation service."), {
              code: "SERVICE_UNAVAILABLE",
            });
          await waitUntilRunning(signal);
          const result = await apiTranslate({
            text: cue.text,
            fromLang,
            toLang: setting.toLang,
            apiSetting: translationService,
            docInfo,
            translateVariants: setting.translateVariants ?? true,
            signal,
          });
          text = Array.isArray(result?.trText)
            ? result.trText[0]
            : result?.trText;
        }
        if (typeof text !== "string" || !text.trim()) {
          text = cue.text || "";
        }
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        cue.translation = setting.parseLatex
          ? parseMathInText(decodeHTMLEntities(text))
          : decodeHTMLEntities(text);
        cue._isDraftTranslation = false;
        onUpdate(output);
      }
      return output;
    },
  };
}
