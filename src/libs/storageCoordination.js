import { isExt, isGm } from "./client";
import { browser, isBg } from "./browser";

const LOCK_NAME = "kiss-storage-transaction";
let queue = Promise.resolve();
let databasePromise;
let installed = false;

function enqueue(operation) {
  const pending = queue.then(operation);
  queue = pending.catch(() => {});
  return pending;
}

async function commitExtensionWrites(entries) {
  const attempted = [];
  try {
    if (entries.every(({ value }) => value !== null)) {
      attempted.push(...entries);
      await browser.storage.local.set(
        Object.fromEntries(entries.map(({ key, value }) => [key, value]))
      );
    } else {
      for (const entry of entries) {
        attempted.push(entry);
        if (entry.value === null)
          await browser.storage.local.remove([entry.key]);
        else await browser.storage.local.set({ [entry.key]: entry.value });
      }
    }
  } catch (error) {
    for (const { key, value, previous } of attempted.reverse()) {
      try {
        const current = await browser.storage.local.get([key]);
        if (value === null ? current[key] != null : current[key] !== value)
          continue;
        if (previous === undefined || previous === null)
          await browser.storage.local.remove([key]);
        else await browser.storage.local.set({ [key]: previous });
      } catch {
        error.storageRecoveryFailed = true;
      }
    }
    throw error;
  }
}

function withBackgroundLock(operation) {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: LOCK_NAME });
    let granted = false;
    let finished = false;
    let disconnected = false;
    let commitReply;
    let commitStarted = false;
    const onDisconnect = () => {
      disconnected = true;
      const error = new Error("Storage coordinator disconnected");
      commitReply?.reject(error);
      if (!finished && !granted) reject(error);
    };
    port.onDisconnect.addListener(onDisconnect);
    port.onMessage.addListener(async (message) => {
      if (message.type === "committed") {
        if (message.error) {
          const error = new Error(message.error);
          error.storageRecoveryFailed = message.storageRecoveryFailed;
          commitReply?.reject(error);
        } else commitReply?.resolve();
        commitReply = undefined;
        return;
      }
      if (message.type !== "granted" || granted || finished) return;
      granted = true;
      try {
        const value = await operation({
          commit: (entries) =>
            new Promise((resolveCommit, rejectCommit) => {
              if (disconnected) {
                rejectCommit(new Error("Storage coordinator disconnected"));
                return;
              }
              if (commitStarted) {
                rejectCommit(
                  new Error("A storage transaction can commit only once")
                );
                return;
              }
              commitStarted = true;
              commitReply = { resolve: resolveCommit, reject: rejectCommit };
              port.postMessage({ type: "commit", entries });
            }),
        });
        if (disconnected) throw new Error("Storage coordinator disconnected");
        finished = true;
        port.postMessage({ type: "release" });
        resolve(value);
      } catch (error) {
        finished = true;
        reject(error);
      } finally {
        port.onDisconnect.removeListener(onDisconnect);
        port.disconnect();
      }
    });
  });
}

function getLockDatabase() {
  if (!databasePromise) {
    const pending = new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCK_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("lock");
      request.onsuccess = () => {
        const database = request.result;
        const invalidate = () => {
          if (databasePromise === pending) databasePromise = undefined;
          database.close();
        };
        database.onclose = invalidate;
        database.onversionchange = invalidate;
        resolve({ database, invalidate });
      };
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      if (databasePromise === pending) databasePromise = undefined;
      throw error;
    });
    databasePromise = pending;
  }
  return databasePromise;
}

/** Keep one IndexedDB transaction alive as an origin-wide mutex. */
async function withIndexedDbLock(operation, reopened = false) {
  const { database, invalidate } = await getLockDatabase();
  let transaction;
  try {
    transaction = database.transaction("lock", "readwrite");
  } catch (error) {
    if (error?.name !== "InvalidStateError") throw error;
    invalidate();
    // A forced close can precede its close event. Retry only before work starts.
    if (!reopened) return withIndexedDbLock(operation, true);
    throw error;
  }
  return new Promise((resolve, reject) => {
    const store = transaction.objectStore("lock");
    let started = false;
    let completed = false;
    let result;
    let failure;
    let failed = false;
    const keepAlive = () => {
      const request = store.get("owner");
      request.onsuccess = () => {
        if (!started) {
          started = true;
          Promise.resolve()
            .then(operation)
            .then(
              (value) => {
                result = value;
                completed = true;
              },
              (error) => {
                failure = error;
                failed = true;
                completed = true;
              }
            );
        }
        if (!completed) keepAlive();
      };
    };
    transaction.oncomplete = () => (failed ? reject(failure) : resolve(result));
    transaction.onabort = () =>
      reject(transaction.error || new Error("Storage coordination aborted"));
    transaction.onerror = () => {};
    keepAlive();
  });
}

/** Only short storage operations belong here; network requests must run outside. */
export function withStorageLock(operation) {
  return enqueue(() => {
    if (isExt) {
      return isBg?.()
        ? operation({ commit: commitExtensionWrites })
        : withBackgroundLock(operation);
    }
    // Userscript storage is shared across origins, so origin locks do not apply.
    if (isGm) return operation();
    if (globalThis.navigator?.locks?.request) {
      return navigator.locks.request(LOCK_NAME, operation);
    }
    if (typeof indexedDB !== "undefined") return withIndexedDbLock(operation);
    // jsdom has no cross-document storage or browser lock primitives.
    if (process.env.NODE_ENV === "test") return operation();
    throw new Error("Cross-page storage coordination is unavailable");
  });
}

/** Share the background queue with Options, Popup and content-script callers. */
export function installStorageCoordinator() {
  if (installed) return;
  installed = true;
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== LOCK_NAME) return;
    let disconnected = false;
    let granted = false;
    let pendingCommit;
    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    port.onDisconnect.addListener(() => {
      disconnected = true;
      release();
    });
    port.onMessage.addListener((message) => {
      if (message.type === "release") release();
      if (
        message.type !== "commit" ||
        !granted ||
        disconnected ||
        pendingCommit
      )
        return;
      pendingCommit = commitExtensionWrites(message.entries).then(
        () => {
          if (!disconnected) port.postMessage({ type: "committed" });
        },
        (error) => {
          if (!disconnected)
            port.postMessage({
              type: "committed",
              error: error.message,
              storageRecoveryFailed: error.storageRecoveryFailed,
            });
        }
      );
    });
    enqueue(async () => {
      if (disconnected) return;
      try {
        granted = true;
        port.postMessage({ type: "granted" });
        await released;
        await pendingCommit;
      } catch {
        // A closed document cannot retain a lock or block the next writer.
      }
    });
  });
}
