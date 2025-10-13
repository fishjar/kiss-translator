import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
} from "react";
import Alert from "@mui/material/Alert";
import {
  STOKEY_SETTING,
  DEFAULT_SETTING,
  KV_SETTING_KEY,
  MSG_SET_LOGLEVEL,
} from "../config";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";
import Loading from "./Loading";
import { logger } from "../libs/log";
import { sendBgMsg } from "../libs/msg";

const SettingContext = createContext({
  setting: DEFAULT_SETTING,
  updateSetting: () => {},
  reloadSetting: () => {},
});

export function SettingProvider({ children }) {
  const {
    data: setting,
    isLoading,
    update,
    reload,
  } = useStorage(STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY);

  useEffect(() => {
    (async () => {
      try {
        logger.setLevel(setting?.logLevel);
        await sendBgMsg(MSG_SET_LOGLEVEL, setting?.logLevel);
      } catch (error) {
        logger.error("Failed to fetch log level, using default.", error);
      }
    })();
  }, [setting]);

  const updateSetting = useCallback(
    (objOrFn) => {
      update(objOrFn);
      debounceSyncMeta(KV_SETTING_KEY);
    },
    [update]
  );

  const updateChild = useCallback(
    (key) => async (obj) => {
      updateSetting((prev) => ({
        ...prev,
        [key]: { ...(prev?.[key] || {}), ...obj },
      }));
    },
    [updateSetting]
  );

  const value = useMemo(
    () => ({
      setting,
      updateSetting,
      updateChild,
      reloadSetting: reload,
    }),
    [setting, updateSetting, updateChild, reload]
  );

  if (isLoading) {
    return <Loading />;
  }

  if (!setting) {
    <center>
      <Alert severity="error" sx={{ maxWidth: 600, margin: "60px auto" }}>
        <p>数据加载出错，请刷新页面或卸载后重新安装。</p>
        <p>
          Data loading error, please refresh the page or uninstall and
          reinstall.
        </p>
      </Alert>
    </center>;
  }

  return (
    <SettingContext.Provider value={value}>{children}</SettingContext.Provider>
  );
}

/**
 * 设置 hook
 * @returns
 */
export function useSetting() {
  return useContext(SettingContext);
}
