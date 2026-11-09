import { providerError } from "../capabilities";

import defaultTranslationPrompts from "./defaultTranslationPrompts.json";
import protocolPrompts from "./translationProtocolPrompts.json";
import {
  encodeSegments,
  parseSegments,
  createXmlSegmentParser,
} from "./segments";
export const DEFAULT_TRANSLATION_PROMPTS = Object.freeze(
  defaultTranslationPrompts
);
export const TRANSLATION_PROTOCOL_PROMPTS = Object.freeze({
  json: DEFAULT_TRANSLATION_PROMPTS,
  ...protocolPrompts,
});

export function translationProtocol(input) {
  const protocol =
    input.outputProtocol ??
    (input.translationMode === "single" ? "text" : "json");
  if (
    !Object.hasOwn(TRANSLATION_PROTOCOL_PROMPTS, protocol) ||
    (input.translationMode !== undefined &&
      !["single", "batch"].includes(input.translationMode)) ||
    (input.translationMode === "batch" && protocol === "text") ||
    (input.translationMode === "single" &&
      !["text", "json"].includes(protocol)) ||
    (protocol === "text" && input.items?.length !== 1) ||
    (input.translationMode === "single" && input.items?.length !== 1)
  )
    throw providerError(
      "INVALID_INPUT",
      "Invalid translation mode, protocol or item count."
    );
  return protocol;
}

/** Saved scripts that pass only {items} inherit this invocation's wire protocol. */
export function createTranslationHelpers(input = {}, ParserClass) {
  const options = (value) => ({
    translationMode: input.translationMode,
    outputProtocol: input.outputProtocol,
    ...value,
  });
  return {
    buildMessages: (value) => buildMessages(options(value)),
    parseResult: (text, value) => parseResult(text, options(value)),
    createStreamParser: (value) =>
      createTranslationStreamParser(options(value), ParserClass),
  };
}

function itemIds(items) {
  if (!Array.isArray(items) || !items.length)
    throw providerError("INVALID_INPUT", "Translation items cannot be empty.");
  const ids = new Set();
  for (const item of items) {
    if (
      typeof item.id !== "string" ||
      !item.id ||
      typeof item.text !== "string" ||
      ids.has(item.id)
    ) {
      throw providerError(
        "INVALID_INPUT",
        "Each translation item requires a unique string ID and text."
      );
    }
    ids.add(item.id);
  }
  return ids;
}

