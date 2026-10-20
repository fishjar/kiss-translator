/** UI metadata only: never retain PCM, subtitle bodies, or signed media addresses. */
export class AsrTaskStore {
  constructor(onChange = () => {}) {
    this.rows = new Map();
    this.onChange = onChange;
  }
  update(patch) {
    const previous = this.rows.get(patch.id);
    const row = { ...previous, ...patch };
    if (JSON.stringify(previous) === JSON.stringify(row)) return;
    this.rows.set(row.id, row);
    this.onChange({ tasks: [row] });
  }
  reset() {
    this.rows.clear();
    this.onChange({ reset: true, tasks: [] });
  }
  snapshot() {
    return [...this.rows.values()];
  }
  stop() {
    for (const row of this.rows.values()) {
      const patch = { id: row.id };
      if (row.processing) patch.processing = undefined;
      if (row.exportState === "saving") patch.exportState = "stopped";
      for (const key of ["recognition", "translation", "download"])
        if (
          [
            "queued",
            "waiting",
            "recognizing",
            "translating",
            "segmenting",
            "saving",
          ].includes(row[key])
        )
          patch[key] = "stopped";
      this.update(patch);
    }
  }
}

export function blockTask(block) {
  const skipped =
    block.silent || (!block.segments?.length && !block.subtitles?.length);
  const text =
    block.subtitles?.map((cue) => cue.text).filter(Boolean).join(" ") ||
    block.segments?.map((seg) => seg.text).filter(Boolean).join(" ") ||
    "";
  const translationText =
    block.subtitles
      ?.map((cue) => cue.translation)
      .filter(Boolean)
      .join(" ") || "";
  return {
    id: `block-${block.startSample}`,
    kind: "block",
    retrying: false,
    startMs: block.startSample / 16,
    endMs: block.endSample / 16,
    text,
    translationText,
    translationError: block.translationError,
    recognition:
      block.stage === "failed" ? "failed" : skipped ? "skipped" : "recognized",
    translation:
      block.stage === "failed"
        ? "waiting"
        : skipped
          ? "skipped"
          : block.stage === "translated"
            ? "complete"
            : "waiting",
    translated:
      block.subtitles?.filter((cue) => cue.translation?.trim()).length || 0,
    total: block.subtitles?.length || 0,
    errorCode: block.stage === "failed" ? block.errorCode : undefined,
  };
}

/** Half-open ownership; a cross-segment block is displayed exactly once. */
export function groupAsrTasks(tasks) {
  const segments = tasks
    .filter((row) => row.kind === "media" && row.index > 0)
    .sort((a, b) => a.startMs - b.startMs || a.index - b.index);
  const groups = segments.map((segment) => ({ ...segment, children: [] }));
  const unmatched = [];
  for (const block of tasks
    .filter((row) => row.kind === "block")
    .sort((a, b) => a.startMs - b.startMs)) {
    let lo = 0,
      hi = groups.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (groups[mid].startMs <= block.startMs) lo = mid + 1;
      else hi = mid;
    }
    const parent = groups[lo - 1];
    if (parent && block.startMs < parent.endMs)
      parent.children.push({
        ...block,
        crossSegment: block.endMs > parent.endMs,
      });
    else unmatched.push(block);
  }
  // Media without its own child may be covered by a block starting earlier.
  const blocks = tasks
    .filter((row) => row.kind === "block")
    .sort((a, b) => a.startMs - b.startMs);
  let cursor = 0,
    coveredUntil = -1;
  for (const group of groups) {
    while (cursor < blocks.length && blocks[cursor].startMs < group.endMs)
      coveredUntil = Math.max(coveredUntil, blocks[cursor++].endMs);
    group.coveredElsewhere =
      !group.children.length && coveredUntil > group.startMs;
  }
  return groups;
}
