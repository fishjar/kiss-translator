import type { DeviceProfile } from "./types";

// 官方 wasm-feature-detect (GoogleChromeLabs) 的 SIMD 测试模块字节
// (module (func (result v128) i32.const 0 i8x16.splat i8x16.popcnt))
const SIMD_TEST_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

// 不含 SIMD 的基础模块，用于区分"WASM 整体不可用"与"仅 SIMD 被拒"
// (module (func (result i32) i32.const 1))
const PLAIN_WASM_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x06, 0x01, 0x04, 0x00, 0x41, 0x01, 0x0b,
]);

export interface WasmSimdCheck {
  supported: boolean;
  error?: string;
}

export function checkWasmSimd(): WasmSimdCheck {
  try {
    new WebAssembly.Module(SIMD_TEST_MODULE);
    return { supported: true };
  } catch (e) {
    const err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    let extra: string;
    try {
      new WebAssembly.Module(PLAIN_WASM_MODULE);
      extra = "；基础 WASM 正常，仅 SIMD 指令被拒";
    } catch (e2) {
      extra = `；基础 WASM 模块也失败（${
        e2 instanceof Error ? e2.name + ": " + e2.message : String(e2)
      }）`;
    }
    return { supported: false, error: err + extra };
  }
}

export function isWasmSimdSupported(): boolean {
  return checkWasmSimd().supported;
}

function detectBrowser(ua: string): string {
  if (ua.includes("Edg/")) return "Edge";
  if (ua.includes("OPR/")) return "Opera";
  if (ua.includes("Chrome/")) return "Chrome";
  if (ua.includes("Firefox/")) return "Firefox";
  if (ua.includes("Safari/")) return "Safari";
  return "unknown";
}

interface GpuAdapterInfoLike {
  description?: string;
}

interface GpuLimitsLike {
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
}

interface GpuAdapterLike {
  limits?: GpuLimitsLike | (() => GpuLimitsLike);
  features?: { has?: (name: string) => boolean };
  info?: GpuAdapterInfoLike;
  requestAdapterInfo?: () => Promise<GpuAdapterInfoLike>;
}

interface NavigatorLike {
  gpu?: { requestAdapter?: () => Promise<GpuAdapterLike | null> };
  ml?: unknown;
  deviceMemory?: number;
}

export async function detectDevice(): Promise<DeviceProfile> {
  const nav = navigator as Navigator & NavigatorLike;
  const simd = checkWasmSimd();
  const profile: DeviceProfile = {
    webgpu: false,
    wasmSimd: simd.supported,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    webnn: typeof nav.ml !== "undefined",
    deviceMemoryGB: nav.deviceMemory,
    cpuCores: nav.hardwareConcurrency,
    browser: detectBrowser(navigator.userAgent),
    platform: navigator.platform || "unknown",
  };
  if (simd.error) profile.wasmSimdError = simd.error;

  if (typeof nav.gpu?.requestAdapter !== "function") {
    profile.webgpuError = "navigator.gpu 不存在（当前上下文不可用）";
  } else {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        profile.webgpu = true;
        profile.webgpuShaderF16 = Boolean(
          adapter.features?.has?.("shader-f16")
        );
        const limits =
          typeof adapter.limits === "function"
            ? adapter.limits()
            : adapter.limits;
        if (limits?.maxBufferSize) profile.maxBufferSize = limits.maxBufferSize;
        if (limits?.maxStorageBufferBindingSize) {
          profile.maxStorageBufferBindingSize =
            limits.maxStorageBufferBindingSize;
        }
        try {
          const info = adapter.requestAdapterInfo
            ? await adapter.requestAdapterInfo()
            : adapter.info;
          if (info?.description) profile.webgpuAdapter = info.description;
        } catch {
          // 适配器信息获取失败不影响 WebGPU 可用性判定
        }
      } else {
        profile.webgpuError =
          "requestAdapter() 返回 null：无兼容 GPU 适配器（可能被驱动/GPU 黑名单拦截）";
      }
    } catch (e) {
      profile.webgpuError = e instanceof Error ? e.message : String(e);
    }
  }

  return profile;
}
