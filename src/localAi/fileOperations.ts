import { sharedModelManager } from "./core/modelManager";
import { validateInputFile } from "./core/inputFiles";
import { CATALOG, OCR_GROUPS, getCatalogModel } from "./core/catalog";
import { OcrClient } from "./core/ocrClient";
import { VlmClient } from "./core/vlmClient";
import { runtimeHost } from "./runtime/runtimeHostAdapter";
import { nextRpcId } from "./runtime/rpc";
import { inferOnnxModelDtype, resolveOcrVlmPrompt } from "./core/ocrVlmPrompts";
import type { OcrLoadSpec } from "./core/types";

const ocr = new OcrClient();
const vlm = new VlmClient();

export async function installedLlmModels(): Promise<string[]> {
  await sharedModelManager.init();
  return sharedModelManager
    .list()
    .filter(
      (record) => record.state === "installed" && record.manifest.task === "llm"
    )
    .map((record) => record.manifest.id);
}

export interface ServiceModelItem {
  id: string;
  name: string;
  task: string;
  installed: boolean;
  unavailableReasons: string[];
}

export interface ServiceModelGroup {
  category: string;
  title: string;
  items: ServiceModelItem[];
}

/** Show the complete service catalogue without loading any model for inference. */
export async function serviceModelOptions(): Promise<ServiceModelGroup[]> {
  const { detectDevice } = await import("./core/deviceManager");
  const [, device] = await Promise.all([
    sharedModelManager.init(),
    detectDevice(),
  ]);
  const records = sharedModelManager.list();
  const installed = new Set(
    records
      .filter((record) => record.state === "installed")
      .map((record) => record.manifest.id)
  );
  const models = new Map(CATALOG.map((model) => [model.id, model]));
  // Preserve installed custom models alongside the built-in catalogue.
  for (const record of records)
    if (!models.has(record.manifest.id))
      models.set(record.manifest.id, record.manifest);
  const definitions = [
    ["ocr", "OCR / 文字识别", "ocr"],
    ["vlm", "VLM / 识图与文档解析", "ocr-vlm"],
    ["llm", "大语言 / 翻译 / 总结模型", "llm"],
    ["asr", "语音识别 (ASR)", "asr"],
    ["tts", "语音合成 (TTS)", "tts"],
    ["layout", "界面分析 (Layout)", "doc-layout"],
    ["decision", "JEV", "decision"],
  ];
  const reasons = (backends: string[]) => {
    const result: string[] = [];
    if (
      !backends.some((backend) =>
        backend === "webgpu"
          ? device.webgpu
          : backend === "wasm" && device.wasmSimd
      )
    ) {
      result.push(
        backends.includes("wasm")
          ? "当前环境不支持所需的 WebGPU/WASM SIMD"
          : "当前环境不支持 WebGPU"
      );
    }
    return result;
  };
  return definitions
    .map(([category, title, task]) => ({
      category,
      title,
      items: [
        ...(category === "ocr"
          ? OCR_GROUPS.map((group) => ({
              id: group.id,
              name: group.name,
              task: "ocr",
              installed: [group.detId, group.recId].every((id) => installed.has(id)),
              unavailableReasons: reasons(["wasm", "webgpu"]),
            }))
          : []),
        ...Array.from(models.values())
          .filter((model) => category !== "ocr" && model.task === task)
          .map((model) => ({
            id: model.id,
            name: model.name,
            task: model.task,
            installed: installed.has(model.id),
            unavailableReasons: reasons(model.backend),
          })),
      ],
    }))
    .filter((group) => group.items.length);
}

export async function translateWithLocalModel(
  modelRef: string,
  text: string,
  toLang: string,
  signal?: AbortSignal
): Promise<string> {
  return runtimeHost.request(
    {
      id: nextRpcId("file-translate"),
      service: "translation",
      method: "translate",
      payload: { modelRef, text, fromLang: "auto", toLang },
    },
    { signal }
  );
}

export async function summarizeWithLocalModel(
  modelRef: string,
  text: string,
  prompt?: string,
  signal?: AbortSignal
): Promise<string> {
  const userContent = prompt ? `${prompt}\n\n${text}` : text;
  const response: any = await runtimeHost.request(
    {
      id: nextRpcId("local-summary"),
      service: "llm",
      method: "chat",
      payload: {
        modelRef,
        messages: [{ role: "user", content: userContent }],
        maxTokens: 2048,
      },
    },
    { signal }
  );
  if (typeof response === "string") return response;
  return response?.text || "";
}

export interface OcrModelOption {
  id: string;
  name: string;
  category: "paddle" | "vlm";
  supportsInpainting: boolean;
}

