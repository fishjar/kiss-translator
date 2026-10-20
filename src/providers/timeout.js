import { DEFAULT_HTTP_TIMEOUT } from "../config/apiConstants";

// Signals carry their parent budget within a context; IPC carries deadlineAt.
const deadlines = new WeakMap();
export const MAX_SERVICE_TIMEOUT_MS = 600000;

export function serviceTimeoutMs(api) {
  const seconds = Number(api?.httpTimeout) || DEFAULT_HTTP_TIMEOUT;
  // Preserve the network layer's legacy millisecond configurations.
  return seconds > 600 ? seconds : seconds * 1000;
}

export function invocationDeadline(options) {
  const candidates = [options.deadlineAt, deadlines.get(options.signal)];
  if (options.timeoutMs !== undefined)
    candidates.push(Date.now() + options.timeoutMs);
  const valid = candidates.filter(Number.isFinite);
  return valid.length ? Math.min(...valid) : undefined;
}

export function serviceInvocationOptions(api, options = {}) {
  const resolved = {
    ...options,
    timeoutMs: options.timeoutMs ?? serviceTimeoutMs(api),
  };
  return { ...resolved, deadlineAt: invocationDeadline(resolved) };
}

export function registerInvocationDeadline(signal, deadlineAt) {
  if (deadlineAt !== undefined) deadlines.set(signal, deadlineAt);
}

export const remainingInvocationMs = (ctx) =>
  ctx.deadlineAt === undefined
    ? undefined
    : Math.max(1, ctx.deadlineAt - Date.now());

/** Bound lazy imports/settings discovery without imposing a new execution budget. */
export async function resolveInvocationConfig(ctx, resolve) {
  if (ctx.signal.aborted) throw ctx.signal.reason;
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(ctx.signal.reason);
    ctx.signal.addEventListener("abort", abort, { once: true });
  });
  const timer = setTimeout(() => ctx.setDeadline(Date.now()), MAX_SERVICE_TIMEOUT_MS);
  try {
    return await Promise.race([cancelled, Promise.resolve().then(resolve)]);
  } finally {
    clearTimeout(timer);
    ctx.signal.removeEventListener("abort", abort);
  }
}
