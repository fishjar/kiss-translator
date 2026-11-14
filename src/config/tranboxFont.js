export const TRANBOX_MIN_FONT_SIZE = 12;
export const TRANBOX_MAX_FONT_SIZE = 24;
export const DEFAULT_TRANBOX_FONT_SIZE = 16;

export function normalizeTranboxFontSize(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(
        Math.min(TRANBOX_MAX_FONT_SIZE, Math.max(TRANBOX_MIN_FONT_SIZE, value))
      )
    : DEFAULT_TRANBOX_FONT_SIZE;
}
