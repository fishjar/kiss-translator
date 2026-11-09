import { documentAssetPath } from "../document/assets";
import { incrementalPdfBlocks } from "./incremental";
import {
  documentRecognitionSelection,
  documentOcrBlocks,
  documentRecognitionKey,
} from "./recognition";
import { PDFJS, renderPdfRegion } from "./pdfDocument";
import {
  parseDocumentMarkdown,
  bindDocumentSources,
  tableCellsFromHtml,
} from "../document/markdown";
import {
  blockToMarkdown,
  buildLines,
  paragraphBlocks,
  TEXT_GEOMETRY_VERSION,
} from "./structure";
import {
  textRegion,
  regionContainsText,
  sourceAnchor,
} from "./formulaGeometry";
import { pairEquationNumbers } from "./equationNumbers";
import { nativeTableRegions } from "./nativeTables";
import {
  deduplicateFormulaRegions,
  formulaContainsSpan,
  normalizeFormula,
  validateFormula,
} from "./formula";

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
  return blocks.flatMap((block) => {
    const sourceRanges = [],
      markdown = blockToMarkdown(block, sourceRanges);
    const sourceAnchors = [
      ...new Map(
        (block.sourceAnchors || []).map((anchor) => [anchor.id, anchor])
      ).values(),
    ];
    return parseDocumentMarkdown(markdown, block.id).map((md, i) => {
      bindDocumentSources(md.ast, sourceRanges, markdown);
      if (block.equationNumber) {
        const formulaIds = sourceAnchors
          .filter((anchor) => anchor.type === "formula")
          .map((anchor) => anchor.id);
        const annotate = (node) => {
          node.data = {
            ...node.data,
            pdfSourceIds:
              node.type === "text" &&
              node.value.trim() === block.equationNumber.text &&
              block.equationNumber.anchor
                ? [block.equationNumber.anchor.id]
                : formulaIds,
          };
          node.children?.forEach(annotate);
        };
        annotate(md.ast);
      }
      return {
        ...md,
        id: i ? `${block.id}-${i}` : block.id,
        type: block.type,
        level: block.level,
        text: block.text,
        fragments: block.fragments,
        translationReady: block.translationReady,
        source: block.source,
        cells: block.cells,
        relatedBlockId: block.relatedBlockId,
        warning: block.warning,
        recognitionLines: block.recognitionLines,
        regionId: block.regionId,
        sourceAnchors,
        equationNumber: block.equationNumber,
        pendingSourceIds: block.recognitionPending
          ? sourceAnchors
              .filter((anchor) => anchor.type !== "formula_number")
              .map((anchor) => anchor.id)
          : (block.inlineMath || [])
              .filter((formula) => formula.pending)
              .map((formula) => formula.sourceAnchor?.id)
              .filter(Boolean),
        formulaDiagnostics:
          block.formulaDiagnostics ||
          (block.inlineMath || [])
            .map((formula) => formula.diagnostic)
            .filter(Boolean),
      };
    });
  });
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
    layoutServiceId,
    layoutDevice = "wasm",
    cacheMode,
    client,
    models = [],
    signal,
    onProgress,
  } = {}
) {
  const installed = (id) =>
    models.some((m) => m.id === id && m.state === "installed");
  if (!layoutServiceId && !installed(layoutModel)) {
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
      signal,
      layoutServiceId,
      cacheMode
    );
    check(signal);
    const sx = viewport.width / result.imageSize.width;
    const sy = viewport.height / result.imageSize.height;
    pageRegions[pageNo] = deduplicateFormulaRegions(
      (result.regions || []).map((r) => ({
        ...r,
        enabled: true,
        bbox: r.bbox.map((v, i) => v * (i % 2 ? sy : sx)),
        polygon: (r.polygon || []).map(([x, y]) => [x * sx, y * sy]),
      }))
    );
    onProgress?.(
      {
        stage: "布局检测",
        done: pageNo,
        total: pdf.numPages,
      },
      { ...pageRegions }
    );
  }
  return pageRegions;
}

