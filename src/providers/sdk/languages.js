import { OPT_LANGS_MAP } from "./languageDictionary";
import { providerError } from "../capabilities";

export const languages = Object.freeze(Object.fromEntries(OPT_LANGS_MAP));

export function toIso6391(value) {
  const language = String(value || "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  const aliases = {
    "zh-cn": "zh",
    "zh-tw": "zh",
    "zh-hans": "zh",
    "zh-hant": "zh",
    fil: "tl",
    iw: "he",
  };
  const code = aliases[language] || language.split("-")[0];
  if (
    !/^[a-z]{2}$/.test(code) ||
    (!Object.keys(languages).some(
      (key) => key.toLowerCase().split("-")[0] === code
    ) &&
      !["zh", "tl", "he"].includes(code))
  ) {
    throw providerError(
      "UNSUPPORTED_LANGUAGE",
      `Cannot map language to ISO 639-1: ${value}`
    );
  }
  return code;
}

export function normalizeLocale(value) {
  const locale = String(value || "")
    .trim()
    .replace(/_/g, "-");
  if (
    !locale ||
    ["auto", "detect", "und", "unknown"].includes(locale.toLowerCase())
  )
    return undefined;
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    throw providerError(
      "INVALID_LANGUAGE",
      `Invalid language locale: ${value}`
    );
  }
}
