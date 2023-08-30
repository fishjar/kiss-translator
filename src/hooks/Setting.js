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
    [settingUpdateAt]
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

// export function useSetting() {
//   const [setting,setSeting]= useState(null);
//   useEffect(()=>{
//     (async ()=>{
//       const
//     })()
//   },[])
// }

// /**
//  * 设置hook
//  * @returns
//  */
// export function useSetting() {
//   const storages = useStorages();
//   return storages?.[STOKEY_SETTING];
// }

// /**
//  * 更新设置
//  * @returns
//  */
// export function useSettingUpdate() {
//   const sync = useSync();
//   return async (obj) => {
//     const updateAt = sync.opt?.settingUpdateAt ? Date.now() : 0;
//     await storage.putObj(STOKEY_SETTING, obj);
//     await sync.update({ settingUpdateAt: updateAt });
//     trySyncSetting();
//   };
// }
