import { useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";
import {
  createM3CssVariables,
  M3_FONT_FAMILY,
  M3_GLOBAL_CSS,
  resolveM3Colors,
  resolveM3ThemeMode,
} from "../styles/m3";
import { getMuiSwitchStyleOverrides } from "./themeStyles";
import { useSystemDarkPreference } from "./SystemColorScheme";

export { getMuiSwitchStyleOverrides } from "./themeStyles";

const EMPTY_THEME_OPTIONS = Object.freeze({});
const EMPTY_GLOBAL_STYLES = Object.freeze({});
const M3_BRAND_COLOR = "blue";

export default function M3Theme({
  children,
  options = EMPTY_THEME_OPTIONS,
  styles = EMPTY_GLOBAL_STYLES,
}) {
  const { darkMode } = useDarkMode();
  const systemPrefersDark = useSystemDarkPreference();

  const previewMode =
    process.env.NODE_ENV === "development"
      ? new URLSearchParams(window.location.search).get("theme")
      : null;
  const resolvedMode =
    previewMode === THEME_DARK || previewMode === THEME_LIGHT
      ? previewMode
      : resolveM3ThemeMode(darkMode, systemPrefersDark);
  const colors = useMemo(
    () => resolveM3Colors(resolvedMode, M3_BRAND_COLOR),
    [resolvedMode]
  );

  const theme = useMemo(() => {
    const color = colors;
    let htmlFontSize = 16;
    try {
      htmlFontSize = Number.parseInt(
        window.getComputedStyle(document.documentElement).fontSize,
        10
      );
    } catch (_error) {
      htmlFontSize = 16;
    }

    return createTheme({
      palette: {
        mode: resolvedMode,
        primary: { main: color.primary, contrastText: color.onPrimary },
        secondary: {
          main: color.secondaryContainer,
          contrastText: color.onSecondaryContainer,
        },
        error: { main: color.error },
        background: { default: color.background, paper: color.surface },
        text: {
          primary: color.onSurface,
          secondary: color.onSurfaceVariant,
        },
        divider: color.outlineVariant,
      },
      shape: { borderRadius: 18 },
      typography: {
        htmlFontSize,
        fontFamily: M3_FONT_FAMILY,
        button: { textTransform: "none", fontWeight: 650 },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            html: { backgroundColor: color.background },
            body: { backgroundColor: color.background },
            "#root": { minHeight: "100%" },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              borderColor: color.outlineVariant,
            },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              minHeight: 40,
              borderRadius: 999,
              paddingInline: 18,
              letterSpacing: ".01em",
              transition: "background .3s, color .3s, transform .15s",
              "&:active": { transform: "scale(.98)" },
            },
            contained: { boxShadow: "none" },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: {
              color: color.onSurfaceVariant,
              transition: "background .3s, color .3s, transform .15s",
              "&:hover": { backgroundColor: color.surfaceContainer },
              "&:active": { transform: "scale(.94)" },
            },
          },
        },
        MuiTextField: {
          defaultProps: { variant: "filled" },
        },
        MuiFilledInput: {
          defaultProps: { disableUnderline: true },
          styleOverrides: {
            root: {
              minHeight: 48,
              overflow: "hidden",
              border: "1px solid transparent",
              borderRadius: 16,
              backgroundColor: color.surfaceContainer,
              transition: "background .25s, border-color .25s",
              "&:hover": { backgroundColor: color.surfaceHigh },
              "&.Mui-focused": {
                borderColor: color.primary,
                backgroundColor: color.surface,
              },
            },
          },
        },
        MuiSwitch: {
          styleOverrides: getMuiSwitchStyleOverrides(color),
        },
        MuiTabs: {
          styleOverrides: {
            root: {
              minHeight: 44,
              padding: 4,
              borderRadius: 999,
              backgroundColor: color.surfaceContainer,
            },
            indicator: { display: "none" },
          },
        },
        MuiTab: {
          styleOverrides: {
            root: {
              minWidth: 0,
              maxWidth: "100%",
              minHeight: 36,
              overflow: "hidden",
              borderRadius: 999,
              color: color.onSurfaceVariant,
              textOverflow: "ellipsis",
              textTransform: "none",
              whiteSpace: "nowrap",
              "&.Mui-selected": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
                fontWeight: 650,
              },
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              border: `1px solid ${color.outlineVariant}`,
              borderRadius: 22,
              boxShadow: "none",
            },
          },
        },
        MuiAccordion: {
          styleOverrides: {
            root: {
              overflow: "hidden",
              border: `1px solid ${color.outlineVariant}`,
              borderRadius: "20px !important",
              boxShadow: "none",
              "&::before": { display: "none" },
            },
          },
        },
        MuiAlert: {
          styleOverrides: { root: { borderRadius: 16 } },
        },
        MuiSnackbarContent: {
          styleOverrides: { root: { borderRadius: 14 } },
        },
        ...options.components,
      },
      ...Object.fromEntries(
        Object.entries(options).filter(([key]) => key !== "components")
      ),
    });
  }, [colors, options, resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={styles} />
      <div
        className="kt-m3-root"
        data-theme={resolvedMode}
        data-brand={M3_BRAND_COLOR}
        style={{
          ...createM3CssVariables(colors),
          colorScheme: resolvedMode,
        }}
      >
        <style>{M3_GLOBAL_CSS}</style>
        {children}
      </div>
    </ThemeProvider>
  );
}
