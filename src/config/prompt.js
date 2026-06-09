import {
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultSystemPrompt,
  defaultSystemPromptLines,
  defaultSystemPromptXml,
  defaultSubtitlePrompt,
} from "./api";

export const PROMPT_ID_NOBATCH_TRANSLATION = "nobatch-translation";
export const PROMPT_ID_BATCH_TRANSLATION_JSON = "batch-translation-json";
export const PROMPT_ID_BATCH_TRANSLATION_XML = "batch-translation-xml";
export const PROMPT_ID_BATCH_TRANSLATION_LINE = "batch-translation-line";
export const PROMPT_ID_SUBTITLE_SEGMENTATION = "subtitle-segmentation";
export const PROMPT_ID_DICTIONARY_EN_ZH = "dictionary-en-zh";

export const PROMPT_MODE_FOLLOW_API = "follow_api";
export const PROMPT_MODE_GLOBAL = "global";

export const PROMPT_CATEGORY_BATCH_SYSTEM = "batch system prompt";
export const PROMPT_CATEGORY_USER = "user prompt";
export const PROMPT_CATEGORY_SUBTITLE = "subtitle prompt";
export const PROMPT_TEMPLATE_CATEGORIES = [
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_SUBTITLE,
];

export const DEFAULT_NOBATCH_PROMPT_ID = PROMPT_ID_NOBATCH_TRANSLATION;
export const DEFAULT_BATCH_PROMPT_ID = PROMPT_ID_BATCH_TRANSLATION_XML;
export const DEFAULT_SUBTITLE_PROMPT_ID = PROMPT_ID_SUBTITLE_SEGMENTATION;

export const PRESET_PROMPTS = [
  {
    id: PROMPT_ID_NOBATCH_TRANSLATION,
    category: PROMPT_CATEGORY_USER,
    nameKey: "preset_prompt_nobatch_translation",
    name: "Non-batch translation",
    systemPrompt: defaultNobatchPrompt,
    userPrompt: defaultNobatchUserPrompt,
  },
  {
    id: PROMPT_ID_BATCH_TRANSLATION_JSON,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_json",
    name: "Batch translation (JSON)",
    systemPrompt: defaultSystemPrompt,
    userPrompt: "",
  },
  {
    id: PROMPT_ID_BATCH_TRANSLATION_XML,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_xml",
    name: "Batch translation (XML)",
    systemPrompt: defaultSystemPromptXml,
    userPrompt: "",
  },
  {
    id: PROMPT_ID_BATCH_TRANSLATION_LINE,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_line",
    name: "Batch translation (LINE)",
    systemPrompt: defaultSystemPromptLines,
    userPrompt: "",
  },
  {
    id: PROMPT_ID_SUBTITLE_SEGMENTATION,
    category: PROMPT_CATEGORY_SUBTITLE,
    nameKey: "preset_prompt_subtitle_segmentation",
    name: "Subtitle AI segmentation",
    systemPrompt: defaultSubtitlePrompt,
    userPrompt: "",
  },
  {
    id: PROMPT_ID_DICTIONARY_EN_ZH,
    category: "",
    nameKey: "preset_prompt_dictionary_en_zh",
    name: "AI English-Chinese dictionary",
    systemPrompt: "",
    userPrompt: "",
  },
];

const PRESET_PROMPT_IDS = new Set(PRESET_PROMPTS.map((prompt) => prompt.id));

export function normalizePrompt(prompt = {}) {
  return {
    id: String(prompt.id || ""),
    category: String(prompt.category || ""),
    nameKey: String(prompt.nameKey || ""),
    name: String(prompt.name || ""),
    systemPrompt: String(prompt.systemPrompt || ""),
    userPrompt: String(prompt.userPrompt || ""),
  };
}

export function isPresetPromptId(promptId) {
  return PRESET_PROMPT_IDS.has(promptId);
}

