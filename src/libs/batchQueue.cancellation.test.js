import { clearAllBatchQueue, getBatchQueue } from "./batchQueue";

let queueId = 0;
const makeQueue = (fn, options) =>
  getBatchQueue(`cancellation-${queueId++}`, fn, options);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const observe = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
const flush = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
};

afterEach(() => {
  clearAllBatchQueue();
  jest.useRealTimers();
});

test("rejects an already canceled caller without starting a batch", async () => {
  const controller = new AbortController();
  controller.abort();
  const fn = jest.fn();
  const queue = makeQueue(fn, { batchSize: 1 });
  await expect(
    queue.addTask("old", { signal: controller.signal })
  ).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fn).not.toHaveBeenCalled();
});

test("removes canceled queued text and compacts only the undispatched payloads", async () => {
  const controller = new AbortController();
  const remove = jest.spyOn(controller.signal, "removeEventListener");
  const fn = jest.fn(async (texts) =>
    texts.map((text) => [text.toUpperCase(), "en"])
  );
  const queue = makeQueue(fn, { batchSize: 2 });
  const canceled = observe(queue.addTask("old", { signal: controller.signal }));
  controller.abort();
  expect((await canceled).error.name).toBe("AbortError");
  expect(remove).toHaveBeenCalledTimes(1);
  const latest = queue.addTask("latest");
  expect(fn).not.toHaveBeenCalled();
  const neighbor = queue.addTask("neighbor");
  await expect(Promise.all([latest, neighbor])).resolves.toEqual([
    ["LATEST", "en"],
    ["NEIGHBOR", "en"],
  ]);
  expect(fn.mock.calls[0][0]).toEqual(["latest", "neighbor"]);
});

test("canceling the last queued caller clears its batch timer", async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  const fn = jest.fn();
  const queue = makeQueue(fn, { batchSize: 5, batchInterval: 100 });
  const canceled = observe(queue.addTask("old", { signal: controller.signal }));
  expect(jest.getTimerCount()).toBe(1);
  controller.abort();
  expect((await canceled).error.name).toBe("AbortError");
  expect(jest.getTimerCount()).toBe(0);
  jest.advanceTimersByTime(100);
  expect(fn).not.toHaveBeenCalled();
});

test("canceling the first in-flight caller leaves the shared request and remaining IDs intact", async () => {
  const gate = deferred();
  const firstController = new AbortController();
  const secondController = new AbortController();
  const secondRemove = jest.spyOn(
    secondController.signal,
    "removeEventListener"
  );
  const fn = jest.fn(() => gate.promise);
  const queue = makeQueue(fn, { batchSize: 2 });
  const first = observe(
    queue.addTask("first", { signal: firstController.signal })
  );
  const second = queue.addTask("second", { signal: secondController.signal });
  const sharedSignal = fn.mock.calls[0][1].signal;
  expect(sharedSignal).not.toBe(firstController.signal);
  expect(sharedSignal).not.toBe(secondController.signal);
  firstController.abort();
  expect((await first).error.name).toBe("AbortError");
  expect(sharedSignal.aborted).toBe(false);
  gate.resolve([
    ["FIRST", "en"],
    ["SECOND", "en"],
  ]);
  await expect(second).resolves.toEqual(["SECOND", "en"]);
  expect(secondRemove).toHaveBeenCalledTimes(1);
  secondController.abort();
  expect(sharedSignal.aborted).toBe(false);
});

test("streaming skips canceled and completed callers without renumbering later results", async () => {
  const gate = deferred();
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  const callbacks = controllers.map(() => jest.fn());
  const fn = jest.fn(async function* () {
    await gate.promise;
    yield { id: 1, isComplete: false, partialText: "CANCELED PARTIAL" };
    yield { id: 1, result: ["CANCELED FINAL", "en"] };
    yield { id: 2, isComplete: false, partialText: "THIRD PARTIAL" };
    yield { id: 2, result: ["THIRD", "en"] };
    yield { id: 2, result: ["DUPLICATE", "en"] };
    yield { id: 0, result: ["FIRST", "en"] };
  });
  const queue = makeQueue(fn, { batchSize: 3 });
  const tasks = controllers.map((controller, index) =>
    observe(
      queue.addTask(String(index), {
        signal: controller.signal,
        onStreamChunk: callbacks[index],
      })
    )
  );
  controllers[1].abort();
  expect((await tasks[1]).error.name).toBe("AbortError");
  expect(fn.mock.calls[0][1].signal.aborted).toBe(false);
  gate.resolve();
  expect(await tasks[0]).toEqual({ value: ["FIRST", "en"] });
  expect(await tasks[2]).toEqual({ value: ["THIRD", "en"] });
  await flush();
  expect(callbacks[1]).not.toHaveBeenCalled();
  expect(callbacks[2].mock.calls.map(([chunk]) => chunk.id)).toEqual([2, 2]);
  expect(callbacks[2]).toHaveBeenLastCalledWith({
    id: 2,
    text: ["THIRD", "en"],
    isComplete: true,
  });
});

