import { serveProviderPort } from "./host";
import { createInvocation } from "./invocation";

jest.mock("./runtime", () => ({ invokeInstance: jest.fn() }));
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
function event() {
  const listeners = new Set();
  return {
    addListener: (fn) => listeners.add(fn),
    removeListener: (fn) => listeners.delete(fn),
    emit: (message) => {
      for (const fn of [...listeners]) fn(message);
    },
    listeners,
  };
}
function port() {
  return { onMessage: event(), onDisconnect: event(), postMessage: jest.fn() };
}
const start = {
  type: "start",
  instance: {},
  capability: "chat",
  input: { messages: [] },
  approvedOrigins: [],
  options: { timeoutMs: 100 },
};
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("an abandoned upload times out and cannot restart or invoke a provider", () => {
  const connection = port();
  const invoke = jest.fn();
  serveProviderPort(connection, { ...start, uploads: true }, invoke);
  expect(connection.postMessage).toHaveBeenCalledWith({ type: "prepared" });
  jest.advanceTimersByTime(100);
  expect(connection.postMessage).toHaveBeenLastCalledWith({
    type: "error",
    error: { code: "REQUEST_TIMEOUT", message: expect.any(String) },
  });
  connection.onMessage.emit({ type: "assets.complete" });
  connection.onMessage.emit(start);
  expect(invoke).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("upload time consumes the same invocation deadline", async () => {
  const connection = port();
  const invoke = jest.fn((_, __, ___, options) =>
    createInvocation(async () => ({ text: "ok" }), options)
  );
  serveProviderPort(connection, { ...start, uploads: true }, invoke);
  jest.advanceTimersByTime(70);
  connection.onMessage.emit({ type: "assets.complete" });
  await flush();
  expect(invoke.mock.calls[0][3].timeoutMs).toBe(30);
  expect(connection.postMessage).toHaveBeenLastCalledWith({
    type: "result",
    result: { text: "ok" },
    resources: [],
  });
  expect(invoke.mock.calls[0][3].assets.entries()).toEqual([]);
  expect(jest.getTimerCount()).toBe(0);
});

test("missing event acknowledgement has a deadline and emits only one terminal error", async () => {
  const connection = port();
  let task;
  const invoke = (_, __, ___, options) =>
    (task = createInvocation(async (ctx) => {
      await ctx.emit({ type: "text.delta", text: "preview" });
      return { text: "ok" };
    }, options));
  serveProviderPort(connection, start, invoke);
  await flush();
  expect(connection.postMessage).toHaveBeenCalledWith(
    expect.objectContaining({ type: "event" })
  );
  jest.advanceTimersByTime(100);
  await flush();
  await task.result;
  const terminal = connection.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => ["result", "error"].includes(message.type));
  expect(terminal).toHaveLength(1);
  expect(terminal[0].error.code).toBe("REQUEST_TIMEOUT");
  expect(jest.getTimerCount()).toBe(0);
});

test("disconnect during upload releases the timer and ignores late messages", () => {
  const connection = port();
  const invoke = jest.fn();
  serveProviderPort(connection, { ...start, uploads: true }, invoke);
  connection.onDisconnect.emit();
  connection.onMessage.emit({ type: "assets.complete" });
  jest.advanceTimersByTime(100);
  expect(invoke).not.toHaveBeenCalled();
  expect(connection.postMessage).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test("the port owner can cancel a same-context invocation without a disconnect event", async () => {
  const connection = port();
  let task;
  const invoke = (_, __, ___, options) =>
    (task = createInvocation(() => new Promise(() => {}), options));
  const cancel = serveProviderPort(connection, start, invoke);
  const result = task.result.catch((error) => error);
  cancel();
  expect((await result).name).toBe("AbortError");
  await flush();
  expect(connection.onMessage.listeners.size).toBe(0);
  expect(connection.onDisconnect.listeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});
