import { createClient } from "webdav";
import { storage, putSync, getSync } from "./storage";
import { getStorageState } from "./storageState";
import { trySyncWords } from "./sync";
import {
  STOKEY_WORDS,
  STOKEY_SYNC,
  KV_WORDS_KEY,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";

jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ isOptions: () => true }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./fetch", () => ({ fetchPatcher: jest.fn(), fetchGM: jest.fn() }));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: () => ({ patch: jest.fn() }),
}));
jest.mock("../apis", () => ({ apiSyncData: jest.fn() }));
jest.mock("./syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));

test("a previous destination's attempt cannot change the new destination's first-sync policy", async () => {
  localStorage.clear();
  jest.useFakeTimers();
  jest.setSystemTime(100);
  await storage.setObj(STOKEY_WORDS, { initial: {} });
  await storage.setObj(STOKEY_SYNC, {
    syncType: OPT_SYNCTYPE_WEBDAV,
    syncUrl: "https://first.example.invalid",
    syncUser: "review-user",
    syncKey: "review-token",
    syncEncryptKey: "review-passphrase",
    syncMeta: { [KV_WORDS_KEY]: { updateAt: 20, syncAt: 0 } },
  });
  const state = getStorageState(STOKEY_WORDS, {});
  state.configureSync(KV_WORDS_KEY);
  const unsubscribe = state.subscribe(() => {});
  try {
    await state.ensureLoaded();
    const oldClient = {
      exists: jest.fn(async () => true),
      getFileContents: jest.fn(async () => {
        throw new Error("First destination offline");
      }),
      putFileContents: jest.fn(async () => {}),
    };
    createClient.mockReturnValue(oldClient);
    await trySyncWords();
    expect(oldClient.getFileContents).toHaveBeenCalledTimes(1);
    expect((await getSync()).syncMeta[KV_WORDS_KEY].firstAttemptAt).toBe(100);
    await putSync({ syncUrl: "https://second.example.invalid" });
    expect((await getSync()).syncMeta).toEqual({});
    await state.save({ newEdit: {} });
    let remote = {
      key: KV_WORDS_KEY,
      value: `cipher:${JSON.stringify({ cloud: {} })}`,
      updateAt: 50,
    };
    const client = {
      exists: jest.fn(async () => true),
      getFileContents: jest.fn(async () => JSON.stringify(remote)),
      putFileContents: jest.fn(async (_path, content) => {
        remote = JSON.parse(content);
      }),
    };
    createClient.mockReturnValue(client);
    await trySyncWords();
    expect(client.putFileContents).not.toHaveBeenCalled();
    expect(await storage.getObj(STOKEY_WORDS)).toEqual({ cloud: {} });
  } finally {
    state.cancelSync();
    unsubscribe();
    jest.useRealTimers();
  }
});
