import {
  PROMPT_MODE_FOLLOW_API,
  PROMPT_CATEGORY_DICTIONARY,
  findPromptBySlug,
  resolveEmptyApiPrompts,
} from "../config/prompt";
import {
  isApiConfigured,
  supportsApiCapability,
} from "../config/serviceSelection";
import { withDefaultPromptInput } from "../providers/defaultPrompts";
const hasPrompt = (value) => typeof value === "string" && Boolean(value.trim());

export function resolveAiDictApiSetting({
  transApis = [],
  prompts = [],
  aiDictApiSlug = "-",
  aiDictPromptSlug = PROMPT_MODE_FOLLOW_API,
}) {
  if (!aiDictApiSlug || aiDictApiSlug === "-") {
    return null;
  }

  // Stored slugs can outlive changes to API availability, API type, or prompt category.
  // Recheck eligibility to avoid sending dictionary prompts to a non-AI endpoint.
  const storedApi = transApis.find(
    (api) =>
      api.apiSlug === aiDictApiSlug &&
      !api.isDisabled &&
      isApiConfigured(api) &&
      supportsApiCapability(api, "dictionary")
  );
  if (!storedApi) {
    return null;
  }

  const apiSetting = resolveEmptyApiPrompts(storedApi);

  // Resolve the complete selected pair without filling an explicit empty half.
  if (aiDictPromptSlug === PROMPT_MODE_FOLLOW_API) {
    const input =
      Object.hasOwn(apiSetting, "dictPrompt") ||
      Object.hasOwn(apiSetting, "dictUserPrompt")
        ? {
            instructions: apiSetting.dictPrompt ?? "",
            userPrompt: apiSetting.dictUserPrompt ?? "",
          }
        : {};
    const selected = withDefaultPromptInput(apiSetting, "dictionary", input);
    return hasPrompt(selected.instructions) || hasPrompt(selected.userPrompt)
      ? {
          ...apiSetting,
          dictPrompt: selected.instructions ?? "",
          dictUserPrompt: selected.userPrompt ?? "",
        }
      : null;
  }

  // Override the API's dictionary prompt with the selected global prompt.
  const prompt = findPromptBySlug(prompts, aiDictPromptSlug);
  if (!prompt || prompt.category !== PROMPT_CATEGORY_DICTIONARY) {
    return null;
  }

  return resolveEmptyApiPrompts({
    ...apiSetting,
    dictPromptSlug: prompt.slug,
    dictPrompt: prompt.systemPrompt,
    dictUserPrompt: prompt.userPrompt,
  });
}
