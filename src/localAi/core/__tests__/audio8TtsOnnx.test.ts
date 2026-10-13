import { describe, it, expect } from "vitest";
import {
  cleanAudio8Text,
  formatAudio8ReferenceText,
  parseNpyInt64,
  buildAudio8Prompt,
  extractAudio8PromptColumn,
  sampleAudio8Semantic,
  updateSlowCacheSlice,
  updateFastCacheSlice,
  AUDIO8_SEMANTIC_BEGIN_ID,
  AUDIO8_IM_END_ID,
} from "../audio8TtsOnnx";
import {
  AUDIO8_PRESET_VOICES,
  getAudio8Voice,
} from "../audio8PresetVoices";

function createTestNpyInt64(rows: number, cols: number, values: bigint[]): Uint8Array {
  const dict = `{'descr': '<i8', 'fortran_order': False, 'shape': (${rows}, ${cols}), }`;
  const paddedLen = Math.ceil((10 + dict.length + 1) / 64) * 64 - 10;
  const headerStr = dict.padEnd(paddedLen - 1, " ") + "\n";
  const headerBytes = new TextEncoder().encode(headerStr);
  const total = 10 + headerBytes.length + rows * cols * 8;
  const buf = new Uint8Array(total);
  buf.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00], 0);
  const view = new DataView(buf.buffer);
  view.setUint16(8, headerBytes.length, true);
  buf.set(headerBytes, 10);
  const dataOffset = 10 + headerBytes.length;
  for (let i = 0; i < values.length; i++) {
    view.setBigInt64(dataOffset + i * 8, values[i] ?? 0n, true);
  }
  return buf;
}

describe("audio8TtsOnnx", () => {
  it("cleanAudio8Text 与 formatAudio8ReferenceText 应正确清理空白并添加 speaker 标签", () => {
    expect(cleanAudio8Text("中文\n换行\t与 English   空格")).toBe(
      "中文换行 与 English 空格"
    );
    expect(formatAudio8ReferenceText("测试参考文本")).toBe(
      "<|speaker:0|>测试参考文本"
    );
    expect(formatAudio8ReferenceText("<|speaker:2|>已有标签")).toBe(
      "<|speaker:2|>已有标签"
    );
  });

  it("parseNpyInt64 应正确解析 .npy int64 2D 矩阵", () => {
    const raw = createTestNpyInt64(2, 3, [10n, 20n, 30n, 40n, 50n, 60n]);
    const parsed = parseNpyInt64(raw);
    expect(parsed.shape).toEqual([2, 3]);
    expect(Array.from(parsed.data)).toEqual([10n, 20n, 30n, 40n, 50n, 60n]);
  });

  it("buildAudio8Prompt 与 extractAudio8PromptColumn 应正确构造 [1, 11, T] 输入矩阵", () => {
    const refCodes = {
      shape: [2, 2] as [number, number],
      data: new BigInt64Array([10n, 20n, 100n, 200n]),
    };
    const encodeText = (s: string) => [s.length];
    const { prompt, promptLen } = buildAudio8Prompt(
      encodeText,
      "你好",
      "参考",
      refCodes,
      65537,
      2
    );
    // prefixParts: 4 段 -> 4 token; refFrames: 2; suffixParts: 5 段 -> 5 token => promptLen = 11
    expect(promptLen).toBe(11);
    // 第 4 列（refStart=4）应为：[65537 + 10, 10, 100]
    const col4 = extractAudio8PromptColumn(prompt, promptLen, 4, 2);
    expect(Array.from(col4)).toEqual([65547n, 10n, 100n]);
  });

  it("sampleAudio8Semantic 在首帧应屏蔽 EOS，在非首帧允许采样 EOS", () => {
    const logits = new Float32Array(4097);
    logits.fill(-100);
    logits[4096] = 50; // EOS 权重最高
    logits[5] = 10; // 第 5 号语义码次高

    // 首帧（previous 为空）必须跳过 EOS，选中 index=5 -> 65537 + 5
    const first = sampleAudio8Semantic(
      logits,
      [],
      AUDIO8_SEMANTIC_BEGIN_ID,
      69632,
      AUDIO8_IM_END_ID,
      4096,
      0.1,
      0.9,
      10,
      () => 0.1
    );
    expect(first).toBe(AUDIO8_SEMANTIC_BEGIN_ID + 5);

    // 非首帧（previous 非空）允许采样 EOS -> AUDIO8_IM_END_ID (4096)
    const second = sampleAudio8Semantic(
      logits,
      [first],
      AUDIO8_SEMANTIC_BEGIN_ID,
      69632,
      AUDIO8_IM_END_ID,
      4096,
      0.1,
      0.9,
      10,
      () => 0.1
    );
    expect(second).toBe(AUDIO8_IM_END_ID);
  });

  it("updateSlowCacheSlice 与 updateFastCacheSlice 应准确写入目标 position 切片", () => {
    const slowCache = new Float32Array(2 * 1 * 2 * 4 * 2); // layers=2, heads=2, seq=4, dim=2
    const slowDelta = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]); // 4 slices * 2
    updateSlowCacheSlice(slowCache, slowDelta, 2, 2, 2, 4, 2);
    // slice 0 (layer 0, head 0), pos 2 -> offset (0*4 + 2)*2 = 4
    expect(Array.from(slowCache.subarray(4, 6))).toEqual([1, 2]);
    // slice 3 (layer 1, head 1), pos 2 -> offset (3*4 + 2)*2 = 28
    expect(Array.from(slowCache.subarray(28, 30))).toEqual([7, 8]);

    const fastCache = new Float32Array(1 * 2 * 3 * 2); // heads=2, codebooks=3, dim=2
    const fastDelta = new Float32Array([11, 12, 21, 22]);
    updateFastCacheSlice(fastCache, fastDelta, 1, 2, 3, 2);
    expect(Array.from(fastCache.subarray(2, 4))).toEqual([11, 12]);
    expect(Array.from(fastCache.subarray(8, 10))).toEqual([21, 22]);
  });

  it("AUDIO8_PRESET_VOICES 应包含男声/女声预设且 getAudio8Voice 能正确解码 10 通道 .npy 矩阵", () => {
    expect(AUDIO8_PRESET_VOICES.length).toBeGreaterThanOrEqual(4);
    for (const v of AUDIO8_PRESET_VOICES) {
      expect(v.id).toBeTruthy();
      expect(v.name).toBeTruthy();
      expect(v.referenceText).toBeTruthy();
      const loaded = getAudio8Voice(v.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.codes.shape[0]).toBe(10);
      expect(loaded!.codes.shape[1]).toBeGreaterThan(50);
      expect(loaded!.codes.data.length).toBe(loaded!.codes.shape[0] * loaded!.codes.shape[1]);
    }
    expect(getAudio8Voice("non_existent_voice")).toBeNull();
  });
});
