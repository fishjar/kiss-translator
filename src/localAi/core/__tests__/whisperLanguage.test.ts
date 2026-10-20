import { describe, expect, it, vi } from "vitest";
vi.mock("@huggingface/transformers", () => ({ Tensor: class {
  dispose = vi.fn();
  constructor(public type: string, public data: BigInt64Array, public dims: number[]) {}
} }));
import { detectWhisperLanguage, selectWhisperLanguage, resolveWhisperLanguage } from "../whisperLanguage";

const tokens = { "<|zh|>": 0, "<|en|>": 1, "<|ja|>": 2 };
describe("Whisper audio language detection", () => {
  it("explicit languages bypass detection, while English-only models reject Chinese", async () => {
    const pipeline = { processor: vi.fn() };
    const audio = new Float32Array(16000);
    expect(await resolveWhisperLanguage(pipeline, audio, "zh-hans", true)).toEqual({ whisper: "chinese", convert: "t2s" });
    expect(await resolveWhisperLanguage(pipeline, audio, "auto", false)).toEqual({ whisper: null, language: "en" });
    await expect(resolveWhisperLanguage(pipeline, audio, "zh", false)).rejects.toThrow("UNSUPPORTED_LANGUAGE");
    expect(pipeline.processor).not.toHaveBeenCalled();
  });
  it("compares only language logits and uses stable softmax", () => {
    const result = selectWhisperLanguage([1005, 1000, 999, 9999], tokens);
    expect(result.language).toBe("zh");
    expect(result.languageConfidence).toBeGreaterThan(0.98);
  });
  it("defers ambiguous or uniform predictions rather than defaulting to English", () => {
    expect(selectWhisperLanguage([1, 1, 1], tokens)).toEqual({ languagePending: true });
    expect(selectWhisperLanguage([2, 1, 0], tokens)).toEqual({ languagePending: true });
  });
  it("fails when the model has no language tokens", () => {
    expect(() => selectWhisperLanguage([1], {})).toThrow("LANGUAGE_DETECTION_UNAVAILABLE");
  });
  it("runs a single decoder position on at most 30 seconds and releases tensors", async () => {
    const features = { dispose: vi.fn() };
    const logits = { data: Float32Array.of(8, 0, 0), dispose: vi.fn() };
    const kv = { dispose: vi.fn() };
    const model = Object.assign(vi.fn(async (_input: any) => ({ logits, present: kv })), {
      config: { decoder_start_token_id: 50258 }, generation_config: { lang_to_id: tokens },
    });
    const processor = vi.fn(async (_audio: Float32Array) => ({ input_features: features }));
    expect((await detectWhisperLanguage({ model, processor }, new Float32Array(40 * 16000))).language).toBe("zh");
    expect(processor.mock.calls[0][0]).toHaveLength(30 * 16000);
    const input = model.mock.calls[0][0] as any;
    expect(input.decoder_input_ids.data).toEqual(BigInt64Array.of(50258n));
    expect(input.decoder_input_ids.dims).toEqual([1, 1]);
    expect(features.dispose).toHaveBeenCalledOnce();
    expect(logits.dispose).toHaveBeenCalledOnce();
    expect(kv.dispose).toHaveBeenCalledOnce();
  });
  it("releases input tensors when inference fails", async () => {
    const features = { dispose: vi.fn() };
    const model = Object.assign(vi.fn(async () => { throw Error("GPU failure"); }), {
      generation_config: { decoder_start_token_id: 1, lang_to_id: tokens },
    });
    await expect(detectWhisperLanguage({ model, processor: async () => ({ input_features: features }) }, new Float32Array(16000))).rejects.toThrow("GPU failure");
    expect(features.dispose).toHaveBeenCalledOnce();
  });
});
