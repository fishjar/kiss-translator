import {
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_ZAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
  OPT_TRANS_OPENAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_OLLAMA,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
} from "../config/apiConstants";

// Compiled vendor/model metadata shared by request adapters and settings.
// Legacy config exports below remain compatibility aliases; no interpretation is involved.
const THINKING_EFFORT_LABELS = {
  max: "Max",
  xhigh: "X-High",
  high: "High",
  medium: "Medium",
  low: "Low",
  minimal: "Minimal",
};
const THINKING_EFFORT_RANK = {
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};

/**
 * 将思考强度值转换为设置页可直接渲染的选项。
 * @param {string[]} efforts 按强到弱排列的思考强度值。
 * @returns {Array<{value: string, label: string}>} 带显示名称的强度选项。
 */
const toThinkingEffortOptions = (efforts = []) =>
  efforts.map((effort) => ({
    value: effort,
    label: THINKING_EFFORT_LABELS[effort] || effort,
  }));

/**
 * 创建统一的模型思考能力对象。
 * @param {string[]|null} efforts 模型支持的思考强度；null 表示没有强度参数。
 * @param {Object} extra 协议开关、关闭方式等附加能力。
 * @returns {Object} 标准化后的模型思考能力。
 */
const createThinkingCapability = (efforts, extra = {}) => ({
  efforts: efforts ? toThinkingEffortOptions(efforts) : null,
  ...extra,
});

/**
 * 创建通过 reasoning_effort 开启、通过 none 关闭的 OpenAI 兼容能力。
 * @param {string[]} efforts 模型支持的思考强度。
 * @param {Object} [defaults] 模型公布的默认思考行为。
 * @returns {Object} OpenAI 兼容模型的统一思考能力。
 */
const createOpenAIThinkingCapability = (efforts, defaults = {}) =>
  createThinkingCapability(efforts, {
    enable: "effort",
    disable: "none",
    ...defaults,
  });

const normalizeOpenAIModelName = (model = "") =>
  String(model)
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "");

export const isGPT6Astra = (model = "") =>
  normalizeOpenAIModelName(model) === "gpt-6-astra";

/**
 * 根据 OpenAI 模型名称解析已确认的思考能力。
 * @param {string} model OpenAI 或带 openai/ 前缀的模型名称。
 * @returns {Object|null} 已知模型的思考能力；未知模型返回 null。
 */
