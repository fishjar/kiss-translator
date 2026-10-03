import {
  rawPageFromText,
  buildLines,
  paragraphBlocks,
  mergeAcrossPages,
  readingOrder,
} from "./structure";
/* eslint-disable no-restricted-globals -- Dedicated Web Worker scope */
self.onmessage = ({ data }) => {
  try {
    if (data.type === "page") {
      const raw = rawPageFromText(data.content, data.viewport, data.page),
        lines = buildLines(raw),
        blocks = paragraphBlocks(raw, lines, data.regions);
      self.postMessage({ id: data.id, result: { raw, lines, blocks } });
    } else if (data.type === "raw")
      self.postMessage({
        id: data.id,
        result: {
          blocks: paragraphBlocks(data.raw, buildLines(data.raw), data.regions),
        },
      });
    else if (data.type === "order") {
      const result = readingOrder(data.blocks, data.width, data.height);
      // Preserve geometric slots for unmatched blocks, order matched regions within their slots.
      const matched = result
        .filter((b) => b.order !== undefined)
        .sort((a, b) => a.order - b.order);
      let index = 0;
      self.postMessage({
        id: data.id,
        result: result.map((b) =>
          b.order !== undefined ? matched[index++] : b
        ),
      });
    } else if (data.type === "merge")
      self.postMessage({
        id: data.id,
        result: mergeAcrossPages(data.blocks, data.pages),
      });
  } catch (e) {
    self.postMessage({ id: data.id, error: e.message });
  }
};
