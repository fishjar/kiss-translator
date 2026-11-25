import { loadTerminologySnapshot } from "../../libs/terminologyStorage";
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
  splitEventsIntoChunks,
} from "../youtubeSubtitleProcessing";
import { aiSegment } from "../youtubeAiSegmentation";

function selectPreviousSubtitlesContext(
  cues,
  nextChunkStartMs,
  { maxCount = 4, maxGapMs = 15000 } = {}
) {
  if (!Array.isArray(cues) || !cues.length) return [];
  const valid = cues.filter((cue) => cue?.text?.trim());
  if (!valid.length) return [];
  if (Number.isFinite(nextChunkStartMs)) {
    const last = valid[valid.length - 1];
    const lastEnd = Number(last?.end);
    const lastStart = Number(last?.start);
    if (
      !Number.isFinite(lastEnd) ||
      lastStart >= nextChunkStartMs ||
      nextChunkStartMs - lastEnd > maxGapMs
    ) {
      return [];
    }
  }
  return valid.slice(-maxCount).map((cue) => ({
    text: cue.text.trim(),
    translation:
      typeof cue.translation === "string" && !cue._isDraftTranslation
        ? cue.translation.trim()
        : "",
  }));
}
import { getDocInfo } from "../../libs/docInfo";
import { isSameLang } from "../youtubeCaptionTracks";
import { isNonSpeechSegment } from "../subtitleTextClassification";
import { decodeHTMLEntities } from "../../libs/html";
import { parseMathInText } from "../../libs/mathParse";
import { browser } from "../../libs/browser";
import { ASR_MAX_WAV_BYTES } from "./audioChunks";
import { alignedAsrWords } from "../../providers/asrWords";

