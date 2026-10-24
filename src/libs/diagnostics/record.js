import { networkFields } from "./privacy";

export const LOG_LIMITS = {
  days: 7,
  count: 10000,
  bytes: 10 * 1024 * 1024,
  recordBytes: 16 * 1024,
};
export const LOG_ACTION = "kiss-diagnostics";
export const LEVELS = ["debug", "info", "warn", "error"];

// Only explicit metadata crosses the persistence boundary. Never serialize inputs.
const META = new Set([
  "taskId",
  "requestId",
  "stage",
  "elapsedMs",
  "modelId",
  "serviceId",
  "service",
  "method",
  "code",
  "backend",
  "count",
  "attempt",
  "cacheHit",
  "networkId",
  "outcome",
  "repeated",
]);
const identifier = (value, limit = 160) =>
  String(value ?? "")
    .replace(/[^a-zA-Z0-9_.:/-]/g, "_")
    .slice(0, limit);

export function redact(value) {
  return String(value ?? "")
    .replace(/(?:https?|file|blob|data):[^\s<>"']+/gi, (url) => {
      try {
        return new URL(url).origin === "null"
          ? "[resource]"
          : new URL(url).origin;
      } catch {
        return "[resource]";
      }
    })
    .replace(
      /(?:Bearer\s+|(?:api[_-]?key|token|password|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      "[redacted]"
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:[A-Z]:\\|\/Users\/|\/home\/)[^\s)]+/gi, "[local-path]");
}

export function safeError(error) {
  if (!error || typeof error !== "object") return undefined;
  let stack = String(error.stack || "");
  const message = typeof error.message === "string" ? error.message : "";
  const prefix = `${error.name || "Error"}${message ? `: ${message}` : ""}`;
  // Remove the whole message before parsing frames: a server body may itself
  // contain newlines starting with "at", which are not actual stack frames.
  if (stack.startsWith(prefix)) stack = stack.slice(prefix.length);
  const frames = stack
    .split("\n")
    .filter((line) => /^\s*at\s/.test(line) || /@.*:\d/.test(line));
  const cleaned = redact(frames.slice(0, 20).join("\n"));
  return {
    name: identifier(error.name || "Error"),
    code: identifier(error.code),
    // Error messages can contain model output, source text or server bodies.
    // Keep stack frames only; retain neither the message nor its multiline tail.
    stack: cleaned.slice(0, 6000),
    ...(error.truncated || frames.length > 20 || cleaned.length > 6000
      ? { truncated: true }
      : {}),
  };
}

export function normalizeRecord(input, source = {}, now = Date.now()) {
  const context = {};
  for (const key of META) {
    const value = input.context?.[key];
    if (typeof value === "number" && Number.isFinite(value))
      context[key] = value;
    else if (typeof value === "boolean") context[key] = value;
    else if (typeof value === "string")
      context[key] = identifier(
        redact(value),
        ["taskId", "requestId"].includes(key) ? 256 : 160
      );
  }
  const record = {
    time: now,
    level: LEVELS.includes(input.level) ? input.level : "info",
    module: identifier(input.module || "general"),
    environment: identifier(
      source.environment || input.environment || "unknown"
    ),
    // Event names are constant, code-owned labels, never free-form user messages.
    event: redact(input.event || "legacy")
      .replace(/[^\p{L}\p{N}_.:/ -]/gu, "_")
      .slice(0, 256),
    context,
    ...networkFields(input),
    ...(input.error && { error: safeError(input.error) }),
    ...(Number.isInteger(source.tabId) && { tabId: source.tabId }),
    ...(Number.isInteger(source.frameId) && { frameId: source.frameId }),
    ...(source.url && {
      origin: (() => {
        try {
          return new URL(source.url).origin;
        } catch {
          return "[unknown]";
        }
      })(),
    }),
    truncated: Boolean(input.truncated),
  };
  record.truncated ||= Boolean(record.error?.truncated);
  record.truncated ||= Boolean(
    record.request?.preview?.truncated || record.response?.preview?.truncated
  );
  const bytes = () => new TextEncoder().encode(JSON.stringify(record)).length;
  if (bytes() > LOG_LIMITS.recordBytes - 100) {
    delete record.request?.preview;
    delete record.request?.parameters;
    delete record.response?.preview;
    record.error = record.error && {
      name: record.error.name,
      code: record.error.code,
    };
    record.truncated = true;
  }
  record.bytes = bytes() + 32;
  return record;
}

export function matches(record, filter = {}) {
  return (
    (!filter.level || record.level === filter.level) &&
    (!filter.module || record.module === filter.module) &&
    (!filter.environment || record.environment === filter.environment) &&
    (!filter.from || record.time >= filter.from) &&
    (!filter.to || record.time <= filter.to) &&
    (!filter.taskId ||
      [
        record.context.taskId,
        record.context.requestId,
        record.context.networkId,
      ].includes(filter.taskId)) &&
    (!filter.query ||
      JSON.stringify(record)
        .toLowerCase()
        .includes(String(filter.query).toLowerCase()))
  );
}
