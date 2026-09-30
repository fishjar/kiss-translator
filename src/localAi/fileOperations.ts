import { sharedModelManager } from "./core/modelManager";
import { validateInputFile } from "./core/inputFiles";
import { CATALOG, OCR_GROUPS, getCatalogModel } from "./core/catalog";
import { OcrClient } from "./core/ocrClient";
import { LlmClient } from "./core/llmClient";
import { runtimeHost } from "./runtime/runtimeHostAdapter";
import { nextRpcId } from "./runtime/rpc";
import { inferOnnxModelDtype, resolveOcrVlmPrompt } from "./core/ocrVlmPrompts";
import type { OcrLoadSpec } from "./core/types";

const ocr = new OcrClient();
const vlm = new LlmClient();

export async function installedLlmModels(): Promise<string[]> {
  await sharedModelManager.init();
  return sharedModelManager.list()
    .filter((record) => record.state === "installed" && record.manifest.task === "llm")
    .map((record) => record.manifest.id);
}

export interface InstalledCapabilityModelItem {
  id: string;
  name: string;
  task: string;
}

export interface InstalledCapabilityModelGroup {
  category: string;
  title: string;
  items: InstalledCapabilityModelItem[];
}

export async function installedModelsForCapabilities(
  capabilities: string[] = ["translation"]
): Promise<InstalledCapabilityModelGroup[]> {
  await sharedModelManager.init();
  const installedRecords = sharedModelManager.list().filter((record) => record.state === "installed");
  const installedIds = new Set(installedRecords.map((record) => record.manifest.id));

  const groups: InstalledCapabilityModelGroup[] = [];
  const caps = Array.isArray(capabilities) && capabilities.length > 0
    ? capabilities
    : ["translation"];

  const wantOcr = caps.includes("ocr") || caps.includes("vlm");
  const wantLlm =
    caps.includes("llm") ||
    caps.includes("translation") ||
    caps.includes("summarization");
  const wantAsr = caps.includes("asr");
  const wantTts = caps.includes("tts");

  // 1. OCR 识图模型组
  if (wantOcr) {
    const ocrItems: InstalledCapabilityModelItem[] = [];
    for (const group of OCR_GROUPS) {
      if (installedIds.has(group.detId) && installedIds.has(group.recId)) {
        ocrItems.push({
          id: group.id,
          name: group.name,
          task: "ocr",
        });
      }
    }
    for (const m of CATALOG) {
      if (m.task === "ocr-vlm" && installedIds.has(m.id)) {
        ocrItems.push({
          id: m.id,
          name: m.name,
          task: "ocr-vlm",
        });
      }
    }
    if (ocrItems.length > 0) {
      groups.push({
        category: "ocr",
        title: "OCR / 识图模型",
        items: ocrItems,
      });
    }
  }

  // 2. 大语言 / 翻译 / 总结模型组
  if (wantLlm) {
    const llmItems: InstalledCapabilityModelItem[] = [];
    for (const record of installedRecords) {
      if (record.manifest.task === "llm") {
        llmItems.push({
          id: record.manifest.id,
          name: record.manifest.name || record.manifest.id,
          task: "llm",
        });
      }
    }
    if (llmItems.length > 0) {
      groups.push({
        category: "llm",
        title: "大语言 / 翻译 / 总结模型",
        items: llmItems,
      });
    }
  }

  // 3. 语音识别 (ASR)
  if (wantAsr) {
    const asrItems: InstalledCapabilityModelItem[] = [];
    for (const record of installedRecords) {
      if (record.manifest.task === "asr") {
        asrItems.push({
          id: record.manifest.id,
          name: record.manifest.name || record.manifest.id,
          task: "asr",
        });
      }
    }
    if (asrItems.length > 0) {
      groups.push({
        category: "asr",
        title: "语音识别 (ASR)",
        items: asrItems,
      });
    }
  }

  // 4. 语音合成 (TTS)
  if (wantTts) {
    const ttsItems: InstalledCapabilityModelItem[] = [];
    for (const record of installedRecords) {
      if (record.manifest.task === "tts") {
        ttsItems.push({
          id: record.manifest.id,
          name: record.manifest.name || record.manifest.id,
          task: "tts",
        });
      }
    }
    if (ttsItems.length > 0) {
      groups.push({
        category: "tts",
        title: "语音合成 (TTS)",
        items: ttsItems,
      });
    }
  }

  return groups;
}

export async function translateWithLocalModel(
  modelRef: string,
  text: string,
  toLang: string,
  signal?: AbortSignal
): Promise<string> {
  return runtimeHost.request({
    id: nextRpcId("file-translate"),
    service: "translation",
    method: "translate",
    payload: { modelRef, text, fromLang: "auto", toLang },
  }, { signal });
}

export async function summarizeWithLocalModel(
  modelRef: string,
  text: string,
  prompt?: string,
  signal?: AbortSignal
): Promise<string> {
  const userContent = prompt ? `${prompt}\n\n${text}` : text;
  const response: any = await runtimeHost.request({
    id: nextRpcId("local-summary"),
    service: "llm",
    method: "chat",
    payload: {
      modelRef,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 2048,
    },
  }, { signal });
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
  const readyPaddle = OCR_GROUPS.filter((item) =>
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
  optionsOrSignal?: { groupId?: string; device?: "webgpu" | "wasm" } | AbortSignal,
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
  const vlmModel = CATALOG.find((m) => m.id === selectedId && m.task === "ocr-vlm");
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
          mmprojFile: vlmModel.files.find((f) => f.path.includes("mmproj"))?.path,
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

    const prompt = resolveOcrVlmPrompt(vlmModel.id, "doc");
    const imgBuf = await file.arrayBuffer();
    const chatRes = await vlm.chat(
      [{ role: "user", content: prompt, images: [imgBuf] }],
      4096,
      () => {},
      [imgBuf],
      { modelRef: vlmModel.id, loadSpec: spec },
      signal
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
  return ocr.recognize(file, signal, { modelRef: group.id, loadSpec: spec });
}

export { getModelDisplayName } from "./core/catalog";

