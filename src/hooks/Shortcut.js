import { useCallback } from "react";
import { DEFAULT_SHORTCUTS } from "../config";
import { useSetting } from "./Setting";

export function useShortcut(action) {
  const { setting, updateSetting } = useSetting();
  const shortcuts = setting?.shortcuts || DEFAULT_SHORTCUTS;

  const setShortcut = useCallback(
    async (val) => {
      await updateSetting({
        shortcuts: {
          ...shortcuts,
          [action]: val,
        },
      });
    },
    [action, shortcuts, updateSetting]
  );

  return { shortcut: shortcuts[action] || [], setShortcut };
}
