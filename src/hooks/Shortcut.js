import { useCallback } from "react";
import { DEFAULT_SHORTCUTS } from "../config";
import { useSetting } from "./Setting";

/**
 * 快捷键配置项的读取与更新自定义 Hook
 * @param {string} action 快捷键对应的操作动作名称（例如 'toggle_translation'）
 * @returns {object} { shortcut, setShortcut }
 */
export function useShortcut(action) {
  const { setting, updateSetting } = useSetting();
  // 获取当前的快捷键映射，若未配置则加载默认的快捷键集合
  const shortcuts = setting?.shortcuts || DEFAULT_SHORTCUTS;
  // 获取当前动作 action 绑定的快捷键（可能是一个数组，包含按键名）
  const shortcut = shortcuts[action] || [];

  // 更新该操作 action 的快捷键值并持久化
  const setShortcut = useCallback(
    (val) => {
      updateSetting((prev) => ({
        ...prev,
        shortcuts: { ...(prev?.shortcuts || {}), [action]: val },
      }));
    },
    [action, updateSetting]
  );

  return { shortcut, setShortcut };
}
