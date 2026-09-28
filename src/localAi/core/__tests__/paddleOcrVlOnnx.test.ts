import { describe, it, expect } from "vitest";
import {
  smartResizePaddleOcrVl,
  buildPaddleOcrVlPatches,
  buildPaddleOcrVlPrompt,
  splicePaddleOcrVlImageEmbeds,
  PADDLE_OCR_VL_IMAGE_TOKEN_ID,
} from "../paddleOcrVlOnnx";

describe("paddleOcrVlOnnx", () => {
  it("smartResizePaddleOcrVl 应始终返回 28 的整数倍并限制在像素区间内", () => {
    const r1 = smartResizePaddleOcrVl(1920, 1080);
    expect(r1.width % 28).toBe(0);
    expect(r1.height % 28).toBe(0);
    expect(r1.width * r1.height).toBeLessThanOrEqual(28 * 28 * 320);
    expect(r1.numPatches).toBe(r1.gridH * r1.gridW);
    expect(r1.numMergedTokens).toBe(r1.numPatches / 4);

    // 小图自动放大到 minPixels 以上
    const r2 = smartResizePaddleOcrVl(64, 64);
    expect(r2.width % 28).toBe(0);
    expect(r2.height % 28).toBe(0);
    expect(r2.width * r2.height).toBeGreaterThanOrEqual(28 * 28 * 130);
  });

  it("buildPaddleOcrVlPatches 应生成 [1, P, 3, 14, 14] 并正确归一化到 [-1, 1]", () => {
    const width = 56; // gridW = 4
    const height = 28; // gridH = 2 -> P = 8, mergedTokens = 2
    const rgba = new Uint8ClampedArray(width * height * 4);
    // 第一个像素设为纯白 (255, 127.5->128, 0)
    rgba[0] = 255;
    rgba[1] = 0;
    rgba[2] = 128;
    rgba[3] = 255;

    const res = buildPaddleOcrVlPatches(rgba, width, height);
    expect(res.dims).toEqual([1, 8, 3, 14, 14]);
    expect(res.gridThw).toEqual([1, 2, 4]);
    expect(res.numMergedTokens).toBe(2);
    // R=255 -> 1.0, G=0 -> -1.0
    expect(res.pixelValues[0]).toBeCloseTo(1.0, 5);
    expect(res.pixelValues[196]).toBeCloseTo(-1.0, 5);
  });

  it("buildPaddleOcrVlPrompt 应生成包含指定数量占位符的标准对话模板", () => {
    const prompt = buildPaddleOcrVlPrompt("OCR:", 3);
    expect(prompt).toBe(
      "<|begin_of_sentence|>User: <|IMAGE_START|><|IMAGE_PLACEHOLDER|><|IMAGE_PLACEHOLDER|><|IMAGE_PLACEHOLDER|><|IMAGE_END|>OCR:\nAssistant:\n"
    );
  });

  it("splicePaddleOcrVlImageEmbeds 应精确替换 IMAGE_PLACEHOLDER 对应行", () => {
    const hiddenSize = 4;
    const inputIds = [1n, BigInt(PADDLE_OCR_VL_IMAGE_TOKEN_ID), BigInt(PADDLE_OCR_VL_IMAGE_TOKEN_ID), 2n];
    const textEmbeds = new Float32Array([
      1, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0,
      9, 9, 9, 9,
    ]);
    const imageEmbeds = new Float32Array([
      2, 3, 4, 5,
      6, 7, 8, 9,
    ]);

    const merged = splicePaddleOcrVlImageEmbeds(
      textEmbeds,
      inputIds,
      imageEmbeds,
      PADDLE_OCR_VL_IMAGE_TOKEN_ID,
      hiddenSize
    );
    expect(Array.from(merged)).toEqual([
      1, 1, 1, 1,
      2, 3, 4, 5,
      6, 7, 8, 9,
      9, 9, 9, 9,
    ]);
  });
});
