import { describe, expect, it } from "vitest";
import {
  decodeSenseVoiceCtc,
  extractSenseVoiceFeatures,
  LFR_FRAME_SECONDS,
  mapSenseVoiceLanguageId,
  parseAmMvn,
  splitAudioOnSilence,
} from "../senseVoice";
import { getSupportedAsrLanguages } from "../asrLanguages";

function makeDummyMvnText(): string {
  const zeros = new Array(560).fill("-10.5").join(" ");
  const ones = new Array(560).fill("0.15").join(" ");
  return `<Nnet>\n<Splice> 560 560\n[ 0 ]\n<AddShift> 560 560\n<LearnRateCoef> 0 [ ${zeros} ]\n<Rescale> 560 560\n<LearnRateCoef> 0 [ ${ones} ]\n</Nnet>`;
}

describe("senseVoice", () => {
  it("parseAmMvn 解析 560 维 AddShift 与 Rescale", () => {
    const cmvn = parseAmMvn(makeDummyMvnText());
    expect(cmvn.negMean.length).toBe(560);
    expect(cmvn.invStddev.length).toBe(560);
    expect(cmvn.negMean[0]).toBeCloseTo(-10.5, 5);
    expect(cmvn.invStddev[559]).toBeCloseTo(0.15, 5);
  });

  it("extractSenseVoiceFeatures 对 1 秒 16kHz 音频产出 17×560 维特征", () => {
    const cmvn = parseAmMvn(makeDummyMvnText());
    const audio = new Float32Array(16000);
    for (let i = 0; i < audio.length; i++) {
      audio[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / 16000);
    }
    // 16000 samples -> floor((16000 - 400) / 160) + 1 = 98 fbank frames
    // LFR(m=7, n=6) -> ceil(98 / 6) = 17 frames
    const { features, numFrames } = extractSenseVoiceFeatures(audio, cmvn);
    expect(numFrames).toBe(17);
    expect(features.length).toBe(17 * 560);
    for (let i = 0; i < features.length; i++) {
      expect(Number.isFinite(features[i])).toBe(true);
    }
  });

  it("mapSenseVoiceLanguageId 正确映射中/粤/英/日/韩与自动检测", () => {
    expect(mapSenseVoiceLanguageId("zh-hans")).toBe(3);
    expect(mapSenseVoiceLanguageId("zh-hant")).toBe(3);
    expect(mapSenseVoiceLanguageId("cantonese")).toBe(7);
    expect(mapSenseVoiceLanguageId("english")).toBe(4);
    expect(mapSenseVoiceLanguageId("japanese")).toBe(11);
    expect(mapSenseVoiceLanguageId("korean")).toBe(12);
    expect(mapSenseVoiceLanguageId("")).toBe(0);
  });

  it("decodeSenseVoiceCtc 剥离控制 token、合并子词并保留情感/事件徽章与精确帧时间", () => {
    const tokens = [
      "<unk>", // 0 (blank)
      "<s>", // 1
      "</s>", // 2
      "▁今", // 3
      "天", // 4
      "好", // 5
      "。", // 6
      "<|zh|>", // 7
      "<|HAPPY|>", // 8
      "<|Laughter|>", // 9
      "<|withitn|>", // 10
    ];
    const vocabSize = tokens.length;
    // 构造 10 帧输出：
    // t=0: <|zh|>, t=1: <|HAPPY|>, t=2: <|Laughter|>, t=3: <|withitn|>
    // t=4: ▁今, t=5: ▁今 (CTC 重复应合并), t=6: blank(0), t=7: 天, t=8: 好, t=9: 。
    const seq = [7, 8, 9, 10, 3, 3, 0, 4, 5, 6];
    const logits = new Float32Array(seq.length * vocabSize).fill(-10);
    for (let t = 0; t < seq.length; t++) {
      logits[t * vocabSize + seq[t]!] = 10;
    }

    const res = decodeSenseVoiceCtc(logits, seq.length, vocabSize, tokens, 0, 1.0);
    expect(res.detectedLanguage).toBe("zh");
    expect(res.emotion).toBe("😊 开心");
    expect(res.event).toBe("😄 笑声");
    expect(res.segments.length).toBe(1);
    const seg = res.segments[0]!;
    expect(seg.text).toBe("今天好。");
    expect(seg.emotion).toBe("😊 开心");
    expect(seg.event).toBe("😄 笑声");
    // t=4 对应声学帧 0 -> start = 0
    expect(seg.start).toBeCloseTo(0, 3);
    // t=9 对应声学帧 5 -> end = (5+1) * 0.06 = 0.36s
    expect(seg.end).toBeCloseTo(6 * LFR_FRAME_SECONDS, 3);
  });

  it("decodeSenseVoiceCtc 正确处理英文单词与无前缀 ITN 数字间的空格及子词拼接", () => {
    const tokens = [
      "<unk>",
      "▁with",
      "5",
      "0",
      "▁pieces",
      ".",
    ];
    const seq = [1, 2, 3, 4, 5];
    const logits = new Float32Array((seq.length + 4) * tokens.length).fill(-10);
    for (let i = 0; i < seq.length; i++) {
      logits[(i + 4) * tokens.length + seq[i]!] = 10;
    }
    const res = decodeSenseVoiceCtc(logits, seq.length + 4, tokens.length, tokens, 0, 2.0);
    expect(res.segments[0]?.text).toBe("with 50 pieces.");
    expect(res.segments[0]?.words?.map((w) => w.text)).toEqual([
      "with",
      "50",
      "pieces.",
    ]);
  });

  it("splitAudioOnSilence 在静音谷点切分超长音频", () => {
    const sr = 16000;
    // 30 秒音频，在第 20 秒处留 0.5 秒静音
    const audio = new Float32Array(30 * sr).fill(0.1);
    for (let i = 20 * sr; i < 20.5 * sr; i++) {
      audio[i] = 0;
    }
    const chunks = splitAudioOnSilence(audio, sr, 25, 15);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.startSample).toBe(0);
    // 切分点应落在 20s ~ 20.5s 静音区内
    expect(chunks[0]!.samples.length).toBeGreaterThanOrEqual(20 * sr);
    expect(chunks[0]!.samples.length).toBeLessThanOrEqual(20.5 * sr);
    expect(chunks[1]!.startSample).toBe(chunks[0]!.samples.length);
  });

  it("getSupportedAsrLanguages 对 SenseVoice 过滤出 6 种支持语言", () => {
    const list = getSupportedAsrLanguages({
      runtime: "onnx",
      multilingual: true,
      languages: ["zh", "yue", "en", "ja", "ko"],
    });
    expect(list.map((l) => l.value)).toEqual([
      "zh-hans",
      "zh-hant",
      "cantonese",
      "english",
      "japanese",
      "korean",
    ]);
  });
});
