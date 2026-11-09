import { describe, expect, it } from "vitest";
import { ASR_LANGUAGES, mapAsrLanguage } from "../asrLanguages";

describe("mapAsrLanguage", () => {
  it("zh-hans → chinese + t2s", () => {
    expect(mapAsrLanguage("zh-hans")).toEqual({ whisper: "chinese", convert: "t2s" });
  });

  it("zh-hant → chinese + s2t", () => {
    expect(mapAsrLanguage("zh-hant")).toEqual({ whisper: "chinese", convert: "s2t" });
  });

  it("english 直接透传", () => {
    expect(mapAsrLanguage("english")).toEqual({ whisper: "english" });
  });

  it("其它 whisper 语言码直接透传", () => {
    expect(mapAsrLanguage("japanese")).toEqual({ whisper: "japanese" });
    expect(mapAsrLanguage("korean")).toEqual({ whisper: "korean" });
  });

  it("空值 → 自动检测（whisper 为 null）", () => {
    expect(mapAsrLanguage("")).toEqual({ whisper: null });
  });

  it.each([
    ["en-US", "en"],
    ["en-us", "en"],
    [" en_GB ", "en"],
    ["ja-JP", "ja"],
    ["pt-BR", "pt"],
    ["de-DE", "de"],
    ["es-419", "es"],
    ["sr-Latn-RS", "sr"],
    ["iw-IL", "he"],
    ["in-ID", "id"],
    ["ji", "yi"],
    ["jv-ID", "jw"],
    ["fil-PH", "tl"],
    ["nb-NO", "no"],
    ["nn-NO", "nn"],
    ["haw-US", "haw"],
    ["lao", "lo"],
  ])("视频语言 %s 映射为 Whisper 支持的 %s", (input, whisper) => {
    expect(mapAsrLanguage(input)).toEqual({ whisper });
  });

  it.each(["auto", "AUTO", "   ", "und", "mul", "zxx", "default", "xx-XX", "yue-HK", "zh-yue", "cantonese"])("%s 使用自动检测", (input) => {
    expect(mapAsrLanguage(input)).toEqual({ whisper: null });
  });

  it.each([
    ["zh-CN", "t2s"],
    ["zh-SG", "t2s"],
    ["zh-Hans-CN", "t2s"],
    ["zh-TW", "s2t"],
    ["zh-HK", "s2t"],
    ["zh-MO", "s2t"],
    ["zh-Hant-TW", "s2t"],
    ["zh-Hans-HK", "t2s"],
    ["zh-Hant-CN", "s2t"],
    ["zh-TW-u-nu-hanidec", "s2t"],
    ["cmn-Hans-CN", "t2s"],
    ["zh-cmn-Hant-TW", "s2t"],
  ])("视频语言 %s 保留中文简繁转换", (input, convert) => {
    expect(mapAsrLanguage(input)).toEqual({ whisper: "chinese", convert });
  });
});

describe("ASR_LANGUAGES", () => {
  it("value 唯一且覆盖常用语言", () => {
    const values = ASR_LANGUAGES.map((l) => l.value);
    expect(new Set(values).size).toBe(values.length);
    for (const v of ["zh-hans", "zh-hant", "english", "japanese", "korean"]) {
      expect(values).toContain(v);
    }
  });

  it("每个选项都有非空 label", () => {
    for (const l of ASR_LANGUAGES) {
      expect(l.label.length).toBeGreaterThan(0);
    }
  });
});
