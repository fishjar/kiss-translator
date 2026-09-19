// A failed legacy rewrite must not split hook state from committed storage.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "webdav";
import { useFavWords } from "./FavWords";
import { storage, getSyncWithDefault } from "../libs/storage";
import {
  STOKEY_WORDS,
  STOKEY_SYNC,
  KV_WORDS_KEY,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/client", () => ({ isExt: false, isGm: false }));
jest.mock("../libs/browser", () => ({ isOptions: () => true }));
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
  decryptSyncValue: async (value) =>
    value.startsWith("cipher:")
      ? { value: value.slice(7), encrypted: true }
      : { value, encrypted: false },
}));

const INITIAL_WORDS = { initial: { createdAt: 1 } };
const LOCAL_WORDS = {
  initial: { createdAt: 1 },
  first: { createdAt: 100000 },
};
const REMOTE_WORDS = { remote: { createdAt: 100500 } };

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

async function flush() {
  await act(async () => {
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
  });
}

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let step = 0; step < 30; step += 1) await Promise.resolve();
  });
}

describe("legacy migration failure after sync adoption", () => {
  let root;
  let container;
  let hook;
  let blockedReply;
  let remoteClient;

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
        [KV_WORDS_KEY]: { updateAt: 90000, syncAt: 90001 },
      },
    });
    blockedReply = deferred();
    remoteClient = {
      exists: jest.fn(async () => true),
      getFileContents: jest.fn(() => blockedReply.promise),
      putFileContents: jest.fn(async () => {
        throw new Error("Legacy migration upload failed");
      }),
    };
    createClient.mockReturnValue(remoteClient);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    function Host() {
      hook = useFavWords();
      return null;
    }
    await act(async () => {
      root.render(<Host />);
    });
    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("a rejected legacy rewrite leaves a coherent value and metadata pair", async () => {
    await act(async () => {
      hook.toggleFav("first");
    });
    await advance(300);
    await advance(2700);
    expect(remoteClient.getFileContents).toHaveBeenCalledTimes(1);
    expect(hook.favWords).toEqual(LOCAL_WORDS);
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
    const localMeta = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(localMeta.updateAt).toBeLessThan(100500);

    await act(async () => {
      blockedReply.resolve(
        JSON.stringify({
          key: KV_WORDS_KEY,
          value: JSON.stringify(REMOTE_WORDS),
          updateAt: 100500,
        })
      );
    });
    await flush();

    expect(remoteClient.putFileContents).toHaveBeenCalledTimes(1);
    const attemptedMigration = JSON.parse(
      remoteClient.putFileContents.mock.calls[0][1]
    );
    expect(attemptedMigration.updateAt).toBe(100500);
    expect(attemptedMigration.value).toBe(
      `cipher:${JSON.stringify(REMOTE_WORDS)}`
    );

    const persisted = await storage.getObj(STOKEY_WORDS);
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    expect(hook.favWords).toEqual(persisted);
    // Either coherent adoption or coherent rollback is acceptable. A successful
    // value commit cannot leave the UI stale or acknowledge a rolled-back value.
    expect([
      { value: REMOTE_WORDS, updateAt: 100500 },
      { value: LOCAL_WORDS, updateAt: localMeta.updateAt },
    ]).toContainEqual({ value: persisted, updateAt: metadata.updateAt });
  });

  test("a pending legacy rewrite does not hold the local business write queue", async () => {
    const migration = deferred();
    remoteClient.putFileContents.mockReturnValue(migration.promise);
    try {
      await act(async () => {
        hook.toggleFav("first");
      });
      await advance(300);
      await advance(2700);
      await act(async () => {
        blockedReply.resolve(
          JSON.stringify({
            key: KV_WORDS_KEY,
            value: JSON.stringify(REMOTE_WORDS),
            updateAt: 100500,
          })
        );
      });
      await flush();
      expect(remoteClient.putFileContents).toHaveBeenCalledTimes(1);
      expect(hook.favWords).toEqual(REMOTE_WORDS);
      await act(async () => {
        hook.toggleFav("second");
      });
      await flush();
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(hook.favWords);
      expect(await storage.getObj(STOKEY_WORDS)).toHaveProperty("second");
    } finally {
      migration.resolve();
      await flush();
    }
  });
});