export const ALL_OCR_MODELS: OcrModelOption[] = [
  ...OCR_GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    category: "paddle" as const,
    supportsInpainting: true,
  })),
  ...CATALOG.filter((m) => m.task === "ocr-vlm").map((m) => ({
    id: m.id,
    name: m.name,
    category: "vlm" as const,
    supportsInpainting: false,
  })),
];

export async function installedOcrGroups(): Promise<string[]> {
  await sharedModelManager.init();
  const readyPaddle = OCR_GROUPS.filter(
    (item) =>
      sharedModelManager.get(item.detId)?.state === "installed" &&
      sharedModelManager.get(item.recId)?.state === "installed"
  ).map((item) => item.id);

  const readyVlm = CATALOG.filter((m) => m.task === "ocr-vlm")
    .filter((m) => sharedModelManager.get(m.id)?.state === "installed")
    .map((m) => m.id);

  return [...readyPaddle, ...readyVlm];
}

export { OCR_GROUPS };

export async function recognizeFileImage(
  file: Blob,
  optionsOrSignal?:
    | {
        groupId?: string;
        device?: "webgpu" | "wasm";
        prompt?: string;
        maxTokens?: number;
        temperature?: number;
        onProgress?: (status: string) => void;
        cacheMode?: "default" | "refresh" | "off";
      }
    | AbortSignal,
  maybeSignal?: AbortSignal
) {
  const options =
    optionsOrSignal && !(optionsOrSignal instanceof AbortSignal)
      ? optionsOrSignal
      : undefined;
  const signal =
    optionsOrSignal instanceof AbortSignal ? optionsOrSignal : maybeSignal;
  await validateInputFile(file, "image", signal);

  await sharedModelManager.init();
  const selectedId = options?.groupId || "ppocr-v5-mobile";

  // 1. 检查是否为 VLM 端到端多模态大模型
  const vlmModel = CATALOG.find(
    (m) => m.id === selectedId && m.task === "ocr-vlm"
  );
  if (vlmModel) {
    if (sharedModelManager.get(vlmModel.id)?.state !== "installed") {
      throw new Error(`请先在本地 AI 模型中心安装 ${vlmModel.name}`);
    }
    const isWllama = vlmModel.runtime === "wllama";
    const spec = isWllama
      ? {
          runtime: "wllama" as const,
          dir: vlmModel.dir,
          file:
            vlmModel.files.find((f) => !f.path.includes("mmproj"))?.path ||
            vlmModel.files[0]!.path,
          mmprojFile: vlmModel.files.find((f) => f.path.includes("mmproj"))
            ?.path,
          device: options?.device || "webgpu",
          nCtx: 8192,
        }
      : {
          runtime: "onnx" as const,
          source: vlmModel.source,
          dir: vlmModel.dir,
          device: options?.device || "webgpu",
          dtype: inferOnnxModelDtype(vlmModel.files.map((f) => f.path)),
        };
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");

    const prompt = options?.prompt ?? resolveOcrVlmPrompt(vlmModel.id, "doc");
    const imgBuf = await file.arrayBuffer();
    const chatRes = await vlm.chat(
      [{ role: "user", content: prompt, images: [imgBuf] }],
      options?.maxTokens ?? 4096,
      () => {},
      [imgBuf],
      { modelRef: vlmModel.id, loadSpec: spec, cacheMode: options?.cacheMode },
      signal,
      { temperature: options?.temperature, onProgress: options?.onProgress }
    );

    const fullText = chatRes.text || "";
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return {
      text: fullText,
      inputAdjustments: chatRes.inputAdjustments,
      items: lines.map((line) => ({
        text: line,
        poly: null,
      })),
      isVlm: true,
    };
  }

  // 2. 传统 PaddleOCR 两阶段模型（带定位坐标框 poly）
  const group = OCR_GROUPS.find((item) => item.id === selectedId);
  if (!group) throw new Error("请先在本地 AI 模型中心安装 OCR 检测和识别模型");
  const det = getCatalogModel(group.detId)!;
  const rec = getCatalogModel(group.recId)!;
  const spec: OcrLoadSpec = {
    detDir: det.dir,
    detFile: det.files[0]!.path,
    detName: group.detName,
    recDir: rec.dir,
    recFile: rec.files[0]!.path,
    recName: group.recName,
    device: options?.device || "webgpu",
  };
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  return ocr.recognize(file, signal, { modelRef: group.id, loadSpec: spec, cacheMode: options?.cacheMode }, options?.onProgress);
}

export { getModelDisplayName } from "./core/catalog";
