import {
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultSystemPrompt,
  defaultSystemPromptLines,
  defaultSystemPromptXml,
  defaultSubtitlePrompt,
} from "./api";

export const PROMPT_SLUG_NOBATCH_TRANSLATION = "nobatch-translation";
export const PROMPT_SLUG_BATCH_TRANSLATION_JSON = "batch-translation-json";
export const PROMPT_SLUG_BATCH_TRANSLATION_XML = "batch-translation-xml";
export const PROMPT_SLUG_BATCH_TRANSLATION_LINE = "batch-translation-line";
export const PROMPT_SLUG_SUBTITLE_SEGMENTATION = "subtitle-segmentation";
export const PROMPT_SLUG_DICTIONARY_EN_ZH = "dictionary-en-zh";

export const PROMPT_MODE_FOLLOW_API = "follow_api";
export const PROMPT_MODE_GLOBAL = "global";

export const PROMPT_CATEGORY_BATCH_SYSTEM = "batch system prompt";
export const PROMPT_CATEGORY_USER = "user prompt";
export const PROMPT_CATEGORY_SUBTITLE = "subtitle prompt";
export const PROMPT_CATEGORY_DICTIONARY = "dictionary prompt";
export const PROMPT_TEMPLATE_CATEGORIES = [
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_DICTIONARY,
];

export const DEFAULT_NOBATCH_PROMPT_SLUG = PROMPT_SLUG_NOBATCH_TRANSLATION;
export const DEFAULT_BATCH_PROMPT_SLUG = PROMPT_SLUG_BATCH_TRANSLATION_JSON;
export const DEFAULT_SUBTITLE_PROMPT_SLUG = PROMPT_SLUG_SUBTITLE_SEGMENTATION;

export const PRESET_PROMPTS = [
  {
    slug: PROMPT_SLUG_NOBATCH_TRANSLATION,
    category: PROMPT_CATEGORY_USER,
    nameKey: "preset_prompt_nobatch_translation",
    name: "Non-batch translation",
    systemPrompt: defaultNobatchPrompt,
    userPrompt: defaultNobatchUserPrompt,
  },
  {
    slug: PROMPT_SLUG_BATCH_TRANSLATION_JSON,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_json",
    name: "Batch translation (JSON)",
    systemPrompt: defaultSystemPrompt,
    userPrompt: "",
  },
  {
    slug: PROMPT_SLUG_BATCH_TRANSLATION_XML,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_xml",
    name: "Batch translation (XML)",
    systemPrompt: defaultSystemPromptXml,
    userPrompt: "",
  },
  {
    slug: PROMPT_SLUG_BATCH_TRANSLATION_LINE,
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    nameKey: "preset_prompt_batch_translation_line",
    name: "Batch translation (LINE)",
    systemPrompt: defaultSystemPromptLines,
    userPrompt: "",
  },
  {
    slug: PROMPT_SLUG_SUBTITLE_SEGMENTATION,
    category: PROMPT_CATEGORY_SUBTITLE,
    nameKey: "preset_prompt_subtitle_segmentation",
    name: "Subtitle AI segmentation",
    systemPrompt: defaultSubtitlePrompt,
    userPrompt: "",
  },
  {
    slug: PROMPT_SLUG_DICTIONARY_EN_ZH,
    category: PROMPT_CATEGORY_DICTIONARY,
    nameKey: "preset_prompt_dictionary_en_zh",
    name: "AI English-Chinese dictionary",
    systemPrompt: "",
    userPrompt: "",
  },
];

const PRESET_PROMPT_SLUGS = new Set(
  PRESET_PROMPTS.map((prompt) => prompt.slug)
);

export function normalizePrompt(prompt = {}) {
  return {
    slug: String(prompt.slug || prompt.id || ""),
    category: String(prompt.category || ""),
    nameKey: String(prompt.nameKey || ""),
    name: String(prompt.name || ""),
    systemPrompt: String(prompt.systemPrompt || ""),
    userPrompt: String(prompt.userPrompt || ""),
  };
}

export function isPresetPromptSlug(promptSlug) {
  return PRESET_PROMPT_SLUGS.has(promptSlug);
}

export function getAllPrompts(userPrompts = []) {
  const customPrompts = (Array.isArray(userPrompts) ? userPrompts : [])
    .map(normalizePrompt)
    .filter((prompt) => prompt.slug && !isPresetPromptSlug(prompt.slug));

  return [...PRESET_PROMPTS, ...customPrompts];
}

export function findPromptBySlug(userPrompts = [], promptSlug) {
  if (!promptSlug) {
    return null;
  }

  return getAllPrompts(userPrompts).find(
    (prompt) => normalizePrompt(prompt).slug === promptSlug
  );
}

function findPromptBySlugOrDefault(userPrompts, promptSlug, defaultPromptSlug) {
  return (
    findPromptBySlug(userPrompts, promptSlug) ||
    findPromptBySlug(userPrompts, defaultPromptSlug)
  );
}

export function getPromptName(userPrompts = [], promptSlug) {
  return findPromptBySlug(userPrompts, promptSlug)?.name || "";
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

  return normalizedPrompt.name || normalizedPrompt.slug;
}

