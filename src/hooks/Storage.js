import { useCallback, useEffect, useRef, useState } from "react";
import { getStorageState, isSameStorageValue } from "../libs/storageState";
import { storage } from "../libs/storage";
import { STOKEY_SYNC } from "../config";
import { kissLog } from "../libs/log";
import { syncData } from "../libs/sync";
import { isOptions } from "../libs/browser";

/** Read without writing defaults; edits and pending uploads are owned by key. */
export function useStorage(key, defaultVal = null, syncKey = "") {
  const [snapshot, setSnapshot] = useState({
    data: defaultVal,
    isLoading: true,
  });
  const scopeRef = useRef(null);

  const runSync = useCallback(
    (state, revision, value) =>
      state.enqueueSync(async () => {
        const isCurrent = () => state.revision === revision;
        if (!isCurrent() || !state.dirty) return;
        const requestEditVersion = state.editVersion;
        try {
          const request = await storage.withTransaction(
            async (transaction) => ({
              value: await transaction.getObj(key),
              config: await transaction.getObj(STOKEY_SYNC),
            })
          );
          if (!isCurrent()) return;
          if (!isSameStorageValue(value, request.value)) {
            await state.load();
            return;
          }
          const result = await syncData(syncKey, value, {
            deferCommit: true,
            isRequestCurrent: isCurrent,
            syncConfig: request.config,
          });
          if (!result) return;
          const accepted = await state.enqueueWrite(() =>
            result.commit({
              applyValue: async (transaction) => {
                if (result.isNew) await transaction.setObj(key, result.value);
              },
              isCurrent,
              shouldRetry: () =>
                state.snapshot.data !== null &&
                state.editVersion !== requestEditVersion,
              getRetryTimestamp: () => state.editTimestamp,
            })
          );
          if (accepted && isCurrent()) {
            if (result.isNew) state.acceptValue(result.value);
            else state.markSynced(revision);
            await result.migrateLegacy?.();
          } else if (state.dirty) {
            state.scheduleSync();
          }
        } catch (error) {
          kissLog("Sync failed", syncKey, error);
          if (error.storageRecoveryFailed) {
            await state
              .load()
              .catch((readError) =>
                kissLog("Reload after sync failure", readError)
              );
          }
        }
      }),
    [key, syncKey]
  );

  useEffect(() => {
    const state = getStorageState(key, defaultVal);
    state.configureSync(syncKey, syncKey && isOptions() ? runSync : undefined);
    const scope = { key, state, active: true };
    scopeRef.current = scope;
    const unsubscribe = state.subscribe((next) => {
      if (scope.active) setSnapshot(next);
    });
    state.ensureLoaded().catch((error) => {
      if (scope.active) kissLog(`storage load error for key: ${key}`, error);
    });
    return () => {
      scope.active = false;
      unsubscribe();
    };
  }, [key, defaultVal, syncKey, runSync]);

  const save = useCallback(
    (valueOrFn) => {
      const scope = scopeRef.current;
      if (!scope?.active || scope.key !== key) return Promise.resolve();
      return scope.state.save(valueOrFn).catch((error) => {
        kissLog(`storage save error for key: ${key}`, error);
      });
    },
    [key]
  );

  const update = useCallback(
    (partialDataOrFn) =>
      save((previous) => {
        const partial =
          typeof partialDataOrFn === "function"
            ? partialDataOrFn(previous)
            : partialDataOrFn;
        const base =
          typeof previous === "object" && previous !== null ? previous : {};
        return { ...base, ...partial };
      }),
    [save]
  );

  const remove = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.key !== key) return;
    try {
      await scope.state.remove();
    } catch (error) {
      kissLog(`storage remove error for key: ${key}`, error);
    }
  }, [key]);

  const reload = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.key !== key) return;
    try {
      await scope.state.load();
    } catch (error) {
      if (scope.active) kissLog(`storage reload error for key: ${key}`, error);
    }
  }, [key]);

  return { ...snapshot, save, update, remove, reload };
}
