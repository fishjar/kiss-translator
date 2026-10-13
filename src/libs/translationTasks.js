// Submit ready work immediately; service queues own batching and rate limits.
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
