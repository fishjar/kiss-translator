import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useEffect,
  useLayoutEffect,
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
import { setIconColorSnapshot, setIconStyleSnapshot } from "../styles/m3";
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
        logger
          .child("setting")
          .error("Failed to fetch log level, using default.", error);
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
        // Imported backups may introduce legacy fields again.
        const next = normalizeStoredSetting({ ...current, ...patch });
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

  // 把图标外观键同步给 m3.js 快照 store（M3Theme/图标分发器经
  // useSyncExternalStore 消费，避免它们直接 import 本模块拖入重依赖图）。
  // useLayoutEffect：浏览器提交前生效，切换档位零闪烁；同样受 isLoading 门控。
  // isLoading 门控：useStorage 在读盘完成前把 DEFAULT_SETTING 当 data 返回，
  // 故 setting 非空但尚是默认档。同一 JS 上下文里已挂载并填充的其它根
  // （content bundle 内 popup/touchStatus/fab/ruleEditor/imageTranslate 等
  // 并存）此刻快照已被写为真实档；本根若在加载期抢先把默认档写进共享 store，
  // 会把它们临时打回默认。故加载期一律跳过。不在渲染期同步：渲染期调用
  // 外部 store setter 会同步通知 useSyncExternalStore 订阅者（含其它根），
  // 属 React 反模式；useLayoutEffect 内的同步在浏览器绘制前完成，无闪烁。
  useLayoutEffect(() => {
    if (isLoading) return;
    setIconStyleSnapshot(setting?.iconStyle);
    setIconColorSnapshot(setting?.iconColor);
  }, [isLoading, setting?.iconStyle, setting?.iconColor]);

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
