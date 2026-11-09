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
 * Claude 4.7 及之后的模型（含 Mythos）只接受默认的 temperature，传入其他值会返回 400。
 * @param {string} model Claude 模型名称。
 * @returns {boolean} 是否需要省略 temperature。
 */
export const rejectsClaudeTemperature = (model = "") =>
  CLAUDE_ADAPTIVE_MODELS.has(String(model).trim().toLowerCase()) &&
  !["claude-opus-4-6", "claude-sonnet-4-6"].includes(
    String(model).trim().toLowerCase()
  );

// Verified IDs only; future family members must not inherit guessed controls.
// https://developers.openai.com/api/docs/guides/latest-model
const OPENAI_GPT6_MODELS = new Set([
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "gpt-6.1-sol",
  "gpt-6.1-terra",
]);
const CLAUDE_ADAPTIVE_MODELS = new Set([
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-opus-5",
  "claude-opus-5-5",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-fable-5",
  "claude-fable-5-1",
  "claude-mythos-5",
  "claude-mythos-5-1",
  "claude-mythos-preview",
]);

export const rejectsOpenAISampling = (model, effort) => {
  const name = normalizeOpenAIModelName(model);
  if (OPENAI_GPT6_MODELS.has(name)) return effort !== "none";
  if (
    /^gpt-5(?:-mini|-nano|-pro)?(?:-2025-08-07)?$/.test(name) ||
    /^gpt-5\.(?:2|4)-pro$/.test(name) ||
    /^gpt-5\.[23]-codex$/.test(name)
  )
    return true;
  return (
    /^(?:gpt-5\.6(?:-sol|-terra|-luna)?|gpt-5\.(?:1|2|4|5)(?:-mini|-nano)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(
      name
    ) && effort !== "none"
  );
};

/**
 * 根据 OpenAI 模型名称解析已确认的思考能力。
 * @param {string} model OpenAI 或带 openai/ 前缀的模型名称。
 * @returns {Object|null} 已知模型的思考能力；未知模型返回 null。
 */
const getOpenAIThinkingCapability = (model = "") => {
  const normalizedModel = normalizeOpenAIModelName(model);

  if (OPENAI_GPT6_MODELS.has(normalizedModel)) {
    // https://developers.openai.com/api/docs/models/gpt-6-astra
    // Astra and 6.1 Sol require reasoning; the other documented GPT-6 models accept none.
    return createOpenAIThinkingCapability(
      ["max", "xhigh", "high", "medium", "low"],
      {
        disable: ["gpt-6-astra", "gpt-6.1-sol"].includes(normalizedModel)
          ? null
          : "none",
      }
    );
  }

  if (/^gpt-5\.6(?:-sol|-terra|-luna)?$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability([
      "max",
      "xhigh",
      "high",
      "medium",
      "low",
    ]);
  }
  if (/^gpt-5\.(?:4|2)-pro$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium"], {
      disable: null,
    });
  }
  if (normalizedModel === "gpt-5-pro") {
    return createOpenAIThinkingCapability(["high"], { disable: null });
  }
  if (/^gpt-5\.[23]-codex$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"], {
      disable: null,
    });
  }
  if (
    /^gpt-5\.(?:5|4|2)(?:-mini|-nano)?(?:-\d{4}-\d{2}-\d{2})?$/.test(
      normalizedModel
    )
  ) {
    return createOpenAIThinkingCapability(["xhigh", "high", "medium", "low"]);
  }
  if (/^gpt-5\.1(?:-2025-11-13)?$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(["high", "medium", "low"], {
      // GPT-5.1 默认不推理；用户明确开启时应回落到最低非关闭强度 low。
      defaultEnabled: false,
      defaultEffort: "none",
    });
  }
  if (/^gpt-5(?:-mini|-nano)?(?:-2025-08-07)?$/.test(normalizedModel)) {
    return createOpenAIThinkingCapability(
      ["high", "medium", "low", "minimal"],
      { disable: null }
    );
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
  const supportsAdaptiveThinking = CLAUDE_ADAPTIVE_MODELS.has(normalizedModel);

  if (!supportsAdaptiveThinking) return null;

  const mandatory =
    normalizedModel === "claude-opus-5-5" ||
    /^claude-(?:fable|mythos)-5(?:-|$)/.test(normalizedModel) ||
    normalizedModel === "claude-mythos-preview";
  const efforts = [
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-mythos-preview",
  ].includes(normalizedModel)
    ? ["max", "high", "medium", "low"]
    : ["max", "xhigh", "high", "medium", "low"];
  return createThinkingCapability(efforts, {
    enable: "explicit",
    disable: mandatory
      ? null
      : normalizedModel === "claude-sonnet-5-5"
        ? "between_tools"
        : "explicit",
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
    normalizedModel === "gemini-4-argon" ||
    normalizedModel === "gemini-3.8-flash" ||
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

const explicitThinking = (efforts = null) =>
  createThinkingCapability(efforts, {
    enable: "explicit",
    disable: "explicit",
  });
const modelName = (model = "") => String(model).trim().toLowerCase();
// https://api-docs.deepseek.com/guides/thinking_mode/
const getDeepSeekCapability = (model) => {
  const name = modelName(model);
  if (["deepseek-flash", "deepseek-v4.1-flash"].includes(name))
    return explicitThinking(["max", "high", "low"]);
  if (
    [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "deepseek-v4-flash-vision-exp",
    ].includes(name)
  )
    return explicitThinking(["max", "high"]);
  return null;
};
// https://mimo.mi.com/docs/en-US/quick-start/usage-guide/other/deep-thinking
const getMimoCapability = (model) =>
  [
    "mimo-v2-flash",
    "mimo-v2-pro",
    "mimo-v2.5",
    "mimo-v2.5-pro",
    "mimo-v2.5-pro-ultraspeed",
    "mimo-v2.6-flash",
    "mimo-v2.6-pro",
    "mimo-v2.6-pro-ultraspeed",
  ].includes(modelName(model))
    ? explicitThinking()
    : null;
// https://docs.bigmodel.cn/cn/guide/capabilities/thinking-mode
const getGlmCapability = (model) => {
  const name = modelName(model);
  if (
    [
      "glm-5.3",
      "glm-5.3-flash",
      "glm-5.3-flashx",
      "glm-5.3-flashx-legal",
    ].includes(name)
  )
    return createThinkingCapability(["max", "high", "low"], {
      enable: "explicit",
      disable: null,
    });
  return [
    "glm-5.2",
    "glm-5.1",
    "glm-5",
    "glm-5-turbo",
    "glm-4.7",
    "glm-4.7-flash",
    "glm-4.7-flashx",
    "glm-4.6",
    "glm-4.5",
    "glm-4.5-air",
  ].includes(name)
    ? explicitThinking()
    : null;
};
// https://help.aliyun.com/zh/model-studio/deep-thinking
const getQwenCapability = (model) => {
  const name = modelName(model);
  if (
    [
      "qwen3.8-2.4t-a95b",
      "qwen3.7-max-preview",
      "qwen3.7-max-2026-05-17",
      "qwen3-235b-a22b-thinking-2507",
      "qwen3-30b-a3b-thinking-2507",
      "qwq-plus",
    ].includes(name)
  )
    return createThinkingCapability(null, { enable: "omit", disable: null });
  if (
    [
      "qwen3.8-max",
      "qwen3.8-max-0902",
      "qwen3.8-flash",
      "qwen3.8-27b",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.7-flash",
      "qwen3.7-max-2026-05-20",
      "qwen3.7-max-2026-06-08",
      "qwen3.7-plus-2026-05-26",
      "qwen3.7-flash-2026-07-15",
      "qwen3.6-plus",
      "qwen3.6-flash",
      "qwen3.6-27b",
      "qwen3.6-35b-a3b",
      "qwen3.6-plus-2026-04-02",
      "qwen3.6-flash-2026-04-16",
      "qwen3.5-plus",
      "qwen3.5-flash",
      "qwen3.5-27b",
      "qwen3.5-35b-a3b",
      "qwen3.5-122b-a10b",
      "qwen3.5-397b-a17b",
      "qwen3.5-flash-2026-02-23",
    ].includes(name) ||
    [
      "qwen-plus",
      "qwen-flash",
      "qwen-turbo",
      "qwen3-235b-a22b",
      "qwen3-30b-a3b",
      "qwen3-32b",
      "qwen3-14b",
      "qwen3-8b",
      "qwen3-4b",
      "qwen3-1.7b",
      "qwen3-0.6b",
    ].includes(name)
  )
    return explicitThinking();
  return null;
};
// Platform controls are not interchangeable with the upstream vendor controls.
// https://docs.siliconflow.cn/docs/api/chat-completions-post
const getSiliconFlowCapability = (model) => {
  const name = modelName(model).replace(/^pro\//, "");
  if (["zai-org/glm-5.3", "zai-org/glm-5.3-flash"].includes(name))
    // The model requires thinking; the platform has not documented its effort mapping.
    return createThinkingCapability(null, { enable: "omit", disable: null });
  if (
    [
      "deepseek-ai/deepseek-v4",
      "deepseek-ai/deepseek-v4-flash",
      "zai-org/glm-5.2",
    ].includes(name)
  )
    return {
      ...explicitThinking(["max", "high"]),
      adapter: "siliconflowEffort",
    };
  if (
    /^qwen\/qwen3\.(?:5|6)-(?:27b|35b-a3b)$/.test(name) ||
    ["qwen/qwen3.8-27b", "zai-org/glm-4.7", "zai-org/glm-4.7-flash"].includes(
      name
    )
  )
    return explicitThinking(["max", "high", "medium", "low", "minimal"]);
  return null;
};
// https://inference-docs.cerebras.ai/capabilities/reasoning
const getCerebrasCapability = (model) => {
  const name = modelName(model);
  if (name === "gpt-oss-120b")
    return createOpenAIThinkingCapability(["high", "medium", "low"], {
      disable: null,
    });
  if (name === "qwen-3.8-27b")
    return createOpenAIThinkingCapability(["high", "medium", "low"]);
  if (name === "zai-glm-5.3-flash")
    return createOpenAIThinkingCapability(["max", "high", "low"], {
      disable: null,
    });
  return null;
};
// https://docs.ollama.com/api/openai-compatibility
// GPT-OSS `none` hides thinking output on this platform; use low instead.
const getOllamaCapability = (model) => {
  const name = modelName(model).replace(/:.*$/, "");
  if (name === "gpt-oss")
    return createOpenAIThinkingCapability(["high", "medium", "low"], {
      disable: null,
    });
  if (
    ["qwen3", "qwen3.5", "qwen3.6", "qwen3.8", "glm-4.7-flash"].includes(name)
  )
    return createOpenAIThinkingCapability(["high"]);
  return null;
};

export const THINKING_API_REGISTRY = {
  [OPT_TRANS_DEEPSEEK]: {
    adapter: "deepseek",
    resolveCapability: ({ model }) => getDeepSeekCapability(model),
  },
  [OPT_TRANS_OPENCODEGO]: {
    adapter: "deepseek",
    resolveCapability: ({ model }) =>
      getDeepSeekCapability(model) ||
      getMimoCapability(model) ||
      getGlmCapability(model),
  },
  [OPT_TRANS_XIAOMIMIMO]: {
    adapter: "deepseek",
    resolveCapability: ({ model }) => getMimoCapability(model),
  },
  [OPT_TRANS_ZAI]: {
    adapter: "deepseek",
    resolveCapability: ({ model }) => getGlmCapability(model),
  },
  [OPT_TRANS_ALIYUNBAILIAN]: {
    adapter: "boolean",
    resolveCapability: ({ model }) => getQwenCapability(model),
  },
  [OPT_TRANS_SILICONFLOW]: {
    adapter: "siliconflow",
    resolveCapability: ({ model }) => getSiliconFlowCapability(model),
  },
  [OPT_TRANS_CEREBRAS]: {
    adapter: "openai",
    resolveCapability: ({ model }) => getCerebrasCapability(model),
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
    resolveCapability: ({ model }) => getOllamaCapability(model),
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
      capability.disable === "explicit" ||
      capability.disable === "omit" ||
      capability.disable === "between_tools"
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
  if (!isGemini25(normalizedModel)) {
    // https://ai.google.dev/gemini-api/docs/thinking
    const efforts = {
      "gemini-4-argon": ["high", "medium", "low"],
      "gemini-3.8-flash": ["high", "medium", "low"],
      "gemini-3.6-flash": ["high", "medium", "low", "minimal"],
      "gemini-3.5-flash": ["high", "medium", "low"],
      "gemini-3.5-flash-lite": ["high", "medium", "low", "minimal"],
      "gemini-3.1-flash-lite": ["high", "medium", "low", "minimal"],
      "gemini-3.1-flash-lite-preview": ["high", "medium", "low", "minimal"],
      "gemini-3.1-flash-lite-image": ["high", "minimal"],
      "gemini-3.1-pro-preview": ["high", "medium", "low"],
      "gemini-3-pro-preview": ["high", "low"],
      "gemini-3-flash-preview": ["high", "medium", "low", "minimal"],
    }[normalizedModel];
    return efforts ? toGeminiEffortOptions(efforts) : null;
  }
  if (apiType === OPT_TRANS_GEMINI_2)
    return toGeminiEffortOptions(["high", "medium", "low", "minimal"]);
  if (isGemini25(normalizedModel)) {
    return toGeminiEffortOptions(["high", "medium", "low"]);
  }
  return null;
};
