import { buildOpenAIRequest } from "../builtin-plugins/openai";
import { buildSystemRoleMessages } from "./messages";
import { isGPT6Astra } from "../config";
import { applyThinkingParameters } from "./thinking";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genOpenAI = (args) =>
  buildOpenAIRequest(args, {
    buildSystemRoleMessages,
    isGPT6Astra,
    applyThinkingParameters,
  });

export { genOpenAI };
