import { DEFAULT_API_TYPE } from "./api";
import { normalizeCEFRSetting, normalizeSetting } from "./setting";

describe("normalizeCEFRSetting", () => {
  test("fills missing nested CEFR fields", () => {
    expect(
      normalizeCEFRSetting({
        enabled: true,
        level: 2,
      })
    ).toEqual({
      enabled: true,
      level: 2,
      assessmentCompleted: false,
      levelSource: "unset",
      lastPromptFrom: "",
    });
  });

  test("preserves completed assessment metadata", () => {
    expect(
      normalizeCEFRSetting({
        enabled: true,
        level: 4,
        assessmentCompleted: true,
        levelSource: "quiz",
        lastPromptFrom: "install",
      })
    ).toEqual({
      enabled: true,
      level: 4,
      assessmentCompleted: true,
      levelSource: "quiz",
      lastPromptFrom: "install",
    });
  });
});

describe("normalizeSetting", () => {
  test("defaults uiLang to zh for new settings", () => {
    expect(normalizeSetting({}).uiLang).toBe("zh");
  });

  test("preserves an existing uiLang choice", () => {
    expect(normalizeSetting({ uiLang: "en" }).uiLang).toBe("en");
  });

  test("adds default CEFR settings when missing", () => {
    expect(normalizeSetting({ darkMode: "light" })).toMatchObject({
      darkMode: "light",
      defaultApiSlug: DEFAULT_API_TYPE,
      cefrSetting: {
        enabled: false,
        level: 0,
        assessmentCompleted: false,
        levelSource: "unset",
        lastPromptFrom: "",
      },
    });
  });

  test("keeps existing completed CEFR metadata", () => {
    expect(
      normalizeSetting({
        defaultApiSlug: "OpenAI",
        cefrSetting: {
          enabled: true,
          level: 5,
          assessmentCompleted: true,
          levelSource: "manual",
          lastPromptFrom: "settings",
        },
      })
    ).toMatchObject({
      defaultApiSlug: "OpenAI",
      cefrSetting: {
        enabled: true,
        level: 5,
        assessmentCompleted: true,
        levelSource: "manual",
        lastPromptFrom: "settings",
      },
    });
  });

  test("falls back when defaultApiSlug points to a disabled api", () => {
    expect(
      normalizeSetting({
        defaultApiSlug: "OpenAI",
        transApis: [
          { apiSlug: "Microsoft", isDisabled: false },
          { apiSlug: "OpenAI", isDisabled: true },
        ],
      }).defaultApiSlug
    ).toBe(DEFAULT_API_TYPE);
  });
});
