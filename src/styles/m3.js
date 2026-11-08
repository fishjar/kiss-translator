export const M3_COLORS = {
  light: {
    primary: "#0B57D0",
    onPrimary: "#FFFFFF",
    primaryContainer: "#D3E3FD",
    onPrimaryContainer: "#041E49",
    secondaryContainer: "#C2E7FF",
    onSecondaryContainer: "#001D35",
    tertiaryContainer: "#C4EED0",
    onTertiaryContainer: "#072711",
    error: "#B3261E",
    errorContainer: "#F9DEDC",
    onErrorContainer: "#8C1D18",
    success: "#146C2E",
    background: "#F8FAFD",
    surface: "#FFFFFF",
    surfaceLow: "#F3F6FB",
    surfaceContainer: "#F0F4F9",
    surfaceHigh: "#E9EEF6",
    surfaceHighest: "#DDE3EA",
    onSurface: "#1F1F1F",
    onSurfaceVariant: "#444746",
    outline: "#747775",
    outlineVariant: "#C9CDD3",
    inverseSurface: "#2F3033",
    onInverseSurface: "#F1F1F1",
  },
  dark: {
    primary: "#A8C7FA",
    onPrimary: "#062E6F",
    primaryContainer: "#0842A0",
    onPrimaryContainer: "#D3E3FD",
    secondaryContainer: "#004A77",
    onSecondaryContainer: "#C2E7FF",
    tertiaryContainer: "#0F5223",
    onTertiaryContainer: "#C4EED0",
    error: "#F2B8B5",
    errorContainer: "#601410",
    onErrorContainer: "#F9DEDC",
    success: "#6DD58C",
    background: "#131314",
    surface: "#1E1F20",
    surfaceLow: "#232426",
    surfaceContainer: "#282A2C",
    surfaceHigh: "#2D2F31",
    surfaceHighest: "#37393B",
    onSurface: "#E3E3E3",
    onSurfaceVariant: "#C4C7C5",
    outline: "#8E918F",
    outlineVariant: "#3F4245",
    inverseSurface: "#E3E3E3",
    onInverseSurface: "#303030",
  },
};

export const M3_BRAND_COLORS = {
  blue: { light: {}, dark: {} },
  cyan: {
    light: {
      primary: "#006874",
      onPrimary: "#FFFFFF",
      primaryContainer: "#97F0FF",
      onPrimaryContainer: "#001F24",
      secondaryContainer: "#CDE7EC",
      onSecondaryContainer: "#051F23",
    },
    dark: {
      primary: "#4FD8EB",
      onPrimary: "#00363D",
      primaryContainer: "#004F58",
      onPrimaryContainer: "#97F0FF",
      secondaryContainer: "#334B4F",
      onSecondaryContainer: "#CDE7EC",
    },
  },
  violet: {
    light: {
      primary: "#6750A4",
      onPrimary: "#FFFFFF",
      primaryContainer: "#EADDFF",
      onPrimaryContainer: "#21005D",
      secondaryContainer: "#E8DEF8",
      onSecondaryContainer: "#1D192B",
    },
    dark: {
      primary: "#D0BCFF",
      onPrimary: "#381E72",
      primaryContainer: "#4F378B",
      onPrimaryContainer: "#EADDFF",
      secondaryContainer: "#4A4458",
      onSecondaryContainer: "#E8DEF8",
    },
  },
};

// 图标风格快照 store：分发器组件经 useSyncExternalStore 订阅本 store，由
// M3Theme 把 setting.iconStyle 推入——图标模块自身保持零重依赖（不 import
// hooks/Setting，避免拖入 apis 重图）。当前 iconStyle 设置键切换不可达、
// resolveIconStyle 恒回退缺省 lucide（安全回退）。终局设计：快照推送将由
// hooks/Setting.js 统一推送，带 isLoading 守卫，并统一推送 iconStyle+iconColor
// 双快照。
export const DEFAULT_ICON_STYLE = "lucide";
export const DEFAULT_ICON_COLOR = "#90b2ba";

export function resolveIconStyle(value) {
  return value === "mui" ? "mui" : DEFAULT_ICON_STYLE;
}

let iconStyleSnapshot = DEFAULT_ICON_STYLE;
const iconStyleListeners = new Set();

