export const FAB_MIN_OPACITY = 0.1;
export const FAB_MIN_SIZE = 24;
export const FAB_MAX_SIZE = 96;

export const DEFAULT_FAB = {
  hideExceptionList: "",
  halfHide: true,
  opacity: 1,
  size: 56,
};

// Older stored configurations do not contain appearance preferences.
export function normalizeFabAppearance(config) {
  return {
    halfHide:
      typeof config?.halfHide === "boolean"
        ? config.halfHide
        : DEFAULT_FAB.halfHide,
    opacity:
      typeof config?.opacity === "number" && Number.isFinite(config.opacity)
        ? Math.min(1, Math.max(FAB_MIN_OPACITY, config.opacity))
        : DEFAULT_FAB.opacity,
    size:
      typeof config?.size === "number" && Number.isFinite(config.size)
        ? Math.round(
            Math.min(FAB_MAX_SIZE, Math.max(FAB_MIN_SIZE, config.size))
          )
        : DEFAULT_FAB.size,
  };
}
