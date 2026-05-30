import { STOKEY_FAB } from "../config";
import { useStorage } from "./Storage";

const DEFAULT_FAB = {};

/**
 * 悬浮球 (Float Action Button) 状态的获取与更新自定义 Hook
 * @returns {object} { fab, updateFab }
 */
export function useFab() {
  // 使用 useStorage 代理 STOKEY_FAB 的持久化存储与状态同步
  const { data, update } = useStorage(STOKEY_FAB, DEFAULT_FAB);
  return { fab: data, updateFab: update };
}
