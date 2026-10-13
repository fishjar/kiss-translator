import { nativeRequestBuilders } from "./requests";
import { fetchData } from "../libs/fetch";
import { parseJsonObj } from "../libs/utils";
import { parseChatResponse } from "../providers/sdk/openai";
import { providerError } from "../providers/capabilities";
import {
  OPT_TRANS_GEMINI,
  OPT_TRANS_CLAUDE,
  isGeminiInteractionsUrl,
} from "../config/api";
import { geminiResponseText } from "./gemini";
import { getOpenCodeSessionId } from "../apis/opencode";
import { OPT_TRANS_OPENCODEGO } from "../config/api";
import { selectNativeEndpoint } from "./credentials";

/** Chat uses supplied turns verbatim; translation templates/history are scene behavior. */
export async function chatNative(input, api, ctx) {
  if (input.messages.some((message) => typeof message.content !== "string"))
    throw providerError(
      "MODALITY_UNSUPPORTED",
      "This chat adapter accepts text; use parseImage for images."
    );
  const system = input.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  const turns = input.messages.filter((message) => message.role !== "system");
  if (!turns.length)
    throw providerError(
      "INVALID_INPUT",
      "Chat requires a user or assistant turn."
    );
  const request = nativeRequestBuilders[api.apiType]({
    ...selectNativeEndpoint(api),
    useStream: false,
    systemPrompt: system,
    userPrompt: "",
    hisMsgs: [],
  });
  const { body, headers } = request;
  if (api.apiType === OPT_TRANS_CLAUDE) body.messages = turns;
  else if (api.apiType === OPT_TRANS_GEMINI) {
    if (isGeminiInteractionsUrl(request.url))
      body.input = turns.map((message) => ({
        type: message.role === "assistant" ? "model_output" : "user_input",
        content: [{ type: "text", text: message.content }],
      }));
    else
      body.contents = turns.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
  } else body.messages = input.messages;
  // Trusted built-ins retain the existing advanced header/body overrides. New chat
  // execution has no extra interpreter layer or translation request/response hook.
  if (api.customHeader?.trim())
    Object.assign(headers, parseJsonObj(api.customHeader));
  if (
    api.apiType === OPT_TRANS_OPENCODEGO &&
    !Object.keys(headers).some(
      (name) => name.toLowerCase() === "x-opencode-session"
    )
  )
    headers["x-opencode-session"] = getOpenCodeSessionId({
      apiSlug: api.apiSlug,
      url: request.url,
    });
  if (api.customBody?.trim()) Object.assign(body, parseJsonObj(api.customBody));
  const data = await fetchData(
    request.url,
    { method: request.method || "POST", headers, body: JSON.stringify(body) },
    {
      usePool: true,
      useCache: false,
      fetchLimit: api.fetchLimit,
      fetchInterval: api.fetchInterval,
      httpTimeout: api.httpTimeout,
      signal: ctx.signal,
    }
  );
  if (data?.error)
    throw providerError(
      "PROVIDER_ERROR",
      data.error.message || "Chat request failed."
    );
  if (api.apiType === OPT_TRANS_GEMINI) {
    const finish = data.candidates?.[0]?.finishReason;
    if (finish && finish !== "STOP")
      throw providerError(
        "INCOMPLETE_RESPONSE",
        `Gemini chat stopped: ${finish}`
      );
    const text = geminiResponseText(data);
    if (!text)
      throw providerError("INVALID_RESPONSE", "Gemini returned no chat text.");
    return { text, reasoning: "" };
  }
  if (api.apiType === OPT_TRANS_CLAUDE) {
    if (
      data.stop_reason &&
      !["end_turn", "stop_sequence"].includes(data.stop_reason)
    )
      throw providerError(
        "INCOMPLETE_RESPONSE",
        `Claude chat stopped: ${data.stop_reason}`
      );
    const text = Array.isArray(data.content)
      ? data.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("")
      : typeof data.content === "string"
        ? data.content
        : data.content?.text;
    if (typeof text !== "string")
      throw providerError("INVALID_RESPONSE", "Claude returned no chat text.");
    return { text, reasoning: "" };
  }
  return parseChatResponse({ status: 200, body: data });
}
