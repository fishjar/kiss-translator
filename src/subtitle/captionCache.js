import { sendBgMsg } from "../libs/msg";
import { isExt } from "../libs/client";
import { getCacheDigest } from "../libs/cacheDigest";
import { MSG_YOUTUBE_CAPTION_CACHE } from "../config/msg";
import {
  availableApiForScene,
  withScenePrompt,
} from "../config/serviceSelection";
import { resolveApiPromptSettings } from "../config/prompt";

export const captionCueKey = ({ start, end, text }) =>
  JSON.stringify([start, end, text]);

const nonContentFields = new Set([
  "apiName",
  "httpTimeout",
  "fetchLimit",
  "fetchInterval",
  "batchInterval",
  "batchConcurrency",
  "requestTimes",
  "lastRequest",
  "lastUpdated",
  "updatedAt",
  "modelListUrl",
  "streamRenderMode",
  "transAllnow",
  "rootMargin",
]);
const ordered = (value) =>
  Array.isArray(value)
    ? value.map(ordered)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, ordered(value[key])]),
        )
      : value;
const serviceSignature = (service, setting) =>
  service &&
  Object.fromEntries(
    Object.entries(
      resolveApiPromptSettings(service, setting.prompts, setting),
    ).filter(([key]) => !nonContentFields.has(key)),
  );
const digest = (value) => getCacheDigest(JSON.stringify(ordered(value)));

export function captionCacheRequest(action, args = {}) {
  return isExt
    ? sendBgMsg(MSG_YOUTUBE_CAPTION_CACHE, { action, ...args })
    : Promise.resolve(null);
}

/** Persist only a digest, never service credentials or executable plugin settings. */
export function captionSegmentationSignature(setting) {
  const service = setting.transApis?.find(
    (api) => api.apiSlug === setting.segSlug,
  );
  const contextService = setting.transApis?.find(
    (api) => api.apiSlug === setting.aiContextSlug,
  );
  const ai = !!service && setting.segSlug !== "-";
  return digest({
    version: 3,
    mode: setting.useAlgorithmBreaker || "rule",
    threshold: setting.longSentenceThreshold ?? 120,
    ...(ai &&
      contextService && {
        contextService: serviceSignature(contextService, setting),
        contextLanguage: setting.toLang,
      }),
    ...(ai && {
      service: serviceSignature(service, setting),
      toLang: setting.toLang,
      segPromptMode: setting.segPromptMode,
      segPromptSlug: setting.segPromptSlug,
      subtitlePrompt: setting.subtitlePrompt,
      chunkLength: setting.chunkLength,
    }),
  });
}

export function captionTranslationSignature(setting) {
  const selected =
    availableApiForScene(setting, setting.transApis || [], "translate") ||
    (!setting.transApis && setting.apiSetting);
  return digest({
    version: 2,
    toLang: setting.toLang,
    apiSlug: setting.apiSlug,
    service:
      selected && serviceSignature(withScenePrompt(selected, setting), setting),
    contextService: serviceSignature(
      setting.transApis?.find((api) => api.apiSlug === setting.aiContextSlug),
      setting,
    ),
    translateVariants: setting.translateVariants ?? true,
    parseLatex: !!setting.parseLatex,
    forceSubtitleRetranslate: !!setting.forceSubtitleRetranslate,
    // AI segmentation can also supply the final translation.
    segmentation: setting.segSlug,
  });
}
