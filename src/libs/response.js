/**
 * @file response.js
 * @description 统一的 Fetch Response 解析模块。该模块只负责把底层网络响应转换成业务层需要的数据，
 * 包括 JSON、纯文本、Blob、音频/图片/视频 Base64，以及非 2xx 响应的错误体提取。
 */

import { blobToBase64 } from "./utils";

/**
 * 将 Response 解析为调用方期望的数据结构。
 *
 * @param {Response} res 原生 Fetch Response 实例。
 * @param {"json"|"text"|"blob"|"audio"|null} [expect=null] 调用方显式期望的响应类型。
 * @returns {Promise<*>} 解析后的响应数据；未指定 expect 时会优先尝试 JSON，失败则返回文本。
 * @throws {Error} 当响应不存在、HTTP 状态失败，或完整响应通道误收到 SSE 流时抛出明确错误。
 */
export const parseResponse = async (res, expect = null) => {
  if (!res) {
    throw new Error("Response object does not exist");
  }

  if (!res.ok) {
    const msg = {
      url: res.url,
      status: res.status,
      statusText: res.statusText,
    };

    try {
      const errorText = await res.clone().text();
      try {
        msg.response = JSON.parse(errorText);
      } catch {
        msg.response = errorText;
      }
    } catch (e) {
      msg.response = "Unable to read error body";
    }

    throw new Error(JSON.stringify(msg));
  }

  const contentType = res.headers.get("Content-Type") || "";
  if (expect === "blob") return res.blob();
  if (expect === "text") return res.text();
  if (expect === "json") return res.json();

  if (
    expect === "audio" ||
    contentType.includes("audio") ||
    contentType.includes("image") ||
    contentType.includes("video")
  ) {
    const blob = await res.blob();
    return blobToBase64(blob);
  }

  if (contentType.includes("text/event-stream")) {
    // 完整响应通道无法保留 SSE 的增量语义，遇到流式响应时必须提示调用方改走 fetchStream。
    throw new Error(
      "Received text/event-stream in a non-stream request. Use fetchStream instead."
    );
  }

  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
};
