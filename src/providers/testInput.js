import { translationOptions } from "./defaultPrompts";

export const structuredTestSamples = Object.freeze({
  segmentSubtitle: {
    items: [
      { id: "0", text: "Hello", start: 0, end: 1 },
      { id: "1", text: "world", start: 1, end: 2 },
    ],
    targetLanguage: "zh-CN",
  },
  evaluate: {
    state: "Hello world",
    questions: {
      language: {
        type: "choice",
        instructions: "Which language is used?",
        criteria: {
          English: "Text primarily in English",
          Chinese: "Text primarily in Chinese",
        },
      },
    },
  },
});

/** Asset references come from the selected file, not arbitrary JSON supplied in the test editor. */
export function createTestInput(capability, text, file, assets) {
  if (structuredTestSamples[capability]) return JSON.parse(text);
  if (capability === "translate")
    return { items: [{ id: "0", text }], targetLanguage: "zh-CN" };
  if (capability === "chat")
    return { messages: [{ role: "user", content: text }] };
  if (
    ["transcribe", "recognizeText", "parseImage", "analyzeLayout"].includes(
      capability
    )
  ) {
    if (!file) throw new Error("请选择待识别文件");
    return {
      [capability === "transcribe" ? "audio" : "image"]: assets.put(file),
    };
  }
  return { text, language: "zh-CN" };
}

export function applyTestPrompt(capability, input, api) {
  if (capability === "translate")
    return {
      ...input,
      ...(api.provider?.implementation?.kind !== "native" &&
        translationOptions(api)),
      systemPrompt:
        (api.useBatchFetch ? api.systemPrompt : api.nobatchPrompt) ?? undefined,
      userPrompt:
        (api.useBatchFetch ? api.batchUserPrompt : api.nobatchUserPrompt) ??
        undefined,
    };
  if (capability === "dictionary")
    return {
      ...input,
      instructions: api.dictPrompt || undefined,
      userPrompt: api.dictUserPrompt || undefined,
    };
  if (capability === "segmentSubtitle")
    return { ...input, instructions: api.subtitlePrompt || undefined };
  if (capability === "parseImage" && api.vlmPrompt)
    return { ...input, prompt: api.vlmPrompt };
  return input;
}
