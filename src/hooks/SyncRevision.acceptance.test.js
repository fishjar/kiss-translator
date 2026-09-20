// Keep hooks, persistence and WebDAV conflict handling real across sync races.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "webdav";
import { browser } from "../libs/browser";
import { useFavWords } from "./FavWords";
import { useSync } from "./Sync";
import {
  storage,
  getRulesWithDefault,
  getSettingWithDefault,
  getSyncWithDefault,
  updateSyncState,
} from "../libs/storage";
import { syncSettingAndRules, trySyncWords } from "../libs/sync";
import {
  STOKEY_WORDS,
  STOKEY_SETTING,
  STOKEY_SYNC,
  KV_SETTING_KEY,
  KV_RULES_KEY,
  KV_WORDS_KEY,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/client", () => ({ isExt: true, isGm: false }));
jest.mock("../libs/browser", () => ({
  isOptions: () => true,
  browser: {
    storage: {
      local: {
        get: async (keys) =>
          Object.fromEntries(
            keys.map((key) => [key, globalThis.localStorage.getItem(key)])
          ),
        set: async (entries) => {
          Object.entries(entries).forEach(([key, value]) => {
            globalThis.localStorage.setItem(key, value);
          });
        },
        remove: async (keys) => {
          keys.forEach((key) => globalThis.localStorage.removeItem(key));
        },
      },
    },
  },
}));
jest.mock("../libs/storageCoordination", () => {
  let queue = Promise.resolve();
  return {
    withStorageLock: (operation) => {
      const pending = queue.then(() => operation());
      queue = pending.catch(() => {});
      return pending;
    },
  };
});
jest.mock("../libs/log", () => ({
  ...jest.requireActual("../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("../libs/fetch", () => ({
  fetchPatcher: jest.fn(),
  fetchGM: jest.fn(),
}));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: () => ({ patch: jest.fn() }),
}));
jest.mock("../apis", () => ({ apiSyncData: jest.fn() }));
jest.mock("../libs/syncCrypto", () => ({
  encryptSyncValue: async (value) => `cipher:${value}`,
  decryptSyncValue: async (value) => ({
    value: value.slice(7),
    encrypted: true,
  }),
}));

const INITIAL_WORDS = { initial: { createdAt: 1 } };
const LATEST_WORDS = {
  initial: { createdAt: 1 },
  first: { createdAt: 100000 },
  second: { createdAt: 103000 },
};
const SECOND_EDIT_TIME = 103000;

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

function makePacket(key, value, updateAt) {
  return {
    key,
    value: `cipher:${JSON.stringify(value)}`,
    updateAt,
  };
}

function packetValue(packet) {
  return JSON.parse(packet.value.slice(7));
}

async function flush() {
  await act(async () => {
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
  });
}

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
  });
}

