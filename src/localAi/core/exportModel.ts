import { inflateSync, unzipSync } from "fflate";
import { getFile } from "./opfs";
import { crc32Blob } from "./sha256";
import type { ModelManifest } from "./types";

export interface ExportProgress {
  filesDone: number;
  fileCount: number;
}

type ReadFn = (path: string) => Promise<ArrayBuffer>;

const DEFAULT_MAX_INFLATE_BYTES = 256 * 1024 * 1024;

// 生成零内存拷贝的 ZIP（STORE，method=0）：
// 生产环境直接使用 OPFS File 句柄作为 BlobPart 拼装复合 Blob，
// 仅流式计算 CRC-32 与百字节级 ZIP 头部，导出 2GB 模型时 JS 堆占用 < 1MB。
export async function buildModelZip(
  manifests: ModelManifest[],
  onProgress?: (p: ExportProgress) => void,
  read?: ReadFn
): Promise<Blob> {
  const paths: string[] = [];
  for (const m of manifests) {
    for (const f of m.files) {
      paths.push(`${m.dir}/${f.path}`);
    }
  }

  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const centralRecords: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let done = 0;

  for (const p of paths) {
    const blob: Blob = read ? new Blob([await read(p)]) : await getFile(p);
    const crc = await crc32Blob(blob);
    const size = blob.size;
    const nameBytes = new Uint8Array(encoder.encode(p));

    // Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.byteLength);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed (2.0)
    lv.setUint16(6, 0x0800, true); // general purpose bit flag (UTF-8)
    lv.setUint16(8, 0, true); // compression method: 0 (STORE)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size >>> 0, true); // compressed size
    lv.setUint32(22, size >>> 0, true); // uncompressed size
    lv.setUint16(26, nameBytes.byteLength, true);
    lv.setUint16(28, 0, true); // extra field length
    localHeader.set(nameBytes, 30);

    parts.push(localHeader, blob);

    // Central Directory File Header (46 bytes + filename)
    const cdHeader = new Uint8Array(46 + nameBytes.byteLength);
    const cv = new DataView(cdHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // method: 0 (STORE)
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size >>> 0, true);
    cv.setUint32(24, size >>> 0, true);
    cv.setUint16(28, nameBytes.byteLength, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset >>> 0, true); // local header offset
    cdHeader.set(nameBytes, 46);
    centralRecords.push(cdHeader);

    offset += localHeader.byteLength + size;
    done++;
    onProgress?.({ filesDone: done, fileCount: paths.length });
  }

  let cdSize = 0;
  for (const r of centralRecords) {
    parts.push(r);
    cdSize += r.byteLength;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, centralRecords.length, true);
  ev.setUint16(10, centralRecords.length, true);
  ev.setUint32(12, cdSize >>> 0, true);
  ev.setUint32(16, offset >>> 0, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  return new Blob(parts, { type: "application/zip" });
}

// 从 ZIP 文件中提取条目：
// - STORE (method=0) 条目直接使用 File.slice 引用磁盘字节区间（零内存拷贝，支持 GB 级 ZIP）
// - DEFLATE (method=8) 条目逐项检查解压后总大小（默认上限 256MB）并使用定长缓冲区解压，防止高压缩率文件耗尽内存
export async function extractZipEntries(
  zipFile: File,
  maxInflateBytes = DEFAULT_MAX_INFLATE_BYTES
): Promise<{ name: string; file: File }[]> {
  const limitErr = () =>
    new Error(
      `压缩格式 ZIP 解压后总大小超过 ${Math.round(maxInflateBytes / (1024 * 1024))}MB 内存安全上限，请直接选择解压后的模型文件或本应用导出的无压缩 ZIP`
    );

  const tailLen = Math.min(zipFile.size, 65557);
  const tailBuf = await zipFile.slice(zipFile.size - tailLen, zipFile.size).arrayBuffer();
  const tail = new Uint8Array(tailBuf);
  const tv = new DataView(tailBuf);

  let eocdPos = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }

  if (eocdPos >= 0) {
    const entryCount = tv.getUint16(eocdPos + 10, true);
    const cdSize = tv.getUint32(eocdPos + 12, true);
    const cdOffset = tv.getUint32(eocdPos + 16, true);
    if (cdOffset + cdSize <= zipFile.size) {
      const cdBuf = await zipFile.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
      const cv = new DataView(cdBuf);
      const decoder = new TextDecoder();
      const results: { name: string; file: File }[] = [];
      let p = 0;
      let totalInflatedBytes = 0;
      let parsedAll = true;
      for (let i = 0; i < entryCount && p + 46 <= cdBuf.byteLength; i++) {
        if (cv.getUint32(p, true) !== 0x02014b50) {
          parsedAll = false;
          break;
        }
        const method = cv.getUint16(p + 10, true);
        const compSize = cv.getUint32(p + 20, true);
        const uncompSize = cv.getUint32(p + 24, true);
        const nameLen = cv.getUint16(p + 28, true);
        const extraLen = cv.getUint16(p + 30, true);
        const commentLen = cv.getUint16(p + 32, true);
        const localOffset = cv.getUint32(p + 42, true);
        const entryPath = decoder.decode(new Uint8Array(cdBuf, p + 46, nameLen));
        p += 46 + nameLen + extraLen + commentLen;
        if (entryPath.endsWith("/")) continue;

        const lfhBuf = await zipFile.slice(localOffset, localOffset + 30).arrayBuffer();
        const lv = new DataView(lfhBuf);
        const lfhNameLen = lv.getUint16(26, true);
        const lfhExtraLen = lv.getUint16(28, true);
        const dataOffset = localOffset + 30 + lfhNameLen + lfhExtraLen;
        const baseName = entryPath.split("/").pop() ?? entryPath;

        if (method === 0) {
          const sliced = zipFile.slice(dataOffset, dataOffset + compSize);
          results.push({
            name: baseName,
            file: new File([sliced], baseName),
          });
        } else if (method === 8) {
          if (
            uncompSize === 0xffffffff ||
            compSize === 0xffffffff ||
            uncompSize > maxInflateBytes ||
            totalInflatedBytes + uncompSize > maxInflateBytes
          ) {
            throw limitErr();
          }
          totalInflatedBytes += uncompSize;
          const compBuf = await zipFile.slice(dataOffset, dataOffset + compSize).arrayBuffer();
          const out = new Uint8Array(uncompSize);
          const inflated = inflateSync(new Uint8Array(compBuf), { out });
          if (inflated.byteLength !== uncompSize) {
            throw new Error(`ZIP 条目解压后大小异常: ${baseName}`);
          }
          results.push({
            name: baseName,
            file: new File([new Uint8Array(inflated)], baseName),
          });
        } else {
          parsedAll = false;
          break;
        }
      }
      if (parsedAll && results.length > 0) {
        return results;
      }
    }
  }

  // 兜底分支：同时限制 ZIP 体积与所有条目的解压后累计大小（originalSize）
  if (zipFile.size > maxInflateBytes) {
    throw limitErr();
  }
  let fallbackUncompressedBytes = 0;
  const unpacked = unzipSync(new Uint8Array(await zipFile.arrayBuffer()), {
    filter(file) {
      if (
        file.originalSize > maxInflateBytes ||
        fallbackUncompressedBytes + file.originalSize > maxInflateBytes
      ) {
        throw limitErr();
      }
      fallbackUncompressedBytes += file.originalSize;
      return !file.name.endsWith("/");
    },
  });
  return Object.entries(unpacked).map(([k, bytes]) => {
    const baseName = k.split("/").pop() ?? k;
    return {
      name: baseName,
      file: new File([new Uint8Array(bytes)], baseName),
    };
  });
}

// 触发浏览器下载（扩展 options 页与 web 端均走标准 <a download>）
export function downloadZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
