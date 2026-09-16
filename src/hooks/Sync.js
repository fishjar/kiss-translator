import { useCallback, useEffect, useRef, useState } from "react";
import { STOKEY_SYNC, DEFAULT_SYNC } from "../config";
import { useStorage } from "./Storage";
import {
  getSyncWithDefault,
  putSyncMeta,
  storage,
  updateSyncState,
} from "../libs/storage";
import { kissLog } from "../libs/log";

/** Read and mutate the current sync configuration. */
export function useSync() {
  const { data, update, reload } = useStorage(STOKEY_SYNC, DEFAULT_SYNC);
  return { sync: data, updateSync: update, reloadSync: reload };
}

/** Retain the legacy hook while updating metadata inside its transaction. */
export function useSyncMeta() {
  const updateSyncMeta = useCallback((key) => putSyncMeta(key), []);
  return { updateSyncMeta };
}

// Keep cache mutations ordered even when the initiating Rules view unmounts.
let syncCacheWriteQueue = Promise.resolve();

function enqueueSyncCacheOperation(operation) {
  const pending = syncCacheWriteQueue.then(operation, operation);
  syncCacheWriteQueue = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

async function readSyncCacheState() {
  // Userscript settings can be opened before any background initialization.
  await storage.trySetObj(STOKEY_SYNC, DEFAULT_SYNC);
  return getSyncWithDefault();
}

function writeSyncCache(url, timestamp) {
  return enqueueSyncCacheOperation(async () => {
    const saved = await updateSyncState((current) => {
      const dataCaches = { ...current.dataCaches };
      if (timestamp === undefined) delete dataCaches[url];
      else dataCaches[url] = timestamp;
      return { ...current, dataCaches };
    });
    return saved.dataCaches;
  });
}

/** Load cache timestamps without persisting previously loaded sync snapshots. */
export function useSyncCaches() {
  const [dataCaches, setDataCaches] = useState({});
  const mountedRef = useRef(false);
  const readRevisionRef = useRef(0);

  const reloadSync = useCallback(async () => {
    const revision = ++readRevisionRef.current;
    const sync = await enqueueSyncCacheOperation(readSyncCacheState);
    if (mountedRef.current && revision === readRevisionRef.current) {
      setDataCaches(sync.dataCaches || {});
    }
    return sync;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    reloadSync().catch((error) => kissLog("load sync caches", error));
    return () => {
      mountedRef.current = false;
      readRevisionRef.current += 1;
    };
  }, [reloadSync]);

  const mutateCache = useCallback(async (url, timestamp) => {
    readRevisionRef.current += 1;
    const nextCaches = await writeSyncCache(url, timestamp);
    readRevisionRef.current += 1;
    if (mountedRef.current) setDataCaches(nextCaches);
    return nextCaches;
  }, []);

  const updateDataCache = useCallback(
    (url) => mutateCache(url, Date.now()),
    [mutateCache]
  );
  const deleteDataCache = useCallback(
    (url) => mutateCache(url, undefined),
    [mutateCache]
  );

  return { dataCaches, updateDataCache, deleteDataCache, reloadSync };
}
