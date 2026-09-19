import { useCallback, useEffect, useRef, useState } from "react";
import { getStorageState } from "../libs/storageState";
import { cloneStorageValue } from "../libs/storageEquality";
import { syncStorageState } from "../libs/storageSyncController";
import { kissLog } from "../libs/log";
import { isOptions } from "../libs/browser";

/** Subscribe to a page controller; persistence and synchronization outlive views. */
export function useStorage(key, defaultVal = null, syncKey = "") {
  const [snapshot, setSnapshot] = useState({
    data: defaultVal,
    isLoading: true,
  });
  const scopeRef = useRef(null);

  useEffect(() => {
    const state = getStorageState(key, defaultVal);
    state.configureSync(
      syncKey,
      syncKey && isOptions()
        ? (owner, revision, value) =>
            syncStorageState(key, syncKey, owner, revision, value)
        : undefined
    );
    const scope = { key, state, active: true };
    scopeRef.current = scope;
    const unsubscribe = state.subscribe((next) => {
      if (scope.active) setSnapshot(next);
    });
    state.ensureLoaded().catch((error) => {
      if (scope.active) kissLog("Storage load failed", key, error);
    });
    return () => {
      scope.active = false;
      unsubscribe();
    };
  }, [key, defaultVal, syncKey]);

  const save = useCallback(
    (valueOrFn) => {
      const scope = scopeRef.current;
      if (!scope?.active || scope.key !== key) return Promise.resolve();
      const pending = scope.state.save(valueOrFn);
      // Observe fire-and-forget errors without converting rejection into success.
      pending.catch((error) => kissLog("Storage save failed", key, error));
      return pending;
    },
    [key]
  );

  const update = useCallback(
    (partialDataOrFn) => {
      const input =
        typeof partialDataOrFn === "function"
          ? partialDataOrFn
          : cloneStorageValue(partialDataOrFn);
      return save((previous) => {
        const partial = typeof input === "function" ? input(previous) : input;
        const base =
          typeof previous === "object" && previous !== null ? previous : {};
        return { ...base, ...partial };
      });
    },
    [save]
  );

  const remove = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.key !== key) return Promise.resolve();
    const pending = scope.state.remove();
    pending.catch((error) => kissLog("Storage removal failed", key, error));
    return pending;
  }, [key]);

  const reload = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.key !== key) return Promise.resolve();
    const pending = scope.state.load();
    return pending.catch((error) =>
      kissLog("Storage reload failed", key, error)
    );
  }, [key]);

  return { ...snapshot, save, update, remove, reload };
}
