import { AsrAudioChunker } from "./audioChunks";
import { asrChunkDurationSeconds, isLocalAsrService } from "./timing";
import { ASR_LANGUAGE_POLICY_VERSION, isWhisperAsrService } from "./language";

const ignored =
  /^(?:key|apiKey|token|accessToken|password|secret|httpTimeout|timeout|fetchLimit|fetchInterval|asrTimestampSupport|asrMaxDurationSeconds)$/i;
const ordered = (value) =>
  Array.isArray(value)
    ? value.map(ordered)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, ordered(value[key])])
        )
      : value;
const endpoint = (value) => {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()])
      if (/key|token|auth|secret|password/i.test(key))
        url.searchParams.delete(key);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
};
function serviceConfig(service) {
  if (!service) return null;
  const fields = service.provider?.settings || [];
  const config = Object.fromEntries(
    fields
      .filter(
        (field) =>
          !field.isSecret &&
          field.type !== "password" &&
          !ignored.test(field.key)
      )
      .map((field) => [
        field.key,
        /url|endpoint/i.test(field.key)
          ? endpoint(
              service.pluginConfig?.[field.key] ??
                service[field.key] ??
                field.defaultValue
            )
          : (service.pluginConfig?.[field.key] ??
            service[field.key] ??
            field.defaultValue),
      ])
  );
  return {
    apiType: service.apiType,
    model: service.model,
    modelRef: service.modelRef,
    url: service.url && endpoint(service.url),
    device: service.device,
    provider: service.provider && {
      source: service.provider.source,
      code: service.provider.code,
      rules: service.provider.rules,
      implementation: service.provider.implementation,
    },
    config,
  };
}
const digest = async (input) => {
  const bytes = new TextEncoder().encode(JSON.stringify(ordered(input)));
  return [
    ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

/** Recognition cache is tied to the canonical cutting algorithm and effective limit. */
export async function asrCacheSignatures({
  asrService,
  segmentationService,
  translationService,
  contextService,
  setting = {},
  language,
  limits = {},
}) {
  const [recognition, segmentation, translation] = await Promise.all([
    digest({
      service: serviceConfig(asrService),
      language,
      ...(isWhisperAsrService(asrService) && {
        languagePolicyVersion: ASR_LANGUAGE_POLICY_VERSION,
      }),
      ...(!isLocalAsrService(asrService || {}) && {
        audioInput: { format: "m4a", version: 1, boundaryPaddingFrames: 2 },
      }),
      chunking: {
        version: 1,
        maxSamples: new AsrAudioChunker(
          asrChunkDurationSeconds(asrService || {}),
          0,
          limits
        ).limit,
      },
    }),
    digest({
      service: serviceConfig(segmentationService),
      mode: setting.useAlgorithmBreaker,
      threshold: setting.longSentenceThreshold,
      forceSubtitleRetranslate: setting.forceSubtitleRetranslate,
      subtitlePrompt: setting.subtitlePrompt,
      resolvedPrompt: segmentationService?.subtitlePrompt,
      chunkLength: setting.chunkLength,
    }),
    digest({
      service: serviceConfig(translationService),
      toLang: setting.toLang,
      translateVariants: setting.translateVariants,
      aiContextSlug: setting.aiContextSlug,
      contextService: serviceConfig(contextService),
      prompt: translationService?.subtitlePrompt,
      systemPrompt: translationService?.systemPrompt,
      userPrompt: translationService?.batchUserPrompt,
      singleSystemPrompt: translationService?.nobatchPrompt,
      singleUserPrompt: translationService?.nobatchUserPrompt,
      useBatchFetch: translationService?.useBatchFetch,
      useContext: translationService?.useContext,
      terms: translationService?.aiTerms,
    }),
  ]);
  return { recognition, segmentation, translation };
}
