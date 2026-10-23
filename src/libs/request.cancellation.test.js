jest.mock("./client", () => ({ isExt: true, isGm: false }));
jest.mock("./browser", () => ({
  isBg: () => false,
  browser: { runtime: { connect: jest.fn() } },
}));
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("./storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("./log", () => ({ kissLog: jest.fn() }));
jest.mock("../config", () => ({
  DEFAULT_HTTP_TIMEOUT: 30,
  MSG_FETCH: "kiss_fetch",
}));

import { sendBgMsg } from "./msg";
import { fnPolyfill } from "./request";
import { browser } from "./browser";
import { handleFetchPort } from "./requestPort";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("extension request cancellation", () => {
  let port;
  let fetchHandle;
  const event = () => {
    const listeners = new Set();
    return {
      addListener: (fn) => listeners.add(fn),
      removeListener: (fn) => listeners.delete(fn),
      emit: (message) => [...listeners].forEach((fn) => fn(message)),
    };
  };
  beforeEach(() => {
    sendBgMsg.mockReset();
    fetchHandle = jest.fn();
    browser.runtime.connect.mockReset().mockImplementation(() => {
      const background = { onMessage: event(), onDisconnect: event() };
      const client = {
        onMessage: event(),
        onDisconnect: event(),
        postMessage: jest.fn((message) => background.onMessage.emit(message)),
        disconnect: jest.fn(() => background.onDisconnect.emit()),
      };
      background.postMessage = (message) => client.onMessage.emit(message);
      handleFetchPort(background, fetchHandle);
      port = client;
      return client;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  test("does not send an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fnPolyfill({ opts: { signal: controller.signal } })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sendBgMsg).not.toHaveBeenCalled();
    expect(browser.runtime.connect).not.toHaveBeenCalled();
  });

  test.each(["resolve", "reject"])(
    "removes the abort listener when the background request ends with %s",
    async (outcome) => {
      const background = deferred();
      fetchHandle.mockReturnValue(background.promise);
      const controller = new AbortController();
      const addListener = jest.spyOn(controller.signal, "addEventListener");
      const removeListener = jest.spyOn(
        controller.signal,
        "removeEventListener"
      );
      const request = fnPolyfill({
        input: "https://example.test",
        opts: { signal: controller.signal, httpTimeout: 1000 },
      });
      const value = outcome === "resolve" ? { ok: true } : new Error("Failed");
      const expectation =
        outcome === "resolve"
          ? expect(request).resolves.toBe(value)
          : expect(request).rejects.toMatchObject({
              name: value.name,
              message: value.message,
            });

      background[outcome](value);
      await expectation;
      expect(removeListener).toHaveBeenCalledWith(
        "abort",
        addListener.mock.calls[0][1]
      );
      expect(browser.runtime.connect).toHaveBeenCalledWith({
        name: "kiss_fetch_port",
      });
      expect(port.postMessage).toHaveBeenCalledWith({
        action: "start",
        args: {
          input: "https://example.test",
          init: { signal: undefined },
          opts: { signal: undefined, httpTimeout: 1000 },
        },
      });
      expect(port.disconnect).toHaveBeenCalledTimes(1);
      expect(sendBgMsg).not.toHaveBeenCalled();
    }
  );

  test.each(["resolve", "reject"])(
    "removes the abort listener before a late background %s",
    async (outcome) => {
      const background = deferred();
      fetchHandle.mockReturnValue(background.promise);
      const controller = new AbortController();
      const addListener = jest.spyOn(controller.signal, "addEventListener");
      const removeListener = jest.spyOn(
        controller.signal,
        "removeEventListener"
      );
      const request = fnPolyfill({ opts: { signal: controller.signal } });
      const backgroundSignal = fetchHandle.mock.calls[0][0].opts.signal;
      const expectation = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });

      controller.abort();
      await expectation;
      expect(backgroundSignal.aborted).toBe(true);
      expect(removeListener).toHaveBeenCalledWith(
        "abort",
        addListener.mock.calls[0][1]
      );
      background[outcome](new Error("Late background completion"));
      await Promise.resolve();
      expect(fetchHandle).toHaveBeenCalledTimes(1);
      expect(port.disconnect).toHaveBeenCalledTimes(1);
      expect(sendBgMsg).not.toHaveBeenCalled();
    }
  );

  test("rejects on unexpected background disconnect", async () => {
    fetchHandle.mockReturnValue(new Promise(() => {}));
    const request = fnPolyfill({
      opts: { signal: new AbortController().signal },
    });
    const expectation = expect(request).rejects.toThrow(
      "Background request disconnected"
    );
    port.onDisconnect.emit();
    await expectation;
    expect(fetchHandle.mock.calls[0][0].opts.signal.aborted).toBe(true);
  });

  test("requests without a cancellation signal retain the message transport", async () => {
    sendBgMsg.mockResolvedValue("response");
    await expect(fnPolyfill({ input: "https://example.test" })).resolves.toBe(
      "response"
    );
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    expect(browser.runtime.connect).not.toHaveBeenCalled();
  });

  test.each(["resolve", "reject"])(
    "handles a disconnected port before onDisconnect is delivered after request %s",
    async (outcome) => {
      const request = deferred();
      const background = {
        onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
        onDisconnect: { addListener: jest.fn(), removeListener: jest.fn() },
        postMessage: jest.fn(() => {
          throw new Error("Attempting to use a disconnected port object");
        }),
      };
      handleFetchPort(background, () => request.promise);
      const start = background.onMessage.addListener.mock.calls[0][0];
      const disconnect = background.onDisconnect.addListener.mock.calls[0][0];
      const running = start({ action: "start", args: { opts: {} } });
      const expectation = expect(running).resolves.toBeUndefined();
      request[outcome](
        outcome === "resolve" ? "result" : new Error("Upstream failed")
      );
      await expectation;
      expect(background.postMessage).toHaveBeenCalledTimes(1);
      expect(background.onMessage.removeListener).toHaveBeenCalledWith(start);
      expect(background.onDisconnect.removeListener).toHaveBeenCalledWith(
        disconnect
      );
    }
  );

  test("cancelling an old request does not abort a new request or accept late old results", async () => {
    const old = deferred();
    const next = deferred();
    fetchHandle
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const controller = new AbortController();
    const oldRequest = fnPolyfill({ opts: { signal: controller.signal } });
    const cancelled = expect(oldRequest).rejects.toMatchObject({
      name: "AbortError",
    });
    const nextRequest = fnPolyfill({
      opts: { signal: new AbortController().signal },
    });
    const signals = fetchHandle.mock.calls.map(([args]) => args.opts.signal);
    controller.abort();
    await cancelled;
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
    old.resolve("stale result");
    next.resolve("current result");
    await expect(nextRequest).resolves.toBe("current result");
  });
});
