import { buildSystemRoleMessages } from "./messages";
import { applyThinkingParameters } from "./thinking";
import {
  OPT_TRANS_OPENROUTER,
  isGPT6Astra,
  OPT_TRANS_ORCAROUTER,
  OPT_TRANS_REQUESTY,
  OPT_TRANS_ATLASCLOUD,
} from "../config";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const genOpenRouter = ({
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
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_OPENROUTER,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
    "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
    "X-OpenRouter-Title": "KISS Translator",
  };

  return { url, body, headers, userMsg };
};

const genOrcaRouter = ({
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
    max_completion_tokens: maxTokens,
    stream: useStream,
  };

  // 与 OpenAI 直连保持一致，Astra 不发送自动生成的温度参数。
  if (isGPT6Astra(model)) delete body.temperature;

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_ORCAROUTER,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
    // 聚合网关的调用来源标识，便于在 OrcaRouter 控制台区分本扩展的用量
    "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
    "X-Title": "KISS Translator",
  };

  return { url, body, headers, userMsg };
};

const genRequesty = ({
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
    max_completion_tokens: maxTokens,
    stream: useStream,
  };

  // 与 OpenAI 直连保持一致，Astra 不发送自动生成的温度参数。
  if (isGPT6Astra(model)) delete body.temperature;

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_REQUESTY,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
    // 聚合网关的调用来源标识，便于在 Requesty 控制台区分本扩展的用量
    "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
    "X-Title": "KISS Translator",
  };

  return { url, body, headers, userMsg };
};

const genAtlasCloud = ({
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
    max_completion_tokens: maxTokens,
    stream: useStream,
  };

  applyThinkingParameters(body, {
    apiType: OPT_TRANS_ATLASCLOUD,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  const headers = {
    "Content-type": "application/json",
    Authorization: `Bearer ${key}`,
  };

  return { url, body, headers, userMsg };
};

export { genOpenRouter, genOrcaRouter, genRequesty, genAtlasCloud };
