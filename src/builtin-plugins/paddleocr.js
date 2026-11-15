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

import { fetchData, fetchPatcher } from "../libs/fetch";
import { isBg } from "../libs/browser";
import { logger } from "../libs/log";
import { providerError } from "../providers/capabilities";
import {
  PADDLEOCR_JOB_URL,
  paddleOcrModelInfo,
  paddleOcrOptionalPayload,
} from "./paddleocrModels";

const POLL_INTERVAL_MS = 1500;
const SUBMIT_REQUEST_TIMEOUT_SECONDS = 30;
const POLL_REQUEST_TIMEOUT_SECONDS = 30;
const DOWNLOAD_REQUEST_TIMEOUT_SECONDS = 60;
const MAX_JOB_BUDGET_MS = 90_000;
const MIN_JOB_BUDGET_MS = 30_000;
// 超过该大小先按原尺寸重新编码为 JPEG，避免大 PNG 上传拖慢/卡住任务；
// 不改变宽高，因此文字坐标仍与 prepared.size 一致。
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
// 结构解析中这些块通常不含需要翻译的文字，内容为空时直接跳过。
const SKIP_EMPTY_LAYOUT_LABELS = new Set(["image", "chart", "figure", "seal"]);

const log = logger.child("paddleocr");

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
 * 后台使用 fetchData，让 diagnostics 记录 http.* 状态与耗时；
 * 扩展页面继续用 fetchPatcher，避免 FormData 经过 runtime 消息通道被 JSON 序列化。
 */
async function requestJson(url, init, signal, httpTimeout) {
  if (isBg()) {
    try {
      return await fetchData(url, init, {
        useCache: false,
        usePool: false,
        httpTimeout,
        signal,
        expect: "json",
      });
    } catch (error) {
      throw paddleError(
        `PaddleOCR 请求失败：${error?.message || error}`,
        error?.code || "PROVIDER_ERROR"
      );
    }
  }
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
  if (isBg()) {
    try {
      return await fetchData(
        url,
        {},
        {
          useCache: false,
          usePool: false,
          httpTimeout,
          signal,
          expect: "text",
        }
      );
    } catch (error) {
      throw paddleError(
        `PaddleOCR 结果下载失败：${error?.message || error}`,
        error?.code || "PROVIDER_ERROR"
      );
    }
  }
  const res = await fetchPatcher(url, {}, { signal, httpTimeout });
  const text = await res.text();
  if (!res.ok)
    throw paddleError(
      `PaddleOCR 结果下载失败 (${res.status})：${text.slice(0, 300)}`
    );
  return text;
}

