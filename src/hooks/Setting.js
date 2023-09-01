import { STOKEY_SETTING, DEFAULT_SETTING } from "../config";
import { useStorage } from "./Storage";
import { useSync } from "./Sync";
import { trySyncSetting } from "../libs/sync";
import { createContext, useCallback, useContext, useMemo } from "react";
import { debounce } from "../libs/utils";

const SettingContext = createContext({
  setting: null,
  updateSetting: async () => {},
  reloadSetting: async () => {},
});

export function SettingProvider({ children }) {
  const { data, update, reload } = useStorage(STOKEY_SETTING, DEFAULT_SETTING);
  const {
    sync: { settingUpdateAt },
    updateSync,
  } = useSync();

  const syncSetting = useMemo(
    () =>
      debounce(() => {
        trySyncSetting();
      }, [2000]),
    []
  );

  const updateSetting = useCallback(
    async (obj) => {
      const updateAt = settingUpdateAt ? Date.now() : 0;
      await update(obj);
      await updateSync({ settingUpdateAt: updateAt });
      syncSetting();
    },
    [settingUpdateAt, update, updateSync, syncSetting]
  );

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
