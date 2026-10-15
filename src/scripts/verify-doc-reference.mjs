// Compare real browser results with independent OpenCV preprocessing and native ORT CPU.
// Usage: node src/scripts/verify-doc-reference.mjs <python executable>
// Install opencv-python-headless into tmp/doc-reference-deps (not production dependencies).
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ort = require(
  require.resolve("onnxruntime-node", {
    paths: [path.dirname(require.resolve("@huggingface/transformers"))],
  })
);
const cache = path.resolve("tmp/doc-validation");
const results = JSON.parse(
  await fs.readFile(path.join(cache, "doc-browser-results.json"), "utf8")
);
const session = await ort.InferenceSession.create(
  path.join(cache, "PP-DocLayoutV3.onnx"),
  { executionProviders: ["cpu"] }
);
const report = [];
try {
  for (const result of results) {
    const image = path.join(cache, result.file + ".png"),
      inputFile = image + ".f32";
    const code =
      "import sys;sys.path.insert(0,sys.argv[1]);import cv2,numpy as np;im=cv2.cvtColor(cv2.imread(sys.argv[2]),cv2.COLOR_BGR2RGB);im=cv2.resize(im,(800,800),interpolation=cv2.INTER_CUBIC);(im.astype(np.float32)/255).transpose(2,0,1).tofile(sys.argv[3])";
    const python = spawnSync(
      process.argv[2] || "python",
      ["-c", code, path.resolve("tmp/doc-reference-deps"), image, inputFile],
      { encoding: "utf8" }
    );
    if (python.status !== 0) throw Error(python.stderr);
    const bytes = await fs.readFile(inputFile),
      values = new Float32Array(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        )
      );
    const started = performance.now();
    const out = await session.run({
      pixel_values: new ort.Tensor("float32", values, [1, 3, 800, 800]),
    });
    const elapsedMs = performance.now() - started;
    for (const name of ["logits", "pred_boxes", "out_masks", "order_logits"])
      assert(out[name], `Missing ${name}`);
    const sigmoid = (x) => 1 / (1 + Math.exp(-x));
    const votes = new Array(300).fill(0);
    for (let i = 0; i < 300; i++)
      for (let j = i + 1; j < 300; j++) {
        const p = sigmoid(out.order_logits.data[i * 300 + j]);
        votes[j] += p;
        votes[i] += 1 - p;
      }
    const ranked = votes
        .map((_, i) => i)
        .sort((a, b) => votes[a] - votes[b] || a - b),
      rank = [];
    ranked.forEach((q, i) => {
      rank[q] = i;
    });
    const selected = Array.from(out.logits.data, (v, i) => ({
      i,
      score: sigmoid(v),
    }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, 300)
      .filter((r) => r.score >= 0.5);
    assert.equal(selected.length, result.regions.length);
    let maxScoreError = 0,
      maxBoxError = 0;
    for (const region of result.regions) {
      const query = region.query,
        cls = Number(region.id.split("-").at(-1));
      const scoreError = Math.abs(
        sigmoid(out.logits.data[query * 25 + cls]) - region.score
      );
      maxScoreError = Math.max(maxScoreError, scoreError);
      assert(scoreError < 0.002, `${result.file}: ${region.id} score mismatch`);
      const [cx, cy, w, h] = out.pred_boxes.data.slice(
          query * 4,
          query * 4 + 4
        ),
        { width, height } = result.imageSize;
      const box = [
        Math.max(0, (cx - w / 2) * width),
        Math.max(0, (cy - h / 2) * height),
        Math.min(width, (cx + w / 2) * width),
        Math.min(height, (cy + h / 2) * height),
      ];
      box.forEach((value, i) => {
        maxBoxError = Math.max(maxBoxError, Math.abs(value - region.bbox[i]));
        assert(Math.abs(value - region.bbox[i]) < 0.5, "Bounding box mismatch");
      });
    }
    const selectedOrder = result.regions
      .slice()
      .sort((a, b) => rank[a.query] - rank[b.query])
      .map((r) => r.id);
    assert.deepEqual(
      selectedOrder,
      result.readingOrder,
      "Selected-region reading order mismatch"
    );
    report.push({
      file: result.file,
      regions: selected.length,
      nativeBackend: "cpu",
      browserBackend: result.backend,
      nativeElapsedMs: elapsedMs,
      browserElapsedMs: result.elapsedMs,
      maxScoreError,
      maxBoxError,
      readingOrder: "identical",
      limitations:
        "Contour polygons and semantic accuracy require separate visual verification.",
    });
  }
  await fs.writeFile(
    path.join(cache, "doc-reference-comparison.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await session.release();
}
