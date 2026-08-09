export function getMuiSwitchStyleOverrides(color) {
  return {
    root: { width: 52, height: 32, padding: 0, overflow: "visible" },
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
      transition: "all .35s cubic-bezier(.3, 1.4, .4, 1)",
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
      },
    },
    thumb: { width: 16, height: 16, boxShadow: "none" },
    track: {
      border: `2px solid ${color.outline}`,
      borderRadius: 999,
      backgroundColor: color.surfaceHigh,
      opacity: 1,
    },
  };
}
