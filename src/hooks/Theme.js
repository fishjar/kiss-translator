import { useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";

/**
 * mui 主题配置
 * @param {*} param0
 * @returns
 */
export default function Theme({ children, options }) {
  const { darkMode } = useDarkMode();
  const theme = useMemo(() => {
    return createTheme({
      palette: {
        mode: darkMode ? THEME_DARK : THEME_LIGHT,
      },
      ...options,
    });
  }, [darkMode, options]);

  return (
    <ThemeProvider theme={theme}>
      {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
