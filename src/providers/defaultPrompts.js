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
  for (const [slot, prompt] of Object.entries(service.defaultPrompts)) {
    if (
      !defaultPromptCapabilities[slot] ||
      !service.capabilities[defaultPromptCapabilities[slot]] ||
      !prompt ||
      typeof prompt !== "object" ||
      Array.isArray(prompt) ||
      Object.keys(prompt).some(
        (key) => !["systemPrompt", "userPrompt", "protocol"].includes(key)
      ) ||
      !["systemPrompt", "userPrompt"].some(
        (key) => typeof prompt[key] === "string"
      ) ||
      Object.values(prompt).some((value) => typeof value !== "string") ||
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
  const prompt = instance.provider?.defaultPrompts?.[slot];
  if (!prompt || !input || typeof input !== "object") return input;
  if (capability === "translate")
    return {
      ...input,
      ...(input.outputProtocol === undefined && {
        outputProtocol: prompt.protocol || "json",
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

/** Legacy template snapshots without protocol declarations retain their JSON contract. */
export function translationOptions(api) {
  const batch = Boolean(api.useBatchFetch);
  const prompt = api.provider?.defaultPrompts?.[batch ? "batch" : "nobatch"];
  return {
    translationMode: batch ? "batch" : "single",
    outputProtocol:
      api.outputProtocol ||
      (batch ? api.batchProtocol : undefined) ||
      prompt?.protocol ||
      (prompt ? "json" : batch ? "json" : "text"),
  };
}
