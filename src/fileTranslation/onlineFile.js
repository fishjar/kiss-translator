import { fileError } from "./protocol";
import { openTemporaryFile } from "./fileOutput";

const MAX_BYTES = 100 * 1024 ** 2;
const extensions = {
  "application/pdf": "pdf",
  "application/epub+zip": "epub",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const supportedName = /\.(?:pdf|epub|txt|md|markdown|png|jpe?g|webp)$/i;
const temporaryFiles = new WeakMap();

export function releaseOnlineFile(file) {
  const remove = file && temporaryFiles.get(file);
  if (remove) {
    temporaryFiles.delete(file);
    void remove();
  }
}

export function onlineFileUrl(text) {
  const value = text?.trim();
  if (!value || !/^https?:\/\/[^\s]+$/i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function decodeName(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function downloadOnlineFile(url, signal) {
  const response = await fetch(url.href, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  try {
    if (!response.ok)
      throw fileError("file_online_http", String(response.status));
    const type = (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const disposition = response.headers.get("content-disposition") || "";
    const encoded = disposition.match(
      /;\s*filename\*=utf-8'[^']*'([^;]+)/i
    )?.[1];
    const plain = disposition.match(
      /;\s*filename\s*=\s*(?:"([^"]+)"|([^;]+))/i
    );
    const path = new URL(response.url || url.href).pathname;
    const pathName = decodeName(path.split("/").pop() || "");
    let name = (
      (encoded && decodeName(encoded)) ||
      plain?.[1] ||
      plain?.[2] ||
      pathName
    )
      .trim()
      .split(/[/\\]/)
      .pop();
    const extension = Object.hasOwn(extensions, type) ? extensions[type] : "";
    if (type === "text/html" || type === "application/xhtml+xml")
      throw fileError("file_online_format", "");
    if (extension) {
      const expected =
        extension === "md"
          ? /\.(md|markdown)$/i
          : extension === "txt"
            ? /\.(txt|md|markdown)$/i
            : extension === "jpg"
              ? /\.jpe?g$/i
              : new RegExp(`\\.${extension}$`, "i");
      if (!expected.test(name)) name = `${name || "download"}.${extension}`;
    } else if (!supportedName.test(name)) {
      if (!supportedName.test(pathName))
        throw fileError("file_online_format", "");
      name = pathName.split(/[/\\]/).pop();
    }
    if (Number(response.headers.get("content-length")) > MAX_BYTES)
      throw fileError("file_online_limit", "");
    if (!response.body) throw fileError("file_online_empty", "");
    const temporary = await openTemporaryFile();
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        if (signal?.aborted) throw new DOMException("已取消", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw fileError("file_online_limit", "");
        if (temporary) await temporary.writable.write(value);
        else chunks.push(value);
      }
      if (!bytes) throw fileError("file_online_empty", "");
      if (temporary) {
        await temporary.writable.close();
        const file = new File([await temporary.handle.getFile()], name, {
          type,
        });
        temporaryFiles.set(file, temporary.remove);
        return file;
      }
      return new File(chunks, name, { type });
    } catch (error) {
      if (temporary) {
        await temporary.writable.abort().catch(() => {});
        await temporary.remove();
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    void response.body?.cancel().catch(() => {});
    throw error;
  }
}
