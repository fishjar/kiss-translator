/**
 * PaddleOCR-VL 1.6 (ONNX) 图像预处理与多模态 Embedding 拼接纯函数工具
 *
 * 严格对齐 `iaa2005/PaddleOCR-VL-1.6-ONNX` 与 `PaddleOCRVLImageProcessor._preprocess`：
 * - patch_size = 14, merge_size = 2, factor = 28
 * - image_mean = [0.5, 0.5, 0.5], image_std = [0.5, 0.5, 0.5] -> (pixel / 127.5 - 1.0)
 * - pixel_values 形状: [1, grid_h * grid_w, 3, 14, 14]，按 (gh, gw, c, py, px) 展平
 * - image_grid_thw 形状: [1, 3] = [1, grid_h, grid_w]
 */

export const PADDLE_OCR_VL_PATCH_SIZE = 14;
export const PADDLE_OCR_VL_MERGE_SIZE = 2;
export const PADDLE_OCR_VL_FACTOR = PADDLE_OCR_VL_PATCH_SIZE * PADDLE_OCR_VL_MERGE_SIZE; // 28
/** 默认最小像素：28 * 28 * 130 = 101,920 */
export const PADDLE_OCR_VL_MIN_PIXELS = 28 * 28 * 130;
/**
 * 默认最大像素：28 * 28 * 320 = 250,880（约 320 个合并视觉 token）
 * 参考 iaa2005/PaddleOCR-VL-1.6-ONNX 官方说明：INT8 量化模型控制在 ~200-350 视觉 token 时精度与速度最佳
 */
export const PADDLE_OCR_VL_MAX_PIXELS = 28 * 28 * 320;
export const PADDLE_OCR_VL_IMAGE_TOKEN_ID = 100295;
export const PADDLE_OCR_VL_BOS_TOKEN_ID = 1;
export const PADDLE_OCR_VL_EOS_TOKEN_ID = 2;
export const PADDLE_OCR_VL_HIDDEN_SIZE = 1024;

export interface PaddleOcrVlResizeResult {
  width: number;
  height: number;
  gridH: number;
  gridW: number;
  numPatches: number;
  numMergedTokens: number;
}

/**
 * 严格对齐 `image_processing_paddleocr_vl.py` 的 `smart_resize`：
 * 1. 宽高保持为 `factor` (28) 的整数倍
 * 2. 总像素控制在 `[minPixels, maxPixels]` 区间内
 */
export function smartResizePaddleOcrVl(
  height: number,
  width: number,
  factor: number = PADDLE_OCR_VL_FACTOR,
  minPixels: number = PADDLE_OCR_VL_MIN_PIXELS,
  maxPixels: number = PADDLE_OCR_VL_MAX_PIXELS
): PaddleOcrVlResizeResult {
  const safeH = Math.max(factor, height);
  const safeW = Math.max(factor, width);

  let hBar = Math.max(factor, Math.round(safeH / factor) * factor);
  let wBar = Math.max(factor, Math.round(safeW / factor) * factor);

  if (hBar * wBar > maxPixels) {
    const beta = Math.sqrt((safeH * safeW) / maxPixels);
    hBar = Math.max(factor, Math.floor(safeH / beta / factor) * factor);
    wBar = Math.max(factor, Math.floor(safeW / beta / factor) * factor);
  } else if (hBar * wBar < minPixels) {
    const beta = Math.sqrt(minPixels / (safeH * safeW));
    hBar = Math.max(factor, Math.ceil((safeH * beta) / factor) * factor);
    wBar = Math.max(factor, Math.ceil((safeW * beta) / factor) * factor);
  }

  const gridH = hBar / PADDLE_OCR_VL_PATCH_SIZE;
  const gridW = wBar / PADDLE_OCR_VL_PATCH_SIZE;
  const numPatches = gridH * gridW;
  const numMergedTokens = numPatches / (PADDLE_OCR_VL_MERGE_SIZE * PADDLE_OCR_VL_MERGE_SIZE);

  return {
    width: wBar,
    height: hBar,
    gridH,
    gridW,
    numPatches,
    numMergedTokens,
  };
}

export interface PaddleOcrVlPatchesResult {
  pixelValues: Float32Array;
  dims: [number, number, number, number, number];
  gridThw: [number, number, number];
  numMergedTokens: number;
}

