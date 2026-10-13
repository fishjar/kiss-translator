import {
  INPUT_PLACE_MODEL,
  INPUT_PLACE_KEY,
  isGeminiInteractionsUrl,
} from "../config";
import { applyThinkingParameters } from "./thinking";
import { buildSystemRoleMessages } from "./messages";

// 原生协议适配：保持旧参数、字段和厂家差异，不加载用户脚本解释器。
const geminiText = (parts) =>
  Array.isArray(parts)
    ? parts
        .filter((p) => !p.thought && p.text)
        .map((p) => p.text)
        .join("")
    : "";

const geminiInteractionText = (res) =>
  Array.isArray(res?.steps)
    ? res.steps
        .filter((step) => step?.type === "model_output")
        .flatMap((step) => (Array.isArray(step.content) ? step.content : []))
        .filter((content) => content?.type === "text" && content.text)
        .map((content) => content.text)
        .join("")
    : "";

const geminiResponseText = (res) =>
  Array.isArray(res?.steps)
    ? geminiInteractionText(res)
    : geminiText(res?.candidates?.[0]?.content?.parts);

const genGemini = ({
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
  apiType,
  thinkingMode,
  thinkingEffort,
}) => {
  url = url
    .replaceAll(INPUT_PLACE_MODEL, model)
    .replaceAll(INPUT_PLACE_KEY, key);

  // 官方 Interactions 与 generateContent 的请求体、上下文和流式事件均不同，必须按 URL 分流。
  if (isGeminiInteractionsUrl(url)) {
    const userMsg = {
      type: "user_input",
      content: [{ type: "text", text: userPrompt }],
    };
    const generationConfig = {
      max_output_tokens: maxTokens,
      temperature,
    };

    const body = {
      model,
      system_instruction: systemPrompt,
      input: [...hisMsgs, userMsg],
      stream: useStream,
      // Interactions 默认会在服务端保存会话；翻译历史由客户端维护，因此显式关闭存储。
      store: false,
      generation_config: generationConfig,
    };
    applyThinkingParameters(body, {
      apiType,
      url,
      model,
      thinkingMode,
      thinkingEffort,
    });
    const headers = {
      "Content-type": "application/json",
      "x-goog-api-key": key,
    };

    return { url, body, headers, userMsg };
  }

  // 自定义代理通常只实现 generateContent，不能随官方默认端点一起强制迁移协议。
  if (useStream) {
    url = url.replace(":generateContent", ":streamGenerateContent");
    url += (url.includes("?") ? "&" : "?") + "alt=sse";
  }

  const userMsg = {
    role: "user",
    parts: [
      ...(imageData
        ? [{ inlineData: { mimeType: imageData.type, data: imageData.base64 } }]
        : []),
      { text: userPrompt },
    ],
  };

  const body = {
    ...(systemPrompt?.trim()
      ? { systemInstruction: { parts: [{ text: systemPrompt }] } }
      : {}),
    contents: [...hisMsgs, userMsg],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };

  applyThinkingParameters(body, {
    apiType,
    url,
    model,
    thinkingMode,
    thinkingEffort,
  });

  Object.assign(body, {
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_NONE",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
  });
  const headers = {
    "Content-type": "application/json",
    "x-goog-api-key": key,
  };

  return { url, body, headers, userMsg };
};

const genGemini2 = ({
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
  apiType,
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
    apiType,
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

export {
  genGemini,
  genGemini2,
  geminiResponseText,
  geminiInteractionText,
  geminiText,
};
