import { useCallback } from "react";
import { DEFAULT_SHORTCUTS } from "../config";
import { useSetting } from "./Setting";

export function useShortcut(action) {
  const { setting, updateSetting } = useSetting();
  const shortcuts = setting?.shortcuts || DEFAULT_SHORTCUTS;
  const shortcut = shortcuts[action] || [];
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
