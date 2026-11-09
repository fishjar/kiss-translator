/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import M3Theme from "./M3Theme";
import MuiAlert from "@mui/material/Alert";
import MuiAutocomplete from "@mui/material/Autocomplete";
import MuiChip from "@mui/material/Chip";
import MuiCircularProgress from "@mui/material/CircularProgress";
import MuiMenuItem from "@mui/material/MenuItem";
import MuiSelect from "@mui/material/Select";
import MuiTextField from "@mui/material/TextField";
import {
  ArrowDropDownIcon as LucideArrowDropDownIcon,
  CancelIcon as LucideCancelIcon,
  CheckCircleIcon as LucideCheckCircleIcon,
  CloseIcon as LucideCloseIcon,
  ErrorIcon as LucideErrorIcon,
  InfoIcon as LucideInfoIcon,
  WarningIcon as LucideWarningIcon,
} from "../components/icons/lucide";
import {
  calculateAdaptiveAccentFamilies,
  calculateAdaptivePrimaryFamily,
  M3_FONT_FAMILY,
  resolveIconColor,
  setIconColorSnapshot,
} from "../styles/m3";
import { setIconStyleSnapshot } from "../styles/iconStyleStore";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "auto" }),
}));
jest.mock("./SystemColorScheme", () => ({
  useSystemDarkPreference: () => true,
}));

