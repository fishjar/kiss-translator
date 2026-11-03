import { LOG_ACTION, normalizeRecord } from "./record";
import { isExt } from "../client";

// Native runtime APIs are already available in extension contexts. Do not import
// the polyfill here: this module is also reachable from the standalone Web app.
const api = globalThis.browser || globalThis.chrome;
const EXTENSION =
  isExt ||
  /^(chrome|moz)-extension:$/.test(globalThis.location?.protocol || "");
// Firefox loads the Webpack background and Vite host in one document. Their
// module instances differ, but they must use the same direct storage entry.
const SINK = Symbol.for("kiss-translator.diagnostics.sink");
let queue = [];
let dropped = 0;
let timer;
let active = false;

export const setDiagnosticSink = (value) => {
  if (typeof value === "function") globalThis[SINK] = value;
  else delete globalThis[SINK];
};
export function diagnosticEnvironment() {
  if (globalThis.__KISS_CONTEXT__) return globalThis.__KISS_CONTEXT__;
  const path = globalThis.location?.pathname || "";
  if (path.endsWith("offscreen.html")) return "offscreen";
  if (path.endsWith("popup.html")) return "popup";
  if (path.endsWith("options.html")) return "options";
  return "unknown";
}

async function submit(records) {
  const lost = dropped;
  dropped = 0;
  try {
    const sink = globalThis[SINK];
    const result = sink
      ? await sink(records, lost)
      : await api.runtime.sendMessage({
          action: LOG_ACTION,
          args: { operation: "append", records, dropped: lost },
        });
    if (sink ? !result : !result?.ok) dropped += records.length + lost;
  } catch {
    dropped += records.length + lost;
  }
}

async function flush() {
  clearTimeout(timer);
  timer = undefined;
  if (active || !queue.length) return;
  active = true;
  try {
    await submit(queue.splice(0, 50));
  } finally {
    active = false;
    if (queue.length)
      timer = setTimeout(
        flush,
        queue.some((r) => ["warn", "error"].includes(r.level)) ? 0 : 250
      );
  }
}

export function captureDiagnostic(input) {
  if (!EXTENSION || !api?.runtime?.id) return;
  try {
    const record = normalizeRecord({
      ...input,
      environment: diagnosticEnvironment(),
    });
    // A toolbar popup can close in the same action that logged the event.
    // Start every submission immediately, even while another ACK is pending.
    if (record.environment === "popup") {
      void submit([record]);
      return;
    }
    if (queue.length >= 200) {
      queue.shift();
      dropped++;
    }
    queue.push(record);
    if (["warn", "error"].includes(record.level)) void flush();
    else if (!timer) timer = setTimeout(flush, 250);
  } catch {
    /* Diagnostics must never break the caller. */
  }
}

export async function diagnosticRequest(operation, args = {}) {
  const result = await api.runtime.sendMessage({
    action: LOG_ACTION,
    args: { ...args, operation },
  });
  if (!result?.ok) throw new Error(result?.error || "LOG_SERVICE_UNAVAILABLE");
  return result;
}

export async function diagnosticDetail() {
  if (!EXTENSION || !api?.runtime?.id) return { enabled: false, expiresAt: 0 };
  let timer;
  try {
    const shared = globalThis[Symbol.for("kiss-translator.diagnostics.detail")];
    return await Promise.race([
      shared
        ? shared()
        : diagnosticRequest("detailStatus").then((result) => result.detail),
      new Promise((resolve) => {
        timer = setTimeout(
          () => resolve({ enabled: false, expiresAt: 0 }),
          150
        );
      }),
    ]);
  } catch {
    return { enabled: false, expiresAt: 0 };
  } finally {
    clearTimeout(timer);
  }
}
