import { describe, expect, it } from "vitest";
import {
  pinyinSyllableToPhonemes,
  splitTtsSentences,
  voiceStyleOffset,
  zhTextToPhonemes,
} from "../ttsG2p";

// Kokoro 模型词表（= tokenizer normalizer 保留字符集）
const KOKORO_VOCAB =
  "$;:,.!?\u2014\u2026\"()\u201c\u201d \u0303\u02a3\u02a5\u02a6\u02a8\u1d5d\uab67AIOQSTWY\u1d4a" +
  "abcdefghijklmnopqrstuvwxyz\u0251\u0250\u0252\u00e6\u03b2\u0254\u0255\u00e7\u0256\u00f0\u02a4" +
  "\u0259\u025a\u025b\u025c\u025f\u0261\u0265\u0268\u026a\u029d\u026f\u0270\u014b\u0273\u0272" +
  "\u0274\u00f8\u0278\u03b8\u0153\u0279\u027e\u027b\u0281\u027d\u0282\u0283\u0288\u02a7\u028a" +
  "\u028b\u028c\u0263\u0264\u03c7\u028e\u0292\u0294\u02c8\u02cc\u02d0\u02b0\u02b2\u2193\u2192" +
  "\u2197\u2198\u1d7b";

const vocabSet = new Set(KOKORO_VOCAB);

describe("pinyinSyllableToPhonemes", () => {
  it("基本音节：声母 + 韵母 + 声调箭头", () => {
    expect(pinyinSyllableToPhonemes("ni3")).toBe("ni\u2193"); // ni↓
    expect(pinyinSyllableToPhonemes("hao3")).toBe("xau\u2193"); // 好→xau↓
    expect(pinyinSyllableToPhonemes("yi4")).toBe("i\u2198"); // 零声母 yi→i
    expect(pinyinSyllableToPhonemes("bo1")).toBe("pwo\u2192"); // o 实读 wo，b→p
    expect(pinyinSyllableToPhonemes("wa1")).toBe("wa\u2192");
  });

  it("特殊音节：er / 自成音节 / 舌尖元音", () => {
    expect(pinyinSyllableToPhonemes("er2")).toBe("\u025a\u2197"); // 儿→ɚ
    expect(pinyinSyllableToPhonemes("n4")).toBe("n\u2198");
    expect(pinyinSyllableToPhonemes("zhi1")).toBe("\u0288\u0282\u0268\u2192"); // zhi→ʈʂɨ→
    expect(pinyinSyllableToPhonemes("zi1")).toBe("\u02a6\u0268\u2192"); // zi→ʦɨ→
  });

  it("ü 韵与 j/q/x 的 un→ün", () => {
    expect(pinyinSyllableToPhonemes("nü3")).toBe("ny\u2193");
    expect(pinyinSyllableToPhonemes("xue2")).toBe("\u0255\u0265e\u2197"); // x→ɕ
    expect(pinyinSyllableToPhonemes("jun1")).toBe("\u02a8y\u2192n");
  });

  it("短写韵母 iu/ui/un", () => {
    expect(pinyinSyllableToPhonemes("liu4")).toBe("ljou\u2198");
    expect(pinyinSyllableToPhonemes("shui4")).toBe("\u0282wei\u2198");
    // 声调落在韵腹 ə 上、韵尾 n 在后（与 misaki 参考一致）
    expect(pinyinSyllableToPhonemes("lun2")).toBe("lw\u0259\u2197n");
  });

  it("无法识别的音节返回空串", () => {
    expect(pinyinSyllableToPhonemes("hello")).toBe("");
    expect(pinyinSyllableToPhonemes("123")).toBe("");
  });
});

describe("zhTextToPhonemes", () => {
  it("整句转换", () => {
    expect(zhTextToPhonemes("你好")).toBe("ni\u2193 xau\u2193");
    expect(zhTextToPhonemes("我")).toBe("wo\u2193"); // 3 声 → ↓
  });

  it("一/不 变调由 pinyin-pro 处理", () => {
    expect(zhTextToPhonemes("一")).toBe("i\u2192"); // 单字一声
    // 不对 → bu2 dui4（不 在 4 声前变 2 声；d→t 不送气）
    expect(zhTextToPhonemes("不对")).toBe("pu\u2197 twei\u2198");
  });

  it("输出只含模型词表字符", () => {
    const text = "你好，我是KISS翻译插件。本地AI让翻译更自由！";
    const out = zhTextToPhonemes(text);
    expect(out.length).toBeGreaterThan(0);
    for (const ch of out) {
      expect(vocabSet.has(ch)).toBe(true);
    }
  });
});

describe("splitTtsSentences", () => {
  it("按中英文标点切分并保留标点", () => {
    expect(splitTtsSentences("你好。Hello! 世界")).toEqual([
      "你好。",
      "Hello!",
      "世界",
    ]);
  });

  it("换行与空白处理", () => {
    expect(splitTtsSentences("第一行\n第二行。")).toEqual(["第一行", "第二行。"]);
    expect(splitTtsSentences("  空  ")).toEqual(["空"]);
    expect(splitTtsSentences("")).toEqual([]);
  });
});

describe("voiceStyleOffset", () => {
  it("按 token 数定位音色表偏移", () => {
    expect(voiceStyleOffset(0)).toBe(0);
    expect(voiceStyleOffset(2)).toBe(0);
    expect(voiceStyleOffset(4)).toBe(512);
    expect(voiceStyleOffset(513)).toBe(509 * 256);
    expect(voiceStyleOffset(10000)).toBe(509 * 256);
  });
});
