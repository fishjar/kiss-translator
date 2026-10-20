import { providerError } from "./capabilities";
import { invocationDeadline, registerInvocationDeadline } from "./timeout";

let sequence = 0;
const abortError = () =>
  Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
    code: "REQUEST_CANCELLED",
  });

/** One subscriber, bounded buffer. Unsubscribed events are not retained. */
function eventChannel(limit = 64) {
  const queue = [];
  let subscriber = false;
  let claimed = false;
  let finished = false;
  let failure;
  let wake;
  const spaces = new Set();
  const waitForEvent = () =>
    new Promise((resolve) => {
      wake = resolve;
    });
  const notify = () => {
    wake?.();
    wake = undefined;
  };
  const release = () => {
    for (const resolve of spaces) resolve();
    spaces.clear();
  };
  return {
    async emit(event) {
      while (subscriber && !finished && queue.length >= limit) {
        await new Promise((resolve) => {
          spaces.add(resolve);
        });
      }
      if (!subscriber || finished) return;
      queue.push(event);
      notify();
    },
    finish(error) {
      finished = true;
      failure = error;
      if (error) queue.length = 0;
      notify();
      release();
    },
    events: {
      [Symbol.asyncIterator]() {
        if (claimed)
          throw providerError(
            "EVENT_SUBSCRIBER_EXISTS",
            "Only one event subscriber is supported."
          );
        claimed = true;
        subscriber = true;
        return {
          async next() {
            while (!queue.length && !finished && subscriber) {
              await waitForEvent();
            }
            if (!subscriber) return { done: true };
            if (failure) throw failure;
            if (queue.length) {
              const value = queue.shift();
              release();
              return { value, done: false };
            }
            return { done: true };
          },
          async return() {
            subscriber = false;
            queue.length = 0;
            notify();
            release();
            return { done: true };
          },
        };
      },
    },
  };
}

export function createInvocation(execute, options = {}) {
  // Native tasks share a runtime across pages; a per-page counter alone can collide.
  const requestId = `provider-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`}`;
  const controller = new AbortController();
  let deadlineAt = invocationDeadline(options);
  registerInvocationDeadline(controller.signal, deadlineAt);
  const channel = eventChannel();
  let settled = false;
  let timeout;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // Events-only callers must not cause an unhandled rejection; result remains rejectable.
  result.catch(() => {});
  const finish = (error, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
    channel.finish(error);
    controller.abort(error);
    if (error) rejectResult(error);
    else resolveResult(value);
  };
  const cancel = () => finish(abortError());
  const setDeadline = (value) => {
    if (settled) return;
    if (!Number.isFinite(value)) {
      finish(providerError("INVALID_TIMEOUT", "Invalid invocation deadline."));
      return;
    }
    deadlineAt = Math.min(deadlineAt ?? Infinity, value);
    registerInvocationDeadline(controller.signal, deadlineAt);
    clearTimeout(timeout);
    const expire = () =>
      finish(providerError("REQUEST_TIMEOUT", "Provider invocation timed out."));
    if (deadlineAt <= Date.now()) expire();
    else timeout = setTimeout(expire, deadlineAt - Date.now());
  };
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  if (
    !settled &&
    (options.timeoutMs !== undefined || deadlineAt !== undefined)
  ) {
    if (
      options.timeoutMs !== undefined &&
      (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      finish(
        providerError("INVALID_TIMEOUT", "timeoutMs must be a positive number.")
      );
    } else setDeadline(deadlineAt);
  }
  const finished = Promise.resolve()
    .then(() => {
      if (settled) return;
      return execute({
        requestId,
        signal: controller.signal,
        get deadlineAt() { return deadlineAt; },
        setDeadline,
        emit: channel.emit,
      });
    })
    .then(
      (value) => finish(undefined, value),
      (error) => finish(error)
    );
  return { requestId, result, events: channel.events, cancel, finished };
}
