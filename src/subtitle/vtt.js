function millisecondsStringToNumber(msString) {
  const cleanString = msString.trim();
  const milliseconds = parseInt(cleanString, 10);

  if (isNaN(milliseconds)) {
    return 0;
  }

  return milliseconds;
}

export function parseBilingualVtt(vttText) {
  const cleanText = vttText.replace(/^\uFEFF/, "").trim();
  const cues = cleanText.split(/\n\n+/);

  const result = [];

  for (const cue of cues) {
    if (!cue.includes("-->")) continue;

    const lines = cue.split("\n");

    const timestampLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timestampLineIndex === -1) continue;

    const [startTimeString, endTimeString] =
      lines[timestampLineIndex].split(" --> ");
    const textLines = lines.slice(timestampLineIndex + 1);

    if (startTimeString && endTimeString && textLines.length > 0) {
      const originalText = textLines[0].trim();
      const translatedText = (textLines[1] || "").trim();

      result.push({
        start: millisecondsStringToNumber(startTimeString),
        end: millisecondsStringToNumber(endTimeString),
        text: originalText,
        translation: translatedText,
      });
    }
  }

  return result;
}
