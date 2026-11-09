import {
  THINKING_API_REGISTRY,
  isGeminiInteractionsUrl,
  normalizeGeminiModelName,
  GEMINI25_BUDGETS,
  getThinkingCapability,
  getGeminiThinkingEfforts,
  rejectsOpenAISampling,
} from "./thinkingCapabilities";
import {
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_OPENAI,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_APIMART,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_OPENCODEGO,
} from "../config/apiConstants";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const siliconflowEffortMap = {
  max: 32768,
  high: 16384,
  medium: 8192,
  low: 4096,
  minimal: 2048,
};

const applyDeepSeekThinking = (
  body,
  { thinkingMode, thinkingEffort, capability }
) => {
  body.thinking = {
    type: capability?.disable === null ? "enabled" : thinkingMode,
  };
  if (
    (thinkingMode === "enabled" || capability?.disable === null) &&
    thinkingEffort
  ) {
    body.reasoning_effort = thinkingEffort;
  }
};

const applyBooleanThinking = (body, { thinkingMode }) => {
  body.enable_thinking = thinkingMode === "enabled";
};

const applySiliconFlowThinking = (body, { thinkingMode, thinkingEffort }) => {
  body.enable_thinking = thinkingMode === "enabled";
  if (thinkingMode === "enabled" && thinkingEffort) {
    body.thinking_budget = siliconflowEffortMap[thinkingEffort] || 8192;
  }
};

const applyOpenAIThinking = (body, { thinkingEffort }) => {
  if (thinkingEffort !== null) body.reasoning_effort = thinkingEffort;
};

const applySiliconFlowEffort = (body, { thinkingMode, thinkingEffort }) => {
  body.enable_thinking = thinkingMode === "enabled";
  if (thinkingMode === "enabled" && thinkingEffort)
    body.reasoning_effort = thinkingEffort;
};

const applyOpenRouterThinking = (body, { thinkingMode, thinkingEffort }) => {
  if (thinkingMode === "enabled" && thinkingEffort === null) {
    body.reasoning = { enabled: true };
    return;
  }
  if (thinkingEffort !== null) body.reasoning = { effort: thinkingEffort };
};

const applyClaudeThinking = (
  body,
  { thinkingMode, thinkingEffort, capability }
) => {
  const usesMinimumEffort =
    thinkingMode === "disabled" && thinkingEffort !== null;
  body.thinking = {
    type:
      thinkingMode === "enabled" || usesMinimumEffort
        ? "adaptive"
        : capability?.disable === "between_tools"
          ? "between_tools"
          : "disabled",
  };
  if (thinkingEffort) body.output_config = { effort: thinkingEffort };
};

const clampGeminiEffort = (model, effort) => {
  if (effort !== "minimal" || typeof model !== "string") {
    return effort;
  }
  const normalizedModel = normalizeGeminiModelName(model);
  const efforts = getGeminiThinkingEfforts({ model: normalizedModel });
  if (efforts && !efforts.some((item) => item.value === effort))
    return efforts[efforts.length - 1].value;
  return effort;
};

const applyGeminiThinking = (
  body,
  { apiType, url, model, thinkingMode, thinkingEffort }
) => {
  // Gemini 的三种兼容协议字段位置不同，但共用同一份模式与强度解析结果。
  if (apiType === OPT_TRANS_GEMINI_2) {
    if (thinkingEffort !== null) body.reasoning_effort = thinkingEffort;
    return;
  }

  // null 表示配置阶段已经确认当前关闭方式无需发送思考强度字段。
  if (thinkingEffort === null) return;

  if (isGeminiInteractionsUrl(url)) {
    body.generation_config.thinking_level = clampGeminiEffort(
      model,
      thinkingEffort
    );
    return;
  }

  const normalizedModel = normalizeGeminiModelName(model);
  if (normalizedModel.startsWith("gemini-2.5-")) {
    const thinkingBudget =
      thinkingMode === "disabled" &&
      normalizedModel.startsWith("gemini-2.5-pro")
        ? 128
        : typeof thinkingEffort === "number"
          ? thinkingEffort
          : GEMINI25_BUDGETS[thinkingEffort];
    body.generationConfig.thinkingConfig = { thinkingBudget };
    return;
  }

  body.generationConfig.thinkingConfig = {
    thinkingLevel: clampGeminiEffort(model, thinkingEffort),
  };
};

const THINKING_ADAPTERS = {
  deepseek: applyDeepSeekThinking,
  boolean: applyBooleanThinking,
  siliconflow: applySiliconFlowThinking,
  siliconflowEffort: applySiliconFlowEffort,
  openai: applyOpenAIThinking,
  openrouter: applyOpenRouterThinking,
  claude: applyClaudeThinking,
  gemini: applyGeminiThinking,
};

const applyThinkingParameters = (body, options) => {
  const registration = THINKING_API_REGISTRY[options.apiType];
  const effort =
    options.thinkingMode === "auto" ? undefined : options.thinkingEffort;
  if (
    [
      OPT_TRANS_OPENAI,
      OPT_TRANS_EPHONEAI,
      OPT_TRANS_APIMART,
      OPT_TRANS_ORCAROUTER,
      OPT_TRANS_REQUESTY,
      OPT_TRANS_OPENROUTER,
    ].includes(options.apiType) &&
    rejectsOpenAISampling(options.model, effort)
  ) {
    for (const key of ["temperature", "top_p", "top_logprobs", "logprobs"])
      delete body[key];
  }
  if (
    [OPT_TRANS_XIAOMIMIMO, OPT_TRANS_OPENCODEGO].includes(options.apiType) &&
    /^mimo-/.test(options.model) &&
    options.thinkingMode !== "disabled"
  ) {
    delete body.temperature;
    delete body.top_p;
  }
  if (
    !registration ||
    options.thinkingMode === "auto" ||
    options.thinkingEffort === "_default" ||
    options.thinkingEffort === undefined
  ) {
    return;
  }

  const capability = getThinkingCapability(options);
  if (!capability && options.apiType !== OPT_TRANS_OPENROUTER) return;
  // Thinking-only Qwen models have no documented effort control. Do not invent one.
  if (capability?.enable === "omit") return;
  THINKING_ADAPTERS[capability?.adapter || registration.adapter]?.(body, {
    ...options,
    capability,
  });
};

export {
  applyThinkingParameters,
  THINKING_ADAPTERS,
  applyDeepSeekThinking,
  applyBooleanThinking,
  applySiliconFlowThinking,
  applyOpenAIThinking,
  applyOpenRouterThinking,
  applyClaudeThinking,
  applyGeminiThinking,
  siliconflowEffortMap,
  clampGeminiEffort,
};
