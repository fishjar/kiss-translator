import {
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_WORDS_KEY,
  STOKEY_SETTING,
  STOKEY_RULES,
  STOKEY_WORDS,
  STOKEY_SYNC,
} from "../config";

jest.mock("./browser", () => ({}));
jest.mock("./gm", () => ({
  getGmMethod: (method) => globalThis.GM[method].bind(globalThis.GM),
}));

let page;
let values;

// The previous storage API directly parsed and serialized the original GM keys.
const previousStorage = {
  getObj: async (key) =>
    JSON.parse((await globalThis.GM.getValue(key)) ?? null),
  setObj: async (key, value) =>
    globalThis.GM.setValue(key, JSON.stringify(value)),
};

beforeEach(() => {
  values = new Map();
  globalThis.GM = {
    getValue: jest.fn(async (key) => values.get(key)),
    setValue: jest.fn(async (key, value) => values.set(key, value)),
    deleteValue: jest.fn(async (key) => values.delete(key)),
  };
  jest.isolateModules(() => {
    jest.doMock("./client", () => ({ isExt: false, isGm: true }));
    page = require("./storage");
  });
});

afterEach(() => {
  delete globalThis.GM;
  jest.dontMock("./client");
});

test.each([
  [STOKEY_SETTING, KV_SETTING_KEY, { darkMode: "light" }, { darkMode: "dark" }],
  [STOKEY_RULES, KV_RULES_KEY, [{ pattern: "first" }], [{ pattern: "second" }]],
  [STOKEY_WORDS, KV_WORDS_KEY, { first: {} }, { second: {} }],
])(
  "new and previous storage APIs share plain JSON at %s",
  async (storageKey, syncKey, first, second) => {
    await previousStorage.setObj(storageKey, first);
    globalThis.GM.setValue.mockClear();

    expect(await page.storage.getObj(storageKey)).toEqual(first);
    expect(await page.storage.get(storageKey)).toBe(JSON.stringify(first));
    expect(globalThis.GM.setValue).not.toHaveBeenCalled();

    await page.saveEdit(storageKey, second, syncKey, { timestamp: 100 });
    expect(await previousStorage.getObj(storageKey)).toEqual(second);
    expect(
      (await previousStorage.getObj(STOKEY_SYNC)).syncMeta[syncKey]
    ).toEqual({
      updateAt: 100,
    });
    expect([...values.keys()].sort()).toEqual([storageKey, STOKEY_SYNC].sort());

    await previousStorage.setObj(storageKey, first);
    expect(await page.storage.getObj(storageKey)).toEqual(first);
  }
);

test("same-page edits retain all inline timestamps at the original keys", async () => {
  await Promise.all([
    page.saveEdit(STOKEY_SETTING, { darkMode: "light" }, KV_SETTING_KEY, {
      timestamp: 100,
    }),
    page.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
      timestamp: 200,
    }),
  ]);
  expect(await previousStorage.getObj(STOKEY_SETTING)).toEqual({
    darkMode: "light",
  });
  expect(await previousStorage.getObj(STOKEY_WORDS)).toEqual({ added: {} });
  expect((await previousStorage.getObj(STOKEY_SYNC)).syncMeta).toEqual({
    [KV_SETTING_KEY]: { updateAt: 100 },
    [KV_WORDS_KEY]: { updateAt: 200 },
  });
  expect([...values.keys()].sort()).toEqual(
    [STOKEY_SETTING, STOKEY_WORDS, STOKEY_SYNC].sort()
  );
});

test("a same-page snapshot waits for both the business value and timestamp", async () => {
  let resume;
  let started;
  const held = new Promise((resolve) => {
    resume = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  globalThis.GM.setValue.mockImplementation(async (key, value) => {
    if (key === STOKEY_WORDS) {
      started();
      await held;
    }
    values.set(key, value);
  });
  const edit = page.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
    timestamp: 100,
  });
  try {
    await ready;
    const snapshot = page.readSyncSnapshot(STOKEY_WORDS);
    resume();
    await edit;
    expect(await snapshot).toMatchObject({
      value: { added: {} },
      syncConfig: { syncMeta: { [KV_WORDS_KEY]: { updateAt: 100 } } },
    });
  } finally {
    resume();
    await edit.catch(() => {});
  }
});

test("metadata updates preserve business values written through the previous API", async () => {
  await previousStorage.setObj(STOKEY_WORDS, { original: {} });
  await previousStorage.setObj(STOKEY_SYNC, {
    syncMeta: { [KV_WORDS_KEY]: { updateAt: 20, syncAt: 21 } },
  });
  await previousStorage.setObj(STOKEY_WORDS, { added: {} });
  globalThis.GM.setValue.mockClear();

  await page.updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
    },
  }));

  expect(await previousStorage.getObj(STOKEY_WORDS)).toEqual({ added: {} });
  expect(await page.getWords()).toEqual({ added: {} });
  expect(
    (await previousStorage.getObj(STOKEY_SYNC)).syncMeta[KV_WORDS_KEY]
  ).toEqual({
    updateAt: 20,
    syncAt: 200,
  });
  expect(globalThis.GM.setValue.mock.calls.map(([key]) => key)).toEqual([
    STOKEY_SYNC,
  ]);
  await page.storage.del(STOKEY_WORDS);
  expect(await previousStorage.getObj(STOKEY_WORDS)).toBeNull();
  expect(await page.getWords()).toBeNull();
});
