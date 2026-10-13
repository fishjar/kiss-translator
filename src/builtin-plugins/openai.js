import { buildChatBody } from "../providers/sdk/openai";

/** Trusted, statically bundled adapter. Shared by native OpenAI-compatible providers. */
export function buildOpenAIRequest(
  {
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
  },
  { buildSystemRoleMessages, isGPT6Astra, applyThinkingParameters }
) {
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
  const body = buildChatBody({
    model,
    messages: [...buildSystemRoleMessages(systemPrompt), ...hisMsgs, userMsg],
    temperature,
    max_completion_tokens: maxTokens,
    stream: useStream,
  });
  // Keep the existing native model-specific policy; user plugins choose their own.
  if (isGPT6Astra(model)) delete body.temperature;
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
}
