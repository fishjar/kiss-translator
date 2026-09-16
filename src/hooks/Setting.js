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
  CURRENT_SETTINGS_VERSION,
  getSettingVersion,
  migrateSettingToV3,
} from "../config";
import { useStorage } from "./Storage";
import Loading from "./Loading";
import { logger } from "../libs/log";
import { sendBgMsg } from "../libs/msg";
import { isExt } from "../libs/client";

// Share settings and their persistence operations with descendant components.
const SettingContext = createContext({
  setting: DEFAULT_SETTING,
  updateSetting: () => {},
  reloadSetting: () => {},
});

/** Load settings, apply schema migrations, and expose persistent mutations. */
export function SettingProvider({ children, context }) {
  const isOptionsPage = useMemo(() => context === "options", [context]);

  const {
    data: setting,
    isLoading,
    update,
    reload,
  } = useStorage(STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY);
  const hasSetting = !!setting;
  const settingVersion = getSettingVersion(setting);
  const logLevel = setting?.logLevel;

  // Upgrade settings loaded directly or adopted from an older remote backup.
  useEffect(() => {
    if (!hasSetting || settingVersion >= CURRENT_SETTINGS_VERSION) {
      return;
    }

    update((currentSetting) => {
      if (
        !currentSetting ||
        getSettingVersion(currentSetting) >= CURRENT_SETTINGS_VERSION
      ) {
        return currentSetting;
      }

      return migrateSettingToV3(currentSetting);
    });
  }, [hasSetting, settingVersion, update]);

  // Preserve compatibility with the legacy boolean theme setting.
  useEffect(() => {
    if (typeof setting?.darkMode === "boolean") {
      update((currentSetting) =>
        typeof currentSetting?.darkMode === "boolean"
          ? {
              ...currentSetting,
              darkMode: currentSetting.darkMode ? "dark" : "light",
            }
          : currentSetting
      );
    }
  }, [setting?.darkMode, update]);

  // Keep the Options logger and extension background logger in sync.
  useEffect(() => {
    if (!isOptionsPage) return;

    (async () => {
      try {
        logger.setLevel(logLevel);
        if (isExt) {
          await sendBgMsg(MSG_SET_LOGLEVEL, logLevel);
        }
      } catch (error) {
        logger.error("Failed to fetch log level, using default.", error);
      }
    })();
  }, [isOptionsPage, logLevel]);

  const updateSetting = useCallback((objOrFn) => update(objOrFn), [update]);

  // Merge a child patch against the current value when the reducer is replayed.
  const updateChild = useCallback(
    (key) => (obj) => {
      const patch = { ...obj };
      return updateSetting((prev) => ({
        ...prev,
        [key]: { ...(prev?.[key] || {}), ...patch },
      }));
    },
    [updateSetting]
  );

  const value = useMemo(
    () => ({
      context,
      setting,
      updateSetting,
      updateChild,
      reloadSetting: reload,
    }),
    [context, setting, updateSetting, updateChild, reload]
  );

  // Show loading feedback in Options before the first storage read completes.
  if (isLoading) {
    return isOptionsPage ? <Loading /> : null;
  }

  // Options can explain a failed read; embedded views stay hidden.
  if (!setting) {
    return isOptionsPage ? (
      <center>
        <Alert severity="error" sx={{ maxWidth: 600, margin: "60px auto" }}>
          <p>数据加载出错，请刷新页面或卸载后重新安装。</p>
          <p>
            Data loading error, please refresh the page or uninstall and
            reinstall.
          </p>
        </Alert>
      </center>
    ) : null;
  }

  return (
    <SettingContext.Provider value={value}>{children}</SettingContext.Provider>
  );
}

export function useSetting() {
  return useContext(SettingContext);
}