test("scopes the resolved Material 3 palette to its root", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <M3Theme>
        <span>content</span>
        <IconButton aria-label="default icon">D</IconButton>
        <IconButton aria-label="primary icon" color="primary">
          P
        </IconButton>
        <ThemeProbe />
      </M3Theme>
    );
  });

  const themeRoot = container.querySelector(".kt-m3-root");
  expect(themeRoot.dataset.theme).toBe("dark");
  expect(themeRoot.style.getPropertyValue("--kt-pri")).toBe("#a5bfc5");
  expect(themeRoot.querySelector("style").textContent).toContain(
    "@keyframes kt-m3-pop"
  );
  expect(capturedTheme.shape.borderRadius).toBe(12);
  expect(
    capturedTheme.components.MuiPaper.styleOverrides.root.colorScheme
  ).toBe("dark");
  expect(
    capturedTheme.components.MuiFilledInput.styleOverrides.root
  ).toMatchObject({
    borderRadius: 12,
    overflow: "hidden",
  });
  const filledInputRoot =
    capturedTheme.components.MuiFilledInput.styleOverrides.root;
  const filledInputHover =
    filledInputRoot["&:not(.Mui-disabled, .Mui-focused):hover"];
  expect(filledInputHover.backgroundColor).toBe("#2D2F31");
  expect(filledInputHover["@media (hover: none)"].backgroundColor).toBe(
    "#282A2C"
  );
  expect(filledInputRoot["&.Mui-error"].borderColor).toBe("#F2B8B5");
  expect(filledInputRoot["&.Mui-error.Mui-focused"].borderColor).toBe(
    "#F2B8B5"
  );
  expect(
    capturedTheme.components.MuiSelect.styleOverrides.select["&:focus"]
  ).toMatchObject({
    borderRadius: "inherit",
    backgroundColor: "transparent",
  });
  expect(capturedTheme.components.MuiSelect.styleOverrides.icon).toMatchObject({
    transition: "transform .2s ease",
  });
  expect(
    capturedTheme.components.MuiButton.styleOverrides.root.transition
  ).toContain("border-color .3s");
  expect(
    capturedTheme.components.MuiButton.styleOverrides.root["&:focus-visible"]
  ).toEqual({
    outline: `3px solid ${capturedTheme.palette.primary.main}`,
    outlineOffset: 2,
  });
  expect(capturedTheme.components.MuiCard.styleOverrides.root).toMatchObject({
    borderRadius: 12,
  });
  expect(capturedTheme.components.MuiTab.styleOverrides.root).toMatchObject({
    fontWeight: 650,
    transition: "background-color .2s ease, color .2s ease",
  });
  expect(
    capturedTheme.components.MuiTab.styleOverrides.root["&&:focus-visible"]
  ).toMatchObject({
    outline: "none",
    boxShadow: `inset 0 0 0 3px ${capturedTheme.palette.primary.main}`,
  });
  // forced-colors（HC）域兜底：box-shadow 被强制引擎忽略，须有系统色描边。
  expect(
    capturedTheme.components.MuiTab.styleOverrides.root[
      "@media (forced-colors: active)"
    ]
  ).toMatchObject({
    "&&:focus-visible:focus": { outline: "3px solid", outlineOffset: -3 },
  });
  // 非 forced-colors 域不得出现 3px 描边兜底（防泄漏到常规域）。
  expect(
    Object.entries(capturedTheme.components.MuiTab.styleOverrides.root)
      .filter(([key]) => key !== "@media (forced-colors: active)")
      .map(([, value]) => value?.outline)
      .filter(Boolean)
  ).toEqual(["none"]);
  // 选中 Tab 走 secondary-container 语义（与 MenuItem/ToggleButton 选中态
  // 同一容器色体系），前景配 onSecondaryContainer。
  expect(capturedTheme.components.MuiTab.styleOverrides.root["&.Mui-selected"])
    .toEqual({
      backgroundColor: calculateAdaptiveAccentFamilies(191.4, "dark").secondaryContainer,
      color: calculateAdaptiveAccentFamilies(191.4, "dark").onSecondaryContainer,
      fontWeight: 650,
    });
  // 选中且聚焦的内嵌焦点环落在 secondaryContainer 选中背景上，必须改用
  // onSecondaryContainer 才可见（描边与选中前景联动）。
  expect(
    capturedTheme.components.MuiTab.styleOverrides.root[
      "&&.Mui-selected:focus-visible"
    ]
  ).toMatchObject({
    boxShadow: `inset 0 0 0 3px ${
      calculateAdaptiveAccentFamilies(191.4, "dark").onSecondaryContainer
    }`,
  });
  // 弹窗选中 Tab 背景为表面色（styles.js 的 --kt-sf0），选中+聚焦环必须改用 primary 才可见。
  expect(
    capturedTheme.components.MuiTab.styleOverrides.root[
      ".kt-popup-tabs &&.Mui-selected:focus-visible"
    ]
  ).toMatchObject({
    boxShadow: `inset 0 0 0 3px ${
      calculateAdaptivePrimaryFamily(191.4, "dark").primary
    }`,
  });
  const menuItemRoot = capturedTheme.components.MuiMenuItem.styleOverrides.root;
  expect(menuItemRoot).toMatchObject({
    color: "#E3E3E3",
    transition:
      "background-color .2s ease, color .2s ease, box-shadow .2s ease",
  });
  // 几何锁（规范菜单度量）：行圆角 4dp，选中底色/染层/焦点环跟随行盒圆角。
  expect(menuItemRoot.borderRadius).toBe(4);
  // 选中态走 secondary-container 族底色，文字色 onSecondaryContainer。
  const accent = calculateAdaptiveAccentFamilies(191.4, "dark");
  expect(menuItemRoot["&.Mui-selected"]).toEqual({
    backgroundColor: accent.secondaryContainer,
    color: accent.onSecondaryContainer,
  });
  // 勾槽 ::before 整体退役，基槽不再绘制勾号。
  expect(menuItemRoot["&.Mui-selected::before"]).toBeUndefined();
  // hover/selected:hover 均为 State Layer 叠色（hover 档 8%）：选中项 hover
  // 在 secondaryContainer 底色上合成 8% State Layer（底色不丢，不整段替换）。
  expect(menuItemRoot["&.Mui-selected:hover"]).toEqual({
    backgroundColor: `color-mix(in srgb, ${accent.secondaryContainer} 92%, currentColor 8%)`,
  });
  expect(menuItemRoot["&:hover"]).toEqual({
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  });
  // 菜单焦点环挂 :focus-visible 键盘语境伪类
  // （MenuList selectedMenu 变体打开即给选中项注入 .Mui-focusVisible 类，
  // 与输入方式无关 → 挂点换伪类封死鼠标链路误显环）；环改 inset 内嵌
  // （不依赖容器 padding 余量，任何内缩形态下行为稳定），底色保留 State Layer 12% 叠色。
  expect(menuItemRoot["&&:focus-visible"]).toEqual({
    outline: "none",
    boxShadow: `inset 0 0 0 3px ${capturedTheme.palette.primary.main}`,
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
  });
  // .Mui-focusVisible 挂点不得残留任何样式（鼠标打开路径不命中环）。
  expect(menuItemRoot["&&.Mui-focusVisible"]).toBeUndefined();
  // forced-colors 兜底（对齐仓内先例 forcedColorsFocusRing 配对模式）：
  // 强制色彩模式剥离 boxShadow，须以 outline 内描恢复键盘环。
  expect(menuItemRoot["@media (forced-colors: active)"]["&&:focus-visible"]).toEqual({
    outline: "3px solid",
    outlineOffset: -3,
  });
  expect(menuItemRoot["&&.Mui-selected.Mui-focusVisible"]).toBeUndefined();
  // 多选 listbox option 行必须存在专属 hover，8% currentColor 叠色，不得透明
  expect(menuItemRoot['[aria-multiselectable="true"] &.Mui-selected:hover']).toEqual({
    backgroundColor: "color-mix(in srgb, currentColor 8%, transparent)",
  });
  // 单选 selected focus-visible 保留原选中底色（不得叠状态层：暗色域
  // 12% 叠色会把文字对比度压到 4.5:1 以下），焦点指示由内嵌环承担。
  expect(menuItemRoot["&&.Mui-selected:focus-visible"]).toEqual({
    outline: "none",
    boxShadow: `inset 0 0 0 3px ${capturedTheme.palette.primary.main}`,
  });
  // 对比度契约锁：onSecondaryContainer 文字对 secondaryContainer 底色的
  // 对比度在深浅两域的连续 hue 扫描下必须 ≥4.5:1（AA，普通字号）。
  const luminance = (hex) => {
    const channels = hex
      .match(/[0-9a-f]{2}/gi)
      .map((byte) => parseInt(byte, 16) / 255)
      .map((channel) =>
        channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4
      );
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const [a, b] = [luminance(foreground), luminance(background)].sort(
      (x, y) => y - x
    );
    return (a + 0.05) / (b + 0.05);
  };
  for (const mode of ["dark", "light"]) {
    let floor = Infinity;
    for (let hue = 0; hue < 360; hue += 0.5) {
      const family = calculateAdaptiveAccentFamilies(hue, mode);
      floor = Math.min(
        floor,
        contrast(family.onSecondaryContainer, family.secondaryContainer)
      );
    }
    expect(floor).toBeGreaterThanOrEqual(4.5);
  }
  // 多选 menuitemcheckbox focus-visible 保持透明底（覆盖 &&.Mui-selected:focus-visible）
  expect(menuItemRoot['&&.Mui-selected[role="menuitemcheckbox"]:focus-visible']).toEqual({
    outline: "none",
    boxShadow: `inset 0 0 0 3px ${capturedTheme.palette.primary.main}`,
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
  });
  // 多选 multiselectable option focus-visible 保持透明底（覆盖 &&.Mui-selected:focus-visible）
  expect(menuItemRoot['[aria-multiselectable="true"] &.Mui-selected:focus-visible']).toEqual({
    outline: "none",
    boxShadow: `inset 0 0 0 3px ${capturedTheme.palette.primary.main}`,
    backgroundColor: "color-mix(in srgb, currentColor 12%, transparent)",
  });
  expect(capturedTheme.components.MuiMenu.styleOverrides.paper).toMatchObject({
    borderRadius: 4,
  });
  expect(capturedTheme.components.MuiMenu.styleOverrides.list).toMatchObject({
    padding: "8px 8px",
  });
  const iconButtonRoot =
    capturedTheme.components.MuiIconButton.styleOverrides.root;
  const defaultIconButton = iconButtonRoot({
    ownerState: { color: "default" },
  });
  const primaryIconButton = iconButtonRoot({
    ownerState: { color: "primary" },
  });
  // 默认 hue 191.4 深色对冲公式自适应色（calculateAdaptiveIconColor(191.4, "dark") 契约推导，基准 69）。
  expect(defaultIconButton.color).toBe("#a5bfc5");
  expect(defaultIconButton["&:hover"].backgroundColor).toBe("#282A2C");
  expect(
    defaultIconButton["&:hover"]["@media (hover: none)"].backgroundColor
  ).toBe("transparent");
  expect(primaryIconButton.color).toBe(undefined);
  expect(primaryIconButton["&:hover"]).toBe(undefined);
  expect(defaultIconButton["&:focus-visible"]).toEqual({
    outline: `3px solid ${capturedTheme.palette.primary.main}`,
    outlineOffset: 2,
  });
  const sliderThumb = capturedTheme.components.MuiSlider.styleOverrides.thumb;
  expect(sliderThumb["&:focus-visible"]).toMatchObject({
    outline: `3px solid ${capturedTheme.palette.primary.main}`,
    outlineOffset: 2,
  });
  expect(
    sliderThumb["@supports selector(:has(*))"]["&:has(:focus-visible)"]
  ).toMatchObject({ outline: `3px solid ${capturedTheme.palette.primary.main}`, outlineOffset: 2 });
  const radioRoot = capturedTheme.components.MuiRadio.styleOverrides.root;
  expect(radioRoot["&:focus-visible"]).toMatchObject({
    outline: `3px solid ${capturedTheme.palette.primary.main}`,
    outlineOffset: 0,
  });
  expect(
    radioRoot["@supports selector(:has(*))"]["&:has(:focus-visible)"]
  ).toMatchObject({ outline: `3px solid ${capturedTheme.palette.primary.main}`, outlineOffset: 0 });
  expect(
    capturedTheme.components.MuiToggleButton.styleOverrides.root[
      "&.Mui-selected"
    ]
  ).toMatchObject({
    // 选中态统一 secondary-container 弱形态（与 MenuItem/Tab 同口径）。
    backgroundColor: accent.secondaryContainer,
    color: accent.onSecondaryContainer,
  });
  expect(
    capturedTheme.components.MuiToggleButton.styleOverrides.root[
      "&&.Mui-selected:focus-visible"
    ]
  ).toMatchObject({
    boxShadow: `inset 0 0 0 3px ${accent.onSecondaryContainer}`,
  });
  // forced-colors（HC）域兜底：同 Tab 口径，统一一套描边，不按变体分色。
  expect(
    capturedTheme.components.MuiToggleButton.styleOverrides.root[
      "@media (forced-colors: active)"
    ]
  ).toMatchObject({
    "&&:focus-visible:focus": { outline: "3px solid", outlineOffset: -3 },
  });
  // 非 forced-colors 域不得出现 3px 描边兜底。
  expect(
    Object.entries(capturedTheme.components.MuiToggleButton.styleOverrides.root)
      .filter(([key]) => key !== "@media (forced-colors: active)")
      .map(([, value]) => value?.outline)
      .filter(Boolean)
  ).toEqual(["none"]);
  expect(
    capturedTheme.components.MuiListItemButton.styleOverrides.root[
      "&&:focus-visible"
    ].boxShadow
  ).toBe(`inset 0 0 0 3px ${capturedTheme.palette.primary.main}`);
  // forced-colors（HC）域兜底：surfaceHigh tint 通道保留，仅补系统色描边。
  expect(
    capturedTheme.components.MuiListItemButton.styleOverrides.root[
      "@media (forced-colors: active)"
    ]
  ).toMatchObject({
    "&&:focus-visible:focus": { outline: "3px solid", outlineOffset: -3 },
  });
  // 非 forced-colors 域不得出现 3px 描边兜底。
  expect(
    Object.entries(
      capturedTheme.components.MuiListItemButton.styleOverrides.root
    )
      .filter(([key]) => key !== "@media (forced-colors: active)")
      .map(([, value]) => value?.outline)
      .filter(Boolean)
  ).toEqual(["none"]);
  expect(
    capturedTheme.components.MuiListItemButton.styleOverrides.root[
      "&&.Mui-selected:focus-visible"
    ].boxShadow
  ).toBe(`inset 0 0 0 3px ${accent.onSecondaryContainer}`);
  expect(
    capturedTheme.components.MuiListItemButton.styleOverrides.root[
      "&&.Mui-selected:focus-visible"
    ].backgroundColor
  ).toBe(accent.secondaryContainer);
  expect(
    capturedTheme.components.MuiAccordionSummary.styleOverrides.root[
      "&&:focus-visible"
    ].boxShadow
  ).toBe(`inset 0 0 0 3px ${capturedTheme.palette.primary.main}`);
  expect(
    capturedTheme.components.MuiLoadingButton.styleOverrides.loadingIndicator
      .color
  ).toBe("#a5bfc5");
  // Portal 场景（MuiMenu/MuiDialog 挂 body，脱离 .kt-m3-root 的 CSS 变量
  // 作用域）下列表项图标色必须是主题实值：var(--kt-icon) 在 Portal 内
  // 不可达会回落继承色，故 styleOverrides 必须内联解析后的 icon 色。
  expect(capturedTheme.components.MuiListItemIcon.styleOverrides.root).toEqual({
    color: "#a5bfc5",
  });
  expect(
    capturedTheme.components.MuiDialog.styleOverrides.paper.borderRadius
  ).toBe(28);
  expect(
    capturedTheme.components.MuiMenu.styleOverrides.paper.borderRadius
  ).toBe(4);
  expect(
    capturedTheme.components.MuiTooltip.styleOverrides.tooltip.borderRadius
  ).toBe(4);
  expect(
    capturedTheme.components.MuiBackdrop.styleOverrides.root[
      "@media (prefers-reduced-motion: reduce)"
    ].transitionDuration
  ).toBe("0.01ms !important");
  // rgb(165, 191, 197) 即 #a5bfc5 的 getComputedStyle 序列化形态（默认 hue 191.4 深色对冲公式自适应，基准 69，契约推导）。
  expect(
    getComputedStyle(container.querySelector('[aria-label="default icon"]'))
      .color
  ).toBe("rgb(165, 191, 197)");
  expect(
    getComputedStyle(container.querySelector('[aria-label="primary icon"]'))
      .color
  ).toBe("rgb(165, 191, 197)");

  act(() => root.unmount());
  container.remove();
});

