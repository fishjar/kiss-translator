import { STOKEY_SETTING, DEFAULT_SETTING } from "../config";
import { useStorage } from "./Storage";
import { useSync } from "./Sync";
import { trySyncSetting } from "../libs/sync";
import { createContext, useCallback, useContext } from "react";

const SettingContext = createContext({
  setting: null,
  updateSetting: async () => {},
});

export function SettingProvider({ children }) {
  const { data, update } = useStorage(STOKEY_SETTING, DEFAULT_SETTING);
  const {
    sync: { settingUpdateAt },
    updateSync,
  } = useSync();

  const updateSetting = useCallback(
    async (obj) => {
      const updateAt = settingUpdateAt ? Date.now() : 0;
      await update(obj);
      await updateSync({ settingUpdateAt: updateAt });
      trySyncSetting();
    },
    [settingUpdateAt, update, updateSync]
  );

  return (
    <SettingContext.Provider
      value={{
        setting: data,
        updateSetting,
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
