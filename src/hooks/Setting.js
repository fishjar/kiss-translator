import { STOKEY_SETTING } from "../config";
import storage from "../libs/storage";
import { useStorages } from "./Storage";
import { useSync } from "./Sync";
import { trySyncSetting } from "../libs/sync";

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
  const sync = useSync();
  return async (obj) => {
    const updateAt = sync.opt?.settingUpdateAt ? Date.now() : 0;
    await storage.putObj(STOKEY_SETTING, obj);
    await sync.update({ settingUpdateAt: updateAt });
    trySyncSetting();
  };
}
