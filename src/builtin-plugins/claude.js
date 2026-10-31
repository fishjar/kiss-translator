import { applyThinkingParameters } from "./thinking";
import {
  ANTHROPIC_API_VERSION,
  OPT_TRANS_CLAUDE,
  rejectsClaudeTemperature,
} from "../config";

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
  if (rejectsClaudeTemperature(model)) delete body.temperature;

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_CLAUDE,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    "anthropic-version": ANTHROPIC_API_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
    "x-api-key": key,
  };

  return { url, body, headers, userMsg };
};

// With thinking enabled the first content block is a thinking block with no text, so the
// answer is the first block that carries one. Non-array shapes keep reading content[0].
const claudeResponseText = (res) =>
  Array.isArray(res?.content)
    ? res.content.find((b) => typeof b?.text === "string")?.text
    : res?.content?.[0]?.text;

export { genClaude, claudeResponseText };
