import type { Backend, DeviceProfile, ModelManifest } from "./types";

// wllama 的 ggml-webgpu 后端以及 q4f16/fp16 ONNX 模型均依赖 WebGPU shader-f16 特性；
// 缺失时 wllama 静默回退 CPU、ORT 逐节点回退卡死。
export function requiresShaderF16(manifest: ModelManifest): boolean {
  if (manifest.runtime === "wllama") return true;
  return manifest.files.some((f) => /f16.*\.onnx$/i.test(f.path));
}

function canUseWebGpu(profile: DeviceProfile, manifest: ModelManifest): boolean {
  if (!manifest.backend.includes("webgpu") || !profile.webgpu) return false;
  if (requiresShaderF16(manifest) && profile.webgpuShaderF16 === false) {
    return false;
  }
  return true;
}

export function pickBackend(
  profile: DeviceProfile,
  manifest: ModelManifest
): Backend {
  if (canUseWebGpu(profile, manifest)) return "webgpu";
  return "wasm";
}

export function isModelRunnable(
  profile: DeviceProfile,
  manifest: ModelManifest
): boolean {
  if (canUseWebGpu(profile, manifest)) return true;
  return manifest.backend.includes("wasm") && profile.wasmSimd;
}
