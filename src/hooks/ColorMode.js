import { useCallback } from "react";
import { useSetting } from "./Setting";

/**
 * 深色模式hook
 * @returns
 */
export function useDarkMode() {
  const {
    setting: { darkMode },
    updateSetting,
  } = useSetting();

  const toggleDarkMode = useCallback(() => {
    updateSetting({ darkMode: !darkMode });
  }, [darkMode, updateSetting]);

  return { darkMode, toggleDarkMode };
}
