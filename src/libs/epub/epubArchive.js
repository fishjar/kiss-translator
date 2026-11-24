import { BlobReader, ZipReader } from "@zip.js/zip.js";

export function normalizePath(path) {
  if (!path) return "";
  const result = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "..") result.pop();
    else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}

const CACHE_BYTES = 16 * 1024 ** 2;
const MAX_ENTRY_BYTES = 64 * 1024 ** 2;

async function waitForRead(job, signal) {
  let abort;
  try {
    if (!signal) return await job.promise;
    return await Promise.race([
      job.promise,
      new Promise((_, reject) => {
        abort = () => reject(new DOMException("已取消", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
    if (--job.readers === 0 && !job.done) job.abort.abort();
  }
}

async function streamCached(file, writable, signal, fromZip) {
  const input = file.stream().getReader();
  const output = writable.getWriter();
  let written = 0;
  let rejectAbort;
  const wait = async (operation) => {
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          rejectAbort = reject;
        }),
      ]);
    } finally {
      rejectAbort = undefined;
    }
  };
  const cancel = () => {
    rejectAbort?.(new DOMException("已取消", "AbortError"));
    void input.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      const chunk = await wait(input.read().catch(() => null));
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (!chunk) break;
      if (chunk.done) {
        await wait(output.close());
        return;
      }
      await wait(output.write(chunk.value));
      written += chunk.value.byteLength;
    }
  } catch (error) {
    void output.abort(error).catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await input.cancel().catch(() => {});
    input.releaseLock();
    output.releaseLock();
  }
  if (!written) return fromZip(writable);
  const remaining = new TransformStream({
    transform(chunk, controller) {
      const skip = Math.min(written, chunk.byteLength);
      written -= skip;
      if (skip < chunk.byteLength) controller.enqueue(chunk.subarray(skip));
    },
  });
  const abort = new AbortController();
  const stop = () => abort.abort();
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();
  const forward = fromZip(remaining.writable, abort.signal);
  const write = remaining.readable.pipeTo(writable, { signal: abort.signal });
  try {
    await Promise.all([forward, write]);
  } catch (error) {
    stop();
    await Promise.allSettled([forward, write]);
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
}

export function readEpubEntry(book, path, options) {
  return book.archive
    ? book.archive.read(path, options)
    : book.filesMap?.[normalizePath(path)];
}

export function hasEpubEntry(book, path) {
  return book.archive
    ? book.archive.has(path)
    : !!book.filesMap?.[normalizePath(path)];
}

export async function openEpubArchive(blob) {
  const reader = new ZipReader(new BlobReader(blob));
  const entries = new Map();
  try {
    for (const entry of await reader.getEntries()) {
      if (entry.directory) continue;
      const path = normalizePath(entry.filename);
      if (!path || entries.has(path))
        throw new Error(`EPUB 包含无法区分的 ZIP 条目: ${entry.filename}`);
      entries.set(path, entry);
    }
  } finally {
    await reader.close();
  }
  const cache = new Map();
  const pending = new Map();
  let cachedBytes = 0;
  let disk;
  const readDisk = async (path, consume) => {
    const current = disk;
    const handle = current?.files.get(path);
    if (!handle) return null;
    const read = (async () => {
      const file = await handle.getFile().catch(() => null);
      return file?.size === entries.get(path)?.uncompressedSize
        ? consume(file)
        : null;
    })();
    current.reads.add(read);
    try {
      return await read;
    } finally {
      current.reads.delete(read);
    }
  };

  const archive = {
    has: (path) => entries.has(normalizePath(path)),
    paths: () => entries.keys(),
    size: (path) => entries.get(normalizePath(path))?.uncompressedSize,
    useDiskCache(files) {
      const current = { files, reads: new Set() };
      disk = current;
      return async () => {
        if (disk === current) disk = undefined;
        await Promise.allSettled(current.reads);
      };
    },
    async read(
      path,
      { cache: retain = true, signal, maxBytes = MAX_ENTRY_BYTES } = {}
    ) {
      path = normalizePath(path);
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (!Number.isFinite(maxBytes) || maxBytes < 0)
        throw new RangeError("EPUB 条目读取预算无效");
      const entry = entries.get(path);
      if (!entry) return undefined;
      const limit = Math.min(maxBytes, MAX_ENTRY_BYTES);
      const tooLarge = () => new Error(`EPUB 条目超过单次读取上限: ${path}`);
      if (entry.uncompressedSize > limit) throw tooLarge();
      const previous = cache.get(path);
      if (previous) {
        cache.delete(path);
        cache.set(path, previous);
        return previous;
      }
      let job = pending.get(path);
      if (!job || job.abort.signal.aborted) {
        const current = {
          abort: new AbortController(),
          readers: 0,
          done: false,
        };
        current.promise = (async () => {
          const bytes = await readDisk(path, (file) =>
            file.arrayBuffer().catch(() => null)
          );
          if (current.abort.signal.aborted)
            throw new DOMException("已取消", "AbortError");
          if (bytes) {
            if (bytes.byteLength > entry.uncompressedSize) throw tooLarge();
            return new Uint8Array(bytes);
          }
          const output = new Uint8Array(entry.uncompressedSize);
          let size = 0;
          await entry.getData(
            new WritableStream({
              write(chunk) {
                if (size + chunk.byteLength > output.byteLength)
                  throw tooLarge();
                output.set(chunk, size);
                size += chunk.byteLength;
              },
            }),
            { checkSignature: true, signal: current.abort.signal }
          );
          if (size !== output.byteLength)
            throw new Error(`EPUB 条目大小不符: ${path}`);
          return output;
        })().finally(() => {
          current.done = true;
          if (pending.get(path) === current) pending.delete(path);
        });
        job = current;
        pending.set(path, job);
      }
      job.readers++;
      const bytes = await waitForRead(job, signal);
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      if (retain && bytes.byteLength <= CACHE_BYTES && !cache.has(path)) {
        cache.set(path, bytes);
        cachedBytes += bytes.byteLength;
        while (cachedBytes > CACHE_BYTES) {
          const oldest = cache.keys().next().value;
          cachedBytes -= cache.get(oldest).byteLength;
          cache.delete(oldest);
        }
      }
      return bytes;
    },
    async stream(path, writable, signal) {
      path = normalizePath(path);
      const entry = entries.get(path);
      if (!entry) {
        const error = new Error(`找不到 EPUB 条目: ${path}`);
        void writable.abort(error).catch(() => {});
        throw error;
      }
      const fromZip = (target, localSignal = signal) =>
        entry.getData(target, { checkSignature: true, signal: localSignal });
      const used = await readDisk(path, async (file) => {
        await streamCached(file, writable, signal, fromZip);
        return true;
      });
      if (!used) return fromZip(writable);
    },
  };
  return archive;
}
