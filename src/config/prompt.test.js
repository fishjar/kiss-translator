import {
  DEFAULT_BATCH_PROMPT_SLUG,
  DEFAULT_NOBATCH_PROMPT_SLUG,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  PRESET_PROMPTS,
  PROMPT_CATEGORY_DICTIONARY,
  PROMPT_MODE_FOLLOW_API,
  PROMPT_MODE_GLOBAL,
  PROMPT_TEMPLATE_CATEGORIES,
  SETTINGS_VERSION_V2,
  getPromptDisplayName,
  migrateSettingPromptsToV2,
  normalizeCustomPrompts,
  normalizePrompt,
  removeLegacyApiPromptIds,
  removePromptReferences,
} from "./prompt";
import {
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultSubtitlePrompt,
  defaultSystemPrompt,
} from "./api";

describe("prompt settings", () => {
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
        },
      ],
    };

    const migrated = migrateSettingPromptsToV2(setting);
    const api = migrated.transApis[0];

    expect(migrated.version).toBe(SETTINGS_VERSION_V2);
    expect(api.batchPromptSlug).toMatch(/^prompt_migrated_batch_/);
    expect(api.nobatchPromptSlug).toMatch(/^prompt_migrated_nobatch_/);
    expect(api.subtitlePromptSlug).toMatch(/^prompt_migrated_subtitle_/);
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
      ])
    );
    expect(migrated.prompts).toHaveLength(3);

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
        },
      ],
    });

    expect(migrated.transApis[0]).toMatchObject({
      batchPromptSlug: DEFAULT_BATCH_PROMPT_SLUG,
      nobatchPromptSlug: DEFAULT_NOBATCH_PROMPT_SLUG,
      subtitlePromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
    });
    expect(migrated.prompts).toEqual([]);
  });

  test("cleans api and subtitle references when a custom prompt is deleted", () => {
    const setting = {
      transApis: [
        {
          apiSlug: "openai",
          batchPromptSlug: "prompt_deleted",
          nobatchPromptSlug: "prompt_deleted",
          subtitlePromptSlug: "prompt_deleted",
          systemPrompt: "deleted batch prompt",
          nobatchPrompt: "deleted nobatch system prompt",
          nobatchUserPrompt: "deleted nobatch user prompt",
          subtitlePrompt: "deleted subtitle prompt",
        },
      ],
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
      systemPrompt: defaultSystemPrompt,
      nobatchPrompt: defaultNobatchPrompt,
      nobatchUserPrompt: defaultNobatchUserPrompt,
      subtitlePrompt: defaultSubtitlePrompt,
    });
    expect(cleaned.subtitleSetting).toMatchObject({
      segPromptMode: PROMPT_MODE_FOLLOW_API,
      segPromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
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
    });

    expect(cleaned).toMatchObject({
      apiSlug: "openai",
      batchPromptSlug: "prompt_current_batch",
      nobatchPromptSlug: "prompt_current_nobatch",
      subtitlePromptSlug: "prompt_current_subtitle",
    });
    expect(cleaned).not.toHaveProperty("batchPromptId");
    expect(cleaned).not.toHaveProperty("nobatchPromptId");
    expect(cleaned).not.toHaveProperty("subtitlePromptId");
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

  test("does not expose dictionary prompt templates", () => {
    expect(PROMPT_TEMPLATE_CATEGORIES).not.toContain(
      PROMPT_CATEGORY_DICTIONARY
    );
    expect(PRESET_PROMPTS).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: PROMPT_CATEGORY_DICTIONARY }),
      ])
    );
  });
});