const getOpenAIThinkingCapability = (model = "") => {
  const normalizedModel = normalizeOpenAIModelName(model);

  if (normalizedModel === "gpt-6-astra") {
    // https://developers.openai.com/api/docs/models/gpt-6-astra
    // Astra 不支持关闭思考；沿用最低强度降级及其 UI 提示。
    return createOpenAIThinkingCapability(
      ["max", "xhigh", "high", "medium", "low"],
      { disable: null }
    );
  }

  if (/^gpt-5\.6(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability([
      "max",
      "xhigh",
      "high",
      "medium",
      "low",
    ]);
  }
  if (/^gpt-5\.(?:4|2)-pro(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium"]);
  }
  if (/^gpt-5-pro(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high"]);
  }
  if (/^gpt-5\.[23]-codex(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"]);
  }
  if (/^gpt-5\.(?:5|4|2)(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"]);
  }
  if (/^gpt-5\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low"], {
      // GPT-5.1 默认不推理；用户明确开启时应回落到最低非关闭强度 low。
      defaultEnabled: false,
      defaultEffort: "none",
    });
  }
  if (/^gpt-5\.1(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low"]);
  }
  if (/^gpt-5(?:-|$)/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low", "minimal"]);
  }

  return null;
};

/**
 * 将设置页内存中的 OpenRouter reasoning 元数据转换为统一能力。
 * @param {string} model 当前选中的模型名称。
 * @param {Object|undefined} metadata 模型目录中当前模型的 reasoning 元数据。
 * @returns {Object|null} 可确认的模型能力；元数据无效时返回 null。
 */
export const getOpenRouterThinkingCapability = (model, metadata) => {
  if (!metadata || metadata.model !== model) return null;

  const supportedEfforts = Array.isArray(metadata.supportedEfforts)
    ? metadata.supportedEfforts.filter(
        (effort) =>
          effort !== "none" && THINKING_EFFORT_RANK[effort] !== undefined
      )
    : [];
  if (!supportedEfforts.length) return null;

  return createThinkingCapability(supportedEfforts, {
    enable: "effort",
    disable: metadata.mandatory ? null : "none",
    // 默认值只参与设置页归一化，不会进入持久化配置和请求生成器。
    defaultEffort: metadata.defaultEffort,
    defaultEnabled: metadata.defaultEnabled,
  });
};

/**
 * 根据 Claude 模型名称解析原生 adaptive thinking 能力。
 * @param {string} model Claude 模型名称。
 * @returns {Object|null} 已知模型的思考能力；旧模型或未知模型返回 null。
 */
const getClaudeThinkingCapability = (model = "") => {
  const normalizedModel = String(model).trim().toLowerCase();
  const supportsAdaptiveThinking =
    /^claude-(?:opus|sonnet)-(?:[5-9](?:-|$)|4-[6-9](?:-|$))/.test(
      normalizedModel
    ) ||
    /^claude-(?:fable|mythos)-5(?:-|$)/.test(normalizedModel) ||
    normalizedModel.startsWith("claude-mythos-preview");

  if (!supportsAdaptiveThinking) return null;

  const mandatory =
    /^claude-(?:fable|mythos)-5(?:-|$)/.test(normalizedModel) ||
    normalizedModel.startsWith("claude-mythos-preview");
  return createThinkingCapability(["max", "xhigh", "high", "medium", "low"], {
    enable: "explicit",
    disable: mandatory ? null : "explicit",
  });
};

/**
 * 根据 Gemini 模型与请求协议解析思考强度和关闭方式。
 * @param {Object} options Gemini 能力解析参数。
 * @param {string} options.apiType Gemini 原生或 OpenAI 兼容接口类型。
 * @param {string} [options.url] 实际请求地址，用于区分 Interactions 与 Generate Content。
 * @param {string} [options.model] Gemini 模型名称。
 * @returns {Object|null} 已知模型的思考能力；未知模型返回 null。
 */
const resolveGeminiCapability = ({ apiType, url = "", model = "" }) => {
  const efforts = getGeminiThinkingEfforts({ apiType, model });
  if (!efforts) return null;

  const normalizedModel = normalizeGeminiModelName(model);
  // disable 记录原生关闭方式；null 表示只能降到模型最低思考强度。
  let disable = null;
  if (apiType === OPT_TRANS_GEMINI_2 && isGemini25NonPro(normalizedModel)) {
    disable = "none";
  } else if (
    apiType === OPT_TRANS_GEMINI &&
    isGeminiInteractionsUrl(url) &&
    isGemini25FlashLite(normalizedModel)
  ) {
    disable = "omit";
  } else if (
    apiType === OPT_TRANS_GEMINI &&
    !isGeminiInteractionsUrl(url) &&
    isGemini25NonPro(normalizedModel)
  ) {
    disable = 0;
  }

  let defaultEffort = null;
  let defaultEnabled = true;
  if (isGemini25(normalizedModel)) {
    defaultEnabled = !isGemini25FlashLite(normalizedModel);
    // Generate Content 使用 -1 明确表达 Gemini 2.5 的动态思考默认值；
    // Interactions 与 OpenAI-compatible 省略强度即可采用服务端默认行为。
    if (
      defaultEnabled &&
      apiType === OPT_TRANS_GEMINI &&
      !isGeminiInteractionsUrl(url)
    ) {
      defaultEffort = -1;
    }
  } else if (
    normalizedModel.startsWith("gemini-3.6-flash") ||
    (normalizedModel.startsWith("gemini-3.5-flash") &&
      !normalizedModel.startsWith("gemini-3.5-flash-lite"))
  ) {
    defaultEffort = "medium";
  } else if (
    normalizedModel.includes("flash-lite") ||
    isGemini31FlashLiteImage(normalizedModel)
  ) {
    defaultEffort = "minimal";
  } else if (
    isGemini31Pro(normalizedModel) ||
    isGemini3Pro(normalizedModel) ||
    normalizedModel.startsWith("gemini-3-flash")
  ) {
    defaultEffort = "high";
  }

  return createThinkingCapability(
    efforts.map((item) => item.value),
    { enable: "effort", disable, defaultEffort, defaultEnabled }
  );
};

/**
 * 为能力固定的接口创建注册表 resolver。
 * @param {string[]|null} efforts 接口统一支持的思考强度。
 * @param {Object} extra 接口统一的开关和字段能力。
 * @returns {Function} 无需模型判断、直接返回固定能力的 resolver。
 */
const resolveFixedCapability = (efforts, extra) => () =>
  createThinkingCapability(efforts, extra);

// 新增同协议接口只需登记 adapter；新增模型能力则只修改对应 resolver。
export const THINKING_API_REGISTRY = {
  [OPT_TRANS_DEEPSEEK]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(["max", "high"], {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_OPENCODEGO]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(["max", "high"], {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_ZAI]: {
    adapter: "deepseek",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    adapter: "boolean",
    resolveCapability: resolveFixedCapability(null, {
      enable: "explicit",
      disable: "explicit",
    }),
  },
  [OPT_TRANS_SILICONFLOW]: {
    adapter: "siliconflow",
    resolveCapability: resolveFixedCapability(
      ["max", "high", "medium", "low", "minimal"],
      { enable: "explicit", disable: "explicit" }
    ),
  },
  [OPT_TRANS_CEREBRAS]: {
    adapter: "openai",
    resolveCapability: ({ model = "" }) =>
      /^gpt-oss-120b(?:-|$)/i.test(model)
        ? createOpenAIThinkingCapability(["high", "medium", "low"])
        : null,
  },
  [OPT_TRANS_EPHONEAI]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_APIMART]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OPENAI]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OLLAMA]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_ORCAROUTER]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_REQUESTY]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getOpenAIThinkingCapability(model),
  },
  [OPT_TRANS_OPENROUTER]: {
    adapter: "openrouter",
    // OpenRouter 的动态能力仅来自设置页内存中的模型目录，不进入持久化配置和请求参数。
    resolveCapability: ({ model, openRouterMetadata }) =>
      getOpenRouterThinkingCapability(model, openRouterMetadata),
  },
  [OPT_TRANS_GEMINI]: {
    adapter: "gemini",
    resolveCapability: resolveGeminiCapability,
  },
  [OPT_TRANS_GEMINI_2]: {
    adapter: "gemini",
    resolveCapability: resolveGeminiCapability,
  },
  [OPT_TRANS_CLAUDE]: {
    adapter: "claude",
    resolveCapability: ({ model }) => getClaudeThinkingCapability(model),
  },
};

