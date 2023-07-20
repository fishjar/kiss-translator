import { STOKEY_SETTING } from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";

/**
 * 设置hook
 * @returns
 */
export function useSetting() {
  const storages = useStorages();
  return storages?.[STOKEY_SETTING];
}

/**
 * 更新设置
 * @returns
 */
export function useSettingUpdate() {
  return async (obj) => {
    await storage.putObj(STOKEY_SETTING, obj);
  };
}
