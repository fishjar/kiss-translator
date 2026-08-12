import { isSameTranslationLanguage, normalizeLanguageCode } from "./language";

describe("normalizeLanguageCode", () => {
  test.each([
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-Hans", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["ZH_hant", "zh-TW"],
  ])("normalizes Chinese variant %s to %s", (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected);
  });

  test.each([
    ["en-US", "en"],
    ["en_GB", "en"],
    ["pt-BR", "pt"],
    ["pt-PT", "pt"],
    ["no", "nb"],
    ["no-NO", "nb"],
    ["NB-no", "nb"],
  ])("falls back from %s to supported internal code %s", (input, expected) => {
    expect(normalizeLanguageCode(input)).toBe(expected);
  });

  test.each(["", "und", "xx-US", "zh-US", null, undefined])(
    "rejects unsupported language code %p",
    (input) => {
      expect(normalizeLanguageCode(input)).toBe("");
    }
  );
});

describe("isSameTranslationLanguage", () => {
  test.each([
    ["zh-Hans", "zh-CN", true],
    ["en-US", "en", true],
    ["pt-PT", "pt", true],
    ["zh-Hant", "zh-CN", false],
    ["zh-TW", "zh-CN", false],
    ["und", "en", false],
  ])("compares %s and %s as %s", (source, target, expected) => {
    expect(isSameTranslationLanguage(source, target)).toBe(expected);
  });

  test.each([
    ["zh-Hant", "zh-CN"],
    ["zh-TW", "zh-CN"],
  ])(
    "treats %s and %s as the same family when variants are disabled",
    (source, target) => {
      expect(isSameTranslationLanguage(source, target, false)).toBe(true);
    }
  );
});
