import { describe, expect, it } from "vitest";
import {
  inferOnnxModelDtype,
  resolveOcrVlmPrompt,
  supportsOcrVlmTaskSwitch,
} from "../ocrVlmPrompts";

describe("ocrVlmPrompts", () => {
  it("resolves official GLM-OCR prompts by task mode", () => {
    expect(resolveOcrVlmPrompt("glm-ocr-onnx-q4", "doc")).toBe(
      "Text Recognition:"
    );
    expect(resolveOcrVlmPrompt("glm-ocr-onnx-q4", "table")).toBe(
      "Table Recognition:"
    );
    expect(resolveOcrVlmPrompt("glm-ocr-onnx-q4", "formula")).toBe(
      "Formula Recognition:"
    );
  });

  it("resolves official PaddleOCR-VL-1.6 prompts by task mode", () => {
    expect(resolveOcrVlmPrompt("paddleocr-vl-1.6-q4", "doc")).toBe("OCR:");
    expect(resolveOcrVlmPrompt("paddleocr-vl-1.6-q4", "table")).toBe(
      "Table Recognition:"
    );
    expect(resolveOcrVlmPrompt("paddleocr-vl-1.6-q4", "formula")).toBe(
      "Formula Recognition:"
    );
  });

  it("locks Unlimited-OCR to canonical document parsing prompt", () => {
    expect(supportsOcrVlmTaskSwitch("unlimited-ocr-iq2m")).toBe(false);
    expect(supportsOcrVlmTaskSwitch("glm-ocr-onnx-q4")).toBe(true);
    expect(supportsOcrVlmTaskSwitch("paddleocr-vl-1.6-q4")).toBe(true);
    expect(resolveOcrVlmPrompt("unlimited-ocr-iq2m", "doc")).toBe(
      "document parsing."
    );
    expect(resolveOcrVlmPrompt("unlimited-ocr-iq2m", "table")).toBe(
      "document parsing."
    );
  });

  it("infers ONNX dtype from model file paths", () => {
    expect(
      inferOnnxModelDtype([
        "config.json",
        "onnx/decoder_model_merged_q4.onnx",
        "onnx/vision_encoder_q4.onnx",
      ])
    ).toBe("q4");
    expect(inferOnnxModelDtype(["onnx/model_q4f16.onnx"])).toBe("q4f16");
  });
});
