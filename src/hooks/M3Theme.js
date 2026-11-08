import { useMemo, useRef, useLayoutEffect } from "react";
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
  setIconStyleSnapshot,
} from "../styles/m3";
import { getMuiSwitchStyleOverrides } from "./themeStyles";
import { useSystemDarkPreference } from "./SystemColorScheme";
import { useSetting } from "./Setting";
import { installFocusModality } from "./focusModality";

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

  // 图标风格快照同步：入口根挂载的 M3Theme 把 setting.iconStyle 推入分发
  // 器订阅的 store（setIconStyleSnapshot 内部经 resolveIconStyle 归一，
  // 设置键未上线时安全回退缺省 lucide）。两段式同步：首渲染在渲染体内
  // 初始化快照——订阅方图标组件经 useSyncExternalStore 在渲染期读取
  // getIconStyleSnapshot，快照必须在本组件渲染体落定，子组件首渲染即见
  // 当前 iconStyle（ref 守卫仅执行一次，StrictMode 重复渲染时快照已落定、
  // 幂等跳过）；后续 iconStyle 变化改在布局 effect 中更新——绘制前落定
  // 不闪旧风格帧，且避开渲染期通知：值变化会同步通知订阅方，渲染期通知
  // 会令已挂载的订阅组件在 M3Theme 渲染中途被调度重渲染。
  // 挂载与安全口径：全部入口（popup / Action / ContentFab / ImageTranslate /
  // Selection / TouchTranslateStatus / Options / RuleEditor）的 M3Theme 均
  // 嵌在 SettingProvider 内侧，且 Provider 在加载/读取失败期不渲染
  // children——本行解构执行时 setting 必为已加载值。缺省 context 亦自带
  // setting: DEFAULT_SETTING（Setting.js），即使未来出现无 Provider 的挂载
  // 点，解构与 setting?.iconStyle 均空安全，不存在渲染崩溃路径。
  // 为何不在此处上收 Setting.js：全部入口自身已引入 SettingProvider，主题
  // 层引用 useSetting 不给任何入口新增依赖链；带上 isLoading 守卫并统一
  // iconStyle/iconColor 双快照的完整上收，属图标设置键上线分支的既定终局
  // 形态，避免此处先行实现半套、后续返工。
  const { setting } = useSetting();
  const iconStyleInitRef = useRef(false);
  if (!iconStyleInitRef.current) {
    iconStyleInitRef.current = true;
    setIconStyleSnapshot(setting?.iconStyle);
  }
  useLayoutEffect(() => {
    setIconStyleSnapshot(setting?.iconStyle);
  }, [setting?.iconStyle]);

  // 焦点模态监听：所有 surface 的唯一包裹层在这里对 ownerDocument 显式安装
  // 模态监听（幂等，per-document；Shadow DOM / 独立窗口各自安装）。此后
  // MUI 自持 autofocus 等任何聚焦路径都在 focusin 统一处置覆盖之下。
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    installFocusModality(rootRef.current?.ownerDocument);
  }, []);

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
        ref={rootRef}
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
