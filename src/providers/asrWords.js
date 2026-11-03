/** Optional aligned words are usable only when they cover the unchanged segment text. */
export function alignedAsrWords(segment) {
  const words = segment.words;
  if (
    segment.wordsTimingSource === "estimated" ||
    !Array.isArray(words) ||
    !words.length ||
    words.length > 10000
  )
    return undefined;
  let previous = segment.start;
  for (const word of words) {
    if (
      !word ||
      typeof word.text !== "string" ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < previous ||
      word.end < word.start ||
      word.start < segment.start ||
      word.end > segment.end
    )
      return undefined;
    previous = word.start;
  }
  if (
    words
      .map((word) => word.text)
      .join("")
      .replace(/\s/g, "") !== segment.text.replace(/\s/g, "")
  )
    return undefined;
  return words.map(({ start, end, text }) => ({ start, end, text }));
}
