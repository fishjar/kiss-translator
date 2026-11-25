export const FILE_TRANSLATION_REQUEST_LIMIT = 32;

export function* indexedTranslationTasks(items, translate) {
  let index = 0;
  for (const item of items) {
    const position = index++;
    yield (signal) => translate(item, position, signal);
  }
}

export function createTranslationRequestWindow() {
  let active = 0;
  const waiting = new Set();
  return async (task, signal) => {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    if (active < FILE_TRANSLATION_REQUEST_LIMIT) {
      active++;
    } else {
      await new Promise((resolve, reject) => {
        const cancel = () => {
          waiting.delete(start);
          reject(new DOMException("已取消", "AbortError"));
        };
        const start = () => {
          waiting.delete(start);
          signal?.removeEventListener("abort", cancel);
          resolve();
        };
        waiting.add(start);
        signal?.addEventListener("abort", cancel, { once: true });
      });
    }
    try {
      if (signal?.aborted) throw new DOMException("已取消", "AbortError");
      return await task();
    } finally {
      const next = waiting.values().next().value;
      if (next) next();
      else active--;
    }
  };
}

// Callers can stream tasks into a bounded pool. Each worker owns one task until
// completion so cancellation also bounds the number of outstanding promises.
export async function runBoundedTranslationTasks(
  tasks,
  signal,
  { concurrency = FILE_TRANSLATION_REQUEST_LIMIT, collect = true } = {}
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  concurrency = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 1;
  const iterator = tasks[Symbol.iterator]();
  const results = [];
  let position = 0;
  let failure;
  let failed = false;
  const worker = async () => {
    try {
      while (!controller.signal.aborted) {
        const { value: task, done } = iterator.next();
        if (done) return;
        const index = position++;
        const result = await task(controller.signal);
        if (!controller.signal.aborted && collect) results[index] = result;
      }
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
        abort();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (failed) throw failure;
    if (controller.signal.aborted)
      throw new DOMException("已取消", "AbortError");
    return results;
  } finally {
    iterator.return?.();
    signal?.removeEventListener("abort", abort);
  }
}

// Service queues own batching and rate limits for callers with a small, ready batch.
export async function runTranslationTasks(tasks, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const pending = tasks.map(async (task) => {
    if (controller.signal.aborted)
      throw new DOMException("已取消", "AbortError");
    const result = await task(controller.signal);
    if (controller.signal.aborted)
      throw new DOMException("已取消", "AbortError");
    return result;
  });
  try {
    const results = await Promise.all(pending);
    if (controller.signal.aborted)
      throw new DOMException("已取消", "AbortError");
    return results;
  } catch (error) {
    controller.abort();
    await Promise.allSettled(pending);
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}
