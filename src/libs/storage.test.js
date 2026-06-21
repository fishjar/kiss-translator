import {
  STOKEY_SETTING,
  STOKEY_SETTING_BACKUP_V1_BEFORE_V2,
  SETTINGS_VERSION_V2,
} from "../config";
import { getSettingWithDefault, runDataMigration } from "./storage";

const readStoredJson = (key) => JSON.parse(window.localStorage.getItem(key));

function loadGmStorageModule() {
  let storageModule;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({
      isExt: false,
      isGm: true,
    }));
    storageModule = require("./storage");
  });
  jest.dontMock("./client");
  return storageModule;
}

describe("settings storage migration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.KISS_GM;
    delete globalThis.GM;
  });

  test("runDataMigration backs up raw v1 settings and stores v2 with prompt slugs", async () => {
    const oldSetting = {
      uiLang: "zh-CN",
      transApis: [
        {
          apiSlug: "openai",
          apiName: "OpenAI",
          systemPrompt: "custom batch prompt",
        },
      ],
    };
    window.localStorage.setItem(STOKEY_SETTING, JSON.stringify(oldSetting));

    await runDataMigration();

    const backup = readStoredJson(STOKEY_SETTING_BACKUP_V1_BEFORE_V2);
    const stored = readStoredJson(STOKEY_SETTING);

    expect(backup).toEqual(oldSetting);
    expect(stored.version).toBe(SETTINGS_VERSION_V2);
    expect(stored.transApis[0].batchPromptSlug).toMatch(
      /^prompt_migrated_batch_/
    );
    expect(stored.transApis[0]).not.toHaveProperty("systemPrompt");
  });

  test("getSettingWithDefault returns migrated v2 settings for stored v1 data", async () => {
    const oldSetting = {
      uiLang: "zh",
      transApis: [
        {
          apiSlug: "openai",
          apiName: "OpenAI",
          systemPrompt: "custom batch prompt",
        },
      ],
    };
    window.localStorage.setItem(STOKEY_SETTING, JSON.stringify(oldSetting));

    const setting = await getSettingWithDefault();

    expect(setting.version).toBe(SETTINGS_VERSION_V2);
    expect(setting.transApis[0].batchPromptSlug).toMatch(
      /^prompt_migrated_batch_/
    );
    expect(setting.transApis[0]).not.toHaveProperty("systemPrompt");
  });

  test("GM storage reports a clear error when GM APIs are unavailable", async () => {
    const { storage } = loadGmStorageModule();

    await expect(storage.get("missing-gm")).rejects.toThrow(
      "GM storage API is not available"
    );
  });

  test("GM storage uses KISS_GM when it is available", async () => {
    const stored = new Map();
    window.KISS_GM = {
      setValue: jest.fn(async (key, value) => stored.set(key, value)),
      getValue: jest.fn(async (key) => stored.get(key)),
      deleteValue: jest.fn(async (key) => stored.delete(key)),
    };
    const { storage } = loadGmStorageModule();

    await storage.setObj("gm-key", { local: true });
    await expect(storage.getObj("gm-key")).resolves.toEqual({ local: true });
    await storage.del("gm-key");

    expect(window.KISS_GM.setValue).toHaveBeenCalledWith(
      "gm-key",
      JSON.stringify({ local: true })
    );
    expect(window.KISS_GM.getValue).toHaveBeenCalledWith("gm-key");
    expect(window.KISS_GM.deleteValue).toHaveBeenCalledWith("gm-key");
    expect(stored.has("gm-key")).toBe(false);
  });
});
