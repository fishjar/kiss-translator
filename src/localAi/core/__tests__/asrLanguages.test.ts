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
