import { providerError } from "../capabilities";

function apiError(data) {
  if (data?.error)
    throw providerError(
      "PROVIDER_ERROR",
      data.error.message || "Provider returned an error."
    );
}

/** Pure protocol assembly, also used by trusted native adapters. */
export function buildChatBody({
  model,
  messages,
  stream = false,
  ...parameters
}) {
  return { model, messages, ...parameters, stream };
}

export function buildChatRequest({
  baseUrl,
  model,
  messages,
  stream = false,
  auth,
  ...parameters
}) {
  if (!baseUrl || !model || !Array.isArray(messages))
    throw providerError(
      "INVALID_INPUT",
      "baseUrl, model and messages are required."
    );
  const base = new URL(baseUrl);
  if (
    !["https:", "http:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw providerError("INVALID_URL", "Invalid API base URL.");
  }
  return {
    url: `${base.href.replace(/\/+$/, "")}/chat/completions`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    auth,
    bodyType: "json",
    body: buildChatBody({ model, messages, stream, ...parameters }),
    responseType: "text",
  };
}

function checkFinish(reason) {
  if (
    ["length", "content_filter", "tool_calls", "function_call"].includes(reason)
  ) {
    throw providerError(
      "INCOMPLETE_RESPONSE",
      `Unsupported or incomplete response: ${reason}`
    );
  }
}

export function parseChatResponse(response) {
  if (response.status < 200 || response.status >= 300)
    throw providerError("HTTP_ERROR", `HTTP ${response.status}`);
  const data =
    typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  apiError(data);
  const choice = data?.choices?.[0];
  if (!choice?.message || choice.message.refusal)
    throw providerError(
      "INVALID_RESPONSE",
      choice?.message?.refusal || "Missing chat completion."
    );
  checkFinish(choice.finish_reason);
  const text = choice.message.content;
  const reasoning = choice.message.reasoning_content || "";
  if (typeof reasoning !== "string")
    throw providerError("INVALID_RESPONSE", "Invalid reasoning response.");
  if (typeof text !== "string" && !reasoning)
    throw providerError("INVALID_RESPONSE", "Missing text response.");
  return {
    text: text || "",
    reasoning,
    ...(data.usage && { usage: data.usage }),
    ...(choice.finish_reason && { finishReason: choice.finish_reason }),
  };
}

/** Accepts complete SSE data frames, not arbitrary network chunks. */
export function createChatStreamParser() {
  let text = "";
  let reasoning = "";
  let finishReason;
  let usage;
  let done = false;
  return {
    push(frame) {
      const raw = typeof frame === "string" ? frame : frame.data;
      if (done)
        throw providerError("STREAM_ENDED", "Data after stream terminator.");
      if (raw.trim() === "[DONE]") {
        done = true;
        return [];
      }
      const data = JSON.parse(raw);
      apiError(data);
      if (data.usage) usage = data.usage;
      if (!Array.isArray(data.choices))
        throw providerError("INVALID_RESPONSE", "Missing stream choices.");
      if (!data.choices.length) return [];
      const choice = data.choices[0];
      if (choice.delta?.refusal)
        throw providerError("PROVIDER_ERROR", choice.delta.refusal);
      if (choice.finish_reason) {
        checkFinish(choice.finish_reason);
        finishReason = choice.finish_reason;
      }
      const events = [];
      for (const [key, type] of [
        ["content", "text.delta"],
        ["reasoning_content", "reasoning.delta"],
      ]) {
        const value = choice.delta?.[key];
        if (value === undefined || value === null || value === "") continue;
        if (typeof value !== "string")
          throw providerError("INVALID_RESPONSE", "Invalid text delta.");
        if (key === "content") text += value;
        else reasoning += value;
        events.push({ type, text: value });
      }
      return events;
    },
    finish() {
      if (!done || !finishReason)
        throw providerError(
          "INCOMPLETE_RESPONSE",
          "Stream ended without a normal terminator."
        );
      return { text, reasoning, finishReason, ...(usage && { usage }) };
    },
  };
}
