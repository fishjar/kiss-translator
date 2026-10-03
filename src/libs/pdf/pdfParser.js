import { PDFJS, renderPdfRegion } from "./pdfDocument";
import {
  parseDocumentMarkdown,
  tableCellsFromHtml,
} from "../document/markdown";
import { blockToMarkdown } from "./structure";
import { nativeTableRegions } from "./nativeTables";

const check = (signal) => {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
};
const centerInside = (box, region) => {
  const x = (box[0] + box[2]) / 2,
    y = (box[1] + box[3]) / 2;
  return x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3];
};
const matrix = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const transformRect = (m, b) => {
  const points = [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[0], b[3]],
    [b[2], b[3]],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
};

export function graphicsFromOperators(operators, viewport) {
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [],
    images = [],
    paths = [];
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i],
      args = operators.argsArray[i];
    if (op === PDFJS.OPS.save) stack.push([...ctm]);
    else if (op === PDFJS.OPS.restore) ctm = stack.pop() || ctm;
    else if (op === PDFJS.OPS.transform) ctm = matrix(ctm, args);
    else if (
      [PDFJS.OPS.paintImageXObject, PDFJS.OPS.paintInlineImageXObject].includes(
        op
      )
    )
      images.push({
        id: `image-op-${i}`,
        bbox: transformRect(matrix(viewport.transform, ctm), [0, 0, 1, 1]),
      });
    else if (op === PDFJS.OPS.constructPath && args[2])
      paths.push({
        id: `path-op-${i}`,
        bbox: transformRect(matrix(viewport.transform, ctm), args[2]),
      });
  }
  return { images, paths };
}
function vectorRegions(raw) {
  const regions = [];
  for (const path of raw.graphics.paths) {
    const box = path.bbox;
    if (
      box.some((v) => !Number.isFinite(v)) ||
      box[2] - box[0] < 40 ||
      box[3] - box[1] < 40
    )
      continue;
    if ((box[2] - box[0]) * (box[3] - box[1]) > raw.width * raw.height * 0.65)
      continue;
    const overlaps = regions.filter(
      (r) =>
        box[0] <= r.bbox[2] + 8 &&
        box[2] >= r.bbox[0] - 8 &&
        box[1] <= r.bbox[3] + 8 &&
        box[3] >= r.bbox[1] - 8
    );
    const boxes = [box, ...overlaps.map((r) => r.bbox)];
    overlaps.forEach((r) => regions.splice(regions.indexOf(r), 1));
    regions.push({
      id: path.id,
      type: "image",
      warning: "Fast 保留矢量图形原图，请检查其中的公式与表格",
      bbox: [
        Math.max(0, Math.min(...boxes.map((b) => b[0]))),
        Math.max(0, Math.min(...boxes.map((b) => b[1]))),
        Math.min(raw.width, Math.max(...boxes.map((b) => b[2]))),
        Math.min(raw.height, Math.max(...boxes.map((b) => b[3]))),
      ],
    });
  }
  return regions.filter(
    (r) =>
      !raw.graphics.images.some((image) => centerInside(r.bbox, image.bbox))
  );
}
export class StructureWorker {
  constructor() {
    this.worker = new Worker(new URL("./structure-worker.js", import.meta.url));
    this.pending = new Map();
    this.sequence = 0;
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    };
    this.worker.onerror = (e) => this.dispose(new Error(e.message));
  }
  request(data, signal) {
    check(signal);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(id);
        reject(new DOMException("已取消", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => signal?.removeEventListener("abort", abort);
      this.pending.set(id, {
        resolve: (v) => {
          cleanup();
          resolve(v);
        },
        reject: (e) => {
          cleanup();
          reject(e);
        },
      });
      this.worker.postMessage({ ...data, id });
    });
  }
  dispose(error = new DOMException("已取消", "AbortError")) {
    this.worker.terminate();
    this.pending.forEach((p) => p.reject(error));
    this.pending.clear();
  }
}
export class MissingDocumentModel extends Error {
  constructor(modelId) {
    super(`请先安装 ${modelId}，或明确切换 Fast 模式`);
    this.modelId = modelId;
    this.code = "MODEL_NOT_INSTALLED";
  }
}
function simpleTable(spans, box) {
  const inside = spans.filter((s) => centerInside(s.bbox, box));
  if (inside.length < 4) return null;
  const rows = [];
  for (const span of [...inside].sort(
    (a, b) => a.baseline - b.baseline || a.bbox[0] - b.bbox[0]
  )) {
    let row = rows.find(
      (r) => Math.abs(r[0].baseline - span.baseline) < span.fontSize * 0.3
    );
    if (!row) {
      row = [];
      rows.push(row);
    }
    row.push(span);
  }
  const cells = rows.map((row) => {
    const groups = [];
    for (const s of row.sort((a, b) => a.bbox[0] - b.bbox[0])) {
      const prev = groups.at(-1);
      if (prev && s.bbox[0] - prev.at(-1).bbox[2] < s.fontSize * 1.3)
        prev.push(s);
      else groups.push([s]);
    }
    return groups.map((g) => ({
      text: g.map((s) => s.text).join(" "),
      x: g[0].bbox[0],
    }));
  });
  const columns = cells[0]?.length;
  if (
    columns < 2 ||
    cells.length < 2 ||
    cells.some(
      (row) =>
        row.length !== columns ||
        row.some((c, i) => Math.abs(c.x - cells[0][i].x) > box[2] * 0.02)
    )
  )
    return null;
  const escape = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return {
    markdown:
      "| " +
      cells[0].map((c) => escape(c.text)).join(" | ") +
      " |\n| " +
      cells[0].map(() => "---").join(" | ") +
      " |\n" +
      cells
        .slice(1)
        .map((row) => "| " + row.map((c) => escape(c.text)).join(" | ") + " |")
        .join("\n"),
    cells: cells.flatMap((row, r) =>
      row.map((c, col) => ({
        rowStart: r,
        rowEnd: r + 1,
        colStart: col,
        colEnd: col + 1,
        text: c.text,
      }))
    ),
  };
}
function readingBlocks(blocks) {
  return blocks.flatMap((block) =>
    parseDocumentMarkdown(blockToMarkdown(block), block.id).map((md, i) => ({
      ...md,
      id: i ? `${block.id}-${i}` : block.id,
      type: block.type,
      level: block.level,
      text: block.text,
      fragments: block.fragments,
      source: block.source,
      cells: block.cells,
      relatedBlockId: block.relatedBlockId,
      warning: block.warning,
    }))
  );
}

