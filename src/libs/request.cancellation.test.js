jest.mock("./client", () => ({ isExt: true, isGm: false }));
jest.mock("./browser", () => ({ isBg: () => false }));
jest.mock("./msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("./storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("./log", () => ({ kissLog: jest.fn() }));
jest.mock("../config", () => ({
  DEFAULT_HTTP_TIMEOUT: 30,
  MSG_FETCH: "kiss_fetch",
}));

import { sendBgMsg } from "./msg";
import { fnPolyfill } from "./request";

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
  beforeEach(() => sendBgMsg.mockReset());
  afterEach(() => jest.restoreAllMocks());

  test("does not send an already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fnPolyfill({ opts: { signal: controller.signal } })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test.each(["resolve", "reject"])(
    "removes the abort listener when the background request ends with %s",
    async (outcome) => {
      const background = deferred();
      sendBgMsg.mockReturnValue(background.promise);
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
          : expect(request).rejects.toBe(value);

      background[outcome](value);
      await expectation;
      expect(removeListener).toHaveBeenCalledWith(
        "abort",
        addListener.mock.calls[0][1]
      );
      expect(sendBgMsg).toHaveBeenCalledWith("kiss_fetch", {
        input: "https://example.test",
        opts: { signal: undefined, httpTimeout: 1000 },
      });
    }
  );

  test.each(["resolve", "reject"])(
    "removes the abort listener before a late background %s",
    async (outcome) => {
      const background = deferred();
      sendBgMsg.mockReturnValue(background.promise);
      const controller = new AbortController();
      const addListener = jest.spyOn(controller.signal, "addEventListener");
      const removeListener = jest.spyOn(
        controller.signal,
        "removeEventListener"
      );
      const request = fnPolyfill({ opts: { signal: controller.signal } });
      const expectation = expect(request).rejects.toMatchObject({
        name: "AbortError",
      });

      controller.abort();
      await expectation;
      expect(removeListener).toHaveBeenCalledWith(
        "abort",
        addListener.mock.calls[0][1]
      );
      background[outcome](new Error("Late background completion"));
      await Promise.resolve();
      expect(sendBgMsg).toHaveBeenCalledTimes(1);
    }
  );
});
