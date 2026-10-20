import { invokeBridgedService } from "./bridgeInvocation";
import { invokePlugin } from "./bridge";
import { invokeSavedService } from "./savedService";
import { invokeScene } from "./sceneInvocation";
import { createInvocation } from "./invocation";
import { getSettingWithDefault } from "../libs/storage";
import { MAX_SERVICE_TIMEOUT_MS } from "./timeout";
import { subscribeStorageInvalidation } from "../libs/storageEvents";

jest.mock("../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("../libs/storageEvents", () => ({
  subscribeStorageInvalidation: jest.fn(() => jest.fn()),
}));
jest.mock("./bridge", () => ({ invokePlugin: jest.fn() }));
jest.mock("./sceneInvocation", () => ({ invokeScene: jest.fn() }));
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
afterEach(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  subscribeStorageInvalidation.mockImplementation(() => jest.fn());
});

test.each([undefined, 30, 600])(
  "ID-only saved calls resolve their existing timeout %s before starting the provider",
  async (httpTimeout) => {
    jest.useFakeTimers();
    const api = { apiSlug: "saved", httpTimeout };
    getSettingWithDefault.mockResolvedValue({ transApis: [api] });
    invokeScene.mockImplementation((api, capability, input, options) =>
      createInvocation(() => new Promise(() => {}), options)
    );
    const call = invokeSavedService("saved", "chat", {});
    await flush();
    const expected = (httpTimeout ?? 120) * 1000;
    expect(invokeScene.mock.calls.at(-1)[3].timeoutMs).toBe(expected);
    jest.advanceTimersByTime(expected - 1);
    let settled = false;
    call.result.catch(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    await flush();
    await expect(call.result).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
    });
    await call.finished;
    expect(jest.getTimerCount()).toBe(0);
  }
);

test("the ID-only frontend bridge resolves a custom 600-second timeout before its port is opened", async () => {
  jest.useFakeTimers();
  getSettingWithDefault.mockResolvedValue({
    transApis: [{ apiSlug: "saved", httpTimeout: 600 }],
  });
  invokePlugin.mockImplementation((serviceId, capability, input, options) =>
    createInvocation(() => new Promise(() => {}), options)
  );
  const call = invokeBridgedService("saved", "chat", {});
  await flush();
  expect(invokePlugin.mock.calls.at(-1)[3].timeoutMs).toBe(600000);
  jest.advanceTimersByTime(600000);
  await flush();
  await expect(call.result).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  await call.finished;
  expect(jest.getTimerCount()).toBe(0);
});

test("disabling a resolved saved service still cancels its in-flight call", async () => {
  jest.useFakeTimers();
  getSettingWithDefault.mockResolvedValue({ transApis: [{ apiSlug: "saved" }] });
  invokeScene.mockImplementation((api, capability, input, options) =>
    createInvocation(() => new Promise(() => {}), options)
  );
  const call = invokeSavedService("saved", "chat", {});
  await flush();
  getSettingWithDefault.mockResolvedValue({ transApis: [] });
  subscribeStorageInvalidation.mock.calls[0][1]();
  await expect(call.result).rejects.toHaveProperty("code", "REQUEST_CANCELLED");
  await call.finished;
  expect(jest.getTimerCount()).toBe(0);
});

describe.each([
  ["saved", invokeSavedService, invokeScene],
  ["bridge", invokeBridgedService, invokePlugin],
])("%s invocation discovery", (_, invoke, backend) => {
  beforeEach(() => {
    jest.useFakeTimers();
    backend.mockImplementation((api, capability, input, options) =>
      createInvocation(() => new Promise(() => {}), options)
    );
  });

  test.each([undefined, 30, 600, "30000"])(
    "configuration lookup consumes the saved %s budget", async (httpTimeout) => {
      let resolve;
      getSettingWithDefault.mockImplementation(() => new Promise(done => { resolve = done; }));
      const startedAt = Date.now();
      const call = invoke("saved", "chat", {});
      await flush();
      jest.advanceTimersByTime(10000);
      resolve({ transApis: [{ apiSlug: "saved", httpTimeout }] });
      await flush();
      const budget = httpTimeout === "30000" ? 30000 : (httpTimeout ?? 120) * 1000;
      expect(backend.mock.calls[0][3].deadlineAt).toBe(startedAt + budget);
      jest.advanceTimersByTime(budget - 10000 - 1);
      let failed = false;
      call.result.catch(() => { failed = true; });
      await flush();
      expect(failed).toBe(false);
      jest.advanceTimersByTime(1);
      await expect(call.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
      await call.finished;
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  test("an already exhausted saved budget never starts a provider", async () => {
    let resolve;
    getSettingWithDefault.mockImplementation(() => new Promise(done => { resolve = done; }));
    const call = invoke("saved", "chat", {});
    await flush();
    jest.advanceTimersByTime(31000);
    resolve({ transApis: [{ apiSlug: "saved", httpTimeout: 30 }] });
    await expect(call.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
    await call.finished;
    expect(backend).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(["timeout", "cancel", "parent", "explicit"])(
    "%s bounds discovery and late settings never start the provider", async (kind) => {
      let resolve;
      getSettingWithDefault.mockImplementation(() => new Promise(done => { resolve = done; }));
      let call, parent;
      if (kind === "parent") {
        parent = createInvocation(ctx => {
          call = invoke("saved", "chat", {}, { signal: ctx.signal });
          return call.result;
        }, { timeoutMs: 1000 });
      } else {
        call = invoke("saved", "chat", {}, kind === "explicit" ? { timeoutMs: 1000 } : {});
      }
      await flush();
      if (kind === "explicit" && invoke === invokeBridgedService) {
        // Explicit bridge calls need no frontend settings lookup.
        expect(getSettingWithDefault).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1000);
        await expect(call.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
        await call.finished;
        expect(jest.getTimerCount()).toBe(0);
        return;
      }
      if (kind === "cancel") call.cancel();
      else jest.advanceTimersByTime(kind === "timeout" ? MAX_SERVICE_TIMEOUT_MS : 1000);
      await expect(call.result).rejects.toHaveProperty(
        "code", expect.stringMatching(kind === "cancel" ? /REQUEST_CANCELLED/ : /REQUEST_(TIMEOUT|CANCELLED)/)
      );
      if (parent) await expect(parent.result).rejects.toHaveProperty("code", "REQUEST_TIMEOUT");
      await call.finished;
      resolve({ transApis: [{ apiSlug: "saved", httpTimeout: 600 }] });
      await flush();
      expect(backend).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    }
  );
});
