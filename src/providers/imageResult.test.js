import {
  normalizeImageResult,
  imageResultItems,
  isSameImageTranslationLanguage,
} from "./imageResult";
import { buildTextTaskMessages, parseTextTaskResult } from "./sdk/textTasks";
import { validateResult } from "./validation";

const input = {
  protocol: "image-json",
  targetLanguage: "zh-CN",
  imageSize: { width: 100, height: 100 },
};
const translation = { text: "你好", targetLanguage: "zh-CN", format: "text" };
const region = {
  id: "a",
  type: "paragraph",
  order: 0,
  text: "Hello",
  poly: [
    [0, 0],
    [90, 0],
    [90, 40],
    [0, 40],
  ],
};

test.each(["zh_CN", "ZH_cn", "zh-CN"])(
  "accepts equivalent translation language %s without changing its declaration",
  (targetLanguage) => {
    const result = normalizeImageResult(
      { format: "text", translation: { ...translation, targetLanguage } },
      input
    );
    expect(result.translation.targetLanguage).toBe(targetLanguage);
    expect(isSameImageTranslationLanguage(targetLanguage, "zh-CN")).toBe(true);
  }
);

test.each(["zh-TW", "zh", "en-US"])(
  "does not collapse distinct language variants: %s",
  (language) => {
    expect(isSameImageTranslationLanguage(language, "zh-CN")).toBe(false);
  }
);

test("translation-only results never become original OCR text", () => {
  const result = parseTextTaskResult(
    "parseImage",
    JSON.stringify({ format: "text", translation }),
    input
  );
  expect(result.text).toBeUndefined();
  expect(imageResultItems(result)).toEqual([
    {
      text: "",
      translation: "你好",
      translationLanguage: "zh-CN",
      translationFromImage: true,
      poly: null,
    },
  ]);
  expect(() =>
    validateResult("recognizeText", { format: "text", translation }, {})
  ).toThrow();
});

test("legacy JSON-looking output remains original text", () => {
  const raw = JSON.stringify({ translation });
  expect(parseTextTaskResult("parseImage", raw, {}).text).toBe(raw);
  expect(() => parseTextTaskResult("parseImage", "not JSON", input)).toThrow(
    "JSON"
  );
});

test("invalid translation is discarded while original text remains usable", () => {
  const result = normalizeImageResult(
    {
      text: "Hello",
      format: "text",
      translation: { ...translation, targetLanguage: "ja" },
    },
    input
  );
  expect(result.translation).toBeUndefined();
  expect(result.text).toBe("Hello");
  expect(result.warnings).toHaveLength(1);
  expect(() =>
    normalizeImageResult(
      { format: "text", translation: { ...translation, targetLanguage: "ja" } },
      input
    )
  ).toThrow();
});

test("regions preserve identity and partial translations without inventing text coordinates", () => {
  const result = normalizeImageResult(
    {
      format: "text",
      layout: {
        regions: [
          { ...region, id: "b", order: 1, text: "World" },
          { ...region, translation: "你好" },
        ],
      },
    },
    input
  );
  expect(result.text).toBe("Hello\n\nWorld");
  expect(result.translation).toBeUndefined();
  const items = imageResultItems(result, input.targetLanguage);
  expect(items.map((i) => [i.id, i.translation, i.poly])).toEqual([
    ["a", "你好", null],
    ["b", "", null],
  ]);
});

test.each([
  [{ ...region }, { ...region }],
  [
    {
      ...region,
      poly: [
        [0, 0],
        [101, 0],
        [20, 20],
      ],
    },
  ],
  [
    {
      ...region,
      poly: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    },
  ],
])("invalid layout is ignored without discarding the document", (regions) => {
  const result = normalizeImageResult(
    { text: "Hello", format: "text", layout: { regions } },
    input
  );
  expect(result.layout).toBeUndefined();
  expect(result.text).toBe("Hello");
  expect(result.warnings).toHaveLength(1);
});

test("a mismatched document translation cannot be relabelled through its regions", () => {
  const result = normalizeImageResult(
    {
      text: "Hello",
      format: "text",
      translation: { ...translation, targetLanguage: "ja" },
      layout: { regions: [{ ...region, translation: "こんにちは" }] },
    },
    input
  );
  expect(result.translation).toBeUndefined();
  expect(result.layout.regions[0].translation).toBeUndefined();
});

test("structured messages include language, glossary and shared wire contract", () => {
  const messages = buildTextTaskMessages("parseImage", {
    ...input,
    prompt: "Translate into {{to}}. {{glossary}}",
    glossary: { Hello: "你好" },
  });
  const prompt = messages[0].content[0].text;
  expect(prompt).toContain("Translate into zh-CN");
  expect(prompt).toContain("Hello: 你好");
  expect(prompt).toContain("Never put translations in text");
});

test("an explicitly empty content region retains an actionable error beside valid regions", () => {
  const result = normalizeImageResult(
    {
      format: "text",
      layout: {
        regions: [region, { ...region, id: "empty", order: 1, text: "" }],
      },
    },
    input
  );
  expect(imageResultItems(result, "zh-CN")[1].error).toContain("original text");
});

test("coordinate-only layout preserves top-level source content", () => {
  const result = normalizeImageResult(
    {
      format: "markdown",
      text: "Whole source",
      layout: { regions: [{ ...region, text: undefined }] },
    },
    input
  );
  expect(result.layout.regions[0].poly).toEqual(region.poly);
  expect(imageResultItems(result, "zh-CN")).toEqual([
    { text: "Whole source", poly: null },
  ]);
});
