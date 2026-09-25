jest.mock("../config", () => ({
  DEFAULT_FETCH_INTERVAL: 0,
  DEFAULT_FETCH_LIMIT: 1,
}));

jest.mock("./log", () => ({ kissLog: jest.fn() }));

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("TaskPool cancellation", () => {
  let pool;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    pool = require("./pool").getFetchPool(0, 1);
  });

  afterEach(() => {
    pool.clear();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("rejects AbortError without retrying and releases the slot", async () => {
    const error = new DOMException("Cancelled", "AbortError");
    const task = jest.fn().mockRejectedValue(error);
    const nextTask = jest.fn().mockResolvedValue("next result");
    const cancelled = pool.push(task);
    const cancelledExpectation = expect(cancelled).rejects.toBe(error);
    const next = pool.push(nextTask);

    jest.runOnlyPendingTimers();
    await flushPromises();
    await cancelledExpectation;
    jest.runOnlyPendingTimers();
    await flushPromises();
    await expect(next).resolves.toBe("next result");

    jest.advanceTimersByTime(5000);
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
    expect(nextTask).toHaveBeenCalledTimes(1);
  });

  test("continues retrying ordinary failures", async () => {
    const task = jest
      .fn()
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValue("recovered");
    const result = pool.push(task);

    jest.runOnlyPendingTimers();
    await flushPromises();
    expect(task).toHaveBeenCalledTimes(1);
    jest.runOnlyPendingTimers();
    await flushPromises();
    jest.runOnlyPendingTimers();
    await flushPromises();

    await expect(result).resolves.toBe("recovered");
    expect(task).toHaveBeenCalledTimes(2);
  });
});
