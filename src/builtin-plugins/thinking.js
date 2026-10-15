import {
  THINKING_API_REGISTRY,
  isGeminiInteractionsUrl,
  normalizeGeminiModelName,
  GEMINI25_BUDGETS,
} from "./thinkingCapabilities";
import { OPT_TRANS_GEMINI_2 } from "../config/apiConstants";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const siliconflowEffortMap = {
  max: 32768,
  high: 16384,
  medium: 8192,
  low: 4096,
  minimal: 2048,
};

const applyDeepSeekThinking = (body, { thinkingMode, thinkingEffort }) => {
  body.thinking = { type: thinkingMode };
  if (thinkingMode === "enabled" && thinkingEffort) {
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

const applyOpenRouterThinking = (body, { thinkingMode, thinkingEffort }) => {
  if (thinkingMode === "enabled" && thinkingEffort === null) {
    body.reasoning = { enabled: true };
    return;
  }
  if (thinkingEffort !== null) body.reasoning = { effort: thinkingEffort };
};

const applyClaudeThinking = (body, { thinkingMode, thinkingEffort }) => {
  const usesMinimumEffort =
    thinkingMode === "disabled" && thinkingEffort !== null;
  body.thinking = {
    type:
      thinkingMode === "enabled" || usesMinimumEffort ? "adaptive" : "disabled",
  };
  if (thinkingEffort) body.output_config = { effort: thinkingEffort };
};

const clampGeminiEffort = (model, effort) => {
  if (effort !== "minimal" || typeof model !== "string") {
    return effort;
  }
  const normalizedModel = normalizeGeminiModelName(model);
  if (
    normalizedModel.startsWith("gemini-3") &&
    normalizedModel.includes("flash") &&
    !normalizedModel.includes("flash-lite")
  ) {
    return "low";
  }
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
  openai: applyOpenAIThinking,
  openrouter: applyOpenRouterThinking,
  claude: applyClaudeThinking,
  gemini: applyGeminiThinking,
};

const applyThinkingParameters = (body, options) => {
  const registration = THINKING_API_REGISTRY[options.apiType];
  if (
    !registration ||
    options.thinkingMode === "auto" ||
    options.thinkingEffort === "_default" ||
    options.thinkingEffort === undefined
  ) {
    return;
  }

  THINKING_ADAPTERS[registration.adapter]?.(body, options);
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
