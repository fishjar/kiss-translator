import { useMemo, useRef, useLayoutEffect, useSyncExternalStore } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import {
  ArrowDropDownIcon,
  CancelIcon,
  CheckCircleIcon,
  CloseIcon,
  ErrorIcon,
  InfoIcon,
  WarningIcon,
} from "../components/icons/lucide";
import { useDarkMode } from "./ColorMode";
import { THEME_DARK, THEME_LIGHT } from "../config";
import {
  createM3CssVariables,
  getIconColorSnapshot,
  M3_FONT_FAMILY,
  M3_GLOBAL_CSS,
  resolveM3Colors,
  resolveM3ThemeMode,
  subscribeIconColor,
} from "../styles/m3";
import {
  getIconStyleSnapshot,
  subscribeIconStyle,
} from "../styles/iconStyleStore";
import { getMuiSwitchStyleOverrides } from "./themeStyles";
import { useSystemDarkPreference } from "./SystemColorScheme";
import { retainFocusModality, releaseFocusModality } from "./focusModality";

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
  const iconStyle = useSyncExternalStore(
    subscribeIconStyle,
    getIconStyleSnapshot,
    getIconStyleSnapshot
  );
  const iconColor = useSyncExternalStore(
    subscribeIconColor,
    getIconColorSnapshot,
    getIconColorSnapshot
  );

  // 焦点模态反转：所有 surface 的唯一包裹层在这里对 ownerDocument 显式安装
  // 模态监听（幂等，per-document；Shadow DOM / 独立窗口各自安装）。此后
  // MUI 自持 autofocus 等任何聚焦路径都在 focusin 统一处置覆盖之下。
  const rootRef = useRef(null);
  useLayoutEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return undefined;
    // 持有计数单源在 focusModality：同 doc 多宿主（弹窗双主题、面板+悬浮球）
    // 部分释放时监听保留，末持有者释放才摘；外部安装腿同池计数不再被误摘。
    retainFocusModality(doc);
    return () => releaseFocusModality(doc);
  }, []);

  const previewMode =
    process.env.NODE_ENV === "development"
      ? new URLSearchParams(window.location.search).get("theme")
      : null;
  const resolvedMode =
    previewMode === THEME_DARK || previewMode === THEME_LIGHT
      ? previewMode
      : resolveM3ThemeMode(darkMode, systemPrefersDark);
  const colors = useMemo(
    () => resolveM3Colors(resolvedMode, M3_BRAND_COLOR, iconColor),
    [resolvedMode, iconColor]
  );

  const theme = useMemo(() => {
    const color = colors;
    const focusRing = {
      outline: `3px solid ${color.primary}`,
      outlineOffset: 2,
    };
    // forced-colors（高对比度）域兜底：inset box-shadow 焦点环被强制引擎
    // 整体忽略、outline:none 压制 UA 默认环，须以系统色描边兜底。兜底模板显式声明
    // 2px CanvasText（宿主全局 outline 清除可能吞掉
    // 引擎默认形态），offset 向外与边框分离、不与 2px 描边重叠。
    const forcedColorsFocusRing = {
      outline: "2px solid CanvasText",
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
        success: { main: color.success },
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
              "&:focus-visible": focusRing,
            },
            contained: { boxShadow: "none" },
          },
        },
        MuiIconButton: {
          styleOverrides: {
            root: ({ ownerState }) => ({
              ...(ownerState.color === "default" && {
                color: color.icon,
                "&:hover": {
                  backgroundColor: color.surfaceContainer,
                  "@media (hover: none)": { backgroundColor: "transparent" },
                },
              }),
              transition: "background .3s, color .3s, transform .15s",
              "&:active": { transform: "scale(.94)" },
              "&:focus-visible": focusRing,
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
              // 下拉字段的指针聚焦静默压制：指针模态 focusin 已给落点挂
              // data-kt-focus-silent，命中后边框透明；键盘模态无静默标记，
              // 边框照画。普通文本输入框无 .MuiSelect-select 后代，永不命中，
              // 边框保持基线现状。
              // 两条 :has(...) 规则整体包进 @supports selector(:has(*))：jsdom
              // 16.7.0（cssom 0.3.8 + nwsapi 2.2.23）从不下钻 CSSSupportsRule，
              // nwsapi 不再编译 :has 选择器；浏览器 Chrome 105+/FF 121+ 判 true
              // 照常生效。语义等价，规则本体不变。
              "@supports selector(:has(*))": {
                // 排除 .Mui-error：本键不带该排除时，(0,4,0) 的透明描边压过
                // &.Mui-error.Mui-focused (0,3,0)，校验信号消失；追加后错误态
                // 整条规则不命中，描边归错误色。
                '&.Mui-focused:has(.MuiSelect-select[data-kt-focus-silent="true"]):not(.Mui-error)':
                  {
                    borderColor: "transparent",
                    // 指针聚焦＝与未聚焦同观感：边框与填充底色一并压制，
                    // 字段不再因聚焦换底色而隐没。键盘路径无静默标记，不命中本键。
                    backgroundColor: color.surfaceContainer,
                  },
                // 菜单展开期间焦点移到菜单项上，字段级边框让位给菜单项的焦点指示。
                // 全模态（指针/键盘）透明；关闭期 aria-expanded 回 "false" 不命中。
                // aria-expanded 由 MUI 在 display 元素上恒定管理，无 JS 生命周期竞态。
                // 打开期容器填充保留（surfaceContainer），字段底色不随聚焦漂移；
                // 焦点指示由菜单项承担，字段本身隐为容器。键盘路径命中本键时
                // 边框虽透明但填充仍在，字段轮廓不隐没。
                '&.Mui-focused:has(.MuiSelect-select[aria-expanded="true"]):not(.Mui-error)':
                  {
                    borderColor: "transparent",
                    backgroundColor: color.surfaceContainer,
                  },
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
          ...(iconStyle === "lucide" && {
            defaultProps: { IconComponent: ArrowDropDownIcon },
          }),
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
              "&:focus-visible": {
                outline: `3px solid ${color.primary}`,
                outlineOffset: 2,
              },
              // :has() 兜底：thumb 内含的 input 获焦时 thumb 自身不匹配 :focus-visible，
              // 须在外层匹配"含 focus-visible 后代"以显示焦点环。
              "@supports selector(:has(*))": {
                "&:has(:focus-visible)": {
                  outline: `3px solid ${color.primary}`,
                  outlineOffset: 2,
                },
              },
            },
          },
        },
        MuiRadio: {
          styleOverrides: {
            root: {
              "&:focus-visible": {
                outline: `3px solid ${color.primary}`,
                outlineOffset: 0,
              },
              // :has() 兜底：Radio root 内含的 input 获焦时 root 自身不匹配 :focus-visible，
              // 须在外层匹配"含 focus-visible 后代"以显示焦点环。
              "@supports selector(:has(*))": {
                "&:has(:focus-visible)": {
                  outline: `3px solid ${color.primary}`,
                  outlineOffset: 0,
                },
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
              "&&:focus-visible": {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              "&&.Mui-selected:focus-visible": {
                boxShadow: `inset 0 0 0 3px ${color.onSecondaryContainer}`,
              },
              ".kt-popup-tabs &&.Mui-selected:focus-visible": {
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              // HC 域兜底：box-shadow 被强制引擎忽略，补系统色描边（统一一套，
              // 不按 selected/popup 变体分色）。
              "@media (forced-colors: active)": {
                "&&:focus-visible:focus": forcedColorsFocusRing,
              },
            },
          },
        },
        MuiMenuItem: {
          styleOverrides: {
            root: {
              // 几何锁（菜单度量）：行圆角 4dp，选中底色/染层/
              // 焦点环全部跟随行盒圆角；与 Menu 容器 8px 水平内缩配合，
              // 端部不以直角戳出容器。
              borderRadius: 4,
              "&.Mui-selected": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
              },
              // 选中项 hover：在 secondaryContainer 底色上合成 8% State Layer
              // （hover 档 8%；合成色保住底色，不整段替换）。悬停前景换
              // onSurface 承担对比度修复：onSecondaryContainer 对合成底
              // （secc 92% + 前景 8%）在暗色域部分色相跌破 4.5，onSurface
              // 全域过线；State Layer 口径不变，currentColor 即取悬停前景。
              "&.Mui-selected:hover": {
                backgroundColor: `color-mix(in srgb, ${color.secondaryContainer} 92%, currentColor 8%)`,
                color: color.onSurface,
              },
              // 多选菜单行：勾选视觉唯一载体＝行首 MenuCheckGlyph 图标交换
              // （mui/lucide 双态四图标，组件级切换）。整行染色属 aria-selected
              // 布尔驱动的第二视觉通道，按规范移除，仅视觉去染色。
              // 两条闸并存覆盖两种多选行载体：
              // ① PopupMenu/MultiSelect/PopupTextPanel/ContentFab 的
              //    role="menuitemcheckbox" 行（ARIA 合规形态，语义由行级
              //    aria-checked 承载）；
              // ② MUI multiple Select 的 listbox 行——SelectInput 强制行
              //    role="option"，容器挂 aria-multiselectable（listbox 上的
              //    该属性为 ARIA 合规形态），故按容器属性命中。
              // 单选行无行首图标，染色保留不动。
              '&.Mui-selected[role="menuitemcheckbox"]': {
                backgroundColor: "transparent",
                color: color.onSurface,
              },
              '&&.Mui-selected[role="menuitemcheckbox"]:hover': {
                backgroundColor:
                  "color-mix(in srgb, currentColor 8%, transparent)",
              },
              '[aria-multiselectable="true"] &.Mui-selected': {
                backgroundColor: "transparent",
                color: color.onSurface,
              },
              // 多选 listbox option 行 hover 须有专属 8% currentColor 叠色，特异度需压过透明底规则
              '[aria-multiselectable="true"] &&.Mui-selected:hover': {
                backgroundColor:
                  "color-mix(in srgb, currentColor 8%, transparent)",
              },
              // 单选 selected focus-visible 保留原选中底色不叠状态层：暗色域
              // 自适应令牌下 onSecondaryContainer 对 secondaryContainer 的
              // 连续 hue 扫描下限 4.53:1，叠 12% 状态层会把文字对比度压到
              // 3.71:1（低于 AA 4.5:1）——焦点指示由 primary 内嵌环独立承担。
              // 显式声明 secondaryContainer 底：通用 focus-visible 键降档为
              // 单 &（(0,3,0)），本规则 (0,4,0) 按特异度胜出，焦点态不丢选中底。
              "&&.Mui-selected:focus-visible": {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
                backgroundColor: color.secondaryContainer,
              },
              // 多选 menuitemcheckbox focus-visible 保持透明底（覆盖 &&.Mui-selected:focus-visible）；指针模态脚本聚焦的行带 data-kt-focus-silent，:not 令整条叠色让位、背景回落 base，键盘模态无标记时照常绘制 12% 即时反馈
              '&&.Mui-selected[role="menuitemcheckbox"]:focus-visible:not([data-kt-focus-silent="true"])':
                {
                  outline: "none",
                  boxShadow: `inset 0 0 0 3px ${color.primary}`,
                  backgroundColor:
                    "color-mix(in srgb, currentColor 12%, transparent)",
                },
              // 指针静默多选 checkbox 选中行让位选中实底：上条 12% 叠色被 :not
              // 摘除后，单选 &&.Mui-selected:focus-visible（特异度 (0,4,0)）会把
              // 带 .Mui-selected 的多选行压成 secondaryContainer 实心；本条命中
              // 静默标记在场、特异度 (0,7,0) 压回透明，使指针静默多选行背景＝未
              // 聚焦多选选中态（透明 + 行首勾选图标）。:not(:hover) 让真实悬停时
              // 本条退场，由 &&.Mui-selected[role=…]:hover 的 8% State Layer 接管；
              // 焦点钉在末行不会因悬停转移，故必须靠 :not(:hover) 而非"标记让位"。
              '&&.Mui-selected[role="menuitemcheckbox"]:focus-visible[data-kt-focus-silent="true"]:not(:hover)':
                {
                  backgroundColor: "transparent",
                },
              // 多选 multiselectable option focus-visible 保持透明底（键盘模态）；&& 抬到 (0,6,0)
              // 严格压过下方 && hover 键 (0,5,0)，"键盘+悬停"选中行仍显 12%+inset，不靠源码顺序独木支撑
              '[aria-multiselectable="true"] &&.Mui-selected:focus-visible:not([data-kt-focus-silent="true"])':
                {
                  outline: "none",
                  boxShadow: `inset 0 0 0 3px ${color.primary}`,
                  backgroundColor:
                    "color-mix(in srgb, currentColor 12%, transparent)",
                },
              // 指针静默多选 option 选中行同理：命中静默标记、特异度 (0,7,0) 压回
              // 透明；:not(:hover) 使真实悬停时本条退场，由 [aria-multiselectable]
              // &&.Mui-selected:hover 的 8% State Layer 接管。键盘模态无标记不命中。
              '[aria-multiselectable="true"] &&.Mui-selected:focus-visible[data-kt-focus-silent="true"]:not(:hover)':
                {
                  backgroundColor: "transparent",
                },
              color: color.onSurface,
              transition:
                "background-color .2s ease, color .2s ease, box-shadow .2s ease",
              "&:hover": {
                backgroundColor:
                  "color-mix(in srgb, currentColor 8%, transparent)",
              },
              // 单 & 降档（(0,3,0)）：仍压 &:hover（(0,2,0)）保留键盘 12% 反
              // 馈；让位 &&.Mui-selected:focus-visible（(0,4,0)）与 checkbox/
              // 多选 (0,6,0) 规则，选中行底色不被平局压过。
              '&:focus-visible:not([data-kt-focus-silent="true"])': {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
                backgroundColor:
                  "color-mix(in srgb, currentColor 12%, transparent)",
              },
              // forced-colors 兜底（对齐仓内先例 forcedColorsFocusRing 配对模式）：
              // 强制色彩模式剥离 boxShadow，须以 outline 内描恢复键盘环。
              // 选中行分支须与普通域 selected 规则（携带 outline:none 与静默
              // :not 口径）逐字同构，特异度同 (0,6,0)、靠后置位胜出——否则
              // selected 行的 outline:none 在 HC 域压过下方通用兜底，焦点不可见；
              // 指针静默行（脚本聚焦）在 HC 域同样不画键盘环。
              "@media (forced-colors: active)": {
                '&&:focus-visible:not([data-kt-focus-silent="true"])': {
                  outline: "2px solid CanvasText",
                  outlineOffset: 2,
                },
                '&&.Mui-selected:focus-visible:not([data-kt-focus-silent="true"])':
                  {
                    outline: "2px solid CanvasText",
                    outlineOffset: 2,
                  },
                '&&.Mui-selected[role="menuitemcheckbox"]:focus-visible:not([data-kt-focus-silent="true"])':
                  {
                    outline: "2px solid CanvasText",
                    outlineOffset: 2,
                  },
                '[aria-multiselectable="true"] &&.Mui-selected:focus-visible:not([data-kt-focus-silent="true"])':
                  {
                    outline: "2px solid CanvasText",
                    outlineOffset: 2,
                  },
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
                backgroundColor: `color-mix(in srgb, ${color.secondaryContainer} 92%, currentColor 8%)`,
                color: color.onSurface,
              },
              "&&:focus-visible": {
                outline: "none",
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              "&&.Mui-selected:focus-visible": {
                boxShadow: `inset 0 0 0 3px ${color.onSecondaryContainer}`,
              },
              // HC 域兜底：selected 变体 inset onPrimary 在 HC 域无所谓（box-shadow
              // 整体被忽略），兜底描边统一一套，不按变体分色。
              "@media (forced-colors: active)": {
                "&&:focus-visible:focus": forcedColorsFocusRing,
              },
            },
          },
        },
        MuiListItemButton: {
          styleOverrides: {
            root: {
              "&&:focus-visible": {
                outline: "none",
                backgroundColor: color.surfaceHigh,
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              "&&.Mui-selected:focus-visible": {
                backgroundColor: color.secondaryContainer,
                color: color.onSecondaryContainer,
                boxShadow: `inset 0 0 0 3px ${color.onSecondaryContainer}`,
              },
              // HC 域兜底：surfaceHigh tint 保留（HC 域背景本就会被强制），
              // 补系统色描边恢复焦点可见性。
              "@media (forced-colors: active)": {
                "&&:focus-visible:focus": forcedColorsFocusRing,
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
              "&&:focus-visible": {
                outline: "none",
                backgroundColor: color.surfaceHigh,
                boxShadow: `inset 0 0 0 3px ${color.primary}`,
              },
              // forced-colors 兜底（内缩形）：Accordion 根 overflow:hidden
              // 为裁切容器，外扩描边会被容器裁掉——本面走内缩形，描边色
              // 交强制引擎（形态随 m3.js MenuItem HC 先例）。
              "@media (forced-colors: active)": {
                "&&:focus-visible:focus": {
                  outline: "3px solid",
                  outlineOffset: -3,
                },
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
            // 容器内缩 8px（垂直+水平）：行底色四周离容器边缘内缩，为行
            // 4dp 圆角与焦点环外延预留余量（规范菜单度量标尺单一口径）。
            // 内缩服务域限定为统一度量域（.kt-subtitle-menus）：弹窗系
            // paper 自管几何（6px / 8px 0 口径），不再叠加本内缩。
            list: { ".kt-subtitle-menus &": { padding: "8px 8px" } },
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
          ...(iconStyle === "lucide" && {
            defaultProps: {
              // Alert 四态统一走 Lucide 描边字形。
              iconMapping: {
                error: <ErrorIcon />,
                success: <CheckCircleIcon />,
                warning: <WarningIcon />,
                info: <InfoIcon />,
              },
              components: { CloseIcon },
            },
          }),
        },
        ...(iconStyle === "lucide" && {
          MuiAutocomplete: {
            defaultProps: {
              popupIcon: <ArrowDropDownIcon />,
              clearIcon: <CloseIcon />,
            },
          },
          MuiChip: {
            defaultProps: { deleteIcon: <CancelIcon /> },
          },
        }),
        MuiSnackbarContent: {
          styleOverrides: { root: { borderRadius: 8 } },
        },
        MuiListItemIcon: {
          styleOverrides: {
            // 主题实值而非 var(--kt-icon)：经 Portal 挂到 body 的菜单项
            // （MuiMenu 等）脱离 .kt-m3-root 变量作用域，变量引用会回落继承色。
            root: { color: color.icon },
          },
        },
        MuiCircularProgress: {
          styleOverrides: {
            // M3 圆头线帽；不动 dasharray 防破坏进度动画。
            circle: { strokeLinecap: "round" },
          },
        },
      },
      ...Object.fromEntries(
        Object.entries(options).filter(
          ([key]) => key !== "components" && key !== "typography"
        )
      ),
    };
    return createTheme(themeOptions, { components: options.components || {} });
  }, [colors, iconStyle, options, resolvedMode]);

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