export async function parsePdfDocument(
  pdf,
  {
    mode,
    enableJev,
    layoutModel,
    layoutServiceId,
    layoutDevice,
    recognitionService,
    visionServiceSlug,
    vlmPromptSlug,
    services = [],
    decisionModel,
    client,
    models,
    signal,
    onProgress,
    previous,
    retryRegion,
    cacheMode,
    layoutRegions,
  }
) {
  const installed = (id) =>
    models.some((m) => m.id === id && m.state === "installed");
  const recognitionKey = documentRecognitionKey({
    recognitionService,
    visionServiceSlug,
    vlmPromptSlug,
    services,
  });
  const pageRegionsMap = {
    ...(layoutRegions || previous?.layoutRegions || {}),
  };
  if (
    mode === "smart" &&
    !Object.keys(pageRegionsMap).length &&
    !layoutServiceId &&
    !installed(layoutModel)
  )
    throw new MissingDocumentModel(layoutModel);
  if (enableJev && mode === "smart" && !installed(decisionModel))
    throw new MissingDocumentModel(decisionModel);
  const worker = new StructureWorker(),
    pages = [...(previous?.pages || [])],
    assets = (previous?.assets || []).filter(
      (asset) => !asset.name.includes("native-glyph-")
    ),
    warnings = (
      previous?.recognitionKey === recognitionKey
        ? previous?.warnings || []
        : []
    ).filter((w) => !retryRegion || w.page !== retryRegion.page),
    pageBlocks =
      previous?.recognitionKey === recognitionKey
        ? [...(previous?.pageBlocks || [])]
        : [],
    cache = previous?.cache || new Map();
  const completedPages = new Set(
    previous?.recognitionKey === recognitionKey
      ? previous.completedPages ||
        (previous.complete ? pages.map((page) => page.page) : [])
      : []
  );
  const snapshot = () => ({
    pages,
    assets: [...assets],
    warnings: [...warnings],
    pageBlocks: [...pageBlocks],
    completedPages: [...completedPages],
    recognitionKey,
    cache,
    layoutRegions: pageRegionsMap,
    blocks: readingBlocks(
      incrementalPdfBlocks(pageBlocks, pages, completedPages, pdf.numPages)
    ),
    complete: false,
  });
  let complete = false;
  try {
    // Repair cached text geometry without repeating layout or model inference.
    for (let index = 0; index < pages.length; index++) {
      if (pages[index].textGeometryVersion === TEXT_GEOMETRY_VERSION) continue;
      check(signal);
      const page = await pdf.getPage(pages[index].page),
        viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({ includeMarkedContent: true });
      check(signal);
      const repaired = await worker.request(
        {
          type: "page",
          content,
          page: pages[index].page,
          viewport: {
            width: viewport.width,
            height: viewport.height,
            rotation: viewport.rotation,
            transform: viewport.transform,
            scale: 1,
          },
          regions: [],
        },
        signal
      );
      check(signal);
      pages[index] = { ...pages[index], ...repaired.raw };
      pageBlocks[index] = [];
      completedPages.delete(pages[index].page);
    }
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
      if (
        completedPages.has(pages[pageIndex].page) &&
        retryRegion?.page !== pages[pageIndex].page
      )
        continue;
      const raw = pages[pageIndex],
        page = await pdf.getPage(raw.page);
      completedPages.delete(raw.page);
      let regions = [];
      if (pageRegionsMap[raw.page]) {
        regions = pageRegionsMap[raw.page];
      } else if (mode === "smart") {
        const key = `layout:${layoutServiceId || layoutModel}:${layoutDevice}:${raw.page}`;
        if (cacheMode === "refresh" || !cache.has(key)) {
          const blob = await renderPdfRegion(page, null, signal, 1.3);
          const result = await client.analyzeLayout(
            blob,
            layoutModel,
            layoutDevice,
            signal,
            layoutServiceId,
            cacheMode
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
      regions = deduplicateFormulaRegions(regions || []);
      pageRegionsMap[raw.page] = regions;
      const activeRegions = regions
        .filter((r) => r.enabled !== false)
        .map((r) => ({ ...r }));
      const excludedRegions = (regions || []).filter(
        (r) => r.enabled === false
      );
      const imageRegions =
        mode === "fast"
          ? [...raw.graphics.images, ...vectorRegions(raw)]
              .filter(
                (r) => r.bbox[2] - r.bbox[0] > 30 && r.bbox[3] - r.bbox[1] > 30
              )
              .filter(
                (r) =>
                  !excludedRegions.some((ex) => centerInside(r.bbox, ex.bbox))
              )
              .map((r) => ({ ...r, type: "image" }))
          : [];
      const imageMasks = [
        ...(regions || []).filter((r) => r.type === "image"),
        ...imageRegions,
      ];
      const insideImage = (region) =>
        imageMasks.some(
          (image) =>
            region.bbox[0] >= image.bbox[0] &&
            region.bbox[1] >= image.bbox[1] &&
            region.bbox[2] <= image.bbox[2] &&
            region.bbox[3] <= image.bbox[3]
        );

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
            !excludedRegions.some((r) => regionContainsText(s.bbox, r.bbox)) &&
            !imageMasks.some((r) => centerInside(s.bbox, r.bbox))
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
        ? activeRegions.some((r) =>
            ["text", "paragraph", "title", "table", "formula"].includes(r.type)
          )
          ? activeRegions.filter(
              (r) =>
                ![
                  "header",
                  "footer",
                  "number",
                  "image",
                  "inline-formula",
                ].includes(r.type) && !insideImage(r)
            )
          : imageMasks.length
            ? []
            : [
                {
                  id: `scan-${raw.page}`,
                  type: "paragraph",
                  bbox: [0, 0, raw.width, raw.height],
                  order: 0,
                },
              ]
        : activeRegions.filter(
            (r) =>
              (["table", "formula", "image"].includes(r.type) ||
                (mode === "smart" && r.type === "inline-formula")) &&
              (r.type === "image" || !insideImage(r))
          );
      if (badText && mode === "smart")
        visual.push(...activeRegions.filter((r) => r.type === "image"));
      const nativeTables = badText
        ? []
        : nativeTableRegions(usable).filter(
            (table) =>
              !visual.some((r) => centerInside(table.bbox, r.bbox)) &&
              !excludedRegions.some((r) => centerInside(table.bbox, r.bbox))
          );
      // Missing font mappings need a complete source region, never a glyph crop.
      const nativeParagraphs = paragraphBlocks(
        usable,
        buildLines(usable, activeRegions),
        activeRegions
      );
      const fallbackOwners = new Map();
      for (const span of usable.spans) {
        if (
          // eslint-disable-next-line no-control-regex
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(span.text) ||
          visual.some(
            (r) =>
              ["formula", "inline-formula", "table"].includes(r.type) &&
              textRegion(span.bbox, activeRegions)?.id === r.id
          )
        )
          continue;
        const formula = activeRegions.find(
          (r) =>
            ["formula", "inline-formula"].includes(r.type) &&
            textRegion(span.bbox, activeRegions)?.id === r.id
        );
        const paragraph = activeRegions.find(
          (r) =>
            ["paragraph", "text", "heading", "caption"].includes(r.type) &&
            textRegion(span.bbox, activeRegions)?.id === r.id
        );
        const native = nativeParagraphs.find((block) =>
          block.spanIds.includes(span.id)
        );
        const owner =
          formula ||
          paragraph ||
          (native && {
            id: `native-paragraph-${native.id}`,
            type: "paragraph",
            bbox: native.bbox,
            paragraphFallback: true,
          });
        if (owner)
          fallbackOwners.set(owner.id, {
            ...owner,
            nativeFallback: true,
            nativeText: native?.text,
            warning: "PDF 字体字符映射无效，已保留完整原文区域",
          });
      }
      const nativeFallbacks = [...fallbackOwners.values()];
      const covered = (region) =>
        nativeFallbacks.some(
          (fallback) =>
            fallback.type !== "inline-formula" &&
            region.id !== fallback.id &&
            formulaContainsSpan(region.bbox, fallback.bbox)
        );
      for (let index = activeRegions.length - 1; index >= 0; index--)
        if (covered(activeRegions[index])) activeRegions.splice(index, 1);
      for (const fallback of nativeFallbacks) {
        const existing = activeRegions.findIndex(
          (region) => region.id === fallback.id
        );
        if (existing >= 0) activeRegions[existing] = fallback;
        else activeRegions.push(fallback);
      }
      const jobs = [...visual, ...nativeTables, ...imageRegions]
        .filter((region) => !fallbackOwners.has(region.id) && !covered(region))
        .concat(nativeFallbacks)
        .sort(
          (a, b) => Number(b.type === "image") - Number(a.type === "image")
        );
      jobs
        .filter((region) => region.type === "inline-formula")
        .forEach((region) => {
          region.pendingRecognition = true;
        });
      const nativeSpans = usable.spans;
      const formulas = jobs.filter((region) =>
        ["formula", "inline-formula"].includes(region.type)
      );
      // Unassigned native glyphs may extend beyond a formula's detection bounds.
      usable.spans = usable.spans.filter(
        (span) =>
          textRegion(span.bbox, activeRegions) ||
          !formulas.some(
            (region) =>
              Math.min(span.bbox[2], region.bbox[2]) >
                Math.max(span.bbox[0], region.bbox[0]) &&
              Math.min(span.bbox[3], region.bbox[3]) >
                Math.max(span.bbox[1], region.bbox[1])
          )
      );
      usable.spans = usable.spans.filter(
        (span) =>
          !jobs.some(
            (region) =>
              !["image", "inline-formula"].includes(region.type) &&
              textRegion(span.bbox, jobs)?.id === region.id
          )
      );
      for (const region of jobs) {
        if (region.type !== "inline-formula")
          special.push({
            id: `p${raw.page}-${region.id}`,
            type: region.type,
            markdown: region.type === "image" ? "_待提取图片…_" : "_待识别…_",
            recognitionPending: true,
            regionId: region.id,
            bbox: region.bbox,
            order: region.order,
            spanIds: [],
            sourceAnchors: [sourceAnchor(raw.page, region)].filter(Boolean),
            fragments: [{ page: raw.page, bbox: region.bbox, lineIds: [] }],
          });
      }
      const pairNumbers = (blocks) => {
        for (let index = warnings.length - 1; index >= 0; index--)
          if (
            warnings[index].page === raw.page &&
            warnings[index].id.startsWith("warning-tag-")
          )
            warnings.splice(index, 1);
        return pairEquationNumbers(
          blocks,
          activeRegions,
          raw.width,
          (formula, message) =>
            warnings.push({
              id: `warning-tag-${raw.page}-${formula.regionId}`,
              page: raw.page,
              regionId: formula.regionId,
              message,
            })
        );
      };
      const publishPage = async (progress) => {
        check(signal);
        const native = await worker.request(
          { type: "raw", raw: usable, regions: activeRegions },
          signal
        );
        pageBlocks[pageIndex] = await worker.request(
          {
            type: "order",
            blocks: [...native.blocks, ...special],
            width: raw.width,
            height: raw.height,
          },
          signal
        );
        pageBlocks[pageIndex] = pairNumbers(pageBlocks[pageIndex]);
        check(signal);
        onProgress?.(progress, snapshot());
      };
      await publishPage({
        stage: "恢复正文",
        page: raw.page,
        done: 0,
        total: jobs.length,
      });
      let finishedRegions = 0;
      for (const region of jobs) {
        check(signal);
        let markdown = "",
          cells,
          source = "native",
          warning = region.warning,
          recognizedBlocks,
          recognitionCacheKey,
          formulaOutput;
        const table =
          region.type === "table" && simpleTable(nativeSpans, region.bbox);
        if (table) {
          markdown = table.markdown;
          cells = table.cells;
        } else if (
          region.type !== "image" &&
          mode === "smart" &&
          (!region.nativeFallback ||
            (retryRegion?.page === raw.page &&
              retryRegion?.regionId === region.id))
        ) {
          const task = ["formula", "inline-formula"].includes(region.type)
            ? "formula"
            : region.type === "table"
              ? "table"
              : "doc";
          try {
            const selection = documentRecognitionSelection(
              task,
              recognitionService,
              visionServiceSlug
            );
            const service = services.find(
              (item) => item.apiSlug === selection.apiSlug
            );
            const key =
              (recognitionCacheKey = `recognition:v2:${JSON.stringify([selection, task, service?.recognitionSignature, vlmPromptSlug, raw.page, region.id, region.bbox])}`);
            const refresh =
              cacheMode === "refresh" ||
              (retryRegion?.page === raw.page &&
                retryRegion?.regionId === region.id);
            if (refresh || !cache.has(key)) {
              const masks = imageMasks
                .filter(
                  (image) =>
                    image.bbox[0] < region.bbox[2] &&
                    image.bbox[2] > region.bbox[0] &&
                    image.bbox[1] < region.bbox[3] &&
                    image.bbox[3] > region.bbox[1]
                )
                .map((image) => image.bbox);
              const blob = masks.length
                ? await renderPdfRegion(page, region.bbox, signal, 2, masks)
                : await renderPdfRegion(page, region.bbox, signal, 2);
              const progressDone = finishedRegions;
              const result = await client.recognize(blob, selection, signal, {
                taskMode: task,
                promptSlug: task === "doc" ? vlmPromptSlug : "",
                cacheMode: refresh ? "refresh" : cacheMode,
                onProgress: (event) => {
                  if (signal?.aborted) return;
                  onProgress?.(
                    {
                      stage:
                        event.type === "cache-hit" ? "缓存命中" : "识别区域",
                      page: raw.page,
                      regionId:
                        event.type === "inference" ? region.id : undefined,
                      regionType: region.type,
                      ...(event.type === "inference" && {
                        startedAt: Date.now(),
                      }),
                      done: progressDone,
                      total: jobs.length,
                    },
                    snapshot()
                  );
                },
              });
              check(signal);
              cache.set(key, result);
            }
            const recognized = cache.get(key);
            if (task === "formula") formulaOutput = recognized.text;
            if (selection.capability === "recognizeText")
              recognizedBlocks = documentOcrBlocks(
                recognized,
                region.bbox,
                raw.page,
                `p${raw.page}-${region.id}`
              );
            const text = recognized.text
              .trim()
              .replace(/^```(?:html|markdown|latex)?\s*\n?/i, "")
              .replace(/\n?```$/, "");
            const latex =
              task === "formula" ? normalizeFormula(formulaOutput) : "";
            if (task === "formula")
              validateFormula(latex, region.type === "formula");
            else if (!text) throw new Error("识别结果为空");
            if (region.nativeFallback) warning = undefined;
            if (region.type === "inline-formula") {
              region.latex = latex;
              region.formulaDiagnostic = {
                regionId: region.id,
                output: formulaOutput,
              };
              delete region.inlineRecognitionFailed;
              await publishPage({
                stage: "恢复结构",
                page: raw.page,
                done: ++finishedRegions,
                total: jobs.length,
              });
              continue;
            }
            markdown = task === "formula" ? `$$\n${latex}\n$$` : text;
            if (task === "table") cells = tableCellsFromHtml(markdown);
            source =
              selection.capability === "recognizeText" ? "ocr" : "vision";
          } catch (e) {
            if (signal?.aborted) throw e;
            cache.delete(recognitionCacheKey);
            warning = e.message;
          }
        }
        if (region.type === "inline-formula") {
          const coordinates = region.nativeFallback
            ? `-${region.bbox.map((value) => Math.round(value * 10)).join("-")}`
            : "";
          const name = `page-${raw.page}-${region.id.replace(/[^\w-]/g, "")}${coordinates}.png`;
          let asset = assets.find((a) => a.name === name);
          if (!asset) {
            const blob = await renderPdfRegion(page, region.bbox, signal, 1.8);
            check(signal);
            asset = { name, blob };
            assets.push(asset);
          }
          region.formulaMarkdown = `![第 ${raw.page} 页原公式](${documentAssetPath(asset.name)})`;
          region.formulaDiagnostic = {
            regionId: region.id,
            output: formulaOutput || "",
            nativeText: region.nativeText,
            error: warning,
          };
          delete region.inlineRecognitionFailed;
          warnings.push({
            id: `warning-${raw.page}-${region.id}`,
            page: raw.page,
            regionId: region.id,
            message: warning || "行内公式未识别，已保留原图",
          });
          await publishPage({
            stage: "恢复结构",
            page: raw.page,
            done: ++finishedRegions,
            total: jobs.length,
          });
          continue;
        }
        if (!markdown) {
          const coordinates = region.nativeFallback
            ? `-${region.bbox.map((value) => Math.round(value * 10)).join("-")}`
            : "";
          const name = `page-${raw.page}-${region.id.replace(/[^\w-]/g, "")}${coordinates}.png`;
          let asset = assets.find((a) => a.name === name);
          if (!asset) {
            const blob = await renderPdfRegion(page, region.bbox, signal, 1.8);
            check(signal);
            asset = { name, blob };
            assets.push(asset);
          }
          markdown = `![第 ${raw.page} 页${region.type === "image" ? "图片" : region.paragraphFallback ? "原文段落回退" : "原文区域回退"}](${documentAssetPath(asset.name)})`;
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
        special.splice(
          special.findIndex(
            (block) => block.id === `p${raw.page}-${region.id}`
          ),
          1
        );
        if (recognizedBlocks?.length)
          special.push(
            ...recognizedBlocks.map((block, index) => ({
              ...block,
              sourceAnchors: [sourceAnchor(raw.page, region)].filter(Boolean),
              order:
                region.order === undefined
                  ? undefined
                  : region.order + index / (recognizedBlocks.length + 1),
            }))
          );
        else
          special.push({
            id: `p${raw.page}-${region.id}`,
            regionId: region.id,
            sourceAnchors: [sourceAnchor(raw.page, region)].filter(Boolean),
            type: region.type,
            markdown,
            cells,
            source,
            warning,
            formulaDiagnostics:
              region.type === "formula" || region.nativeFallback
                ? [
                    {
                      regionId: region.id,
                      output: formulaOutput || "",
                      nativeText: region.nativeText,
                      error: warning,
                    },
                  ]
                : undefined,
            text: region.type === "image" ? "" : markdown,
            bbox: region.bbox,
            order: region.order,
            fragments: [{ page: raw.page, bbox: region.bbox, lineIds: [] }],
            spanIds: [],
          });
        await publishPage({
          stage: "恢复结构",
          page: raw.page,
          done: ++finishedRegions,
          total: jobs.length,
        });
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
          key = `decision:${decisionModel}:${raw.page}:${JSON.stringify(blocks.map((b) => [b.id, b.type, b.bbox, b.order, b.text]))}`;
        if (cacheMode === "refresh" || !cache.has(key))
          cache.set(
            key,
            await client.request(
              "decideDocumentStructure",
              {
                modelId: decisionModel,
                cacheMode,
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
      pageBlocks[pageIndex] = pairNumbers(blocks);
      completedPages.add(raw.page);
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
      blocks: readingBlocks(
        merged.map((block) => ({ ...block, translationReady: true }))
      ),
      complete,
    };
  } catch (e) {
    e.partial = snapshot();
    throw e;
  } finally {
    worker.dispose();
  }
}
