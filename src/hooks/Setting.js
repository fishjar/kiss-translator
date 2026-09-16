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
import Loading from "./Loading";
import { logger } from "../libs/log";
import { sendBgMsg } from "../libs/msg";
import { isExt } from "../libs/client";
import { normalizeStoredSetting } from "../libs/storage";
import { cloneStorageValue, isSameStorageValue } from "../libs/storageEquality";

// Share settings and their persistence operations with descendant components.
const SettingContext = createContext({
  setting: DEFAULT_SETTING,
  updateSetting: () => {},
  reloadSetting: () => {},
});

/** Normalize settings in memory and persist only user mutations. */
export function SettingProvider({ children, context }) {
  const isOptionsPage = useMemo(() => context === "options", [context]);

  const {
    data: rawSetting,
    isLoading,
    update,
    reload,
  } = useStorage(STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY);
  const setting = useMemo(
    () => (rawSetting ? normalizeStoredSetting(rawSetting) : rawSetting),
    [rawSetting]
  );
  const logLevel = setting?.logLevel;

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

  const updateSetting = useCallback(
    (objOrFn) => {
      const input =
        typeof objOrFn === "function" ? objOrFn : cloneStorageValue(objOrFn);
      return update((previous) => {
        // Rebase user edits on the latest normalized value inside the lock.
        const current = normalizeStoredSetting(previous);
        const patch = typeof input === "function" ? input(current) : input;
        const next = { ...current, ...patch };
        // A no-op must not persist compatibility transforms or create an upload.
        return isSameStorageValue(current, next) ? previous : next;
      });
    },
    [update]
  );

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
