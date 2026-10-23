// Shared language codes/names for SDK and scenes; no vendor configuration or network calls.
export const OPT_LANGS_TO = [
  ["en", "English - English"],
  ["zh-CN", "Simplified Chinese - 简体中文"],
  ["zh-TW", "Traditional Chinese - 繁體中文"],
  ["ar", "Arabic - العربية"],
  ["bg", "Bulgarian - Български"],
  ["ca", "Catalan - Català"],
  ["hr", "Croatian - Hrvatski"],
  ["cs", "Czech - Čeština"],
  ["da", "Danish - Dansk"],
  ["nl", "Dutch - Nederlands"],
  ["et", "Estonian - Eesti"],
  ["fa", "Persian - فارسی"],
  ["fi", "Finnish - Suomi"],
  ["fr", "French - Français"],
  ["de", "German - Deutsch"],
  ["el", "Greek - Ελληνικά"],
  ["hi", "Hindi - हिन्दी"],
  ["hu", "Hungarian - Magyar"],
  ["id", "Indonesian - Indonesia"],
  ["it", "Italian - Italiano"],
  ["ja", "Japanese - 日本語"],
  ["ko", "Korean - 한국어"],
  ["ms", "Malay - Melayu"],
  ["mt", "Maltese - Malti"],
  ["nb", "Norwegian - Norsk Bokmål"],
  ["pl", "Polish - Polski"],
  ["pt", "Portuguese - Português"],
  ["ro", "Romanian - Română"],
  ["ru", "Russian - Русский"],
  ["sk", "Slovak - Slovenčina"],
  ["sl", "Slovenian - Slovenščina"],
  ["es", "Spanish - Español"],
  ["sv", "Swedish - Svenska"],
  ["ta", "Tamil - தமிழ்"],
  ["te", "Telugu - తెలుగు"],
  ["th", "Thai - ไทย"],
  ["tr", "Turkish - Türkçe"],
  ["uk", "Ukrainian - Українська"],
  ["vi", "Vietnamese - Tiếng Việt"],
];
export const OPT_LANGS_LIST = OPT_LANGS_TO.map(([lang]) => lang);
export const OPT_LANGS_FROM = [
  ["auto", "AutoDetect - AutoDetect"],
  ...OPT_LANGS_TO,
];
export const OPT_LANGS_MAP = new Map(OPT_LANGS_TO);
export const OPT_LANGS_TO_REVERSED = OPT_LANGS_TO.map(([code, name]) => [
  code,
  name.split(" - ").reverse().join(" - "),
]);
export const OPT_LANGS_FROM_REVERSED = OPT_LANGS_FROM.map(([code, name]) => [
  code,
  name.split(" - ").reverse().join(" - "),
]);

// CODE->名称
export const OPT_LANGS_SPEC_NAME = new Map(
  OPT_LANGS_FROM.map(([key, val]) => [key, val.split(" - ")[0]])
);
export const OPT_LANGS_SPEC_DEFAULT = new Map(
  OPT_LANGS_FROM.map(([key]) => [key, key])
);
export const OPT_LANGS_SPEC_DEFAULT_UC = new Map(
  OPT_LANGS_FROM.map(([key]) => [key, key.toUpperCase()])
);