/**
 * 将 RGBA 像素数组切分为 `vision_encoder_q8.onnx` 所需的 `pixel_values` 张量：
 * - 输入图像尺寸需已按 `smartResizePaddleOcrVl` 缩放至 28 的整数倍
 * - 输出形状: `[1, gridH * gridW, 3, 14, 14]`
 */
export function buildPaddleOcrVlPatches(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): PaddleOcrVlPatchesResult {
  if (width % PADDLE_OCR_VL_FACTOR !== 0 || height % PADDLE_OCR_VL_FACTOR !== 0) {
    throw new Error(
      `PaddleOCR-VL 图像尺寸必须为 ${PADDLE_OCR_VL_FACTOR} 的整数倍，当前为 ${width}x${height}`
    );
  }

  const patchSize = PADDLE_OCR_VL_PATCH_SIZE;
  const gridH = height / patchSize;
  const gridW = width / patchSize;
  const numPatches = gridH * gridW;
  const numMergedTokens = numPatches / (PADDLE_OCR_VL_MERGE_SIZE * PADDLE_OCR_VL_MERGE_SIZE);
  const patchArea = patchSize * patchSize; // 196
  const patchVolume = 3 * patchArea; // 588

  const pixelValues = new Float32Array(numPatches * patchVolume);

  let patchIdx = 0;
  for (let gh = 0; gh < gridH; gh++) {
    const baseY = gh * patchSize;
    for (let gw = 0; gw < gridW; gw++) {
      const baseX = gw * patchSize;
      const patchOffset = patchIdx * patchVolume;
      const rOffset = patchOffset;
      const gOffset = patchOffset + patchArea;
      const bOffset = patchOffset + 2 * patchArea;

      for (let py = 0; py < patchSize; py++) {
        const rowOffset = (baseY + py) * width + baseX;
        const localRow = py * patchSize;
        for (let px = 0; px < patchSize; px++) {
          const rgbaIdx = (rowOffset + px) * 4;
          const localIdx = localRow + px;
          pixelValues[rOffset + localIdx] = (rgba[rgbaIdx] ?? 0) / 127.5 - 1.0;
          pixelValues[gOffset + localIdx] = (rgba[rgbaIdx + 1] ?? 0) / 127.5 - 1.0;
          pixelValues[bOffset + localIdx] = (rgba[rgbaIdx + 2] ?? 0) / 127.5 - 1.0;
        }
      }
      patchIdx++;
    }
  }

  return {
    pixelValues,
    dims: [1, numPatches, 3, patchSize, patchSize],
    gridThw: [1, gridH, gridW],
    numMergedTokens,
  };
}

/**
 * 构造 PaddleOCR-VL 1.6 的对话提示词字符串
 */
export function buildPaddleOcrVlPrompt(taskPrompt: string, numMergedTokens: number): string {
  const placeholders = "<|IMAGE_PLACEHOLDER|>".repeat(numMergedTokens);
  return `<|begin_of_sentence|>User: <|IMAGE_START|>${placeholders}<|IMAGE_END|>${taskPrompt}\nAssistant:\n`;
}

/**
 * 将 `vision_encoder_q8.onnx` 输出的 `image_embeds` 替换进 `embedding.onnx` 输出的 `inputs_embeds` 中
 * 对应 `<|IMAGE_PLACEHOLDER|>` (token ID = 100295) 的位置
 */
export function splicePaddleOcrVlImageEmbeds(
  textEmbeds: Float32Array,
  inputIds: ArrayLike<number | bigint>,
  imageEmbeds: Float32Array,
  imageTokenId: number = PADDLE_OCR_VL_IMAGE_TOKEN_ID,
  hiddenSize: number = PADDLE_OCR_VL_HIDDEN_SIZE
): Float32Array {
  const out = new Float32Array(textEmbeds);
  const seqLen = inputIds.length;
  const totalImageTokens = Math.floor(imageEmbeds.length / hiddenSize);
  let imgIdx = 0;

  for (let i = 0; i < seqLen; i++) {
    if (Number(inputIds[i]) === imageTokenId) {
      if (imgIdx >= totalImageTokens) {
        throw new Error(
          `PaddleOCR-VL 视觉占位符数量超过 image_embeds 行数 (${totalImageTokens})`
        );
      }
      const srcOffset = imgIdx * hiddenSize;
      const dstOffset = i * hiddenSize;
      out.set(imageEmbeds.subarray(srcOffset, srcOffset + hiddenSize), dstOffset);
      imgIdx++;
    }
  }

  return out;
}
