import { getBatchQueue } from "./batchQueue";

let queueId = 0;
const createBatchQueue = (taskFn, options) =>
  getBatchQueue(`batch-queue-test-${queueId++}`, taskFn, options);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const flushQueueScheduling = async () => {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
};

describe("BatchQueue batch concurrency", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("keeps batches serial by default", async () => {
    const batches = [deferred(), deferred()];
    const taskFn = jest
      .fn()
      .mockImplementationOnce(() => batches[0].promise)
      .mockImplementationOnce(() => batches[1].promise);
    const queue = createBatchQueue(taskFn, { batchSize: 1 });

    const first = queue.addTask("first");
    const second = queue.addTask("second");

    expect(taskFn).toHaveBeenCalledTimes(1);
    batches[0].resolve([["一", ""]]);
    await expect(first).resolves.toEqual(["一", ""]);
    await flushQueueScheduling();
    expect(taskFn).toHaveBeenCalledTimes(2);

    batches[1].resolve([["二", ""]]);
    await expect(second).resolves.toEqual(["二", ""]);
  });

  test("starts up to the configured number of batches", async () => {
    const batches = [deferred(), deferred(), deferred()];
    const taskFn = jest
      .fn()
      .mockImplementationOnce(() => batches[0].promise)
      .mockImplementationOnce(() => batches[1].promise)
      .mockImplementationOnce(() => batches[2].promise);
    const queue = createBatchQueue(taskFn, {
      batchSize: 1,
      batchConcurrency: 2,
    });

    const first = queue.addTask("first");
    const second = queue.addTask("second");
    const third = queue.addTask("third");

    expect(taskFn).toHaveBeenCalledTimes(2);
    batches[1].resolve([["二", ""]]);
    await expect(second).resolves.toEqual(["二", ""]);
    await flushQueueScheduling();
    expect(taskFn).toHaveBeenCalledTimes(3);

    batches[0].resolve([["一", ""]]);
    batches[2].resolve([["三", ""]]);
    await expect(first).resolves.toEqual(["一", ""]);
    await expect(third).resolves.toEqual(["三", ""]);
  });

  test("releases a concurrency slot when a batch fails", async () => {
    const batches = [deferred(), deferred()];
    const error = new Error("batch failed");
    const taskFn = jest
      .fn()
      .mockImplementationOnce(() => batches[0].promise)
      .mockImplementationOnce(() => batches[1].promise);
    const queue = createBatchQueue(taskFn, {
      batchSize: 1,
      batchConcurrency: 1,
    });

    const failed = queue.addTask("failed");
    const next = queue.addTask("next");
    const failedExpectation = expect(failed).rejects.toThrow("batch failed");

    batches[0].reject(error);
    await failedExpectation;
    await flushQueueScheduling();
    expect(taskFn).toHaveBeenCalledTimes(2);

    batches[1].resolve([["继续", ""]]);
    await expect(next).resolves.toEqual(["继续", ""]);
  });

  test("refills all free slots when active batches finish together", async () => {
    jest.useFakeTimers();
    const batches = Array.from({ length: 5 }, deferred);
    const taskFn = jest.fn();
    batches.forEach((batch) =>
      taskFn.mockImplementationOnce(() => batch.promise)
    );
    const queue = createBatchQueue(taskFn, {
      batchSize: 1,
      batchConcurrency: 2,
    });
    const results = ["a", "b", "c", "d", "e"].map((text) =>
      queue.addTask(text)
    );
    expect(taskFn).toHaveBeenCalledTimes(2);

    batches[0].resolve(["A"]);
    batches[1].resolve(["B"]);
    await Promise.all(results.slice(0, 2));
    jest.runAllTimers();

    expect(taskFn.mock.calls.map(([texts]) => texts)).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
    batches[2].resolve(["C"]);
    await results[2];
    jest.runAllTimers();
    expect(taskFn).toHaveBeenCalledTimes(5);

    batches[3].resolve(["D"]);
    batches[4].resolve(["E"]);
    await expect(Promise.all(results)).resolves.toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  test("keeps a partial tail delayed while refilling full batches", async () => {
    jest.useFakeTimers();
    const batches = Array.from({ length: 4 }, deferred);
    const taskFn = jest.fn();
    batches.forEach((batch) =>
      taskFn.mockImplementationOnce(() => batch.promise)
    );
    const queue = createBatchQueue(taskFn, {
      batchSize: 2,
      batchConcurrency: 2,
      batchInterval: 100,
    });
    const results = ["a", "b", "c", "d", "e", "f", "g"].map((text) =>
      queue.addTask(text)
    );

    batches[0].resolve(["A", "B"]);
    batches[1].resolve(["C", "D"]);
    await Promise.all(results.slice(0, 4));
    jest.advanceTimersByTime(0);
    expect(taskFn).toHaveBeenCalledTimes(3);

    batches[2].resolve(["E", "F"]);
    await Promise.all(results.slice(4, 6));
    jest.advanceTimersByTime(99);
    expect(taskFn).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(1);
    expect(taskFn).toHaveBeenLastCalledWith(["g"], undefined);

    batches[3].resolve(["G"]);
    await expect(Promise.all(results)).resolves.toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  test("holds a slot until an async generator finishes", async () => {
    const generatorGate = deferred();
    const nextBatch = deferred();
    const taskFn = jest
      .fn()
      .mockImplementationOnce(async function* firstGenerator() {
        yield { id: 0, result: ["完成", ""] };
        await generatorGate.promise;
      })
      .mockImplementationOnce(() => nextBatch.promise);
    const queue = createBatchQueue(taskFn, {
      batchSize: 1,
      batchConcurrency: 1,
    });

    const first = queue.addTask("first");
    const second = queue.addTask("second");

    await expect(first).resolves.toEqual(["完成", ""]);
    expect(taskFn).toHaveBeenCalledTimes(1);

    generatorGate.resolve();
    await flushQueueScheduling();
    expect(taskFn).toHaveBeenCalledTimes(2);

    nextBatch.resolve([["下一批", ""]]);
    await expect(second).resolves.toEqual(["下一批", ""]);
  });

  test("waits for batchInterval when a batch is not full", async () => {
    jest.useFakeTimers();
    const taskFn = jest.fn().mockResolvedValue([["完成", ""]]);
    const queue = createBatchQueue(taskFn, {
      batchInterval: 100,
      batchSize: 2,
      batchConcurrency: 2,
    });

    const task = queue.addTask("only");
    jest.advanceTimersByTime(99);
    expect(taskFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(taskFn).toHaveBeenCalledTimes(1);
    await expect(task).resolves.toEqual(["完成", ""]);
  });

  test("keeps task results isolated when concurrent batches finish out of order", async () => {
    const firstBatch = deferred();
    const secondBatch = deferred();
    const taskFn = jest
      .fn()
      .mockImplementationOnce(() => firstBatch.promise)
      .mockImplementationOnce(() => secondBatch.promise);
    const queue = createBatchQueue(taskFn, {
      batchSize: 2,
      batchConcurrency: 2,
    });

    const results = [
      queue.addTask("a"),
      queue.addTask("b"),
      queue.addTask("c"),
      queue.addTask("d"),
    ];
    expect(taskFn).toHaveBeenCalledTimes(2);

    secondBatch.resolve([
      ["C", ""],
      ["D", ""],
    ]);
    firstBatch.resolve([
      ["A", ""],
      ["B", ""],
    ]);

    await expect(Promise.all(results)).resolves.toEqual([
      ["A", ""],
      ["B", ""],
      ["C", ""],
      ["D", ""],
    ]);
  });
});
