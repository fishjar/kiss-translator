import { STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY } from "../config";
import { useStorage } from "./Storage";
import { trySyncSetting } from "../libs/sync";
import { createContext, useCallback, useContext, useMemo } from "react";
import { debounce } from "../libs/utils";
import { useSyncMeta } from "./Sync";

const SettingContext = createContext({
  setting: null,
  updateSetting: async () => {},
  reloadSetting: async () => {},
});

export function SettingProvider({ children }) {
  const { data, update, reload } = useStorage(STOKEY_SETTING, DEFAULT_SETTING);
  const { updateSyncMeta } = useSyncMeta();

  const syncSetting = useMemo(
    () =>
      debounce(() => {
        trySyncSetting();
      }, [2000]),
    []
  );

  const updateSetting = useCallback(
    async (obj) => {
      await update(obj);
      await updateSyncMeta(KV_SETTING_KEY);
      syncSetting();
    },
    [update, syncSetting, updateSyncMeta]
  );

  if (!data) {
    return;
  }

  return (
    <SettingContext.Provider
      value={{
        setting: data,
        updateSetting,
        reloadSetting: reload,
      }}
    >
      {children}
    </SettingContext.Provider>
  );
}

/**
 * 设置 hook
 * @returns
 */
export function useSetting() {
  return useContext(SettingContext);
}
