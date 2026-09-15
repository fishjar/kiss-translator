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

test("persists edits with their timestamp before returning and preserves first-sync policy", async () => {
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
    pendingUpload: true,
  });
  expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual({
    updateAt: 101,
    pendingUpload: true,
  });
});

test("compensates a failed metadata write without publishing a remote value", async () => {
  const page = loadPage();
  await page.storage.setObj(STOKEY_SYNC, initialSync);
  await page.storage.setObj(STOKEY_SETTING, { darkMode: "light" });
  const listener = jest.fn();
  page.subscribeStorageWrite(STOKEY_SETTING, listener);
  const setItem = Storage.prototype.setItem;
  jest
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function (key, value) {
      if (key === STOKEY_SYNC) throw new Error("metadata failed");
      setItem.call(this, key, value);
    });
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

test("reads legacy GM values and inline metadata without migrating on read", async () => {
  installGmStorage();
  const page = loadPage(true);
  expect(await page.storage.get(STOKEY_SETTING)).toBe(
    JSON.stringify({ darkMode: "auto" })
  );
  expect(await page.getSync()).toEqual(initialSync);
  expect(globalThis.GM.setValue).not.toHaveBeenCalled();
});

test("writes a GM business value and its metadata in one record", async () => {
  const values = installGmStorage();
  const page = loadPage(true);
  const next = { darkMode: "light" };
  await page.saveEdit(STOKEY_SETTING, next, KV_SETTING_KEY, { timestamp: 100 });
  expect(globalThis.GM.setValue).toHaveBeenCalledTimes(1);
  const record = JSON.parse(globalThis.GM.setValue.mock.calls[0][1]);
  expect(record).toMatchObject({
    value: next,
    meta: { updateAt: 100, syncAt: 11 },
  });
  expect(await page.getSetting()).toEqual(next);
  expect(await page.storage.get(STOKEY_SETTING)).toBe(JSON.stringify(next));
  expect((await page.getSync()).syncMeta[KV_SETTING_KEY]).toEqual(record.meta);
  expect(JSON.parse(values.get(STOKEY_SYNC))).toEqual(initialSync);
});

test("keeps both GM edits when independent origins update different keys", async () => {
  installGmStorage();
  const first = loadPage(true);
  const second = loadPage(true);
  await Promise.all([
    first.saveEdit(STOKEY_SETTING, { darkMode: "light" }, KV_SETTING_KEY, {
      timestamp: 100,
    }),
    second.saveEdit(STOKEY_WORDS, { second: {} }, KV_WORDS_KEY, {
      timestamp: 200,
    }),
  ]);
  expect(await first.getSetting()).toEqual({ darkMode: "light" });
  expect(await second.getWords()).toEqual({ second: {} });
  expect((await first.getSync()).syncMeta).toEqual({
    [KV_SETTING_KEY]: { updateAt: 100, syncAt: 11 },
    [KV_WORDS_KEY]: { updateAt: 200, syncAt: 21 },
  });
});

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
      pendingUpload: false,
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

test("retains legacy GM metadata when configuration changes without changing destination", async () => {
  installGmStorage();
  const page = loadPage(true);
  await page.putSync({ dataCaches: { "https://rules.example": 123 } });
  expect((await page.getSync()).syncMeta).toEqual(initialSync.syncMeta);
  await page.putSync({ syncUrl: "https://sync.example/second" });
  expect((await page.getSync()).syncMeta).toEqual({});
  expect(await page.getSetting()).toEqual({ darkMode: "auto" });
});

test("ignores a stale GM metadata acknowledgement after another origin saves an edit", async () => {
  installGmStorage();
  const first = loadPage(true);
  const second = loadPage(true);
  let resume;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const hold = new Promise((resolve) => {
    resume = resolve;
  });
  const oldAcknowledgement = first.updateSyncState(async (current) => {
    started();
    await hold;
    return {
      ...current,
      syncMeta: {
        ...current.syncMeta,
        [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
      },
    };
  });
  await ready;
  await second.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
    timestamp: 100,
  });
  resume();
  await oldAcknowledgement;
  expect(await first.getWords()).toEqual({ added: {} });
  expect((await first.getSync()).syncMeta[KV_WORDS_KEY]).toEqual({
    updateAt: 100,
    syncAt: 21,
  });
});

test("GM metadata acknowledgements never rewrite a business record", async () => {
  installGmStorage();
  const page = loadPage(true);
  await page.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
    timestamp: 100,
  });
  const firstRecord = JSON.parse(globalThis.GM.setValue.mock.calls[0][1]);
  globalThis.GM.setValue.mockClear();
  await page.updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [KV_WORDS_KEY]: { updateAt: 100, syncAt: 200 },
    },
  }));
  expect(globalThis.GM.setValue).toHaveBeenCalledTimes(1);
  const [ackKey, serializedAck] = globalThis.GM.setValue.mock.calls[0];
  expect(ackKey).toBe(`${STOKEY_SYNC}:ack:${KV_WORDS_KEY}`);
  expect(JSON.parse(serializedAck)).toMatchObject({
    businessRevision: firstRecord.revision,
    meta: { updateAt: 100, syncAt: 200 },
  });
  expect(JSON.parse(serializedAck)).not.toHaveProperty("value");
  await page.saveEdit(STOKEY_WORDS, { next: {} }, KV_WORDS_KEY, {
    timestamp: 300,
  });
  const nextRecord = JSON.parse(globalThis.GM.setValue.mock.calls[1][1]);
  expect(nextRecord.revision).not.toBe(firstRecord.revision);
  expect((await page.getSync()).syncMeta[KV_WORDS_KEY]).toEqual({
    updateAt: 300,
    syncAt: 200,
  });
});

test("reads matching GM value and metadata when another origin writes between the reads", async () => {
  const values = installGmStorage();
  const first = loadPage(true);
  const second = loadPage(true);
  await first.saveEdit(STOKEY_WORDS, { original: {} }, KV_WORDS_KEY, {
    timestamp: 50,
  });
  let switched = false;
  globalThis.GM.getValue.mockImplementation(async (key) => {
    if (key === STOKEY_SYNC && !switched) {
      switched = true;
      await second.saveEdit(STOKEY_WORDS, { replacement: {} }, KV_WORDS_KEY, {
        timestamp: 100,
      });
    }
    return values.get(key);
  });

  const snapshot = await first.readSyncSnapshot(STOKEY_WORDS);
  expect(snapshot.value).toEqual({ original: {} });
  expect(snapshot.syncConfig.syncMeta[KV_WORDS_KEY].updateAt).toBe(50);
  expect(await second.getWords()).toEqual({ replacement: {} });
  expect((await second.getSync()).syncMeta[KV_WORDS_KEY].updateAt).toBe(100);
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

test("does not resurrect a legacy GM value after deletion or lose record data during metadata updates", async () => {
  installGmStorage();
  const page = loadPage(true);
  await page.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
    timestamp: 100,
  });
  await page.putSyncMeta(KV_WORDS_KEY);
  expect(await page.getWords()).toEqual({ added: {} });
  await page.storage.del(STOKEY_WORDS);
  expect(await page.getWords()).toBeNull();
  await page.storage.del(STOKEY_SYNC);
  expect(await page.getSync()).toBeNull();
});
