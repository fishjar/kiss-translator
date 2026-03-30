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
  normalizeCEFRSetting,
  normalizeDefaultApiSlug,
  normalizeSetting,
} from "../config";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";
import Loading from "./Loading";
import { logger } from "../libs/log";
import { sendBgMsg } from "../libs/msg";
import { isExt } from "../libs/client";

const SettingContext = createContext({
  setting: DEFAULT_SETTING,
  updateSetting: () => {},
  reloadSetting: () => {},
});

const CEFR_SETTING_FIELDS = [
  "enabled",
  "level",
  "assessmentCompleted",
  "levelSource",
  "lastPromptFrom",
];

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const needsCEFRBackfill = (cefrSetting) => {
  if (typeof cefrSetting !== "object" || cefrSetting === null) return true;
  return CEFR_SETTING_FIELDS.some((field) => !hasOwn(cefrSetting, field));
};

const needsDefaultApiBackfill = (setting) =>
  !hasOwn(setting || {}, "defaultApiSlug") ||
  normalizeDefaultApiSlug(setting?.defaultApiSlug, setting?.transApis) !==
    setting?.defaultApiSlug;

export function SettingProvider({ children, context }) {
  const isOptionsPage = useMemo(() => context === "options", [context]);

  const {
    data: setting,
    isLoading,
    update,
    reload,
  } = useStorage(STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY);
  const normalizedSetting = useMemo(() => {
    if (setting === null || setting === undefined) return setting;
    return normalizeSetting(setting);
  }, [setting]);

  useEffect(() => {
    if (
      isLoading ||
      !setting ||
      (!needsCEFRBackfill(setting?.cefrSetting) &&
        !needsDefaultApiBackfill(setting))
    ) {
      return;
    }

    update({
      cefrSetting: normalizeCEFRSetting(setting?.cefrSetting),
      defaultApiSlug: normalizeDefaultApiSlug(
        setting?.defaultApiSlug,
        setting?.transApis
      ),
    });
  }, [isLoading, setting, update]);

  useEffect(() => {
    if (typeof normalizedSetting?.darkMode === "boolean") {
      update((currentSetting) => ({
        ...currentSetting,
        darkMode: currentSetting.darkMode ? "dark" : "light",
      }));
    }
  }, [normalizedSetting?.darkMode, update]);

  useEffect(() => {
    if (!isOptionsPage) return;

    (async () => {
      try {
        logger.setLevel(normalizedSetting?.logLevel);
        if (isExt) {
          await sendBgMsg(MSG_SET_LOGLEVEL, normalizedSetting?.logLevel);
        }
      } catch (error) {
        logger.error("Failed to fetch log level, using default.", error);
      }
    })();
  }, [isOptionsPage, normalizedSetting?.logLevel]);

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
      context,
      setting: normalizedSetting,
      updateSetting,
      updateChild,
      reloadSetting: reload,
    }),
    [context, normalizedSetting, updateSetting, updateChild, reload]
  );

  if (isLoading) {
    return isOptionsPage ? <Loading /> : null;
  }

  if (!normalizedSetting) {
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

/**
 * 设置 hook
 * @returns
 */
export function useSetting() {
  return useContext(SettingContext);
}
