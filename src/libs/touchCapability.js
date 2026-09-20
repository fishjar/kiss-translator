export const supportsTouch = () =>
  typeof window.PointerEvent === "function" && navigator.maxTouchPoints > 0;
