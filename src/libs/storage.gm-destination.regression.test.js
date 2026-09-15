import {
  DEFAULT_SYNC,
  KV_SETTING_KEY,
  KV_WORDS_KEY,
  STOKEY_SYNC,
  STOKEY_WORDS,
} from "../config";

jest.mock("./browser", () => ({}));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./gm", () => ({
  getGmMethod: (method) => globalThis.GM[method].bind(globalThis.GM),
}));

function loadPage() {
  let page;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: false, isGm: true }));
    page = require("./storage");
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

const initialSync = {
  syncType: "worker",
  syncUrl: "https://destination-a.invalid",
  syncUser: "user-a",
  syncKey: "key-a",
  syncEncryptKey: "passphrase-a",
  syncMeta: {
    [KV_SETTING_KEY]: { updateAt: 10, syncAt: 11 },
    [KV_WORDS_KEY]: { updateAt: 20, syncAt: 21 },
    custom: { updateAt: 30 },
  },
};

function installGmStorage() {
  const values = new Map([[STOKEY_SYNC, JSON.stringify(initialSync)]]);
  globalThis.GM = {
    getValue: jest.fn(async (key) => values.get(key)),
    setValue: jest.fn(async (key, value) => values.set(key, value)),
    deleteValue: jest.fn(async (key) => values.delete(key)),
  };
  return values;
}

afterEach(() => {
  delete globalThis.GM;
  jest.dontMock("./client");
});

test.each(["configuration read", "metadata updater"])(
  "a GM metadata update paused during the %s cannot revert another origin's destination",
  async (pauseAt) => {
    const values = installGmStorage();
    const paused = deferred();
    const resume = deferred();
    if (pauseAt === "configuration read") {
      let pauseOnce = true;
      globalThis.GM.getValue.mockImplementation(async (key) => {
        const snapshot = values.get(key);
        if (key === STOKEY_SYNC && pauseOnce) {
          pauseOnce = false;
          paused.resolve();
          await resume.promise;
        }
        return snapshot;
      });
    }
    const first = loadPage();
    const second = loadPage();
    const metadata =
      pauseAt === "configuration read"
        ? first.putSyncMeta(KV_WORDS_KEY)
        : first.updateSyncState(async (current) => {
            paused.resolve();
            await resume.promise;
            return {
              ...current,
              syncMeta: {
                ...current.syncMeta,
                [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
              },
            };
          });
    try {
      await paused.promise;
      await second.putSync({
        syncType: "webdav",
        syncUrl: "https://destination-b.invalid",
        syncUser: "user-b",
        syncKey: "key-b",
        syncEncryptKey: "passphrase-b",
      });
      const switchedConfig = values.get(STOKEY_SYNC);
      expect(await second.getSync()).toMatchObject({
        destinationRevision: 1,
        syncMeta: {},
      });
      globalThis.GM.setValue.mockClear();
      resume.resolve();
      await metadata;
      expect(values.get(STOKEY_SYNC)).toBe(switchedConfig);
      expect((await first.getSync()).syncMeta).toEqual({});
      expect(await first.getSync()).toMatchObject({
        syncType: "webdav",
        syncUrl: "https://destination-b.invalid",
        syncUser: "user-b",
        syncKey: "key-b",
        syncEncryptKey: "passphrase-b",
        destinationRevision: 1,
        syncMeta: {},
      });
      expect(globalThis.GM.setValue).not.toHaveBeenCalled();
    } finally {
      resume.resolve();
      await metadata.catch(() => {});
    }
  }
);

test("a GM metadata update preserves other inline timestamps and custom metadata", async () => {
  const values = installGmStorage();
  const page = loadPage();
  await page.updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
    },
  }));
  expect(JSON.parse(values.get(STOKEY_SYNC)).syncMeta).toEqual({
    ...initialSync.syncMeta,
    [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
  });
  await page.updateSyncState((current) => ({
    ...current,
    syncMeta: { ...current.syncMeta, custom: { updateAt: 300 } },
  }));
  expect((await page.getSync()).syncMeta).toEqual({
    ...initialSync.syncMeta,
    [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
    custom: { updateAt: 300 },
  });
  expect(JSON.parse(values.get(STOKEY_SYNC)).syncMeta).toEqual({
    ...initialSync.syncMeta,
    [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
    custom: { updateAt: 300 },
  });
});

test.each([
  ["metadata", "putSync"],
  ["metadata", "setObj"],
  ["business edit", "putSync"],
  ["business edit", "setObj"],
])(
  "a GM %s based on absent configuration preserves a destination initialized with %s",
  async (operation, configure) => {
    const values = installGmStorage();
    values.delete(STOKEY_SYNC);
    const paused = deferred();
    const resume = deferred();
    let pauseOnce = true;
    globalThis.GM.getValue.mockImplementation(async (key) => {
      const snapshot = values.get(key);
      if (key === STOKEY_SYNC && pauseOnce) {
        pauseOnce = false;
        paused.resolve();
        await resume.promise;
      }
      return snapshot;
    });
    const first = loadPage();
    const second = loadPage();
    const pending =
      operation === "metadata"
        ? first.putSyncMeta(KV_WORDS_KEY)
        : first.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
            timestamp: 100,
          });
    try {
      await paused.promise;
      const destination = {
        syncUrl: "https://destination-b.invalid",
        syncKey: "key-b",
        syncEncryptKey: "passphrase-b",
      };
      if (configure === "setObj")
        await second.storage.setObj(STOKEY_SYNC, {
          ...DEFAULT_SYNC,
          ...destination,
        });
      else await second.putSync(destination);
      const switchedConfig = values.get(STOKEY_SYNC);
      globalThis.GM.setValue.mockClear();
      resume.resolve();
      await pending;
      expect(values.get(STOKEY_SYNC)).toBe(switchedConfig);
      expect((await first.getSync()).syncMeta).toEqual({});
      expect(await first.getSync()).toMatchObject({
        syncUrl: "https://destination-b.invalid",
        syncKey: "key-b",
        syncEncryptKey: "passphrase-b",
        syncMeta: {},
      });
      expect(globalThis.GM.setValue.mock.calls.map(([key]) => key)).toEqual(
        operation === "metadata" ? [] : [STOKEY_WORDS]
      );
      if (operation === "business edit") {
        expect(JSON.parse(values.get(STOKEY_WORDS))).toEqual({ added: {} });
      }
    } finally {
      resume.resolve();
      await pending.catch(() => {});
    }
  }
);

test.each(["setObj", "trySetObj"])(
  "GM %s explicitly initializes default configuration",
  async (method) => {
    const values = installGmStorage();
    values.delete(STOKEY_SYNC);
    const page = loadPage();
    await page.storage[method](STOKEY_SYNC, DEFAULT_SYNC);
    expect(JSON.parse(values.get(STOKEY_SYNC))).toEqual(DEFAULT_SYNC);
  }
);

test("GM initial configuration preserves imported fields and metadata", async () => {
  const values = installGmStorage();
  values.delete(STOKEY_SYNC);
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  expect(await page.getSync()).toEqual(initialSync);
});
