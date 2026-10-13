export type OcrVlmTaskMode = "doc" | "table" | "formula";

export interface OcrVlmTaskOption {
  id: OcrVlmTaskMode;
  label: string;
}

export const OCR_VLM_TASK_OPTIONS: readonly OcrVlmTaskOption[] = [
  { id: "doc", label: "文档/文本识别 (Markdown)" },
  { id: "table", label: "表格识别 (Table)" },
  { id: "formula", label: "公式识别 (LaTeX)" },
];

/**
 * 判断指定 VLM 模型是否支持切换子任务提示词（文档/表格/公式）。
 * Unlimited-OCR 仅针对固定提示词 "document parsing." 微调，不支持切换任务。
 */
export function supportsOcrVlmTaskSwitch(modelId: string): boolean {
  return modelId !== "unlimited-ocr-iq2m";
}

/**
 * 根据 VLM 模型 ID 与所选解析任务返回对应的官方标准提示词。
 * - GLM-OCR 官方要求："Text Recognition:" / "Table Recognition:" / "Formula Recognition:"
 * - PaddleOCR-VL 1.6 官方要求："OCR:" / "Table Recognition:" / "Formula Recognition:"
 * - Unlimited-OCR 官方要求："document parsing."
 */
export function resolveOcrVlmPrompt(
  modelId: string,
  taskMode: OcrVlmTaskMode
): string {
  if (modelId === "unlimited-ocr-iq2m") {
    return "document parsing.";
  }
  if (modelId.startsWith("paddleocr-vl")) {
    switch (taskMode) {
      case "table":
        return "Table Recognition:";
      case "formula":
        return "Formula Recognition:";
      case "doc":
      default:
        return "OCR:";
    }
  }
  // 默认按 GLM-OCR 标准提示词映射
  switch (taskMode) {
    case "table":
      return "Table Recognition:";
    case "formula":
      return "Formula Recognition:";
    case "doc":
    default:
      return "Text Recognition:";
  }
}

/**
 * 从 ONNX 模型文件列表中推断 transformers.js 所需的 dtype（如 "q4" / "q4f16" / "q8" / "fp16"）。
 */
export function inferOnnxModelDtype(filePaths: readonly string[]): string {
  for (const p of filePaths) {
    const m = p.match(/(?:model|decoder_model_merged|vision_encoder)_([a-z0-9]+)\.onnx$/i);
    if (m?.[1]) return m[1];
  }
  return "q4";
}