test.each(["object", "callback"])(
  "compact %s typography keeps M3 defaults and generates pixel sizes on small-root pages",
  (kind) => {
    const originalFontSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "10px";
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const typography = {
      pxToRem: (size) => `${size}px`,
      body1: { fontSize: 14 },
      body2: { fontSize: 13 },
      caption: { fontSize: 12 },
      button: { fontSize: 13 },
    };

    try {
      act(() => {
        root.render(
          <M3Theme
            options={{
              typography: kind === "callback" ? () => typography : typography,
            }}
          >
            <Typography variant="h6">Heading</Typography>
            <Typography variant="body1" id="compact-body">
              Body
            </Typography>
            <Typography variant="body2" id="compact-detail">
              Detail
            </Typography>
            <Typography variant="caption" id="compact-caption">
              Caption
            </Typography>
            <Button>Action</Button>
          </M3Theme>
        );
      });

      const style = (selector) =>
        getComputedStyle(container.querySelector(selector));
      expect(style("h6").fontSize).toBe("20px");
      expect(style("#compact-body").fontSize).toBe("14px");
      expect(style("#compact-detail").fontSize).toBe("13px");
      expect(style("#compact-caption").fontSize).toBe("12px");
      expect(style("button").fontSize).toBe("13px");
      expect(style("button").fontFamily.replace(/,\s*/g, ",")).toBe(
        M3_FONT_FAMILY.replace(/,\s*/g, ",")
      );
      expect(style("button").fontWeight).toBe("650");
      expect(style("button").textTransform).toBe("none");
    } finally {
      act(() => root.unmount());
      container.remove();
      document.documentElement.style.fontSize = originalFontSize;
    }
  }
);

