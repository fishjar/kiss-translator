import { buildChatRequest } from "./openai";
import { toIso6391 } from "./languages";
import { providerError } from "../capabilities";

const url = (baseUrl, path) =>
  buildChatRequest({ baseUrl, model: "unused", messages: [] }).url.replace(
    /chat\/completions$/,
    path
  );

export function buildTranscriptionRequest({
  baseUrl,
  model,
  audio,
  language,
  requireTimestamps = false,
  auth,
}) {
  if (!model || !audio?.assetId)
    throw providerError("INVALID_INPUT", "Model and audio asset are required.");
  return {
    url: url(baseUrl, "audio/transcriptions"),
    method: "POST",
    auth,
    bodyType: "multipart",
    responseType: "text",
    body: {
      file: audio,
      model,
      response_format: requireTimestamps ? "verbose_json" : "json",
      ...(requireTimestamps && { "timestamp_granularities[]": "segment" }),
      ...(language && language !== "auto" && { language: toIso6391(language) }),
    },
  };
}

export function parseTranscription(response) {
  if (response.status < 200 || response.status >= 300)
    throw providerError("HTTP_ERROR", `HTTP ${response.status}`);
  const data =
    typeof response.body === "string"
      ? JSON.parse(response.body)
      : response.body;
  if (data?.error)
    throw providerError(
      "PROVIDER_ERROR",
      data.error.message || "Transcription failed."
    );
  if (typeof data?.text !== "string")
    throw providerError("INVALID_RESPONSE", "Missing transcription text.");
  const result = { text: data.text };
  if (data.segments !== undefined) {
    if (!Array.isArray(data.segments))
      throw providerError(
        "INVALID_RESPONSE",
        "Invalid transcription segments."
      );
    result.segments = data.segments.map(({ start, end, text }) => {
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        typeof text !== "string"
      )
        throw providerError("INVALID_RESPONSE", "Invalid segment timestamps.");
      return { start, end, text };
    });
  }
  return result;
}

export function buildSpeechRequest({
  baseUrl,
  model,
  text,
  voice,
  speed,
  auth,
}) {
  if (!model || !text?.trim() || !voice)
    throw providerError("INVALID_INPUT", "Model, text and voice are required.");
  return {
    url: url(baseUrl, "audio/speech"),
    method: "POST",
    auth,
    headers: { "Content-Type": "application/json" },
    bodyType: "json",
    responseType: "asset",
    body: {
      model,
      input: text,
      voice,
      response_format: "mp3",
      ...(speed !== undefined && { speed }),
    },
  };
}
