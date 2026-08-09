import {
  detectLangFast,
  isPureNumberText,
  normalizeZhLang,
} from "./detectFast";

describe("isPureNumberText", () => {
  test("accepts plain numbers of any length", () => {
    expect(isPureNumberText("12345")).toBe(true);
    expect(isPureNumberText("42")).toBe(true);
  });

  test("accepts numbers with separators and whitespace", () => {
    expect(isPureNumberText("3.14")).toBe(true);
    expect(isPureNumberText("1,000,000")).toBe(true);
    expect(isPureNumberText("2024-07-31")).toBe(true);
    expect(isPureNumberText("50%")).toBe(true);
    expect(isPureNumberText(" 123 ")).toBe(true);
  });

  test("rejects mixed content", () => {
    expect(isPureNumberText("abc123")).toBe(false);
    expect(isPureNumberText("2024年")).toBe(false);
    expect(isPureNumberText("")).toBe(false);
    expect(isPureNumberText("   ")).toBe(false);
  });
});

describe("normalizeZhLang", () => {
  test("merges simplified and traditional Chinese", () => {
    expect(normalizeZhLang("zh-CN")).toBe("zh");
    expect(normalizeZhLang("zh-TW")).toBe("zh");
    expect(normalizeZhLang("zh")).toBe("zh");
  });

  test("keeps other languages unchanged", () => {
    expect(normalizeZhLang("en")).toBe("en");
    expect(normalizeZhLang("ja")).toBe("ja");
  });

  test("handles empty input", () => {
    expect(normalizeZhLang("")).toBe("");
    expect(normalizeZhLang(null)).toBe("");
    expect(normalizeZhLang(undefined)).toBe("");
  });
});

describe("detectLangFast", () => {
  test("detects simplified Chinese by charset", async () => {
    expect(
      await detectLangFast("这是一个用于测试划词翻译功能的中文句子。")
    ).toBe("zh-CN");
  });

  test("detects traditional Chinese by charset", async () => {
    expect(
      await detectLangFast("這是一個用於測試劃詞翻譯功能的繁體中文句子。")
    ).toBe("zh-TW");
  });

  test("detects Japanese by kana presence", async () => {
    expect(
      await detectLangFast("これは翻訳機能をテストするための日本語の文章です。")
    ).toBe("ja");
  });

  test("detects Korean by hangul", async () => {
    expect(
      await detectLangFast(
        "이것은 번역 기능을 테스트하기 위한 한국어 문장입니다."
      )
    ).toBe("ko");
  });

  test("detects Russian by cyrillic", async () => {
    expect(
      await detectLangFast("Это русское предложение для тестирования перевода.")
    ).toBe("ru");
  });

  test("returns empty string for empty or short input", async () => {
    expect(await detectLangFast("")).toBe("");
    expect(await detectLangFast("   ")).toBe("");
    expect(await detectLangFast(null)).toBe("");
  });
});
