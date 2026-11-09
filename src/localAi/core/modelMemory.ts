import { CATALOG } from "./catalog";

// 驻留预算使用统一估算，不能替代实际内存/显存测量。
export function estimateModelMemoryMB(spec: Record<string, unknown>): number {
  const models = CATALOG.filter(m => m.dir === spec.dir || m.dir === spec.detDir || m.dir === spec.recDir || m.id === spec.modelId);
  const bytes = models.reduce((total, m) => {
    const weights = m.files.filter(f => /\.(?:gguf|onnx|onnx\.data|onnx_data(?:_\d+)?)$/.test(f.path));
    return total + (weights.length ? weights.reduce((n, f) => n + f.size, 0) : m.size);
  }, 0);
  return Math.ceil(2 * bytes / 1048576) + 256;
}
