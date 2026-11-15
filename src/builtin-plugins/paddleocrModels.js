/**
 * @file paddleocrModels.js
 * @description PaddleOCR 官方异步 API 的模型元数据与能力映射。
 *
 * 官方免费接口按模型分为三条产线：
 * - 文字 OCR：PP-OCRv6 / PP-OCRv5，返回带坐标的文本行；
 * - OCR VLM：PaddleOCR-VL 系列，返回 Markdown 文档；
 * - OCR 结构：PP-StructureV3，返回版面块（parsing_res_list）。
 *
 * 同一个服务实例通过 `model` 选择一个产线，能力随之确定。
 */

import { PADDLEOCR_ORIGIN } from "../config/apiConstants";

// 官方异步任务接口地址（AI Studio 免费层）。
export const PADDLEOCR_JOB_URL = `${PADDLEOCR_ORIGIN}/api/v2/ocr/jobs`;

// 新实例默认使用最新的通用文字 OCR 模型。
export const DEFAULT_PADDLEOCR_MODEL = "PP-OCRv6";

/**
 * 模型分组。`capability` 是选中该模型后实际暴露的能力。
 * 分组标签由 UI 通过 i18n 渲染，`label` 仅作为回退文本。
 */
export const PADDLEOCR_MODEL_GROUPS = [
  {
    id: "text",
    label: "OCR 文字",
    labelKey: "paddleocr_group_text",
    capability: "recognizeText",
    models: ["PP-OCRv6", "PP-OCRv5"],
  },
  {
    id: "document",
    label: "OCR VLM",
    labelKey: "paddleocr_group_document",
    capability: "parseImage",
    models: ["PaddleOCR-VL-1.6", "PaddleOCR-VL-1.5", "PaddleOCR-VL"],
  },
  {
    id: "structure",
    label: "OCR 结构",
    labelKey: "paddleocr_group_structure",
    capability: "analyzeLayout",
    models: ["PP-StructureV3"],
  },
];

// 扁平化的模型列表，便于按模型名查询所属产线。
export const PADDLEOCR_MODELS = PADDLEOCR_MODEL_GROUPS.flatMap((group) =>
  group.models.map((model) => ({
    model,
    groupId: group.id,
    capability: group.capability,
  }))
);

/**
 * 查询模型所属产线；未知模型回退到默认模型，避免旧配置导致服务不可用。
 * @param {string} [model] 模型名
 * @returns {{model: string, groupId: string, capability: string}}
 */
export function paddleOcrModelInfo(model) {
  return (
    PADDLEOCR_MODELS.find((item) => item.model === model) ||
    PADDLEOCR_MODELS.find((item) => item.model === DEFAULT_PADDLEOCR_MODEL)
  );
}

/** 当前模型对应的 Provider 能力名。 */
export function paddleOcrCapability(model) {
  return paddleOcrModelInfo(model).capability;
}

/**
 * 组装官方 API 的 optionalPayload。
 * 不同产线支持的开关不同：文字 OCR 控制方向/矫正，文档解析控制图表/表格/公式识别。
 * @param {Object} api 服务实例配置
 * @returns {Object} optionalPayload
 */
export function paddleOcrOptionalPayload(api = {}) {
  const { groupId } = paddleOcrModelInfo(api.model);
  const orientation = {
    useDocOrientationClassify: Boolean(api.paddleUseDocOrientationClassify),
    useDocUnwarping: Boolean(api.paddleUseDocUnwarping),
  };
  if (groupId === "text") {
    return {
      ...orientation,
      useTextlineOrientation: Boolean(api.paddleUseTextlineOrientation),
    };
  }
  if (groupId === "structure") {
    return {
      ...orientation,
      useChartRecognition: Boolean(api.paddleUseChartRecognition),
      useTableRecognition: api.paddleUseTableRecognition !== false,
      useFormulaRecognition: api.paddleUseFormulaRecognition !== false,
    };
  }
  // VLM 文档解析：官方示例使用 useChartRecognition。
  return {
    ...orientation,
    useChartRecognition: Boolean(api.paddleUseChartRecognition),
  };
}
