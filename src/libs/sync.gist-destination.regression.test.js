import { apiListGists, apiGetGist } from "../apis";
import { storage, putSync, getSync } from "./storage";
import { syncData } from "./sync";
import { STOKEY_SYNC, KV_WORDS_KEY, OPT_SYNCTYPE_GIST } from "../config";

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
jest.mock("../apis", () => ({
  apiSyncData: jest.fn(),
  apiListGists: jest.fn(),
  apiGetGist: jest.fn(),
  apiUpdateGistFile: jest.fn(),
}));
jest.mock("./syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("an old Gist lookup cannot replace a destination edited during its request", async () => {
  localStorage.clear();
  await storage.setObj(STOKEY_SYNC, {
    syncType: OPT_SYNCTYPE_GIST,
    syncUrl: "",
    syncKey: "review-token",
    syncEncryptKey: "review-passphrase",
    syncMeta: { [KV_WORDS_KEY]: { updateAt: 20, syncAt: 21 } },
  });
  const started = deferred();
  const resume = deferred();
  apiListGists.mockImplementation(async () => {
    started.resolve();
    await resume.promise;
    return [
      { id: "old-resolved-id", description: "kiss translator sync files" },
    ];
  });
  apiGetGist.mockResolvedValue({
    files: {
      [KV_WORDS_KEY]: {
        content: JSON.stringify({
          key: KV_WORDS_KEY,
          value: 'cipher:{"original":{}}',
          updateAt: 50,
        }),
      },
    },
  });
  const request = syncData(KV_WORDS_KEY, { original: {} }).catch((error) => {
    expect(error.message).toMatch(/destination changed/i);
  });
  try {
    await started.promise;
    await putSync({ syncUrl: "new-user-selected-id" });
    expect((await getSync()).destinationRevision).toBe(1);
    resume.resolve();
    await request;
    expect((await getSync()).syncUrl).toBe("new-user-selected-id");
  } finally {
    resume.resolve();
    await request.catch(() => {});
  }
});