export function getPromptCategoryDisplayName(category, i18n) {
  if (typeof i18n !== "function") {
    return category || "";
  }

  const keyMap = {
    [PROMPT_CATEGORY_BATCH_SYSTEM]: "prompt_category_batch_system",
    [PROMPT_CATEGORY_USER]: "prompt_category_user",
    [PROMPT_CATEGORY_SUBTITLE]: "prompt_category_subtitle",
    [PROMPT_CATEGORY_DICTIONARY]: "prompt_category_dictionary",
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

function hasPromptReference(source = {}, fieldNames = [], promptSlug) {
  return fieldNames.some(
    (fieldName) =>
      Object.prototype.hasOwnProperty.call(source, fieldName) &&
      source[fieldName] === promptSlug
  );
}

export function removePromptReferences(setting = {}, promptSlug) {
  if (!promptSlug || isPresetPromptSlug(promptSlug)) {
    return setting;
  }

  const batchPrompt = findPromptBySlug([], DEFAULT_BATCH_PROMPT_SLUG);
  const nobatchPrompt = findPromptBySlug([], DEFAULT_NOBATCH_PROMPT_SLUG);
  const subtitlePrompt = findPromptBySlug([], DEFAULT_SUBTITLE_PROMPT_SLUG);
  let hasApiChanges = false;

  const transApis = (
    Array.isArray(setting?.transApis) ? setting.transApis : []
  ).map((api) => {
    let nextApi = api;

    if (
      hasPromptReference(api, ["batchPromptSlug", "batchPromptId"], promptSlug)
    ) {
      nextApi = {
        ...nextApi,
        batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
        systemPrompt: batchPrompt.systemPrompt,
      };
      delete nextApi.batchPromptId;
      hasApiChanges = true;
    }

    if (
      hasPromptReference(
        api,
        ["nobatchPromptSlug", "nobatchPromptId"],
        promptSlug
      )
    ) {
      nextApi = {
        ...nextApi,
        nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
        nobatchPrompt: nobatchPrompt.systemPrompt,
        nobatchUserPrompt: nobatchPrompt.userPrompt,
      };
      delete nextApi.nobatchPromptId;
      hasApiChanges = true;
    }

    if (
      hasPromptReference(
        api,
        ["subtitlePromptSlug", "subtitlePromptId"],
        promptSlug
      )
    ) {
      nextApi = {
        ...nextApi,
        subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
        subtitlePrompt: subtitlePrompt.systemPrompt,
      };
      delete nextApi.subtitlePromptId;
      hasApiChanges = true;
    }

    return nextApi;
  });

  const hasSubtitlePromptReference = hasPromptReference(
    setting?.subtitleSetting,
    ["segPromptSlug", "segPromptId"],
    promptSlug
  );

  if (!hasApiChanges && !hasSubtitlePromptReference) {
    return setting;
  }

  const nextSetting = { ...setting };

  if (hasApiChanges) {
    nextSetting.transApis = transApis;
  }

  if (hasSubtitlePromptReference) {
    nextSetting.subtitleSetting = {
      ...(setting?.subtitleSetting || {}),
      segPromptMode: PROMPT_MODE_FOLLOW_API,
      segPromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
    };
    delete nextSetting.subtitleSetting.segPromptId;
  }

  return nextSetting;
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
  const batchPromptSlug = getPromptFieldValue(
    nextApiSetting,
    "batchPromptSlug",
    getPromptFieldValue(
      nextApiSetting,
      "batchPromptId",
      DEFAULT_BATCH_PROMPT_SLUG
    )
  );
  const batchPrompt = findPromptBySlugOrDefault(
    userPrompts,
    batchPromptSlug,
    DEFAULT_BATCH_PROMPT_SLUG
  );

  if (batchPrompt) {
    nextApiSetting.batchPromptSlug = normalizePrompt(batchPrompt).slug;
    delete nextApiSetting.batchPromptId;
    nextApiSetting.systemPrompt = batchPrompt.systemPrompt;
  }

  const nobatchPromptSlug = getPromptFieldValue(
    nextApiSetting,
    "nobatchPromptSlug",
    getPromptFieldValue(
      nextApiSetting,
      "nobatchPromptId",
      DEFAULT_NOBATCH_PROMPT_SLUG
    )
  );
  const nobatchPrompt = findPromptBySlugOrDefault(
    userPrompts,
    nobatchPromptSlug,
    DEFAULT_NOBATCH_PROMPT_SLUG
  );

  if (nobatchPrompt) {
    nextApiSetting.nobatchPromptSlug = normalizePrompt(nobatchPrompt).slug;
    delete nextApiSetting.nobatchPromptId;
    nextApiSetting.nobatchPrompt = nobatchPrompt.systemPrompt;
    nextApiSetting.nobatchUserPrompt = nobatchPrompt.userPrompt;
  }

  const useGlobalSubtitlePrompt =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL;
  const subtitlePromptSlug = useGlobalSubtitlePrompt
    ? getPromptFieldValue(
        subtitleSetting,
        "segPromptSlug",
        getPromptFieldValue(
          subtitleSetting,
          "segPromptId",
          DEFAULT_SUBTITLE_PROMPT_SLUG
        )
      )
    : getPromptFieldValue(
        nextApiSetting,
        "subtitlePromptSlug",
        getPromptFieldValue(
          nextApiSetting,
          "subtitlePromptId",
          DEFAULT_SUBTITLE_PROMPT_SLUG
        )
      );
  const subtitlePrompt = findPromptBySlugOrDefault(
    userPrompts,
    subtitlePromptSlug,
    DEFAULT_SUBTITLE_PROMPT_SLUG
  );

  if (subtitlePrompt) {
    if (!useGlobalSubtitlePrompt) {
      nextApiSetting.subtitlePromptSlug = normalizePrompt(subtitlePrompt).slug;
      delete nextApiSetting.subtitlePromptId;
    }
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
