import { act } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "webdav";
import { SettingProvider, useSetting } from "./Setting";
import { useDarkMode } from "./ColorMode";
import { useSync } from "./Sync";
import { useFavWords } from "./FavWords";
import { useRules } from "./Rules";
import {
  storage,
  getSettingWithDefault,
  getSyncWithDefault,
  updateSyncState,
} from "../libs/storage";
import { syncSettingAndRules, trySyncWords } from "../libs/sync";
import { findStorageState } from "../libs/storageState";
import {
  STOKEY_SETTING,
  STOKEY_RULES,
  STOKEY_WORDS,
  STOKEY_SYNC,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_WORDS_KEY,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/client", () => ({ isExt: false, isGm: false }));
jest.mock("../libs/browser", () => ({ isOptions: () => true }));
jest.mock("../libs/log", () => ({
  ...jest.requireActual("../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("../libs/fetch", () => ({
  fetchPatcher: jest.fn(),
  fetchGM: jest.fn(),
}));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: () => ({ patch: jest.fn() }),
}));
jest.mock("../apis", () => ({ apiSyncData: jest.fn() }));
jest.mock("../libs/syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));

const INITIAL_WORDS = { initial: { createdAt: 1 } };
const INITIAL_RULES = [
  { pattern: "example.com", enabled: true },
  { pattern: "*" },
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function packet(key, value, updateAt = 90000) {
  return { key, value: `cipher:${JSON.stringify(value)}`, updateAt };
}

function packetValue(value) {
  return JSON.parse(value.value.slice(7));
}

function makeRemote(packets) {
  return {
    exists: jest.fn(async () => true),
    getFileContents: jest.fn(async (path) =>
      JSON.stringify(packets[path.split("/").pop()])
    ),
    putFileContents: jest.fn(async (_path, content) => {
      const value = JSON.parse(content);
      packets[value.key] = value;
    }),
  };
}

async function flush() {
  await act(async () => {
    for (let step = 0; step < 80; step += 1) await Promise.resolve();
  });
}

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let step = 0; step < 80; step += 1) await Promise.resolve();
  });
}