describe("F10 acceptance with real sync metadata and WebDAV comparison", () => {
  let root;
  let container;
  let hook;
  let syncHook;
  let remotePackets;
  let blockedReply;
  let remoteClient;
  let wordReads;
  let latestDirtyTime;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(100000);
    window.localStorage.clear();
    createClient.mockReset();
    await storage.setObj(STOKEY_WORDS, INITIAL_WORDS);
    await storage.setObj(STOKEY_SYNC, {
      syncType: OPT_SYNCTYPE_WEBDAV,
      syncUrl: "https://sync.example.invalid",
      syncUser: "review-user",
      syncKey: "review-token",
      syncEncryptKey: "review-passphrase",
      syncMeta: {
        [KV_SETTING_KEY]: { updateAt: 90000, syncAt: 90001 },
        [KV_RULES_KEY]: { updateAt: 90000, syncAt: 90001 },
        [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 90001 },
      },
    });
    remotePackets = {
      [KV_SETTING_KEY]: makePacket(
        KV_SETTING_KEY,
        await getSettingWithDefault(),
        90000
      ),
      [KV_RULES_KEY]: makePacket(
        KV_RULES_KEY,
        await getRulesWithDefault(),
        90000
      ),
      [KV_WORDS_KEY]: makePacket(
        KV_WORDS_KEY,
        { remote: { createdAt: 100500 } },
        100500
      ),
    };
    blockedReply = deferred();
    wordReads = 0;
    latestDirtyTime = undefined;
    remoteClient = {
      exists: jest.fn(async () => true),
      getFileContents: jest.fn(async (path) => {
        const key = path.split("/").pop();
        if (key === KV_WORDS_KEY) {
          wordReads += 1;
          if (wordReads === 1) return blockedReply.promise;
        }
        return JSON.stringify(remotePackets[key]);
      }),
      putFileContents: jest.fn(async (_path, content) => {
        const packet = JSON.parse(content);
        remotePackets[packet.key] = packet;
      }),
    };
    createClient.mockReturnValue(remoteClient);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    function Host() {
      hook = useFavWords();
      syncHook = useSync();
      return null;
    }
    await act(async () => {
      root.render(<Host />);
    });
    await flush();
    expect(hook.favWords).toEqual(INITIAL_WORDS);
  });

  afterEach(async () => {
    act(() => root.unmount());
    // A failed assertion must not leave a controlled network promise pending
    // across tests when the implementation coordinates work by storage key.
    blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
    await flush();
    container.remove();
    jest.useRealTimers();
  });

  async function expectLatestLocalValue() {
    expect(hook.favWords).toEqual(LATEST_WORDS);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(LATEST_WORDS);
  }

  async function completeObsoleteReply() {
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    expect(wordReads).toBe(1);
    const firstDirtyTime = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
      .updateAt;
    const remoteTime = remotePackets[KV_WORDS_KEY].updateAt;
    expect(firstDirtyTime).toBeGreaterThanOrEqual(100000);
    expect(firstDirtyTime).toBeLessThan(remoteTime);

    await act(async () => {
      hook.toggleFav("second");
    });
    await advance(300);
    await expectLatestLocalValue();
    latestDirtyTime = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
      .updateAt;
    expect(latestDirtyTime).toBeGreaterThanOrEqual(SECOND_EDIT_TIME);
    expect(latestDirtyTime).toBeGreaterThan(remoteTime);

    // The second automatic sync has not fired when the old response arrives.
    const obsoletePacket = JSON.stringify(remotePackets[KV_WORDS_KEY]);
    await act(async () => {
      blockedReply.resolve(obsoletePacket);
    });
    await flush();

    // These checks must precede every retry. Equal local/remote values alone
    // allow the baseline's lost-edit behavior to pass the acceptance test.
    await expectLatestLocalValue();
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(metadata.updateAt).toBeGreaterThanOrEqual(latestDirtyTime);
  }

  async function expectLatestConvergence() {
    await flush();
    await expectLatestLocalValue();
    const remotePacket = remotePackets[KV_WORDS_KEY];
    expect(packetValue(remotePacket)).toEqual(LATEST_WORDS);
    expect(remotePacket.updateAt).toBeGreaterThanOrEqual(latestDirtyTime);
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(metadata.updateAt).toBe(remotePacket.updateAt);
    const uploadedWordValues = remoteClient.putFileContents.mock.calls
      .map(([, content]) => JSON.parse(content))
      .filter((packet) => packet.key === KV_WORDS_KEY)
      .map(packetValue);
    expect(uploadedWordValues).toContainEqual(LATEST_WORDS);
  }

  test("preserves the latest edit and converges automatically before manual sync", async () => {
    await completeObsoleteReply();
    await advance(3000);
    await expectLatestConvergence();

    await act(async () => {
      await trySyncWords();
    });
    await expectLatestConvergence();
  });

  test("manual vocabulary sync converges before the automatic timer fires", async () => {
    await completeObsoleteReply();
    await act(async () => {
      await trySyncWords();
    });
    await expectLatestConvergence();
  });

  test("the full manual sync entry point converges before the automatic timer fires", async () => {
    await completeObsoleteReply();
    await act(async () => {
      await syncSettingAndRules();
    });
    await expectLatestConvergence();
    const readKeys = remoteClient.getFileContents.mock.calls.map(([path]) =>
      path.split("/").pop()
    );
    expect(readKeys).toContain(KV_SETTING_KEY);
    expect(readKeys).toContain(KV_RULES_KEY);
  });

  test("a current remote download adopts both its value and metadata", async () => {
    const expectedRemoteWords = packetValue(remotePackets[KV_WORDS_KEY]);
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    expect(wordReads).toBe(1);

    await act(async () => {
      blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
    });
    await flush();

    expect(hook.favWords).toEqual(expectedRemoteWords);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(expectedRemoteWords);
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(metadata.updateAt).toBe(100500);
    expect(metadata.syncAt).toBeGreaterThanOrEqual(103000);
  });

  test("a current upload acknowledges success even when isNew is false", async () => {
    remotePackets[KV_WORDS_KEY] = makePacket(
      KV_WORDS_KEY,
      { remote: { createdAt: 99000 } },
      99000
    );
    const expectedLocalWords = {
      initial: { createdAt: 1 },
      first: { createdAt: 100000 },
    };
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    expect(wordReads).toBe(1);

    const uploadTime = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
      .updateAt;
    expect(uploadTime).toBeGreaterThan(remotePackets[KV_WORDS_KEY].updateAt);

    await act(async () => {
      blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
    });
    await flush();

    expect(hook.favWords).toEqual(expectedLocalWords);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(expectedLocalWords);
    expect(packetValue(remotePackets[KV_WORDS_KEY])).toEqual(
      expectedLocalWords
    );
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(metadata.updateAt).toBe(uploadTime);
    expect(metadata.updateAt).toBe(remotePackets[KV_WORDS_KEY].updateAt);
    expect(metadata.syncAt).toBeGreaterThanOrEqual(103000);
  });

  test("a first manual sync still prefers remote data over an older local setup history", async () => {
    await act(async () => {
      await updateSyncState((current) => ({
        ...current,
        syncMeta: {
          ...current.syncMeta,
          [KV_WORDS_KEY]: { updateAt: 200000, syncAt: 0 },
        },
      }));
    });
    blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
    await act(async () => {
      await trySyncWords();
    });
    const expected = packetValue(remotePackets[KV_WORDS_KEY]);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(expected);
    expect(hook.favWords).toEqual(expected);
    expect(remoteClient.putFileContents).not.toHaveBeenCalled();
    expect(
      (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY].syncAt
    ).toBeGreaterThan(0);
  });

  test("an edit made during first sync survives automatic and manual retries", async () => {
    await act(async () => {
      await updateSyncState((current) => ({
        ...current,
        syncMeta: {
          ...current.syncMeta,
          [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 0 },
        },
      }));
    });
    await completeObsoleteReply();
    expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toMatchObject({
      syncAt: 0,
      pendingUpload: true,
    });
    await advance(3000);
    await expectLatestConvergence();
    expect(
      (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
    ).not.toHaveProperty("pendingUpload");
    await act(async () => {
      await trySyncWords();
    });
    await expectLatestConvergence();
  });

  test("a failed metadata write rolls a downloaded value back to the saved local value", async () => {
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    const localValue = await storage.getObj(STOKEY_WORDS);
    const localMeta = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    const originalSet = window.Storage.prototype.setItem;
    let failMetadata = true;
    const setItem = jest
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === STOKEY_SYNC && failMetadata) {
          failMetadata = false;
          throw new Error("Metadata persistence failed");
        }
        return originalSet.call(this, key, value);
      });
    try {
      await act(async () => {
        blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
      });
      await flush();
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(localValue);
      expect(hook.favWords).toEqual(localValue);
      expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toEqual(
        localMeta
      );
    } finally {
      setItem.mockRestore();
    }
  });

  test("rebases a queued edit on an already accepted remote transaction", async () => {
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    const remoteWrite = deferred();
    const remoteWords = packetValue(remotePackets[KV_WORDS_KEY]);
    const originalSet = browser.storage.local.set;
    const set = jest
      .spyOn(browser.storage.local, "set")
      .mockImplementation(async (entries) => {
        if (JSON.parse(entries[STOKEY_WORDS] || "null")?.remote)
          await remoteWrite.promise;
        return originalSet(entries);
      });
    try {
      await act(async () => {
        blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
      });
      await flush();
      expect(set).toHaveBeenCalledWith({
        [STOKEY_WORDS]: JSON.stringify(remoteWords),
      });
      act(() => {
        hook.toggleFav("second");
      });
      await advance(300);
      await act(async () => {
        remoteWrite.resolve();
      });
      await flush();
      latestDirtyTime = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
        .updateAt;
      // The remote transaction acquired the lock before the second edit. Its
      // accepted value is the base; the queued updater must retain that value.
      const expectedWords = {
        ...remoteWords,
        second: { createdAt: SECOND_EDIT_TIME },
      };
      expect(hook.favWords).toEqual(expectedWords);
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(expectedWords);
      expect(latestDirtyTime).toBeGreaterThan(
        remotePackets[KV_WORDS_KEY].updateAt
      );
      await advance(3000);
      expect(hook.favWords).toEqual(expectedWords);
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(expectedWords);
      expect(packetValue(remotePackets[KV_WORDS_KEY])).toEqual(expectedWords);
      expect(remotePackets[KV_WORDS_KEY].updateAt).toBeGreaterThanOrEqual(
        latestDirtyTime
      );
    } finally {
      remoteWrite.resolve();
      set.mockRestore();
    }
  });

  test("changing sync credentials resets metadata accepted for the old destination", async () => {
    await completeObsoleteReply();
    await advance(3000);
    await expectLatestConvergence();
    const acceptedMeta = (await getSyncWithDefault()).syncMeta;
    const destinationRevision =
      (await getSyncWithDefault()).destinationRevision || 0;
    expect(syncHook.sync.syncMeta).toEqual(acceptedMeta);
    await act(async () => {
      await syncHook.updateSync({ syncUser: "updated-user" });
    });
    expect((await getSyncWithDefault()).syncMeta).toEqual({});
    expect((await getSyncWithDefault()).syncUser).toBe("updated-user");
    expect((await getSyncWithDefault()).destinationRevision).toBeGreaterThan(
      destinationRevision
    );
  });

  test.each(["automatic", "manual"])(
    "a queued %s retry cannot overtake the first remote read",
    async (mode) => {
      await act(async () => {
        await updateSyncState((current) => ({
          ...current,
          syncMeta: {
            ...current.syncMeta,
            [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 0 },
          },
        }));
      });
      await act(async () => {
        hook.toggleFav("first");
      });
      await advance(3000);
      expect(wordReads).toBe(1);
      await act(async () => {
        hook.toggleFav("second");
      });
      await advance(mode === "automatic" ? 3000 : 300);
      latestDirtyTime = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]
        .updateAt;
      const manual = mode === "manual" ? trySyncWords() : undefined;
      await flush();
      expect(wordReads).toBe(1);
      await act(async () => {
        blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
        await manual;
      });
      await flush();
      await expectLatestConvergence();
    }
  );

  test("manual settings rollback compares raw data rather than normalized defaults", async () => {
    const local = { version: 3, marker: "local-setting" };
    await storage.setObj(STOKEY_SETTING, local);
    remotePackets[KV_SETTING_KEY] = makePacket(
      KV_SETTING_KEY,
      { version: 2, marker: "remote-setting" },
      100500
    );
    const originalSet = window.Storage.prototype.setItem;
    let failMetadata = true;
    const setItem = jest
      .spyOn(window.Storage.prototype, "setItem")
      .mockImplementation(function (key, value) {
        if (key === STOKEY_SYNC && failMetadata) {
          failMetadata = false;
          throw new Error("Metadata persistence failed");
        }
        return originalSet.call(this, key, value);
      });
    try {
      await expect(syncSettingAndRules()).rejects.toThrow(
        "Metadata persistence failed"
      );
      expect(await storage.getObj(STOKEY_SETTING)).toEqual(local);
      expect(
        (await getSyncWithDefault()).syncMeta[KV_SETTING_KEY].updateAt
      ).toBe(90000);
    } finally {
      setItem.mockRestore();
    }
  });

  test("an immediate manual retry uses the retained edit time before its metadata debounce", async () => {
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    await act(async () => {
      hook.toggleFav("second");
    });
    latestDirtyTime = SECOND_EDIT_TIME;
    await act(async () => {
      blockedReply.resolve(JSON.stringify(remotePackets[KV_WORDS_KEY]));
    });
    await flush();
    expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY].updateAt).toBe(
      SECOND_EDIT_TIME
    );
    await act(async () => {
      await trySyncWords();
    });
    await expectLatestConvergence();
  });
});
