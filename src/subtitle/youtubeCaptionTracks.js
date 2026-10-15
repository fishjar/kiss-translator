import {
  isSameTranslationLanguage,
  normalizeLanguageCode,
} from "../libs/language.js";

/**
 * YouTube 字幕语言比较；获取和选轨由 youtubeAcquisition 与 youtubeCaptionSource 负责。
 */

/**
 * 简易判断两种语言编码是否属于同一语言大类。
 *
 * @param {string} lang1 第一种语言编码，如 zh-CN。
 * @param {string} lang2 第二种语言编码，如 zh-TW。
 * @param {boolean} translateVariants 是否区分同一语言的不同变体。
 * @returns {boolean} 两个轨道语言是否可视为相同。
 */
export function isSameLang(lang1, lang2, translateVariants = false) {
  const source = normalizeLanguageCode(lang1);
  const target = normalizeLanguageCode(lang2);
  if (source && target) {
    return isSameTranslationLanguage(source, target, translateVariants);
  }

  const rawSource = String(lang1 || "")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();
  const rawTarget = String(lang2 || "")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();
  if (!rawSource || !rawTarget) return false;

  return translateVariants
    ? rawSource === rawTarget
    : rawSource.split("-")[0] === rawTarget.split("-")[0];
}
