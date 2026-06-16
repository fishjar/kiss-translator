import {
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultSystemPrompt,
  defaultSystemPromptLines,
  defaultSystemPromptXml,
  defaultDictPrompt,
  defaultDictUserPrompt,
  defaultSubtitlePrompt,
  API_SPE_TYPES,
} from "./api";

// 定义各类预设提示词的唯一标识符 (Slug)
export const PROMPT_SLUG_NOBATCH_TRANSLATION = "nobatch-translation";
export const PROMPT_SLUG_BATCH_TRANSLATION_JSON = "batch-translation-json";
export const PROMPT_SLUG_BATCH_TRANSLATION_XML = "batch-translation-xml";
export const PROMPT_SLUG_BATCH_TRANSLATION_LINE = "batch-translation-line";
export const PROMPT_SLUG_SUBTITLE_SEGMENTATION = "subtitle-segmentation";
export const PROMPT_SLUG_DICTIONARY_EN_ZH = "dictionary-en-zh";

// 提示词应用模式：跟随接口内部配置，或使用全局统一配置
export const PROMPT_MODE_FOLLOW_API = "follow_api";
export const PROMPT_MODE_GLOBAL = "global";

// 定义提示词所属的分类，用于在界面和逻辑中进行归类区分
export const PROMPT_CATEGORY_BATCH_SYSTEM = "batch system prompt";
export const PROMPT_CATEGORY_USER = "user prompt";
export const PROMPT_CATEGORY_SUBTITLE = "subtitle prompt";
export const PROMPT_CATEGORY_DICTIONARY = "dictionary prompt";
// 允许在设置界面“提示词管理”中展示和维护的分类列表
export const PROMPT_TEMPLATE_CATEGORIES = [
  PROMPT_CATEGORY_USER,
  PROMPT_CATEGORY_BATCH_SYSTEM,
  PROMPT_CATEGORY_SUBTITLE,
  PROMPT_CATEGORY_DICTIONARY,
];

// 各类功能默认使用的提示词 Slug，当未配置时作为后备默认值
export const DEFAULT_NOBATCH_PROMPT_SLUG = PROMPT_SLUG_NOBATCH_TRANSLATION;
export const DEFAULT_BATCH_PROMPT_SLUG = PROMPT_SLUG_BATCH_TRANSLATION_JSON;
export const DEFAULT_SUBTITLE_PROMPT_SLUG = PROMPT_SLUG_SUBTITLE_SEGMENTATION;
export const DEFAULT_DICTIONARY_PROMPT_SLUG = PROMPT_SLUG_DICTIONARY_EN_ZH;

// 配置数据结构的版本号（用于检测并执行数据迁移升级逻辑）
export const SETTINGS_VERSION_V1 = 1;
export const SETTINGS_VERSION_V2 = 2;
export const CURRENT_SETTINGS_VERSION = SETTINGS_VERSION_V2;

/**
 * 预设的提示词列表。包含了系统出厂自带的各种场景提示词模板。
 * 用户不能删除预设提示词，但可以基于它们复制出自定义的模板。
 */
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
    name: "AI English-Chinese Dictionary",
    systemPrompt: defaultDictPrompt,
    userPrompt: defaultDictUserPrompt,
  },
];

const PRESET_PROMPT_SLUGS = new Set(
  PRESET_PROMPTS.map((prompt) => prompt.slug)
);
const PROMPT_STORAGE_FIELDS = [
  "slug",
  "category",
  "name",
  "systemPrompt",
  "userPrompt",
];

/**
 * 规范化提示词对象，确保所有必填字段为字符串格式。
 * 避免因为 undefined 等值导致报错或判断异常。
 *
 * @param {Object} prompt 原始提示词对象
 * @returns {Object} 规范化后的提示词对象
 */
export function normalizePrompt(prompt = {}) {
  return {
    slug: String(prompt.slug || ""),
    category: String(prompt.category || ""),
    nameKey: String(prompt.nameKey || ""),
    name: String(prompt.name || ""),
    systemPrompt: String(prompt.systemPrompt || ""),
    userPrompt: String(prompt.userPrompt || ""),
  };
}

/**
 * 判断给定的提示词标识符是否属于系统预设提示词。
 *
 * @param {string} promptSlug 提示词标识符
 * @returns {boolean} 是否为预设提示词
 */
