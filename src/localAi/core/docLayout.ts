export const DOC_LABELS = [
  "abstract",
  "algorithm",
  "aside_text",
  "chart",
  "content",
  "formula",
  "doc_title",
  "figure_title",
  "footer",
  "footer",
  "footnote",
  "formula_number",
  "header",
  "header",
  "image",
  "formula",
  "number",
  "paragraph_title",
  "reference",
  "reference_content",
  "seal",
  "table",
  "text",
  "text",
  "vision_footnote",
];
export type Rect = [number, number, number, number];
export interface LayoutRegion {
  id: string;
  label: string;
  type: string;
  score: number;
  bbox: Rect;
  polygon: [number, number][];
  order: number;
  query: number;
}
export interface LayoutResult {
  regions: LayoutRegion[];
  readingOrder: string[];
  imageSize: { width: number; height: number };
  backend: string;
  elapsedMs: number;
}
export interface DocLoadSpec {
  dir: string;
  source?: string;
  modelFile: string;
  dataFile: string;
  device: "wasm" | "webgpu";
}
const sigmoid = (n: number) => 1 / (1 + Math.exp(-n));

// Same pairwise voting convention as PPDocLayoutV3ImageProcessor._get_order_seqs.
export function orderRanks(logits: ArrayLike<number>, count: number): number[] {
  const votes = new Array(count).fill(0);
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      const probability = sigmoid(logits[i * count + j]);
      votes[j] += probability;
      votes[i] += 1 - probability;
    }
  const indices = votes
    .map((_, i) => i)
    .sort((a, b) => votes[a] - votes[b] || a - b);
  const ranks = new Array(count);
  indices.forEach((query, rank) => {
    ranks[query] = rank;
  });
  return ranks;
}

// Trace mask boundaries on its native grid; retain the largest external contour.
// This avoids bringing a second OpenCV runtime into the DOC worker.
export function maskPolygon(
  mask: ArrayLike<number>,
  size: number,
  box: Rect,
  width: number,
  height: number,
  threshold: number
): [number, number][] {
  const on = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    sigmoid(mask[y * size + x]) > threshold;
  const edges = new Map<string, [number, number][]>();
  const add = (x: number, y: number, ex: number, ey: number) => {
    const key = `${x},${y}`;
    edges.set(key, [...(edges.get(key) || []), [ex, ey]]);
  };
  const x0 = Math.max(0, Math.floor((box[0] / width) * size)),
    y0 = Math.max(0, Math.floor((box[1] / height) * size));
  const x1 = Math.min(size, Math.ceil((box[2] / width) * size)),
    y1 = Math.min(size, Math.ceil((box[3] / height) * size));
  const inside = (x: number, y: number) =>
    x >= x0 && y >= y0 && x < x1 && y < y1 && on(x, y);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (inside(x, y)) {
        if (!inside(x, y - 1)) add(x, y, x + 1, y);
        if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!inside(x - 1, y)) add(x, y + 1, x, y);
      }
  let best: [number, number][] = [],
    bestArea = 0;
  while (edges.size) {
    const start = edges.keys().next().value as string;
    let key = start;
    const points: [number, number][] = [];
    do {
      const entry = edges.get(key);
      if (!entry?.length) break;
      points.push(key.split(",").map(Number) as [number, number]);
      const next = entry.pop()!;
      if (!entry.length) edges.delete(key);
      key = next.join(",");
    } while (key !== start);
    const area = Math.abs(
      points.reduce((n, p, i) => {
        const q = points[(i + 1) % points.length];
        return n + p[0] * q[1] - q[0] * p[1];
      }, 0)
    );
    if (area > bestArea) {
      bestArea = area;
      best = points;
    }
  }
  const simplified = best.filter((p, i) => {
    const prev = best[(i + best.length - 1) % best.length],
      next = best[(i + 1) % best.length];
    return (
      (p[0] - prev[0]) * (next[1] - p[1]) !==
      (p[1] - prev[1]) * (next[0] - p[0])
    );
  });
  if (simplified.length < 4)
    return [
      [box[0], box[1]],
      [box[2], box[1]],
      [box[2], box[3]],
      [box[0], box[3]],
    ];
  return simplified.map(([x, y]) => [(x / size) * width, (y / size) * height]);
}

export function decodeLayout(
  logits: ArrayLike<number>,
  boxes: ArrayLike<number>,
  masks: ArrayLike<number>,
  order: ArrayLike<number>,
  width: number,
  height: number,
  count = 300,
  maskSize = 200,
  threshold = 0.5,
  polygonDecoder?: (
    mask: ArrayLike<number>,
    size: number,
    box: Rect,
    width: number,
    height: number,
    threshold: number
  ) => [number, number][]
): LayoutRegion[] {
  const ranks = orderRanks(order, count);
  const candidates = Array.from({ length: count * 25 }, (_, i) => ({
    i,
    score: sigmoid(logits[i]),
  }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count);
  const regions: LayoutRegion[] = [];
  for (const item of candidates) {
    if (item.score < threshold) continue;
    const query = Math.floor(item.i / 25),
      cls = item.i % 25,
      offset = query * 4;
    const [cx, cy, w, h] = Array.from(
      { length: 4 },
      (_, i) => boxes[offset + i]
    );
    const bbox: Rect = [
      Math.max(0, (cx - w / 2) * width),
      Math.max(0, (cy - h / 2) * height),
      Math.min(width, (cx + w / 2) * width),
      Math.min(height, (cy + h / 2) * height),
    ];
    if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) continue;
    const label = DOC_LABELS[cls];
    const type =
      cls === 15
        ? "inline-formula"
        : ["doc_title", "paragraph_title"].includes(label)
          ? "heading"
          : label === "figure_title"
            ? "caption"
            : ["chart", "seal"].includes(label)
              ? "image"
              : [
                    "abstract",
                    "content",
                    "reference_content",
                    "aside_text",
                    "text",
                  ].includes(label)
                ? "paragraph"
                : label;
    const mask = { length: maskSize * maskSize } as ArrayLike<number>;
    // subarray avoids copying the ~48 MB mask output.
    const slice =
      (masks as Float32Array).subarray?.(
        query * maskSize * maskSize,
        (query + 1) * maskSize * maskSize
      ) ||
      Array.from(
        { length: mask.length },
        (_, i) => masks[query * mask.length + i]
      );
    regions.push({
      id: `layout-${query}-${cls}`,
      query,
      label,
      type,
      score: item.score,
      bbox,
      polygon: (polygonDecoder || maskPolygon)(
        slice,
        maskSize,
        bbox,
        width,
        height,
        threshold
      ),
      order: ranks[query],
    });
  }
  return regions.sort((a, b) => a.order - b.order || b.score - a.score);
}
