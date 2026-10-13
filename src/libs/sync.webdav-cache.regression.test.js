import { createClient } from "webdav";
import { fetchPatcher } from "./fetch";
import { syncData } from "./sync";
import { KV_WORDS_KEY, OPT_SYNCTYPE_WEBDAV } from "../config";

jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ isOptions: () => true }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./fetch", () => ({ fetchPatcher: jest.fn(), fetchGM: jest.fn() }));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: jest.fn(),
}));
jest.mock("../apis", () => ({ apiSyncData: jest.fn() }));
jest.mock("./syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));

test("webdav requests bypass the browser HTTP cache so a stale copy is never decrypted", async () => {
  const patch = jest.fn();
  require("webdav").getPatcher.mockReturnValue({ patch });
  createClient.mockReturnValue({
    exists: jest.fn(async () => true),
    getFileContents: jest.fn(async () =>
      JSON.stringify({ key: KV_WORDS_KEY, value: "cipher:{}", updateAt: 999 })
    ),
    putFileContents: jest.fn(async () => {}),
  });

  await syncData(
    KV_WORDS_KEY,
    {},
    {
      persistMeta: false,
      syncConfig: {
        syncType: OPT_SYNCTYPE_WEBDAV,
        syncUrl: "https://dav.example.invalid",
        syncUser: "user",
        syncKey: "token",
        syncEncryptKey: "passphrase",
        syncMeta: { [KV_WORDS_KEY]: { updateAt: 1, syncAt: 1 } },
      },
    }
  );

  expect(patch).toHaveBeenCalledTimes(1);
  expect(patch).toHaveBeenCalledWith("request", expect.any(Function));
  const request = patch.mock.calls[0][1];

  const headers = { Authorization: "Basic dXNlcjp0b2tlbg==" };
  fetchPatcher.mockResolvedValue({ ok: true });
  await request({
    url: "https://dav.example.invalid/kiss-translator/kiss-words_v2.json",
    method: "GET",
    headers,
    data: "payload",
  });

  expect(fetchPatcher).toHaveBeenCalledWith(
    "https://dav.example.invalid/kiss-translator/kiss-words_v2.json",
    {
      method: "GET",
      headers,
      body: "payload",
      cache: "no-store",
    }
  );
});
