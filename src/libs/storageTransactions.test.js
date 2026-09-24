import {
  DEFAULT_SETTING,
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
  expect(result).toEqual({
    value: { darkMode: "light" },
    changed: true,
    updateAt: 100,
  });
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

test("uses the latest stored value for a second page's updater", async () => {
  const firstPage = loadPage();
  const secondPage = loadPage();
  await firstPage.saveEdit(STOKEY_WORDS, { original: {} });
  await firstPage.saveEdit(STOKEY_WORDS, (words) => ({ ...words, first: {} }));
  const saved = await secondPage.saveEdit(STOKEY_WORDS, (words) => ({
    ...words,
    second: {},
  }));
  expect(saved.value).toEqual({ original: {}, first: {}, second: {} });
  expect(await firstPage.getWords()).toEqual(saved.value);
});

test("does not write or advance metadata for reordered object properties", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_WORDS, {
    first: { word: "first", date: 1 },
    second: { word: "second", date: 2 },
  });
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  const listener = jest.fn();
  page.subscribeStorageWrite(STOKEY_WORDS, listener);
  const setItem = jest.spyOn(Storage.prototype, "setItem");
  const result = await page.saveEdit(
    STOKEY_WORDS,
    {
      second: { date: 2, word: "second" },
      first: { date: 1, word: "first" },
    },
    KV_WORDS_KEY,
    { timestamp: 100 }
  );
  expect(result).toMatchObject({ changed: false, updateAt: 20 });
  expect(setItem).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  expect((await page.getSync()).syncMeta).toEqual(initialSync.syncMeta);
});

test("keeps missing defaults in memory for no-op edits", async () => {
  const page = loadPage();
  const updater = jest.fn((setting) => setting);
  await expect(page.saveEdit(STOKEY_SETTING, updater)).resolves.toEqual({
    value: DEFAULT_SETTING,
    changed: false,
    updateAt: 0,
  });
  expect(updater).toHaveBeenCalledWith(DEFAULT_SETTING);
  expect(await page.getSetting()).toBeNull();
  expect(await page.getSync()).toBeNull();
});

test("uses an explicit missing-value default without migrating stored values", async () => {
  const page = loadPage();
  const defaultValue = { version: 1, enabled: false };
  const saved = await page.saveEdit(
    "custom-key",
    (previous) => ({ ...previous, enabled: true }),
    undefined,
    { defaultValue }
  );
  expect(saved).toEqual({
    value: { version: 1, enabled: true },
    changed: true,
    updateAt: 0,
  });
  expect(defaultValue).toEqual({ version: 1, enabled: false });
  await page.storage.setObj(STOKEY_SETTING, { version: 1, darkMode: true });
  await page.saveEdit(STOKEY_SETTING, (previous) => ({
    ...previous,
    touched: true,
  }));
  expect(await page.getSetting()).toEqual({
    version: 1,
    darkMode: true,
    touched: true,
  });
});

test("stages related edits and their metadata under one transaction", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  const result = await page.withTransaction(async (transaction) => {
    const first = await transaction.saveEdit(
      STOKEY_WORDS,
      (words) => ({ ...words, first: {} }),
      KV_WORDS_KEY,
      { timestamp: 100 }
    );
    expect(await page.getWords()).toBeNull();
    const second = await transaction.saveEdit(
      STOKEY_WORDS,
      (words) => ({ ...words, second: {} }),
      KV_WORDS_KEY,
      { timestamp: 100 }
    );
    return { first, second };
  });
  expect(result.first.updateAt).toBe(100);
  expect(result.second.updateAt).toBe(101);
  expect(await page.getWords()).toEqual({ first: {}, second: {} });
  expect((await page.getSync()).syncMeta[KV_WORDS_KEY].updateAt).toBe(101);
});

test("discards business edits and metadata when a later transaction guard fails", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  await expect(
    page.withTransaction(async (transaction) => {
      await transaction.saveEdit(STOKEY_WORDS, { staged: {} });
      throw new Error("Conflicting rule changed");
    })
  ).rejects.toMatchObject({ storageOutcome: "not-committed" });
  expect(await page.getWords()).toBeNull();
  expect(await page.getSync()).toEqual(initialSync);
});

