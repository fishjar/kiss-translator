/** Integer PCM positions keep adjacent blocks exact; subtitle text is not coverage. */
export function mergeIntervals(intervals, limit = Number.MAX_SAFE_INTEGER) {
  const sorted = intervals
    .map(({ start, end }) => {
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start
      )
        throw new Error("Invalid audio coverage.");
      return { start: Math.min(start, limit), end: Math.min(end, limit) };
    })
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push({ ...interval });
  }
  return merged;
}

export function coverageProgress(intervals, totalSamples) {
  if (!Number.isSafeInteger(totalSamples) || totalSamples <= 0)
    throw new Error("Invalid media duration.");
  const merged = mergeIntervals(intervals, totalSamples);
  const samples = merged.reduce(
    (sum, range) => sum + range.end - range.start,
    0
  );
  return {
    samples,
    totalSamples,
    percent: (samples / totalSamples) * 100,
    complete: samples === totalSamples,
  };
}

export function missingIntervals(intervals, totalSamples) {
  const missing = [];
  let position = 0;
  for (const interval of mergeIntervals(intervals, totalSamples)) {
    if (interval.start > position)
      missing.push({ start: position, end: interval.start });
    position = interval.end;
  }
  if (position < totalSamples)
    missing.push({ start: position, end: totalSamples });
  return missing;
}

/** Current position to the end first, then earlier gaps. Never redownload on seek. */
export function prioritizeIntervals(intervals, target) {
  return intervals
    .flatMap(({ start, end }) =>
      start < target && end > target
        ? [
            { start, end: target },
            { start: target, end },
          ]
        : [{ start, end }]
    )
    .sort(
      (a, b) => (a.start < target) - (b.start < target) || a.start - b.start
    );
}