/** 大图按原尺寸重新编码为 JPEG，显著减小上传体积且不改变坐标。 */
async function prepareUploadBlob(blob) {
  if (!(blob instanceof Blob) || blob.size <= MAX_UPLOAD_BYTES) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      let canvas;
      if (typeof OffscreenCanvas !== "undefined") {
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      } else if (typeof document !== "undefined") {
        canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      } else {
        return blob;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      // 透明 PNG 转 JPEG 时默认会变黑；先铺白底，避免影响 OCR。
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      const output = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 })
        : await new Promise((resolve) =>
            canvas.toBlob((value) => resolve(value), "image/jpeg", 0.88)
          );
      if (output && output.size < blob.size) {
        log.info("image.compressed", {
          fromBytes: blob.size,
          toBytes: output.size,
          width: bitmap.width,
          height: bitmap.height,
        });
        return output;
      }
    } finally {
      bitmap.close?.();
    }
  } catch (error) {
    log.warn("image.compress.failed", {
      bytes: blob.size,
      message: error?.message || String(error),
    });
  }
  return blob;
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
  // 按页保存解析结果，保证混合结构（部分页有版面块、部分页只有 Markdown）时不丢内容。
  const pageResults = [];
  for (const page of pages) {
    for (const result of page?.layoutParsingResults || []) {
      const list = result?.prunedResult?.parsing_res_list;
      const blocks = [];
      if (Array.isArray(list)) {
        for (const block of list) {
          // 官方版面块的 block_content 一定是字符串；异常结构直接跳过。
          const content =
            typeof block?.block_content === "string" ? block.block_content : "";
          const markdown = normalizeVlmMarkdown(content);
          // 图片类版面块清理后通常为空，直接跳过；其余块（含页眉、页脚、
          // 脚注、页码）全部保留，避免遗漏画面中的文字。
          if (!markdown) continue;
          blocks.push({
            type: block?.block_label || "text",
            markdown,
            text: normalizeVlmPlainText(content) || markdown,
            poly: normalizePoly(null, block?.block_bbox),
          });
        }
      }
      if (blocks.length) {
        // 同一页只要有版面块就以版面块为准：markdown.text 会忽略页眉等块，
        // 而 parsing_res_list 包含完整文字。
        pageResults.push({
          blocks,
          text: blocks.map((block) => block.markdown).join("\n\n"),
        });
        continue;
      }
      // 整页都拿不到 parsing_res_list 时才回退到官方 Markdown。
      const markdown = normalizeVlmMarkdown(result?.markdown?.text);
      if (markdown) pageResults.push({ blocks: [], text: markdown });
    }
  }
  if (!pageResults.length)
    throw paddleError("PaddleOCR 未返回文档解析结果", "INVALID_RESPONSE");
  const text = pageResults.map((page) => page.text).join("\n\n");
  // 版面块按原始顺序转为文字项，并带上官方返回的块坐标；
  // 没有坐标的块和 Markdown 回退页仍然输出，保证不会漏译。
  const items = pageResults.flatMap((page) =>
    page.blocks.length
      ? page.blocks.map(({ text: blockText, poly, type }) => ({
          text: blockText,
          ...(hasArea(poly) && { poly }),
          type,
        }))
      : page.text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => ({ text: line, poly: null }))
  );
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
  // 使用规范化后的模型名：未知或已下线的模型回退到默认模型，
  // 与能力推导保持一致，避免把旧配置里的模型名原样发给服务端。
  const model = paddleOcrModelInfo(api.model).model;

  const startedAt = Date.now();
  const configuredBudget =
    Number(api.httpTimeout) > 0
      ? Number(api.httpTimeout) * 1000
      : MAX_JOB_BUDGET_MS;
  const deadline = Math.min(
    startedAt +
      Math.max(
        MIN_JOB_BUDGET_MS,
        Math.min(configuredBudget, MAX_JOB_BUDGET_MS)
      ),
    ctx.deadlineAt ?? Infinity
  );
  const remainingMs = () => deadline - Date.now();
  const checkDeadline = (stage) => {
    if (remainingMs() > 0) return;
    throw paddleError(
      `PaddleOCR ${stage}超时（${Math.round(
        (Date.now() - startedAt) / 1000
      )}s）`,
      "PROVIDER_TIMEOUT"
    );
  };
  const timeoutSeconds = (max) =>
    Math.max(1, Math.min(max, Math.floor(remainingMs() / 1000) || 1));

  let jobId = "";
  try {
    // 1. 提交任务：本地图片使用 multipart/form-data，字段格式与官方示例一致。
    const upload = await prepareUploadBlob(blob);
    log.info("job.submit.start", {
      serviceId: api.apiSlug,
      model,
      bytes: upload.size,
      type: upload.type || "",
      elapsedMs: 0,
    });
    checkDeadline("提交");
    const form = new FormData();
    form.append(
      "file",
      upload,
      upload.type === "image/jpeg" ? "image.jpg" : "image.png"
    );
    form.append("model", model);
    form.append(
      "optionalPayload",
      JSON.stringify(paddleOcrOptionalPayload(api))
    );
    const submitted = await requestJson(
      url,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
      ctx.signal,
      timeoutSeconds(SUBMIT_REQUEST_TIMEOUT_SECONDS)
    );
    if (submitted?.code !== 0)
      throw paddleError(
        submitted?.msg || `PaddleOCR 任务提交失败 (${submitted?.code})`
      );
    jobId = submitted?.data?.jobId || "";
    if (!jobId)
      throw paddleError("PaddleOCR 未返回任务 ID", "INVALID_RESPONSE");
    log.info("job.submitted", {
      jobId,
      elapsedMs: Date.now() - startedAt,
    });
    ctx
      .emit?.({ type: "progress", message: "PADDLEOCR_SUBMITTED" })
      ?.catch?.(() => {});

    // 2. 轮询任务状态。
    const jobUrl = `${url.replace(/\/+$/, "")}/${encodeURIComponent(jobId)}`;
    let jobData;
    for (;;) {
      checkDeadline("轮询");
      const pollStartedAt = Date.now();
      const status = await requestJson(
        jobUrl,
        { headers: { Authorization: `Bearer ${token}` } },
        ctx.signal,
        timeoutSeconds(POLL_REQUEST_TIMEOUT_SECONDS)
      );
      if (status?.code !== 0)
        throw paddleError(
          status?.msg || `PaddleOCR 任务查询失败 (${status?.code})`
        );
      jobData = status?.data || {};
      if (jobData.state === "failed")
        throw paddleError(jobData.errorMsg || "PaddleOCR 任务解析失败");
      const progress = jobData.extractProgress;
      log.info("job.poll", {
        jobId,
        state: jobData.state || "unknown",
        elapsedMs: Date.now() - startedAt,
        pollElapsedMs: Date.now() - pollStartedAt,
        ...(Number(progress?.totalPages) > 0 && {
          totalPages: Number(progress.totalPages),
          extractedPages: Number(progress.extractedPages) || 0,
        }),
      });
      if (jobData.state === "done") break;
      ctx
        .emit?.({
          type: "progress",
          message: `PADDLEOCR_${String(
            jobData.state || "running"
          ).toUpperCase()}`,
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
      await delay(
        Math.min(POLL_INTERVAL_MS, Math.max(0, remainingMs())),
        ctx.signal
      );
    }

    // 3. 下载 JSONL 结果。
    const jsonUrl = jobData?.resultUrl?.jsonUrl;
    if (!jsonUrl)
      throw paddleError("PaddleOCR 未返回结果地址", "INVALID_RESPONSE");
    checkDeadline("下载结果");
    const jsonl = await requestText(
      jsonUrl,
      ctx.signal,
      timeoutSeconds(DOWNLOAD_REQUEST_TIMEOUT_SECONDS)
    );
    const pages = parseJsonl(jsonl);
    if (!pages.length)
      throw paddleError("PaddleOCR 返回了空结果", "INVALID_RESPONSE");
    log.info("job.done", {
      jobId,
      pages: pages.length,
      elapsedMs: Date.now() - startedAt,
    });
    return pages;
  } catch (error) {
    log.error("job.failed", {
      jobId,
      elapsedMs: Date.now() - startedAt,
      code: error?.code || "",
      message: error?.message || String(error),
    });
    throw error;
  }
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
