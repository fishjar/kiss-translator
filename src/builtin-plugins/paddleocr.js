/**
 * @file paddleocr.js
 * @description 适配 PaddleOCR 官方异步任务 API（AI Studio 免费层）。
 *
 * 调用流程与官方示例一致：
 * 1. POST /api/v2/ocr/jobs 上传图片并提交任务；
 * 2. GET  /api/v2/ocr/jobs/{jobId} 轮询任务状态；
 * 3. 任务完成后下载 resultUrl.jsonUrl（JSONL），按模型解析为：
 *    - 文字 OCR：带坐标的文本行 -> recognizeText
 *    - OCR VLM：版面块 + Markdown -> parseImage
 *    - OCR 结构：版面块 -> analyzeLayout
 */

import { fetchPatcher } from "../libs/fetch";
import { providerError } from "../providers/capabilities";
import {
  DEFAULT_PADDLEOCR_MODEL,
  PADDLEOCR_JOB_URL,
  paddleOcrOptionalPayload,
} from "./paddleocrModels";

const POLL_INTERVAL_MS = 2000;
const POLL_REQUEST_TIMEOUT_SECONDS = 30;
// 结构解析中这些块通常不含需要翻译的文字，内容为空时直接跳过。
const SKIP_EMPTY_LAYOUT_LABELS = new Set(["image", "chart", "figure", "seal"]);

/** 统一构造 PaddleOCR 的错误对象。 */
const paddleError = (message, code = "PROVIDER_ERROR") =>
  providerError(code, message);

/** 在等待轮询间隔时保持可取消。 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("已取消", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new DOMException("已取消", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 发起请求并解析 JSON。
 * 直接使用 fetchPatcher（扩展页面/后台均为原生 fetch），避免 FormData 经过消息通道被 JSON 序列化。
 */
async function requestJson(url, init, signal, httpTimeout) {
  const res = await fetchPatcher(url, init, { signal, httpTimeout });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail =
      typeof data === "string" ? data : data?.msg || JSON.stringify(data);
    throw paddleError(
      `PaddleOCR 请求失败 (${res.status})：${String(detail).slice(0, 300)}`
    );
  }
  return data;
}

/** 下载 JSONL 结果文本。 */
async function requestText(url, signal, httpTimeout) {
  const res = await fetchPatcher(url, {}, { signal, httpTimeout });
  const text = await res.text();
  if (!res.ok)
    throw paddleError(
      `PaddleOCR 结果下载失败 (${res.status})：${text.slice(0, 300)}`
    );
  return text;
}

/** 把 JSONL 每行解析为官方响应中的 `result` 对象。 */
function parseJsonl(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)?.result;
      } catch {
        throw paddleError(
          "PaddleOCR 返回了无法解析的 JSONL 结果",
          "INVALID_RESPONSE"
        );
      }
    })
    .filter(Boolean);
}

/** 判断矩形框的四个数值是否有效。 */
const isFlatBox = (box) =>
  Array.isArray(box) &&
  box.length === 4 &&
  box.every((value) => Number.isFinite(Number(value)));

/** 判断点集是否为至少三个有效点组成的多边形。 */
const isPointPoly = (poly) =>
  Array.isArray(poly) &&
  poly.length >= 3 &&
  poly.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      point.every((value) => Number.isFinite(Number(value)))
  );

/** 把四点多边形或矩形框统一成 `[[x, y], ...]`。 */
function normalizePoly(poly, box) {
  if (isPointPoly(poly)) return poly.map(([x, y]) => [Number(x), Number(y)]);
  // 官方 VLM 在 layoutShapeMode 为 quad/poly 时会直接返回点集形式的 block_bbox。
  if (isPointPoly(box)) return box.map(([x, y]) => [Number(x), Number(y)]);
  if (isFlatBox(box)) {
    const [left, top, right, bottom] = box.map(Number);
    return [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
    ];
  }
  return null;
}