test("a streaming callback can cancel its caller without affecting the next result", async () => {
  const controller = new AbortController();
  const callback = jest.fn(() => controller.abort());
  const fn = jest.fn(async function* () {
    yield { id: 0, isComplete: false, partialText: "first" };
    yield { id: 0, result: ["first", "en"] };
    yield { id: 1, result: ["second", "en"] };
  });
  const queue = makeQueue(fn, { batchSize: 2 });
  const canceled = observe(
    queue.addTask("first", {
      signal: controller.signal,
      onStreamChunk: callback,
    })
  );
  const second = queue.addTask("second");
  expect((await canceled).error.name).toBe("AbortError");
  await expect(second).resolves.toEqual(["second", "en"]);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(fn.mock.calls[0][1].signal.aborted).toBe(false);
});

test("all canceled callers abort the shared request but keep its slot until the task ends", async () => {
  const gate = deferred();
  const controllers = [new AbortController(), new AbortController()];
  const fn = jest
    .fn()
    .mockImplementationOnce(() => gate.promise)
    .mockResolvedValue([["next", "en"]]);
  const queue = makeQueue(fn, {
    batchSize: 2,
    batchInterval: 0,
    batchConcurrency: 1,
  });
  const tasks = controllers.map((controller, index) =>
    observe(queue.addTask(String(index), { signal: controller.signal }))
  );
  const sharedSignal = fn.mock.calls[0][1].signal;
  controllers[0].abort();
  expect(sharedSignal.aborted).toBe(false);
  controllers[1].abort();
  expect(sharedSignal.aborted).toBe(true);
  expect((await tasks[0]).error.name).toBe("AbortError");
  expect((await tasks[1]).error.name).toBe("AbortError");
  const next = queue.addTask("next");
  await flush();
  expect(fn).toHaveBeenCalledTimes(1);
  // The transport deliberately ignores cancellation in this regression.
  gate.resolve([
    ["late first", "en"],
    ["late second", "en"],
  ]);
  await expect(next).resolves.toEqual(["next", "en"]);
  expect(fn).toHaveBeenCalledTimes(2);
});

test.each(["success", "rejection", "missing", "stream-missing"])(
  "removes caller listeners on %s",
  async (outcome) => {
    const controller = new AbortController();
    const add = jest.spyOn(controller.signal, "addEventListener");
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    const taskFn =
      outcome === "stream-missing"
        ? async function* () {}
        : async () => {
            if (outcome === "rejection") throw new Error("provider failed");
            return outcome === "missing" ? [] : [["ok", "en"]];
          };
    const result = await observe(
      makeQueue(taskFn, { batchSize: 1 }).addTask("text", {
        signal: controller.signal,
      })
    );
    expect(outcome === "success" ? result.value : result.error).toBeDefined();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  }
);

test("clearing settles queued and running callers, suppresses late chunks, and allows a new queue", async () => {
  const gate = deferred();
  const callback = jest.fn();
  const controller = new AbortController();
  const fn = jest.fn(async function* () {
    await gate.promise;
    yield { id: 0, result: ["late", "en"] };
  });
  const key = `clear-cancellation-${queueId++}`;
  const oldQueue = getBatchQueue(key, fn, {
    batchSize: 1,
    batchConcurrency: 1,
  });
  const running = observe(
    oldQueue.addTask("running", {
      signal: controller.signal,
      onStreamChunk: callback,
    })
  );
  const waiting = observe(oldQueue.addTask("waiting"));
  clearAllBatchQueue();
  expect((await running).error.message).toBe("Queue instance was destroyed.");
  expect((await waiting).error.message).toBe("Queue instance was destroyed.");
  expect(fn.mock.calls[0][1].signal.aborted).toBe(true);
  await expect(oldQueue.addTask("stale reference")).rejects.toThrow(
    "destroyed"
  );
  const newFn = jest.fn(async () => [["new", "en"]]);
  const newQueue = getBatchQueue(key, newFn, { batchSize: 1 });
  await expect(newQueue.addTask("new")).resolves.toEqual(["new", "en"]);
  gate.resolve();
  await flush();
  expect(callback).not.toHaveBeenCalled();
  expect(fn).toHaveBeenCalledTimes(1);
  expect(newFn).toHaveBeenCalledTimes(1);
});
