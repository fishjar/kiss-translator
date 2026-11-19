import { buildSystemRoleMessages, compactMessages } from "./messages";

// Rapid-MLX uses OpenAI-compatible chat with optional authentication.
export function genRapidMlx({
  url,
  key,
  model,
  systemPrompt,
  userPrompt,
  hisMsgs = [],
  temperature,
  maxTokens,
  useStream = false,
}) {
  const userMsg = compactMessages([{ role: "user", content: userPrompt }])[0];
  const headers = { "Content-type": "application/json" };
  if (key?.trim()) headers.Authorization = `Bearer ${key.trim()}`;
  return {
    url,
    headers,
    userMsg,
    body: {
      model,
      messages: compactMessages([
        ...buildSystemRoleMessages(systemPrompt),
        ...hisMsgs,
        userMsg,
      ]),
      temperature,
      max_tokens: maxTokens,
      stream: useStream,
    },
  };
}
