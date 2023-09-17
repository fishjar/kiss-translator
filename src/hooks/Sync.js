import { useCallback } from "react";
import { STOKEY_SYNC, DEFAULT_SYNC } from "../config";
import { useStorage } from "./Storage";

/**
 * sync hook
 * @returns
 */
export function useSync() {
  const { data, update, reload } = useStorage(STOKEY_SYNC, DEFAULT_SYNC);
  return { sync: data, updateSync: update, reloadSync: reload };
}

/**
 * caches sync hook
 * @param {*} url
 * @returns
 */
export function useSyncCaches() {
  const { sync, updateSync, reloadSync } = useSync();

  const updateDataCache = useCallback(
    async (url) => {
      const dataCaches = sync?.dataCaches || {};
      dataCaches[url] = Date.now();
      await updateSync({ dataCaches });
    },
    [sync, updateSync]
  );

  const deleteDataCache = useCallback(
    async (url) => {
      const dataCaches = sync?.dataCaches || {};
      delete dataCaches[url];
      await updateSync({ dataCaches });
    },
    [sync, updateSync]
  );

  return {
    dataCaches: sync?.dataCaches || {},
    updateDataCache,
    deleteDataCache,
    reloadSync,
  };
}