test("partial component options preserve M3 button defaults and focus treatment", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    act(() => {
      root.render(
        <M3Theme
          options={{
            components: {
              MuiButton: {
                defaultProps: { size: "small" },
                styleOverrides: {
                  root: { minHeight: 32 },
                  sizeSmall: { fontSize: 12 },
                },
              },
            },
          }}
        >
          <Button>Action</Button>
          <ThemeProbe />
        </M3Theme>
      );
    });

    const button = getComputedStyle(container.querySelector("button"));
    expect(button.minHeight).toBe("32px");
    expect(button.fontSize).toBe("12px");
    expect(button.borderRadius).toBe("999px");
    expect(capturedTheme.components.MuiButton.defaultProps).toMatchObject({
      disableElevation: true,
      size: "small",
    });
    expect(
      capturedTheme.components.MuiButton.styleOverrides.root[
        "&:focus-visible"
      ]
    ).toEqual({
      outline: `3px solid ${capturedTheme.palette.primary.main}`,
      outlineOffset: 2,
    });
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

let capturedTheme;

function ThemeProbe() {
  capturedTheme = useTheme();
  return null;
}

test("renders alert severity and close icons from lucide", () => {
  const lucideMarkup = (Icon) => {
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const iconRoot = createRoot(holder);
    act(() => {
      iconRoot.render(<Icon />);
    });
    const markup = holder.querySelector("svg").innerHTML;
    act(() => iconRoot.unmount());
    holder.remove();
    return markup;
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <M3Theme>
        <MuiAlert severity="error">boom</MuiAlert>
        <MuiAlert severity="warning">warn</MuiAlert>
        <MuiAlert severity="info">info</MuiAlert>
        <MuiAlert severity="success" onClose={jest.fn()}>
          ok
        </MuiAlert>
      </M3Theme>
    );
  });

  const alerts = [...container.querySelectorAll(".MuiAlert-root")];
  expect(alerts).toHaveLength(4);
  const severityMarkup = (alert) =>
    alert.querySelector(".MuiAlert-icon svg").innerHTML;
  expect(severityMarkup(alerts[0])).toBe(lucideMarkup(LucideErrorIcon));
  expect(severityMarkup(alerts[1])).toBe(lucideMarkup(LucideWarningIcon));
  expect(severityMarkup(alerts[2])).toBe(lucideMarkup(LucideInfoIcon));
  expect(severityMarkup(alerts[3])).toBe(lucideMarkup(LucideCheckCircleIcon));
  const closeMarkup = alerts[3].querySelector(
    ".MuiAlert-action button svg"
  ).innerHTML;
  expect(closeMarkup).toBe(lucideMarkup(LucideCloseIcon));

  act(() => root.unmount());
  container.remove();
});

