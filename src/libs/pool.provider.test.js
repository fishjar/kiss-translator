import { TaskPool } from "./pool";

afterEach(() => jest.useRealTimers());
test("Provider errors never retry while legacy callers retain the existing retry policy", async () => {
  jest.useFakeTimers();
  const pool = new TaskPool(0, 1, 10);
  const fn = jest.fn().mockRejectedValue(new Error("failed"));
  const result = pool.push(fn, {}, { maxRetries: 0 });
  const rejected = expect(result).rejects.toThrow("failed");
  jest.advanceTimersByTime(0);
  await rejected;
  jest.advanceTimersByTime(100);
  expect(fn).toHaveBeenCalledTimes(1);
});
test("a cancelled queued task rejects before the occupied slot finishes", async () => {
  jest.useFakeTimers();
  const pool = new TaskPool(0, 1);
  let release;
  const first = pool.push(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  jest.advanceTimersByTime(0);
  const controller = new AbortController();
  const fn = jest.fn();
  const queued = pool.push(fn, undefined, {
    signal: controller.signal,
    maxRetries: 0,
  });
  controller.abort();
  await expect(queued).rejects.toMatchObject({ name: "AbortError" });
  release();
  await first;
  jest.runOnlyPendingTimers();
  expect(fn).not.toHaveBeenCalled();
});
