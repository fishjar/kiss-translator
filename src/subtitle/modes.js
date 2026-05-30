import {
  OPT_ENHANCE_MOBILE_OFF,
  OPT_ENHANCE_OFF,
  OPT_ENHANCE_ON,
} from "../config";
import { isMobile } from "../libs/mobile.js";

/**
 * 规范化字幕增强模式
 * 将各种开关状态（true/false/字符串值）统一转化为内部的 enhance 状态常量值
 * @param {*} value - 输入状态值
 * @param {string} [fallback] - 默认回退值
 * @returns {string} 规范化后的 enhance 状态
 */
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

/**
 * 判断当前环境下字幕增强模式是否开启
 * @param {*} value - 状态值
 * @param {string} fallback - 回退值
 * @returns {boolean}
 */
export function isSubtitleModeEnabled(value, fallback) {
  const mode = normalizeSubtitleMode(value, fallback);
  return (
    mode === OPT_ENHANCE_ON || (mode === OPT_ENHANCE_MOBILE_OFF && !isMobile)
  );
}
