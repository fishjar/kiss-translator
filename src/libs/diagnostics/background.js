import { createLogStore } from "./store";
import { LOG_LIMITS, normalizeRecord } from "./record";
import { createDetailPolicy } from "./policy";
import { withoutBodies } from "./privacy";

export function createDiagnosticsBackend({
  browser,
  getLevel,
  store = createLogStore(),
  detail = createDetailPolicy(browser),
}) {
  // Independent bundles sharing this document also share the policy reader.
  globalThis[Symbol.for("kiss-translator.diagnostics.detail")] = detail.status;
  let failure = null;
  const append = async (records, dropped = 0, sender) => {
    const internal = sender?.url?.startsWith(browser.runtime.getURL(""));
    const source = sender
      ? {
          environment: internal
            ? sender.url.includes("offscreen.html")
              ? "offscreen"
              : sender.url.includes("options.html")
                ? "options"
                : "popup"
            : "content",
          tabId: sender.tab?.id,
          frameId: sender.frameId,
          url: sender.origin || sender.url,
        }
      : { environment: "background" };
    const enabled = (await detail.status()).enabled;
    const normalized = records
      .slice(0, 50)
      .filter((record) => record && typeof record === "object")
      .map((record) =>
        normalizeRecord(enabled ? record : withoutBodies(record), source)
      );
    const stats = await store.append(
      normalized,
      Math.min(100000, Math.max(0, Number(dropped) || 0))
    );
    failure = null;
    return stats;
  };
  const safeAppend = async (...args) => {
    try {
      return await append(...args);
    } catch {
      failure = "LOG_STORAGE_FAILED";
      return undefined;
    }
  };
  return {
    append: safeAppend,
    async handle(args, sender) {
      if (!sender || sender.id !== browser.runtime.id)
        return { ok: false, error: "LOG_ACCESS_DENIED" };
      const ownPage = sender.url?.startsWith(browser.runtime.getURL(""));
      if (args?.operation !== "append" && !ownPage)
        return { ok: false, error: "LOG_ACCESS_DENIED" };
      try {
        if (args?.operation === "detailStatus")
          return { ok: true, detail: await detail.status() };
        if (args?.operation === "setDetail")
          return { ok: true, detail: await detail.set(args.enabled === true) };
        if (args?.operation === "append") {
          if (!Array.isArray(args.records) || args.records.length > 50)
            throw new Error("LOG_INVALID_BATCH");
          const stats = await safeAppend(args.records, args.dropped, sender);
          return { ok: !!stats, stats, error: failure };
        }
        if (args?.operation === "clear") {
          await store.clear();
          failure = null;
          return { ok: true };
        }
        if (!["query", "status"].includes(args?.operation))
          return { ok: false, error: "LOG_INVALID_OPERATION" };
        const result = await store.query(args.filter, args.page);
        return {
          ok: true,
          ...result,
          consoleLevel: await getLevel(),
          limits: LOG_LIMITS,
          detail: await detail.status(),
          storageError: failure,
        };
      } catch {
        failure = "LOG_STORAGE_FAILED";
        return { ok: false, error: failure };
      }
    },
  };
}
