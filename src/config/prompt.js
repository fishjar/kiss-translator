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

function hasOwn(source = {}, fieldName) {
  return Object.prototype.hasOwnProperty.call(source, fieldName);
}

function getPromptFieldValue(source = {}, fieldName, defaultValue = "") {
  if (!hasOwn(source, fieldName)) {
    return defaultValue;
  }

  return source[fieldName];
}

function hasPromptReferenceField(
  source = {},
  promptSlugFieldName,
  legacyPromptIdFieldName
) {
  return (
    hasOwn(source, promptSlugFieldName) ||
    hasOwn(source, legacyPromptIdFieldName)
  );
}

function getPromptText(source = {}, fieldName) {
  return String(source[fieldName] || "");
}

function isSamePromptContent(prompt, sourcePrompt) {
  const normalizedPrompt = normalizePrompt(prompt);
  const normalizedSourcePrompt = normalizePrompt(sourcePrompt);

  return (
    normalizedPrompt.category === normalizedSourcePrompt.category &&
    normalizedPrompt.systemPrompt === normalizedSourcePrompt.systemPrompt &&
    normalizedPrompt.userPrompt === normalizedSourcePrompt.userPrompt
  );
}

function findPresetPromptByContent(sourcePrompt) {
  return PRESET_PROMPTS.find((prompt) =>
    isSamePromptContent(prompt, sourcePrompt)
  );
}

