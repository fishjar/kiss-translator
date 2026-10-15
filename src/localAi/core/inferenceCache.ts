import type { Settings } from "./types";

export const INFERENCE_CACHE_VERSION = 1;
const DB_NAME = "kiss-ai-inference-cache";
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
type Policy = Pick<Settings, "inferenceCacheEnabled" | "inferenceCacheMB" | "inferenceCacheDays">;
type Entry = { key: string; size: number; created: number; used: number };
const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const complete = (tx: IDBTransaction) => {
  const done = new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = tx.onerror = () => reject(tx.error || new Error("Cache transaction failed"));
  });
  void done.catch(() => {});
  return done;
};
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function canonical(value: any): Promise<any> {
  if (value instanceof Blob) return ["blob", await digest(await value.arrayBuffer())];
  if (value instanceof ArrayBuffer) return ["buffer", await digest(value)];
  if (ArrayBuffer.isView(value)) return [value.constructor.name,
    await digest(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer)];
  if (Array.isArray(value)) return ["array", await Promise.all(value.map(canonical))];
  if (value && typeof value === "object") return ["object", await Promise.all(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined).map(async (key) => [key, await canonical(value[key])]))];
  return [typeof value, value];
}
export async function inferenceCacheKey(value: unknown): Promise<string> {
  return digest(new TextEncoder().encode(JSON.stringify(await canonical(value))).buffer);
}
function sizeOf(value: any): number {
  if (value instanceof Blob || value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    throw new Error("Binary results are not cached");
  if (typeof value === "string") {
    if (value.startsWith("blob:")) throw new Error("Transient URL cannot be cached");
    return new TextEncoder().encode(value).byteLength;
  }
  if (value && typeof value === "object") return Object.entries(value).reduce((total, [key, item]) => total + key.length * 2 + sizeOf(item), 0);
  return 8;
}

/** Separate from model files and HTTP translation caches. Failures are best-effort. */
export class InferenceCache {
  private db?: Promise<IDBDatabase>;
  private open() {
    if (!this.db) this.db = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("entries", { keyPath: "key" });
        req.result.createObjectStore("results");
        req.result.createObjectStore("meta");
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Cache database blocked"));
    }).catch((error) => { this.db = undefined; throw error; });
    return this.db;
  }
  async generation(): Promise<number | null> {
    try {
      const tx = (await this.open()).transaction("meta");
      return (await request(tx.objectStore("meta").get("generation"))) || 0;
    } catch { return null; }
  }
  async get(key: string, policy: Policy): Promise<{ value: any } | null> {
    if (!policy.inferenceCacheEnabled) return null;
    try {
      const tx = (await this.open()).transaction(["entries", "results"], "readwrite");
      const done = complete(tx);
      const entries = tx.objectStore("entries"), results = tx.objectStore("results");
      const entry: Entry | undefined = await request(entries.get(key));
      if (!entry || Date.now() - entry.created >= policy.inferenceCacheDays * 86400000) {
        if (entry) { entries.delete(key); results.delete(key); }
        await done; return null;
      }
      const value = await request(results.get(key));
      entries.put({ ...entry, used: Date.now() });
      await done;
      return value === undefined ? null : { value };
    } catch { return null; }
  }
  async put(key: string, value: any, generation: number | null, policy: Policy, signal?: AbortSignal) {
    if (!policy.inferenceCacheEnabled || generation === null) return;
    try {
      if (value?.aborted) return;
      const size = sizeOf(value), budget = policy.inferenceCacheMB * 1024 * 1024;
      if (size > MAX_ENTRY_BYTES || size > budget) return;
      const clone = structuredClone(value);
      const tx = (await this.open()).transaction(["entries", "results", "meta"], "readwrite");
      const done = complete(tx);
      const abort = () => { try { tx.abort(); } catch { /* Already finished. */ } };
      signal?.addEventListener("abort", abort, { once: true });
      void done.finally(() => signal?.removeEventListener("abort", abort)).catch(() => {});
      if (signal?.aborted) { abort(); await done; return; }
      const entries = tx.objectStore("entries"), results = tx.objectStore("results");
      if (((await request(tx.objectStore("meta").get("generation"))) || 0) !== generation) { await done; return; }
      const all: Entry[] = await request(entries.getAll());
      let total = size;
      const live: Entry[] = [];
      for (const entry of all) {
        if (entry.key === key || Date.now() - entry.created >= policy.inferenceCacheDays * 86400000) {
          entries.delete(entry.key); results.delete(entry.key);
        } else { total += entry.size; live.push(entry); }
      }
      for (const entry of live.sort((a, b) => a.used - b.used)) {
        if (total <= budget) break;
        entries.delete(entry.key); results.delete(entry.key); total -= entry.size;
      }
      entries.put({ key, size, created: Date.now(), used: Date.now() });
      results.put(clone, key);
      await done;
    } catch { /* Cache failures must not fail inference. */ }
  }
  async clear() {
    const tx = (await this.open()).transaction(["entries", "results", "meta"], "readwrite");
    const done = complete(tx);
    const meta = tx.objectStore("meta");
    const generation = ((await request(meta.get("generation"))) || 0) + 1;
    meta.put(generation, "generation");
    tx.objectStore("entries").clear(); tx.objectStore("results").clear();
    await done;
  }
  async stats(policy: Policy) {
    const tx = (await this.open()).transaction(["entries", "results"], "readwrite");
    const done = complete(tx), entries = tx.objectStore("entries");
    const all: Entry[] = await request(entries.getAll());
    let count = 0, bytes = 0;
    const live: Entry[] = [];
    for (const entry of all) {
      if (Date.now() - entry.created >= policy.inferenceCacheDays * 86400000) {
        entries.delete(entry.key); tx.objectStore("results").delete(entry.key);
      } else { count++; bytes += entry.size; live.push(entry); }
    }
    for (const entry of live.sort((a, b) => a.used - b.used)) {
      if (bytes <= policy.inferenceCacheMB * 1048576) break;
      entries.delete(entry.key); tx.objectStore("results").delete(entry.key);
      bytes -= entry.size; count--;
    }
    await done; return { count, bytes };
  }
}
