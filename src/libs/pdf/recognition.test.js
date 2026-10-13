import { documentRecognitionSelection, documentOcrBlocks } from "./recognition";

test("document and structured tasks use only their explicit selected service", () => {
  const ocr = { apiSlug: "ocr", capability: "recognizeText" };
  expect(documentRecognitionSelection("doc", ocr, "vlm")).toBe(ocr);
  expect(documentRecognitionSelection("table", ocr, "vlm")).toEqual({
    apiSlug: "vlm",
    capability: "parseImage",
  });
  expect(() => documentRecognitionSelection("doc", null, "vlm")).toThrow(
    "请选择文本识别服务"
  );
  expect(() => documentRecognitionSelection("formula", ocr, "")).toThrow(
    "请选择支持当前任务"
  );
});

test("OCR crop pixels map to rotated page viewport and adjacent lines form paragraphs", () => {
  const result = {
    imageSize: { width: 200, height: 400 },
    items: [
      {
        text: "second",
        poly: [
          [20, 60],
          [180, 60],
          [180, 80],
          [20, 80],
        ],
      },
      {
        text: "first",
        poly: [
          [20, 20],
          [180, 20],
          [180, 40],
          [20, 40],
        ],
      },
    ],
  };
  const blocks = documentOcrBlocks(result, [100, 200, 200, 400], 3, "region");
  expect(blocks).toHaveLength(2);
  expect(blocks[0].text).toBe("first");
  expect(blocks[0].fragments[0]).toEqual({
    page: 3,
    bbox: [110, 210, 190, 220],
    lineIds: [],
  });
  result.items[0].poly = [
    [20, 44],
    [180, 44],
    [180, 64],
    [20, 64],
  ];
  expect(
    documentOcrBlocks(result, [100, 200, 200, 400], 3, "region")[0].text
  ).toBe("first\nsecond");
});

test("text-only VLM and partial OCR cannot fabricate line positions", () => {
  expect(
    documentOcrBlocks(
      { text: "text", items: [{ text: "text", poly: null }] },
      [0, 0, 100, 100],
      1,
      "r"
    )
  ).toBeNull();
});
