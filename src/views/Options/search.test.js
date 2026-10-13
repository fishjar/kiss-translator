import { I18N, registerI18n } from "../../config/i18n";
import { TERMINOLOGY_PLAYGROUND_I18N } from "../../config/locales/terminologyPlayground";
import { SUBTITLE_PLAYGROUND_I18N } from "../../config/locales/subtitlePlayground";
import {
  SETTINGS_SEARCH_KEYS,
  SETTINGS_SEARCH_LABELS,
  getSettingsSearchEntries,
  getSettingsSearchTarget,
  searchSettingsGroups,
} from "./search";

// The Options entry imports Playground pages, which register these dictionaries.
beforeAll(() => {
  registerI18n(TERMINOLOGY_PLAYGROUND_I18N);
  registerI18n(SUBTITLE_PLAYGROUND_I18N);
});

const labels = {
  overview: "options_overview",
  appearance: "options_appearance",
  web: "options_web_translation",
  selection: "selection_translate",
  hover: "touch_paragraph",
  input: "input_translate",
  subtitle: "subtitle_translate",
  apis: "options_translation_services",
  prompts: "prompt_management",
  sync: "options_data_sync",
  words: "favorite_words",
  playground: "playground",
  about: "about",
};

function search(query, lang = "zh") {
  const i18n = (key, fallback = key) => I18N[key]?.[lang] ?? fallback;
  const groups = [
    {
      label: "",
      items: Object.keys(labels).map((id) => [
        id,
        i18n(labels[id]),
        id,
        null,
        getSettingsSearchEntries(id, i18n, lang),
      ]),
    },
  ];
  return searchSettingsGroups(groups, query, lang).flatMap(
    (group) => group.items
  );
}

test("every indexed field has a localized label and appears once per page", () => {
  const missing = [];
  for (const keys of Object.values(SETTINGS_SEARCH_KEYS)) {
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      for (const lang of ["zh", "en"])
        if (typeof (SETTINGS_SEARCH_LABELS[key] || I18N[key]?.[lang]) !== "string")
          missing.push(`${key}:${lang}`);
    }
  }
  expect(missing).toEqual([]);
});

test.each([
  ["缓存", "overview", "if_clear_cache"],
  ["超时", "overview", "http_timeout"],
  ["超时", "apis", "http_timeout"],
  ["连击", "input", "combo_timeout"],
  ["透明度", "overview", "fab_opacity"],
  ["黑名单", "selection", "blacklist"],
  ["断句", "subtitle", "ai_segmentation"],
  ["加密", "sync", "data_sync_encrypt_key"],
  ["system prompt", "prompts", "system_prompt"],
  ["HTTP TIMEOUT", "overview", "http_timeout"],
  ["模型", "apis", "api_model"],
  ["API KEY", "apis", "api_key"],
  ["深色", "appearance", "settings_appearance_mode"],
  ["DARK", "appearance", "settings_appearance_mode"],
  ["批量", "apis", "batch_size"],
  ["ｈｔｔｐ　ｔｉｍｅｏｕｔ", "apis", "http_timeout"],
])("finds %s in unmounted page %s", (query, pageId, key) => {
  const result = search(query).find(([id]) => id === pageId);
  expect(result?.[4].map((entry) => entry.key)).toContain(key);
});

test("matches page titles with concrete children and rejects unrelated text", () => {
  const result = search("字幕翻译").find(([id]) => id === "subtitle");
  expect(result[4].map((entry) => entry.key)).toContain("ai_segmentation");
  expect(search("this setting does not exist")).toHaveLength(0);
});

test("rebuilds localized results when the UI language changes", () => {
  expect(search("缓存", "zh").map(([id]) => id)).toContain("overview");
  expect(search("缓存", "en")).toHaveLength(0);
  expect(
    search("Cache", "en")
      .find(([id]) => id === "overview")[4]
      .map((entry) => entry.key)
  ).toContain("if_clear_cache");
});

test("accepts deep links only for fields on their destination page", () => {
  expect(getSettingsSearchTarget("/input", "?setting=combo_timeout")).toBe(
    "combo_timeout"
  );
  expect(getSettingsSearchTarget("/apis", "?setting=combo_timeout")).toBe("");
  expect(getSettingsSearchTarget("/input", "?setting=unknown")).toBe("");
});
