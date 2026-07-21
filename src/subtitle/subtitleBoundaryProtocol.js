import { isNonSpeechSegment } from "./subtitleTextClassification.js";

const NO_SPACE_LANGUAGES = ["zh", "ja", "ko", "th", "lo", "km", "my"];

/** 判断源语言是否通常不以空格分隔词语，用于重建自然的原文。 */
export const isNoSpaceSubtitleLanguage = (lang = "") =>
  NO_SPACE_LANGUAGES.some((code) => String(lang).startsWith(code));

/** 判断一条字幕是否完全由 `[Music]` 等非语音标记组成。 */
export const isOnlyNonSpeechSubtitle = (text = "") => isNonSpeechSegment(text);

/** 按语言书写习惯合并 boundary-v2/v3 边界范围内的原始事件文本。 */
export function mergeSubtitleEventText(
  events,
  startIndex,
  endIndex,
  fromLang = "auto"
) {
  const texts = events
    .slice(startIndex, endIndex + 1)
    .map((event) => String(event?.text || "").trim())
    .filter(Boolean);
  return texts.join(isNoSpaceSubtitleLanguage(fromLang) ? "" : " ").trim();
}

/**
 * 将 boundary-v2/v3 的单个对象映射为 cue。调用者持有 nextIndex 游标。
 */
export function mapBoundaryItemToCue(
  item,
  events,
  nextIndex,
  fromLang = "auto"
) {
  const endIndex = Number(item?.e ?? item?.end_id);
  if (
    !Number.isInteger(endIndex) ||
    !Number.isInteger(nextIndex) ||
    nextIndex < 0 ||
    endIndex < nextIndex ||
    endIndex >= events.length
  ) {
    return null;
  }

  const text = mergeSubtitleEventText(events, nextIndex, endIndex, fromLang);
  if (!text) return null;
  const translation = isOnlyNonSpeechSubtitle(text)
    ? text
    : String(item?.t ?? item?.translation ?? "");

  return {
    start: events[nextIndex].start,
    end: events[endIndex].end,
    text,
    translation,
    _si: nextIndex,
    _ei: endIndex,
  };
}

/**
 * 只有显式开始索引才代表 index-v1；boundary-v3 的 `o` 只是模型自检锚点，不能触发旧模糊对齐器。
 */
export const isLegacyIndexSubtitleItem = (item) =>
  item &&
  (Object.prototype.hasOwnProperty.call(item, "s") ||
    Object.prototype.hasOwnProperty.call(item, "start_id"));