/**
 * 返回当前接口和模型可确认的思考能力。
 * @param {Object} options 能力查询参数。
 * @param {string} options.apiType 翻译接口类型。
 * @param {string} [options.url] 实际请求地址。
 * @param {string} [options.model] 当前模型名称。
 * @param {Object} [options.openRouterMetadata] 设置页内存中的 OpenRouter 模型元数据。
 * @returns {Object|null} 包含 adapter 的统一能力；未知接口或模型返回 null。
 */
export const getThinkingCapability = ({
  apiType,
  url = "",
  model = "",
  openRouterMetadata,
}) => {
  const registration = THINKING_API_REGISTRY[apiType];
  if (!registration) return null;

  const capability = registration.resolveCapability({
    apiType,
    url,
    model,
    openRouterMetadata,
  });
  return capability ? { adapter: registration.adapter, ...capability } : null;
};

/**
 * 将用户选择的强度规范化为模型实际支持的最接近值。
 * @param {string} effort 用户选择的思考强度或 _default。
 * @param {Array<{value: string}>} supportedEfforts 模型支持的强度选项。
 * @returns {string|null} 规范化后的强度；模型没有强度参数时返回 null。
 */
export const normalizeThinkingEffort = (effort, supportedEfforts = []) => {
  const supported = supportedEfforts.map((item) => item.value);
  if (!supported.length) return null;
  // 接口默认由能力对象单独解析，不能再隐式等同于最高强度。
  if (effort === null || effort === undefined || effort === "_default") {
    return null;
  }
  if (supported.includes(effort)) return effort;

  const targetRank = THINKING_EFFORT_RANK[effort];
  if (targetRank === undefined) return null;
  return supported.reduce((closest, candidate) => {
    const distance = Math.abs(THINKING_EFFORT_RANK[candidate] - targetRank);
    const closestDistance = Math.abs(
      THINKING_EFFORT_RANK[closest] - targetRank
    );
    return distance < closestDistance ? candidate : closest;
  });
};

/**
 * 根据模型公布的默认行为解析用户选择“接口默认”时的最终开启强度。
 * @param {Object} capability 当前模型的统一思考能力。
 * @returns {string|number|null} 具体默认强度、动态预算或省略强度标记。
 */
const getDefaultThinkingEffort = (capability) => {
  const efforts = capability.efforts || [];
  const lowestEffort = efforts[efforts.length - 1]?.value ?? null;
  if (
    capability.defaultEnabled === false ||
    capability.defaultEffort === "none"
  ) {
    // 模型默认关闭但用户明确开启时，使用最低支持强度保证真正开启。
    return lowestEffort;
  }
  if (capability.defaultEffort === null) return null;
  if (typeof capability.defaultEffort === "number") {
    return capability.defaultEffort;
  }
  return efforts.some((effort) => effort.value === capability.defaultEffort)
    ? capability.defaultEffort
    : null;
};

