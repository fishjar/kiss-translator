import { createClient } from "webdav";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  apiCreateGist,
  apiGetGist,
  apiListGists,
  apiSyncData,
  apiUpdateGistFile,
} from "../apis";
import {
  KV_WORDS_KEY,
  OPT_SYNCTYPE_GIST,
  OPT_SYNCTYPE_WEBDAV,
  OPT_SYNCTYPE_WORKER,
  STOKEY_SYNC,
  STOKEY_WORDS,
} from "../config";
import { getSyncWithDefault, putSync, storage } from "./storage";
import { trySyncWords } from "./sync";
import { decryptSyncValue, encryptSyncValue } from "./syncCrypto";
import { useFavWords } from "../hooks/FavWords";
import { findStorageState } from "./storageState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./client", () => ({ isExt: false, isGm: false }));
jest.mock("./browser", () => ({ isOptions: () => true }));
jest.mock("./log", () => ({
  ...jest.requireActual("./log"),
  kissLog: jest.fn(),
}));
jest.mock("./fetch", () => ({ fetchPatcher: jest.fn(), fetchGM: jest.fn() }));
jest.mock("webdav", () => ({
  createClient: jest.fn(),
  getPatcher: () => ({ patch: jest.fn() }),
}));
jest.mock("../apis", () => ({
  apiSyncData: jest.fn(),
  apiCreateGist: jest.fn(),
  apiListGists: jest.fn(),
  apiGetGist: jest.fn(),
  apiUpdateGistFile: jest.fn(),
  apiFetchText: jest.fn(),
}));
jest.mock("./syncCrypto", () => {
  const { webcrypto } = require("crypto");
  const { TextDecoder, TextEncoder } = require("util");
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextDecoder", {
    value: TextDecoder,
    configurable: true,
  });
  Object.defineProperty(globalThis, "btoa", {
    value: (value) => Buffer.from(value, "binary").toString("base64"),
    configurable: true,
  });
  Object.defineProperty(globalThis, "atob", {
    value: (value) => Buffer.from(value, "base64").toString("binary"),
    configurable: true,
  });
  return jest.requireActual("./syncCrypto");
});

const CORRECT_KEY = "correct-review-passphrase";
const WRONG_KEY = "incorrect-review-passphrase";
const CLOUD_WORDS = { irreplaceable: { createdAt: 1 } };
const LOCAL_WORDS = { "new-local-word": { createdAt: 100000 } };
const GIST_FILENAME = `sync-words_${KV_WORDS_KEY}`;
const PROVIDERS = [
  ["WebDAV", OPT_SYNCTYPE_WEBDAV],
  ["Gist", OPT_SYNCTYPE_GIST],
  ["Worker", OPT_SYNCTYPE_WORKER],
];

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { resolve, promise };
}

async function seedConfiguration(syncType, syncEncryptKey = CORRECT_KEY) {
  await storage.setObj(STOKEY_WORDS, {});
  await storage.setObj(STOKEY_SYNC, {
    syncType,
    syncUrl:
      syncType === OPT_SYNCTYPE_GIST
        ? "review-gist"
        : "https://review.example.invalid",
    syncUser: "review-user",
    syncKey: "review-token",
    syncEncryptKey,
    syncMeta: {},
  });
}

async function createRemote() {
  let remote = {
    key: KV_WORDS_KEY,
    value: await encryptSyncValue(JSON.stringify(CLOUD_WORDS), CORRECT_KEY),
    updateAt: 50000,
  };
  let onRead;
  const writes = [];
  const read = jest.fn(async () => {
    const snapshot = JSON.stringify(remote);
    if (onRead) await onRead();
    return snapshot;
  });
  const write = (value) => {
    remote = JSON.parse(value);
    writes.push(remote);
  };
  createClient.mockReturnValue({
    exists: jest.fn(async () => true),
    getFileContents: read,
    putFileContents: jest.fn(async (_path, value) => write(value)),
  });
  apiGetGist.mockImplementation(async () => ({
    files: { [GIST_FILENAME]: { content: await read() } },
  }));
  apiUpdateGistFile.mockImplementation(async (_id, _token, _file, value) =>
    write(value)
  );
  apiListGists.mockResolvedValue([
    { id: "review-gist", description: "kiss translator sync files" },
  ]);
  apiSyncData.mockImplementation(async (_url, _token, packet) => {
    const cloud = JSON.parse(await read());
    if (cloud.updateAt >= packet.updateAt) return cloud;
    write(JSON.stringify(packet));
    return packet;
  });
  return {
    read,
    writes,
    get packet() {
      return remote;
    },
    setValue(value) {
      remote = { ...remote, value };
    },
    beforeRead(handler) {
      onRead = handler;
    },
  };
}

