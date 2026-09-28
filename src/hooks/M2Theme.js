import { useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";
import { useSystemDarkPreference } from "./SystemColorScheme";

export { getMuiSwitchStyleOverrides } from "./themeStyles";

const EMPTY_THEME_OPTIONS = Object.freeze({});
const EMPTY_GLOBAL_STYLES = Object.freeze({});

/**
 * Material Design 2 (M2) 紧凑通用主题提供者组件
 * 采用 4px 紧凑圆角、Outlined 输入框规范与 small 尺寸组件默认值
 */
export default function M2Theme({
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
      : darkMode === "dark" || (darkMode === "auto" && systemPrefersDark)
        ? THEME_DARK
        : THEME_LIGHT;

  const theme = useMemo(() => {
    let htmlFontSize = 16;
    try {
      htmlFontSize = Number.parseInt(
        window.getComputedStyle(document.documentElement).fontSize,
        10
      );
    } catch (_error) {
      htmlFontSize = 16;
    }

    const isDark = resolvedMode === THEME_DARK;

    const baseTheme = createTheme({
      palette: {
        mode: resolvedMode,
        primary: {
          main: isDark ? "#1976d2" : "#0B57D0",
          contrastText: "#ffffff",
        },
        background: {
          default: isDark ? "#121212" : "#f5f5f5",
          paper: isDark ? "#1e1e1e" : "#ffffff",
        },
      },
      shape: {
        borderRadius: 4,
      },
      typography: {
        htmlFontSize,
        button: {
          textTransform: "none",
        },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            html: { minHeight: "100%" },
            body: { minHeight: "100%" },
            "#root": { minHeight: "100%" },
          },
        },
        MuiPaper: {
          styleOverrides: {
            rounded: {
              borderRadius: 4,
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiButton: {
          defaultProps: {
            size: "small",
          },
          styleOverrides: {
            root: {
              textTransform: "none",
              borderRadius: 4,
            },
            containedPrimary: {
              color: "#ffffff",
              "& .MuiSvgIcon-root": {
                color: "#ffffff",
              },
            },
          },
        },
        MuiButtonGroup: {
          defaultProps: {
            size: "small",
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiTextField: {
          defaultProps: {
            size: "small",
            variant: "outlined",
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiChip: {
          defaultProps: {
            size: "small",
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiToggleButton: {
          defaultProps: {
            size: "small",
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiToggleButtonGroup: {
          defaultProps: {
            size: "small",
          },
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiSelect: {
          defaultProps: {
            size: "small",
          },
        },
        MuiFormControl: {
          defaultProps: {
            size: "small",
          },
        },
        MuiIconButton: {
          defaultProps: {
            size: "small",
          },
        },
        MuiAlert: {
          styleOverrides: {
            root: {
              borderRadius: 4,
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            paper: {
              borderRadius: 4,
            },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: {
              borderRadius: 4,
            },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: {
              borderRadius: 4,
            },
          },
        },
      },
    });

    return createTheme(baseTheme, options);
  }, [options, resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={styles} />
      <div
        className="kt-m2-root"
        data-theme={resolvedMode}
        style={{
          colorScheme: resolvedMode,
          minHeight: "100%",
        }}
      >
        {children}
      </div>
    </ThemeProvider>
  );
}
