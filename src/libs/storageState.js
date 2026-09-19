import { storage } from "./storage";
import { STOKEY_SYNC } from "../config";
import { subscribeStorageRefresh } from "./storageRefresh";
import {
  subscribeStorageInvalidation,
  subscribeStorageWrite,
} from "./storageEvents";
import { cloneStorageValue, isSameStorageValue } from "./storageEquality";

export { isSameStorageValue } from "./storageEquality";

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

/**
 * A page owns its confirmed base and ordered, pure edit intents. Reducers may
 * run for previews and rebasing; each intent submits at most once. Persistence
 * owns timestamps, and the sync controller owns accepting remote responses.
 */
export function getStorageState(key, defaultValue) {
  if (states.has(key)) return states.get(key);
  const listeners = new Set();
  let base = defaultValue;
  let snapshot = { data: defaultValue, isLoading: true };
  let initialized = false;
  let revision = 0;
  let editVersion = 0;
  let committedEditVersion = 0;
  let editTimestamp = 0;
  let pending = [];
  let pendingWrites = 0;
  let pendingSyncs = 0;
  let readPromise;
  let readVersion = 0;
  let subscriptionVersion = 0;
  let reloadOnSubscribe = false;
  let dirty = false;
  let recovering = false;
  let lastError = null;
  let syncKey = "";
  let syncHandler;
  let syncTimer;
  let subscriptions = [];
  let invalidation = 0;
  let refreshScheduled = false;

  const project = () => {
    let value = base;
    if (!initialized) return value;
    for (const intent of pending) {
      if (intent.cancelled) continue;
      if (intent.kind !== "save") {
        value = null;
      } else {
        value =
          typeof intent.valueOrFn === "function"
            ? intent.valueOrFn(value ?? defaultValue)
            : intent.valueOrFn;
        if (value && typeof value.then === "function") {
          throw new TypeError("Storage reducers must be synchronous");
        }
      }
    }
    return value;
  };
  const publish = () => {
    let data = base;
    try {
      data = project();
    } catch (error) {
      // The authoritative reducer will reject and reconcile this edit.
      lastError = error;
    }
    snapshot = {
      data,
      isLoading: !initialized,
      isSaving: pending.length > 0,
      isRecovering: recovering,
      error: lastError,
    };
    listeners.forEach((listener) => listener(snapshot));
  };
  const disposeIfIdle = () => {
    if (
      listeners.size ||
      pending.length ||
      pendingWrites ||
      pendingSyncs ||
      syncTimer ||
      readPromise ||
      refreshScheduled ||
      recovering ||
      (dirty && syncHandler)
    )
      return;
    if (states.get(key) === state) states.delete(key);
  };
  const cancelSync = () => {
    clearTimeout(syncTimer);
    syncTimer = undefined;
  };
  const scheduleSync = () => {
    if (!dirty || !syncHandler || pending.length || recovering || base === null)
      return;
    cancelSync();
    syncTimer = setTimeout(() => {
      syncTimer = undefined;
      if (!pending.length && !recovering)
        void syncHandler(state, revision, base);
    }, 3000);
  };
  const enqueueWrite = (operation) => {
    pendingWrites += 1;
    const result = enqueueStorageWrite(key, operation);
    result
      .catch(() => {})
      .finally(() => {
        pendingWrites -= 1;
        disposeIfIdle();
      });
    return result;
  };
  const enqueueSync = (operation) => {
    pendingSyncs += 1;
    const result = enqueueStorageSync(key, operation);
    result
      .catch(() => {})
      .finally(() => {
        pendingSyncs -= 1;
        disposeIfIdle();
      });
    return result;
  };
  const adoptBase = (value) => {
    if (!isSameStorageValue(base, value)) revision += 1;
    base = value;
    initialized = true;
    publish();
  };
  const readCurrent = async (isCurrent = () => true) => {
    // A coordinator read waits for accepted commits whose reply was lost.
    const recovered = await storage.withTransaction(async (transaction) => ({
      value: await transaction.getObj(key),
      metadata:
        recovering && syncKey
          ? (await transaction.getObj(STOKEY_SYNC))?.syncMeta?.[syncKey]
          : undefined,
    }));
    if (!isCurrent()) return;
    const { value, metadata } = recovered;
    if (recovering && metadata) editTimestamp = metadata.updateAt || 0;
    // An explicit deletion remains null in its current controller. Only initial
    // hydration supplies a default for a missing key.
    const current =
      value == null && initialized && base === null
        ? null
        : (value ?? defaultValue);
    if (!isSameStorageValue(base, current)) dirty = false;
    adoptBase(current);
    recovering = false;
    publish();
  };
  const load = () => {
    const requestReadVersion = ++readVersion;
    const requestSubscriptionVersion = subscriptionVersion;
    const requestEditVersion = editVersion;
    const isCurrent = () =>
      requestReadVersion === readVersion &&
      requestSubscriptionVersion === subscriptionVersion &&
      requestEditVersion === editVersion;
    const result = enqueueWrite(async () => {
      try {
        await readCurrent(isCurrent);
      } catch (error) {
        if (!isCurrent()) return;
        lastError = error;
        initialized = true;
        recovering = true;
        publish();
        throw error;
      }
    });
    readPromise = result;
    const complete = () => {
      if (readPromise === result) readPromise = undefined;
      disposeIfIdle();
    };
    result.then(complete, complete);
    return result;
  };
  const requestRefresh = () => {
    invalidation += 1;
    if (refreshScheduled) return;
    refreshScheduled = true;
    // Events can run inside a transaction. Never wait for this read there.
    Promise.resolve().then(async () => {
      try {
        let observed;
        do {
          observed = invalidation;
          await load();
        } while (observed !== invalidation && listeners.size);
      } catch {
        // load publishes the error; a later event or explicit reload can retry.
      } finally {
        refreshScheduled = false;
        disposeIfIdle();
      }
    });
  };
  const ensureLoaded = async () => {
    // An invalidation can supersede a read without initializing this state.
    // Wait for its replacement before callers rely on a hydrated snapshot.
    while (!initialized) await (readPromise || load());
  };

  const submit = (kind, valueOrFn) => {
    if (recovering) {
      const error = new Error("Reload storage before saving another edit");
      error.storageOutcome = "unknown";
      return Promise.reject(error);
    }
    const intent = {
      kind,
      valueOrFn:
        typeof valueOrFn === "function"
          ? valueOrFn
          : cloneStorageValue(valueOrFn),
      timestamp: Date.now(),
      version: ++editVersion,
      cancelled: null,
    };
    pending.push(intent);
    revision += 1;
    lastError = null;
    cancelSync();
    publish();
    return enqueueWrite(async () => {
      if (intent.cancelled) throw intent.cancelled;
      try {
        let receipt;
        if (kind === "remove") {
          await storage.del(key);
          receipt = { value: null, changed: true };
        } else if (kind === "transient") {
          // Preserve the legacy local-only save(null) behavior.
          receipt = { value: null, changed: false };
        } else {
          receipt = await storage.saveEdit(key, intent.valueOrFn, syncKey, {
            timestamp: intent.timestamp,
            defaultValue,
          });
        }
        // Acknowledge before the next write or reload may run.
        pending = pending.filter((item) => item !== intent);
        if (kind !== "save") {
          dirty = false;
        } else if (receipt.changed) {
          committedEditVersion += 1;
          editTimestamp = receipt.updateAt;
          dirty = true;
        }
        adoptBase(receipt.value);
        scheduleSync();
        return { ...receipt, revision, editVersion: intent.version };
      } catch (error) {
        // Rejection does not prove absence of a commit. Never replay a toggle.
        const cancelled = new Error(
          "An earlier storage edit failed; reload and retry"
        );
        cancelled.cause = error;
        for (const item of pending) item.cancelled = cancelled;
        pending = [];
        recovering = true;
        dirty = false;
        lastError = error;
        revision += 1;
        cancelSync();
        publish();
        try {
          await readCurrent();
        } catch {
          // Remain blocked until a coordinator-protected read succeeds.
          recovering = true;
          publish();
        }
        throw error;
      }
    });
  };
  const save = (valueOrFn) =>
    submit(valueOrFn === null ? "transient" : "save", valueOrFn);
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
    get committedEditVersion() {
      return committedEditVersion;
    },
    get editTimestamp() {
      return editTimestamp;
    },
    get hasPendingEdits() {
      return pending.length > 0;
    },
    get isRecovering() {
      return recovering;
    },
    configureSync(keyToSync, handler) {
      syncKey = keyToSync;
      if (handler) syncHandler = handler;
      scheduleSync();
    },
    subscribe(listener) {
      if (!listeners.size && reloadOnSubscribe) {
        reloadOnSubscribe = false;
        requestRefresh();
      }
      listeners.add(listener);
      listener(snapshot);
      if (!subscriptions.length) {
        subscriptions = [
          subscribeStorageRefresh(key, load),
          subscribeStorageWrite(key, requestRefresh),
          subscribeStorageInvalidation(key, requestRefresh),
        ];
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          subscriptionVersion += 1;
          reloadOnSubscribe = true;
          subscriptions.forEach((unsubscribe) => unsubscribe());
          subscriptions = [];
          disposeIfIdle();
        }
      };
    },
    ensureLoaded,
    load,
    save,
    remove: () => submit("remove"),
    enqueueWrite,
    enqueueSync,
    scheduleSync,
    cancelSync,
    acceptValue(value) {
      if (pending.length || recovering) return revision;
      cancelSync();
      dirty = false;
      lastError = null;
      adoptBase(value);
      return revision;
    },
    markSynced(expectedRevision) {
      if (revision === expectedRevision && !pending.length && !recovering) {
        dirty = false;
        cancelSync();
        disposeIfIdle();
      }
    },
  };
  states.set(key, state);
  return state;
}
