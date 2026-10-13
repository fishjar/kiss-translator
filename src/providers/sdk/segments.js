import { providerError } from "../capabilities";
import { parseResult } from "./translation";

const xmlEscape = (text) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]
  );
const xmlUnescape = (text) =>
  text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    if (named[entity]) return named[entity];
    const point = entity.startsWith("&#x")
      ? parseInt(entity.slice(3, -1), 16)
      : Number(entity.slice(2, -1));
    if (
      !Number.isInteger(point) ||
      point < 0 ||
      point > 0x10ffff ||
      (point >= 0xd800 && point <= 0xdfff)
    )
      throw providerError("INVALID_RESPONSE", "Invalid XML character.");
    return String.fromCodePoint(point);
  });

/** This is the translation wire format, not a general XML parser: no DTD or external entities. */
export function encodeSegments(items, format = "json") {
  // Reuse the ID contract rather than letting each encoding accept different inputs.
  parseResult(JSON.stringify(items), { items });
  if (format === "json") return JSON.stringify(items);
  if (format === "xml")
    return `<root>${items.map(({ id, text }) => `<t id="${xmlEscape(id)}">${xmlEscape(text)}</t>`).join("")}</root>`;
  if (format === "line") {
    if (items.some(({ id }) => /[|\r\n]/.test(id)))
      throw providerError(
        "INVALID_INPUT",
        "Line IDs cannot contain separators."
      );
    return items
      .map(({ id, text }) => `${id} | ${text.replace(/\r\n|\r|\n/g, "<br>")}`)
      .join("\n");
  }
  throw providerError("INVALID_INPUT", "Unsupported segment format.");
}

export function parseSegments(text, { items, format = "json" }) {
  if (format === "json") return parseResult(text, { items });
  const raw = text
    .trim()
    .replace(/^```(?:xml|text)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  if (format === "xml") {
    if (!/^<root>\s*[\s\S]*<\/root>$/.test(raw) || /<!|<\?/.test(raw))
      throw providerError(
        "INVALID_RESPONSE",
        "Invalid translation XML envelope."
      );
    const inner = raw.slice(6, -7);
    const pattern = /<t\s+id=(?:"([^"]+)"|'([^']+)')\s*>([\s\S]*?)<\/t>/g;
    let cursor = 0;
    parsed = [];
    for (const match of inner.matchAll(pattern)) {
      if (inner.slice(cursor, match.index).trim())
        throw providerError("INVALID_RESPONSE", "Unexpected XML content.");
      parsed.push({
        id: xmlUnescape(match[1] || match[2]),
        text: xmlUnescape(match[3]),
      });
      cursor = match.index + match[0].length;
    }
    if (inner.slice(cursor).trim())
      throw providerError("INVALID_RESPONSE", "Incomplete translation XML.");
  } else if (format === "line") {
    parsed = raw
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const separator = line.indexOf("|");
        if (separator < 1)
          throw providerError("INVALID_RESPONSE", "Invalid translation line.");
        return {
          id: line.slice(0, separator).trim(),
          text: line
            .slice(separator + 1)
            .trim()
            .replace(/<br\s*\/?\s*>/gi, "\n"),
        };
      });
  } else throw providerError("INVALID_INPUT", "Unsupported segment format.");
  return parseResult(JSON.stringify(parsed), { items });
}

export function createXmlSegmentParser({ items }) {
  let buffer = "";
  let scanned = 0;
  const emitted = new Set();
  return {
    push(chunk) {
      buffer += chunk;
      const events = [];
      const pattern = /<t\s+id=(?:"([^"]+)"|'([^']+)')\s*>([\s\S]*?)<\/t>/g;
      pattern.lastIndex = scanned;
      let match;
      while ((match = pattern.exec(buffer))) {
        const id = xmlUnescape(match[1] || match[2]);
        if (!items.some((item) => item.id === id) || emitted.has(id))
          throw providerError(
            "INVALID_RESPONSE",
            "Unknown or duplicate XML ID."
          );
        emitted.add(id);
        scanned = pattern.lastIndex;
        events.push({ type: "item.complete", id, text: xmlUnescape(match[3]) });
      }
      return events;
    },
    finish() {
      return parseSegments(buffer, { items, format: "xml" });
    },
  };
}

export function createNDJSONParser() {
  let pending = "";
  return {
    push(chunk) {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop();
      return lines
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    },
    finish() {
      const tail = pending.trim();
      pending = "";
      return tail ? [JSON.parse(tail)] : [];
    },
  };
}