/**
 * 在配置阶段根据接口和模型能力，将用户选择归一化为最终持久化的两个思考字段。
 * 该函数不会生成协议原生字段，也不会把模型能力写入返回结果。
 * @param {Object} options 思考设置归一化参数。
 * @param {string} options.apiType 翻译接口类型。
 * @param {string} [options.url] 实际请求地址，用于识别 Gemini 协议。
 * @param {string} [options.model] 当前模型名称。
 * @param {"auto"|"enabled"|"disabled"} [options.thinkingMode] 用户选择的思考模式。
 * @param {string|number|null} [options.thinkingEffort] 用户选择或已经确认的思考强度。
 * @param {Object} [options.openRouterMetadata] 设置页内存中的 OpenRouter 模型元数据。
 * @returns {{thinkingMode: string, thinkingEffort: string|number|null}} 最终可持久化的两个思考字段。
 */
export const normalizeThinkingSettings = ({
  apiType,
  url = "",
  model = "",
  thinkingMode = "disabled",
  thinkingEffort = "_default",
  openRouterMetadata,
}) => {
  if (thinkingMode === "auto") {
    return { thinkingMode, thinkingEffort: "_default" };
  }

  const capability = getThinkingCapability({
    apiType,
    url,
    model,
    openRouterMetadata,
  });
  if (!capability) {
    // OpenRouter 的具体强度只会由设置页目录确认；重新打开设置时允许直接沿用该最终值。
    const hasConfirmedOpenRouterEffort =
      apiType === OPT_TRANS_OPENROUTER &&
      thinkingEffort !== undefined &&
      thinkingEffort !== "_default";
    return {
      thinkingMode,
      thinkingEffort: hasConfirmedOpenRouterEffort
        ? thinkingEffort
        : "_default",
    };
  }

  const hasExplicitEffort =
    thinkingEffort !== null &&
    thinkingEffort !== undefined &&
    thinkingEffort !== "_default";
  const normalizedEffort =
    hasExplicitEffort && thinkingEffort === capability.defaultEffort
      ? thinkingEffort
      : normalizeThinkingEffort(thinkingEffort, capability.efforts || []);
  if (thinkingMode === "enabled") {
    return {
      thinkingMode,
      thinkingEffort:
        capability.enable === "explicit" && !hasExplicitEffort
          ? null
          : hasExplicitEffort
            ? normalizedEffort
            : getDefaultThinkingEffort(capability),
    };
  }

  const efforts = capability.efforts || [];
  return {
    thinkingMode,
    thinkingEffort:
      capability.disable === "explicit" || capability.disable === "omit"
        ? null
        : (capability.disable ?? efforts[efforts.length - 1]?.value ?? null),
  };
};

/**
 * 对单个接口配置执行静态思考设置归一化，不处理 OpenRouter 的动态模型目录。
 * @param {Object} apiSetting 原始接口配置。
 * @returns {Object} 归一化后的接口配置；字段未变化时返回原对象引用。
 */
export const normalizeApiThinkingSetting = (apiSetting = {}) => {
  if (!THINKING_API_REGISTRY[apiSetting.apiType]) return apiSetting;

  const normalized = normalizeThinkingSettings(apiSetting);
  if (
    normalized.thinkingMode === apiSetting.thinkingMode &&
    normalized.thinkingEffort === apiSetting.thinkingEffort
  ) {
    return apiSetting;
  }
  return { ...apiSetting, ...normalized };
};

/**
 * 在配置加载、同步或导入后一次性归一化接口列表中的静态思考设置。
 * @param {Array<Object>} transApis 原始翻译接口配置列表。
 * @returns {Array<Object>} 归一化后的配置列表；无变化时返回原数组引用。
 */
export const normalizeApiThinkingSettings = (transApis = []) => {
  if (!Array.isArray(transApis)) return transApis;

  let hasChanges = false;
  const normalizedApis = transApis.map((apiSetting) => {
    const normalized = normalizeApiThinkingSetting(apiSetting);
    if (normalized !== apiSetting) hasChanges = true;
    return normalized;
  });
  return hasChanges ? normalizedApis : transApis;
};

/**
 * 判断关闭思考时是否只能降到模型最低强度。
 * @param {Object} options 判断参数。
 * @param {Object|null} options.capability 当前模型的统一思考能力。
 * @param {string} options.thinkingMode 用户选择的思考模式。
 * @returns {boolean} 是否需要显示最低强度降级提示。
 */
