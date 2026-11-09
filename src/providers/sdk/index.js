import { buildTextTaskMessages, parseTextTaskResult } from "./textTasks";
import { prepareMessages } from "./messages";
import {
  buildChatRequest,
  buildChatBody,
  parseChatResponse,
  createChatStreamParser,
} from "./openai";
import {
  buildMessages,
  parseResult,
  createTranslationStreamParser,
} from "./translation";
import {
  buildTranscriptionRequest,
  parseTranscription,
  buildSpeechRequest,
} from "./audio";
import { createSSEParser } from "./stream";
import { utf8ToBase64, base64ToUtf8, digest, encodeBytes } from "./encoding";
import {
  encodeSegments,
  parseSegments,
  createXmlSegmentParser,
  createNDJSONParser,
} from "./segments";
import { languages, toIso6391, normalizeLocale } from "./languages";

const ttsVoices = Object.freeze(
  ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].map((value) =>
    Object.freeze({ label: value, value })
  )
);
export { SDK_VERSION, SUPPORTED_SDK_VERSIONS } from "./version";
export const providerHelpers = Object.freeze({
  encoding: Object.freeze({
    utf8ToBase64,
    base64ToUtf8,
    bytesToBase64: (buffer) => encodeBytes(new Uint8Array(buffer), "base64"),
    decodeUtf8: (buffer) =>
      new TextDecoder("utf-8", { fatal: true }).decode(buffer),
  }),
  crypto: Object.freeze({ digest }),
  openai: Object.freeze({
    audio: Object.freeze({
      buildTranscriptionRequest,
      parseTranscription,
      buildSpeechRequest,
    }),
    chatCompletions: Object.freeze({
      prepareMessages,
      buildRequest: buildChatRequest,
      buildBody: buildChatBody,
      parseResponse: parseChatResponse,
      createStreamParser: createChatStreamParser,
    }),
  }),
  textTasks: Object.freeze({
    buildMessages: buildTextTaskMessages,
    parseResult: parseTextTaskResult,
  }),
  translation: Object.freeze({
    buildMessages,
    parseResult,
    createStreamParser: createTranslationStreamParser,
    encodeSegments,
    parseSegments,
    createXmlStreamParser: createXmlSegmentParser,
  }),
  stream: Object.freeze({ createSSEParser, createNDJSONParser }),
  languages: Object.freeze({ codes: languages, toIso6391 }),
  speech: Object.freeze({
    normalizeLocale,
    voices: Object.freeze({ openai: Object.freeze({ "tts-1": ttsVoices }) }),
  }),
});
