import { runtimeHost } from "../localAi/runtime/runtimeHostAdapter";
import { resolveModelTarget } from "../localAi/core/modelTarget";
import { localHandlers } from "./local";
import { createAssetStore } from "../providers/transport";
import { validateResult } from "../providers/validation";

jest.mock("../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn(), cancel: jest.fn() },
}));
jest.mock("../localAi/core/modelTarget", () => ({
  resolveModelTarget: jest.fn((service, target) => {
    if (target.modelRef !== service) throw new Error("INVALID_MODEL");
  }),
}));
jest.mock("../localAi/core/recorder", () => ({
  decodeAudioFile: jest.fn(async () => ({
    audio: new Float32Array([0.5]),
    sampleRate: 16000,
  })),
  resampleTo16k: (audio) => audio,
  audioToWavBlob: () => new Blob(["wav"], { type: "audio/wav" }),
}));
jest.mock("../localAi/fileOperations", () => ({
  recognizeFileImage: jest.fn(async () => ({
    text: "OCR",
    items: [
      {
        text: "OCR",
        poly: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
      },
    ],
  })),
}));
beforeEach(() => {
  require("../localAi/fileOperations").recognizeFileImage.mockResolvedValue({
    text: "OCR", items: [{ text: "OCR", poly: [[1, 2], [3, 4], [5, 6]] }],
  });
  runtimeHost.request.mockReset();
  resolveModelTarget.mockImplementation((service, target) => {
    if (target.modelRef !== service) throw new Error("INVALID_MODEL");
  });
});
const context = () => ({
  requestId: "native-local-test",
  signal: new AbortController().signal,
  emit: jest.fn(async () => {}),
  assets: createAssetStore(),
});
test("local image recognition forwards refresh to the shared OCR/VLM adapter", async () => {
  const { recognizeFileImage } = require("../localAi/fileOperations");
  recognizeFileImage.mockResolvedValue({ text: "fresh", items: [] });
  const ctx = context(), image = ctx.assets.put(new Blob(["image"]));
  await localHandlers.recognizeText({ image, cacheMode: "refresh" }, { modelRef: "ocr" }, ctx);
  expect(recognizeFileImage).toHaveBeenCalledWith(expect.any(Blob), expect.objectContaining({ cacheMode: "refresh" }), ctx.signal);
});

test("local chat reuses the shared runtime request with task cancellation and explicit model", async () => {
  const ctx = context();
  runtimeHost.request.mockResolvedValue({ text: "answer" });
  await expect(
    localHandlers.chat(
      { messages: [{ role: "user", content: "hello" }] },
      { modelRef: "llm", maxTokens: 42 },
      ctx
    )
  ).resolves.toEqual({ text: "answer", reasoning: "" });
  expect(runtimeHost.request).toHaveBeenCalledWith(
    expect.objectContaining({
      service: "llm",
      method: "chat",
      payload: expect.objectContaining({ modelRef: "llm", maxTokens: 42 }),
    }),
    expect.objectContaining({ signal: ctx.signal })
  );
  await expect(
    localHandlers.chat(
      { messages: [{ role: "user", content: [{ type: "image" }] }] },
      { modelRef: "llm" },
      ctx
    )
  ).rejects.toMatchObject({ code: "MODALITY_UNSUPPORTED" });
});

