export const TRANBTN_MIN_SIZE = 16;
export const TRANBTN_MAX_SIZE = 64;
export const TRANBTN_MIN_OPACITY = 0.1;
export const DEFAULT_TRANBTN = { btnSize: 32, btnOpacity: 1 };

export function normalizeTranbtnAppearance(config) {
  return {
    btnSize:
      typeof config?.btnSize === "number" && Number.isFinite(config.btnSize)
        ? Math.round(
            Math.min(
              TRANBTN_MAX_SIZE,
              Math.max(TRANBTN_MIN_SIZE, config.btnSize)
            )
          )
        : DEFAULT_TRANBTN.btnSize,
    btnOpacity:
      typeof config?.btnOpacity === "number" &&
      Number.isFinite(config.btnOpacity)
        ? Math.min(1, Math.max(TRANBTN_MIN_OPACITY, config.btnOpacity))
        : DEFAULT_TRANBTN.btnOpacity,
  };
}