/** 项目的结果校验要求多边形面积非零。 */
function hasArea(poly) {
  if (!poly || poly.length < 3) return false;
  const area = poly.reduce((sum, [x, y], index) => {
    const [nx, ny] = poly[(index + 1) % poly.length];
    return sum + x * ny - nx * y;
  }, 0);
  return Math.abs(area) > 0;
}

/** 解析文字 OCR 的 `prunedResult`。 */
export function parsePaddleOcrPages(pages = []) {
  const items = [];
  for (const page of pages) {
    for (const result of page?.ocrResults || []) {
      const pruned = result?.prunedResult || {};
      const texts = Array.isArray(pruned.rec_texts) ? pruned.rec_texts : [];
      const polys = Array.isArray(pruned.rec_polys) ? pruned.rec_polys : [];
      const boxes = Array.isArray(pruned.rec_boxes) ? pruned.rec_boxes : [];
      const scores = Array.isArray(pruned.rec_scores) ? pruned.rec_scores : [];
      texts.forEach((text, index) => {
        const value = typeof text === "string" ? text.trim() : "";
        const poly = normalizePoly(polys[index], boxes[index]);
        if (!value || !hasArea(poly)) return;
        const confidence = Number(scores[index]);
        items.push({
          text: value,
          poly,
          ...(Number.isFinite(confidence) &&
            confidence >= 0 &&
            confidence <= 1 && { confidence }),
        });
      });
    }
  }
  if (!items.length)
    throw paddleError("PaddleOCR 未识别到有效文字", "INVALID_RESPONSE");
  return {
    text: items.map((item) => item.text).join("\n"),
    items,
    format: "text",
  };
}

