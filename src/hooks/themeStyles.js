export function getMuiSwitchStyleOverrides(color) {
  const positionTransition =
    "transform .35s cubic-bezier(.3, 1.4, .4, 1), color .2s ease";

  return {
    root: {
      width: 52,
      height: 32,
      padding: 0,
      overflow: "visible",
      "&.MuiSwitch-sizeSmall .MuiSwitch-switchBase.Mui-checked": {
        transform: "translateX(20px)",
      },
    },
    switchBase: {
      width: 32,
      height: 32,
      display: "grid",
      placeItems: "center",
      top: 0,
      left: 0,
      padding: 0,
      color: color.outline,
      transform: "none",
      transition: positionTransition,
      "&:not(.Mui-disabled):hover": {
        backgroundColor: `color-mix(in srgb, ${color.onSurface} 8%, transparent)`,
        "@media (hover: none)": { backgroundColor: "transparent" },
      },
      "&.Mui-focusVisible": {
        outline: `3px solid ${color.primary}`,
        outlineOffset: 0,
      },
      "&.Mui-checked": {
        padding: 0,
        transform: "translateX(20px)",
        color: color.onPrimary,
        "& + .MuiSwitch-track": {
          borderColor: color.primary,
          backgroundColor: color.primary,
          opacity: 1,
        },
        "& .MuiSwitch-thumb": { width: 24, height: 24 },
        "& .MuiSwitch-input": { left: -20 },
        "&:not(.Mui-disabled):hover": {
          backgroundColor: `color-mix(in srgb, ${color.primary} 8%, transparent)`,
          "@media (hover: none)": { backgroundColor: "transparent" },
        },
      },
      "&.Mui-disabled": {
        color: color.onSurface,
        "& .MuiSwitch-thumb": { opacity: 0.38 },
        "& + .MuiSwitch-track": {
          borderColor: color.onSurface,
          backgroundColor: color.onSurface,
          opacity: 0.12,
        },
      },
      "&.Mui-checked.Mui-disabled": {
        color: color.surface,
        "& .MuiSwitch-thumb": { opacity: 1 },
        "& + .MuiSwitch-track": {
          borderColor: color.onSurface,
          backgroundColor: color.onSurface,
          opacity: 0.12,
        },
      },
    },
    input: {
      left: 0,
      width: 52,
      height: 32,
      borderRadius: 999,
      transition: "left .35s cubic-bezier(.3, 1.4, .4, 1)",
    },
    thumb: {
      width: 16,
      height: 16,
      boxShadow: "none",
      transition:
        "width .2s cubic-bezier(.2, 0, 0, 1), height .2s cubic-bezier(.2, 0, 0, 1), opacity .2s ease",
    },
    track: {
      border: `2px solid ${color.outline}`,
      borderRadius: 999,
      backgroundColor: color.surfaceHigh,
      opacity: 1,
      transition:
        "background-color .2s ease, border-color .2s ease, opacity .2s ease",
    },
  };
}