export function isPresetPromptSlug(promptSlug) {
  return PRESET_PROMPT_SLUGS.has(promptSlug);
}

/**
 * 获取所有可用的提示词（包含预设的提示词与用户自定义的提示词）。
 *
 * @param {Array} userPrompts 用户自定义提示词列表
 * @returns {Array} 组合后的提示词列表
 */
export function getAllPrompts(userPrompts = []) {
  const customPrompts = normalizeCustomPrompts(userPrompts);

  return [...PRESET_PROMPTS, ...customPrompts];
}

/**
 * 过滤并规范化用户自定义的提示词列表，去除无效或与预设冲突的项。
 *
 * @param {Array} userPrompts 用户自定义提示词列表
 * @returns {Array} 清洗后的自定义提示词列表
 */
export function normalizeCustomPrompts(userPrompts = []) {
  return (Array.isArray(userPrompts) ? userPrompts : [])
    .map(normalizePrompt)
    .filter((prompt) => prompt.slug && !isPresetPromptSlug(prompt.slug))
    .map(({ slug, category, name, systemPrompt, userPrompt }) => ({
      slug,
      category,
      name,
      systemPrompt,
      userPrompt,
    }));
}

/**
 * 根据 Slug 查找对应的提示词对象（优先从全部列表中查找）。
 *
 * @param {Array} userPrompts 用户自定义提示词列表
 * @param {string} promptSlug 需要查找的提示词 Slug
 * @returns {Object|null} 匹配的提示词对象，未找到返回 null
 */
export function findPromptBySlug(userPrompts = [], promptSlug) {
  if (!promptSlug) {
    return null;
  }

  return getAllPrompts(userPrompts).find(
    (prompt) => prompt?.slug === promptSlug
  );
}

function findPromptBySlugOrDefault(userPrompts, promptSlug, defaultPromptSlug) {
  return (
    findPromptBySlug(userPrompts, promptSlug) ||
    findPromptBySlug(userPrompts, defaultPromptSlug)
  );
}

/**
 * 获取指定提示词的名称（未进行本地化翻译的原始名称）。
 *
 * @param {Array} userPrompts 用户自定义提示词列表
 * @param {string} promptSlug 提示词标识符
 * @returns {string} 提示词名称，未找到则返回空字符串
 */
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

function hasPromptReferenceField(source = {}, promptSlugFieldName) {
  return hasOwn(source, promptSlugFieldName);
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

/**
 * 获取提示词在界面上显示的名称（支持国际化 i18n 翻译）。
 *
 * @param {Object} prompt 提示词对象
 * @param {Function} i18n 多语言翻译函数
 * @returns {string} 对应的展示名称
 */
export function getPromptDisplayName(prompt = {}, i18n) {
  const normalizedPrompt = normalizePrompt(prompt);
  if (normalizedPrompt.nameKey && typeof i18n === "function") {
    return i18n(normalizedPrompt.nameKey, normalizedPrompt.name);
  }

  return normalizedPrompt.name || normalizedPrompt.slug;
}

/**
 * 获取提示词分类在界面上显示的名称（支持国际化）。
 *
 * @param {string} category 提示词分类常量
 * @param {Function} i18n 多语言翻译函数
 * @returns {string} 分类的展示名称
 */
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
    (prompt) => prompt?.category === category
  );
}

/**
 * 获取所有可用的“非聚合翻译 (Non-batch)”提示词选项
 *
 * @param {Array} prompts 全部可用提示词列表
 * @returns {Array}
 */
export function getNobatchPromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_USER);
}

/**
 * 获取所有可用的“聚合翻译 (Batch)”提示词选项
 *
 * @param {Array} prompts 全部可用提示词列表
 * @returns {Array}
 */
export function getBatchPromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_BATCH_SYSTEM);
}

/**
 * 获取所有可用的“字幕翻译/分句”提示词选项
 *
 * @param {Array} prompts 全部可用提示词列表
 * @returns {Array}
 */
export function getSubtitlePromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_SUBTITLE);
}

/**
 * 获取 AI 词典可选提示词列表。
 *
 * 仅返回词典分类，供接口配置页和划词翻译框设置页复用。
 *
 * @param {Array<Object>} prompts 用户与预设提示词集合
 * @returns {Array<Object>} 可用于 AI 词典的提示词选项
 */
