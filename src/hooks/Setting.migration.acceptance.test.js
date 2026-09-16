import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SettingProvider, useSetting } from "./Setting";
import { storage } from "../libs/storage";
import { findStorageState } from "../libs/storageState";
import { refreshStorageKeys } from "../libs/storageRefresh";
import { syncData } from "../libs/sync";
import {
  CURRENT_SETTINGS_VERSION,
  GEMINI_GENERATE_CONTENT_URL,
  getSettingVersion,
  KV_SETTING_KEY,
  OPT_TRANS_GEMINI,
  STOKEY_SETTING,
  STOKEY_SYNC,
} from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/client", () => ({ isExt: false, isGm: false }));
jest.mock("../libs/browser", () => ({ isOptions: () => true }));
jest.mock("../libs/gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../libs/log", () => ({
  ...jest.requireActual("../libs/log"),
  kissLog: jest.fn(),
  logger: { setLevel: jest.fn(), error: jest.fn() },
}));
jest.mock("../libs/sync", () => ({ syncData: jest.fn() }));

const EDIT_TIME = 100000;
const INITIAL_META = { updateAt: 90000, syncAt: 90001 };
const INITIAL_SYNC = {
  syncUrl: "https://sync.example.invalid",
  syncKey: "test-token",
  syncMeta: { [KV_SETTING_KEY]: INITIAL_META },
};

function legacySetting(version, darkMode, uiLang = "en") {
  return {
    version,
    darkMode,
    uiLang,
    transApis: [
      {
        apiSlug: "legacy-gemini",
        apiType: OPT_TRANS_GEMINI,
        url: "https://generativelanguage.googleapis.com/v1beta2/interactions",
        ...((version ?? 1) === 1
          ? { systemPrompt: "Legacy batch prompt" }
          : {}),
      },
    ],
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
  });
}

async function advance(ms = 3000) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
  });
}