export function buildMessages(input) {
  itemIds(input.items);
  const protocol = translationProtocol(input);
  if (!input.targetLanguage)
    throw providerError("INVALID_INPUT", "Target language is required.");
  const values = {
    sourceLanguage: input.sourceLanguage || "auto",
    targetLanguage: input.targetLanguage,
    items: JSON.stringify(input.items),
    glossary: JSON.stringify(input.glossary || {}),
    context: input.context || "",
    from: input.sourceLanguage || "auto",
    to: input.targetLanguage,
    fromLang: input.sourceLanguage || "auto",
    toLang: input.targetLanguage,
    text:
      input.items.length === 1
        ? input.items[0].text
        : JSON.stringify(input.items),
    segments:
      protocol === "text"
        ? input.items[0].text
        : encodeSegments(input.items, protocol),
    tone: input.tone || "",
    title: input.document?.title || "",
    description: input.document?.description || "",
    summary: input.document?.summary || "",
    url: input.document?.url || "",
  };
  const render = (template) =>
    template.replace(/\{\{([A-Za-z][\w]*)\}\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
    );
  const system =
    input.systemPrompt ?? TRANSLATION_PROTOCOL_PROMPTS[protocol].systemPrompt;
  const user =
    input.userPrompt ?? TRANSLATION_PROTOCOL_PROMPTS[protocol].userPrompt;
  return [
    { role: "system", content: render(system) },
    { role: "user", content: render(user) },
  ];
}

export function parseResult(text, options) {
  const { items } = options;
  const protocol = translationProtocol(options);
  const expected = itemIds(items);
  if (protocol === "text") {
    if (typeof text !== "string" || !text.trim())
      throw providerError("INVALID_RESPONSE", "Empty translation text.");
    return { items: [{ id: items[0].id, text }] };
  }
  if (protocol !== "json")
    return parseSegments(text, { items, format: protocol });
  const raw = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed.items || parsed.translations;
  if (!Array.isArray(list))
    throw providerError("INVALID_RESPONSE", "Expected a translation array.");
  const found = new Map();
  for (const item of list) {
    if (
      !expected.has(item.id) ||
      found.has(item.id) ||
      typeof item.text !== "string" ||
      !item.text.trim()
    ) {
      throw providerError(
        "INVALID_RESPONSE",
        "Invalid, duplicate or unknown translation ID/text."
      );
    }
    found.set(item.id, item.text);
  }
  if (found.size !== expected.size)
    throw providerError("INCOMPLETE_RESPONSE", "Missing translation items.");
  return { items: items.map(({ id }) => ({ id, text: found.get(id) })) };
}

export async function createTranslationStreamParser(options, ParserClass) {
  const { items } = options;
  const protocol = translationProtocol(options);
  itemIds(items);
  if (protocol === "xml") return createXmlSegmentParser({ items });
  if (protocol === "text") {
    let text = "";
    return {
      push(delta) {
        text += delta;
        return delta
          ? [{ type: "item.delta", id: items[0].id, text: delta }]
          : [];
      },
      finish: () => parseResult(text, options),
    };
  }
  if (protocol === "line") {
    let buffer = "",
      offset = 0;
    const emitted = new Set();
    return {
      push(delta) {
        buffer += delta;
        const end = buffer.lastIndexOf("\n") + 1;
        if (end <= offset) return [];
        // Validate the entire completed prefix to catch duplicates across chunks.
        const prefix = buffer
          .slice(0, end)
          .replace(/^```(?:text)?\s*\n/i, "")
          .replace(/\n```\s*$/, "");
        if (!prefix.trim()) {
          offset = end;
          return [];
        }
        const ids = prefix
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => line.slice(0, line.indexOf("|")).trim());
        const subset = items.filter((item) => ids.includes(item.id));
        if (ids.some((id) => !items.some((item) => item.id === id)))
          throw providerError(
            "INVALID_RESPONSE",
            "Unknown or invalid translation line ID."
          );
        const result = parseSegments(prefix, { items: subset, format: "line" });
        offset = end;
        return result.items
          .filter((item) => !emitted.has(item.id))
          .map((item) => {
            emitted.add(item.id);
            return { type: "item.complete", ...item };
          });
      },
      finish: () => parseResult(buffer, options),
    };
  }
  const JSONParser =
    ParserClass || (await import("@streamparser/json")).JSONParser;
  const expected = itemIds(items);
  const found = new Map();
  const pending = [];
  let failure;
  const parser = new JSONParser({
    paths: ["$.*", "$.items.*", "$.translations.*"],
    keepStack: false,
  });
  parser.onValue = ({ value }) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    if (
      !expected.has(value.id) ||
      found.has(value.id) ||
      typeof value.text !== "string" ||
      !value.text.trim()
    )
      throw providerError(
        "INVALID_RESPONSE",
        "Invalid streaming translation item."
      );
    found.set(value.id, value.text);
    pending.push({ type: "item.complete", id: value.id, text: value.text });
  };
  parser.onError = (error) => {
    // Preserve the contract failure; parser recovery can otherwise overwrite its code.
    failure ||= error;
  };
  return {
    push(delta) {
      if (!parser.isEnded || delta.trim()) parser.write(delta);
      if (failure) throw failure;
      return pending.splice(0);
    },
    finish() {
      if (!parser.isEnded) parser.end();
      if (failure) throw failure;
      if (found.size !== expected.size)
        throw providerError(
          "INCOMPLETE_RESPONSE",
          "Missing streaming translation items."
        );
      return { items: items.map(({ id }) => ({ id, text: found.get(id) })) };
    },
  };
}
