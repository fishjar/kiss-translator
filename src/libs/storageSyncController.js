import { STOKEY_SYNC } from "../config";
import { storage } from "./storage";
import { isSameStorageValue } from "./storageEquality";
import { kissLog } from "./log";
import { syncData } from "./sync";

/** Run synchronization independently of the lifetime of a React subscriber. */
export function syncStorageState(key, syncKey, state, revision, value) {
  return state.enqueueSync(async () => {
    const requestEditVersion = state.editVersion;
    const committedVersion = state.committedEditVersion;
    const isCurrent = () =>
      state.revision === revision &&
      state.editVersion === requestEditVersion &&
      !state.hasPendingEdits &&
      !state.isRecovering;
    if (!isCurrent() || !state.dirty) return;
    try {
      const request = await storage.withTransaction(async (transaction) => ({
        value: await transaction.getObj(key),
        config: await transaction.getObj(STOKEY_SYNC),
      }));
      if (!isCurrent()) return;
      if (!isSameStorageValue(value, request.value)) {
        await state.load();
        state.scheduleSync();
        return;
      }
      const result = await syncData(syncKey, request.value, {
        deferCommit: true,
        isRequestCurrent: isCurrent,
        syncConfig: request.config,
      });
      if (!result) return;
      const accepted = await state.enqueueWrite(async () => {
        const committed = await result.commit({
          applyValue: async (transaction) => {
            if (result.isNew) await transaction.setObj(key, result.value);
          },
          isCurrent,
          shouldRetry: () =>
            state.snapshot.data !== null &&
            state.committedEditVersion !== committedVersion,
          getRetryTimestamp: () => state.editTimestamp,
        });
        // Accept the receipt before queued invalidation reads can run.
        if (committed && isCurrent()) {
          if (result.isNew) state.acceptValue(result.value);
          else state.markSynced(revision);
        }
        return committed;
      });
      if (accepted) await result.migrateLegacy?.();
      else if (state.dirty) state.scheduleSync();
    } catch (error) {
      kissLog("Sync failed", syncKey, error);
      if (error.storageRecoveryFailed || error.storageOutcome === "unknown") {
        await state
          .load()
          .catch((readError) =>
            kissLog("Reload after sync failure", readError)
          );
      }
    }
  });
}
