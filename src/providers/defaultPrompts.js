import { providerError } from "./capabilities";

export const defaultPromptCapabilities = Object.freeze({
  batch: "translate",
  nobatch: "translate",
  dictionary: "dictionary",
  subtitle: "segmentSubtitle",
  vlm: "parseImage",
  summary: "summarize",
  detectLanguage: "detectLanguage",
  suggest: "suggest",
  evaluate: "evaluate",
  recognizeText: "recognizeText",
  analyzeLayout: "analyzeLayout",
});

export const promptSlugFields = Object.freeze({
  batch: "batchPromptSlug",
  nobatch: "nobatchPromptSlug",
  dictionary: "dictPromptSlug",
  subtitle: "subtitlePromptSlug",
  vlm: "vlmPromptSlug",
  summary: "summaryPromptSlug",
  detectLanguage: "detectLanguagePromptSlug",
  suggest: "suggestPromptSlug",
  evaluate: "evaluatePromptSlug",
  recognizeText: "recognizeTextPromptSlug",
  analyzeLayout: "analyzeLayoutPromptSlug",
});

export const isPluginPromptSlug = (slug) => slug?.startsWith("plugin:");

export function pluginPromptSlug(provider, slot, id) {
  return [
    "plugin",
    provider.source?.pluginId,
    provider.source?.serviceId || provider.id,
    slot,
    id,
  ]
    .map((part) => encodeURIComponent(part || ""))
    .join(":");
}

export function getPluginPromptOptions(api, slot) {
  const provider = api?.provider;
  return (provider?.defaultPrompts?.[slot] || []).map((prompt) => ({
    ...prompt,
    slug: pluginPromptSlug(provider, slot, prompt.id),
  }));
}

export function selectedPluginPrompt(
  api,
  slot,
  slug = api?.[promptSlugFields[slot]]
) {
  const options = getPluginPromptOptions(api, slot);
  return options.find((prompt) => prompt.slug === slug) || options[0];
}

export const imagePromptText = (prompt) =>
  prompt &&
  [prompt.systemPrompt, prompt.userPrompt].filter(Boolean).join("\n\n");

/** Display metadata is declarative: opening a form never evaluates user code. */
export function validateDefaultPrompts(service) {
  if (service.defaultPrompts === undefined) return;
  if (
    !service.defaultPrompts ||
    typeof service.defaultPrompts !== "object" ||
    Array.isArray(service.defaultPrompts)
  )
    throw providerError(
      "INVALID_MANIFEST",
      "Invalid default prompt declaration."
    );
  for (const [slot, prompts] of Object.entries(service.defaultPrompts)) {
    if (
      !defaultPromptCapabilities[slot] ||
      !service.capabilities[defaultPromptCapabilities[slot]] ||
      !Array.isArray(prompts) ||
      !prompts.length ||
      new Set(prompts.map((prompt) => prompt?.id)).size !== prompts.length
    )
      throw providerError(
        "INVALID_MANIFEST",
        "Invalid default prompt slot: " + slot
      );
    for (const prompt of prompts) {
      if (
        !prompt ||
        typeof prompt !== "object" ||
        Array.isArray(prompt) ||
        Object.keys(prompt).some(
          (key) =>
            ![
              "id",
              "name",
              "nameI18n",
              "description",
              "descriptionI18n",
              "systemPrompt",
              "userPrompt",
              "protocol",
            ].includes(key)
        ) ||
        typeof prompt.id !== "string" ||
        !/^[A-Za-z][\w-]*$/.test(prompt.id) ||
        typeof prompt.name !== "string" ||
        !prompt.name.trim() ||
        !["systemPrompt", "userPrompt"].some(
          (key) => typeof prompt[key] === "string"
        ) ||
        Object.entries(prompt).some(([key, value]) =>
          key.endsWith("I18n")
            ? !value ||
              Array.isArray(value) ||
              typeof value !== "object" ||
              Object.values(value).some((text) => typeof text !== "string")
            : typeof value !== "string"
        ) ||
        (prompt.protocol !== undefined &&
          (slot === "batch"
            ? !["json", "line", "xml"].includes(prompt.protocol)
            : slot !== "nobatch" || prompt.protocol !== "text"))
      )
        throw providerError(
          "INVALID_MANIFEST",
          "Invalid default prompt slot: " + slot
        );
    }
  }
}

/** Explicit task/scene instructions win; the snapshot supplies only absent defaults. */
export function withDefaultPromptInput(instance, capability, input) {
  const slot =
    capability === "translate"
      ? (
          input?.translationMode
            ? input.translationMode === "batch"
            : instance.useBatchFetch
        )
        ? "batch"
        : "nobatch"
      : {
          dictionary: "dictionary",
          segmentSubtitle: "subtitle",
          parseImage: "vlm",
          summarize: "summary",
          detectLanguage: "detectLanguage",
          suggest: "suggest",
          evaluate: "evaluate",
          recognizeText: "recognizeText",
          analyzeLayout: "analyzeLayout",
        }[capability];
  const prompt = selectedPluginPrompt(instance, slot);
  if (!prompt || !input || typeof input !== "object") return input;
  if (capability === "translate")
    return {
      ...input,
      ...(input.outputProtocol === undefined && {
        outputProtocol: prompt.protocol || (slot === "batch" ? "json" : "text"),
      }),
      systemPrompt: input.systemPrompt ?? prompt.systemPrompt,
      userPrompt: input.userPrompt ?? prompt.userPrompt,
    };
  if (["parseImage", "recognizeText", "analyzeLayout"].includes(capability))
    return {
      ...input,
      prompt:
        input.prompt ??
        [prompt.systemPrompt, prompt.userPrompt].filter(Boolean).join("\n\n"),
    };
  return {
    ...input,
    instructions: input.instructions ?? prompt.systemPrompt,
    ...(["dictionary", "summarize", "suggest"].includes(capability) && {
      userPrompt: input.userPrompt ?? prompt.userPrompt,
    }),
  };
}

/** The selected template owns both the request encoding and response parser. */
export function translationOptions(api) {
  const batch = Boolean(api.useBatchFetch);
  const slot = batch ? "batch" : "nobatch";
  const prompt = selectedPluginPrompt(api, slot);
  return {
    translationMode: batch ? "batch" : "single",
    outputProtocol:
      (isPluginPromptSlug(api[promptSlugFields[slot]]) && prompt?.protocol) ||
      api.outputProtocol ||
      (batch ? api.batchProtocol : undefined) ||
      prompt?.protocol ||
      (batch ? "json" : "text"),
  };
}
