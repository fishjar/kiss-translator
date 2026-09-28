import * as opfs from "./opfs";
import type { ModelFile, Mirror } from "./types";
import { fileUrl } from "./types";

export interface DownloadHooks {
  onProgress: (downloaded: number, total: number, speed: number) => void;
  signal: AbortSignal;
}

export class DownloadError extends Error {}

export function tempPathFor(modelId: string, filePath: string): string {
  return `temp/${modelId}/${filePath.replace(/[/\\]/g, "__")}`;
}

function parseTotal(header: string | null, fallback: number): number {
  if (!header) return fallback;
  const m = header.match(/\/(\d+)\s*$/);
  if (m) return Number(m[1]);
  return fallback;
}

export async function downloadFileToTemp(
  mirror: Mirror,
  source: string,
  file: ModelFile,
  tempPath: string,
  hooks: DownloadHooks,
  base?: string
): Promise<void> {
  const url = fileUrl(mirror, source, file.remotePath ?? file.path, base);
  let existing = (await opfs.statFile(tempPath)) ?? 0;
  if (existing >= file.size) existing = 0;

  const headers: Record<string, string> = {};
  if (existing > 0) headers["Range"] = `bytes=${existing}-`;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: hooks.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new DownloadError(`请求失败: ${(e as Error).message}`);
  }

  if (existing > 0 && !res.headers.get("Content-Range")) existing = 0;
  if (!res.ok) throw new DownloadError(`HTTP ${res.status} ${res.statusText}`.trim());
  if (!res.body) throw new DownloadError("响应无 body");

  const total = parseTotal(
    res.headers.get("Content-Range"),
    existing + (Number(res.headers.get("Content-Length")) || file.size - existing)
  );

  const writable = await opfs.openWritable(tempPath, existing > 0);
  let downloaded = 0;
  const start = performance.now();
  let lastSpeed = 0;
  try {
    if (existing > 0) {
      await writable.seek(existing);
      downloaded = existing;
    }
    const reader = res.body.getReader();
    for (;;) {
      if (hooks.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await writable.write(value);
        downloaded += value.byteLength;
        const elapsed = (performance.now() - start) / 1000;
        if (elapsed > 0) {
          lastSpeed = (downloaded - existing) / elapsed;
        }
        hooks.onProgress(Math.min(downloaded, total), total, lastSpeed);
      }
    }
    await writable.close();
  } catch (e) {
    try {
      await writable.close();
    } catch {
      // 已关闭
    }
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw e;
  }

  if (downloaded !== file.size) {
    throw new DownloadError(
      `下载不完整: ${downloaded}/${file.size}，请重试（将断点续传）`
    );
  }
}
