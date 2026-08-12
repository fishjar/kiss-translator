import {
  DEFAULT_BATCH_PROMPT_SLUG,
  DEFAULT_DICTIONARY_PROMPT_SLUG,
  DEFAULT_NOBATCH_PROMPT_SLUG,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  PRESET_PROMPTS,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_SLUG_DICTIONARY_EN_JA,
  PROMPT_SLUG_DICTIONARY_EN_KO,
  PROMPT_SLUG_DICTIONARY_EN_RU,
  PROMPT_SLUG_DICTIONARY_EN_VI,
  PROMPT_MODE_FOLLOW_API,
  PROMPT_MODE_GLOBAL,
  PROMPT_TEMPLATE_CATEGORIES,
  SETTINGS_VERSION_V2,
  SETTINGS_VERSION_V3,
  getDictionaryPromptOptions,
  getPromptDisplayName,
  migrateSettingPromptsToV2,
  migrateSettingToV3,
  normalizeCustomPrompts,
  normalizePrompt,
  removeLegacyApiPromptIds,
  removePromptReferences,
  resolveApiPromptSettings,
} from "./prompt";
import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  GEMINI_GENERATE_CONTENT_URL,
  OPT_TRANS_GEMINI,
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultDictPrompt,
  defaultDictPromptEnJa,
  defaultDictPromptEnKo,
  defaultDictPromptEnRu,
  defaultDictPromptEnVi,
  defaultDictUserPrompt,
  defaultSubtitlePrompt,
  defaultSystemPrompt,
} from "./api";
import { I18N, UI_LANGS } from "./i18n";