describe("synchronization regression scenarios", () => {
  let root;
  let container;
  let settingHook;
  let colorHook;
  let syncHook;
  let wordsHook;
  let rulesHook;
  let initialSetting;
  let packets;
  let remote;

  function WordsRoute() {
    wordsHook = useFavWords();
    return null;
  }

  function RulesRoute() {
    rulesHook = useRules();
    return null;
  }

  function Host({ showWords = true }) {
    settingHook = useSetting();
    colorHook = useDarkMode();
    syncHook = useSync();
    return (
      <>
        {showWords && <WordsRoute />}
        <RulesRoute />
      </>
    );
  }

  async function render(showWords = true) {
    await act(async () => {
      root.render(
        <SettingProvider context="options">
          <Host showWords={showWords} />
        </SettingProvider>
      );
    });
    await flush();
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(100000);
    window.localStorage.clear();
    createClient.mockReset();
    initialSetting = {
      ...(await getSettingWithDefault()),
      darkMode: "auto",
      injectRules: false,
    };
    await storage.setObj(STOKEY_SETTING, initialSetting);
    await storage.setObj(STOKEY_RULES, INITIAL_RULES);
    await storage.setObj(STOKEY_WORDS, INITIAL_WORDS);
    await storage.setObj(STOKEY_SYNC, {
      syncType: OPT_SYNCTYPE_WEBDAV,
      syncUrl: "https://sync.example.invalid",
      syncUser: "test-user",
      syncKey: "test-token",
      syncEncryptKey: "test-passphrase",
      syncMeta: Object.fromEntries(
        [KV_SETTING_KEY, KV_RULES_KEY, KV_WORDS_KEY].map((key) => [
          key,
          { updateAt: 90000, syncAt: 90001 },
        ])
      ),
    });
    packets = {
      [KV_SETTING_KEY]: packet(KV_SETTING_KEY, initialSetting),
      [KV_RULES_KEY]: packet(KV_RULES_KEY, INITIAL_RULES),
      [KV_WORDS_KEY]: packet(KV_WORDS_KEY, INITIAL_WORDS),
    };
    remote = makeRemote(packets);
    createClient.mockReturnValue(remote);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await render();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    act(() => root.unmount());
    await flush();
    for (const key of [
      STOKEY_WORDS,
      STOKEY_RULES,
      STOKEY_SETTING,
      STOKEY_SYNC,
    ]) {
      await findStorageState(key)?.remove();
    }
    await flush();
    container.remove();
    jest.useRealTimers();
  });

  test("uploads a saved word after leaving and returning to its route", async () => {
    await act(async () => wordsHook.toggleFav("saved"));
    await flush();
    const expected = await storage.getObj(STOKEY_WORDS);
    await render(false);
    await advance(6000);
    await render(true);
    await advance(6000);

    expect(wordsHook.favWords).toEqual(expected);
    expect(packetValue(packets[KV_WORDS_KEY])).toEqual(expected);
  });

  test("uploads a theme edit when manual sync immediately follows it", async () => {
    await act(async () => colorHook.toggleDarkMode());
    await flush();
    expect(colorHook.darkMode).toBe("light");

    // Match the Sync page's manual action without waiting for its metadata timer.
    await act(async () => {
      await syncSettingAndRules();
      await settingHook.reloadSetting();
    });
    await advance(300);
    await advance(3000);

    expect((await storage.getObj(STOKEY_SETTING)).darkMode).toBe("light");
    expect(colorHook.darkMode).toBe("light");
    expect(packetValue(packets[KV_SETTING_KEY]).darkMode).toBe("light");
  });

  test("retains the automatic retry after a manual metadata commit rolls back", async () => {
    const remoteSetting = { ...initialSetting, darkMode: "dark" };
    packets[KV_SETTING_KEY] = packet(KV_SETTING_KEY, remoteSetting, 101000);
    await act(async () => colorHook.toggleDarkMode());
    await advance(300);
    const localValue = await storage.getObj(STOKEY_SETTING);
    const localMeta = (await getSyncWithDefault()).syncMeta[KV_SETTING_KEY];
    const setItem = window.Storage.prototype.setItem;
    let failMetadata = true;
    jest
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (
          key === STOKEY_SYNC &&
          JSON.parse(value).syncMeta[KV_SETTING_KEY].updateAt === 101000 &&
          failMetadata
        ) {
          failMetadata = false;
          throw new Error("Transient metadata persistence failure");
        }
        return setItem.call(this, key, value);
      });

    await act(async () => {
      // A failed Sync page action intentionally skips reloadSetting.
      await expect(syncSettingAndRules()).rejects.toThrow(
        "Transient metadata persistence failure"
      );
    });
    await flush();
    expect(await storage.getObj(STOKEY_SETTING)).toEqual(localValue);
    expect(settingHook.setting).toEqual(localValue);
    expect((await getSyncWithDefault()).syncMeta[KV_SETTING_KEY]).toEqual(
      localMeta
    );
    await advance(3000);

    expect(await storage.getObj(STOKEY_SETTING)).toEqual(remoteSetting);
    expect(settingHook.setting).toEqual(remoteSetting);
  });

  test("retains edits made while the first synchronization request fails", async () => {
    await act(async () => {
      await updateSyncState((current) => ({
        ...current,
        syncMeta: {
          ...current.syncMeta,
          [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 0 },
        },
      }));
    });
    packets[KV_WORDS_KEY] = packet(
      KV_WORDS_KEY,
      { remote: { createdAt: 100500 } },
      100500
    );
    const blocked = deferred();
    remote.getFileContents.mockImplementationOnce(() => blocked.promise);
    await act(async () => wordsHook.toggleFav("first"));
    await advance(300);
    await advance(2700);
    expect(remote.getFileContents).toHaveBeenCalledTimes(1);
    await act(async () => wordsHook.toggleFav("second"));
    await advance(300);
    const expected = await storage.getObj(STOKEY_WORDS);
    expect(Object.keys(expected).sort()).toEqual([
      "first",
      "initial",
      "second",
    ]);

    await act(async () =>
      blocked.reject(new Error("Temporary remote failure"))
    );
    await flush();
    await advance(3000);
    await advance(3000);

    expect(await storage.getObj(STOKEY_WORDS)).toEqual(expected);
    expect(wordsHook.favWords).toEqual(expected);
    expect(packetValue(packets[KV_WORDS_KEY])).toEqual(expected);
  });

  test.each([90000, 95000])(
    "uploads setting and rule edits made 100 ms apart (remote setting time %i)",
    async (remoteSettingTime) => {
      packets[KV_SETTING_KEY].updateAt = remoteSettingTime;
      await act(async () => settingHook.updateSetting({ injectRules: true }));
      await advance(100);
      await act(async () => rulesHook.put("example.com", { enabled: false }));
      await advance(300);
      await advance(2600);
      await advance(100);
      await advance(3100);

      expect((await storage.getObj(STOKEY_SETTING)).injectRules).toBe(true);
      expect(settingHook.setting.injectRules).toBe(true);
      expect(packetValue(packets[KV_SETTING_KEY]).injectRules).toBe(true);
      expect(packetValue(packets[KV_RULES_KEY])[0].enabled).toBe(false);
    }
  );

  test("discards a reply from a destination that the user has replaced", async () => {
    packets[KV_WORDS_KEY] = packet(
      KV_WORDS_KEY,
      { obsolete: { createdAt: 100500 } },
      100500
    );
    const blocked = deferred();
    remote.getFileContents.mockImplementationOnce(() => blocked.promise);
    const alternateUrl = "https://alternate-sync.example.invalid";
    const alternateWords = { alternate: { createdAt: 100400 } };
    const alternatePackets = {
      [KV_WORDS_KEY]: packet(KV_WORDS_KEY, alternateWords, 100400),
    };
    const alternateRemote = makeRemote(alternatePackets);
    createClient.mockImplementation((url) =>
      url === alternateUrl ? alternateRemote : remote
    );
    const first = trySyncWords();
    await flush();
    expect(remote.getFileContents).toHaveBeenCalledTimes(1);
    await act(async () => syncHook.updateSync({ syncUrl: alternateUrl }));
    await act(async () => {
      blocked.resolve(JSON.stringify(packets[KV_WORDS_KEY]));
      await first;
    });
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(INITIAL_WORDS);

    await act(async () => trySyncWords());
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(alternateWords);
    expect(packetValue(alternatePackets[KV_WORDS_KEY])).toEqual(alternateWords);
    expect(alternateRemote.putFileContents).not.toHaveBeenCalled();
  });
});
