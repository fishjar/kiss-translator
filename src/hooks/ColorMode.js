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
    const nextMode = {
      light: "dark",
      dark: "auto",
      auto: "light",
    };
    updateSetting({ darkMode: nextMode[darkMode] || "light" });
  }, [darkMode, updateSetting]);

  return { darkMode, toggleDarkMode };
}
