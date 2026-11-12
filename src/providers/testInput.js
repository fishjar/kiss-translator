import { selectedPluginPrompt, translationOptions } from "./defaultPrompts";
import {
  DEFAULT_SUMMARY_PROMPT,
  PROMPT_CATEGORY_SUMMARY,
  findPromptBySlug,
} from "../config/prompt";

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

function testPromptPair(api, systemKey, userKey, targetSystemKey) {
  if (!Object.hasOwn(api, systemKey) && !Object.hasOwn(api, userKey)) return {};
  return {
    [targetSystemKey]: api[systemKey] ?? "",
    userPrompt: api[userKey] ?? "",
  };
}

export function applyTestPrompt(
  capability,
  input,
  api,
  { prompts = [], subtitleSetting = {} } = {}
) {
  if (capability === "translate")
    return {
      ...input,
      ...(api.provider?.implementation?.kind !== "native" &&
        translationOptions(api)),
      ...testPromptPair(
        api,
        api.useBatchFetch ? "systemPrompt" : "nobatchPrompt",
        api.useBatchFetch ? "batchUserPrompt" : "nobatchUserPrompt",
        "systemPrompt"
      ),
    };
  if (capability === "dictionary")
    return {
      ...input,
      ...testPromptPair(api, "dictPrompt", "dictUserPrompt", "instructions"),
    };
  if (capability === "summarize") {
    const scene = findPromptBySlug(prompts, subtitleSetting.summaryPromptSlug);
    const prompt =
      (scene?.category === PROMPT_CATEGORY_SUMMARY && scene) ||
      selectedPluginPrompt(api, "summary") ||
      DEFAULT_SUMMARY_PROMPT;
    return {
      ...input,
      instructions: prompt.systemPrompt ?? "",
      userPrompt: prompt.userPrompt ?? "",
    };
  }
  if (capability === "segmentSubtitle")
    return { ...input, instructions: api.subtitlePrompt || undefined };
  if (capability === "parseImage" && api.vlmPrompt)
    return { ...input, prompt: api.vlmPrompt };
  return input;
}
