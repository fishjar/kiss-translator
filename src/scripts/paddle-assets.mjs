import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const PADDLE_MAP_SHA256 = "9a04c3cb01c1558983a9ff03cd5ebc3bd3a81e271b2b394c388e097610a62d33";
export const OPENCV_WASM_SHA256 = "fe8e126d8c3e517bcb0e0c6401dbd6a714f4cd8d78705e6a3edbc7c813a0aae3";

export function extractOpenCv(code) {
  const matches = [...code.matchAll(/["']data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)["']/g)];
  if (matches.length !== 1) throw new Error("Expected exactly one embedded OpenCV WASM");
  const bytes = Buffer.from(matches[0][1], "base64");
  if (sha256(bytes) !== OPENCV_WASM_SHA256) throw new Error("OpenCV WASM fingerprint changed");
  const source = code.replace(matches[0][0], "opencvWasmUrl");
  // Keep the original UMD factory and exports semantics inside a local scope.
  return { bytes, source: `import opencvWasmUrl from "./opencv.wasm?url";\nconst module = { exports: {} };\nconst exports = module.exports;\n${source}\nexport default module.exports;\n` };
}

export async function preparePaddleAssets(destination, sdkRoot = "node_modules/@paddleocr/paddleocr-js") {
  const pkg = JSON.parse(await fs.readFile(path.join(sdkRoot, "package.json"), "utf8"));
  if (pkg.version !== "0.4.2") throw new Error("PaddleOCR build adapter requires exactly 0.4.2");
  const raw = await fs.readFile(path.join(sdkRoot, "dist/assets/worker-entry-C9UNuyOJ.js.map"));
  if (sha256(raw) !== PADDLE_MAP_SHA256) throw new Error("PaddleOCR source map changed; review the adapter before upgrading");
  const map = JSON.parse(raw);
  if (map.sources.length !== 25 || map.sourcesContent.length !== 25 || map.sourcesContent.some((s) => typeof s !== "string")) throw new Error("Incomplete PaddleOCR source map");
  await fs.mkdir(destination, { recursive: true });
  for (let i = 0; i < map.sources.length; i++) {
    const original = map.sources[i];
    if (!original.startsWith("../src/")) continue;
    const relative = original.slice(3);
    if (relative.split("/").includes("..")) throw new Error("Unsafe PaddleOCR source path");
    const file = path.join(destination, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let code = map.sourcesContent[i].replaceAll('"onnxruntime-web"', '"onnxruntime-web/webgpu"');
    // Rollup's source map omits barrels with no executable statements. Resolve
    // these two live imports to the original leaf modules, without recreating SDK logic.
    code = code.replace('from "../../resources/index"', 'from "../../resources/model-asset"');
    code = code.replace('import { createDetModel, createRecModel } from "../../models/index";', 'import { createDetModel } from "../../models/det";\nimport { createRecModel } from "../../models/rec";');
    await fs.writeFile(file, code);
  }
  const getSource = (suffix) => map.sourcesContent[map.sources.findIndex((s) => s.endsWith(suffix))];
  const cv = extractOpenCv(getSource("@techstark/opencv-js/dist/opencv.js"));
  await fs.writeFile(path.join(destination, "opencv.js"), cv.source);
  await fs.writeFile(path.join(destination, "opencv.wasm"), cv.bytes);
  await fs.writeFile(path.join(destination, "js-yaml.mjs"), getSource("js-yaml/dist/js-yaml.mjs"));
  await fs.writeFile(path.join(destination, "clipper.cjs"), getSource("clipper-lib/clipper.js"));
  const notices = new Set();
  for (const source of map.sourcesContent) {
    for (const match of source.matchAll(/\/\*[\s\S]*?\*\//g)) {
      if (/copyright|license|permission is hereby/i.test(match[0])) notices.add(match[0]);
    }
  }
  await fs.writeFile(path.join(destination, "NOTICE.txt"), [...notices].join("\n\n"));
  return { entry: path.join(destination, "src/pipelines/ocr/worker-entry.ts"), wasmSha256: sha256(cv.bytes) };
}
