const DIRECT_PIXELS = 16_000_000;
const DIRECT_EDGE = 8192;
const SOURCE_PIXELS = 24_000_000;
const SOURCE_EDGE = 16384;
const RESIZED_PIXELS = 8_000_000;
const RESIZED_EDGE = 4096;

const read = (blob) =>
  typeof blob.arrayBuffer === "function"
    ? blob.arrayBuffer()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });

export async function readImageDimensions(blob) {
  const header = new DataView(await read(blob.slice(0, 64 * 1024)));
  const invalid = () => new Error("无法读取图片尺寸或图片格式无效");
  if (header.byteLength < 24) throw invalid();
  let width, height;
  const u8 = (offset) => header.getUint8(offset);
  if (
    header.getUint32(0) === 0x89504e47 &&
    header.getUint32(4) === 0x0d0a1a0a &&
    header.getUint32(12) === 0x49484452
  ) {
    width = header.getUint32(16);
    height = header.getUint32(20);
  } else if (
    header.getUint32(0) === 0x52494646 &&
    header.getUint32(8) === 0x57454250 &&
    header.byteLength >= 30
  ) {
    const type = header.getUint32(12);
    if (type === 0x56503858) {
      width = 1 + u8(24) + (u8(25) << 8) + (u8(26) << 16);
      height = 1 + u8(27) + (u8(28) << 8) + (u8(29) << 16);
    } else if (type === 0x5650384c && u8(20) === 0x2f) {
      const bits = header.getUint32(21, true);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    } else if (
      type === 0x56503820 &&
      u8(23) === 0x9d &&
      u8(24) === 1 &&
      u8(25) === 0x2a
    ) {
      width = header.getUint16(26, true) & 0x3fff;
      height = header.getUint16(28, true) & 0x3fff;
    }
  } else if (header.getUint16(0) === 0xffd8) {
    let segment = 2;
    let data = header;
    let start = 0;
    for (let count = 0; count < 4096 && segment + 9 <= blob.size; count++) {
      if (segment + 9 > start + data.byteLength) {
        start = segment;
        data = new DataView(await read(blob.slice(start, start + 64 * 1024)));
      }
      const offset = segment++ - start;
      if (data.getUint8(offset) !== 0xff) break;
      const marker = data.getUint8(offset + 1);
      if (marker === 0xff) continue;
      if (marker === 0xda || marker === 0xd9 || marker === 0) break;
      const length = data.getUint16(offset + 2);
      if (length < 2 || length > blob.size - segment - 1) break;
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (length < 8) break;
        height = data.getUint16(offset + 5);
        width = data.getUint16(offset + 7);
        break;
      }
      segment += 1 + length;
    }
  }
  if (!width || !height) throw invalid();
  return { width, height };
}

export async function imageDecodePlan(blob) {
  const { width, height } = await readImageDimensions(blob);
  const pixels = width * height;
  const edge = Math.max(width, height);
  if (pixels > SOURCE_PIXELS || edge > SOURCE_EDGE) {
    throw new Error(`图片尺寸 ${width}×${height} 超过安全解码上限`);
  }
  const resize = pixels > DIRECT_PIXELS || edge > DIRECT_EDGE;
  return { width, height, resize };
}

export function boundedImageSize(width, height, maxEdge = RESIZED_EDGE) {
  const scale = Math.min(
    1,
    RESIZED_EDGE / Math.max(width, height),
    maxEdge / Math.max(width, height),
    Math.sqrt(RESIZED_PIXELS / (width * height))
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export async function resizeFileTranslationImage(blob, signal, maxEdge) {
  if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  const bitmap = await createImageBitmap(blob);
  let canvas;
  try {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const { width, height } = boundedImageSize(
      bitmap.width,
      bitmap.height,
      maxEdge
    );
    canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图像缩放画布");
    context.drawImage(bitmap, 0, 0, width, height);
    const type = ["image/jpeg", "image/webp"].includes(blob.type)
      ? blob.type
      : "image/png";
    const resized = canvas.convertToBlob
      ? await canvas.convertToBlob({ type, quality: 0.9 })
      : await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    if (!resized) throw new Error("无法缩小图片");
    return resized;
  } finally {
    bitmap.close?.();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
