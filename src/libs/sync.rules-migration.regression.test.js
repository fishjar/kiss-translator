import { createClient } from "webdav";
import {
  KV_RULES_KEY,
  OPT_SYNCTYPE_WEBDAV,
  STOKEY_RULES,
  STOKEY_SYNC,
} from "../config";
import { runDataMigration, storage } from "./storage";
import { trySyncRules } from "./sync";

jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ isOptions: () => true }));
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

test("migration never uploads an old snapshot over newer cloud rules", async () => {
  localStorage.clear();
  const clock = jest.spyOn(Date, "now").mockReturnValue(1000);
  const remoteRules = [
    { pattern: "*", ignoreSelector: ".cloud-choice" },
    { pattern: "example.com", selector: ".new-cloud-selector" },
  ];
  const upload = jest.fn(async () => {});
  createClient.mockReturnValue({
    exists: jest.fn(async () => true),
    getFileContents: jest.fn(async () =>
      JSON.stringify({
        key: KV_RULES_KEY,
        updateAt: 200,
        value: `cipher:${JSON.stringify(remoteRules)}`,
      })
    ),
    putFileContents: upload,
  });
  try {
    await storage.setObj(STOKEY_RULES, [
      { pattern: "*", ignoreSelector: ".old-local-choice" },
      { pattern: "example.com", selector: ".old-local-selector" },
    ]);
    await storage.setObj(STOKEY_SYNC, {
      syncType: OPT_SYNCTYPE_WEBDAV,
      syncUrl: "https://sync.example.invalid",
      syncUser: "user",
      syncKey: "token",
      syncEncryptKey: "passphrase",
      syncMeta: { [KV_RULES_KEY]: { updateAt: 100, syncAt: 100 } },
    });
    expect(await runDataMigration()).toBe(true);
    await trySyncRules();
    expect(upload).not.toHaveBeenCalled();
    expect(await storage.getObj(STOKEY_RULES)).toEqual(remoteRules);
    expect(
      (await storage.getObj(STOKEY_SYNC)).syncMeta[KV_RULES_KEY].updateAt
    ).toBe(200);
    await runDataMigration();
    expect(await storage.getObj(STOKEY_RULES)).toEqual(remoteRules);
  } finally {
    clock.mockRestore();
    localStorage.clear();
  }
});
