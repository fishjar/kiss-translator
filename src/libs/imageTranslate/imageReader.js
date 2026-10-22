/**
 * @file imageReader.js
 * @description 前端图片提取、跨域容错与预裁剪压缩模块。
 */

import { sendBgMsg } from "../msg";
import { MSG_FETCH } from "../../config";

const MAX_IMAGE_EDGE = 2048;

/**
 * 将图片裁剪或预缩放至安全规格，避免向后台传输超大图像
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source 图像数据源
 * @param {Object} options 裁剪与缩放选项
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export function cropAndCompressImage(
  source,
  { x = 0, y = 0, width, height, dpr = 1, maxEdge = MAX_IMAGE_EDGE } = {}
) {
  return new Promise((resolve, reject) => {
    try {
      const srcWidth =
        width != null ? width * dpr : source.naturalWidth || source.width;
      const srcHeight =
        height != null ? height * dpr : source.naturalHeight || source.height;
      const srcX = x * dpr;
      const srcY = y * dpr;

      if (!srcWidth || !srcHeight) {
        return reject(new Error("无效的图像尺寸"));
      }

      // 等比缩小超大图像
      const scale = Math.min(1, maxEdge / Math.max(srcWidth, srcHeight));
      const targetWidth = Math.max(1, Math.floor(srcWidth * scale));
      const targetHeight = Math.max(1, Math.floor(srcHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        return reject(new Error("无法创建 Canvas 2D 上下文"));
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 裁剪并缩放绘制到目标 canvas
      ctx.drawImage(
        source,
        srcX,
        srcY,
        srcWidth,
        srcHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("图像导出 Blob 失败"));
        } else {
          resolve({ blob, width: targetWidth, height: targetHeight });
        }
      }, "image/png");
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 安全读取网页 <img> 标签的图像数据为 Blob，若遇跨域污染则通过后台代理拉取
 * @param {HTMLImageElement} img 网页 img 元素
 * @returns {Promise<{ blob: Blob, width: number, height: number }>}
 */
export async function readImageAsBlob(img) {
  if (!img) {
    throw new Error("无效的图片元素");
  }

  // 1. 尝试直接通过本地 Canvas 导出（最快）
  try {
    return await cropAndCompressImage(img, {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      dpr: 1,
    });
  } catch (err) {
    // Canvas 被污染或失败时继续尝试网络读取
  }

  // 2. 获取图片 URL (优先 currentSrc)
  const src = img.currentSrc || img.src;
  if (!src) {
    throw new Error("未获取到图片源地址");
  }

  // 如果是 data:URL 或 blob:URL
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        return await cropAndCompressImage(bitmap);
      } finally {
        bitmap.close?.();
      }
    } catch (err) {
      throw new Error("当前图片读取受限，请使用截图翻译");
    }
  }

  // 3. 网络请求：先直接 fetch，遇跨域受限则通过后台代理 MSG_FETCH
  try {
    const res = await fetch(src, { mode: "cors" });
    if (res.ok) {
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      try {
        return await cropAndCompressImage(bitmap);
      } finally {
        bitmap.close?.();
      }
    }
  } catch {
    // 忽略直接 fetch 报错，尝试后台代理
  }

  // 4. 后台 fetch 代理兜底
  try {
    const response = await sendBgMsg(MSG_FETCH, {
      input: src,
      init: { mode: "cors" },
      opts: { useCache: false },
    });
    let blob = null;
    if (typeof response === "string") {
      if (response.startsWith("data:") || response.startsWith("blob:")) {
        const res = await fetch(response);
        blob = await res.blob();
      } else {
        const res = await fetch(`data:image/png;base64,${response}`);
        blob = await res.blob();
      }
    } else if (response instanceof Blob) {
      blob = response;
    } else if (response?.data) {
      blob = new Blob([response.data], {
        type: response.headers?.["content-type"] || "image/png",
      });
    }

    if (blob) {
      const bitmap = await createImageBitmap(blob);
      try {
        return await cropAndCompressImage(bitmap);
      } finally {
        bitmap.close?.();
      }
    }
  } catch {
    // 代理也失败
  }

  throw new Error("当前图片读取受限，请使用截图翻译");
}

/**
 * 将 Blob 对象转换为 DataURL 字符串，便于消息跨进程传输
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
