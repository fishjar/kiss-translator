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
  SETTINGS_VERSION_V2,
  getSettingVersion,
  migrateSettingPromptsToV2,
} from "../config";
import { useStorage } from "./Storage";
import { debounceSyncMeta } from "../libs/storage";
import Loading from "./Loading";
import { logger } from "../libs/log";
import { sendBgMsg } from "../libs/msg";
import { isExt } from "../libs/client";

// 创建全局设置 Context，用于在子组件中访问配置数据和更新、重载方法
const SettingContext = createContext({
  setting: DEFAULT_SETTING,
  updateSetting: () => {},
  reloadSetting: () => {},
});

/**
 * 全局设置 Provider 组件，负责统筹配置的读取、升级、同步与副作用执行（深色模式、日志级别等）
 */
export function SettingProvider({ children, context }) {
  // 判断当前运行上下文是否为扩展的配置后台选项页 (options)
  const isOptionsPage = useMemo(() => context === "options", [context]);

  // 从本地 Storage 中持久化加载/读写全局设置项
  const {
    data: setting,
    isLoading,
    update,
    reload,
  } = useStorage(STOKEY_SETTING, DEFAULT_SETTING, KV_SETTING_KEY);
  const hasSetting = !!setting;
  const settingVersion = getSettingVersion(setting);
  const logLevel = setting?.logLevel;

  // 兼容直接从 Storage 或云同步回填进来的旧版设置，确保进入界面的配置已经升级到 V2。
  useEffect(() => {
    if (!hasSetting || settingVersion >= SETTINGS_VERSION_V2) {
      return;
    }

    update((currentSetting) => {
      if (
        !currentSetting ||
        getSettingVersion(currentSetting) >= SETTINGS_VERSION_V2
      ) {
        return currentSetting;
      }

      return migrateSettingPromptsToV2(currentSetting);
    });
  }, [hasSetting, settingVersion, update]);

  // 对设置项中老版本可能存在的 boolean 类型 darkMode 进行自动平滑升级为三种模式类型 (dark, light, auto)
  useEffect(() => {
    if (typeof setting?.darkMode === "boolean") {
      update((currentSetting) => ({
        ...currentSetting,
        darkMode: currentSetting.darkMode ? "dark" : "light",
      }));
    }
  }, [setting?.darkMode, update]);

  // 副作用：当日志等级 (logLevel) 发生变化时，同步更新 logger 配置。
  // 若在浏览器扩展环境下，需额外发送消息通知 background 页面更改对应的 logLevel 保持一致。
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

  // 包装后的更新设置项函数，更新状态的同时异步触发防抖的云端同步机制 (KV 同步)
  const updateSetting = useCallback(
    (objOrFn) => {
      update(objOrFn);
      debounceSyncMeta(KV_SETTING_KEY);
    },
    [update]
  );

  // 快捷更新特定子对象键的方法（如仅更新 customStyles 或是 shortcuts 字段）
  // REVIEW: 此处 `async (obj)` 声明为了异步函数，但其内部并无任何使用 `await` 的异步处理。
  // 这种多余的 async 声明是不必要的，应当去除以保证代码精简纯净（为维持原业务逻辑一致性，此处只做 review 标识，不做代码精细修改）。
  const updateChild = useCallback(
    (key) => async (obj) => {
      updateSetting((prev) => ({
        ...prev,
        [key]: { ...(prev?.[key] || {}), ...obj },
      }));
    },
    [updateSetting]
  );

  // 缓存导出的 Context Value
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

  // 如果仍处于 Storage 的初次异步加载状态，在配置页显示 Loading 组件，其他页面默认返回 null 防止白屏
  if (isLoading) {
    return isOptionsPage ? <Loading /> : null;
  }

  // 容错处理：如果无法加载设置，在 Options 选项页弹出警示提示，其他页面返回 null
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

// 导出 Hook，方便子组件快速获取全局设置
export function useSetting() {
  return useContext(SettingContext);
}
