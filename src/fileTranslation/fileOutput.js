const BLOB_LIMIT = 64 * 1024 ** 2;
const TEMP_LIFETIME = 24 * 60 * 60 * 1000;
let directory;
let lastSweep = 0;
const activeFiles = new Set();

async function temporaryDirectory() {
  if (!navigator.storage?.getDirectory) return null;
  directory ||= navigator.storage
    .getDirectory()
    .then((root) =>
      root.getDirectoryHandle("file-translation-tmp", { create: true })
    )
    .catch(() => {
      directory = undefined;
      return null;
    });
  const dir = await directory;
  const now = Date.now();
  if (dir && (!lastSweep || now - lastSweep >= 60 * 60 * 1000)) {
    lastSweep = now;
    const cutoff = now - TEMP_LIFETIME;
    void (async () => {
      for await (const [name] of dir.entries()) {
        const created = Number(name.split("-")[0]);
        if (created > 0 && created < cutoff && !activeFiles.has(name))
          await dir.removeEntry(name).catch(() => {});
      }
    })().catch(() => {});
  }
  return dir;
}

export async function openTemporaryFile() {
  const dir = await temporaryDirectory();
  if (!dir) return null;
  const name = `${Date.now()}-${crypto.randomUUID()}`;
  activeFiles.add(name);
  const remove = async () => {
    activeFiles.delete(name);
    await dir.removeEntry(name).catch(() => {});
  };
  try {
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    return { handle, writable, remove };
  } catch {
    await remove();
    return null;
  }
}

export function clickFileDownload(name, blob, dispose, lifetime = 30_000) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  try {
    anchor.click();
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      void dispose?.();
    }, lifetime);
  }
}

export async function writeFileDownload(
  name,
  type,
  write,
  { large = false, signal } = {}
) {
  const check = () => {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
  };
  check();
  name =
    name.replace(/[<>:"/\\|?*\p{Cc}]/gu, "-").replace(/[. ]+$/, "") ||
    "translation";
  if (large && typeof window.showSaveFilePicker === "function") {
    let handle;
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name });
    } catch (error) {
      if (error.name === "AbortError") return;
      if (
        ![
          "SecurityError",
          "NotAllowedError",
          "NotSupportedError",
          "TypeError",
        ].includes(error.name)
      )
        throw error;
    }
    if (handle) {
      check();
      const writable = await handle.createWritable();
      try {
        check();
        await write(writable);
        return;
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
    }
  }

  const temporary = large ? await openTemporaryFile() : null;
  if (temporary) {
    try {
      check();
      await write(temporary.writable);
      const file = await temporary.handle.getFile();
      check();
      clickFileDownload(name, file, temporary.remove, TEMP_LIFETIME);
      return;
    } catch (error) {
      await temporary.writable.abort().catch(() => {});
      await temporary.remove();
      throw error;
    }
  }

  const chunks = [];
  let bytes = 0;
  const writable = new WritableStream({
    write(chunk) {
      check();
      if (
        !ArrayBuffer.isView(chunk) ||
        Object.prototype.toString.call(chunk) !== "[object Uint8Array]"
      )
        throw new TypeError("下载流必须写入 Uint8Array");
      if (bytes + chunk.byteLength > BLOB_LIMIT)
        throw new Error(
          "此环境的下载暂存上限为 64 MiB，请使用支持直接写入文件的浏览器"
        );
      bytes += chunk.byteLength;
      chunks.push(chunk);
    },
    abort() {
      chunks.length = 0;
    },
  });
  await write(writable);
  check();
  const blob = new Blob(chunks, { type });
  clickFileDownload(name, blob);
  return blob;
}

export async function writeFileChunks(writable, chunks) {
  const writer = writable.getWriter();
  try {
    for await (const chunk of chunks) await writer.write(chunk);
    await writer.close();
  } catch (error) {
    await writer.abort(error).catch(() => {});
    throw error;
  } finally {
    writer.releaseLock();
  }
}
