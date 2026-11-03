import { LOG_LIMITS, matches } from "./record";

export function createLogStore({
  indexedDB = globalThis.indexedDB,
  limits = LOG_LIMITS,
  now = Date.now,
  name = "kiss-diagnostics",
} = {}) {
  let database;
  const open = () => {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("logs", {
            keyPath: "id",
            autoIncrement: true,
          });
          request.result.createObjectStore("meta");
        };
        request.onerror = () => {
          database = undefined;
          reject(request.error);
        };
        request.onblocked = () => {
          database = undefined;
          reject(new Error("LOG_DATABASE_BLOCKED"));
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => {
            request.result.close();
            database = undefined;
          };
          resolve(request.result);
        };
      });
    return database;
  };
  const transaction = async (run) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["logs", "meta"], "readwrite");
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () =>
        reject(tx.error || new Error("LOG_TRANSACTION_FAILED"));
      run(tx.objectStore("logs"), tx.objectStore("meta"), (value) => {
        result = value;
      });
    });
  };
  // IDB serializes overlapping readwrite transactions, including concurrent senders.
  const maintain = (entries = [], dropped = 0, visit) =>
    transaction((logs, meta, done) => {
      const request = meta.get("stats");
      request.onsuccess = () => {
        const stats = request.result || { count: 0, bytes: 0, dropped: 0 };
        let changed = !request.result || entries.length > 0 || dropped > 0;
        stats.dropped += Math.max(0, Number(dropped) || 0);
        for (const record of entries) {
          logs.add(record);
          stats.count++;
          stats.bytes += record.bytes;
        }
        const cursor = logs.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (
            item &&
            (item.value.time < now() - limits.days * 86400000 ||
              stats.count > limits.count ||
              stats.bytes > limits.bytes)
          ) {
            stats.count--;
            changed = true;
            stats.bytes -= item.value.bytes;
            item.delete();
            item.continue();
            return;
          }
          if (changed) meta.put(stats, "stats");
          if (visit) visit(logs, stats, done);
          else done(stats);
        };
      };
    });
  return {
    append: (entries, dropped) => maintain(entries, dropped),
    query: (filter = {}, { before, limit = 100, snapshot } = {}) =>
      maintain([], 0, (logs, stats, done) => {
        const records = [];
        const upper = Math.min(
          before || Infinity,
          snapshot ? snapshot + 1 : Infinity
        );
        const range = Number.isFinite(upper)
          ? IDBKeyRange.upperBound(upper, true)
          : undefined;
        const cursor = logs.openCursor(range, "prev");
        let top = snapshot;
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) {
            done({ records, stats, snapshot: top, next: null });
            return;
          }
          top ??= item.key;
          if (matches(item.value, filter)) {
            if (records.length >= Math.min(200, Math.max(1, limit))) {
              done({
                records,
                stats,
                snapshot: top,
                next: records[records.length - 1].id,
              });
              return;
            }
            records.push(item.value);
          }
          item.continue();
        };
      }),
    clear: () =>
      transaction((logs, meta, done) => {
        logs.clear();
        meta.clear();
        done({ count: 0, bytes: 0, dropped: 0 });
      }),
    close: async () => {
      if (database) (await database).close();
      database = undefined;
    },
  };
}