/**
 * 独立执行 PDF 全文档版面布局检测
 * @param {Object} pdf PDF 文档对象
 * @param {Object} options 配置选项
 * @returns {Promise<Record<number, Array>>} 按页码索引的版面区域
 */
export async function detectPdfLayout(
  pdf,
  {
    layoutModel,
    layoutDevice = "wasm",
    client,
    models = [],
    signal,
    onProgress,
  } = {}
) {
  const installed = (id) =>
    models.some((m) => m.id === id && m.state === "installed");
  if (!installed(layoutModel)) {
    throw new MissingDocumentModel(layoutModel);
  }
  const pageRegions = {};
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    check(signal);
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const blob = await renderPdfRegion(page, null, signal, 1.3);
    const result = await client.analyzeLayout(
      blob,
      layoutModel,
      layoutDevice,
      signal
    );
    check(signal);
    const sx = viewport.width / result.imageSize.width;
    const sy = viewport.height / result.imageSize.height;
    pageRegions[pageNo] = (result.regions || []).map((r) => ({
      ...r,
      enabled: true,
      bbox: r.bbox.map((v, i) => v * (i % 2 ? sy : sx)),
      polygon: (r.polygon || []).map(([x, y]) => [x * sx, y * sy]),
    }));
    onProgress?.({
      stage: "布局检测",
      done: pageNo,
      total: pdf.numPages,
    });
  }
  return pageRegions;
}

