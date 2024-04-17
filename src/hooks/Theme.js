import { useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";

/**
 * mui 主题配置
 * @param {*} param0
 * @returns
 */
export default function Theme({ children, options, styles }) {
  const { darkMode } = useDarkMode();
  const theme = useMemo(() => {
    let htmlFontSize = 16;
    try {
      const s = window.getComputedStyle(document.body.parentNode).fontSize;
      const fontSize = parseInt(s.replace("px", ""));
      if (fontSize > 0 && fontSize < 1000) {
        htmlFontSize = fontSize;
      }
    } catch (err) {
      //
    }

    return createTheme({
      palette: {
        mode: darkMode ? THEME_DARK : THEME_LIGHT,
      },
      typography: {
        htmlFontSize,
      },
      ...options,
    });
  }, [darkMode, options]);

  return (
    <ThemeProvider theme={theme}>
      {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
      <CssBaseline />
      <GlobalStyles styles={styles} />
      {children}
    </ThemeProvider>
  );
}