export function setIconStyleSnapshot(value) {
  const next = resolveIconStyle(value);
  if (next === iconStyleSnapshot) {
    return;
  }
  iconStyleSnapshot = next;
  iconStyleListeners.forEach((listener) => listener(next));
}

export function subscribeIconStyle(listener) {
  iconStyleListeners.add(listener);
  return () => {
    iconStyleListeners.delete(listener);
  };
}

export function getIconStyleSnapshot() {
  return iconStyleSnapshot;
}

export function resolveM3Colors(mode = "light", brand = "blue") {
  return {
    ...M3_COLORS[mode],
    ...(M3_BRAND_COLORS[brand]?.[mode] || {}),
  };
}

export function resolveM3ThemeMode(mode = "auto", prefersDark = false) {
  return mode === "dark" || (mode === "auto" && prefersDark) ? "dark" : "light";
}

export function createM3CssVariables(colors) {
  return {
    "--kt-pri": colors.primary,
    "--kt-onpri": colors.onPrimary,
    "--kt-pric": colors.primaryContainer,
    "--kt-onpric": colors.onPrimaryContainer,
    "--kt-secc": colors.secondaryContainer,
    "--kt-onsecc": colors.onSecondaryContainer,
    "--kt-terc": colors.tertiaryContainer,
    "--kt-onterc": colors.onTertiaryContainer,
    "--kt-grn": colors.success,
    "--kt-err": colors.error,
    "--kt-errc": colors.errorContainer,
    "--kt-onerrc": colors.onErrorContainer,
    "--kt-bg": colors.background,
    "--kt-sf0": colors.surface,
    "--kt-sf1": colors.surfaceLow,
    "--kt-sf2": colors.surfaceContainer,
    "--kt-sf3": colors.surfaceHigh,
    "--kt-sf4": colors.surfaceHighest,
    "--kt-on": colors.onSurface,
    "--kt-onv": colors.onSurfaceVariant,
    "--kt-line": colors.outline,
    "--kt-linev": colors.outlineVariant,
    "--kt-inv": colors.inverseSurface,
    "--kt-oninv": colors.onInverseSurface,
  };
}

export function createM3CssVariableDeclarations(colors) {
  return Object.entries(createM3CssVariables(colors))
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n");
}

export const M3_FONT_FAMILY =
  '"Google Sans Flex", "Google Sans", "Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/* 焦点静默抑制规则（单源）：M3Theme 域经 M3_GLOBAL_CSS 注入；
   FileTranslate 等自建 ThemeProvider 域直接注入本导出。 */
export const FOCUS_SILENT_CSS = String.raw`
[data-kt-focus-silent="true"]:focus-visible { outline: none !important; }
[data-kt-focus-silent="true"][role="option"]:focus-visible,
[data-kt-focus-silent="true"][role="menuitem"]:focus-visible,
[data-kt-focus-silent="true"][role="menuitemcheckbox"]:focus-visible,
[data-kt-focus-silent="true"][role="menuitemradio"]:focus-visible,
[data-kt-focus-silent="true"][role="switch"]:focus-visible,
[data-kt-focus-silent="true"].MuiMenuItem-root:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
/* 不支持 :focus-visible 的内核会整条丢弃上方规则，静默标记随之失效；
   该窗口内浏览器对脚本聚焦一律按 :focus 绘制轮廓，故以 :focus 等价
   兜底。键盘模态切入时静默标记已被清除，键盘语境的环不受影响。 */
@supports not selector(:focus-visible) {
  [data-kt-focus-silent="true"]:focus { outline: none !important; }
  [data-kt-focus-silent="true"][role="option"]:focus,
  [data-kt-focus-silent="true"][role="menuitem"]:focus,
  [data-kt-focus-silent="true"][role="menuitemcheckbox"]:focus,
  [data-kt-focus-silent="true"][role="menuitemradio"]:focus,
  [data-kt-focus-silent="true"][role="switch"]:focus,
  [data-kt-focus-silent="true"].MuiMenuItem-root:focus {
    outline: none !important;
    box-shadow: none !important;
  }
}
`;

