import {
  createDocumentSession,
  openEpubCacheDirectory,
} from "../../fileTranslation/documentSession";
import { LARGE_EPUB_CHAPTER } from "./epubSections";

const MIB = 1024 ** 2;
const DISK_LIMIT = 64 * MIB;

// Keep the candidate opt-in until the browser performance checks pass.
export const EPUB_DISK_CACHE_ENABLED =
  process.env.REACT_APP_EPUB_OPFS_PRELOAD === "true";

export function epubDiskCachePaths(book) {
  const { archive, spineItems, navItemHref, ncxItemHref } = book;
  if (!archive) return [];
  const chapters = new Set(spineItems.map(({ fullPath }) => fullPath));
  const sizes = [...chapters].map((path) => archive.size(path) || 0);
  const bodyBytes = sizes.reduce((total, size) => total + size, 0);
  if (bodyBytes < 8 * MIB && !sizes.some((size) => size > LARGE_EPUB_CHAPTER))
    return [];
  const paths = [...new Set([...chapters, navItemHref, ncxItemHref])].filter(
    (path) => path && archive.has(path)
  );
  const bytes = paths.reduce(
    (total, path) => total + (archive.size(path) || 0),
    0
  );
  return bytes <= DISK_LIMIT ? paths : [];
}

export async function prepareEpubDiskCache(book, paths, signal, onProgress) {
  if (!paths.length || !navigator.storage?.getDirectory) return null;
  const session = createDocumentSession({ opfs: true });
  const files = new Map();
  let written = 0;
  const countBytes = (chunk, controller) => {
    written += chunk.byteLength;
    if (written > DISK_LIMIT) throw new Error("EPUB 缓存超过 64 MiB");
    controller.enqueue(chunk);
  };
  try {
    const id = await session.directoryId();
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const directory = await openEpubCacheDirectory();
    const cache = await directory.getDirectoryHandle(id, { create: true });
    for (const [index, path] of paths.entries()) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      // ZIP paths are lookup keys only and never become disk paths.
      const handle = await cache.getFileHandle(String(index), { create: true });
      const output = await handle.createWritable();
      const relay = new TransformStream({ transform: countBytes });
      const abort = new AbortController();
      const cancel = () => abort.abort();
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      const write = relay.readable.pipeTo(output, { signal: abort.signal });
      const extract = book.archive.stream(path, relay.writable, abort.signal);
      try {
        await Promise.all([write, extract]);
      } catch (error) {
        cancel();
        await Promise.allSettled([write, extract]);
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
      files.set(path, handle);
      onProgress?.(index + 1, paths.length);
    }
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const release = book.archive.useDiskCache(files);
    return {
      async close() {
        await release();
        return session.close();
      },
    };
  } catch {
    await session.close();
    return null;
  }
}