// 官方 VLM 会把版面图片写成 <div style="text-align: center;"><img
// src="imgs/xxx.jpg" /></div>，或直接使用 ![](imgs/xxx.jpg)。
// 这些相对路径只在官方示例的本地导出目录中有效，插件不保存结果图片，
// 所以解析时统一清理，避免把 HTML 当成正文参与翻译。
const VLM_IMAGE_BLOCK_RE = /<div\b[^>]*>\s*<img\b[^>]*\/?>\s*<\/div>/gi;
const VLM_IMAGE_TAG_RE = /<img\b[^>]*\/?>/gi;
const VLM_MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
// 块内容可能是 HTML 表格等富文本，转换为纯文本时保留基本的行/单元格分隔。
const HTML_BREAK_RE = /<br\s*\/?>/gi;
const HTML_CELL_END_RE = /<\/(?:td|th)>/gi;
const HTML_LINE_END_RE = /<\/(?:tr|p|div|li|h[1-6]|table|blockquote|pre)>/gi;
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
const HTML_ENTITY_RE = /&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi;
const HTML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** 还原标题、表格单元格里常见的 HTML 实体。 */
function decodeHtmlEntities(text) {
  return String(text || "").replace(HTML_ENTITY_RE, (match, entity) => {
    const key = entity.toLowerCase();
    if (key.startsWith("#")) {
      const code = key.startsWith("#x")
        ? Number.parseInt(key.slice(2), 16)
        : Number.parseInt(key.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return HTML_ENTITIES[key] ?? match;
  });
}

/** 去掉 VLM 结果中的图片占位符（HTML 图片块、<img> 标签、Markdown 图片）。 */
function stripVlmImageMarkup(text) {
  return String(text || "")
    .replace(VLM_IMAGE_BLOCK_RE, "")
    .replace(VLM_IMAGE_TAG_RE, "")
    .replace(VLM_MARKDOWN_IMAGE_RE, "");
}

/** 规范化 VLM 版面块的 Markdown 内容，用于文档展示。 */
function normalizeVlmMarkdown(text) {
  return stripVlmImageMarkup(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 把 VLM 版面块内容转换为单行/多行纯文本，用于逐块翻译。 */
function normalizeVlmPlainText(text) {
  const plain = decodeHtmlEntities(
    stripVlmImageMarkup(text)
      .replace(/\r\n?/g, "\n")
      .replace(HTML_BREAK_RE, "\n")
      .replace(HTML_CELL_END_RE, " ")
      .replace(HTML_LINE_END_RE, "\n")
      .replace(HTML_TAG_RE, "")
  );
  return plain
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * 解析 VLM 文档解析结果（PaddleOCR-VL 系列）。
 *
 * 官方 markdown.text 默认忽略页眉、页脚、页码、脚注等版面块
 * （markdown_ignore_labels），并把图片块渲染成 <div><img/></div> 占位符。
 * 为了拿到完整、可直接翻译的文本，这里优先读取 prunedResult.parsing_res_list：
 * 它包含全部版面块以及 block_bbox 坐标；只有在没有版面块时才回退到 Markdown。
 */
export function parsePaddleDocumentPages(pages = []) {
  const blocks = [];
  const markdowns = [];
  for (const page of pages) {
    for (const result of page?.layoutParsingResults || []) {
      const list = result?.prunedResult?.parsing_res_list;
      if (Array.isArray(list) && list.length) {
        for (const block of list) {
          // 官方版面块的 block_content 一定是字符串；异常结构直接跳过。
          const content =
            typeof block?.block_content === "string" ? block.block_content : "";
          const markdown = normalizeVlmMarkdown(content);
          // 图片类版面块清理后通常为空，直接跳过；其余块（含页眉、页脚、
          // 脚注、页码）全部保留，避免遗漏画面中的文字。
          if (!markdown) continue;
          const poly = normalizePoly(null, block?.block_bbox);
          blocks.push({
            type: block?.block_label || "text",
            markdown,
            text: normalizeVlmPlainText(content) || markdown,
            poly,
          });
        }
        continue;
      }
      const markdown = normalizeVlmMarkdown(result?.markdown?.text);
      if (markdown) markdowns.push(markdown);
    }
  }
  if (!blocks.length && !markdowns.length)
    throw paddleError("PaddleOCR 未返回文档解析结果", "INVALID_RESPONSE");
  const text = blocks.length
    ? blocks.map((block) => block.markdown).join("\n\n")
    : markdowns.join("\n\n");
  // 有版面块时按块输出文字项，并带上官方返回的块坐标；
  // 坐标无效的块只保留在 text 中，避免破坏“坐标必须完整”的结果校验。
  const located = blocks.filter((block) => hasArea(block.poly));
  const items = located.length
    ? located.map(({ text: blockText, poly, type }) => ({
        text: blockText,
        poly,
        type,
      }))
    : text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ text: line, poly: null }));
  return { text, items, format: "markdown" };
}

/** 解析结构分析的版面块，转换为 analyzeLayout 需要的 regions。 */
export function parsePaddleStructurePages(pages = []) {
  const regions = [];
  let fallbackOrder = 0;
  for (const page of pages) {
    for (const result of page?.layoutParsingResults || []) {
      const blocks = result?.prunedResult?.parsing_res_list;
      if (!Array.isArray(blocks)) continue;
      for (const block of blocks) {
        const label = block?.block_label || "text";
        const content = String(block?.block_content || "").trim();
        if (SKIP_EMPTY_LAYOUT_LABELS.has(label) && !content) continue;
        const poly = normalizePoly(null, block?.block_bbox);
        if (!hasArea(poly)) continue;
        const order =
          Number.isInteger(block?.block_order) && block.block_order >= 0
            ? block.block_order
            : fallbackOrder;
        regions.push({ type: label, poly, order });
        fallbackOrder += 1;
      }
    }
  }
  if (!regions.length)
    throw paddleError("PaddleOCR 未返回版面结构", "INVALID_RESPONSE");
  return { regions };
}

/** 提交任务并轮询到完成，返回 JSONL 中的每页结果。 */
async function runPaddleJob(input, api, ctx) {
  if (ctx?.signal?.aborted) throw new DOMException("已取消", "AbortError");
  const token = String(api?.key || "").trim();
  if (!token)
    throw paddleError(
      "PaddleOCR 缺少 AI Studio Access Token",
      "INVALID_CONFIG"
    );
  const blob = ctx.assets.get(input.image);
  if (!blob) throw paddleError("图片数据为空", "INVALID_INPUT");
  const url = String(api.url || PADDLEOCR_JOB_URL).trim();
  const model = api.model || DEFAULT_PADDLEOCR_MODEL;

  // 1. 提交任务：本地图片使用 multipart/form-data，字段格式与官方示例一致。
  const form = new FormData();
  form.append("file", blob, "image.png");
  form.append("model", model);
  form.append("optionalPayload", JSON.stringify(paddleOcrOptionalPayload(api)));
  const submitted = await requestJson(
    url,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    ctx.signal,
    api.httpTimeout
  );
  if (submitted?.code !== 0)
    throw paddleError(
      submitted?.msg || `PaddleOCR 任务提交失败 (${submitted?.code})`
    );
  const jobId = submitted?.data?.jobId;
  if (!jobId) throw paddleError("PaddleOCR 未返回任务 ID", "INVALID_RESPONSE");
  ctx
    .emit?.({ type: "progress", message: "PADDLEOCR_SUBMITTED" })
    ?.catch?.(() => {});

  // 2. 轮询任务状态。
  const jobUrl = `${url.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`;
  let jobData;
  for (;;) {
    const status = await requestJson(
      jobUrl,
      { headers: { Authorization: `Bearer ${token}` } },
      ctx.signal,
      POLL_REQUEST_TIMEOUT_SECONDS
    );
    if (status?.code !== 0)
      throw paddleError(
        status?.msg || `PaddleOCR 任务查询失败 (${status?.code})`
      );
    jobData = status?.data || {};
    if (jobData.state === "failed")
      throw paddleError(jobData.errorMsg || "PaddleOCR 任务解析失败");
    if (jobData.state === "done") break;
    const progress = jobData.extractProgress;
    ctx
      .emit?.({
        type: "progress",
        message: `PADDLEOCR_${String(jobData.state || "running").toUpperCase()}`,
        ...(Number(progress?.totalPages) > 0 && {
          progress: Math.min(
            1,
            Math.max(
              0,
              Number(progress.extractedPages) / Number(progress.totalPages)
            )
          ),
        }),
      })
      ?.catch?.(() => {});
    await delay(POLL_INTERVAL_MS, ctx.signal);
  }

  // 3. 下载 JSONL 结果。
  const jsonUrl = jobData?.resultUrl?.jsonUrl;
  if (!jsonUrl)
    throw paddleError("PaddleOCR 未返回结果地址", "INVALID_RESPONSE");
  const jsonl = await requestText(jsonUrl, ctx.signal, api.httpTimeout);
  const pages = parseJsonl(jsonl);
  if (!pages.length)
    throw paddleError("PaddleOCR 返回了空结果", "INVALID_RESPONSE");
  return pages;
}

/** recognizeText：PP-OCRv5 / PP-OCRv6。 */
export async function recognizePaddleText(input, api, ctx) {
  return parsePaddleOcrPages(await runPaddleJob(input, api, ctx));
}

/** parseImage：PaddleOCR-VL 系列，按版面块输出 Markdown 与文字坐标。 */
export async function parsePaddleDocument(input, api, ctx) {
  return parsePaddleDocumentPages(await runPaddleJob(input, api, ctx));
}

/** analyzeLayout：PP-StructureV3，输出版面块区域。 */
export async function analyzePaddleLayout(input, api, ctx) {
  return parsePaddleStructurePages(await runPaddleJob(input, api, ctx));
}
