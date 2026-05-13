import {
  OPT_ENHANCE_MOBILE_OFF,
  OPT_ENHANCE_OFF,
  OPT_ENHANCE_ON,
} from "../config";
import { isMobile } from "../libs/mobile.js";

export function normalizeSubtitleMode(
  value,
  fallback = OPT_ENHANCE_MOBILE_OFF
) {
  if (value === true) return normalizeSubtitleMode(fallback);
  if (value === false) return OPT_ENHANCE_OFF;

  if (
    value === OPT_ENHANCE_ON ||
    value === OPT_ENHANCE_OFF ||
    value === OPT_ENHANCE_MOBILE_OFF
  ) {
    return value;
  }

  return OPT_ENHANCE_MOBILE_OFF;
}

export function isSubtitleModeEnabled(value, fallback) {
  const mode = normalizeSubtitleMode(value, fallback);
  return (
    mode === OPT_ENHANCE_ON || (mode === OPT_ENHANCE_MOBILE_OFF && !isMobile)
  );
}
