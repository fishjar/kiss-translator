import {
  KV_SETTING_KEY,
  KV_WORDS_KEY,
  STOKEY_SETTING,
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

function loadPage(isGm = false) {
  let page;
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: false, isGm }));
    page = {
      ...require("./storage"),
      ...require("./storageEvents"),
    };
  });
  return page;
}

const initialSync = {
  syncType: "webdav",
  syncUrl: "https://sync.example/first",
  syncUser: "test-user",
  syncKey: "test-token",
  syncEncryptKey: "test-passphrase",
  destinationRevision: 0,
  syncMeta: {
    [KV_SETTING_KEY]: { updateAt: 10, syncAt: 11 },
    [KV_WORDS_KEY]: { updateAt: 20, syncAt: 21 },
  },
};

beforeEach(() => {
  localStorage.clear();
  delete globalThis.GM;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete globalThis.GM;
  jest.dontMock("./client");
});

test("persists edits with monotonically increasing timestamps before returning", async () => {
  const page = loadPage();
  const result = await page.storage.saveEdit(
    STOKEY_SETTING,
    { darkMode: "light" },
    KV_SETTING_KEY,
    { timestamp: 100 }
  );
  expect(result).toEqual({ value: { darkMode: "light" }, updateAt: 100 });
  expect(await page.storage.getObj(STOKEY_SETTING)).toEqual(result.value);
  expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual({
    updateAt: 100,
  });
  await page.saveEdit(STOKEY_SETTING, { darkMode: "dark" }, KV_SETTING_KEY, {
    timestamp: 100,
  });
  expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual({
    updateAt: 101,
  });
});

test.each([false, true])(
  "compensates a failed metadata write without publishing a remote value (GM: %s)",
  async (isGm) => {
    if (isGm) installGmStorage();
    const page = loadPage(isGm);
    await page.storage.setObj(STOKEY_SYNC, initialSync);
    await page.storage.setObj(STOKEY_SETTING, { darkMode: "light" });
    const listener = jest.fn();
    page.subscribeStorageWrite(STOKEY_SETTING, listener);
    if (isGm) {
      const setValue = globalThis.GM.setValue.getMockImplementation();
      globalThis.GM.setValue.mockImplementation(async (key, value) => {
        if (key === STOKEY_SYNC) throw new Error("metadata failed");
        return setValue(key, value);
      });
    } else {
      const setItem = Storage.prototype.setItem;
      jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(function (key, value) {
          if (key === STOKEY_SYNC) throw new Error("metadata failed");
          setItem.call(this, key, value);
        });
    }
    await expect(
      page.updateSyncState(async (current, transaction) => {
        await transaction.setObj(STOKEY_SETTING, { darkMode: "dark" });
        return {
          ...current,
          syncMeta: {
            ...current.syncMeta,
            [KV_SETTING_KEY]: { updateAt: 200, syncAt: 201 },
          },
        };
      })
    ).rejects.toThrow("metadata failed");
    expect(await page.storage.getObj(STOKEY_SETTING)).toEqual({
      darkMode: "light",
    });
    expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual(
      initialSync.syncMeta[KV_SETTING_KEY]
    );
    expect(listener).not.toHaveBeenCalled();
  }
);

test("does not persist staged writes after an unsuccessful guard", async () => {
  const page = loadPage();
  await expect(
    page.withTransaction(async (transaction) => {
      await transaction.setObj(STOKEY_WORDS, { example: {} });
      expect(await transaction.getObj(STOKEY_WORDS)).toEqual({ example: {} });
      throw new Error("stale request");
    })
  ).rejects.toThrow("stale request");
  expect(await page.storage.getObj(STOKEY_WORDS)).toBeNull();
});

test("advances the destination generation and resets metadata only for a user change", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  await page.putSync(
    { syncUrl: "resolved-gist-id" },
    { preserveDestination: true }
  );
  expect(await page.getSync()).toMatchObject({
    destinationRevision: 0,
    syncMeta: initialSync.syncMeta,
  });
  await page.putSync({ syncUrl: "https://sync.example/second" });
  expect(await page.getSync()).toMatchObject({
    destinationRevision: 1,
    syncMeta: {},
  });
  await page.putSyncMeta(KV_SETTING_KEY);
  expect((await page.getSync()).destinationRevision).toBe(1);
});

test("retains a durable first-attempt marker when saving a stale same-destination snapshot", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  await page.updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [KV_WORDS_KEY]: { ...current.syncMeta[KV_WORDS_KEY], firstAttemptAt: 50 },
    },
  }));
  await page.storage.setObj(STOKEY_SYNC, {
    ...initialSync,
    dataCaches: { "https://rules.example": 123 },
  });
  expect((await page.getSync()).syncMeta[KV_WORDS_KEY].firstAttemptAt).toBe(50);
});

function installGmStorage() {
  const values = new Map([
    [STOKEY_SYNC, JSON.stringify(initialSync)],
    [STOKEY_SETTING, JSON.stringify({ darkMode: "auto" })],
    [STOKEY_WORDS, JSON.stringify({ original: {} })],
  ]);
  globalThis.GM = {
    getValue: jest.fn(async (key) => values.get(key)),
    setValue: jest.fn(async (key, value) => values.set(key, value)),
    deleteValue: jest.fn(async (key) => values.delete(key)),
  };
  return values;
}

test.each([false, true])(
  "preserves a post-request edit after rebuilding the page state (GM: %s)",
  async (isGm) => {
    const seed = {
      ...initialSync,
      syncMeta: { [KV_WORDS_KEY]: { updateAt: 10, syncAt: 0 } },
    };
    if (isGm) installGmStorage().set(STOKEY_SYNC, JSON.stringify(seed));
    else localStorage.setItem(STOKEY_SYNC, JSON.stringify(seed));
    const requestPage = loadPage(isGm);
    await requestPage.updateSyncState((current) => ({
      ...current,
      syncMeta: {
        ...current.syncMeta,
        [KV_WORDS_KEY]: {
          ...current.syncMeta[KV_WORDS_KEY],
          firstAttemptAt: 50,
        },
      },
    }));

    // No in-memory attempted-request set is inherited by this new registry.
    const newPage = loadPage(isGm);
    await newPage.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
      timestamp: 100,
    });

    expect(await newPage.getWords()).toEqual({ added: {} });
    expect((await newPage.getSync()).syncMeta[KV_WORDS_KEY]).toEqual({
      updateAt: 100,
      syncAt: 0,
      firstAttemptAt: 50,
      pendingUpload: true,
    });
  }
);

test("retains GM metadata when configuration changes without changing destination", async () => {
  installGmStorage();
  const page = loadPage(true);
  await page.putSync({ dataCaches: { "https://rules.example": 123 } });
  expect((await page.getSync()).syncMeta).toEqual(initialSync.syncMeta);
  await page.putSync({ syncUrl: "https://sync.example/second" });
  expect((await page.getSync()).syncMeta).toEqual({});
  expect(await page.getSetting()).toEqual({ darkMode: "auto" });
});

test("discard removes only the staged business write after a stale guard", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_WORDS, { original: {} });
  await page.withTransaction(async (transaction) => {
    await transaction.setObj(STOKEY_WORDS, { remote: {} });
    await transaction.setObj("retained-key", { retained: true });
    transaction.discard(STOKEY_WORDS);
    expect(await transaction.getObj(STOKEY_WORDS)).toEqual({ original: {} });
  });
  expect(await page.getWords()).toEqual({ original: {} });
  expect(await page.storage.getObj("retained-key")).toEqual({ retained: true });
});
