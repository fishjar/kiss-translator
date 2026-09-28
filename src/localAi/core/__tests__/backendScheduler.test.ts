import { describe, expect, it } from "vitest";
import { isModelRunnable, pickBackend } from "../backendScheduler";
import type { DeviceProfile, ModelManifest } from "../types";

const base: DeviceProfile = {
  webgpu: false,
  wasmSimd: false,
  sharedArrayBuffer: false,
  webnn: false,
  browser: "test",
  platform: "test",
};

const manifest: ModelManifest = {
  id: "m",
  name: "m",
  version: "1",
  task: "llm",
  runtime: "wllama",
  format: "gguf",
  backend: ["webgpu", "wasm"],
  size: 1,
  files: [{ path: "a", size: 1 }],
  source: "s/t",
  dir: "d",
};

describe("pickBackend", () => {
  it("WebGPU 可用且模型支持时选 webgpu", () => {
    expect(pickBackend({ ...base, webgpu: true }, manifest)).toBe("webgpu");
  });

  it("依赖 shader-f16 的模型（wllama / q4f16）在 webgpuShaderF16=false 时回退 wasm", () => {
    expect(
      pickBackend({ ...base, webgpu: true, webgpuShaderF16: false }, manifest)
    ).toBe("wasm");
    const onnxF16: ModelManifest = {
      ...manifest,
      runtime: "transformers",
      format: "onnx",
      files: [{ path: "onnx/model_q4f16.onnx", size: 1 }],
    };
    expect(
      pickBackend({ ...base, webgpu: true, webgpuShaderF16: false }, onnxF16)
    ).toBe("wasm");
  });

  it("不依赖 shader-f16 的模型（如 int8 ASR）在 webgpuShaderF16=false 时仍选 webgpu", () => {
    const asrInt8: ModelManifest = {
      ...manifest,
      task: "asr",
      runtime: "transformers",
      format: "onnx",
      files: [{ path: "onnx/encoder_model_int8.onnx", size: 1 }],
    };
    expect(
      pickBackend({ ...base, webgpu: true, webgpuShaderF16: false }, asrInt8)
    ).toBe("webgpu");
  });

  it("WebGPU 不可用时回退 wasm", () => {
    expect(pickBackend(base, manifest)).toBe("wasm");
  });

  it("模型不支持 webgpu 时即使设备支持也走 wasm", () => {
    const m: ModelManifest = { ...manifest, backend: ["wasm"] };
    expect(pickBackend({ ...base, webgpu: true }, m)).toBe("wasm");
  });
});

describe("isModelRunnable", () => {
  it("webgpu 支持 → 可运行", () => {
    expect(isModelRunnable({ ...base, webgpu: true }, manifest)).toBe(true);
  });

  it("wasm simd 支持 → 可运行", () => {
    expect(isModelRunnable({ ...base, wasmSimd: true }, manifest)).toBe(true);
  });

  it("都不支持 → 不可运行", () => {
    expect(isModelRunnable(base, manifest)).toBe(false);
  });

  it("只有 wasm 的模型要求 wasmSimd", () => {
    const m: ModelManifest = { ...manifest, backend: ["wasm"] };
    expect(isModelRunnable({ ...base, webgpu: true, wasmSimd: false }, m)).toBe(
      false
    );
    expect(isModelRunnable({ ...base, webgpu: true, wasmSimd: true }, m)).toBe(
      true
    );
  });
});
