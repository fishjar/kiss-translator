// Copyright 2026 The PaddlePaddle Team and The HuggingFace Inc. team.
// Postprocessing adapted from PPDocLayoutV3ImageProcessor, Apache-2.0.
import cvModule from "kiss-doc-opencv";
import type { Rect } from "./docLayout";

let ready: Promise<{ cv: any }> | null = null;
export function docOpenCv(): Promise<{ cv: any }> {
  ready ||= (async () => {
    if (cvModule instanceof Promise) return { cv: await cvModule };
    if (!cvModule.Mat)
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = resolve;
      });
    // Emscripten exposes a thenable Module; returning it directly would recursively assimilate it.
    return { cv: cvModule };
  })();
  return ready;
}

// PP-DocLayoutV3 uses OpenCV cubic resize, RGB, rescale 1/255 and NCHW.
export function docPixels(
  cv: any,
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const source = cv.matFromArray(height, width, cv.CV_8UC4, pixels);
  const rgb = new cv.Mat(),
    resized = new cv.Mat();
  try {
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
    cv.resize(rgb, resized, new cv.Size(800, 800), 0, 0, cv.INTER_CUBIC);
    const values = new Float32Array(3 * 800 * 800);
    for (let i = 0; i < 800 * 800; i++)
      for (let c = 0; c < 3; c++)
        values[c * 800 * 800 + i] = resized.data[3 * i + c] / 255;
    return values;
  } finally {
    source.delete();
    rgb.delete();
    resized.delete();
  }
}

// Official mask crop, nearest resize, external contour, approxPolyDP and vertex repair.
export function docPolygon(
  cv: any,
  mask: ArrayLike<number>,
  size: number,
  box: Rect,
  width: number,
  height: number,
  threshold: number
): [number, number][] {
  const [left, top, right, bottom] = box.map(Math.trunc);
  const rect: [number, number][] = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
  const roundEven = (n: number) =>
    Math.abs(n - Math.floor(n) - 0.5) < 1e-8
      ? Math.round(n / 2) * 2
      : Math.round(n);
  const x0 = Math.max(0, Math.min(size, roundEven((left / width) * size))),
    x1 = Math.max(0, Math.min(size, roundEven((right / width) * size)));
  const y0 = Math.max(0, Math.min(size, roundEven((top / height) * size))),
    y1 = Math.max(0, Math.min(size, roundEven((bottom / height) * size)));
  if (x1 <= x0 || y1 <= y0 || right <= left || bottom <= top) return rect;
  const bits = new Uint8Array((x1 - x0) * (y1 - y0));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      bits[(y - y0) * (x1 - x0) + x - x0] =
        1 / (1 + Math.exp(-mask[y * size + x])) > threshold ? 1 : 0;
  const source = cv.matFromArray(y1 - y0, x1 - x0, cv.CV_8UC1, bits),
    resized = new cv.Mat(),
    contours = new cv.MatVector(),
    hierarchy = new cv.Mat(),
    approx = new cv.Mat();
  let best: any = null;
  try {
    cv.resize(
      source,
      resized,
      new cv.Size(right - left, bottom - top),
      0,
      0,
      cv.INTER_NEAREST
    );
    cv.findContours(
      resized,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );
    let max = 0;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i),
        area = cv.contourArea(c);
      if (area > max) {
        best?.delete();
        best = c;
        max = area;
      } else c.delete();
    }
    if (!best) return rect;
    cv.approxPolyDP(best, approx, 0.004 * cv.arcLength(best, true), true);
    const points: [number, number][] = [];
    for (let i = 0; i < approx.data32S.length; i += 2)
      points.push([approx.data32S[i], approx.data32S[i + 1]]);
    const repaired: [number, number][] = [];
    points.forEach((p, i) => {
      const prev = points[(i + points.length - 1) % points.length],
        next = points[(i + 1) % points.length];
      const a = [prev[0] - p[0], prev[1] - p[1]],
        b = [next[0] - p[0], next[1] - p[1]];
      if (a[1] * b[0] - a[0] * b[1] >= 0) return;
      const na = Math.hypot(...a),
        nb = Math.hypot(...b),
        angle =
          (Math.acos(
            Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (na * nb)))
          ) *
            180) /
          Math.PI;
      if (Math.abs(angle - 45) < 1) {
        const dx = a[0] / na + b[0] / nb,
          dy = a[1] / na + b[1] / nb,
          n = Math.hypot(dx, dy),
          step = (na + nb) / 2;
        repaired.push([
          p[0] + (dx / n) * step + left,
          p[1] + (dy / n) * step + top,
        ]);
      } else repaired.push([p[0] + left, p[1] + top]);
    });
    return repaired.length < 4 ? rect : repaired;
  } finally {
    best?.delete();
    source.delete();
    resized.delete();
    contours.delete();
    hierarchy.delete();
    approx.delete();
  }
}