test("isolates updater inputs from staged values even when the updater fails", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_WORDS, { original: { word: "original" } });
  await page.withTransaction(async (transaction) => {
    await expect(
      transaction.saveEdit(STOKEY_WORDS, (previous) => {
        previous.original.word = "mutated";
        throw new Error("Invalid edit");
      })
    ).rejects.toThrow("Invalid edit");
    expect(await transaction.getObj(STOKEY_WORDS)).toEqual({
      original: { word: "original" },
    });
  });
  expect(await page.getWords()).toEqual({ original: { word: "original" } });
});

test("captures replacement values before they wait in the write queue", async () => {
  const page = loadPage();
  let release;
  const blocker = page.withTransaction(
    () => new Promise((resolve) => (release = resolve))
  );
  await Promise.resolve();
  const replacement = { captured: { word: "captured" } };
  const edit = page.saveEdit(STOKEY_WORDS, replacement);
  replacement.captured.word = "mutated";
  release();
  await blocker;
  expect((await edit).value).toEqual({ captured: { word: "captured" } });
  expect(await page.getWords()).toEqual({ captured: { word: "captured" } });
});

test("rejects asynchronous updaters before any data or metadata is written", async () => {
  const page = loadPage();
  await expect(
    page.saveEdit(STOKEY_WORDS, async () => ({ delayed: {} }))
  ).rejects.toMatchObject({
    message: "Storage edit updaters must be synchronous",
    storageOutcome: "not-committed",
  });
  expect(await page.getWords()).toBeNull();
  expect(await page.getSync()).toBeNull();
});

test("retains current metadata when editing a stale same-destination configuration", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  const stale = await page.getSync();
  await page.saveEdit(STOKEY_WORDS, { changed: {} }, KV_WORDS_KEY, {
    timestamp: 100,
  });
  const result = await page.saveEdit(STOKEY_SYNC, {
    ...stale,
    dataCaches: { rules: 50 },
    destinationRevision: 999,
  });
  expect(result.value).toMatchObject({
    dataCaches: { rules: 50 },
    destinationRevision: 0,
    syncMeta: { [KV_WORDS_KEY]: { updateAt: 100 } },
  });
  const changed = await page.saveEdit(STOKEY_SYNC, (current) => ({
    ...current,
    syncUrl: "https://sync.example/second",
  }));
  expect(changed.value).toMatchObject({ destinationRevision: 1, syncMeta: {} });
  expect(await page.getSync()).toEqual(changed.value);
});

test("advances the destination revision when editing an uninitialized configuration", async () => {
  const page = loadPage();
  const result = await page.saveEdit(STOKEY_SYNC, (current) => ({
    ...current,
    syncUrl: "https://sync.example/first-user-choice",
  }));
  expect(result.value).toMatchObject({ destinationRevision: 1, syncMeta: {} });
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
    ).rejects.toMatchObject({
      message: "metadata failed",
      storageOutcome: "not-committed",
    });
    expect(await page.storage.getObj(STOKEY_SETTING)).toEqual({
      darkMode: "light",
    });
    expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual(
      initialSync.syncMeta[KV_SETTING_KEY]
    );
    expect(listener).not.toHaveBeenCalled();
  }
);

test("reports an unknown outcome when transaction compensation fails", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  await page.storage.setObj(STOKEY_SETTING, { darkMode: "light" });
  const setItem = Storage.prototype.setItem;
  jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (key, value) {
      if (key === STOKEY_SYNC) throw new Error("metadata failed");
      if (key === STOKEY_SETTING && value === '{"darkMode":"light"}')
        throw new Error("recovery failed");
      setItem.call(this, key, value);
    });
  await expect(
    page.saveEdit(STOKEY_SETTING, { darkMode: "dark" })
  ).rejects.toMatchObject({
    message: "metadata failed",
    storageOutcome: "unknown",
    storageRecoveryFailed: true,
  });
  expect(await page.getSetting()).toEqual({ darkMode: "dark" });
});

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
