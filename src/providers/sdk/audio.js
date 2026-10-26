import { buildChatRequest } from "./openai";
import { toIso6391, languages } from "./languages";
import { providerError } from "../capabilities";
import { alignedAsrWords } from "../asrWords";

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
  let data = response.body;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw providerError("INVALID_RESPONSE", "Invalid transcription JSON.");
    }
  }
  if (data?.error)
    throw providerError(
      "PROVIDER_ERROR",
      data.error.message || "Transcription failed."
    );
  if (typeof data?.text !== "string")
    throw providerError("INVALID_RESPONSE", "Missing transcription text.");
  const result = { text: data.text };
  if (typeof data.language === "string" && data.language) {
    const name = data.language.trim().toLowerCase();
    const namedCode =
      name === "chinese"
        ? "zh"
        : Object.entries(languages).find(
            ([, label]) => label.split(" - ")[0].toLowerCase() === name
          )?.[0];
    // verbose_json can return names such as "english", not ISO request codes.
    try {
      result.language = toIso6391(namedCode || name);
    } catch {
      /* Keep native auto for unknown languages. */
    }
  }
  if (data.segments !== undefined) {
    if (!Array.isArray(data.segments))
      throw providerError(
        "INVALID_RESPONSE",
        "Invalid transcription segments."
      );
    result.segments = data.segments.map(({ start, end, text, words }) => {
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end < start ||
        typeof text !== "string"
      )
        throw providerError("INVALID_RESPONSE", "Invalid segment timestamps.");
      const aligned = alignedAsrWords({ start, end, text, words });
      return { start, end, text, ...(aligned && { words: aligned }) };
    });
  }
  if (Array.isArray(data.words) && data.words.length) {
    const words = data.words.map((word) => ({
      ...word,
      text: word?.word ?? word?.text,
    }));
    const segment = {
      start: words[0].start,
      end: words[words.length - 1].end,
      text: data.text,
      words,
    };
    const alignedWords = alignedAsrWords(segment);
    if (!result.segments?.length && alignedWords)
      result.segments = [{ ...segment, words: alignedWords }];
    else if (result.segments)
      result.segments = result.segments.map((item) => {
        if (item.words) return item;
        const aligned = alignedAsrWords({
          ...item,
          words: words.filter(
            (word) => word.start >= item.start && word.end <= item.end
          ),
        });
        return { ...item, ...(aligned && { words: aligned }) };
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