export function getDictionaryPromptOptions(prompts = []) {
  return getPromptOptions(prompts, PROMPT_CATEGORY_DICTIONARY);
}

function hasPromptReference(source = {}, promptSlugFieldName, promptSlug) {
  return (
    hasOwn(source, promptSlugFieldName) &&
    source[promptSlugFieldName] === promptSlug
  );
}

export function removeLegacyApiPromptIds(apiSetting = {}) {
  if (!apiSetting) {
    return apiSetting;
  }

  if (
    !hasOwn(apiSetting, "batchPromptId") &&
    !hasOwn(apiSetting, "nobatchPromptId") &&
    !hasOwn(apiSetting, "subtitlePromptId") &&
    !hasOwn(apiSetting, "dictPromptId")
  ) {
    return apiSetting;
  }

  const nextApiSetting = { ...apiSetting };
  delete nextApiSetting.batchPromptId;
  delete nextApiSetting.nobatchPromptId;
  delete nextApiSetting.subtitlePromptId;
  delete nextApiSetting.dictPromptId;

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
  },
  {
    promptType: "nobatch",
    promptLabel: "Non-batch prompt",
    category: PROMPT_CATEGORY_USER,
    systemPromptFieldName: "nobatchPrompt",
    userPromptFieldName: "nobatchUserPrompt",
    promptSlugFieldName: "nobatchPromptSlug",
  },
  {
    promptType: "subtitle",
    promptLabel: "Subtitle prompt",
    category: PROMPT_CATEGORY_SUBTITLE,
    systemPromptFieldName: "subtitlePrompt",
    userPromptFieldName: "",
    promptSlugFieldName: "subtitlePromptSlug",
  },
  {
    promptType: "dict",
    promptLabel: "Dictionary prompt",
    category: PROMPT_CATEGORY_DICTIONARY,
    systemPromptFieldName: "dictPrompt",
    userPromptFieldName: "dictUserPrompt",
    promptSlugFieldName: "dictPromptSlug",
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
    const promptSlug = prompt?.slug;
    if (promptSlug && !promptBySlug.has(promptSlug)) {
      promptBySlug.set(promptSlug, prompt);
    }
  });

  return promptBySlug;
}

function isStoredPromptListNormalized(sourcePrompts = [], normalizedPrompts) {
  if (!Array.isArray(sourcePrompts)) {
    return normalizedPrompts.length === 0;
  }

  if (sourcePrompts.length !== normalizedPrompts.length) {
    return false;
  }

  return sourcePrompts.every((prompt, index) => {
    if (!prompt || typeof prompt !== "object") {
      return false;
    }

    const hasOnlyPromptStorageFields = Object.keys(prompt).every((fieldName) =>
      PROMPT_STORAGE_FIELDS.includes(fieldName)
    );

    return (
      hasOnlyPromptStorageFields &&
      JSON.stringify(normalizePrompt(prompt)) ===
        JSON.stringify(normalizedPrompts[index])
    );
  });
}

function removeLegacySubtitlePromptId(subtitleSetting) {
  if (!subtitleSetting || !hasOwn(subtitleSetting, "segPromptId")) {
    return subtitleSetting;
  }

  const nextSubtitleSetting = { ...subtitleSetting };
  delete nextSubtitleSetting.segPromptId;
  return nextSubtitleSetting;
}

function removeApiPromptTextFields(apiSetting, migration) {
  const nextApiSetting = { ...apiSetting };
  delete nextApiSetting[migration.systemPromptFieldName];
  if (migration.userPromptFieldName) {
    delete nextApiSetting[migration.userPromptFieldName];
  }
  return nextApiSetting;
}