export const isThinkingMinimumFallback = ({ capability, thinkingMode }) =>
  Boolean(
    capability &&
      thinkingMode === "disabled" &&
      capability.disable === null &&
      capability.efforts?.length
  );

/**
 * 规范化 Gemini 模型名称，移除资源名前缀并统一为小写。
 * @param {string} model 原始 Gemini 模型名称。
 * @returns {string} 规范化后的模型名称。
 */
export const normalizeGeminiModelName = (model = "") =>
  String(model)
    .trim()
    .replace(/^models\//i, "")
    .toLowerCase();

/**
 * 判断请求地址是否使用 Gemini Interactions 协议。
 * @param {string} url Gemini 请求地址。
 * @returns {boolean} 是否为 Interactions 端点。
 */
export const isGeminiInteractionsUrl = (url = "") =>
  /\/v1(?:beta\d*)?\/interactions(?:[/?]|$)/i.test(url);

const GEMINI_EFFORT_OPTIONS = {
  high: { value: "high", label: "High" },
  medium: { value: "medium", label: "Medium" },
  low: { value: "low", label: "Low" },
  minimal: { value: "minimal", label: "Minimal" },
};
export const GEMINI25_BUDGETS = {
  minimal: 1024,
  low: 1024,
  medium: 8192,
  high: 24576,
};

const isGemini25 = (model) => model.startsWith("gemini-2.5-");
const isGemini25FlashLite = (model) =>
  model.startsWith("gemini-2.5-flash-lite");
const isGemini25Pro = (model) => model.startsWith("gemini-2.5-pro");
const isGemini25NonPro = (model) => isGemini25(model) && !isGemini25Pro(model);
const isGemini31Pro = (model) => model.startsWith("gemini-3.1-pro");
const isGemini3Pro = (model) => model.startsWith("gemini-3-pro");
const isGemini31FlashLiteImage = (model) =>
  model.startsWith("gemini-3.1-flash-lite-image");

/**
 * 将 Gemini 强度值映射为设置页选项。
 * @param {string[]} efforts Gemini 支持的思考强度。
 * @returns {Array<{value: string, label: string}>} Gemini 强度选项。
 */
const toGeminiEffortOptions = (efforts) =>
  efforts.map((effort) => GEMINI_EFFORT_OPTIONS[effort]);

/**
 * Gemini 不同模型支持的 thinkingLevel 并不一致。UI 与请求构造共用这份能力表，
 * 避免界面允许选择一个最终会被官方接口拒绝的等级。
 * @param {Object} options Gemini 强度查询参数。
 * @param {string} options.apiType Gemini 原生或 OpenAI 兼容接口类型。
 * @param {string} [options.model] Gemini 模型名称。
 * @returns {Array<{value: string, label: string}>|null} 已知模型的强度选项；未知模型返回 null。
 */
export const getGeminiThinkingEfforts = ({ apiType, model = "" }) => {
  const normalizedModel = normalizeGeminiModelName(model);
  const isKnownModel =
    isGemini25(normalizedModel) ||
    isGemini31FlashLiteImage(normalizedModel) ||
    isGemini31Pro(normalizedModel) ||
    isGemini3Pro(normalizedModel) ||
    (normalizedModel.startsWith("gemini-3") &&
      normalizedModel.includes("flash"));
  if (!isKnownModel) return null;

  if (apiType === OPT_TRANS_GEMINI_2) {
    return toGeminiEffortOptions(["high", "medium", "low", "minimal"]);
  }

  if (isGemini25(normalizedModel)) {
    return toGeminiEffortOptions(["high", "medium", "low"]);
  }
  if (isGemini31FlashLiteImage(normalizedModel)) {
    return toGeminiEffortOptions(["high", "minimal"]);
  }
  if (isGemini31Pro(normalizedModel)) {
    return toGeminiEffortOptions(["high", "medium", "low"]);
  }
  if (isGemini3Pro(normalizedModel)) {
    return toGeminiEffortOptions(["high", "low"]);
  }
  if (
    normalizedModel.startsWith("gemini-3") &&
    normalizedModel.includes("flash")
  ) {
    // Regular 3-series flash models reject "minimal"
    // ("'minimal' is not a supported thinking level for this model");
    // only the flash-lite variants accept it.
    return toGeminiEffortOptions(
      normalizedModel.includes("flash-lite")
        ? ["high", "medium", "low", "minimal"]
        : ["high", "medium", "low"]
    );
  }
  return null;
};