describe("prompt settings", () => {
  test("rewrites Gemini Interactions URL back to GEMINI_GENERATE_CONTENT_URL in V3 migration", () => {
    const customUrl =
      "https://proxy.example.com/models/{{model}}:generateContent";
    const interactionsUrl =
      "https://generativelanguage.googleapis.com/v1beta2/interactions";
    const setting = {
      version: SETTINGS_VERSION_V2,
      transApis: [
        {
          apiSlug: OPT_TRANS_GEMINI,
          apiType: OPT_TRANS_GEMINI,
          url: interactionsUrl,
          thinkingMode: "disabled",
        },
        {
          apiSlug: "Gemini_copy",
          apiType: OPT_TRANS_GEMINI,
          url: interactionsUrl,
        },
        {
          apiSlug: "Gemini_proxy",
          apiType: OPT_TRANS_GEMINI,
          url: customUrl,
        },
      ],
    };

    const migrated = migrateSettingToV3(setting);
    expect(migrated.version).toBe(SETTINGS_VERSION_V3);
    expect(migrated.transApis[0]).toMatchObject({
      url: GEMINI_GENERATE_CONTENT_URL,
      thinkingMode: "disabled",
    });
    expect(migrated.transApis[1].url).toBe(GEMINI_GENERATE_CONTENT_URL);
    expect(migrated.transApis[2].url).toBe(customUrl);
    expect(migrateSettingToV3(migrated)).toBe(migrated);
  });

  test("migrates v1 inline api prompts into v2 custom prompt references", () => {
    const setting = {
      prompts: [],
      transApis: [
        {
          apiSlug: "openai",
          apiName: "OpenAI",
          systemPrompt: "custom batch system prompt",
          nobatchPrompt: "custom nobatch system prompt",
          nobatchUserPrompt: "custom nobatch user prompt",
          subtitlePrompt: "custom subtitle prompt",
          dictPrompt: "custom dictionary system prompt",
          dictUserPrompt: "custom dictionary user prompt",
        },
      ],
    };

    const migrated = migrateSettingPromptsToV2(setting);
    const api = migrated.transApis[0];

    expect(migrated.version).toBe(SETTINGS_VERSION_V2);
    expect(api.batchPromptSlug).toMatch(/^prompt_migrated_batch_/);
    expect(api.nobatchPromptSlug).toMatch(/^prompt_migrated_nobatch_/);
    expect(api.subtitlePromptSlug).toMatch(/^prompt_migrated_subtitle_/);
    expect(api.dictPromptSlug).toMatch(/^prompt_migrated_dict_/);
    expect(migrated.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: api.batchPromptSlug,
          systemPrompt: "custom batch system prompt",
          userPrompt: "",
        }),
        expect.objectContaining({
          slug: api.nobatchPromptSlug,
          systemPrompt: "custom nobatch system prompt",
          userPrompt: "custom nobatch user prompt",
        }),
        expect.objectContaining({
          slug: api.subtitlePromptSlug,
          systemPrompt: "custom subtitle prompt",
          userPrompt: "",
        }),
        expect.objectContaining({
          slug: api.dictPromptSlug,
          systemPrompt: "custom dictionary system prompt",
          userPrompt: "custom dictionary user prompt",
        }),
      ])
    );
    expect(migrated.prompts).toHaveLength(4);

    const migratedAgain = migrateSettingPromptsToV2(setting);
    expect(migratedAgain.transApis[0].batchPromptSlug).toBe(
      api.batchPromptSlug
    );
    expect(migratedAgain.transApis[0].nobatchPromptSlug).toBe(
      api.nobatchPromptSlug
    );
    expect(migratedAgain.transApis[0].subtitlePromptSlug).toBe(
      api.subtitlePromptSlug
    );
    expect(migratedAgain.transApis[0].dictPromptSlug).toBe(api.dictPromptSlug);
  });

  test("links legacy inline default prompts to presets without creating custom prompts", () => {
    const migrated = migrateSettingPromptsToV2({
      prompts: [],
      transApis: [
        {
          apiSlug: "openai",
          systemPrompt: defaultSystemPrompt,
          nobatchPrompt: defaultNobatchPrompt,
          nobatchUserPrompt: defaultNobatchUserPrompt,
          subtitlePrompt: defaultSubtitlePrompt,
          dictPrompt: defaultDictPrompt,
          dictUserPrompt: defaultDictUserPrompt,
        },
      ],
    });

    expect(migrated.transApis[0]).toMatchObject({
      batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
      nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
      subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
      dictPromptSlug: DEFAULT_DICTIONARY_PROMPT_SLUG,
    });
    expect(migrated.prompts).toEqual([]);
  });

  test("resolves default ai api prompt slugs without storing prompt text", () => {
    const api = DEFAULT_API_LIST.find((item) =>
      API_SPE_TYPES.ai.has(item.apiType)
    );

    expect(api.systemPrompt).toBe("");
    expect(api.nobatchPrompt).toBe("");
    expect(api.nobatchUserPrompt).toBe("");
    expect(api.subtitlePrompt).toBe("");
    expect(api.dictPrompt).toBe("");
    expect(api.dictUserPrompt).toBe("");

    expect(resolveApiPromptSettings(api)).toMatchObject({
      batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
      nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
      subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
      dictPromptSlug: DEFAULT_DICTIONARY_PROMPT_SLUG,
      systemPrompt: defaultSystemPrompt,
      nobatchPrompt: defaultNobatchPrompt,
      nobatchUserPrompt: defaultNobatchUserPrompt,
      subtitlePrompt: defaultSubtitlePrompt,
      dictPrompt: defaultDictPrompt,
      dictUserPrompt: defaultDictUserPrompt,
    });
  });

  test("cleans api and subtitle references when a custom prompt is deleted", () => {
    const setting = {
      transApis: [
        {
          apiSlug: "openai",
          batchPromptSlug: "prompt_deleted",
          nobatchPromptSlug: "prompt_deleted",
          subtitlePromptSlug: "prompt_deleted",
          dictPromptSlug: "prompt_deleted",
          systemPrompt: "deleted batch prompt",
          nobatchPrompt: "deleted nobatch system prompt",
          nobatchUserPrompt: "deleted nobatch user prompt",
          subtitlePrompt: "deleted subtitle prompt",
          dictPrompt: "deleted dictionary prompt",
          dictUserPrompt: "deleted dictionary user prompt",
        },
      ],
      tranboxSetting: {
        aiDictPromptSlug: "prompt_deleted",
      },
      subtitleSetting: {
        segPromptMode: PROMPT_MODE_GLOBAL,
        segPromptSlug: "prompt_deleted",
      },
    };

    const cleaned = removePromptReferences(setting, "prompt_deleted");

    expect(cleaned.transApis[0]).toMatchObject({
      batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
      nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
      subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
      dictPromptSlug: DEFAULT_DICTIONARY_PROMPT_SLUG,
    });
    expect(cleaned.transApis[0]).not.toHaveProperty("systemPrompt");
    expect(cleaned.transApis[0]).not.toHaveProperty("nobatchPrompt");
    expect(cleaned.transApis[0]).not.toHaveProperty("nobatchUserPrompt");
    expect(cleaned.transApis[0]).not.toHaveProperty("subtitlePrompt");
    expect(cleaned.transApis[0]).not.toHaveProperty("dictPrompt");
    expect(cleaned.transApis[0]).not.toHaveProperty("dictUserPrompt");
    expect(cleaned.tranboxSetting).toMatchObject({
      aiDictPromptSlug: PROMPT_MODE_FOLLOW_API,
    });
    expect(cleaned.subtitleSetting).toMatchObject({
      segPromptMode: PROMPT_MODE_FOLLOW_API,
      segPromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
    });

    expect(resolveApiPromptSettings(cleaned.transApis[0])).toMatchObject({
      systemPrompt: defaultSystemPrompt,
      nobatchPrompt: defaultNobatchPrompt,
      nobatchUserPrompt: defaultNobatchUserPrompt,
      subtitlePrompt: defaultSubtitlePrompt,
      dictPrompt: defaultDictPrompt,
      dictUserPrompt: defaultDictUserPrompt,
    });
  });

  test("does not read prompt id fields as prompt references", () => {
    expect(normalizePrompt({ id: "prompt_old_id" }).slug).toBe("");

    const cleaned = removePromptReferences(
      {
        transApis: [
          {
            apiSlug: "openai",
            batchPromptId: "prompt_deleted",
            nobatchPromptId: "prompt_deleted",
            subtitlePromptId: "prompt_deleted",
            dictPromptId: "prompt_deleted",
          },
        ],
        subtitleSetting: {
          segPromptMode: PROMPT_MODE_GLOBAL,
          segPromptId: "prompt_deleted",
        },
      },
      "prompt_deleted"
    );

    expect(cleaned).toEqual({
      transApis: [
        {
          apiSlug: "openai",
          batchPromptId: "prompt_deleted",
          nobatchPromptId: "prompt_deleted",
          subtitlePromptId: "prompt_deleted",
          dictPromptId: "prompt_deleted",
        },
      ],
      subtitleSetting: {
        segPromptMode: PROMPT_MODE_GLOBAL,
        segPromptId: "prompt_deleted",
      },
    });
  });

  test("removes legacy api prompt ids before saving api settings", () => {
    const cleaned = removeLegacyApiPromptIds({
      apiSlug: "openai",
      batchPromptSlug: "prompt_current_batch",
      batchPromptId: "prompt_deleted_batch",
      nobatchPromptSlug: "prompt_current_nobatch",
      nobatchPromptId: "prompt_deleted_nobatch",
      subtitlePromptSlug: "prompt_current_subtitle",
      subtitlePromptId: "prompt_deleted_subtitle",
      dictPromptSlug: "prompt_current_dict",
      dictPromptId: "prompt_deleted_dict",
    });

    expect(cleaned).toMatchObject({
      apiSlug: "openai",
      batchPromptSlug: "prompt_current_batch",
      nobatchPromptSlug: "prompt_current_nobatch",
      subtitlePromptSlug: "prompt_current_subtitle",
      dictPromptSlug: "prompt_current_dict",
    });
    expect(cleaned).not.toHaveProperty("batchPromptId");
    expect(cleaned).not.toHaveProperty("nobatchPromptId");
    expect(cleaned).not.toHaveProperty("subtitlePromptId");
    expect(cleaned).not.toHaveProperty("dictPromptId");
  });

  test("keeps preset nameKey for i18n display but removes it from custom storage", () => {
    const preset = PRESET_PROMPTS[0];
    const i18n = jest.fn((key, fallback) => `${key}:${fallback}`);
    const normalized = normalizeCustomPrompts([
      {
        slug: "prompt_custom",
        category: "user prompt",
        nameKey: "custom_key",
        name: "Custom prompt",
        systemPrompt: "system",
        userPrompt: "user",
      },
    ]);

    expect(getPromptDisplayName(preset, i18n)).toBe(
      `${preset.nameKey}:${preset.name}`
    );
    expect(normalized[0]).toEqual({
      slug: "prompt_custom",
      category: "user prompt",
      name: "Custom prompt",
      systemPrompt: "system",
      userPrompt: "user",
    });
  });

  test("exposes dictionary prompt templates", () => {
    const dictionaryPrompts = getDictionaryPromptOptions(PRESET_PROMPTS);
    const expectedPrompts = [
      [DEFAULT_DICTIONARY_PROMPT_SLUG, defaultDictPrompt],
      [PROMPT_SLUG_DICTIONARY_EN_JA, defaultDictPromptEnJa],
      [PROMPT_SLUG_DICTIONARY_EN_KO, defaultDictPromptEnKo],
      [PROMPT_SLUG_DICTIONARY_EN_VI, defaultDictPromptEnVi],
      [PROMPT_SLUG_DICTIONARY_EN_RU, defaultDictPromptEnRu],
    ];

    expect(PROMPT_TEMPLATE_CATEGORIES).toContain(PROMPT_CATEGORY_DICTIONARY);
    expect(dictionaryPrompts).toHaveLength(expectedPrompts.length);
    expect(dictionaryPrompts.map(({ slug }) => slug)).toEqual(
      expectedPrompts.map(([slug]) => slug)
    );
    expect(new Set(dictionaryPrompts.map(({ slug }) => slug)).size).toBe(
      expectedPrompts.length
    );

    expectedPrompts.forEach(([slug, systemPrompt]) => {
      expect(dictionaryPrompts).toContainEqual(
        expect.objectContaining({
          slug,
          category: PROMPT_CATEGORY_DICTIONARY,
          systemPrompt,
          userPrompt: defaultDictUserPrompt,
        })
      );
    });
  });

  test.each([
    [
      DEFAULT_DICTIONARY_PROMPT_SLUG,
      "Chinese",
      "词条",
      "用于 Web 和原生用户界面的库",
    ],
    [
      PROMPT_SLUG_DICTIONARY_EN_JA,
      "Japanese",
      "見出し語",
      "Webおよびネイティブのユーザーインターフェース向けライブラリ",
    ],
    [
      PROMPT_SLUG_DICTIONARY_EN_KO,
      "Korean",
      "표제어",
      "웹 및 네이티브 사용자 인터페이스용 라이브러리",
    ],
    [
      PROMPT_SLUG_DICTIONARY_EN_VI,
      "Vietnamese",
      "Mục từ",
      "Thư viện dành cho giao diện người dùng web và native",
    ],
    [
      PROMPT_SLUG_DICTIONARY_EN_RU,
      "Russian",
      "Словарная статья",
      "Библиотека для веб-интерфейсов и нативных пользовательских интерфейсов",
    ],
  ])(
    "provides target-specific dictionary instructions for %s",
    (slug, targetLanguage, localizedHeading, translationExample) => {
      const prompt = PRESET_PROMPTS.find((item) => item.slug === slug);

      expect(prompt.systemPrompt).toContain(
        `expert English-${targetLanguage} lexicographer`
      );
      expect(prompt.systemPrompt).toContain(
        `only the ${targetLanguage} translation itself`
      );
      expect(prompt.systemPrompt).toContain(`## ${localizedHeading}:`);
      expect(prompt.systemPrompt).toContain(
        `Correct output: ${translationExample}`
      );
      expect(UI_LANGS.every(([lang]) => I18N[prompt.nameKey]?.[lang])).toBe(
        true
      );
    }
  );

  test("uses one English user prompt for every dictionary preset", () => {
    expect(defaultDictUserPrompt).toContain("## [Context] (Optional)");
    expect(defaultDictUserPrompt).toContain("Document title:");
    expect(defaultDictUserPrompt).toContain("## [Target] (Required)");
    expect(defaultDictUserPrompt).toContain(
      "choose between dictionary mode and pure translation mode"
    );
    expect(defaultDictUserPrompt).not.toContain("上下文");
    expect(defaultDictUserPrompt).not.toContain("目标文本");
  });
});
