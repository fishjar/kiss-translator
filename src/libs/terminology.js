import { parseTerms, buildTermsMatcher, applyTermReplace } from "./terms";
import { parseAITerms } from "./utils";

export const TABLE_FORMAT_VERSION = 1;
export const TABLE_MATCH_MODES = ["auto", "substring", "regex"];

export function normalizeTerminologyTable(value) {
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    typeof value.terms !== "string" ||
    typeof value.aiTerms !== "string" ||
    !TABLE_MATCH_MODES.includes(value.normalMatchMode)
  ) {
    throw new Error("Invalid terminology table");
  }
  return {
    id: value.id,
    name: value.name.trim(),
    description: typeof value.description === "string" ? value.description : "",
    terms: value.terms,
    aiTerms: value.aiTerms,
    normalMatchMode: value.normalMatchMode,
  };
}

export function parseTableFile(text, defaults = {}) {
  const data = JSON.parse(text);
  if (data.formatVersion !== TABLE_FORMAT_VERSION)
    throw new Error("Unsupported terminology format version");
  if (
    !data.table ||
    typeof data.table !== "object" ||
    Array.isArray(data.table)
  )
    throw new Error("Invalid terminology table");
  return normalizeTerminologyTable({ ...defaults, ...data.table });
}

export function exportTableFile(table) {
  return JSON.stringify(
    {
      formatVersion: TABLE_FORMAT_VERSION,
      table: normalizeTerminologyTable(table),
    },
    null,
    2
  );
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const latin = /\p{Script=Latin}/u;
const continuation = /[\p{Script=Latin}\p{M}\p{N}_]/u;
const firstChar = (value) =>
  value ? String.fromCodePoint(value.codePointAt(0)) : "";
const charBefore = (value, end) => {
  if (!end) return "";
  const index =
    end > 1 &&
    value.charCodeAt(end - 1) >= 0xdc00 &&
    value.charCodeAt(end - 1) <= 0xdfff
      ? end - 2
      : end - 1;
  return String.fromCodePoint(value.codePointAt(index));
};
const lastChar = (value) => charBefore(value, value.length);

export function acceptsTermBoundary(entry, text, start, end) {
  if (entry.matchMode !== "auto") return true;
  return (
    !(
      latin.test(entry.key) &&
      continuation.test(firstChar(entry.key)) &&
      continuation.test(charBefore(text, start))
    ) &&
    !(
      latin.test(entry.key) &&
      continuation.test(lastChar(entry.key)) &&
      continuation.test(
        end < text.length ? String.fromCodePoint(text.codePointAt(end)) : ""
      )
    )
  );
}

export function parseNormalSource(text, mode = "regex") {
  if (mode === "regex") return parseTerms(text, { fullDiagnostics: false });
  // Preserve the ordinary terms grammar (last comma, newline/semicolon).
  const originals = new Map();
  const escaped = (text || "")
    .split(/\n|;/)
    .map((line) => {
      const separator = line.lastIndexOf(",");
      const key = (separator < 0 ? line : line.slice(0, separator)).trim();
      const pattern = escapeRegex(key);
      originals.set(pattern, key);
      return separator < 0
        ? pattern
        : `${pattern},${line.slice(separator + 1)}`;
    })
    .join("\n");
  const parsed = parseTerms(escaped, { fullDiagnostics: false });
  parsed.terms = parsed.terms.map((entry) => {
    const term = { ...entry, key: originals.get(entry.key), matchMode: mode };
    if (mode === "auto")
      term.acceptMatch = (input, start, end) =>
        acceptsTermBoundary(term, input, start, end);
    return term;
  });
  return parsed;
}

/** Sources and references arrive in descending priority; never sort references. */
export function composeTerminology(sources, tables = []) {
  const tableMap = new Map(tables.map((table) => [table.id, table]));
  const seenTables = new Set();
  const normal = new Map();
  const ai = new Map();
  const diagnostics = [];
  const missingTableIds = [];
  const add = (source, origin, mode = "regex") => {
    const parsed = parseNormalSource(source.terms || "", mode);
    diagnostics.push(
      ...parsed.diagnostics.map((item) => ({ ...item, origin }))
    );
    for (const entry of parsed.terms) {
      if (!normal.has(entry.key)) normal.set(entry.key, { ...entry, origin });
    }
    for (const [key, value] of Object.entries(parseAITerms(source.aiTerms))) {
      if (!ai.has(key)) ai.set(key, value);
    }
  };
  for (const [index, source] of sources.filter(Boolean).entries()) {
    add(source, `inline:${index}`);
    for (const id of source.termsList || []) {
      if (seenTables.has(id)) continue;
      seenTables.add(id);
      const table = tableMap.get(id);
      if (!table) {
        missingTableIds.push(id);
        continue;
      }
      add(table, id, table.normalMatchMode);
    }
  }
  const normalEntries = [...normal.values()].sort(
    (a, b) => b.key.length - a.key.length
  );
  const glossary = Object.fromEntries(ai);
  const signature = JSON.stringify([
    normalEntries.map(({ key, value, matchMode }) => [
      key,
      value,
      matchMode || "regex",
    ]),
    [...ai].sort(),
  ]);
  return { normalEntries, glossary, diagnostics, missingTableIds, signature };
}

const compiledSnapshots = new WeakMap();
const compiledMatchers = new WeakMap();
export const EMPTY_TERMINOLOGY_TABLES = Object.freeze([]);

/** Compile once per task snapshot and source configuration, not per paragraph. */
export function compileTerminology(sources, tables = EMPTY_TERMINOLOGY_TABLES) {
  let cache = compiledSnapshots.get(tables);
  if (!cache) {
    cache = new Map();
    compiledSnapshots.set(tables, cache);
  }
  const key = JSON.stringify(
    sources
      .filter(Boolean)
      .map(({ terms, aiTerms, termsList }) => [
        terms || "",
        aiTerms || "",
        termsList || [],
      ])
  );
  if (!cache.has(key)) {
    if (cache.size >= 32) cache.delete(cache.keys().next().value);
    cache.set(key, composeTerminology(sources, tables));
  }
  return cache.get(key);
}

export function terminologySourceList(scene = {}) {
  return scene.terminologySources || [scene];
}

/** A request-local map, restored after HTTP/model caches and before rendering. */
export function protectTerminologyText(text, entries) {
  if (!compiledMatchers.has(entries))
    compiledMatchers.set(entries, buildTermsMatcher(entries));
  const matcher = compiledMatchers.get(entries);
  const replacements = new Map();
  let prefix = "__KISS_TERM_";
  const tokenPattern = () => `${escapeRegex(prefix)}\\s*(\\d+)\\s*__`;
  while (text.includes(prefix) || new RegExp(tokenPattern(), "i").test(text))
    prefix = `_${prefix}`;
  const result = applyTermReplace(
    text,
    entries,
    (entry, match) => {
      const token = `${prefix}${replacements.size}__`;
      replacements.set(token, entry.value || match);
      return token;
    },
    matcher
  );
  const tokenRegex = new RegExp(tokenPattern(), "gi");
  return {
    text: result.output,
    restore: (value) =>
      typeof value === "string"
        ? value.replace(
            tokenRegex,
            (token, id) => replacements.get(`${prefix}${id}__`) ?? token
          )
        : value,
    protected: replacements.size > 0,
  };
}
