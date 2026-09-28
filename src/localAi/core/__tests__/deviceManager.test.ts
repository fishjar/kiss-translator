import { describe, expect, it, vi } from "vitest";
import { detectDevice, isWasmSimdSupported } from "../deviceManager";

describe("isWasmSimdSupported", () => {
  it("Node/V8 环境支持 SIMD，返回 true", () => {
    expect(isWasmSimdSupported()).toBe(true);
  });

  it("重复调用结果一致", () => {
    expect(isWasmSimdSupported()).toBe(isWasmSimdSupported());
  });
});

describe("detectDevice", () => {
  it("正确读取标准 WebGPU GPUSupportedLimits 属性对象与 shader-f16 特性", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 Chrome/130.0.0.0",
      platform: "Win32",
      hardwareConcurrency: 8,
      deviceMemory: 8,
      gpu: {
        requestAdapter: async () => ({
          limits: {
            maxBufferSize: 2147483648,
            maxStorageBufferBindingSize: 1073741824,
          },
          features: new Set(["shader-f16", "subgroups"]),
          info: { description: "NVIDIA RTX 4060" },
        }),
      },
    });
    const p = await detectDevice();
    expect(p.webgpu).toBe(true);
    expect(p.webgpuShaderF16).toBe(true);
    expect(p.maxBufferSize).toBe(2147483648);
    expect(p.maxStorageBufferBindingSize).toBe(1073741824);
    expect(p.webgpuAdapter).toBe("NVIDIA RTX 4060");
    expect(p.webgpuError).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
