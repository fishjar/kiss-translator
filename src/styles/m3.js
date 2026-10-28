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

// 图标主体色：莫兰迪受限色相环。S=23.3%、L=64.7% 绝对锁死（规范环），
// 唯一自由维度为色相 h ∈ [0°, 360°)；存储恒存规范环 Hex（主题无关、
// hue 可无损反解、与存量值格式兼容），渲染侧按深浅模式经
// calculateAdaptiveIconColor 自适应映射。预设名随深浅模式双名制。
export const ICON_COLOR_PRESETS = [
  { id: "red", hue: 0.0, darkName: "红", lightName: "砖红", darkHex: "#ba9090", lightHex: "#723b3b" },
  { id: "apricot", hue: 44.3, darkName: "暖杏", lightName: "琥珀", darkHex: "#baaf90", lightHex: "#72643b" },
  { id: "sage", hue: 92.9, darkName: "鼠尾绿", lightName: "苔藓绿", darkHex: "#a3ba90", lightHex: "#54723b" },
  { id: "lake", hue: 191.4, darkName: "灰湖蓝", lightName: "墨湖蓝", darkHex: "#90b2ba", lightHex: "#3b6872" },
  { id: "lavender", hue: 270.0, darkName: "薰衣草", lightName: "罗兰紫", darkHex: "#a590ba", lightHex: "#573b72" },
  { id: "rose", hue: 337.1, darkName: "干玫瑰", lightName: "浆果红", darkHex: "#ba90a0", lightHex: "#723b50" },
];

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (x) => (x + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (x) =>
    l - a * Math.max(-1, Math.min(k(x) - 3, Math.min(9 - k(x), 1)));
  const to = (v) => Math.round(255 * v).toString(16).padStart(2, "0");
  return "#" + to(f(0)) + to(f(8)) + to(f(4));
}

