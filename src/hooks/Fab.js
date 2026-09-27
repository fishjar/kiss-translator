import { STOKEY_FAB } from "../config";
import { DEFAULT_FAB } from "../config/fab";
import { useStorage } from "./Storage";

/**
 * Read and update persistent floating action button preferences.
 * @returns {object} { fab, updateFab }
 */
export function useFab() {
  // Share persistence and updates with other readers of STOKEY_FAB.
  const { data, update } = useStorage(STOKEY_FAB, DEFAULT_FAB);
  return { fab: data, updateFab: update };
}
