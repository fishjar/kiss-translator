jest.mock("../config", () => ({
  DEFAULT_FETCH_INTERVAL: 0,
  DEFAULT_FETCH_LIMIT: 1,
}));
jest.mock("./log", () => ({ kissLog: jest.fn() }));
jest.mock("./cache", () => ({ getHttpCachePolyfill: jest.fn() }));
jest.mock("./request", () => ({
  mergeAbortSignals: (signals) => signals.find(Boolean),
}));
jest.mock("./requestStream", () => ({ requestStream: jest.fn() }));
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

import { fetchStream } from "./fetch";
import { clearFetchPool } from "./pool";
import { requestStream } from "./requestStream";

describe("pooled stream lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    requestStream.mockReset();
  });

  afterEach(() => {
    clearFetchPool();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("rejects the iterator when the pool is cleared before transport starts", async () => {
    const stream = fetchStream("https://example.test", {}, { usePool: true });
    const next = stream.next();
    const expectation = expect(next).rejects.toBe("the task pool was cleared");

    clearFetchPool();
    await expectation;
    expect(requestStream).not.toHaveBeenCalled();
    await expect(stream.next()).resolves.toEqual({ done: true });
  });

  test("continues delivering and completing a normally scheduled stream", async () => {
    requestStream.mockImplementation(async function* () {
      yield "first chunk";
      yield "second chunk";
    });
    const stream = fetchStream("https://example.test", {}, { usePool: true });
    const first = stream.next();

    jest.runOnlyPendingTimers();
    await expect(first).resolves.toEqual({ done: false, value: "first chunk" });
    await expect(stream.next()).resolves.toEqual({
      done: false,
      value: "second chunk",
    });
    await expect(stream.next()).resolves.toEqual({ done: true });
    expect(requestStream).toHaveBeenCalledTimes(1);
  });
});