export function hexToHsl(hex) {
  // 契约：入参为 resolveIconColorHex 归一后的 6 位小写 Hex。
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) {
      h = ((g - b) / d) % 6;
    } else if (max === g) {
      h = (b - r) / d + 2;
    } else {
      h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function adaptiveDarkLightness(hue) {
  const rad = (hue * Math.PI) / 180;
  return 69.0 - 2.5 * Math.sin(rad) + 1.5 * Math.cos(2 * rad);
}

export function calculateAdaptiveIconColor(hue, theme = "dark") {
  const normalized = ((hue % 360) + 360) % 360;
  if (theme === "light") {
    return hslToHex(normalized, 32.0, 34.0);
  }
  return hslToHex(normalized, 21.5, adaptiveDarkLightness(normalized));
}
export const DEFAULT_ICON_STYLE = "lucide";
export const DEFAULT_ICON_COLOR = "#90b2ba";

export function resolveIconStyle(value) {
  return value === "mui" ? "mui" : DEFAULT_ICON_STYLE;
}

// 图标风格快照小store：分发器组件经 useSyncExternalStore 订阅，
// 由挂载在各入口根的 M3Theme 把 setting.iconStyle 同步进来——图标模块
// 自身保持零重依赖（不 import hooks/Setting，避免拖入 apis 重图）。
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

let iconColorSnapshot = DEFAULT_ICON_COLOR;
const iconColorListeners = new Set();

export function setIconColorSnapshot(value) {
  const next = resolveIconColorHex(value);
  if (next === iconColorSnapshot) {
    return;
  }
  iconColorSnapshot = next;
  iconColorListeners.forEach((listener) => listener(next));
}

export function subscribeIconColor(listener) {
  iconColorListeners.add(listener);
  return () => {
    iconColorListeners.delete(listener);
  };
}

export function getIconColorSnapshot() {
  return iconColorSnapshot;
}

export function resolveIconColorHex(value) {
  // 通用放行：任意合法 6 位 Hex 一律接受（连续色相环存储格式），
  // 非法输入回落默认，保证存储清洗与快照归一单点收敛。
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^#[0-9a-f]{6}$/.test(key) ? key : DEFAULT_ICON_COLOR;
}

// 图标色归一 + 色相反解的单点收敛：各自适应主色/强调色消费方只取色相，
// 统一经此入口，避免 resolveIconColorHex + hexToHsl 的重复拼接。
export function resolveIconHue(value) {
  return hexToHsl(resolveIconColorHex(value)).h;
}

export function resolveIconColor(value, mode = "dark") {
  return calculateAdaptiveIconColor(resolveIconHue(value), mode);
}

export function calculateAdaptivePrimaryFamily(hue, theme = "dark") {
  const normalized = ((hue % 360) + 360) % 360;
  if (theme === "light") {
    return {
      primary: hslToHex(normalized, 32.0, 34.0),
      onPrimary: "#FFFFFF",
      primaryContainer: hslToHex(normalized, 30.0, 90.0),
      onPrimaryContainer: hslToHex(normalized, 32.0, 20.0),
    };
  }
  const lDark = adaptiveDarkLightness(normalized);
  return {
    primary: hslToHex(normalized, 21.5, lDark),
    onPrimary: hslToHex(normalized, 30.0, 16.0),
    primaryContainer: hslToHex(normalized, 14.0, 24.0),
    onPrimaryContainer: hslToHex(normalized, 21.5, lDark),
  };
}

// 三级强调色体系：secondary 与 primary 同色相、饱和度降一档；tertiary 取
// 邻近色相 h+60°、饱和度再降一档——强调强度沿 primary → secondary →
// tertiary 递减，选中态统一走 secondaryContainer 通道，需与主色区分的
// 强调面走 tertiary。primary 4 组 + accent 8 组共 12 组配对经连续 hue 域
// 0.5° 步长扫描全部 ≥4.5:1（WCAG AA，连续域真值下限 4.5279）。
export function calculateAdaptiveAccentFamilies(hue, theme = "dark") {
  const normalized = ((hue % 360) + 360) % 360;
  const tertiaryHue = (normalized + 60) % 360;
  if (theme === "light") {
    return {
      secondary: hslToHex(normalized, 18.0, 34.0),
      onSecondary: "#FFFFFF",
      secondaryContainer: hslToHex(normalized, 16.0, 90.0),
      onSecondaryContainer: hslToHex(normalized, 18.0, 20.0),
      tertiary: hslToHex(tertiaryHue, 12.0, 34.0),
      onTertiary: "#FFFFFF",
      tertiaryContainer: hslToHex(tertiaryHue, 10.0, 90.0),
      onTertiaryContainer: hslToHex(tertiaryHue, 12.0, 20.0),
    };
  }
  const lDark = adaptiveDarkLightness(normalized);
  const lTertiary = adaptiveDarkLightness(tertiaryHue);
  return {
    secondary: hslToHex(normalized, 13.0, lDark),
    onSecondary: hslToHex(normalized, 20.0, 16.0),
    secondaryContainer: hslToHex(normalized, 9.0, 24.0),
    onSecondaryContainer: hslToHex(normalized, 13.0, lDark),
    tertiary: hslToHex(tertiaryHue, 9.0, lTertiary),
    onTertiary: hslToHex(tertiaryHue, 16.0, 16.0),
    tertiaryContainer: hslToHex(tertiaryHue, 6.0, 24.0),
    onTertiaryContainer: hslToHex(tertiaryHue, 9.0, lTertiary),
  };
}

export function resolveM3Colors(mode = "light", brand = "blue", iconColor) {
  // 主色/强调色/图标色同源自一 hue，归一一次复用，避免各自反解漂移。
  const hue = resolveIconHue(iconColor);
  return {
    ...M3_COLORS[mode],
    ...(M3_BRAND_COLORS[brand]?.[mode] || {}),
    ...calculateAdaptivePrimaryFamily(hue, mode),
    ...calculateAdaptiveAccentFamilies(hue, mode),
    icon: resolveIconColor(iconColor, mode),
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
    "--kt-icon": colors.icon,
  };
}

export function createM3CssVariableDeclarations(colors) {
  return Object.entries(createM3CssVariables(colors))
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n");
}

export const M3_FONT_FAMILY =
  '"Google Sans Flex", "Google Sans", "Noto Sans SC", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

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

/* B7 手柄焦点环显式规则：不再静默依赖 m3 全局级联——Shadow DOM 场景
   或后续全局 :focus/:focus-visible 规则调整（如新增 input 类豁免）不会
   静默丢失焦点指示。口径与全局级联一致：鼠标 :focus 零指示，键盘
   :focus-visible 3px 主色环 + 2px 偏移。 */
.kt-m3-root .kt-resize-grip:focus {
  outline: none;
}

@supports selector(:focus-visible) {
  .kt-m3-root .kt-resize-grip:focus {
    outline: none;
  }
  .kt-m3-root .kt-resize-grip:focus-visible {
    outline: 3px solid var(--kt-pri);
    outline-offset: 2px;
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
