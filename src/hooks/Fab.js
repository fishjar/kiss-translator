import { STOKEY_FAB } from "../config";
import { useStorage } from "./Storage";

const DEFAULT_FAB = {};

/**
 * fab hook
 * @returns
 */
export function useFab() {
  const { data, update } = useStorage(STOKEY_FAB, DEFAULT_FAB);
  return { fab: data, updateFab: update };
}
