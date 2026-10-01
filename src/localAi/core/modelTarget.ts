import { getCatalogModel, OCR_GROUPS } from "./catalog";
import { inferOnnxModelDtype } from "./ocrVlmPrompts";
import type { AiRpcService } from "../runtime/rpc";

export interface ModelTarget {
  modelRef: string;
  loadSpec?: Record<string, any>;
}

/** Resolve only the model explicitly named by the caller. */
export function resolveModelTarget(service: AiRpcService, target: ModelTarget): { spec: Record<string, any>; modelId: string; installedIds: string[] } {
  const overrides = target.loadSpec ?? {};
  if (service === "ocr") {
    const group = OCR_GROUPS.find((g) => g.id === target.modelRef);
    if (!group) throw new Error("INVALID_MODEL: OCR 模型组合不存在");
    const det = getCatalogModel(group.detId)!;
    const rec = getCatalogModel(group.recId)!;
    const spec = {
      detDir: det.dir,
      detFile: det.files[0].path,
      detName: group.detName,
      recDir: rec.dir,
      recFile: rec.files[0].path,
      recName: group.recName,
      device: "wasm",
      ...overrides,
    };
    for (const [key, value] of Object.entries({
      detDir: det.dir,
      recDir: rec.dir,
      detName: group.detName,
      recName: group.recName,
      detFile: det.files[0].path,
      recFile: rec.files[0].path,
    })) {
      if ((spec as any)[key] !== value)
        throw new Error("INVALID_MODEL: 模型标识与加载参数不一致");
    }
    if (!["webgpu", "wasm"].includes(spec.device))
      throw new Error("INVALID_MODEL: 计算后端无效");
    return {
      spec,
      modelId: `${group.detName}+${group.recName}`,
      installedIds: [det.id, rec.id],
    };
  }
  const m = getCatalogModel(target.modelRef);
  if (
    !m ||
    !(service === "vlm"
      ? m.task === "ocr-vlm"
      : m.task === service)
  ) {
    throw new Error("INVALID_MODEL: 模型不存在或与服务不兼容");
  }
  const device =
    m.backend.includes("webgpu") && (globalThis.navigator as any)?.gpu
      ? "webgpu"
      : "wasm";
  let spec: Record<string, any>;
  if (service === "asr") {
    spec = {
      runtime: m.runtime === "onnx" ? "onnx" : "transformers",
      source: m.source,
      dir: m.dir,
      device,
      dtype: "int8",
      multilingual: m.multilingual !== false,
      wordTimestamps: m.wordTimestamps === true,
    };
  } else if (service === "tts") {
    spec = {
      engine: m.id.includes("audio8")
        ? "audio8"
        : m.runtime === "piper"
          ? "piper"
          : "kokoro",
      source: m.source,
      dir: m.dir,
      device,
    };
  } else if (service === "decision") {
    spec = {
      modelId: m.id,
      source: m.source,
      dir: m.dir,
      device,
      modelFile: m.files.find((f) => f.path.endsWith(".onnx"))?.path,
      tokenizerFile: m.files.find((f) => f.path.endsWith("tokenizer.json"))
        ?.path,
      tokenizerConfigFile: m.files.find((f) =>
        f.path.endsWith("tokenizer_config.json")
      )?.path,
      configFile: m.files.find((f) => f.path.endsWith("rl_agent_config.json"))
        ?.path,
    };
  } else {
    const onnx = m.files.find((f) => f.path.endsWith(".onnx"));
    spec =
      m.runtime === "wllama"
        ? {
            runtime: "wllama",
            source: m.source,
            dir: m.dir,
            device,
            nCtx: 2048,
            file: m.files.find(
              (f) => f.path.endsWith(".gguf") && !f.path.includes("mmproj")
            )?.path,
            mmprojFile: m.files.find((f) => f.path.includes("mmproj"))?.path,
          }
        : {
            runtime: "onnx",
            source: m.source,
            dir: m.dir,
            device,
            dtype:
              m.task === "ocr-vlm"
                ? inferOnnxModelDtype(m.files.map((f) => f.path))
                : (onnx?.path.match(/model_(.+)\.onnx$/)?.[1] ?? "q4f16"),
            externalDataChunks:
              m.files.filter((f) => /\.onnx_data(?:_\d+)?$/.test(f.path))
                .length || undefined,
          };
  }
  const expected = { ...spec };
  spec = { ...spec, ...overrides };
  for (const key of [
    "dir",
    "source",
    "runtime",
    "engine",
    "modelId",
    "file",
    "mmprojFile",
    "modelFile",
    "tokenizerFile",
    "configFile",
  ]) {
    if (expected[key] !== undefined && spec[key] !== expected[key])
      throw new Error("INVALID_MODEL: 模型标识与加载参数不一致");
  }
  if (!m.backend.includes(spec.device))
    throw new Error("INVALID_MODEL: 模型不支持指定计算后端");
  return {
    spec,
    modelId: service === "decision" ? m.id : m.dir,
    installedIds: [m.id],
  };
}