describe("settings normalization across the production persistence chain", () => {
  let root;
  let container;
  let settings;
  let setItem;

  function Probe() {
    settings = useSetting();
    return null;
  }

  async function mount(rawSetting) {
    // Preserve whitespace so even a same-value serialization is observable.
    window.localStorage.setItem(
      STOKEY_SETTING,
      JSON.stringify(rawSetting, null, 2)
    );
    window.localStorage.setItem(
      STOKEY_SYNC,
      JSON.stringify(INITIAL_SYNC, null, 2)
    );
    const bytes = storedBytes();
    setItem.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    // React createRoot does not wrap rendering in act.
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {
      root.render(
        <StrictMode>
          <SettingProvider context="options">
            <Probe />
          </SettingProvider>
        </StrictMode>
      );
    });
    await flush();
    return bytes;
  }

  function storedBytes() {
    return {
      setting: window.localStorage.getItem(STOKEY_SETTING),
      sync: window.localStorage.getItem(STOKEY_SYNC),
    };
  }

  function expectNormalized(darkMode, uiLang = "en") {
    expect(settings.setting).toMatchObject({
      version: CURRENT_SETTINGS_VERSION,
      darkMode,
      uiLang,
    });
    expect(settings.setting.transApis[0].url).toBe(GEMINI_GENERATE_CONTENT_URL);
  }

  function expectReadOnly(bytes) {
    expect(storedBytes()).toEqual(bytes);
    expect(setItem).not.toHaveBeenCalled();
    expect(findStorageState(STOKEY_SETTING).dirty).toBe(false);
    expect(findStorageState(STOKEY_SETTING).editVersion).toBe(0);
    expect(syncData).not.toHaveBeenCalled();
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(EDIT_TIME);
    window.localStorage.clear();
    setItem = jest.spyOn(Storage.prototype, "setItem");
    syncData.mockReset();
    syncData.mockImplementation(async (_key, value) => ({
      isNew: false,
      value,
      commit: async ({ applyValue, isCurrent }) => {
        if (!isCurrent()) return false;
        return storage.withTransaction(async (transaction) => {
          if (!isCurrent()) return false;
          await applyValue(transaction);
          await transaction.updateSyncState((current) => ({
            ...current,
            syncMeta: {
              ...current.syncMeta,
              [KV_SETTING_KEY]: {
                ...current.syncMeta[KV_SETTING_KEY],
                syncAt: Date.now(),
              },
            },
          }));
          return true;
        });
      },
    }));
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
      await findStorageState(STOKEY_SETTING)?.remove();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    settings = undefined;
    await flush();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test.each([
    [1, true, "dark"],
    [2, false, "light"],
    [1, "light", "light"],
    [2, "dark", "dark"],
    [2, "auto", "auto"],
  ])(
    "reads schema %s with theme %s as %s without persisting a migration",
    async (version, theme, expectedTheme) => {
      const bytes = await mount(legacySetting(version, theme));

      expectNormalized(expectedTheme);
      expect(settings.setting.transApis[0]).not.toHaveProperty("systemPrompt");
      const expectedPromptTexts = version === 1 ? ["Legacy batch prompt"] : [];
      expect(
        settings.setting.prompts.map((prompt) => prompt.systemPrompt)
      ).toEqual(expect.arrayContaining(expectedPromptTexts));
      expectReadOnly(bytes);
      await advance();
      expectReadOnly(bytes);
    }
  );

  test.each([
    [1, true, "dark"],
    [2, false, "light"],
  ])(
    "normalizes a schema %s remote backfill with theme %s and explicit reload",
    async (version, theme, expectedTheme) => {
      await mount(legacySetting(2, "auto"));
      const incoming = legacySetting(version, theme, "remote");
      await act(async () => {
        await storage.withTransaction(async (transaction) => {
          await transaction.setObj(STOKEY_SETTING, incoming);
          await transaction.setObj(STOKEY_SYNC, {
            ...INITIAL_SYNC,
            syncMeta: {
              [KV_SETTING_KEY]: { updateAt: 95000, syncAt: 95001 },
            },
          });
        });
      });
      await flush();
      expect(setItem).toHaveBeenCalledTimes(2);
      const bytes = storedBytes();
      setItem.mockClear();

      expectNormalized(expectedTheme, "remote");
      expectReadOnly(bytes);
      await act(async () => {
        await settings.reloadSetting();
        await refreshStorageKeys([STOKEY_SETTING]);
      });
      await advance();
      expectNormalized(expectedTheme, "remote");
      expectReadOnly(bytes);
    }
  );

  test.each([undefined, 1, 2])(
    "persists an imported schema %s backup as one normalized user edit",
    async (version) => {
      await mount(legacySetting(2, "auto"));
      const imported = legacySetting(version, true, "imported");
      let receipt;
      await act(async () => {
        const parsed = JSON.parse(JSON.stringify(imported));
        receipt = await settings.updateSetting({
          ...parsed,
          version: getSettingVersion(parsed),
        });
      });
      await flush();

      expectNormalized("dark", "imported");
      const importedPrompt = settings.setting.prompts.find(
        (prompt) =>
          prompt.slug === settings.setting.transApis[0].batchPromptSlug
      );
      expect(importedPrompt?.systemPrompt).toBe(
        (version ?? 1) === 1 ? "Legacy batch prompt" : undefined
      );
      expect(settings.setting.transApis[0]).not.toHaveProperty("systemPrompt");
      expect(await storage.getObj(STOKEY_SETTING)).toEqual(settings.setting);
      expect(receipt.changed).toBe(true);
      expect(receipt.updateAt).toBe(EDIT_TIME);
      expect(findStorageState(STOKEY_SETTING).committedEditVersion).toBe(1);
      expect(
        (await storage.getObj(STOKEY_SYNC)).syncMeta[KV_SETTING_KEY]
      ).toEqual({
        updateAt: EDIT_TIME,
        syncAt: INITIAL_META.syncAt,
      });
      expect(imported.version).toBe(version);
      expect(imported.darkMode).toBe(true);
      await advance();
      expect(syncData).toHaveBeenCalledTimes(1);
      expect(syncData).toHaveBeenCalledWith(
        KV_SETTING_KEY,
        settings.setting,
        expect.objectContaining({ deferCommit: true })
      );
      await advance();
      expect(syncData).toHaveBeenCalledTimes(1);
    }
  );

  test.each(["patch", "reducer"])(
    "persists a real %s against the latest normalized settings inside the lock",
    async (kind) => {
      await mount(legacySetting(1, true));
      const entered = deferred();
      const release = deferred();
      const remoteWrite = storage.withTransaction(async (transaction) => {
        entered.resolve();
        await release.promise;
        await transaction.setObj(
          STOKEY_SETTING,
          legacySetting(2, false, "remote")
        );
        await transaction.setObj(STOKEY_SYNC, {
          ...INITIAL_SYNC,
          syncMeta: {
            [KV_SETTING_KEY]: { updateAt: 95000, syncAt: 95001 },
          },
        });
      });
      await entered.promise;
      const reducer = jest.fn((current) => ({
        uiLang: `${current.uiLang}-${current.darkMode}`,
      }));
      let pending;
      let receipt;
      try {
        await act(async () => {
          pending = settings.updateSetting(
            kind === "patch" ? { uiLang: "user" } : reducer
          );
        });
      } finally {
        await act(async () => {
          release.resolve();
          await remoteWrite;
          receipt = await pending;
        });
      }
      await flush();

      const expectedLanguage = kind === "patch" ? "user" : "remote-light";
      expectNormalized("light", expectedLanguage);
      expect(await storage.getObj(STOKEY_SETTING)).toEqual(settings.setting);
      expect(receipt.changed).toBe(true);
      expect(receipt.updateAt).toBe(EDIT_TIME);
      expect(
        (await storage.getObj(STOKEY_SYNC)).syncMeta[KV_SETTING_KEY]
      ).toEqual({ updateAt: EDIT_TIME, syncAt: 95001 });
      const receivedLatestNormalizedSetting = reducer.mock.calls.some(
        ([current]) =>
          current.version === CURRENT_SETTINGS_VERSION &&
          current.darkMode === "light" &&
          current.uiLang === "remote"
      );
      expect(receivedLatestNormalizedSetting).toBe(kind === "reducer");
      expect(findStorageState(STOKEY_SETTING).dirty).toBe(true);
      expect(syncData).not.toHaveBeenCalled();
      await advance(2999);
      expect(syncData).not.toHaveBeenCalled();
      await advance(1);
      expect(syncData).toHaveBeenCalledTimes(1);
      expect(syncData).toHaveBeenCalledWith(
        KV_SETTING_KEY,
        settings.setting,
        expect.objectContaining({ deferCommit: true })
      );
      expect(findStorageState(STOKEY_SETTING).dirty).toBe(false);
    }
  );

  test.each(["patch", "legacy patch", "reducer"])(
    "keeps a normalized %s no-op free of writes and uploads",
    async (kind) => {
      const bytes = await mount(legacySetting(1, true));
      let receipt;
      await act(async () => {
        receipt = await settings.updateSetting(
          kind === "reducer"
            ? (current) => ({ darkMode: current.darkMode })
            : { darkMode: kind === "legacy patch" ? true : "dark" }
        );
      });
      await flush();
      await advance();

      expect(receipt.changed).toBe(false);
      expectNormalized("dark");
      expect(storedBytes()).toEqual(bytes);
      expect(setItem).not.toHaveBeenCalled();
      expect(findStorageState(STOKEY_SETTING).dirty).toBe(false);
      expect(findStorageState(STOKEY_SETTING).committedEditVersion).toBe(0);
      expect(syncData).not.toHaveBeenCalled();
    }
  );
});
