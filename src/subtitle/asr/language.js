import {
  ASR_LANGUAGES,
  getSupportedAsrLanguages,
  mapAsrLanguage,
  normalizeAsrLanguage,
} from "../../localAi/core/asrLanguages";
import { getCatalogModel } from "../../localAi/core/catalog";
import { isHostedLocalAsr } from "../../providers/localAsrRouting";
import { OPT_LANGS_TO } from "../../providers/sdk/languageDictionary";

export const translationLanguageOptions = OPT_LANGS_TO.map(
  ([value, label]) => ({ value, label })
);

export const ASR_LANGUAGE_POLICY_VERSION = 2;
export const isWhisperAsrService = (service) =>
  isHostedLocalAsr(service, "transcribe") &&
  getCatalogModel(service.modelRef)?.runtime === "transformers";
const codes = {
  cantonese: "yue",
  english: "en",
  japanese: "ja",
  korean: "ko",
  french: "fr",
  german: "de",
  spanish: "es",
  portuguese: "pt",
  italian: "it",
  russian: "ru",
  arabic: "ar",
  hindi: "hi",
};
export const asrLanguageOptions = (service) => {
  const model = isHostedLocalAsr(service, "transcribe")
    ? getCatalogModel(service.modelRef)
    : null;
  return (model ? getSupportedAsrLanguages(model) : ASR_LANGUAGES)
    .filter(
      (option) =>
        !model ||
        model.runtime === "onnx" ||
        mapAsrLanguage(option.value).whisper
    )
    .map((option) => ({
      ...option,
      value: codes[option.value] || option.value,
    }));
};
export function resolveAsrLanguage(identity, selected, service) {
  const model = isHostedLocalAsr(service, "transcribe")
    ? getCatalogModel(service.modelRef)
    : null;
  const language =
    selected === "auto"
      ? normalizeAsrLanguage(identity.sourceLanguage || "auto")
      : selected;
  if (model?.multilingual === false)
    return selected === "auto" ? "en" : language;
  if (["", "auto", "und", "mul", "zxx", "default"].includes(language))
    return "auto";
  if (!model) return language;
  if (model.runtime === "onnx")
    return ["zh", "en", "yue", "ja", "ko"].includes(language.split("-")[0])
      ? language
      : "auto";
  return mapAsrLanguage(language).whisper ? language : "auto";
}

const key = (identity) => `${identity.videoId}:${identity.trackId}`;
function languagePreferences(storageKey, defaultValue) {
  const choices = new Map();
  return {
    get(identity) {
      if (choices.has(key(identity))) return choices.get(key(identity));
      try {
        return (
          JSON.parse(localStorage.getItem(storageKey) || "{}")[key(identity)] ||
          defaultValue
        );
      } catch {
        return defaultValue;
      }
    },
    set(identity, value) {
      choices.delete(key(identity));
      choices.set(key(identity), value);
      if (choices.size > 200) choices.delete(choices.keys().next().value);
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
        delete saved[key(identity)];
        saved[key(identity)] = value;
        localStorage.setItem(
          storageKey,
          JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-200)))
        );
      } catch {
        /* Recognition still works when site storage is unavailable. */
      }
    },
  };
}
export const asrLanguagePreferences = languagePreferences(
  "kiss-youtube-asr-languages",
  "auto"
);
export const asrTranslationPreferences = languagePreferences(
  "kiss-youtube-asr-translation-languages",
  undefined
);

export const recognitionIdentity = (identity, selected, service) =>
  selected === "auto" && !isWhisperAsrService(service)
    ? identity
    : { ...identity, recognitionLanguage: selected };
export function audioIdentity(identity) {
  const { recognitionLanguage, ...audio } = identity;
  return audio;
}
