import { decodeHTMLEntities } from "../libs/html.js";

/**
 * 将多种格式的VTT时间戳字符串转换为毫秒数。
 * 兼容以下格式：
 * - mmm (例如，纯毫秒数 "291040")
 * - MM:SS (例如，"00:03")
 * - HH:MM:SS (例如，"01:02:03")
 * - MM:SS.mmm (例如，"00:07.980")
 * - HH:MM:SS.mmm (例如，"01:02:03.456")
 * - MM:SS:mmm (例如，"00:07:536"，以冒号隔开毫秒的非标格式)
 *
 * @param {string} timestamp - VTT时间戳字符串
 * @returns {number} - 转换后的总毫秒数数值
 */
function parseTimestampToMilliseconds(timestamp) {
  const ts = timestamp.trim();

  // 如果时间戳不包含冒号 ":" 且不包含点号 "."，说明它是一个纯毫秒数字符串，直接转换为整型返回
  if (!ts.includes(":") && !ts.includes(".")) {
    return parseInt(ts, 10) || 0;
  }

  let timePart = ts;
  let msPart = "0";

  // 分离时间主部与毫秒部分
  if (ts.includes(".")) {
    // 针对标准的 "时间.毫秒" 格式 (如 01:02:03.456)
    const parts = ts.split(".");
    timePart = parts[0];
    msPart = parts[1];
  } else {
    // 针对非标的 "时间:毫秒" 格式 (如 00:07:536)
    const colonParts = ts.split(":");
    // 如果冒号分隔出的最后一项长度为 3，则视其为毫秒部分并提取出来
    if (
      colonParts.length > 1 &&
      colonParts[colonParts.length - 1].length === 3
    ) {
      msPart = colonParts.pop();
      timePart = colonParts.join(":");
    }
  }

  // 将时间主部按照冒号拆分为分量数组，并转换为整数
  const timeComponents = timePart.split(":").map((p) => parseInt(p, 10) || 0);
  let hours = 0,
    minutes = 0,
    seconds = 0;

  // 根据拆分出的时间分量个数进行映射
  if (timeComponents.length === 3) {
    // 包含 时:分:秒
    [hours, minutes, seconds] = timeComponents;
  } else if (timeComponents.length === 2) {
    // 仅包含 分:秒
    [minutes, seconds] = timeComponents;
  } else if (timeComponents.length === 1) {
    // 仅包含 秒
    [seconds] = timeComponents;
  }

  // 毫秒数部分补齐 3 位（例如 "9" 变为 "900"），转换为整数
  const milliseconds = parseInt(msPart.padEnd(3, "0"), 10) || 0;

  // 计算并返回总毫秒数
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
}

/**
 * 将毫秒数转换为标准 VTT 时间戳格式的字符串 (HH:MM:SS.mmm)。
 *
 * @param {number} ms - 总毫秒数
 * @returns {string} - 格式化后的 VTT 时间戳字符串 (HH:MM:SS.mmm)
 */
function formatMillisecondsToTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = String(ms % 1000).padStart(3, "0");

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * 解析包含双语字幕的 VTT 文件内容。
 * // REVIEW: CRLF (\r\n) 换行符割裂解析隐患。
 * //    `vttText.split(/\n\n+/)` 在处理 Windows (\r\n) 格式换行符的 VTT 文件时，会由于 `\r` 的残留，
 * //    导致在进行行分割 `cue.split("\n")` 时每一行尾部依然带有 `\r` 符号。
 * //    这可能导致在匹配 `textLines[0]?.trim()` 以及时间戳行匹配时产生不可预知的字符串清洗或比对异常。
 * //    推荐在分割前先将字符串中的所有 `\r\n` 统一规范化为 `\n`。
 *
 * @param {string} vttText - VTT 文件的完整文本内容
 * @returns {Array<Object>} 包含字幕对象的数组，每个对象包含 start, end, text, 和 translation
 */
export function parseBilingualVtt(vttText) {
  // 清除可能存在的 UTF-8 BOM 头，并修剪首尾空白字符
  const cleanText = vttText.replace(/^\uFEFF/, "").trim();
  if (!cleanText) {
    return [];
  }

  // 按照两个或以上换行符对 VTT 块 (Cue Blocks) 进行分割
  const cues = cleanText.split(/\n\n+/);
  const result = [];

  // 判断首个块是否为 "WEBVTT" 文件头，若是则跳过它，从索引 1 开始解析
  const startIndex = cues[0].toUpperCase().includes("WEBVTT") ? 1 : 0;

  for (let i = startIndex; i < cues.length; i++) {
    const cue = cues[i];
    // 每一个合法的字幕块必须包含 "-->" 时间轴指示器，否则跳过
    if (!cue.includes("-->")) continue;

    const lines = cue.split("\n");
    // 寻找包含 "-->" 的那一行作为时间戳行
    const timestampLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timestampLineIndex === -1) continue;

    // 解析出开始时间戳与结束时间戳字符串
    const [startTimeString, endTimeString] =
      lines[timestampLineIndex].split("-->");
    // 时间戳行之下的行全部视为字幕内容行
    const textLines = lines.slice(timestampLineIndex + 1);

    if (startTimeString && endTimeString && textLines.length > 0) {
      // 第一行字幕内容为原文 (text)
      const originalText = decodeHTMLEntities(textLines[0]?.trim() || "");
      // 第二行字幕内容为译文 (translation)
      const translatedText = decodeHTMLEntities(textLines[1]?.trim() || "");

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

/**
 * 将 parseBilingualVtt 生成的 JSON 数据重新构造回标准格式的双语 VTT 字幕字符串。
 *
 * @param {Array<Object>} cues - 包含 start, end, text, translation 属性的字幕对象数组
 * @returns {string} - 重构后的标准 VTT 字幕文件内容文本
 */
export function buildBilingualVtt(cues) {
  if (!Array.isArray(cues)) {
    return "WEBVTT";
  }

  const header = "WEBVTT";

  // 将每一项字幕数据转换为标准的 VTT 字幕块格式
  const cueBlocks = cues.map((cue, index) => {
    const startTime = formatMillisecondsToTimestamp(cue.start);
    const endTime = formatMillisecondsToTimestamp(cue.end);

    const cueIndex = index + 1; // 字幕块序号从 1 开始
    const timestampLine = `${startTime} --> ${endTime}`;

    const textLine = cue.text || "";
    const translationLine = cue.translation || "";

    // 每一块按: 序号 \n 时间轴 \n 原文 \n 译文 结构拼接
    return `${cueIndex}\n${timestampLine}\n${textLine}\n${translationLine}`;
  });

  // 使用双换行符拼接文件头和各个字幕块
  return [header, ...cueBlocks].join("\n\n");
}
