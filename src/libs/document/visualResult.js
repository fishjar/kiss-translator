import { hasReusableImageTranslation } from "../../providers/imageResult";

export function visualMarkdown(text = "", format = "text") {
  return format === "markdown"
    ? text
    : text.replace(/([\\`*_{}[\]<>#+!|])/g, "\\$1");
}

// A visual response is an aligned group, not a pair of parallel Markdown ASTs.
export function visualDocumentBlocks(
  result,
  { id, page, bbox, type = "paragraph", sourceFallback = "", fingerprint }
) {
  const sx = (bbox[2] - bbox[0]) / result.imageSize.width;
  const sy = (bbox[3] - bbox[1]) / result.imageSize.height;
  return result.items.map((item, index) => {
    const poly = item.regionPoly?.map(([x, y]) => [
      Math.max(bbox[0], Math.min(bbox[2], bbox[0] + x * sx)),
      Math.max(bbox[1], Math.min(bbox[3], bbox[1] + y * sy)),
    ]);
    const bounds =
      poly?.reduce(
        ([l, t, r, b], [x, y]) => [
          Math.min(l, x),
          Math.min(t, y),
          Math.max(r, x),
          Math.max(b, y),
        ],
        [Infinity, Infinity, -Infinity, -Infinity]
      ) || bbox;
    const ready = hasReusableImageTranslation(item, item.translationLanguage);
    return {
      id: `${id}-${item.id || index}`,
      type: item.type || type,
      source: "vision",
      text: item.text || "",
      raw: item.text
        ? visualMarkdown(item.text, item.format || result.format)
        : sourceFallback,
      ast: { type: "root", children: [] },
      targetRaw: ready
        ? visualMarkdown(
            item.translation,
            result.translation?.format || item.format || result.format
          )
        : undefined,
      status: ready ? "done" : item.error ? "error" : "idle",
      error: item.error,
      fragments: [{ page, bbox: bounds, lineIds: [] }],
      bbox: bounds,
      translationReady: true,
      visualResult: {
        ...item,
        format: item.format || result.format,
        fingerprint,
        sourceFallback,
      },
    };
  });
}
