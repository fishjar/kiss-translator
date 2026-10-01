import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_SYSTEM_TTS,
  OPT_TRANS_LOCALAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_CUSTOMIZE,
  OPT_TRANS_CLOUDFLAREAI,
  API_SPE_TYPES,
} from "./api";

export const SOURCE_TYPES = ["builtin", "local", "network"];
export const CAPABILITIES = [
  "translation",
  "summarization",
  "segmentation",
  "dictionary",
  "jev",
  "asr",
  "ocr",
  "vlm",
  "tts",
  "llm",
];

export const supportsVlmApi = (api) =>
  api?.apiType === OPT_TRANS_LOCALAI ||
  (API_SPE_TYPES.ai.has(api?.apiType) &&
    ![OPT_TRANS_CUSTOMIZE, OPT_TRANS_CLOUDFLAREAI].includes(api?.apiType) &&
    !(
      api?.apiType === OPT_TRANS_GEMINI && /interactions/.test(api?.url || "")
    ));

export const supportsApiCapability = (api, capability) => {
  if (api?.apiType === OPT_TRANS_LOCALAI)
    return CAPABILITIES.includes(capability);
  if (api?.apiType === OPT_TRANS_SYSTEM_TTS) return capability === "tts";
  if (api?.apiType === OPT_TRANS_BUILTINAI)
    return ["translation", "summarization"].includes(capability);
  if (capability === "vlm") return supportsVlmApi(api);
  if (API_SPE_TYPES.ai.has(api?.apiType))
    return [
      "translation",
      "summarization",
      "segmentation",
      "dictionary",
      "llm",
    ].includes(capability);
  return capability === "translation";
};

export const orderedApiSlugs = (
  scene,
  listKey = "apiSlugs",
  singleKey = "apiSlug"
) => {
  const list = Array.isArray(scene?.[listKey])
    ? scene[listKey].filter((slug) => typeof slug === "string" && slug)
    : [];
  if (list.length > 0) {
    return [...new Set(list)];
  }
  return typeof scene?.[singleKey] === "string" && scene[singleKey]
    ? [scene[singleKey]]
    : [];
};

export const normalizeApiCapabilities = (api) => ({
  ...api,
  sourceType: SOURCE_TYPES.includes(api.sourceType)
    ? api.sourceType
    : api.apiType === OPT_TRANS_BUILTINAI
      ? "builtin"
      : api.apiType === OPT_TRANS_SYSTEM_TTS
        ? "builtin"
        : "network",
  capabilities: Array.isArray(api.capabilities)
    ? [
        ...new Set(
          api.capabilities.filter((item) => CAPABILITIES.includes(item))
        ),
      ]
    : ["translation"],
});

// Capability declarations alone never make an unimplemented adapter usable.
export const isApiAvailableFor = (
  api,
  capability = "translation",
  context = {}
) => {
  if (
    !api ||
    (capability === "vlm" && !supportsVlmApi(api)) ||
    api.isDisabled ||
    !(api.capabilities || ["translation"]).includes(capability)
  )
    return false;
  if (api.sourceType === "local") {
    if (api.apiType !== OPT_TRANS_LOCALAI || !api.modelRef) return false;
    if (context.installedModels)
      return context.installedModels.has(api.modelRef);
    return ["chrome", "edge", "firefox"].includes(process.env.REACT_APP_CLIENT);
  }
  if (api.sourceType === "builtin" && api.apiType === OPT_TRANS_BUILTINAI) {
    if (capability === "translation") {
      return typeof globalThis.Translator !== "undefined";
    }
    if (capability === "summarization") {
      return (
        typeof globalThis.Summarizer !== "undefined" ||
        typeof globalThis.ai?.summarizer !== "undefined"
      );
    }
    return false;
  }
  if (api.sourceType === "builtin" && api.apiType === OPT_TRANS_SYSTEM_TTS) {
    return (
      capability === "tts" && typeof globalThis.speechSynthesis !== "undefined"
    );
  }
  return true;
};

export const availableApisForScene = (
  scene,
  apis,
  capability = "translation",
  context = {},
  listKey = "apiSlugs",
  singleKey = "apiSlug"
) =>
  orderedApiSlugs(scene, listKey, singleKey)
    .map((slug) => apis?.find((api) => api.apiSlug === slug))
    .filter((api) => isApiAvailableFor(api, capability, context));

export const availableImageApisForScene = (scene, apis, context = {}) =>
  orderedApiSlugs(scene, "ocrApiSlugs", "ocrApiSlug")
    .map((slug) => apis?.find((api) => api.apiSlug === slug))
    .filter(
      (api) =>
        api &&
        !api.isDisabled &&
        (api.capabilities || []).some((cap) => ["ocr", "vlm"].includes(cap)) &&
        (api.ocrAvailable !== undefined
          ? api.ocrAvailable
          : isApiAvailableFor(
              api,
              api.capabilities.includes("vlm") ? "vlm" : "ocr",
              context
            ))
    );

export const withScenePrompt = (api, scene) =>
  scene?.promptSlug
    ? { ...api, nobatchPromptSlug: scene.promptSlug, useBatchFetch: false }
    : api;
