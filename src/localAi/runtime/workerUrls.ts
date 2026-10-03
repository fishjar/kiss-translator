export type LocalWorkerName =
  | "doc"
  | "asr"
  | "jev"
  | "llm"
  | "llm-onnx"
  | "tts"
  | "ocr";

// The runtime document lives at the extension root. Worker entries are emitted
// together with offscreen.js so Rollup can share their dependency modules.
export function localWorkerUrl(
  name: LocalWorkerName,
  documentUrl = globalThis.location.href
): URL {
  return new URL(`./local-ai/${name}-worker.js`, documentUrl);
}

export function createLocalWorker(name: LocalWorkerName): Worker {
  return new Worker(localWorkerUrl(name), { type: "module" });
}