export function getAllPrompts(userPrompts = []) {
  const customPrompts = (Array.isArray(userPrompts) ? userPrompts : [])
    .map(normalizePrompt)
    .filter((prompt) => prompt.id && !isPresetPromptId(prompt.id));

  return [...PRESET_PROMPTS, ...customPrompts];
}

export function findPromptById(userPrompts = [], promptId) {
  if (!promptId) {
    return null;
  }

  return getAllPrompts(userPrompts).find((prompt) => prompt.id === promptId);
}

export function getPromptName(userPrompts = [], promptId) {
  return findPromptById(userPrompts, promptId)?.name || "";
}

function getPromptFieldValue(source = {}, fieldName, defaultValue = "") {
  if (!Object.prototype.hasOwnProperty.call(source, fieldName)) {
    return defaultValue;
  }

  return source[fieldName];
}

export function getPromptDisplayName(prompt = {}, i18n) {
  const normalizedPrompt = normalizePrompt(prompt);
  if (normalizedPrompt.nameKey && typeof i18n === "function") {
    return i18n(normalizedPrompt.nameKey, normalizedPrompt.name);
  }

  return normalizedPrompt.name || normalizedPrompt.id;
}

export function getPromptCategoryDisplayName(category, i18n) {
  if (typeof i18n !== "function") {
    return category || "";
  }

  const keyMap = {
    [PROMPT_CATEGORY_BATCH_SYSTEM]: "prompt_category_batch_system",
    [PROMPT_CATEGORY_USER]: "prompt_category_user",
    [PROMPT_CATEGORY_SUBTITLE]: "prompt_category_subtitle",
  };

  return i18n(keyMap[category], category || "");
}

function getPromptOptions(prompts = [], category) {
  return (Array.isArray(prompts) ? prompts : []).filter(
    (prompt) => normalizePrompt(prompt).category === category
  );
}

export function getNobatchPromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_USER);
}

export function getBatchPromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_BATCH_SYSTEM);
}

export function getSubtitlePromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_SUBTITLE);
}

export function resolveApiPromptSettings(
  apiSetting = {},
  userPrompts = [],
  subtitleSetting = {}
) {
  if (!apiSetting) {
    return apiSetting;
  }

  const nextApiSetting = { ...apiSetting };
  const batchPromptId = getPromptFieldValue(
    nextApiSetting,
    "batchPromptId",
    DEFAULT_BATCH_PROMPT_ID
  );
  const batchPrompt = findPromptById(userPrompts, batchPromptId);

  if (batchPrompt) {
    nextApiSetting.systemPrompt = batchPrompt.systemPrompt;
  }

  const nobatchPromptId = getPromptFieldValue(
    nextApiSetting,
    "nobatchPromptId",
    DEFAULT_NOBATCH_PROMPT_ID
  );
  const nobatchPrompt = findPromptById(userPrompts, nobatchPromptId);

  if (nobatchPrompt) {
    nextApiSetting.nobatchPrompt = nobatchPrompt.systemPrompt;
    nextApiSetting.nobatchUserPrompt = nobatchPrompt.userPrompt;
  }

  const subtitlePromptId =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL
      ? getPromptFieldValue(
          subtitleSetting,
          "segPromptId",
          DEFAULT_SUBTITLE_PROMPT_ID
        )
      : getPromptFieldValue(
          nextApiSetting,
          "subtitlePromptId",
          DEFAULT_SUBTITLE_PROMPT_ID
        );
  const subtitlePrompt = findPromptById(userPrompts, subtitlePromptId);

  if (subtitlePrompt) {
    nextApiSetting.subtitlePrompt = subtitlePrompt.systemPrompt;
  }

  return nextApiSetting;
}

export function resolveApiPromptList(
  transApis = [],
  userPrompts = [],
  subtitleSetting = {}
) {
  return (Array.isArray(transApis) ? transApis : []).map((api) =>
    resolveApiPromptSettings(api, userPrompts, subtitleSetting)
  );
}
