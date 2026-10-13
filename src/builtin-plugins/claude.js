import { applyThinkingParameters } from "./thinking";
import { OPT_TRANS_CLAUDE } from "../config";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genClaude = ({
  url,
  key,
  systemPrompt,
  userPrompt,
  imageData,
  model,
  temperature,
  maxTokens,
  hisMsgs = [],
  useStream = false,
  thinkingMode,
  thinkingEffort,
}) => {
  const userMsg = {
    role: "user",
    content: imageData
      ? [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageData.type,
              data: imageData.base64,
            },
          },
          { type: "text", text: userPrompt },
        ]
      : userPrompt,
  };
  const body = {
    model,
    ...(systemPrompt?.trim() ? { system: systemPrompt } : {}),
    messages: [...hisMsgs, userMsg],
    temperature,
    max_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_CLAUDE,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
    "x-api-key": key,
  };

  return { url, body, headers, userMsg };
};

export { genClaude };
