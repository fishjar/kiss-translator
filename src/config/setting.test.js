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
  test("adds default CEFR settings when missing", () => {
    expect(normalizeSetting({ darkMode: "light" })).toMatchObject({
      darkMode: "light",
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
        cefrSetting: {
          enabled: true,
          level: 5,
          assessmentCompleted: true,
          levelSource: "manual",
          lastPromptFrom: "settings",
        },
      })
    ).toMatchObject({
      cefrSetting: {
        enabled: true,
        level: 5,
        assessmentCompleted: true,
        levelSource: "manual",
        lastPromptFrom: "settings",
      },
    });
  });
});
