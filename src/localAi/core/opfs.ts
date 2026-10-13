import { Sha256, sha256Blob } from "./sha256";

let rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

function getRoot(): Promise<FileSystemDirectoryHandle> {
  rootPromise ??= navigator.storage.getDirectory();
  return rootPromise;
}

function splitPath(path: string): { dirs: string[]; name: string } {
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) throw new Error(`empty path: ${path}`);
  const name = segs[segs.length - 1] as string;
  return { dirs: segs.slice(0, -1), name };
}

async function dirOf(path: string): Promise<FileSystemDirectoryHandle> {
  let dir = await getRoot();
  for (const seg of path.split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  return dir;
}

async function fileHandle(path: string): Promise<FileSystemFileHandle> {
  const { dirs, name } = splitPath(path);
  const dir = await dirOf(dirs.join("/"));
  return dir.getFileHandle(name);
}

export async function ensureDir(path: string): Promise<void> {
  await dirOf(path);
}

export async function openWritable(
  path: string,
  keepExistingData = false
): Promise<FileSystemWritableFileStream> {
  const { dirs, name } = splitPath(path);
  const dir = await dirOf(dirs.join("/"));
  const handle = await dir.getFileHandle(name, { create: true });
  return handle.createWritable({ keepExistingData });
}

export async function writeFile(
  path: string,
  data: ArrayBuffer | Uint8Array
): Promise<void> {
  const writable = await openWritable(path);
  await writable.write(
    data instanceof ArrayBuffer ? data : new Uint8Array(data)
  );
  await writable.close();
}

export async function getFile(path: string): Promise<File> {
  const handle = await fileHandle(path);
  return handle.getFile();
}

export async function readFile(path: string): Promise<ArrayBuffer> {
  const file = await getFile(path);
  return file.arrayBuffer();
}

export async function statFile(path: string): Promise<number | undefined> {
  try {
    const file = await getFile(path);
    return file.size;
  } catch {
    return undefined;
  }
}

export async function removeFile(path: string): Promise<void> {
  const { dirs, name } = splitPath(path);
  const dir = await dirOf(dirs.join("/"));
  try {
    await dir.removeEntry(name);
  } catch {
    // 文件不存在
  }
}

export async function removeDir(path: string): Promise<void> {
  try {
    const { dirs, name } = splitPath(path);
    const dir = await dirOf(dirs.join("/"));
    await dir.removeEntry(name, { recursive: true });
  } catch {
    // 目录不存在
  }
}

export async function writeBlobAndHash(
  path: string,
  blob: Blob,
  computeSha256 = false,
  signal?: AbortSignal
): Promise<string | undefined> {
  const hasher = computeSha256 ? new Sha256() : null;
  const writable = await openWritable(path);
  try {
    if (typeof blob.stream === "function") {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            hasher?.update(value);
            await writable.write(value as Uint8Array<ArrayBuffer>);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      const buf = new Uint8Array(await blob.arrayBuffer());
      hasher?.update(buf);
      await writable.write(buf);
    }
    await writable.close();
    return hasher?.digestHex();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      // ignore
    }
    throw err;
  }
}

export async function moveFile(from: string, to: string): Promise<void> {
  const fromHandle = await fileHandle(from);
  const { dirs, name } = splitPath(to);
  const destDir = await dirOf(dirs.join("/"));
  try {
    // OPFS FileSystemFileHandle.move 接收 (目标目录句柄, 文件名)，禁止文件名含 '/'
    await fromHandle.move(destDir, name);
  } catch {
    const data = await fromHandle.getFile();
    await writeBlobAndHash(to, data, false);
    await removeFile(from);
  }
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
  const file = await getFile(path);
  return sha256Blob(file, signal);
}

