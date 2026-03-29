import { STOKEY_SETTING } from "../config";
import { getSettingWithDefault } from "./storage";

describe("getSettingWithDefault", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("backfills missing CEFR nested fields and persists normalized settings", async () => {
    const legacySetting = {
      darkMode: "light",
      cefrSetting: {
        enabled: true,
        level: 2,
      },
    };

    window.localStorage.setItem(STOKEY_SETTING, JSON.stringify(legacySetting));

    const setting = await getSettingWithDefault();

    expect(setting.cefrSetting).toEqual({
      enabled: true,
      level: 2,
      assessmentCompleted: false,
      levelSource: "unset",
      lastPromptFrom: "",
    });

    const persisted = JSON.parse(window.localStorage.getItem(STOKEY_SETTING));
    expect(persisted.cefrSetting).toEqual({
      enabled: true,
      level: 2,
      assessmentCompleted: false,
      levelSource: "unset",
      lastPromptFrom: "",
    });
  });
});
