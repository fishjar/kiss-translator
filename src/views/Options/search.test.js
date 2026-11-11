import { I18N, UI_LANGS, registerI18n } from "../../config/i18n";
import { TERMINOLOGY_PLAYGROUND_I18N } from "../../config/locales/terminologyPlayground";
import { SUBTITLE_PLAYGROUND_I18N } from "../../config/locales/subtitlePlayground";
import {
  SETTINGS_SEARCH_KEYS,
  SETTINGS_SEARCH_LABELS,
  getSettingsSearchEntries,
  getSettingsSearchHighlightParts,
  getSettingsSearchTerms,
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
        if (
          typeof (SETTINGS_SEARCH_LABELS[key] || I18N[key]?.[lang]) !== "string"
        )
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
  ["system prompt", "prompts", "system_prompt", "en"],
  ["REQUEST TIMEOUT", "overview", "http_timeout", "en"],
  ["模型", "apis", "api_model"],
  ["API KEY", "apis", "api_key"],
  ["深色", "appearance", "settings_appearance_mode"],
  ["DARK", "appearance", "settings_appearance_mode", "en"],
  ["批量", "apis", "batch_size"],
  ["ｒｅｑｕｅｓｔ　ｔｉｍｅｏｕｔ", "apis", "http_timeout", "en"],
])("finds %s in unmounted page %s", (query, pageId, key, lang = "zh") => {
  const result = search(query, lang).find(([id]) => id === pageId);
  expect(result?.[4].map((entry) => entry.key)).toContain(key);
});

test("matches only child settings even when the query matches their page title", () => {
  const subtitle = search("字幕").find(([id]) => id === "subtitle");
  expect(subtitle[4].map((entry) => entry.key)).toEqual([
    "toggle_subtitle_translate",
    "settings_subtitle_auto_start",
    "show_subtitle_list",
    "subtitle_loading_notification",
    "remember_subtitle_position",
  ]);
  const result = search("字幕翻译").find(([id]) => id === "subtitle");
  expect(result[4].map((entry) => entry.key)).toEqual([
    "toggle_subtitle_translate",
  ]);
  expect(search("this setting does not exist")).toHaveLength(0);
});

test("does not use group or page titles to satisfy any search term", () => {
  const groups = [
    {
      label: "通用",
      items: [
        [
          "subtitle",
          "字幕翻译",
          "/subtitle",
          null,
          [{ key: "to_lang", label: "目标语言", text: "目标语言 language" }],
        ],
        ["image", "图片翻译", "/image", null, []],
      ],
    },
  ];
  for (const query of [
    "通用",
    "字幕",
    "图片翻译",
    "字幕 language",
    "通用 语言",
  ])
    expect(searchSettingsGroups(groups, query, "zh")).toEqual([]);
  const result = searchSettingsGroups(groups, "language", "zh");
  expect(result[0].label).toBe("通用");
  expect(result[0].items[0].slice(0, 4)).toEqual(
    groups[0].items[0].slice(0, 4)
  );
  expect(result[0].items[0][4][0].key).toBe("to_lang");
  expect(searchSettingsGroups(groups, "  ", "zh")).toBe(groups);
});

test.each([
  ["显示字幕列表和字幕通知", "字幕", "zh", ["字幕", "字幕"]],
  ["HTTP Timeout", "ｈｔｔｐ　ＴＩＭＥＯＵＴ", "en", ["HTTP", "Timeout"]],
  ["İstem Yönetimi", "İSTEM", "tr_TR", ["İstem"]],
  ["Prompt Management", "PROMPT", "invalid_locale!", ["Prompt"]],
  ["ﬃ Filter", "ffi", "en", ["ﬃ"]],
  ["Cafe\u0301", "café", "en", ["Cafe\u0301"]],
  ["Max Tokens (0-1000000)", "(0-1000000)", "en", ["(0-1000000)"]],
  ["字幕字幕", "字幕 字", "zh", ["字幕字幕"]],
  ["目标语言", "字幕", "zh", []],
  ["目标语言", "  ", "zh", []],
])(
  "highlights normalized matches in %s without changing the label",
  (text, query, lang, matches) => {
    const parts = getSettingsSearchHighlightParts(
      text,
      getSettingsSearchTerms(query, lang),
      lang
    );
    expect(parts.map((part) => part.text).join("")).toBe(text);
    expect(
      parts.filter((part) => part.matched).map((part) => part.text)
    ).toEqual(matches);
  }
);

test("highlights normalized text when grapheme segmentation is unavailable", () => {
  const segmenter = Intl.Segmenter;
  Intl.Segmenter = undefined;
  try {
    const parts = getSettingsSearchHighlightParts(
      "ﬃ Cafe\u0301",
      getSettingsSearchTerms("FFI CAFÉ", "en"),
      "en"
    );
    expect(
      parts.filter((part) => part.matched).map((part) => part.text)
    ).toEqual(["ﬃ", "Cafe\u0301"]);
  } finally {
    Intl.Segmenter = segmenter;
  }
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

test.each([
  "Secondary",
  "When enabled",
  "Opacity",
  "DARK",
  "http timeout",
  "fab half hide",
])(
  "does not index foreign labels, options, descriptions or internal keys for %s",
  (query) => {
    expect(search(query, "zh")).toHaveLength(0);
  }
);

test("indexes only localized aliases while retaining visible technical labels", () => {
  expect(search("模型", "en")).toHaveLength(0);
  expect(search("endpoint", "zh")).toHaveLength(0);
  expect(
    search("endpoint", "en")
      .find(([id]) => id === "apis")[4]
      .map((entry) => entry.key)
  ).toContain("api_url");
  expect(
    search("LaTeX", "zh")
      .find(([id]) => id === "overview")[4]
      .map((entry) => entry.key)
  ).toContain("parse_latex");
  expect(
    search("Key", "zh")
      .find(([id]) => id === "apis")[4]
      .map((entry) => entry.key)
  ).toContain("api_key");
  const i18n = (key, fallback = key) => I18N[key]?.zh ?? fallback;
  const entries = getSettingsSearchEntries("overview", i18n, "zh");
  expect(
    entries.find((entry) => entry.key === "context_menus").searchTexts
  ).not.toContain(I18N.secondary_context_menus.en);
  expect(
    entries.find((entry) => entry.key === "translate_variants").searchTexts
  ).not.toContain(I18N.translate_variants_helper.en);
});

test.each(UI_LANGS)(
  "retains shared API aliases with real dictionary entries in %s (%s)",
  (lang) => {
    for (const [query, key] of [
      ["API Key", "api_key"],
      ["API URL", "api_url"],
    ]) {
      const entries = search(query, lang).find(([id]) => id === "apis")?.[4];
      expect(entries?.map((entry) => entry.key)).toContain(key);
    }
  }
);

test("accepts deep links only for fields on their destination page", () => {
  expect(getSettingsSearchTarget("/input", "?setting=combo_timeout")).toBe(
    "combo_timeout"
  );
  expect(getSettingsSearchTarget("/apis", "?setting=combo_timeout")).toBe("");
  expect(getSettingsSearchTarget("/input", "?setting=unknown")).toBe("");
});
