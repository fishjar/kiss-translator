// Business writes complete in invocation order. Only one captured read response
// is delayed to expose compensation racing a later manual sync commit.

import { createClient } from "webdav";
import { browser } from "../libs/browser";
import { storage, getSyncWithDefault } from "../libs/storage";
import { trySyncWords } from "../libs/sync";
import {
  STOKEY_WORDS,
  STOKEY_SYNC,
  KV_WORDS_KEY,
  OPT_SYNCTYPE_WEBDAV,
} from "../config";

jest.mock("../libs/client", () => ({ isExt: true, isGm: false }));
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
jest.mock("../libs/browser", () => ({
  isOptions: () => true,
  browser: {
    storage: {
      local: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
    },
  },
}));
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

const LOCAL_WORDS = { local: { createdAt: 100 } };
const REMOTE_A_WORDS = { remoteA: { createdAt: 200 } };
const REMOTE_B_WORDS = { remoteB: { createdAt: 300 } };

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

function makePacket(value, updateAt) {
  return {
    key: KV_WORDS_KEY,
    value: `cipher:${JSON.stringify(value)}`,
    updateAt,
  };
}

async function flush() {
  for (let step = 0; step < 100; step += 1) await Promise.resolve();
}

describe("manual sync compensation serialization", () => {
  let values;
  let events;
  let remote;
  let blockedRollback;
  let armRollbackRead;
  let rollbackCaptured;
  let rollbackPending;
  let failAMetadata;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(400000);
    values = new Map();
    events = [];
    remote = makePacket(REMOTE_A_WORDS, 200);
    blockedRollback = deferred();
    armRollbackRead = false;
    rollbackCaptured = false;
    rollbackPending = false;
    failAMetadata = false;

    browser.storage.local.get.mockReset();
    browser.storage.local.set.mockReset();
    browser.storage.local.remove.mockReset();
    browser.storage.local.get.mockImplementation(async ([key]) => {
      const captured = { [key]: values.get(key) };
      if (key === STOKEY_WORDS && armRollbackRead) {
        armRollbackRead = false;
        rollbackCaptured = true;
        rollbackPending = true;
        events.push("A rollback read captured RA");
        await blockedRollback.promise;
        events.push("A rollback read returned captured RA");
      }
      return captured;
    });
    browser.storage.local.set.mockImplementation(async (entries) => {
      for (const [key, value] of Object.entries(entries)) {
        if (key === STOKEY_SYNC) {
          const metadata = JSON.parse(value).syncMeta?.[KV_WORDS_KEY];
          if (failAMetadata && metadata?.updateAt === 200) {
            failAMetadata = false;
            armRollbackRead = true;
            events.push("A metadata failed; rollback read armed");
            throw new Error("A metadata persistence failed");
          }
          if (metadata?.updateAt === 300) {
            events.push("B metadata committed");
            if (rollbackPending) {
              events.push("B metadata committed while A rollback pending");
            }
          }
        }
        // Successful writes are applied immediately and never reordered.
        values.set(key, value);
        if (key === STOKEY_WORDS) {
          const words = JSON.parse(value);
          events.push(
            words.remoteB ? "write RB" : words.remoteA ? "write RA" : "write L"
          );
        }
      }
    });
    browser.storage.local.remove.mockImplementation(async ([key]) => {
      values.delete(key);
    });
    createClient.mockReset();
    createClient.mockReturnValue({
      exists: jest.fn(async () => true),
      getFileContents: jest.fn(async () => JSON.stringify(remote)),
      putFileContents: jest.fn(async (_path, content) => {
        remote = JSON.parse(content);
      }),
    });

    await storage.setObj(STOKEY_WORDS, LOCAL_WORDS);
    await storage.setObj(STOKEY_SYNC, {
      syncType: OPT_SYNCTYPE_WEBDAV,
      syncUrl: "https://sync.example.invalid",
      syncUser: "review-user",
      syncKey: "review-token",
      syncEncryptKey: "review-passphrase",
      syncMeta: { [KV_WORDS_KEY]: { updateAt: 100, syncAt: 50 } },
    });
    events.length = 0;
    failAMetadata = true;
  });

  afterEach(() => {
    blockedRollback.resolve();
    jest.useRealTimers();
  });

  test("A rollback completes before a later B commit can be acknowledged", async () => {
    const firstSync = trySyncWords().then(() => events.push("A complete"));
    let secondSync;
    try {
      await flush();
      expect(rollbackCaptured).toBe(true);
      expect(JSON.parse(values.get(STOKEY_WORDS))).toEqual(REMOTE_A_WORDS);

      remote = makePacket(REMOTE_B_WORDS, 300);
      secondSync = trySyncWords().then(() => events.push("B complete"));
      await flush();
    } finally {
      // A corrected shared queue may block B here. Release A before awaiting
      // either operation so that correct serialization cannot deadlock the test.
      rollbackPending = false;
      events.push("release A rollback read");
      blockedRollback.resolve();
      await Promise.all([firstSync, secondSync].filter(Boolean));
    }

    const persisted = await storage.getObj(STOKEY_WORDS);
    const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
    console.log(
      "SYNC_ROLLBACK_SERIALIZATION_EVIDENCE",
      JSON.stringify({
        events,
        persisted,
        metadata,
        remoteValue: JSON.parse(remote.value.slice(7)),
      })
    );
    expect(events).not.toContain(
      "B metadata committed while A rollback pending"
    );
    expect(persisted).toEqual(REMOTE_B_WORDS);
    expect(metadata.updateAt).toBe(300);
    expect(JSON.parse(remote.value.slice(7))).toEqual(REMOTE_B_WORDS);

    await trySyncWords();
    expect(await storage.getObj(STOKEY_WORDS)).toEqual(REMOTE_B_WORDS);
    expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY].updateAt).toBe(
      300
    );
  });
});
