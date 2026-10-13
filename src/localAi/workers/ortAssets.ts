import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";

export const ORT_WASM_PATHS = { wasm: wasmUrl, mjs: mjsUrl };
