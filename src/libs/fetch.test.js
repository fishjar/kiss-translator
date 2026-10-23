jest.mock("../config", () => ({
  DEFAULT_FETCH_INTERVAL: 0,
  DEFAULT_FETCH_LIMIT: 1,
}));
jest.mock("./log", () => ({ kissLog: jest.fn() }));
jest.mock("./cache", () => ({ getHttpCachePolyfill: jest.fn() }));
jest.mock("./request", () => ({
  mergeAbortSignals: (signals) => signals.find(Boolean),
  fnPolyfill: jest.fn(),
}));
jest.mock("./requestStream", () => ({ requestStream: jest.fn() }));
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

import { fetchData, fetchStream } from "./fetch";
import { fnPolyfill } from "./request";
import { getHttpCachePolyfill } from "./cache";
import { clearFetchPool } from "./pool";
import { requestStream } from "./requestStream";

describe("pooled stream lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    requestStream.mockReset();
    fnPolyfill.mockReset();
  });

  afterEach(() => {
    clearFetchPool();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("rejects the iterator when the pool is cleared before transport starts", async () => {
    const stream = fetchStream("https://example.test", {}, { usePool: true });
    const next = stream.next();
    const expectation = expect(next).rejects.toMatchObject({
      name: "AbortError",
    });

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

  test.each(["data", "stream", "local-ai"])(
    "cancels queued %s work without clearing other requests",
    async (kind) => {
      const controller = new AbortController();
      const options = { usePool: true, signal: controller.signal };
      const pending =
        kind === "stream"
          ? fetchStream("https://example.test", {}, options).next()
          : fetchData(
              kind === "local-ai" ? "local-ai://chat" : "https://example.test",
              {},
              options
            );
      const cancelled = expect(pending).rejects.toMatchObject({
        name: "AbortError",
      });
      controller.abort();
      await cancelled;
      const other = fetchData("https://other.test", {}, { usePool: true });
      jest.runOnlyPendingTimers();
      await other;
      expect(fnPolyfill).toHaveBeenCalledTimes(1);
      expect(fnPolyfill.mock.calls[0][0].input).toBe("https://other.test");
      expect(requestStream).not.toHaveBeenCalled();
    }
  );

  test("does not enqueue an old request when cache lookup finishes after cancellation", async () => {
    let finishCache;
    getHttpCachePolyfill.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCache = resolve;
        })
    );
    const controller = new AbortController();
    const pending = fetchData(
      "https://example.test",
      {},
      {
        usePool: true,
        useCache: true,
        signal: controller.signal,
      }
    );
    const cancelled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    finishCache(null);
    await cancelled;
    jest.runOnlyPendingTimers();
    expect(fnPolyfill).not.toHaveBeenCalled();
  });

  test("cancelling a failed request prevents its delayed retry", async () => {
    fnPolyfill.mockRejectedValue(new Error("temporary failure"));
    const controller = new AbortController();
    const pending = fetchData(
      "https://example.test",
      {},
      {
        usePool: true,
        signal: controller.signal,
      }
    );
    const cancelled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    jest.runOnlyPendingTimers();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(fnPolyfill).toHaveBeenCalledTimes(1);
    controller.abort();
    await cancelled;
    jest.advanceTimersByTime(3000);
    expect(fnPolyfill).toHaveBeenCalledTimes(1);
  });
});
