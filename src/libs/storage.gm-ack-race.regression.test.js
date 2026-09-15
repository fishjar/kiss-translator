import { KV_WORDS_KEY, STOKEY_WORDS, STOKEY_SYNC } from "../config";

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

test("GM metadata acknowledgement cannot overwrite another origin's completed business edit", async () => {
  const recordKey = `${STOKEY_SYNC}:record:${KV_WORDS_KEY}`;
  const values = new Map([
    [STOKEY_SYNC, JSON.stringify({ syncMeta: {} })],
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

  globalThis.GM = {
    getValue: jest.fn(async (key) => values.get(key)),
    setValue: jest.fn(async (key, value) => {
      if (JSON.parse(value)?.meta?.syncAt === 200) {
        paused.resolve();
        await resume.promise;
      }
      values.set(key, value);
    }),
    deleteValue: jest.fn(async (key) => values.delete(key)),
  };
  const first = loadPage();
  const second = loadPage();
  const acknowledgement = first.updateSyncState((current) => ({
    ...current,
    syncMeta: {
      ...current.syncMeta,
      [KV_WORDS_KEY]: { updateAt: 20, syncAt: 200 },
    },
  }));
  try {
    await paused.promise;
    await second.saveEdit(STOKEY_WORDS, { added: {} }, KV_WORDS_KEY, {
      timestamp: 100,
    });
    expect(await second.getWords()).toEqual({ added: {} });
    resume.resolve();
    await acknowledgement;
    expect(await first.getWords()).toEqual({ added: {} });
    expect((await first.getSync()).syncMeta[KV_WORDS_KEY].updateAt).toBe(100);
  } finally {
    resume.resolve();
    await acknowledgement.catch(() => {});
    delete globalThis.GM;
    jest.dontMock("./client");
  }
});
