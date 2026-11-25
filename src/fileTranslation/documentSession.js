const MAX_MEMORY_BYTES = 16 * 1024 ** 2;
const SESSION_LIFETIME = 24 * 60 * 60 * 1000;
const HEARTBEAT_INTERVAL = 60 * 1000;
let database;
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const owner = newId();

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase() {
  if (!database) {
    const opening = new Promise((resolve, reject) => {
      const request = indexedDB.open("kiss-file-translation");
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(new Error("文件翻译存储连接被阻塞"));
      };
      request.onupgradeneeded = () => {
        if (blocked) {
          request.transaction.abort();
          return;
        }
        request.result.createObjectStore("sessions");
        request.result.createObjectStore("results");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        const invalidate = () => {
          if (database === opening) database = undefined;
        };
        db.onclose = invalidate;
        db.onversionchange = () => {
          db.close();
          invalidate();
        };
        resolve(db);
      };
    });
    database = opening;
    opening.catch(() => {
      if (database === opening) database = undefined;
    });
  }
  return database;
}

function memorySize(value, seen = new Set()) {
  if (value == null) return 8;
  if (typeof value === "string") return 8 + value.length * 2;
  if (typeof value !== "object") return 8;
  if (seen.has(value)) return 8;
  seen.add(value);
  if (value instanceof Blob) return 32 + value.size;
  if (ArrayBuffer.isView(value)) return 32 + memorySize(value.buffer, seen);
  if (Object.prototype.toString.call(value) === "[object ArrayBuffer]")
    return 32 + value.byteLength;
  let size = 32;
  for (const key of Object.keys(value)) {
    size += 8 + key.length * 2 + memorySize(value[key], seen);
    if (size > MAX_MEMORY_BYTES) break;
  }
  return size;
}

async function transaction(db, mode, action) {
  const tx = db.transaction(["sessions", "results"], mode);
  const completed = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error("文件翻译存储事务已取消"));
  });
  // An individual request can fail before the transaction itself aborts.
  completed.catch(() => {});
  try {
    const result = await action(
      tx.objectStore("sessions"),
      tx.objectStore("results")
    );
    await completed;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await completed.catch(() => {});
    throw error;
  }
}

const resultRange = (id) => IDBKeyRange.bound([id], [id, []], false, true);
const EPUB_CACHE_DIRECTORY = "file-translation-epub";

export async function openEpubCacheDirectory() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(EPUB_CACHE_DIRECTORY, { create: true });
}

async function removeSession(db, id, canRemove) {
  const opfs = await transaction(db, "readwrite", async (sessions, results) => {
    const session = await requestResult(sessions.get(id));
    if (!session || !canRemove(session)) return false;
    if (session.opfs) {
      sessions.put({ ...session, state: "deleting" }, id);
      return true;
    }
    results.delete(resultRange(id));
    sessions.delete(id);
    return false;
  });
  if (!opfs) return;
  try {
    const directory = await openEpubCacheDirectory();
    await directory.removeEntry(id, { recursive: true });
  } catch (error) {
    if (error.name !== "NotFoundError") return;
  }
  await transaction(db, "readwrite", async (sessions, results) => {
    const session = await requestResult(sessions.get(id));
    if (session?.state !== "deleting") return;
    results.delete(resultRange(id));
    sessions.delete(id);
  });
}

async function collectExpired(db) {
  const cutoff = Date.now() - SESSION_LIFETIME;
  const expiredSession = (session) =>
    session &&
    (session.state === "closed" ||
      session.state === "deleting" ||
      session.updatedAt <= cutoff);
  const expired = await transaction(
    db,
    "readonly",
    (sessions) =>
      new Promise((resolve, reject) => {
        const ids = [];
        const cursor = sessions.openCursor();
        cursor.onerror = () => reject(cursor.error);
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) return resolve(ids);
          if (expiredSession(entry.value))
            ids.push({ id: entry.key, owner: entry.value.owner });
          entry.continue();
        };
      })
  );
  for (const { id, owner: previousOwner } of expired) {
    await removeSession(
      db,
      id,
      (session) => session.owner === previousOwner && expiredSession(session)
    );
  }
}

export function cleanDocumentSessions() {
  return typeof indexedDB === "undefined"
    ? Promise.resolve()
    : openDatabase().then(collectExpired);
}

export function createDocumentSession({ opfs = false } = {}) {
  const id = newId();
  let closed = false;
  let bytes = 0;
  let heartbeat;
  const memory = new Map();
  const record = (state) => ({ owner, state, opfs, updatedAt: Date.now() });
  const initialize = (async () => {
    if (typeof indexedDB === "undefined") return null;
    try {
      const db = await openDatabase();
      if (closed) return null;
      await transaction(db, "readwrite", (sessions) =>
        requestResult(sessions.add(record("active"), id))
      );
      if (!closed) {
        heartbeat = setInterval(() => {
          void access("readwrite", () => {}).catch(() => {});
        }, HEARTBEAT_INTERVAL);
      }
      return true;
    } catch {
      return false;
    }
  })();
  const checkOpen = () => {
    if (closed) throw new DOMException("文件翻译会话已结束", "AbortError");
  };
  async function access(mode, action) {
    const db = await openDatabase();
    checkOpen();
    return transaction(db, mode, async (sessions, results) => {
      checkOpen();
      const session = await requestResult(sessions.get(id));
      checkOpen();
      if (session?.owner !== owner || session.state !== "active")
        throw new Error("文件翻译会话已过期");
      if (mode === "readwrite") sessions.put(record("active"), id);
      return action(results);
    });
  }
  void cleanDocumentSessions().catch(() => {});
  return {
    async directoryId() {
      const persisted = await initialize;
      checkOpen();
      if (!opfs || !persisted) throw new Error("EPUB 磁盘缓存不可用");
      await access("readwrite", () => {});
      return id;
    },
    async get(key) {
      const persisted = await initialize;
      checkOpen();
      return persisted
        ? access("readonly", (results) => requestResult(results.get([id, key])))
        : memory.get(key)?.value;
    },
    async put(key, value) {
      const persisted = await initialize;
      checkOpen();
      if (persisted) {
        await access("readwrite", (results) =>
          requestResult(results.put(value, [id, key]))
        );
        return;
      }
      const size = memorySize(key) + memorySize(value);
      const nextBytes = bytes + size - (memory.get(key)?.size || 0);
      if (nextBytes > MAX_MEMORY_BYTES)
        throw new Error("文件翻译内存暂存已满，请先导出已完成的内容");
      memory.set(key, { value, size });
      bytes = nextBytes;
    },
    async remove(keys) {
      const persisted = await initialize;
      checkOpen();
      if (persisted) {
        await access("readwrite", (results) => {
          for (const key of keys) results.delete([id, key]);
        });
        return;
      }
      for (const key of keys) {
        bytes -= memory.get(key)?.size || 0;
        memory.delete(key);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      memory.clear();
      return initialize
        .then(async (persisted) => {
          if (!persisted) return;
          const db = await openDatabase();
          await transaction(db, "readwrite", async (sessions) => {
            const session = await requestResult(sessions.get(id));
            if (session?.owner === owner && session.state === "active")
              sessions.put(record("closed"), id);
          });
          await removeSession(
            db,
            id,
            (session) => session.owner === owner && session.state !== "active"
          );
        })
        .catch(() => {});
    },
  };
}
