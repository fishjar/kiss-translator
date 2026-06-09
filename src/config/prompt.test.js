import {
  DEFAULT_BATCH_PROMPT_SLUG,
  DEFAULT_NOBATCH_PROMPT_SLUG,
  DEFAULT_SUBTITLE_PROMPT_SLUG,
  PROMPT_MODE_FOLLOW_API,
  PROMPT_MODE_GLOBAL,
  removePromptReferences,
  resolveApiPromptSettings,
} from "./prompt";
import {
  defaultNobatchPrompt,
  defaultNobatchUserPrompt,
  defaultSubtitlePrompt,
  defaultSystemPrompt,
} from "./api";

describe("prompt settings", () => {
  test("falls back to preset prompts when saved prompt slugs are missing", () => {
    const resolved = resolveApiPromptSettings(
      {
        apiSlug: "openai",
        batchPromptSlug: "prompt_deleted",
        nobatchPromptSlug: "prompt_deleted",
        subtitlePromptSlug: "prompt_deleted",
        systemPrompt: "stale batch prompt",
        nobatchPrompt: "stale nobatch system prompt",
        nobatchUserPrompt: "stale nobatch user prompt",
        subtitlePrompt: "stale subtitle prompt",
      },
      []
    );

    expect(resolved.batchPromptSlug).toBe(DEFAULT_BATCH_PROMPT_SLUG);
    expect(resolved.nobatchPromptSlug).toBe(DEFAULT_NOBATCH_PROMPT_SLUG);
    expect(resolved.subtitlePromptSlug).toBe(DEFAULT_SUBTITLE_PROMPT_SLUG);
    expect(resolved.systemPrompt).toBe(defaultSystemPrompt);
    expect(resolved.nobatchPrompt).toBe(defaultNobatchPrompt);
    expect(resolved.nobatchUserPrompt).toBe(defaultNobatchUserPrompt);
    expect(resolved.subtitlePrompt).toBe(defaultSubtitlePrompt);
  });

  test("cleans api and subtitle references when a custom prompt is deleted", () => {
    const setting = {
      transApis: [
        {
          apiSlug: "openai",
          batchPromptSlug: "prompt_deleted",
          nobatchPromptId: "prompt_deleted",
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
        segPromptId: "prompt_deleted",
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
    expect(cleaned.transApis[0]).not.toHaveProperty("nobatchPromptId");
    expect(cleaned.subtitleSetting).toMatchObject({
      segPromptMode: PROMPT_MODE_FOLLOW_API,
      segPromptSlug: DEFAULT_SUBTITLE_PROMPT_SLUG,
    });
    expect(cleaned.subtitleSetting).not.toHaveProperty("segPromptId");
  });
});
