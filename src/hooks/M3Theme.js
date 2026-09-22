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
    const focusRing = {
      outline: `3px solid ${color.primary}`,
      outlineOffset: 2,
    };
    let htmlFontSize = 16;
    try {
      htmlFontSize = Number.parseInt(
        window.getComputedStyle(document.documentElement).fontSize,
        10
      );
    } catch (_error) {
      htmlFontSize = 16;
    }

    const themeOptions = {
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
      shape: { borderRadius: 12 },
      typography: (palette) => {
        const typography =
          typeof options.typography === "function"
            ? options.typography(palette)
            : options.typography;
        // Resolve conversions before MUI generates sizes for each variant.
        return {
          htmlFontSize,
          fontFamily: M3_FONT_FAMILY,
          ...typography,
          button: {
            textTransform: "none",
            fontWeight: 650,
            ...typography?.button,
          },
        };
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
              colorScheme: resolvedMode,
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
              transition:
                "background-color .3s, border-color .3s, color .3s, transform .15s",
              "&:active": { transform: "scale(.98)" },
              "&.Mui-focusVisible": focusRing,
            },
            contained: { boxShadow: "none" },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: ({ ownerState }) => ({
              ...(ownerState.color === "default" && {
                color: color.onSurfaceVariant,
                "&:hover": {
                  backgroundColor: color.surfaceContainer,
                  "@media (hover: none)": { backgroundColor: "transparent" },
                },
              }),
              transition: "background .3s, color .3s, transform .15s",
              "&:active": { transform: "scale(.94)" },
              "&.Mui-focusVisible": focusRing,
            }),
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
              borderRadius: 12,
              backgroundColor: color.surfaceContainer,
              transition: "background-color .25s, border-color .25s",
              "&:not(.Mui-disabled, .Mui-focused):hover": {
                backgroundColor: color.surfaceHigh,
                "@media (hover: none)": {
                  backgroundColor: color.surfaceContainer,
                },
              },
              "&.Mui-focused": {
                borderColor: color.primary,
                backgroundColor: color.surface,
              },
              "&.Mui-error": {
                borderColor: color.error,
              },
              "&.Mui-error.Mui-focused": {
                borderColor: color.error,
              },
            },
          },
        },
        MuiSelect: {
          styleOverrides: {
            select: {
              "&:focus": {
                borderRadius: "inherit",
                backgroundColor: "transparent",
              },
            },
            icon: {
              transition: "transform .2s ease",
            },
          },
        },
        MuiSwitch: {
          styleOverrides: getMuiSwitchStyleOverrides(color),
        },
        MuiSlider: {
          styleOverrides: {
            thumb: {
              "&.Mui-focusVisible": {
                outline: `3px solid ${color.primary}`,
                outlineOffset: 2,
              },
            },
          },
        },
        MuiRadio: {
          styleOverrides: {
            root: {
              "&.Mui-focusVisible": {
                outline: `3px solid ${color.primary}`,
                outlineOffset: 0,
              },
            },
          },
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
              fontWeight: 650,
              textOverflow: "ellipsis",
              textTransform: "none",
              transition: "background-color .2s ease, color .2s ease",
              whiteSpace: "nowrap",
              "&.Mui-selected": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
                fontWeight: 650,
              },
              "&&.Mui-focusVisible": {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
            },
          },
        },
        MuiMenuItem: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              color: color.onSurface,
              transition:
                "background-color .2s ease, color .2s ease, box-shadow .2s ease",
              "&:hover": {
                backgroundColor: color.surfaceContainer,
                "@media (hover: none)": {
                  backgroundColor: "transparent",
                },
              },
              "&.Mui-selected": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
              },
              "&.Mui-selected:hover": {
                backgroundColor: color.secondaryContainer,
              },
              "&&.Mui-focusVisible": {
                outline: "none",
                backgroundColor: color.surfaceHigh,
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              "&&.Mui-selected.Mui-focusVisible": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
              },
            },
          },
        },
        MuiToggleButton: {
          styleOverrides: {
            root: {
              borderRadius: 8,
              color: color.onSurfaceVariant,
              transition:
                "background-color .2s ease, color .2s ease, box-shadow .2s ease",
              "&:hover": {
                backgroundColor: color.surfaceContainer,
                "@media (hover: none)": { backgroundColor: "transparent" },
              },
              "&.Mui-selected": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
                fontWeight: 650,
              },
              "&.Mui-selected:hover": {
                backgroundColor: color.secondaryContainer,
              },
              "&&.Mui-focusVisible": {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              "&&.Mui-focusVisible": {
                outline: "none",
                backgroundColor: color.surfaceHigh,
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              "&&.Mui-selected.Mui-focusVisible": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
              },
            },
          },
        },
        MuiCard: {
          styleOverrides: {
            root: {
              border: `1px solid ${color.outlineVariant}`,
              borderRadius: 12,
              boxShadow: "none",
            },
          },
        },
        MuiAccordion: {
          defaultProps: { disableGutters: true },
          styleOverrides: {
            root: {
              overflow: "hidden",
              border: `1px solid ${color.outlineVariant}`,
              borderRadius: "12px !important",
              boxShadow: "none",
              "&::before": { display: "none" },
            },
          },
        },
        MuiAccordionSummary: {
          styleOverrides: {
            root: {
              "&&.Mui-focusVisible": {
                outline: "none",
                backgroundColor: color.surfaceHigh,
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
            },
          },
        },
        MuiLoadingButton: {
          styleOverrides: {
            loadingIndicator: { color: color.primary },
          },
        },
        MuiBackdrop: {
          styleOverrides: {
            root: {
              "@media (prefers-reduced-motion: reduce)": {
                transitionDuration: "0.01ms !important",
              },
            },
          },
        },
        MuiDialog: {
          styleOverrides: {
            root: {
              "@media (prefers-reduced-motion: reduce)": {
                "& .MuiDialog-paper": {
                  animationDuration: "0.01ms !important",
                  transitionDuration: "0.01ms !important",
                },
              },
            },
            paper: { borderRadius: 28 },
          },
        },
        MuiMenu: {
          styleOverrides: {
            paper: { borderRadius: 4 },
          },
        },
        MuiTooltip: {
          styleOverrides: {
            tooltip: { borderRadius: 4 },
          },
        },
        MuiPopover: {
          styleOverrides: {
            root: {
              "@media (prefers-reduced-motion: reduce)": {
                "& .MuiPaper-root": {
                  animationDuration: "0.01ms !important",
                  transitionDuration: "0.01ms !important",
                },
              },
            },
          },
        },
        MuiAlert: {
          styleOverrides: { root: { borderRadius: 12 } },
        },
        MuiSnackbarContent: {
          styleOverrides: { root: { borderRadius: 8 } },
        },
      },
      ...Object.fromEntries(
        Object.entries(options).filter(
          ([key]) => key !== "components" && key !== "typography"
        )
      ),
    };
    return createTheme(themeOptions, { components: options.components || {} });
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