export async function parsePdfDocument(
  pdf,
  {
    mode,
    enableJev,
    layoutModel,
    layoutDevice,
    visionModel,
    visionDevice,
    decisionModel,
    client,
    models,
    signal,
    onProgress,
    previous,
    retryRegion,
    layoutRegions,
  }
) {
  const installed = (id) =>
    models.some((m) => m.id === id && m.state === "installed");
  const pageRegionsMap = {
    ...(previous?.layoutRegions || layoutRegions || {}),
  };
  if (
    mode === "smart" &&
    !Object.keys(pageRegionsMap).length &&
    !installed(layoutModel)
  )
    throw new MissingDocumentModel(layoutModel);
  if (enableJev && mode === "smart" && !installed(decisionModel))
    throw new MissingDocumentModel(decisionModel);
  const worker = new StructureWorker(),
    pages = previous?.pages || [],
    assets = previous?.assets || [],
    warnings = (previous?.warnings || []).filter(
      (w) => !retryRegion || w.page !== retryRegion.page
    ),
    pageBlocks = [...(previous?.pageBlocks || [])],
    cache = previous?.cache || new Map();
  const snapshot = () => ({
    pages,
    assets,
    warnings,
    pageBlocks,
    cache,
    layoutRegions: pageRegionsMap,
    blocks: readingBlocks(pageBlocks.flat()),
    complete: false,
  });
  let complete = false;
  try {
    // All native metadata is gathered before filtering repeating furniture.
    for (let pageNo = pages.length + 1; pageNo <= pdf.numPages; pageNo++) {
      check(signal);
      const page = await pdf.getPage(pageNo),
        viewport = page.getViewport({ scale: 1 });
      const [content, structTree, operators, annotations] = await Promise.all([
        page.getTextContent({ includeMarkedContent: true }),
        page.getStructTree(),
        page.getOperatorList(),
        page.getAnnotations({ intent: "display" }),
      ]);
      check(signal);
      const analyzed = await worker.request(
        {
          type: "page",
          content,
          viewport: {
            width: viewport.width,
            height: viewport.height,
            rotation: viewport.rotation,
            transform: viewport.transform,
            scale: 1,
          },
          page: pageNo,
          regions: [],
        },
        signal
      );
      analyzed.raw.structTree = structTree;
      analyzed.raw.links = annotations
        .filter(
          (a) =>
            a.subtype === "Link" &&
            /^(?:https?:|mailto:)/i.test(a.url || "") &&
            a.rect
        )
        .map((a) => ({
          url: a.url,
          bbox: transformRect(viewport.transform, a.rect),
        }));
      analyzed.raw.graphics = graphicsFromOperators(operators, viewport);
      pages.push(analyzed.raw);
      onProgress(
        { stage: "读取文字层", done: pageNo, total: pdf.numPages },
        snapshot()
      );
    }
    const repeat = new Map();
    for (const page of pages)
      for (const span of page.spans) {
        if (
          span.bbox[1] < page.height * 0.1 ||
          span.bbox[3] > page.height * 0.94
        ) {
          const key = span.text.replace(/\d+/g, "#").trim();
          if (key.length > 1) {
            if (!repeat.has(key)) repeat.set(key, new Set());
            repeat.get(key).add(page.page);
          }
        }
      }
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      check(signal);
      if (pageBlocks[pageIndex] && retryRegion?.page !== pages[pageIndex].page)
        continue;
      const raw = pages[pageIndex],
        page = await pdf.getPage(raw.page);
      let regions = [];
      if (pageRegionsMap[raw.page]) {
        regions = pageRegionsMap[raw.page];
      } else if (mode === "smart") {
        const key = `layout:${layoutModel}:${layoutDevice}:${raw.page}`;
        if (!cache.has(key)) {
          const blob = await renderPdfRegion(page, null, signal, 1.3);
          const result = await client.analyzeLayout(
            blob,
            layoutModel,
            layoutDevice,
            signal
          );
          check(signal);
          const sx = raw.width / result.imageSize.width,
            sy = raw.height / result.imageSize.height;
          cache.set(
            key,
            result.regions.map((r) => ({
              ...r,
              enabled: true,
              bbox: r.bbox.map((v, i) => v * (i % 2 ? sy : sx)),
              polygon: (r.polygon || []).map(([x, y]) => [x * sx, y * sy]),
            }))
          );
        }
        regions = cache.get(key);
        pageRegionsMap[raw.page] = regions;
      }
      const activeRegions = (regions || []).filter((r) => r.enabled !== false);
      const excludedRegions = (regions || []).filter((r) => r.enabled === false);

      const usable = {
        ...raw,
        spans: raw.spans.filter(
          (s) =>
            !s.vertical &&
            !(
              (s.bbox[1] < raw.height * 0.1 || s.bbox[3] > raw.height * 0.94) &&
              (repeat.get(s.text.replace(/\d+/g, "#").trim())?.size >=
                Math.max(2, Math.ceil(pages.length * 0.5)) ||
                /^\d+$/.test(s.text.trim()))
            ) &&
            !activeRegions.some(
              (r) =>
                ["header", "footer", "number"].includes(r.type) &&
                centerInside(s.bbox, r.bbox)
            ) &&
            !excludedRegions.some((r) => centerInside(s.bbox, r.bbox))
        ),
      };
      const special = [];
      const nativeText = usable.spans.map((s) => s.text).join(" ");
      const badText =
        !nativeText.trim() ||
        // eslint-disable-next-line no-control-regex
        (nativeText.match(/[\u0000-\u0008]/g) || []).length >
          nativeText.length * 0.05;
      const visual = badText
        ? [
            {
              id: `scan-${raw.page}`,
              type: "paragraph",
              bbox: [0, 0, raw.width, raw.height],
              order: 0,
            },
          ]
        : activeRegions.filter((r) => ["table", "formula", "image"].includes(r.type));
      const imageRegions =
        mode === "fast"
          ? [...raw.graphics.images, ...vectorRegions(raw)]
              .filter(
                (r) => r.bbox[2] - r.bbox[0] > 30 && r.bbox[3] - r.bbox[1] > 30
              )
              .filter(
                (r) => !excludedRegions.some((ex) => centerInside(r.bbox, ex.bbox))
              )
              .map((r) => ({ ...r, type: "image" }))
          : [];
      const nativeTables = badText
        ? []
        : nativeTableRegions(usable).filter(
            (table) =>
              !visual.some((r) => centerInside(table.bbox, r.bbox)) &&
              !excludedRegions.some((r) => centerInside(table.bbox, r.bbox))
          );
      for (const region of [...visual, ...nativeTables, ...imageRegions]) {
        check(signal);
        let markdown = "",
          cells,
          source = "native",
          warning = region.warning;
        const table =
          region.type === "table" && simpleTable(usable.spans, region.bbox);
        if (table) {
          markdown = table.markdown;
          cells = table.cells;
        } else if (region.type !== "image" && mode === "smart") {
          if (!installed(visionModel))
            throw new MissingDocumentModel(visionModel);
          const task =
              region.type === "formula"
                ? "formula"
                : region.type === "table"
                  ? "table"
                  : "doc",
            key = `vision:${visionModel}:${visionDevice}:${raw.page}:${region.id}:${task}`;
          try {
            if (!cache.has(key)) {
              const blob = await renderPdfRegion(page, region.bbox, signal, 2);
              const result = await client.recognizeDocumentRegion(
                blob,
                visionModel,
                task,
                visionDevice,
                signal
              );
              check(signal);
              cache.set(key, result.text);
            }
            const text = cache
              .get(key)
              .trim()
              .replace(/^```(?:html|markdown|latex)?\s*\n?/i, "")
              .replace(/\n?```$/, "");
            if (!text) throw new Error("识别结果为空");
            markdown =
              task === "formula"
                ? `$$\n${text.replace(/^\$\$?|\$\$?$/g, "").trim()}\n$$`
                : text;
            if (task === "table") cells = tableCellsFromHtml(markdown);
            source = "vision";
          } catch (e) {
            if (signal?.aborted || e.code === "MODEL_NOT_INSTALLED") throw e;
            cache.delete(key);
            warning = e.message;
          }
        }
        if (!markdown) {
          const name = `page-${raw.page}-${region.id.replace(/[^\w-]/g, "")}.png`;
          let asset = assets.find((a) => a.name === name);
          if (!asset) {
            const blob = await renderPdfRegion(page, region.bbox, signal, 1.8);
            asset = { name, blob, url: URL.createObjectURL(blob) };
            assets.push(asset);
          }
          markdown = `![第 ${raw.page} 页${region.type === "image" ? "图片" : "待识别区域"}](${asset.url})`;
          source = "image";
          if (region.type !== "image") warning ||= "该区域未识别，已保留原图";
        }
        if (warning)
          warnings.push({
            id: `warning-${raw.page}-${region.id}`,
            page: raw.page,
            regionId: region.id,
            message: warning,
          });
        special.push({
          id: `p${raw.page}-${region.id}`,
          type: region.type,
          markdown,
          cells,
          source,
          warning,
          text: region.type === "image" ? "" : markdown,
          bbox: region.bbox,
          order: region.order,
          fragments: [{ page: raw.page, bbox: region.bbox, lineIds: [] }],
          spanIds: [],
        });
        // Keep the source spans in Raw IR; exclude replaced regions from native reading text.
        if (region.type !== "image")
          usable.spans = usable.spans.filter(
            (s) => !centerInside(s.bbox, region.bbox)
          );
      }
      if (badText && mode === "fast")
        warnings.push({
          id: `scan-${raw.page}`,
          page: raw.page,
          message: "文字层缺失或异常，Fast 无法识别；请使用 Smart",
        });
      const result = await worker.request(
        { type: "raw", raw: usable, regions: activeRegions },
        signal
      );
      let blocks = [...result.blocks, ...special];
      // Region order is the primary Smart evidence; geometric flow covers unmatched native blocks.
      const ordered = await worker.request(
        { type: "order", blocks, width: raw.width, height: raw.height },
        signal
      );
      blocks = ordered;
      if (
        enableJev &&
        mode === "smart" &&
        blocks.length > 1 &&
        blocks.some((b) => b.order === undefined)
      ) {
        const candidates = ["geometric_flow", "layout_region_order"],
          key = `decision:${decisionModel}:${raw.page}`;
        if (!cache.has(key))
          cache.set(
            key,
            await client.request(
              "decideDocumentStructure",
              {
                modelId: decisionModel,
                state: {
                  page: raw.page,
                  blocks: blocks.map((b) => ({
                    id: b.id,
                    type: b.type,
                    bbox: b.bbox,
                    order: b.order,
                    text: (b.text || "").slice(0, 80),
                  })),
                },
                candidates,
              },
              { signal }
            )
          );
        const answer = cache.get(key).answers?.structure;
        if (
          answer?.choice === "layout_region_order" &&
          answer.confidence >= 0.7
        )
          blocks.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      }
      // Associate captions with the nearest preceding image/table on the same page.
      for (const caption of blocks.filter((b) => b.type === "caption")) {
        const asset = blocks
          .filter((b) => ["image", "table"].includes(b.type))
          .sort(
            (a, b) =>
              Math.abs(a.bbox[3] - caption.bbox[1]) -
              Math.abs(b.bbox[3] - caption.bbox[1])
          )[0];
        if (asset) caption.relatedBlockId = asset.id;
      }
      pageBlocks[pageIndex] = blocks;
      onProgress(
        { stage: "恢复结构", done: pageIndex + 1, total: pages.length },
        snapshot()
      );
    }
    const merged = await worker.request(
      { type: "merge", blocks: pageBlocks.flat(), pages },
      signal
    );
    check(signal);
    complete = true;
    return {
      ...snapshot(),
      ir: { pages, blocks: merged, readingOrder: merged.map((b) => b.id) },
      blocks: readingBlocks(merged),
      complete,
    };
  } catch (e) {
    e.partial = snapshot();
    throw e;
  } finally {
    worker.dispose();
  }
}
