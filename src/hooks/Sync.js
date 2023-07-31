import { useCallback } from "react";
import { STOKEY_SYNC } from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";

/**
 * sync hook
 * @returns
 */
export function useSync() {
  const storages = useStorages();
  const opt = storages?.[STOKEY_SYNC];
  const update = useCallback(async (obj) => {
    await storage.putObj(STOKEY_SYNC, obj);
  }, []);
  return {
    opt,
    update,
  };
}
