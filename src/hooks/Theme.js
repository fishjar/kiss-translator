import { useEffect, useMemo, useState } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";

/**
 * MUI 主题包装器 React 组件
 * 用于监听系统及用户配置的暗黑模式，并全局提供 Material-UI 主题上下文和基础全局样式
 * @param {object} props { children, options, styles }
 */
export default function Theme({ children, options = {}, styles = {} }) {
  // 获取当前用户设置的深色模式：'light', 'dark' 或是 'auto'
  const { darkMode } = useDarkMode();
  // 保存系统级别的暗黑模式状态，默认为浅色 (light)
  const [systemMode, setSystemMode] = useState(THEME_LIGHT);

  // 监听浏览器系统级的 prefers-color-scheme 暗黑/浅色模式变化，并自动同步状态
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemMode(mediaQuery.matches ? THEME_DARK : THEME_LIGHT);
    };
    handleChange(); // 设置初始系统色彩模式
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // 根据用户全局 darkMode 设定和当前的系统色彩模式，动态计算出最终的 MUI 主题配置
  const theme = useMemo(() => {
    let htmlFontSize = 16;
    try {
      // 动态获取当前网页根元素的 font-size（应对用户在浏览器里调大了默认字号的场景，使 rem 布局更自然对齐）
      const s = window.getComputedStyle(document.documentElement).fontSize;
      htmlFontSize = parseInt(s.replace("px", ""));
    } catch (err) {
      // 容错：若解析失败则回退默认的 16px
    }

    // 判断当前最终是否应该呈现暗黑模式
    const isDarkMode =
      darkMode === "dark" || (darkMode === "auto" && systemMode === THEME_DARK);

    return createTheme({
      palette: {
        mode: isDarkMode ? THEME_DARK : THEME_LIGHT,
      },
      typography: {
        htmlFontSize,
      },
      ...options,
    });
  }, [darkMode, options, systemMode]);

  return (
    <ThemeProvider theme={theme}>
      {/* CssBaseline 提供 Material UI 精简统一的基础样式重置 */}
      <CssBaseline />
      {/* 允许传入全局样式 Styles */}
      <GlobalStyles styles={styles} />
      {children}
    </ThemeProvider>
  );
}
