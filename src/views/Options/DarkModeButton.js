import IconButton from "@mui/material/IconButton";
import { useDarkMode } from "../../hooks/ColorMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";

/**
 * 深浅色主题切换按钮组件
 */
export default function DarkModeButton() {
  // 获取全局深色模式状态及其切换方法
  const { darkMode, toggleDarkMode } = useDarkMode();

  return (
    <IconButton onClick={toggleDarkMode} color="inherit">
      {/* 根据当前模式状态展示对应的图标：深色、浅色、自动系统同步 */}
      {darkMode === "dark" ? (
        <DarkModeIcon />
      ) : darkMode === "light" ? (
        <LightModeIcon />
      ) : (
        <BrightnessAutoIcon />
      )}
    </IconButton>
  );
}
