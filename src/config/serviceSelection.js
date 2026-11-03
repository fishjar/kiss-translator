import {
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_SYSTEM_TTS,
  OPT_TRANS_LOCALAI,
} from "./apiConstants";
import {
  PROVIDER_CAPABILITIES,
  supportsProviderCapability,
  supportedCapabilities,
  getSupportedCapabilityDescriptor,
} from "../providers/capabilities";
import { getBuiltinServiceDefinition } from "../builtin-plugins/definitions";
import { resolveBuiltinCapabilities } from "../builtin-plugins/capabilities";
import localModelTasks from "./localModelTasks.json";
import { validateServiceConfig } from "../providers/instances";

export const SOURCE_TYPES = ["builtin", "local", "network"];
export const CAPABILITIES = PROVIDER_CAPABILITIES;

/** Pure metadata projection shared by forms, selectors and task admission. */
export function projectApiCapabilities(api) {
  if (!api) return {};
  const definition = getBuiltinServiceDefinition(api.apiType);
  if (
    !definition ||
    (api.provider && api.provider.implementation?.kind !== "native")
  )
    return api;
  return {
    ...api,
    provider: {
      ...definition,
      apiVersion: 1,
      ...api.provider,
      capabilities: Object.fromEntries(
        Object.entries(resolveBuiltinCapabilities(api)).filter(
          ([name]) => !api.provider || api.provider.capabilities?.[name]
        )
      ),
    },
  };
}
export const supportedApiCapabilities = (api) =>
  supportedCapabilities(projectApiCapabilities(api));
export const enabledApiCapabilities = (api) =>
  supportedApiCapabilities(api).filter(
    (name) =>
      api.enabledCapabilities === undefined ||
      (Array.isArray(api.enabledCapabilities) &&
        api.enabledCapabilities.includes(name))
  );
export const supportsApiCapability = (api, capability) =>
  supportsProviderCapability(
    { ...projectApiCapabilities(api), isDisabled: false },
    capability
  );
export const supportsVlmApi = (api) => supportsApiCapability(api, "parseImage");
/** Readiness is separate from support: an incomplete instance remains fully editable. */
export function isApiConfigured(api) {
  if (!api?.provider || api.provider.implementation?.kind === "native")
    return true;
  try {
    validateServiceConfig(
      api.provider,
      api.pluginConfig,
      enabledApiCapabilities(api)
    );
    return true;
  } catch {
    return false;
  }
}
export const supportedApiFeature = (api, capability) =>
  getSupportedCapabilityDescriptor(projectApiCapabilities(api), capability);
export const normalizeApiCapabilities = (api) => ({
  ...api,
  sourceType: SOURCE_TYPES.includes(api.sourceType)
    ? api.sourceType
    : api.apiType === OPT_TRANS_LOCALAI
      ? "local"
      : [OPT_TRANS_BUILTINAI, OPT_TRANS_SYSTEM_TTS].includes(api.apiType)
        ? "builtin"
        : "network",
});
export const isApiAvailableFor = (
  api,
  capability = "translate",
  context = {}
) => {
  const projected = projectApiCapabilities(api);
  if (!supportsProviderCapability(projected, capability, context.requirements))
    return false;
  if (!projected.provider?.implementation?.kind) return false;
  if (projected.provider.implementation.kind !== "native") {
    if (!isApiConfigured(projected)) return false;
    return ["chrome", "edge", "firefox"].includes(process.env.REACT_APP_CLIENT);
  }
  if (api.apiType === OPT_TRANS_LOCALAI) {
    if (!["chrome", "edge", "firefox"].includes(process.env.REACT_APP_CLIENT))
      return false;
    if (context.installedModels) {
      const group = localModelTasks.ocrGroups.find(
        (item) => item.id === api.modelRef
      );
      return group
        ? context.installedModels.has(group.detId) &&
            context.installedModels.has(group.recId)
        : context.installedModels.has(api.modelRef);
    }
  }
  if (api.apiType === OPT_TRANS_BUILTINAI) {
    if (capability === "translate")
      return typeof globalThis.Translator !== "undefined";
    if (capability === "summarize")
      return (
        typeof globalThis.Summarizer !== "undefined" ||
        typeof globalThis.ai?.summarizer !== "undefined"
      );
    if (capability === "detectLanguage")
      return typeof globalThis.LanguageDetector !== "undefined";
    return false;
  }
  if (api.apiType === OPT_TRANS_SYSTEM_TTS)
    return (
      capability === "speak" &&
      (typeof globalThis.speechSynthesis !== "undefined" ||
        typeof globalThis.chrome?.tts?.speak === "function")
    );
  return true;
};
export const availableApiForScene = (
  scene,
  apis,
  capability = "translate",
  context = {},
  singleKey = "apiSlug"
) => {
  const api = apis?.find((api) => api.apiSlug === scene?.[singleKey]);
  return isApiAvailableFor(api, capability, context) ? api : undefined;
};
export const withScenePrompt = (api, scene) =>
  scene?.promptSlug ? { ...api, scenePromptSlug: scene.promptSlug } : api;
