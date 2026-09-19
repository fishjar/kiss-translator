jest.mock("./gm", () => ({ getGmMethod: jest.fn() }));
jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({}));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));

function newPageStorage() {
  let page;
  jest.isolateModules(() => {
    page = require("./storage");
  });
  return page;
}

test("preserves metadata updates from independent pages sharing storage", async () => {
  const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  let queue = Promise.resolve();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      // Model the browser's origin-wide lock manager, shared by both pages.
      request: jest.fn((_name, operation) => {
        const pending = queue.then(operation);
        queue = pending.catch(() => {});
        return pending;
      }),
    },
  });
  try {
    const first = newPageStorage();
    const second = newPageStorage();
    const { STOKEY_SYNC, KV_SETTING_KEY, KV_WORDS_KEY } = require("../config");
    localStorage.clear();
    await first.storage.setObj(STOKEY_SYNC, { syncMeta: {} });

    // Separate registries prevent a module-local queue from hiding the race.
    await Promise.all([
      first.putSyncMeta(KV_SETTING_KEY),
      second.putSyncMeta(KV_WORDS_KEY),
    ]);

    expect(
      Object.keys((await first.getSyncWithDefault()).syncMeta).sort()
    ).toEqual([KV_SETTING_KEY, KV_WORDS_KEY].sort());
  } finally {
    if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
    else delete navigator.locks;
  }
});
