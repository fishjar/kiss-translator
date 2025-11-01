/**
 * 将多种格式的VTT时间戳字符串转换为毫秒数。
 * 兼容以下格式：
 * - mmm (e.g., "291040")
 * - MM:SS (e.g., "00:03")
 * - HH:MM:SS (e.g., "01:02:03")
 * - MM:SS.mmm (e.g., "00:07.980")
 * - HH:MM:SS.mmm (e.g., "01:02:03.456")
 * - MM:SS:mmm (e.g., "00:07:536")
 *
 * @param {string} timestamp - VTT时间戳字符串.
 * @returns {number} - 转换后的总毫秒数.
 */
function parseTimestampToMilliseconds(timestamp) {
  const ts = timestamp.trim();

  if (!ts.includes(":") && !ts.includes(".")) {
    return parseInt(ts, 10) || 0;
  }

  let timePart = ts;
  let msPart = "0";

  if (ts.includes(".")) {
    const parts = ts.split(".");
    timePart = parts[0];
    msPart = parts[1];
  } else {
    const colonParts = ts.split(":");
    if (
      colonParts.length > 1 &&
      colonParts[colonParts.length - 1].length === 3
    ) {
      msPart = colonParts.pop();
      timePart = colonParts.join(":");
    }
  }

  const timeComponents = timePart.split(":").map((p) => parseInt(p, 10) || 0);
  let hours = 0,
    minutes = 0,
    seconds = 0;

  if (timeComponents.length === 3) {
    [hours, minutes, seconds] = timeComponents;
  } else if (timeComponents.length === 2) {
    [minutes, seconds] = timeComponents;
  } else if (timeComponents.length === 1) {
    [seconds] = timeComponents;
  }

  const milliseconds = parseInt(msPart.padEnd(3, "0"), 10) || 0;

  return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
}

/**
 * 解析包含双语字幕的VTT文件内容。
 * @param {string} vttText - VTT文件的文本内容。
 * @returns {Array<Object>} 一个包含字幕对象的数组，每个对象包含 start, end, text, 和 translation.
 */
export function parseBilingualVtt(vttText) {
  const cleanText = vttText.replace(/^\uFEFF/, "").trim();
  if (!cleanText) {
    return [];
  }

  const cues = cleanText.split(/\n\n+/);
  const result = [];

  const startIndex = cues[0].toUpperCase().includes("WEBVTT") ? 1 : 0;

  for (let i = startIndex; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue.includes("-->")) continue;

    const lines = cue.split("\n");
    const timestampLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timestampLineIndex === -1) continue;

    const [startTimeString, endTimeString] =
      lines[timestampLineIndex].split("-->");
    const textLines = lines.slice(timestampLineIndex + 1);

    if (startTimeString && endTimeString && textLines.length > 0) {
      const originalText = textLines[0]?.trim() || "";
      const translatedText = textLines[1]?.trim() || "";

      result.push({
        start: parseTimestampToMilliseconds(startTimeString),
        end: parseTimestampToMilliseconds(endTimeString),
        text: originalText,
        translation: translatedText,
      });
    }
  }

  return result;
}