function mergeZeroDurationCues(cues, language) {
  const firstValid = cues.findIndex((cue) => cue.end > cue.start);
  if (firstValid < 0) return cues;
  const separator = /^(zh|ja|ko|th|lo|km|my)(-|$)/.test(language) ? "" : " ";
  const result = [{ ...cues[firstValid] }];
  if (firstValid > 0) {
    result[0].start = Math.min(cues[0].start, result[0].start);
    result[0].text = cues
      .slice(0, firstValid + 1)
      .map((cue) => cue.text.trim())
      .join(separator);
    result[0].translation = "";
  }
  for (const cue of cues.slice(firstValid + 1)) {
    const previous = result[result.length - 1];
    if (cue.start === cue.end) {
      result[result.length - 1] = {
        ...previous,
        start: Math.min(previous.start, cue.start),
        end: Math.max(previous.end, cue.end),
        text: previous.text.trimEnd() + separator + cue.text.trimStart(),
        // Merged text must be translated together, including untimed words.
        translation: "",
      };
    } else result.push({ ...cue });
  }
  return result;
}

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
  setting = { ...setting };
  const { segmentationService, translationService } =
    resolvedAsrServices(setting);
  const tables = setting.terminologyTables
    ? Promise.resolve(setting.terminologyTables)
    : loadTerminologySnapshot(
        [setting, segmentationService, translationService].filter(Boolean)
      );
  const prepareTerms = async () => {
    setting.terminologyTables = await tables;
  };
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
    setLanguage(language) {
      fromLang = getFromLang(language);
    },
    setContextSummary(summary) {
      if (typeof summary === "string" && summary.trim()) {
        docInfo = { ...docInfo, summary: summary.trim() };
        enriched = true;
      }
    },
    async segment(
      segments,
      signal,
      waitUntilRunning = async () => {},
      onUpdate = () => {},
      previousCues = []
    ) {
      await prepareTerms();
      await waitUntilRunning(signal);
      const flatEvents = segments
        .filter(
          (segment) => segment.text.trim() && !isNonSpeechSegment(segment.text)
        )
        .flatMap((segment) => {
          const words = alignedAsrWords(segment);
          return words?.some((word) => word.end > word.start)
            ? words
            : [segment];
        })
        .map((segment) => ({
          start: segment.start * 1000,
          end: segment.end * 1000,
          text: segment.text,
        }));
      if (!flatEvents.length) return [];
      await enrich(segments, signal, waitUntilRunning);
      await waitUntilRunning(signal);
      const fallbackFor = (subFlatEvents) => {
        const subEvents = subFlatEvents.map((segment) => ({
          tStartMs: segment.start,
          dDurationMs: segment.end - segment.start,
          segs: [{ utf8: segment.text }],
        }));
        return mergeZeroDurationCues(
          builtinSegment(subEvents, subFlatEvents, fromLang, setting),
          fromLang
        );
      };
      if (!segmentationService) return fallbackFor(flatEvents);

      const chunks = splitEventsIntoChunks(
        flatEvents,
        setting.chunkLength || 2000
      );
      const completedCues = [];
      const clearSegmentTranslation =
        setting.forceSubtitleRetranslate &&
        segmentationService.apiSlug !== setting.apiSlug;
      const emitProgress = (currentStreamed = []) => {
        const merged = [...completedCues, ...currentStreamed].sort(
          (a, b) => a.start - b.start
        );
        if (merged.length) onUpdate(merged);
      };

      for (const chunkEvents of chunks) {
        await waitUntilRunning(signal);
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        const chunkPreviousCues = selectPreviousSubtitlesContext(
          completedCues.length ? completedCues : previousCues,
          chunkEvents[0]?.start
        );
        const streamedByKey = new Map();
        const chunkCues = await aiSegment({
          videoId: identity.videoId,
          fromLang,
          toLang: setting.toLang,
          chunkEvents,
          segApiSetting: segmentationService,
          apiSubtitle: async (options) => {
            await waitUntilRunning(signal);
            return apiSubtitle(options);
          },
          docInfo,
          previousCues: chunkPreviousCues,
          signal,
          setting,
          formatSubtitles: (items, language) =>
            formatSubtitles(items, language, {
              longSentenceThreshold: setting.longSentenceThreshold,
            }),
          clearSegmentTranslation,
          onSubtitleChunk: ({ subtitles: streamed }) => {
            if (signal.aborted || !streamed?.length) return;
            for (const cue of streamed) {
              if (!cue?.text?.trim()) continue;
              const key = `${Math.round(cue.start)}:${Math.round(cue.end)}`;
              streamedByKey.set(key, { ...cue, timingSource: "asr" });
            }
            if (streamedByKey.size) {
              emitProgress([...streamedByKey.values()]);
            }
          },
        });
        // Boundaries must come from actual segment or aligned-word timestamps.
        const valid =
          chunkCues.some((cue) => cue.end > cue.start) &&
          !chunkCues.some(
            (cue) =>
              !chunkEvents.some(
                (event) => Math.abs(event.start - cue.start) < 1
              ) ||
              !chunkEvents.some((event) => Math.abs(event.end - cue.end) < 1)
          );
        const resolved = valid
          ? mergeZeroDurationCues(chunkCues, fromLang)
          : fallbackFor(chunkEvents);
        completedCues.push(...resolved);
        emitProgress();
      }
      return mergeZeroDurationCues(completedCues, fromLang);
    },
    async translate(
      cues,
      signal,
      onUpdate = () => {},
      waitUntilRunning = async () => {}
    ) {
      await prepareTerms();
      if (signal.aborted)
        throw signal.reason || new DOMException("Cancelled", "AbortError");
      if (
        cues.some((cue) => !cue.translation?.trim() || cue._isDraftTranslation)
      )
        await enrich(cues, signal, waitUntilRunning);
      const output = cues.map((cue) => ({ ...cue }));
      const pendingCues = output.filter(
        (cue) => !cue.translation?.trim() || cue._isDraftTranslation
      );
      if (!pendingCues.length) return output;

      if (
        isSameLang(fromLang, setting.toLang, setting.translateVariants ?? true)
      ) {
        for (const cue of pendingCues) {
          await waitUntilRunning(signal);
          if (signal.aborted)
            throw signal.reason || new DOMException("Cancelled", "AbortError");
          const raw = cue.text || "";
          cue.translation = setting.parseLatex
            ? parseMathInText(decodeHTMLEntities(raw))
            : decodeHTMLEntities(raw);
          cue._isDraftTranslation = false;
          onUpdate(output);
        }
        return output;
      }

      if (!translationService)
        throw Object.assign(new Error("No subtitle translation service."), {
          code: "SERVICE_UNAVAILABLE",
        });

      const currentFromLang = fromLang;
      const currentDocInfo = docInfo;
      const translateCue = async (cue) => {
        const result = await apiTranslate({
          text: cue.text,
          scene: setting,
          onTerminologyWarning: setting.onTerminologyWarning,
          terminologyTables: setting.terminologyTables,
          fromLang: currentFromLang,
          toLang: setting.toLang,
          apiSetting: translationService,
          docInfo: currentDocInfo,
          translateVariants: setting.translateVariants ?? true,
          signal,
          onStreamChunk: ({ text: partialText }) => {
            if (signal.aborted || typeof partialText !== "string") return;
            const trimmed = partialText.trim();
            if (!trimmed) return;
            cue.translation = setting.parseLatex
              ? parseMathInText(decodeHTMLEntities(trimmed))
              : decodeHTMLEntities(trimmed);
            onUpdate(output);
          },
        });
        let text = Array.isArray(result?.trText)
          ? result.trText[0]
          : result?.trText;
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
      };

      const groupSize = translationService.useBatchFetch
        ? Math.max(1, Number(translationService.batchSize) || 20)
        : 1;
      for (let i = 0; i < pendingCues.length; i += groupSize) {
        await waitUntilRunning(signal);
        if (signal.aborted)
          throw signal.reason || new DOMException("Cancelled", "AbortError");
        const group = pendingCues.slice(i, i + groupSize);
        await Promise.all(group.map(translateCue));
      }
      return output;
    },
  };
}
