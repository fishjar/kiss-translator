import {
  KV_WORDS_KEY,
  STOKEY_WORDS,
  STOKEY_SYNC,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";
import { createClient } from "webdav";

jest.mock("./browser", () => ({ isOptions: () => true }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./gm", () => ({
  getGmMethod: (method) => globalThis.GM[method].bind(globalThis.GM),
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
function loadPage() {
  let page;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: false, isGm: true }));
    page = { ...require("./storage"), ...require("./sync") };
  });
  return page;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("GM sync must read the business value and metadata from the same record version", async () => {
  const recordKey = `${STOKEY_SYNC}:record:${KV_WORDS_KEY}`;
  const values = new Map([
    [
      STOKEY_SYNC,
      JSON.stringify({
        syncType: OPT_SYNCTYPE_WEBDAV,
        syncUrl: "https://review.example.invalid",
        syncUser: "review-user",
        syncKey: "review-token",
        syncEncryptKey: "review-passphrase",
        syncMeta: {},
      }),
    ],
    [
      recordKey,
      JSON.stringify({
        schema: "kiss-sync-record-v1",
        value: { original: {} },
        meta: { updateAt: 20, syncAt: 21 },
      }),
    ],
  ]);
  const paused = deferred();
  const resume = deferred();
  let pausedOnce = false;
  globalThis.GM = {
    getValue: jest.fn(async (key) => {
      if (key === STOKEY_SYNC && !pausedOnce) {
        pausedOnce = true;
        paused.resolve();
        await resume.promise;
      }
      return values.get(key);
    }),
    setValue: jest.fn(async (key, value) => values.set(key, value)),
    deleteValue: jest.fn(async (key) => values.delete(key)),
  };
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
  const first = loadPage();
  const second = loadPage();
  const sync = first.trySyncWords();
  try {
    await paused.promise;
    await second.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
      timestamp: 100,
    });
    resume.resolve();
    await sync;
    // A coherent old snapshot may download cloud; a fresh snapshot may upload added.
    // Neither snapshot can justify uploading original with the edit's newer timestamp.
    expect(JSON.parse(remote.value.slice(7))).not.toEqual({ original: {} });
    expect(await first.getWords()).toEqual({ added: {} });
    expect((await first.getSync()).syncMeta[KV_WORDS_KEY].updateAt).toBe(100);
  } finally {
    resume.resolve();
    await sync.catch(() => {});
    delete globalThis.GM;
    jest.dontMock("./client");
  }
});
