import { STOKEY_SYNC } from "../config/storage";
import { syncData } from "./sync";
import { storage, getSyncWithDefault } from "./storage";
import {
  TERMINOLOGY_SYNC_KEY,
  exportTerminologyDataset,
  validateTerminologyDataset,
  applyTerminologyDataset,
} from "./terminologyStorage";

let pending;
export function syncTerminology(options = {}) {
  if (pending) return pending;
  pending = performSync(options).finally(() => {
    pending = null;
  });
  return pending;
}

async function performSync(options) {
  const snapshot = await storage.withTransaction(async (transaction) => ({
    value: await exportTerminologyDataset(transaction),
    syncConfig: await transaction.getObj(STOKEY_SYNC),
  }));
  const syncConfig = snapshot.syncConfig || (await getSyncWithDefault());
  const response = await syncData(TERMINOLOGY_SYNC_KEY, snapshot.value, {
    ...options,
    syncConfig,
    deferCommit: true,
  });
  if (!response)
    throw new Error(
      "Configure cloud sync and encryption before syncing terminology"
    );
  const dataset = validateTerminologyDataset(response.value);
  if (options.applyRemote === false && options.persistMeta === false)
    return { ...response, value: dataset };
  const accepted = await response.commit({
    applyValue: async (transaction) => {
      if (response.isNew) await applyTerminologyDataset(dataset, transaction);
    },
  });
  if (!accepted)
    throw new Error("Terminology changed during synchronization; sync again");
  await response.migrateLegacy();
  globalThis.window?.dispatchEvent(new Event("kiss-terminology-changed"));
  return { value: dataset, isNew: response.isNew };
}
