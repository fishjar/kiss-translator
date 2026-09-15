import { storage } from "./storage";
import { subscribeStorageRefresh } from "./storageRefresh";
import { subscribeStorageWrite } from "./storageEvents";

const states = new Map();
const writeQueues = new Map();
const syncQueues = new Map();

function enqueue(queues, key, operation) {
  const pending = (queues.get(key) || Promise.resolve()).then(operation);
  const tail = pending
    .catch(() => {})
    .finally(() => {
      if (queues.get(key) === tail) queues.delete(key);
    });
  queues.set(key, tail);
  return pending;
}

export const enqueueStorageWrite = (key, operation) =>
  enqueue(writeQueues, key, operation);
export const enqueueStorageSync = (key, operation) =>
  enqueue(syncQueues, key, operation);
export const findStorageState = (key) => states.get(key);

export function isSameStorageValue(a, b) {
  if (Object.is(a, b)) return true;
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Array.isArray(a) === Array.isArray(b)
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** Share hydration, optimistic data and write order for one key in this page. */
export function getStorageState(key, defaultValue) {
  if (states.has(key)) return states.get(key);
  const listeners = new Set();
  let snapshot = { data: defaultValue, isLoading: true };
  let initialized = false;
  let revision = 0;
  let readId = 0;
  let readPromise;
  let pendingWrites = 0;
  let pendingMutations = 0;
  let pendingSyncs = 0;
  let reloadOnSubscribe = false;
  let editVersion = 0;
  let editTimestamp = 0;
  let failedRevision;
  let unsubscribeRefresh;
  let unsubscribeWrite;
  let dirty = false;
  let syncKey = "";
  let syncHandler;
  let syncTimer;

  const publish = (data = snapshot.data, isLoading = snapshot.isLoading) => {
    snapshot = { data, isLoading };
    listeners.forEach((listener) => listener(snapshot));
  };
  const disposeIfIdle = () => {
    if (
      listeners.size ||
      pendingWrites ||
      pendingMutations ||
      pendingSyncs ||
      syncTimer ||
      (dirty && syncHandler)
    )
      return;
    if (states.get(key) === state) states.delete(key);
    readId += 1;
  };
  const cancelSync = () => {
    clearTimeout(syncTimer);
    syncTimer = undefined;
  };
  const scheduleSync = () => {
    if (!dirty || !syncHandler || snapshot.data === null) return;
    cancelSync();
    syncTimer = setTimeout(() => {
      syncTimer = undefined;
      void syncHandler(state, revision, snapshot.data);
    }, 3000);
  };
  const enqueueWrite = (operation) => {
    pendingWrites += 1;
    const pending = enqueueStorageWrite(key, operation);
    pending
      .catch(() => {})
      .finally(() => {
        pendingWrites -= 1;
        disposeIfIdle();
      });
    return pending;
  };
  const enqueueSync = (operation) => {
    pendingSyncs += 1;
    const pending = enqueueStorageSync(key, operation);
    pending
      .catch(() => {})
      .finally(() => {
        pendingSyncs -= 1;
        disposeIfIdle();
      });
    return pending;
  };
  const load = () => {
    const currentRead = ++readId;
    const currentRevision = revision;
    const isCurrent = () =>
      currentRead === readId && currentRevision === revision;
    const pending = (async () => {
      try {
        await (writeQueues.get(key) || Promise.resolve());
        if (!isCurrent()) return;
        const storedValue = await storage.getObj(key);
        if (!isCurrent()) return;
        const value = storedValue ?? defaultValue;
        initialized = true;
        failedRevision = undefined;
        if (!isSameStorageValue(snapshot.data, value)) {
          revision += 1;
          dirty = false;
        }
        // Missing values are defaults in memory, never writes from a read.
        publish(value, false);
      } catch (error) {
        if (!isCurrent()) return;
        publish(snapshot.data, false);
        throw error;
      }
    })();
    readPromise = pending;
    const clear = () => {
      if (readPromise === pending) readPromise = undefined;
    };
    pending.then(clear, clear);
    return pending;
  };
  const ensureLoaded = async () => {
    while (!initialized && (listeners.size || pendingMutations)) {
      await (readPromise || load());
    }
  };
  const applySave = (valueOrFn) => {
    const value =
      typeof valueOrFn === "function" ? valueOrFn(snapshot.data) : valueOrFn;
    if (
      isSameStorageValue(snapshot.data, value) &&
      failedRevision !== revision
    ) {
      scheduleSync();
      return Promise.resolve(null);
    }
    const savedRevision = ++revision;
    const savedTimestamp = Date.now();
    editVersion += 1;
    editTimestamp = savedTimestamp;
    dirty = true;
    failedRevision = undefined;
    publish(value, false);
    if (value === null) return Promise.resolve(null);
    return enqueueWrite(async () => {
      try {
        if (syncKey) {
          const saved = await storage.saveEdit(key, value, syncKey, {
            timestamp: savedTimestamp,
          });
          if (revision === savedRevision) editTimestamp = saved.updateAt;
        } else {
          await storage.setObj(key, value);
        }
        if (revision === savedRevision) scheduleSync();
        return { value, revision: savedRevision };
      } catch (error) {
        if (revision === savedRevision) failedRevision = savedRevision;
        throw error;
      }
    });
  };
  const save = (valueOrFn) => {
    if (initialized) return applySave(valueOrFn);
    // Keep updater functions intact until their actual previous value is known.
    pendingMutations += 1;
    return ensureLoaded()
      .then(() => applySave(valueOrFn))
      .finally(() => {
        pendingMutations -= 1;
        disposeIfIdle();
      });
  };
  const remove = () => {
    cancelSync();
    const removedRevision = ++revision;
    editVersion += 1;
    dirty = false;
    initialized = true;
    failedRevision = undefined;
    publish(null, false);
    return enqueueWrite(async () => {
      try {
        await storage.del(key);
      } catch (error) {
        if (revision === removedRevision) failedRevision = removedRevision;
        throw error;
      }
    });
  };
  const state = {
    get snapshot() {
      return snapshot;
    },
    get revision() {
      return revision;
    },
    get dirty() {
      return dirty;
    },
    get editVersion() {
      return editVersion;
    },
    get editTimestamp() {
      return editTimestamp;
    },
    configureSync(keyToSync, handler) {
      syncKey = keyToSync;
      if (handler) syncHandler = handler;
      if (dirty) scheduleSync();
    },
    scheduleSync,
    cancelSync,
    subscribe(listener) {
      if (!listeners.size && reloadOnSubscribe) {
        reloadOnSubscribe = false;
        if (!pendingWrites && !pendingMutations) {
          initialized = false;
          snapshot = { data: snapshot.data, isLoading: true };
        }
      }
      listeners.add(listener);
      listener(snapshot);
      if (!unsubscribeRefresh)
        unsubscribeRefresh = subscribeStorageRefresh(key, load);
      if (!unsubscribeWrite) {
        unsubscribeWrite = subscribeStorageWrite(
          key,
          (value, hasSyncMetadata) => {
            if (pendingWrites) {
              // Do not replace a newer optimistic edit with an earlier own write.
              if (hasSyncMetadata)
                publish({ ...snapshot.data, syncMeta: value.syncMeta });
              return;
            }
            readId += 1;
            initialized = true;
            if (!isSameStorageValue(snapshot.data, value)) {
              revision += 1;
              dirty = false;
            }
            publish(value, false);
          }
        );
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          reloadOnSubscribe = true;
          unsubscribeRefresh?.();
          unsubscribeRefresh = undefined;
          unsubscribeWrite?.();
          unsubscribeWrite = undefined;
          // Pending user edits still need hydration after their owner closes.
          if (!pendingMutations) readId += 1;
          disposeIfIdle();
        }
      };
    },
    ensureLoaded,
    load,
    save,
    remove,
    enqueueWrite,
    enqueueSync,
    acceptValue(value) {
      cancelSync();
      initialized = true;
      failedRevision = undefined;
      revision += 1;
      dirty = false;
      publish(value, false);
      return revision;
    },
    markSynced(expectedRevision) {
      if (revision === expectedRevision) {
        dirty = false;
        cancelSync();
        disposeIfIdle();
      }
    },
  };
  states.set(key, state);
  return state;
}
