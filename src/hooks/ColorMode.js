import { useCallback } from "react";
import { useSetting } from "./Setting";

/**
 * 深色模式状态切换与管理自定义 Hook
 * @returns {object} { darkMode: string, toggleDarkMode: function }
 */
export function useDarkMode() {
  // 从通用设置中解构获取 darkMode 和更新设置的方法
  const {
    setting: { darkMode },
    updateSetting,
  } = useSetting();

  // 切换深色模式的触发方法：循环切换：light -> dark -> auto -> light
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
