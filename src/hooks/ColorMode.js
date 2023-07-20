import { useSetting, useSettingUpdate } from "./Setting";

/**
 * 深色模式hook
 * @returns
 */
export function useDarkMode() {
  const setting = useSetting();
  return !!setting?.darkMode;
}

/**
 * 切换深色模式
 * @returns
 */
export function useDarkModeSwitch() {
  const darkMode = useDarkMode();
  const updateSetting = useSettingUpdate();
  return async () => {
    await updateSetting({ darkMode: !darkMode });
  };
}
