// Conservative native grid evidence. Dense text and irregular cells stay in
// native flow; Smart handles those regions with layout and visual recognition.
export function nativeTableRegions(raw) {
  const rows = [];
  for (const span of [...raw.spans]
    .filter((s) => !s.vertical)
    .sort((a, b) => a.baseline - b.baseline || a.bbox[0] - b.bbox[0])) {
    let row = rows.find(
      (r) => Math.abs(r[0].baseline - span.baseline) < span.fontSize * 0.3
    );
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(span);
  }
  const candidates = rows.map((spans) => {
    const cells = [];
    for (const span of spans.sort((a, b) => a.bbox[0] - b.bbox[0])) {
      const last = cells.at(-1);
      if (last && span.bbox[0] - last.at(-1).bbox[2] < span.fontSize * 1.3)
        last.push(span);
      else cells.push([span]);
    }
    return {
      cells,
      spans,
      y: spans[0].baseline,
      size: Math.max(...spans.map((s) => s.fontSize)),
    };
  });
  const groups = [];
  let group = [];
  for (const row of candidates) {
    const valid =
      row.cells.length >= 2 &&
      row.cells.length <= 12 &&
      row.cells.every((c) => c.map((s) => s.text).join(" ").length < 60);
    const prior = group.at(-1);
    const sameGrid =
      prior &&
      row.cells.length === prior.cells.length &&
      row.y - prior.y < row.size * 3 &&
      row.cells.every(
        (c, i) =>
          Math.abs(c[0].bbox[0] - prior.cells[i][0].bbox[0]) < row.size * 0.8
      );
    if (!valid || !sameGrid) {
      if (group.length) groups.push(group);
      group = [];
    }
    if (valid) group.push(row);
  }
  if (group.length) groups.push(group);
  return groups
    .filter(
      (rows) =>
        rows.length >= 3 &&
        rows
          .flatMap((r) => r.cells)
          .filter((c) =>
            /^[\d\s.,%±+−–()eE/]+$/.test(c.map((s) => s.text).join(""))
          ).length >= Math.ceil(rows.length * 0.6)
    )
    .map((rows, i) => {
      const boxes = rows.flatMap((r) => r.spans.map((s) => s.bbox));
      return {
        id: `native-table-${raw.page}-${i}`,
        type: "table",
        bbox: [
          Math.min(...boxes.map((b) => b[0])),
          Math.min(...boxes.map((b) => b[1])),
          Math.max(...boxes.map((b) => b[2])),
          Math.max(...boxes.map((b) => b[3])),
        ],
      };
    });
}