async function retainEditAfterOfflineAttempt(remote) {
  remote.beforeRead(() => {
    throw new Error("The first remote request is offline");
  });
  await trySyncWords();
  remote.beforeRead(undefined);
  await storage.saveEdit(STOKEY_WORDS, LOCAL_WORDS, KV_WORDS_KEY);
  expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toMatchObject({
    pendingUpload: true,
    updateAt: 100000,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.useFakeTimers();
  jest.setSystemTime(100000);
});

afterEach(() => {
  jest.useRealTimers();
});

describe.each(PROVIDERS)(
  "first-read verification through %s",
  (_name, type) => {
    test("repeated retries after failed decryption preserve the encrypted backup", async () => {
      await seedConfiguration(type, WRONG_KEY);
      const remote = await createRemote();
      const originalPacket = remote.packet;
      await trySyncWords();
      expect(remote.writes).toHaveLength(0);
      await storage.saveEdit(STOKEY_WORDS, LOCAL_WORDS, KV_WORDS_KEY);
      for (let retry = 0; retry < 3; retry += 1) {
        await trySyncWords();
        expect(remote.writes).toHaveLength(0);
        expect(remote.packet).toEqual(originalPacket);
      }
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
      expect((await getSyncWithDefault()).syncMeta[KV_WORDS_KEY]).toMatchObject(
        {
          pendingUpload: true,
          updateAt: 100000,
        }
      );
      await expect(
        decryptSyncValue(remote.packet.value, CORRECT_KEY)
      ).resolves.toMatchObject({ value: JSON.stringify(CLOUD_WORDS) });
    });

    test("a correct passphrase uploads the retained edit after an offline attempt", async () => {
      await seedConfiguration(type);
      const remote = await createRemote();
      await retainEditAfterOfflineAttempt(remote);
      await trySyncWords();
      expect(remote.writes).toHaveLength(1);
      await expect(
        decryptSyncValue(remote.packet.value, CORRECT_KEY)
      ).resolves.toMatchObject({ value: JSON.stringify(LOCAL_WORDS) });
      const metadata = (await getSyncWithDefault()).syncMeta[KV_WORDS_KEY];
      expect(metadata).toEqual({ updateAt: 100000, syncAt: 100000 });
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
    });

    test.each(["authenticated ciphertext", "invalid legacy JSON"])(
      "a damaged %s is not overwritten on a pending first sync",
      async (format) => {
        await seedConfiguration(type);
        const remote = await createRemote();
        await retainEditAfterOfflineAttempt(remote);
        if (format === "authenticated ciphertext") {
          const envelope = JSON.parse(remote.packet.value);
          envelope.data =
            (envelope.data[0] === "A" ? "B" : "A") + envelope.data.slice(1);
          remote.setValue(JSON.stringify(envelope));
        } else {
          remote.setValue("{incomplete JSON");
        }
        const originalPacket = remote.packet;
        await trySyncWords();
        expect(remote.writes).toHaveLength(0);
        expect(remote.packet).toEqual(originalPacket);
        expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
      }
    );

    test.each(["destination", "passphrase"])(
      "changing the %s during verification prevents the following upload",
      async (change) => {
        await seedConfiguration(type);
        const remote = await createRemote();
        await retainEditAfterOfflineAttempt(remote);
        const originalPacket = remote.packet;
        const started = deferred();
        const resume = deferred();
        remote.beforeRead(async () => {
          started.resolve();
          await resume.promise;
        });
        const pending = trySyncWords();
        try {
          await started.promise;
          if (change === "destination") {
            await putSync({
              syncUrl:
                type === OPT_SYNCTYPE_GIST
                  ? "new-destination-gist"
                  : "https://new-destination.example.invalid",
            });
          } else {
            await putSync(
              { syncEncryptKey: "a-new-passphrase" },
              { preserveDestination: true }
            );
          }
          const metadataAfterChange = (await getSyncWithDefault()).syncMeta;
          resume.resolve();
          await pending;
          expect(remote.writes).toHaveLength(0);
          expect(remote.packet).toEqual(originalPacket);
          expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
          expect((await getSyncWithDefault()).syncMeta).toEqual(
            metadataAfterChange
          );
        } finally {
          resume.resolve();
          await pending;
        }
      }
    );
  }
);

test("a pending first upload reuses the Gist created by verification", async () => {
  await seedConfiguration(OPT_SYNCTYPE_GIST);
  await putSync({ syncUrl: "" });
  await putSync({
    syncMeta: {
      [KV_WORDS_KEY]: {
        updateAt: 100000,
        firstAttemptAt: 90000,
        pendingUpload: true,
      },
    },
  });
  await storage.setObj(STOKEY_WORDS, LOCAL_WORDS);
  let createdPacket;
  // A new Gist may not yet appear in the eventually updated listing response.
  apiListGists.mockResolvedValue([]);
  apiCreateGist.mockImplementation(async (_token, { content }) => {
    createdPacket = JSON.parse(content);
    return { id: "newly-created-gist" };
  });
  apiGetGist.mockImplementation(async () => ({
    files: { [GIST_FILENAME]: { content: JSON.stringify(createdPacket) } },
  }));
  apiUpdateGistFile.mockImplementation(async (_id, _token, _file, content) => {
    createdPacket = JSON.parse(content);
  });
  await trySyncWords();
  expect(apiCreateGist).toHaveBeenCalledTimes(1);
  expect((await getSyncWithDefault()).syncUrl).toBe("newly-created-gist");
  expect(createdPacket.updateAt).toBe(100000);
  await expect(
    decryptSyncValue(createdPacket.value, CORRECT_KEY)
  ).resolves.toMatchObject({ value: JSON.stringify(LOCAL_WORDS) });
});

test.each(["manual", "automatic"])(
  "the vocabulary hook preserves the backup on %s sync after a wrong-passphrase failure",
  async (mode) => {
    await seedConfiguration(OPT_SYNCTYPE_WEBDAV, WRONG_KEY);
    const remote = await createRemote();
    const originalPacket = remote.packet;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let hook;
    function Host() {
      hook = useFavWords();
      return null;
    }
    try {
      await act(async () => {
        root.render(<Host />);
      });
      await act(async () => {
        for (let step = 0; step < 100; step += 1) await Promise.resolve();
      });
      await act(async () => {
        await trySyncWords();
      });
      expect(remote.writes).toHaveLength(0);
      await act(async () => {
        hook.toggleFav("new-local-word");
      });
      await act(async () => {
        jest.advanceTimersByTime(350);
        for (let step = 0; step < 100; step += 1) await Promise.resolve();
      });
      expect(hook.favWords).toEqual(LOCAL_WORDS);
      await act(async () => {
        if (mode === "manual") {
          await trySyncWords();
        } else {
          jest.advanceTimersByTime(3000);
          await findStorageState(STOKEY_WORDS).enqueueSync(async () => {});
        }
      });
      expect(remote.writes).toHaveLength(0);
      expect(remote.packet).toEqual(originalPacket);
      expect(hook.favWords).toEqual(LOCAL_WORDS);
      expect(await storage.getObj(STOKEY_WORDS)).toEqual(LOCAL_WORDS);
      await expect(
        decryptSyncValue(remote.packet.value, CORRECT_KEY)
      ).resolves.toMatchObject({ value: JSON.stringify(CLOUD_WORDS) });
    } finally {
      const state = findStorageState(STOKEY_WORDS);
      state?.markSynced(state.revision);
      act(() => root.unmount());
      container.remove();
      jest.clearAllTimers();
    }
  }
);
