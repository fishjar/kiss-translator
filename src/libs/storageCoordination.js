import { isExt, isGm } from "./client";
import { browser, isBg } from "./browser";

const LOCK_NAME = "kiss-storage-transaction";
let queue = Promise.resolve();
let databasePromise;
let installed = false;

function storageFailure(error, outcome = "not-committed") {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.storageOutcome = failure.storageRecoveryFailed
    ? "unknown"
    : failure.storageOutcome || outcome;
  return failure;
}

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
        if (value === null ? current[key] != null : current[key] !== value) {
          if (
            current[key] !== previous &&
            (current[key] != null || previous != null)
          )
            error.storageOutcome = "unknown";
          continue;
        }
        if (previous === undefined || previous === null)
          await browser.storage.local.remove([key]);
        else await browser.storage.local.set({ [key]: previous });
      } catch {
        error.storageRecoveryFailed = true;
      }
    }
    throw storageFailure(error);
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
    let commitSent = false;
    let commitAcknowledged = false;
    const disconnectedError = () =>
      storageFailure(
        new Error("Storage coordinator disconnected"),
        commitSent ? "unknown" : "not-committed"
      );
    const onDisconnect = () => {
      disconnected = true;
      const error = disconnectedError();
      commitReply?.reject(error);
      if (!finished && !granted) reject(error);
    };
    port.onDisconnect.addListener(onDisconnect);
    port.onMessage.addListener(async (message) => {
      if (message.type === "committed") {
        if (message.error) {
          const error = new Error(message.error);
          error.storageRecoveryFailed = message.storageRecoveryFailed;
          error.storageOutcome = message.storageOutcome;
          commitReply?.reject(storageFailure(error));
        } else {
          commitAcknowledged = true;
          commitReply?.resolve();
        }
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
                rejectCommit(disconnectedError());
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
              try {
                port.postMessage({ type: "commit", entries });
                commitSent = true;
              } catch (error) {
                commitReply = undefined;
                rejectCommit(storageFailure(error));
              }
            }),
        });
        if (disconnected && !commitAcknowledged) throw disconnectedError();
        finished = true;
        resolve(value);
      } catch (error) {
        finished = true;
        reject(storageFailure(error, commitSent ? "unknown" : "not-committed"));
      } finally {
        port.onDisconnect.removeListener(onDisconnect);
        // Cleanup cannot turn an acknowledged commit into a reported failure.
        try {
          if (!disconnected) port.postMessage({ type: "release" });
        } catch {
          // Disconnect also releases this owner in the background.
        }
        try {
          port.disconnect();
        } catch {
          // The browser may have already destroyed the document's port.
        }
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
      reject(
        storageFailure(
          transaction.error || new Error("Storage coordination aborted"),
          started ? "unknown" : "not-committed"
        )
      );
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
  }).catch((error) => {
    throw storageFailure(error);
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
              storageOutcome: error.storageOutcome,
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