export const M3_GLOBAL_CSS = String.raw`
:host,
.kt-m3-root {
  --kt-spring: cubic-bezier(.3, 1.4, .4, 1);
  --kt-shadow-1: 0 1px 2px rgba(0, 0, 0, .14), 0 1px 6px 1px rgba(0, 0, 0, .08);
  --kt-shadow-2: 0 4px 8px 3px rgba(0, 0, 0, .1), 0 1px 3px rgba(0, 0, 0, .18);
  color: var(--kt-on);
  font-family: "Google Sans Flex", "Google Sans", "Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.kt-m3-root[data-theme="dark"] {
  --kt-shadow-1: 0 1px 2px rgba(0, 0, 0, .5), 0 1px 6px 1px rgba(0, 0, 0, .35);
  --kt-shadow-2: 0 4px 10px 3px rgba(0, 0, 0, .45), 0 1px 3px rgba(0, 0, 0, .5);
}

.kt-m3-root,
.kt-m3-root *,
.kt-m3-root *::before,
.kt-m3-root *::after {
  box-sizing: border-box;
}

:where(.kt-m3-root button:not(.MuiButtonBase-root)),
.kt-m3-root input,
.kt-m3-root select,
.kt-m3-root textarea {
  font: inherit;
}

.kt-m3-root input,
.kt-m3-root select,
.kt-m3-root textarea { color: inherit; }

.kt-m3-root .MuiInputBase-input {
  box-sizing: content-box;
}

.kt-m3-root button {
  -webkit-tap-highlight-color: transparent;
}

.kt-m3-root :focus {
  outline: 3px solid var(--kt-pri);
  outline-offset: 2px;
}

@supports selector(:focus-visible) {
  .kt-m3-root :focus { outline: none; }
  .kt-m3-root :focus-visible {
    outline: 3px solid var(--kt-pri);
    outline-offset: 2px;
  }
}

.kt-m3-root .MuiInputBase-input:focus {
  outline: none;
}

.kt-m3-root .MuiButtonBase-root input:focus,
.kt-m3-root .MuiSlider-input:focus {
  outline: none;
}

@supports selector(:focus-visible) {
  .kt-m3-root .MuiInputBase-input:focus-visible { outline: none; }
  .kt-m3-root .MuiButtonBase-root input:focus-visible,
  .kt-m3-root .MuiSlider-input:focus-visible { outline: none; }
}

/* Select 触发元焦点环恢复（焦点环配对：有语义必有环）：div.MuiSelect-select
   （role=combobox 触发元）class 链含 MuiInputBase-input，被上方 input
   豁免规则误伤（豁免本意是文本输入的容器焦点渲染口径），键盘聚焦零环。
   恢复规则排在豁免块之后（同特异性靠后者胜）；形态对齐全局基格外扩 2px。 */
@supports selector(:focus-visible) {
  .kt-m3-root .MuiSelect-select:focus-visible {
    outline: 3px solid var(--kt-pri);
    outline-offset: 2px;
  }
}

@media (forced-colors: active) {
  .kt-m3-root .MuiSelect-select:focus-visible {
    outline: 3px solid;
    outline-offset: 2px;
  }
}

/* 旧内核兜底（焦点环配对：有语义必有环）：不支持 :focus-visible/selector() 的
   内核（Safari ≤15.4 等）整块跳过上方 @supports，且全局姿态鼠标 :focus
   零指示、键盘指示全走 :focus-visible → 旧内核键盘聚焦 Select 触发元零
   环。必须用 @supports not 包裹：裸 :focus 规则会破坏现代内核"鼠标 :focus
   零指示"姿态（鼠标点击 Select 也画环）；@supports not 块现代内核整块
   跳过，行为零变化。形态对齐上方现代环（3px 主色外扩 2px）。旧内核
   forced-colors 场景由系统配色天然提供焦点指示，不另加同构兜底块。 */
@supports not selector(:focus-visible) {
  .kt-m3-root .MuiSelect-select:focus {
    outline: 3px solid var(--kt-pri);
    outline-offset: 2px;
  }
}

.kt-m3-root ::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.kt-m3-root ::-webkit-scrollbar-thumb {
  background: var(--kt-sf4);
  background-clip: content-box;
  border: 3px solid transparent;
  border-radius: 999px;
}

.kt-m3-root ::-webkit-scrollbar-track {
  background: transparent;
}

/* 类语义备忘：kt-resizable-textarea 现仅承载 16px 滚动条样式钩子；
   原生 resizer 已由自绘手柄（TextareaResizeGrip）替代，视图侧不再依赖
   原生 resize 行为。该类的 8 处消费见各视图 inputProps.className。 */
.kt-m3-root textarea.kt-resizable-textarea:not([aria-hidden="true"])::-webkit-scrollbar {
  width: 16px;
  height: 16px;
}

.kt-m3-root .kt-height-locked.MuiInputBase-root {
  min-height: 0 !important;
}

/* 手柄焦点环显式规则：不静默依赖 m3 全局级联——Shadow DOM 场景
   或后续全局 :focus/:focus-visible 规则调整（如新增 input 类豁免）不会
   静默丢失焦点指示。口径：现代内核鼠标 :focus 零指示，键盘 :focus-visible
   画 3px 主色内嵌环（inset box-shadow，不外扩）。内嵌而非外扩：手柄盒紧贴
   字段右下角并与右下角操作簇共边，外扩环会越盒伸入按钮实心圆的绘制区，
   被其 z-index: 1 叠成缺角；内嵌环不越盒，叠序无从生效。旧内核无
   :focus-visible 与 selector() 支持，走基格兜底：:focus 直接画同一内嵌环，
   与全局级联基格同口径。 */
.kt-m3-root .kt-resize-grip:focus {
  outline: none;
  box-shadow: inset 0 0 0 3px var(--kt-pri);
}

@supports selector(:focus-visible) {
  .kt-m3-root .kt-resize-grip:focus {
    outline: none;
    box-shadow: none;
  }
  .kt-m3-root .kt-resize-grip:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 3px var(--kt-pri);
  }
}

/* 脚本化聚焦抑制：指针模态下由 scriptFocus() 落焦的元素不得长出焦点框。
   模态判定见 hooks/focusModality.js——浏览器对脚本化聚焦沿用上一次交互的
   :focus-visible 结果，故"鼠标开菜单→焦点移到选中项"也会画环，历次只改
   画法（outline→inset）不改触发域的修法必然复发。规则本体单源于
   FOCUS_SILENT_CSS（含选择器与排序约束说明），此处插值注入；
   必须排在本文件最后一个 @supports selector(:focus-visible) 块之后：
   同特异性靠源码顺序压过各块的 outline 处置。 */
${FOCUS_SILENT_CSS}

/* forced-colors 域 UA 忽略 box-shadow，上方内嵌环失效而 outline:none 仍生效
   → 该域换系统色描边（不写颜色，outline-color 由强制引擎接管）。必须排在
   @supports 块之后：同特异性靠源码顺序压过其 outline:none。用 :focus 兜底
   无 :focus-visible 的旧内核。上方环若改回描边，本块须一并删除。 */
@media (forced-colors: active) {
  .kt-m3-root .kt-resize-grip:focus {
    outline: 3px solid;
    outline-offset: -3px;
  }
}

.kt-m3-root .kt-height-locked textarea:not([aria-hidden="true"]) {
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: auto !important;
  /* 锁定态底部预留 24px 手柄热区：border-box 使 padding 计入 100% 高度
     盒内（覆盖 .MuiInputBase-input 的 content-box 规则），内容最低行不
     被角部浮层遮挡，边框盒也不溢出锁定 root。 */
  box-sizing: border-box !important;
  padding-bottom: 24px !important;
}

@keyframes kt-m3-pop {
  0% { opacity: 0; transform: scale(.5); }
  65% { opacity: 1; transform: scale(1.05); }
  100% { transform: scale(1); }
}

@keyframes kt-m3-rise {
  from { opacity: 0; transform: translateY(14px) scale(.97); }
  to { opacity: 1; transform: none; }
}

@keyframes kt-m3-spin { to { transform: rotate(360deg); } }

@keyframes kt-m3-sweep {
  0% { left: -40%; width: 40%; }
  55%, 100% { left: 100%; width: 55%; }
}

@keyframes kt-m3-glow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

@media (prefers-reduced-motion: reduce) {
  .kt-m3-root *,
  .kt-m3-root *::before,
  .kt-m3-root *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
`;
