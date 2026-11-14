/**
 * @file paddleocr.js
 * @description 适配 PaddleOCR 官方异步任务 API（AI Studio 免费层）。
 *
 * 调用流程与官方示例一致：
 * 1. POST /api/v2/ocr/jobs 上传图片并提交任务；
 * 2. GET  /api/v2/ocr/jobs/{jobId} 轮询任务状态；
 * 3. 任务完成后下载 resultUrl.jsonUrl（JSONL），按模型解析为：
 *    - 文字 OCR：带坐标的文本行 -> recognizeText
 *    - OCR VLM：Markdown -> parseImage
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

/** 把四点多边形或矩形框统一成 `[[x, y], ...]`。 */
function normalizePoly(poly, box) {
  if (
    Array.isArray(poly) &&
    poly.length >= 3 &&
    poly.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((value) => Number.isFinite(Number(value)))
    )
  )
    return poly.map(([x, y]) => [Number(x), Number(y)]);
  if (
    Array.isArray(box) &&
    box.length === 4 &&
    box.every((value) => Number.isFinite(Number(value)))
  ) {
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

/** 解析 VLM 文档解析结果中的 Markdown。 */
export function parsePaddleDocumentPages(pages = []) {
  const texts = [];
  for (const page of pages) {
    for (const result of page?.layoutParsingResults || []) {
      const text = result?.markdown?.text;
      if (typeof text === "string" && text.trim()) texts.push(text.trim());
    }
  }
  if (!texts.length)
    throw paddleError("PaddleOCR 未返回文档解析结果", "INVALID_RESPONSE");
  return { text: texts.join("\n\n"), format: "markdown" };
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

/** parseImage：PaddleOCR-VL 系列，输出整页 Markdown。 */
export async function parsePaddleDocument(input, api, ctx) {
  return parsePaddleDocumentPages(await runPaddleJob(input, api, ctx));
}

/** analyzeLayout：PP-StructureV3，输出版面块区域。 */
export async function analyzePaddleLayout(input, api, ctx) {
  return parsePaddleStructurePages(await runPaddleJob(input, api, ctx));
}
