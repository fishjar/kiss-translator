import { describe, expect, it } from "vitest";
import { localWorkerUrl } from "../../runtime/workerUrls";

describe("packaged module worker addresses", () => {
  it("resolves entries from Chromium offscreen and Firefox background documents", () => {
    expect(localWorkerUrl("ocr", "chrome-extension://test/offscreen.html").href).toBe("chrome-extension://test/local-ai/ocr-worker.js");
    expect(localWorkerUrl("llm-onnx", "moz-extension://test/local-ai-background.html").href).toBe("moz-extension://test/local-ai/llm-onnx-worker.js");
  });
});