describe("lucide builtin icon contracts", () => {
  const lucideMarkup = (Icon) => {
    const holder = document.createElement("div");
    document.body.appendChild(holder);
    const iconRoot = createRoot(holder);
    act(() => {
      iconRoot.render(<Icon />);
    });
    const markup = holder.querySelector("svg").innerHTML;
    act(() => iconRoot.unmount());
    holder.remove();
    return markup;
  };

  const renderThemed = (children) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <M3Theme>
          {children}
          <ThemeProbe />
        </M3Theme>
      );
    });
    return {
      container,
      unmount: () => {
        act(() => root.unmount());
        container.remove();
      },
    };
  };

  afterEach(() => {
    setIconStyleSnapshot("lucide");
    setIconColorSnapshot("#90b2ba");
  });

  test("injects lucide Select arrow, Chip deleteIcon, Autocomplete popupIcon and rounds CircularProgress", () => {
    const { container, unmount } = renderThemed(
      <>
        <MuiSelect value="a">
          <MuiMenuItem value="a">a</MuiMenuItem>
        </MuiSelect>
        <MuiChip label="chip" onDelete={jest.fn()} />
        <MuiAutocomplete
          options={[]}
          renderInput={(params) => <MuiTextField {...params} />}
        />
        <MuiCircularProgress variant="determinate" value={50} />
      </>
    );
    expect(container.querySelector("svg.MuiSelect-icon").innerHTML).toBe(
      lucideMarkup(LucideArrowDropDownIcon)
    );
    expect(container.querySelector("svg.MuiChip-deleteIcon").innerHTML).toBe(
      lucideMarkup(LucideCancelIcon)
    );
    expect(
      container.querySelector(".MuiAutocomplete-popupIndicator svg").innerHTML
    ).toBe(lucideMarkup(LucideArrowDropDownIcon));
    expect(
      capturedTheme.components.MuiAutocomplete?.defaultProps?.popupIcon
    ).toBeTruthy();
    expect(
      capturedTheme.components.MuiAutocomplete?.defaultProps?.clearIcon
    ).toBeTruthy();
    expect(
      capturedTheme.components.MuiChip?.defaultProps?.deleteIcon
    ).toBeTruthy();
    expect(
      getComputedStyle(container.querySelector(".MuiCircularProgress-circle"))
        .strokeLinecap
    ).toBe("round");
    expect(
      container.querySelector(".kt-m3-root").style.getPropertyValue("--kt-icon")
    ).toBe("#a5bfc5");
    unmount();
  });

  test("drops icon defaultProps and keeps MUI builtin glyphs when iconStyle is mui", () => {
    setIconStyleSnapshot("mui");
    const { container, unmount } = renderThemed(
      <>
        <MuiSelect value="a">
          <MuiMenuItem value="a">a</MuiMenuItem>
        </MuiSelect>
        <MuiChip label="chip" onDelete={jest.fn()} />
        <MuiAlert severity="error">boom</MuiAlert>
      </>
    );
    expect(
      capturedTheme.components.MuiSelect.defaultProps?.IconComponent
    ).toBeUndefined();
    expect(
      capturedTheme.components.MuiChip?.defaultProps?.deleteIcon
    ).toBeUndefined();
    expect(
      capturedTheme.components.MuiAutocomplete?.defaultProps?.popupIcon
    ).toBeUndefined();
    expect(
      capturedTheme.components.MuiAlert.defaultProps?.iconMapping
    ).toBeUndefined();
    expect(container.querySelector("svg.MuiSelect-icon").innerHTML).not.toBe(
      lucideMarkup(LucideArrowDropDownIcon)
    );
    unmount();
  });

  test("still injects lucide glyphs when the stored snapshot is the legacy md3 value", () => {
    // 自愈契约：旧存档值 "md3" 经 resolveIconStyle 归一到默认档 lucide，
    // 三处门控仍注入 Lucide 字形（而非退回 MUI 内置）。
    setIconStyleSnapshot("md3");
    const { container, unmount } = renderThemed(
      <MuiSelect value="a">
        <MuiMenuItem value="a">a</MuiMenuItem>
      </MuiSelect>
    );
    // 门控注入的是 M3Theme.js 从 ../components/icons/lucide 直接导入的
    // ArrowDropDownIcon（非分发器导出的 IconComponent），故以渲染结果
    // 比对；渲染出的字形须与 Lucide 字形逐字相同。
    expect(
      capturedTheme.components.MuiSelect.defaultProps?.IconComponent
    ).toBeTruthy();
    expect(container.querySelector("svg.MuiSelect-icon").innerHTML).toBe(
      lucideMarkup(LucideArrowDropDownIcon)
    );
    unmount();
  });

  test("resolves continuous icon hue adaptively per theme, passes valid hex, falls back on invalid", () => {
    // 深色对冲公式映射（基准 69）；浅色同色相下压（L=34）。字面量由契约公式推导。
    expect(resolveIconColor("#ba9090", "dark")).toBe("#c4a4a4");
    expect(resolveIconColor("#ba9090", "light")).toBe("#723b3b");
    expect(resolveIconColor("#90b2ba", "dark")).toBe("#a5bfc5");
    expect(resolveIconColor("#a590ba", "light")).toBe("#573b72");
    // 任意合法 6 位 Hex 透传（normalize 后按色相映射）。
    expect(resolveIconColor("  #90B2BA  ", "light")).toBe("#3b6872");
    // 非法/缺省回落默认（默认 hue 191.4 的模式自适应色）。
    expect(resolveIconColor("#ABC", "dark")).toBe("#a5bfc5");
    expect(resolveIconColor(undefined, "light")).toBe("#3b6872");
    expect(resolveIconColor("nope", "dark")).toBe("#a5bfc5");
  });

  test("palette primary and contrastText follow the adaptive primary family", () => {
    setIconColorSnapshot("#ba9090");
    const { unmount } = renderThemed(<Button>Action</Button>);
    // palette.primary.main/contrastText 出自 resolveM3Colors 返回值（M3Theme.js :83），
    // 家族覆盖后随色相跟随（hue 0 的深色家族）。
    const family = calculateAdaptivePrimaryFamily(0, "dark");
    expect(capturedTheme.palette.primary.main).toBe(family.primary);
    expect(capturedTheme.palette.primary.contrastText).toBe(family.onPrimary);
    unmount();
  });

  test("updates theme output when icon snapshots change after mount", () => {
    // 既有用例全部挂载前设置快照；本用例补挂载后
    // setIconStyleSnapshot/setIconColorSnapshot 的订阅响应缺口——M3Theme 内部
    // useSyncExternalStore 须实时响应快照变化。
    // 初始快照（afterEach 已重置）为 lucide + #90b2ba，渲染后断言基准值。
    const { container, unmount } = renderThemed(
      <MuiAlert severity="info">probe</MuiAlert>
    );
    expect(
      capturedTheme.components.MuiAlert.defaultProps?.iconMapping
    ).toBeTruthy();
    expect(
      container.querySelector(".kt-m3-root").style.getPropertyValue("--kt-icon")
    ).toBe("#a5bfc5");
    // 切到 mui：图标注入被清空；iconMapping 应被删除。
    act(() => setIconStyleSnapshot("mui"));
    expect(
      capturedTheme.components.MuiAlert.defaultProps?.iconMapping
    ).toBeUndefined();
    // 切回 lucide 并换色相：--kt-icon CSS 变量随色相反解更新。
    act(() => {
      setIconStyleSnapshot("lucide");
      setIconColorSnapshot("#ba9090");
    });
    expect(
      capturedTheme.components.MuiAlert.defaultProps?.iconMapping
    ).toBeTruthy();
    expect(
      container.querySelector(".kt-m3-root").style.getPropertyValue("--kt-icon")
    ).not.toBe("#a5bfc5");
    unmount();
  });
});

describe("menu check mask token and toggle button checkmark slot", () => {
  function renderRoot() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <M3Theme>
          <ThemeProbe />
        </M3Theme>
      );
    });
    return { container, unmount: () => act(() => root.unmount()) };
  }

  test("does not inject --kt-menu-check-mask on the theme root", () => {
    setIconStyleSnapshot("mui");
    const { container, unmount } = renderRoot();
    const mask = container
      .querySelector(".kt-m3-root")
      .style.getPropertyValue("--kt-menu-check-mask");
    expect(mask).toBe("");
    unmount();
  });

  test("MuiToggleButton root carries no ::before checkmark slot (toggle switches must not render a check)", () => {
    setIconStyleSnapshot("mui");
    renderRoot().unmount();
    const toggleRoot =
      capturedTheme.components.MuiToggleButton.styleOverrides.root;
    expect(toggleRoot["&::before"]).toBeUndefined();
    expect(toggleRoot["&.Mui-selected::before"]).toBeUndefined();
  });
});
