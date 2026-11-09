import type { InputAdjustment, Settings } from "./types";

export function checkFileSize(bytes: number, kind: "image" | "audio", settings: Settings): void {
  const limit = kind === "image" ? settings.maxImageFileMB : settings.maxAudioFileMB;
  if (bytes > limit * 1024 ** 2) {
    throw new Error(`INPUT_LIMIT_EXCEEDED: ${kind === "image" ? "图片" : "音频"}文件超过 ${limit} MB 上限`);
  }
}

export function checkInputCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw new Error(String(signal.reason || "REQUEST_CANCELLED: 输入处理已取消"));
}

export function imageDimensions(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export async function prepareImage(blob: Blob, settings: Settings, signal: AbortSignal) {
  if (!blob || typeof blob.size !== "number" || typeof blob.arrayBuffer !== "function")
    throw new Error("INPUT_INVALID: 图片输入必须为 Blob");
  checkFileSize(blob.size, "image", settings);
  checkInputCancelled(signal);
  const bitmap = await createImageBitmap(blob);
  try {
    checkInputCancelled(signal);
    const original = { width: bitmap.width, height: bitmap.height };
    const size = imageDimensions(bitmap.width, bitmap.height, settings.maxImageEdge);
    if (size.width === original.width && size.height === original.height) {
      return { blob, original, size, adjustment: undefined };
    }
    const canvas = new OffscreenCanvas(size.width, size.height);
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("INPUT_INVALID: 无法缩放图片");
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const resized = await canvas.convertToBlob({ type: "image/png" });
      checkInputCancelled(signal);
      const adjustment: InputAdjustment = {
        kind: "image", original: Math.max(original.width, original.height),
        processed: Math.max(size.width, size.height),
        message: `图片已等比例缩小：${original.width}×${original.height} → ${size.width}×${size.height}`,
      };
      return { blob: resized, original, size, adjustment };
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    bitmap.close();
  }
}

export function cropAudio(audio: Float32Array, settings: Settings) {
  const maxSamples = Math.min(audio.length, settings.maxAsrMinutes * 60 * 16000);
  if (audio.length <= maxSamples) return { audio, adjustment: undefined };
  const adjustment: InputAdjustment = {
    kind: "audio", original: audio.length / 16000, processed: maxSamples / 16000,
    message: `音频已截取开头 ${maxSamples / 16000} 秒（原 ${ (audio.length / 16000).toFixed(1) } 秒）`,
  };
  return { audio: audio.slice(0, maxSamples), adjustment };
}

export function cropTtsText(text: string, settings: Settings) {
  let count = 0, end = 0, original = 0;
  for (const char of text) {
    original++;
    if (count < settings.maxTtsCharacters) { end += char.length; count++; }
  }
  if (original <= count) return { text, adjustment: undefined };
  const adjustment: InputAdjustment = {
    kind: "text", original, processed: count,
    message: `TTS 文字已截取前 ${count} 个字符（原 ${original} 个字符）`,
  };
  return { text: text.slice(0, end), adjustment };
}
