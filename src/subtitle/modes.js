import {
  OPT_ENHANCE_MOBILE_OFF,
  OPT_ENHANCE_OFF,
  OPT_ENHANCE_ON,
} from "../config";
import { isMobile } from "../libs/mobile.js";

/**
 * 规范化字幕增强模式
 * 将各种开关状态（如布尔值 true/false，或者具体的字符串配置值）统一转化为内部的 enhance 状态常量值。
 *
 * @param {*} value - 输入的配置状态值，可能是布尔值或字符串配置常量
 * @param {string} [fallback] - 当传入为 true 时的默认回退/降级状态，默认为 OPT_ENHANCE_MOBILE_OFF
 * @returns {string} 规范化后的字幕增强模式常量值 (OPT_ENHANCE_ON / OPT_ENHANCE_OFF / OPT_ENHANCE_MOBILE_OFF)
 */
export function normalizeSubtitleMode(
  value,
  fallback = OPT_ENHANCE_MOBILE_OFF
) {
  // 如果用户配置是布尔值 true，则递归调用自身，将默认回退配置(fallback)进行规范化
  if (value === true) return normalizeSubtitleMode(fallback);

  // 如果用户配置是布尔值 false，表示彻底关闭字幕增强功能，直接返回 OFF 常量
  if (value === false) return OPT_ENHANCE_OFF;

  // 如果传入值已经属于合法的系统内置状态常量（ON / OFF / MOBILE_OFF），则无需转换直接返回
  if (
    value === OPT_ENHANCE_ON ||
    value === OPT_ENHANCE_OFF ||
    value === OPT_ENHANCE_MOBILE_OFF
  ) {
    return value;
  }

  // 兜底处理：对于其他任何不合法的配置输入，统一降级为移动端关闭模式 (OPT_ENHANCE_MOBILE_OFF)
  return OPT_ENHANCE_MOBILE_OFF;
}

/**
 * 判断在当前设备运行环境下，字幕增强模式是否最终判定为启用。
 *
 * @param {*} value - 当前的配置值
 * @param {string} fallback - 布尔值 true 时的回退配置值
 * @returns {boolean} true 表示启用增强功能，false 表示禁用
 */
export function isSubtitleModeEnabled(value, fallback) {
  // 首先将配置状态进行规范化，得到标准的字符串状态常量
  const mode = normalizeSubtitleMode(value, fallback);

  // 判定启用的条件：
  // 1. 状态是全局开启 (OPT_ENHANCE_ON)；
  // 2. 或者状态是移动端关闭 (OPT_ENHANCE_MOBILE_OFF)，且当前运行环境判定为非移动端 (!isMobile)。
  return (
    mode === OPT_ENHANCE_ON || (mode === OPT_ENHANCE_MOBILE_OFF && !isMobile)
  );
}
