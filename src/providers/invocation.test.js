import { createInvocation } from "./invocation";

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
