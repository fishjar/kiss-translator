import { STOKEY_SETTING, DEFAULT_SETTING } from "../config";
import { useStorage } from "./Storage";
import { trySyncSetting } from "../libs/sync";
import { createContext, useCallback, useContext, useMemo } from "react";
import { debounce } from "../libs/utils";

const SettingContext = createContext({
  setting: {},
  updateSetting: async () => {},
  reloadSetting: async () => {},
});

export function SettingProvider({ children }) {
  const { data, update, reload, loading } = useStorage(
    STOKEY_SETTING,
    DEFAULT_SETTING
  );

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
      syncSetting();
    },
    [update, syncSetting]
  );

  if (loading) {
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
