import { hasCompleteCoordinates } from "../../fileTranslation/recognition";

export function documentRecognitionKey({
  recognitionService,
  visionServiceSlug,
  vlmPromptSlug,
  services = [],
}) {
  return JSON.stringify([
    "formula-v9",
    recognitionService,
    visionServiceSlug,
    vlmPromptSlug,
    services
      .filter((service) =>
        [recognitionService?.apiSlug, visionServiceSlug].includes(
          service.apiSlug
        )
      )
      .map((service) => [service.apiSlug, service.recognitionSignature]),
  ]);
}

export function documentRecognitionSelection(
  task,
  recognitionService,
  visionServiceSlug
) {
  const selection =
    task === "doc"
      ? recognitionService
      : visionServiceSlug
        ? { apiSlug: visionServiceSlug, capability: "parseImage" }
        : null;
  if (!selection?.apiSlug)
    throw new Error(
      task === "doc"
        ? "请选择文本识别服务（OCR / VLM）"
        : "请选择支持当前任务的表格/公式解析服务"
    );
  return selection;
}

/** Coordinates are relative to the uploaded crop; page boxes use the rotated viewport at scale 1. */
export function documentOcrBlocks(result, region, page, idPrefix) {
  if (!hasCompleteCoordinates(result.items || []) || !result.imageSize)
    return null;
  const { width, height } = result.imageSize;
  const sx = (region[2] - region[0]) / width;
  const sy = (region[3] - region[1]) / height;
  const lines = result.items
    .filter((item) => item.text.trim())
    .map((item) => {
      const points = item.poly.map(([x, y]) => [
        region[0] + x * sx,
        region[1] + y * sy,
      ]);
      return {
        text: item.text,
        bbox: points.reduce(
          ([left, top, right, bottom], [x, y]) => [
            Math.min(left, x),
            Math.min(top, y),
            Math.max(right, x),
            Math.max(bottom, y),
          ],
          [Infinity, Infinity, -Infinity, -Infinity]
        ),
      };
    })
    .sort((a, b) => {
      const tolerance =
        Math.min(a.bbox[3] - a.bbox[1], b.bbox[3] - b.bbox[1]) / 2;
      return Math.abs(a.bbox[1] - b.bbox[1]) <= tolerance
        ? a.bbox[0] - b.bbox[0]
        : a.bbox[1] - b.bbox[1];
    });
  const paragraphs = [];
  for (const line of lines) {
    const previous = paragraphs.at(-1);
    const last = previous?.at(-1);
    const lineHeight = line.bbox[3] - line.bbox[1];
    if (
      last &&
      line.bbox[1] >= last.bbox[3] - lineHeight / 2 &&
      line.bbox[1] - last.bbox[3] < lineHeight * 0.8 &&
      Math.abs(line.bbox[0] - last.bbox[0]) < lineHeight * 2
    )
      previous.push(line);
    else paragraphs.push([line]);
  }
  return paragraphs.map((paragraph, index) => {
    const bbox = paragraph.reduce(
      ([left, top, right, bottom], line) => [
        Math.min(left, line.bbox[0]),
        Math.min(top, line.bbox[1]),
        Math.max(right, line.bbox[2]),
        Math.max(bottom, line.bbox[3]),
      ],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    const text = paragraph.map((line) => line.text).join("\n");
    return {
      id: `${idPrefix}-ocr-${index}`,
      type: "paragraph",
      markdown: text,
      text,
      source: "ocr",
      bbox,
      fragments: [{ page, bbox, lineIds: [] }],
      spanIds: [],
      recognitionLines: paragraph,
    };
  });
}
