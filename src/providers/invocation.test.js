import { createInvocation } from "./invocation";
import { serviceInvocationOptions } from "./timeout";

test("cancellation rejects the caller immediately but finished waits for execution settlement", async () => {
  let release;
  const call = createInvocation(() => new Promise((resolve) => { release = resolve; }));
  await Promise.resolve();
  let finished = false;
  call.finished.then(() => { finished = true; });
  call.cancel();
  await expect(call.result).rejects.toHaveProperty("code", "REQUEST_CANCELLED");
  expect(finished).toBe(false);
  release("late");
  await call.finished;
  expect(finished).toBe(true);
  await expect(call.result).rejects.toHaveProperty("code", "REQUEST_CANCELLED");
});

test("an already cancelled invocation never starts its backend", async () => {
  const controller = new AbortController(); controller.abort();
  const execute = jest.fn();
  const call = createInvocation(execute, { signal: controller.signal });
  await expect(call.result).rejects.toHaveProperty("code", "REQUEST_CANCELLED");
  await call.finished;
  expect(execute).not.toHaveBeenCalled();
});

test("resolved deadlines tighten the timer and the budget inherited by children", async () => {
  jest.useFakeTimers();
  try {
    let ctx;
    const call = createInvocation((context) => {
      ctx = context;
      return new Promise(() => {});
    }, { timeoutMs: 10000 });
    await Promise.resolve();
    const deadline = Date.now() + 2000;
    ctx.setDeadline(deadline);
    ctx.setDeadline(Date.now() + 20000);
    expect(ctx.deadlineAt).toBe(deadline);
    expect(serviceInvocationOptions({}, { signal: ctx.signal }).deadlineAt).toBe(deadline);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(2000);
    await expect(call.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test.each(["expired", "invalid"])("a %s resolved deadline settles immediately", async (kind) => {
  let ctx;
  const call = createInvocation((context) => {
    ctx = context;
    return new Promise(() => {});
  });
  await Promise.resolve();
  ctx.setDeadline(kind === "expired" ? Date.now() - 1 : NaN);
  await expect(call.result).rejects.toHaveProperty(
    "code", kind === "expired" ? "REQUEST_TIMEOUT" : "INVALID_TIMEOUT"
  );
  expect(ctx.signal.aborted).toBe(true);
});
