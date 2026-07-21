// 纯方括号字幕通常是音乐、笑声等声音说明；可选的 `>>` 是 YouTube 的说话人切换前缀。
const NON_SPEECH_SEGMENT_RE = /^(?:>>\s*)?(?:\[[^\]\r\n]+\]\s*)+$/u;

/**
 * 判断单个字幕片段是否完全由非语音说明组成。
 * 只匹配整个片段，避免误删 `Use [React] in this project` 一类正常对白。
 *
 * @param {string} [text=""] 待判断的字幕片段。
 * @returns {boolean} 是否为纯非语音片段。
 */
export function isNonSpeechSegment(text = "") {
  return NON_SPEECH_SEGMENT_RE.test(String(text).trim());
}