test("local audio/decision/layout preserve real data rather than fabricate timestamps or coordinates", async () => {
  const ctx = context();
  const audio = ctx.assets.put(new Blob(["input"], { type: "audio/wav" }));
  runtimeHost.request.mockResolvedValueOnce({
    segments: [{ text: "hello", start: 2, end: 3 }],
  });
  await expect(
    localHandlers.transcribe({ audio }, { modelRef: "asr" }, ctx)
  ).resolves.toEqual({
    text: "hello",
    segments: [{ text: "hello", start: 2, end: 3 }],
  });
  runtimeHost.request.mockResolvedValueOnce({
    audio: new Float32Array([0.5]),
    sampleRate: 16000,
  });
  const speech = await localHandlers.synthesizeSpeech(
    { text: "hello", voice: "voice", speed: 1.2 },
    { modelRef: "tts" },
    ctx
  );
  expect(ctx.assets.get(speech.audio).type).toBe("audio/wav");
  const image = ctx.assets.put(new Blob(["image"], { type: "image/png" }));
  runtimeHost.request.mockResolvedValueOnce({
    regions: [
      {
        type: "text",
        polygon: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        order: 0,
      },
    ],
  });
  await expect(
    localHandlers.analyzeLayout({ image }, { modelRef: "doc" }, ctx)
  ).resolves.toEqual({
    regions: [
      {
        type: "text",
        poly: [
          [1, 2],
          [3, 4],
          [5, 6],
        ],
        order: 0,
      },
    ],
  });
  const decision = { answers: { choice: "yes" }, model: "model", usage: {} };
  runtimeHost.request.mockResolvedValueOnce(decision);
  await expect(
    localHandlers.evaluate(
      { state: "state", questions: {} },
      { modelRef: "decision" },
      ctx
    )
  ).resolves.toBe(decision);
  await expect(
    localHandlers.evaluate(
      { state: "state", questions: {} },
      { modelRef: "llm" },
      ctx
    )
  ).rejects.toThrow("INVALID_MODEL");
});

test("local OCR retains actual polygons and cancelled inference is not successful output", async () => {
  const ctx = context();
  const image = ctx.assets.put(new Blob(["image"]));
  const result = await localHandlers.recognizeText(
    { image },
    { modelRef: "ocr" },
    ctx
  );
  expect(result.items[0].poly).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
  ]);
  runtimeHost.request.mockResolvedValue({ aborted: true, text: "partial" });
  await expect(
    localHandlers.chat(
      { messages: [{ role: "user", content: "hello" }] },
      { modelRef: "llm" },
      ctx
    )
  ).rejects.toMatchObject({ code: "REQUEST_CANCELLED" });
});

test("PaddleOCR items are adapted to the provider contract without losing coordinates", async () => {
  const { recognizeFileImage } = require("../localAi/fileOperations");
  const poly = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const items = [{ text: "first", poly }, { text: "second", poly }];
  recognizeFileImage.mockResolvedValueOnce({ items, totalMs: 42 });
  const ctx = context();
  const input = { image: ctx.assets.put(new Blob(["image"])) };
  const result = await localHandlers.recognizeText(input, { modelRef: "ocr" }, ctx);
  expect(result).toMatchObject({ text: "first\nsecond", format: "text", totalMs: 42 });
  expect(result.items).toBe(items);
  expect(validateResult("recognizeText", result, input, { coordinates: true })).toBe(result);
  expect(() => validateResult("recognizeText", {
    ...result, items: [{ text: "first", poly: [[0, 0], [1, 1], [2, 2]] }],
  }, input, { coordinates: true })).toThrow("OCR blocks");

  recognizeFileImage.mockResolvedValueOnce({ items: [] });
  const empty = await localHandlers.recognizeText(input, { modelRef: "ocr" }, ctx);
  expect(empty.text).toBe("");
  expect(() => validateResult("recognizeText", empty, input, { coordinates: true })).toThrow("coordinates");

  recognizeFileImage.mockResolvedValueOnce({ text: "# Original\n", items, isVlm: true });
  const vlm = await localHandlers.parseImage(input, { modelRef: "glm-ocr-onnx-q4" }, ctx);
  expect(vlm.text).toBe("# Original\n");
  expect(vlm.format).toBe("markdown");
});

test("local VLM uses official task prompts unless explicitly overridden", async () => {
  const { recognizeFileImage } = require("../localAi/fileOperations");
  recognizeFileImage.mockResolvedValue({ text: "parsed", isVlm: true });
  const ctx = context();
  const image = ctx.assets.put(new Blob(["image"]));
  await localHandlers.parseImage({ image, mode: "formula" }, { modelRef: "glm-ocr-onnx-q4" }, ctx);
  expect(recognizeFileImage.mock.calls.at(-1)[1].prompt).toBe("Formula Recognition:");
  await localHandlers.parseImage({ image, mode: "table", prompt: "custom task" }, { modelRef: "glm-ocr-onnx-q4" }, ctx);
  expect(recognizeFileImage.mock.calls.at(-1)[1].prompt).toBe("custom task");
});
