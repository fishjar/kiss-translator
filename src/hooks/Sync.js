import { STOKEY_SYNC, DEFAULT_SYNC } from "../config";
import { useStorage } from "./Storage";

/**
 * sync hook
 * @returns
 */
export function useSync() {
  const { data, update } = useStorage(STOKEY_SYNC, DEFAULT_SYNC);
  return { sync: data, updateSync: update };
}
// export function useSync() {
//   const storages = useStorages();
//   const opt = storages?.[STOKEY_SYNC];
//   const update = useCallback(async (obj) => {
//     await storage.putObj(STOKEY_SYNC, obj);
//   }, []);
//   return {
//     opt,
//     update,
//   };
// }
