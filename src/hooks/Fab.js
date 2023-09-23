import { STOKEY_FAB } from "../config";
import { useStorage } from "./Storage";

/**
 * fab hook
 * @returns
 */
export function useFab() {
  const { data, update } = useStorage(STOKEY_FAB);
  return { fab: data, updateFab: update };
}