function createStablePromptHash(sourceText) {
  const text = String(sourceText);
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  // 该 hash 只用于生成稳定 slug，不承担安全校验职责。
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ (code + index), 0x811c9dc5);
  }

  return `${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
}

function createMigratedPromptName(apiSetting = {}, promptLabel) {
  const apiName = String(apiSetting.apiName || apiSetting.apiSlug || "API");
  return `${apiName} ${promptLabel}`;
}

function createMigratedPromptSlug(apiSetting = {}, promptType, sourcePrompt) {
  const hash = createStablePromptHash(
    JSON.stringify({
      apiSlug: String(apiSetting.apiSlug || ""),
      promptType,
      category: sourcePrompt.category,
      systemPrompt: sourcePrompt.systemPrompt,
      userPrompt: sourcePrompt.userPrompt,
    })
  );

  return `prompt_migrated_${promptType}_${hash}`;
}

function getAvailableMigratedPromptSlug(promptBySlug, sourcePrompt, baseSlug) {
  let index = 1;
  let promptSlug = baseSlug;

  while (promptBySlug.has(promptSlug)) {
    if (isSamePromptContent(promptBySlug.get(promptSlug), sourcePrompt)) {
      return promptSlug;
    }

    index += 1;
    promptSlug = `${baseSlug}_${index}`;
  }

  return promptSlug;
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

function hasPromptReference(
  source = {},
  promptSlugFieldName,
  legacyPromptIdFieldName,
  promptSlug
) {
  if (hasOwn(source, promptSlugFieldName)) {
    return source[promptSlugFieldName] === promptSlug;
  }

  return (
    hasOwn(source, legacyPromptIdFieldName) &&
    source[legacyPromptIdFieldName] === promptSlug
  );
}

export function removeLegacyApiPromptIds(apiSetting = {}) {
  if (!apiSetting) {
    return apiSetting;
  }

  const nextApiSetting = { ...apiSetting };
  delete nextApiSetting.batchPromptId;
  delete nextApiSetting.nobatchPromptId;
  delete nextApiSetting.subtitlePromptId;

  return nextApiSetting;
}

const LEGACY_API_PROMPT_MIGRATIONS = [
  {
    promptType: "batch",
    promptLabel: "Batch prompt",
    category: PROMPT_CATEGORY_BATCH_SYSTEM,
    systemPromptFieldName: "systemPrompt",
    userPromptFieldName: "",
    promptSlugFieldName: "batchPromptSlug",
    legacyPromptIdFieldName: "batchPromptId",
  },
  {
    promptType: "nobatch",
    promptLabel: "Non-batch prompt",
    category: PROMPT_CATEGORY_USER,
    systemPromptFieldName: "nobatchPrompt",
    userPromptFieldName: "nobatchUserPrompt",
    promptSlugFieldName: "nobatchPromptSlug",
    legacyPromptIdFieldName: "nobatchPromptId",
  },
  {
    promptType: "subtitle",
    promptLabel: "Subtitle prompt",
    category: PROMPT_CATEGORY_SUBTITLE,
    systemPromptFieldName: "subtitlePrompt",
    userPromptFieldName: "",
    promptSlugFieldName: "subtitlePromptSlug",
    legacyPromptIdFieldName: "subtitlePromptId",
  },
];

function createLegacyApiPromptSource(apiSetting, migration) {
  if (!hasOwn(apiSetting, migration.systemPromptFieldName)) {
    return null;
  }

  return {
    slug: "",
    category: migration.category,
    nameKey: "",
    name: createMigratedPromptName(apiSetting, migration.promptLabel),
    systemPrompt: getPromptText(apiSetting, migration.systemPromptFieldName),
    userPrompt: migration.userPromptFieldName
      ? getPromptText(apiSetting, migration.userPromptFieldName)
      : "",
  };
}

function createPromptSlugIndex(prompts = []) {
  const promptBySlug = new Map();

  prompts.forEach((prompt) => {
    const promptSlug = normalizePrompt(prompt).slug;
    if (promptSlug && !promptBySlug.has(promptSlug)) {
      promptBySlug.set(promptSlug, prompt);
    }
  });

  return promptBySlug;
}

function migrateLegacyApiPrompt(apiSetting, migration, customPromptState) {
  if (
    hasPromptReferenceField(
      apiSetting,
      migration.promptSlugFieldName,
      migration.legacyPromptIdFieldName
    )
  ) {
    return "";
  }

  const sourcePrompt = createLegacyApiPromptSource(apiSetting, migration);
  if (!sourcePrompt) {
    return "";
  }

  const presetPrompt = findPresetPromptByContent(sourcePrompt);
  if (presetPrompt) {
    return normalizePrompt(presetPrompt).slug;
  }

  const baseSlug = createMigratedPromptSlug(
    apiSetting,
    migration.promptType,
    sourcePrompt
  );
  const promptSlug = getAvailableMigratedPromptSlug(
    customPromptState.promptBySlug,
    sourcePrompt,
    baseSlug
  );

  if (!customPromptState.promptBySlug.has(promptSlug)) {
    const migratedPrompt = {
      ...sourcePrompt,
      slug: promptSlug,
    };
    customPromptState.prompts.push(migratedPrompt);
    customPromptState.promptBySlug.set(promptSlug, migratedPrompt);
    customPromptState.hasPromptChanges = true;
  }

  return promptSlug;
}

export function migrateLegacyPromptSettings(setting = {}) {
  if (!setting || typeof setting !== "object") {
    return setting;
  }

  if (!Array.isArray(setting.transApis)) {
    return setting;
  }

  const customPrompts = Array.isArray(setting.prompts) ? setting.prompts : [];
  const customPromptState = {
    prompts: [...customPrompts],
    promptBySlug: createPromptSlugIndex([...PRESET_PROMPTS, ...customPrompts]),
    hasPromptChanges: false,
  };
  let hasApiChanges = false;

  const transApis = setting.transApis.map((apiSetting) => {
    if (!apiSetting || typeof apiSetting !== "object") {
      return apiSetting;
    }

    let nextApiSetting = apiSetting;

    LEGACY_API_PROMPT_MIGRATIONS.forEach((migration) => {
      const promptSlug = migrateLegacyApiPrompt(
        apiSetting,
        migration,
        customPromptState
      );

      if (
        promptSlug &&
        apiSetting[migration.promptSlugFieldName] !== promptSlug
      ) {
        if (nextApiSetting === apiSetting) {
          nextApiSetting = { ...apiSetting };
        }

        // 旧版 API 内联 prompt 升级为新版 prompt 引用；内联字段继续保留作运行时镜像。
        nextApiSetting[migration.promptSlugFieldName] = promptSlug;
        delete nextApiSetting[migration.legacyPromptIdFieldName];
        hasApiChanges = true;
      }
    });

    return nextApiSetting;
  });

  if (!hasApiChanges && !customPromptState.hasPromptChanges) {
    return setting;
  }

  const nextSetting = { ...setting };

  if (hasApiChanges) {
    nextSetting.transApis = transApis;
  }

  if (customPromptState.hasPromptChanges) {
    nextSetting.prompts = customPromptState.prompts;
  }

  return nextSetting;
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
      hasPromptReference(api, "batchPromptSlug", "batchPromptId", promptSlug)
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
        "nobatchPromptSlug",
        "nobatchPromptId",
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
        "subtitlePromptSlug",
        "subtitlePromptId",
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
    "segPromptSlug",
    "segPromptId",
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
  const hasBatchPromptReference = hasPromptReferenceField(
    nextApiSetting,
    "batchPromptSlug",
    "batchPromptId"
  );
  const hasBatchPromptInlineValue = hasOwn(nextApiSetting, "systemPrompt");
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

  if (batchPrompt && (hasBatchPromptReference || !hasBatchPromptInlineValue)) {
    nextApiSetting.batchPromptSlug = normalizePrompt(batchPrompt).slug;
    delete nextApiSetting.batchPromptId;
    nextApiSetting.systemPrompt = batchPrompt.systemPrompt;
  }

  const hasNobatchPromptReference = hasPromptReferenceField(
    nextApiSetting,
    "nobatchPromptSlug",
    "nobatchPromptId"
  );
  const hasNobatchPromptInlineValue =
    hasOwn(nextApiSetting, "nobatchPrompt") ||
    hasOwn(nextApiSetting, "nobatchUserPrompt");
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

  if (
    nobatchPrompt &&
    (hasNobatchPromptReference || !hasNobatchPromptInlineValue)
  ) {
    nextApiSetting.nobatchPromptSlug = normalizePrompt(nobatchPrompt).slug;
    delete nextApiSetting.nobatchPromptId;
    nextApiSetting.nobatchPrompt = nobatchPrompt.systemPrompt;
    nextApiSetting.nobatchUserPrompt = nobatchPrompt.userPrompt;
  }

  const useGlobalSubtitlePrompt =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL;
  const hasSubtitlePromptReference = hasPromptReferenceField(
    nextApiSetting,
    "subtitlePromptSlug",
    "subtitlePromptId"
  );
  const hasSubtitlePromptInlineValue = hasOwn(nextApiSetting, "subtitlePrompt");
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

  if (
    subtitlePrompt &&
    (useGlobalSubtitlePrompt ||
      hasSubtitlePromptReference ||
      !hasSubtitlePromptInlineValue)
  ) {
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
