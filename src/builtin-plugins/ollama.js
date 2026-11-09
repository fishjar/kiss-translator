import { buildSystemRoleMessages } from "./messages";
import { applyThinkingParameters } from "./thinking";
import { OPT_TRANS_OLLAMA } from "../config";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genOllama = ({
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
            type: "image_url",
            image_url: {
              url: `data:${imageData.type};base64,${imageData.base64}`,
            },
          },
          { type: "text", text: userPrompt },
        ]
      : userPrompt,
  };
  const body = {
    model,
    messages: [...buildSystemRoleMessages(systemPrompt), ...hisMsgs, userMsg],
    temperature,
    max_tokens: maxTokens,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_OLLAMA,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });
  body.stream = useStream;

  const headers = {
    "Content-type": "application/json",
  };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  return { url, body, headers, userMsg };
};

export { genOllama };
