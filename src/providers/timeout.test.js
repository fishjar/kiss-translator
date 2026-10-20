import { createInvocation } from "./invocation";
import { DEFAULT_HTTP_TIMEOUT } from "../config/apiConstants";
import { serviceInvocationOptions, serviceTimeoutMs } from "./timeout";

const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
afterEach(() => jest.useRealTimers());

test.each([30, "30", 600, "600", 30000, "30000"])(
  "saved timeout %p produces a numeric budget and expires on time",
  async (httpTimeout) => {
    jest.useFakeTimers();
    const expected = Number(httpTimeout) > 600
      ? Number(httpTimeout)
      : Number(httpTimeout) * 1000;
    const options = serviceInvocationOptions({ httpTimeout });
    expect(options.timeoutMs).toBe(expected);
    expect(options.deadlineAt).toBe(Date.now() + expected);
    const execute = jest.fn(() => new Promise(() => {}));
    const call = createInvocation(execute, options);
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(expected - 1);
    expect(execute.mock.calls[0][0].signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(call.result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(jest.getTimerCount()).toBe(0);
  }
);

test("new and missing settings default to 120 seconds while existing values are retained", () => {
  expect(DEFAULT_HTTP_TIMEOUT).toBe(120);
  expect(serviceTimeoutMs({})).toBe(120000);
  expect(serviceTimeoutMs({ httpTimeout: 30 })).toBe(30000);
  expect(serviceTimeoutMs({ httpTimeout: 600 })).toBe(600000);
  expect(serviceTimeoutMs({ httpTimeout: 1000 })).toBe(1000);
  expect(
    serviceInvocationOptions({ httpTimeout: 300 }, { timeoutMs: 500 }).timeoutMs
  ).toBe(500);
});

test("the default budget lasts 120 seconds and progress cannot renew it", async () => {
  jest.useFakeTimers();
  let ctx, resolve;
  const task = createInvocation((context) => {
    ctx = context;
    return new Promise((done) => {
      resolve = done;
    });
  }, serviceInvocationOptions({}));
  const fail = jest.fn();
  task.result.catch(fail);
  await flush();
  jest.advanceTimersByTime(60000);
  await ctx.emit({ type: "progress", progress: 0.5 });
  await flush();
  expect(fail).not.toHaveBeenCalled();
  jest.advanceTimersByTime(59999);
  await flush();
  expect(fail).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  await expect(task.result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  expect(ctx.signal.aborted).toBe(true);
  resolve({ text: "late" });
  await task.finished;
  expect(fail).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("nested calls inherit the parent deadline instead of starting another complete budget", async () => {
  jest.useFakeTimers();
  let ctx, child;
  const parent = createInvocation(
    async (context) => {
      ctx = context;
      await new Promise((resolve) => setTimeout(resolve, 60000));
      child = createInvocation(
        () => new Promise(() => {}),
        serviceInvocationOptions(
          { httpTimeout: 300 },
          { signal: context.signal }
        )
      );
      return child.result;
    },
    serviceInvocationOptions({ httpTimeout: 300 })
  );
  await flush();
  const deadline = ctx.deadlineAt;
  jest.advanceTimersByTime(60000);
  await flush();
  expect(
    serviceInvocationOptions({}, { signal: ctx.signal, timeoutMs: 600000 })
      .deadlineAt
  ).toBe(deadline);
  jest.advanceTimersByTime(239999);
  expect(ctx.signal.aborted).toBe(false);
  jest.advanceTimersByTime(1);
  await expect(parent.result).rejects.toMatchObject({
    code: "REQUEST_TIMEOUT",
  });
  await expect(child.result).rejects.toMatchObject({
    code: expect.stringMatching(/REQUEST_(TIMEOUT|CANCELLED)/),
  });
  await parent.finished;
  expect(jest.getTimerCount()).toBe(0);
});

test("expired deadlines never execute and invalid explicit timeouts remain errors", async () => {
  const execute = jest.fn();
  await expect(
    createInvocation(execute, { deadlineAt: Date.now() - 1 }).result
  ).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  await expect(
    createInvocation(execute, serviceInvocationOptions({}, { timeoutMs: 0 }))
      .result
  ).rejects.toMatchObject({ code: "INVALID_TIMEOUT" });
  expect(execute).not.toHaveBeenCalled();
});

test.each(["30000", -1, NaN, Infinity])(
  "explicit timeout %p remains invalid",
  async (timeoutMs) => {
    const execute = jest.fn();
    await expect(
      createInvocation(execute, serviceInvocationOptions({}, { timeoutMs })).result
    ).rejects.toMatchObject({ code: "INVALID_TIMEOUT" });
    expect(execute).not.toHaveBeenCalled();
  }
);

test("editing a saved timeout does not change the budget of an in-flight call", async () => {
  jest.useFakeTimers();
  const api = { httpTimeout: 30 };
  const call = createInvocation(
    () => new Promise(() => {}),
    serviceInvocationOptions(api)
  );
  api.httpTimeout = 600;
  jest.advanceTimersByTime(30000);
  await expect(call.result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  expect(jest.getTimerCount()).toBe(0);
});