function migrateLegacyApiPrompt(apiSetting, migration, customPromptState) {
  if (hasPromptReferenceField(apiSetting, migration.promptSlugFieldName)) {
    return "";
  }

  const sourcePrompt = createLegacyApiPromptSource(apiSetting, migration);
  if (!sourcePrompt) {
    return "";
  }

  const presetPrompt = findPresetPromptByContent(sourcePrompt);
  if (presetPrompt) {
    return presetPrompt.slug;
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

/**
 * 获取当前配置对象的数据版本号。
 * 如果未设置或遇到异常情况，则默认返回 V1 版本。
 *
 * @param {Object} setting 配置对象
 * @returns {number} 数据结构版本号
 */
export function getSettingVersion(setting = {}) {
  const version = Number(setting?.version || SETTINGS_VERSION_V1);
  return Number.isFinite(version) && version >= SETTINGS_VERSION_V1
    ? version
    : SETTINGS_VERSION_V1;
}

/**
 * 核心迁移逻辑：将旧版本 (V1) 的 API 配置升级为 V2 格式。
 * 在 V1 中，提示词文本通常是硬编码在每个 API 配置中的（systemPrompt, userPrompt 等）。
 * 本函数会将这些内联的文本提取出来，生成全局复用的 custom prompt，并在 API 配置中改为通过 slug 引用该提示词。
 *
 * @param {Object} setting 旧版原始配置对象
 * @returns {Object} 升级迁移为 V2 格式的新配置对象
 */
export function migrateSettingPromptsToV2(setting = {}) {
  if (!setting || typeof setting !== "object") {
    return setting;
  }

  if (!Array.isArray(setting.transApis)) {
    return { ...setting, version: SETTINGS_VERSION_V2 };
  }

  const storedCustomPrompts = Array.isArray(setting.prompts)
    ? setting.prompts
    : [];
  const customPrompts = normalizeCustomPrompts(storedCustomPrompts);
  const hasCustomPromptChanges = !isStoredPromptListNormalized(
    storedCustomPrompts,
    customPrompts
  );
  const subtitleSetting = removeLegacySubtitlePromptId(setting.subtitleSetting);
  const hasSubtitleSettingChanges = subtitleSetting !== setting.subtitleSetting;
  const customPromptState = {
    prompts: [...customPrompts],
    promptBySlug: createPromptSlugIndex([...PRESET_PROMPTS, ...customPrompts]),
    hasPromptChanges: hasCustomPromptChanges,
  };
  let hasApiChanges = false;

  const transApis = setting.transApis.map((apiSetting) => {
    if (!apiSetting || typeof apiSetting !== "object") {
      return apiSetting;
    }

    let nextApiSetting = removeLegacyApiPromptIds(apiSetting);
    if (nextApiSetting !== apiSetting) {
      hasApiChanges = true;
    }

    LEGACY_API_PROMPT_MIGRATIONS.forEach((migration) => {
      const hasApiType = Boolean(nextApiSetting.apiType);
      const isNonAiApi =
        hasApiType && !API_SPE_TYPES.ai.has(nextApiSetting.apiType);

      const sysVal =
        typeof nextApiSetting[migration.systemPromptFieldName] === "string"
          ? nextApiSetting[migration.systemPromptFieldName].trim()
          : "";
      const userVal =
        migration.userPromptFieldName &&
        typeof nextApiSetting[migration.userPromptFieldName] === "string"
          ? nextApiSetting[migration.userPromptFieldName].trim()
          : "";
      const isEmpty = !sysVal && !userVal;

      if (isNonAiApi || isEmpty) {
        if (
          hasOwn(nextApiSetting, migration.systemPromptFieldName) ||
          (migration.userPromptFieldName &&
            hasOwn(nextApiSetting, migration.userPromptFieldName))
        ) {
          if (nextApiSetting === apiSetting) {
            nextApiSetting = { ...apiSetting };
          }
          nextApiSetting = removeApiPromptTextFields(nextApiSetting, migration);
          hasApiChanges = true;
        }
        return;
      }

      const promptSlug = migrateLegacyApiPrompt(
        nextApiSetting,
        migration,
        customPromptState
      );

      if (
        promptSlug &&
        nextApiSetting[migration.promptSlugFieldName] !== promptSlug
      ) {
        if (nextApiSetting === apiSetting) {
          nextApiSetting = { ...apiSetting };
        }

        // 旧版 API 内联 prompt 升级为新版 prompt 引用，并删除旧的内联字段。
        nextApiSetting[migration.promptSlugFieldName] = promptSlug;
        delete nextApiSetting[migration.systemPromptFieldName];
        if (migration.userPromptFieldName) {
          delete nextApiSetting[migration.userPromptFieldName];
        }
        hasApiChanges = true;
      }
    });

    return nextApiSetting;
  });

  const nextSetting = { ...setting };

  nextSetting.version = SETTINGS_VERSION_V2;
  nextSetting.transApis = hasApiChanges ? transApis : setting.transApis;
  nextSetting.prompts = customPromptState.hasPromptChanges
    ? customPromptState.prompts
    : customPrompts;

  if (hasSubtitleSettingChanges) {
    nextSetting.subtitleSetting = subtitleSetting;
  }

  return nextSetting;
}

/**
 * 删除某个自定义提示词后，级联更新所有引用了该提示词的接口配置。
 * 遍历各个 API 和字幕设置，如果它们正在使用被删除的提示词（根据 promptSlug 判断），
 * 则将它们回退重置为对应类型的系统默认提示词（DEFAULT_***_PROMPT_SLUG）。
 *
 * @param {Object} setting 完整的配置对象
 * @param {string} promptSlug 被删除的提示词 Slug
 * @returns {Object} 更新引用后的配置对象副本
 */
export function removePromptReferences(setting = {}, promptSlug) {
  if (!promptSlug || isPresetPromptSlug(promptSlug)) {
    return setting;
  }

  let hasApiChanges = false;

  const transApis = (
    Array.isArray(setting?.transApis) ? setting.transApis : []
  ).map((api) => {
    let nextApi = api;

    if (hasPromptReference(api, "batchPromptSlug", promptSlug)) {
      nextApi = {
        ...nextApi,
        batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
      };
      delete nextApi.systemPrompt;
      hasApiChanges = true;
    }

    if (hasPromptReference(api, "nobatchPromptSlug", promptSlug)) {
      nextApi = {
        ...nextApi,
        nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
      };
      delete nextApi.nobatchPrompt;
      delete nextApi.nobatchUserPrompt;
      hasApiChanges = true;
    }

    if (hasPromptReference(api, "subtitlePromptSlug", promptSlug)) {
      nextApi = {
        ...nextApi,
        subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
      };
      delete nextApi.subtitlePrompt;
      hasApiChanges = true;
    }

    if (hasPromptReference(api, "dictPromptSlug", promptSlug)) {
      nextApi = {
        ...nextApi,
        dictPromptSlug: DEFAULT_DICTIONARY_PROMPT_SLUG,
      };
      delete nextApi.dictPrompt;
      delete nextApi.dictUserPrompt;
      hasApiChanges = true;
    }

    return nextApi;
  });

  const hasSubtitlePromptReference = hasPromptReference(
    setting?.subtitleSetting,
    "segPromptSlug",
    promptSlug
  );
  const hasTranboxDictPromptReference = hasPromptReference(
    setting?.tranboxSetting,
    "aiDictPromptSlug",
    promptSlug
  );

  if (
    !hasApiChanges &&
    !hasSubtitlePromptReference &&
    !hasTranboxDictPromptReference
  ) {
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
  }

  if (hasTranboxDictPromptReference) {
    nextSetting.tranboxSetting = {
      ...(setting?.tranboxSetting || {}),
      aiDictPromptSlug: PROMPT_MODE_FOLLOW_API,
    };
  }

  return nextSetting;
}

/**
 * 在运行时，将接口配置中引用的提示词 Slug 解析展开。
 * 它会根据配置中的 `***PromptSlug` 字段，去 `userPrompts` 或预设列表中寻找实际的提示词文本，
 * 并把解析后的实际 `systemPrompt` 和 `userPrompt` 内容注入到 API 配置对象副本中，供翻译时直接取用。
 *
 * @param {Object} apiSetting 单个接口配置
 * @param {Array} userPrompts 用户自定义提示词列表
 * @param {Object} subtitleSetting 字幕相关的特殊全局配置
 * @returns {Object} 填充了实际提示词文本的 API 配置副本
 */
export function resolveApiPromptSettings(
  apiSetting = {},
  userPrompts = [],
  subtitleSetting = {}
) {
  if (!apiSetting) {
    return apiSetting;
  }

  const cleanedApiSetting = removeLegacyApiPromptIds(apiSetting);
  const nextApiSetting =
    cleanedApiSetting === apiSetting ? { ...apiSetting } : cleanedApiSetting;
  const hasBatchPromptReference = hasPromptReferenceField(
    nextApiSetting,
    "batchPromptSlug"
  );
  const hasBatchPromptInlineValue = hasOwn(nextApiSetting, "systemPrompt");
  const batchPromptSlug = getPromptFieldValue(
    nextApiSetting,
    "batchPromptSlug",
    DEFAULT_BATCH_PROMPT_SLUG
  );
  const batchPrompt = findPromptBySlugOrDefault(
    userPrompts,
    batchPromptSlug,
    DEFAULT_BATCH_PROMPT_SLUG
  );

  if (batchPrompt && (hasBatchPromptReference || !hasBatchPromptInlineValue)) {
    nextApiSetting.batchPromptSlug = batchPrompt.slug;
    nextApiSetting.systemPrompt = batchPrompt.systemPrompt;
  }

  const hasNobatchPromptReference = hasPromptReferenceField(
    nextApiSetting,
    "nobatchPromptSlug"
  );
  const hasNobatchPromptInlineValue =
    hasOwn(nextApiSetting, "nobatchPrompt") ||
    hasOwn(nextApiSetting, "nobatchUserPrompt");
  const nobatchPromptSlug = getPromptFieldValue(
    nextApiSetting,
    "nobatchPromptSlug",
    DEFAULT_NOBATCH_PROMPT_SLUG
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
    nextApiSetting.nobatchPromptSlug = nobatchPrompt.slug;
    nextApiSetting.nobatchPrompt = nobatchPrompt.systemPrompt;
    nextApiSetting.nobatchUserPrompt = nobatchPrompt.userPrompt;
  }

  const useGlobalSubtitlePrompt =
    subtitleSetting?.segPromptMode === PROMPT_MODE_GLOBAL;
  const hasSubtitlePromptReference = hasPromptReferenceField(
    nextApiSetting,
    "subtitlePromptSlug"
  );
  const hasSubtitlePromptInlineValue = hasOwn(nextApiSetting, "subtitlePrompt");
  const subtitlePromptSlug = useGlobalSubtitlePrompt
    ? getPromptFieldValue(
        subtitleSetting,
        "segPromptSlug",
        DEFAULT_SUBTITLE_PROMPT_SLUG
      )
    : getPromptFieldValue(
        nextApiSetting,
        "subtitlePromptSlug",
        DEFAULT_SUBTITLE_PROMPT_SLUG
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
      nextApiSetting.subtitlePromptSlug = subtitlePrompt.slug;
    }
    nextApiSetting.subtitlePrompt = subtitlePrompt.systemPrompt;
  }

  const hasDictPromptReference = hasPromptReferenceField(
    nextApiSetting,
    "dictPromptSlug"
  );
  const hasDictPromptInlineValue =
    hasOwn(nextApiSetting, "dictPrompt") ||
    hasOwn(nextApiSetting, "dictUserPrompt");
  const dictPromptSlug = getPromptFieldValue(
    nextApiSetting,
    "dictPromptSlug",
    DEFAULT_DICTIONARY_PROMPT_SLUG
  );
  const dictPrompt = findPromptBySlugOrDefault(
    userPrompts,
    dictPromptSlug,
    DEFAULT_DICTIONARY_PROMPT_SLUG
  );

  if (dictPrompt && (hasDictPromptReference || !hasDictPromptInlineValue)) {
    nextApiSetting.dictPromptSlug = dictPrompt.slug;
    nextApiSetting.dictPrompt = dictPrompt.systemPrompt;
    nextApiSetting.dictUserPrompt = dictPrompt.userPrompt;
  }

  return nextApiSetting;
}

/**
 * 批量解析 API 列表中的提示词配置。
 * 遍历所有 API，逐个调用 resolveApiPromptSettings，返回展开实际提示词文本后的新数组。
 *
 * @param {Array} transApis 接口配置列表
 * @param {Array} userPrompts 用户自定义提示词列表
 * @param {Object} subtitleSetting 字幕配置
 * @returns {Array} 解析后的接口配置列表
 */
export function resolveApiPromptList(
  transApis = [],
  userPrompts = [],
  subtitleSetting = {}
) {
  return (Array.isArray(transApis) ? transApis : []).map((api) =>
    resolveApiPromptSettings(api, userPrompts, subtitleSetting)
  );
}
