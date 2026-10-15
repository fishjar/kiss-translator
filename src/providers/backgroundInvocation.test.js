jest.mock("webextension-polyfill", () => ({
  storage: { onChanged: { addListener: jest.fn(), removeListener: jest.fn() } },
}));
jest.mock("./bridge", () => ({
  invokeProviderPort: jest.fn(),
  PROVIDER_HOST_PORT: "host",
}));
jest.mock("./runtime", () => ({ invokeInstance: jest.fn() }));
jest.mock("./grants", () => ({
  approvedProviderOrigins: jest.fn(),
  providerGrantKey: (id) => `grant:${id}`,
  providerPluginId: (instance) =>
    instance.provider?.source?.pluginId ||
    instance.provider?.code ||
    instance.apiSlug,
}));
jest.mock("../libs/localAiBackground", () => ({ localAiHost: jest.fn() }));
import browser from "webextension-polyfill";
import { invokeBackgroundPlugin } from "./backgroundInvocation";
import { invokeProviderPort } from "./bridge";
import { approvedProviderOrigins } from "./grants";
import { localAiHost } from "../libs/localAiBackground";
import { providerHostBusy } from "./hostLease";
import { invokeInstance } from "./runtime";
const instance = {
  apiSlug: "image",
  provider: { implementation: { kind: "script" } },
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
let previousChrome;
beforeEach(() => {
  jest.clearAllMocks();
  previousChrome = global.chrome;
  global.chrome = { offscreen: { createDocument: jest.fn() } };
  approvedProviderOrigins.mockResolvedValue(new Set(["https://mock.invalid"]));
  localAiHost.mockResolvedValue({});
});
afterEach(() => {
  global.chrome = previousChrome;
});
test("background without offscreen executes translation locally with verified grants", async () => {
  global.chrome = {};
  const cancel = jest.fn();
  invokeInstance.mockReturnValue({
    result: Promise.resolve({ items: [{ id: "0", text: "译文" }] }),
    events: (async function* () {})(),
    cancel,
  });
  const input = { items: [{ id: "0", text: "hello" }] };
  await expect(invokeBackgroundPlugin(instance, "translate", input).result).resolves.toMatchObject({ items: [{ id: "0", text: "译文" }] });
  expect(invokeInstance).toHaveBeenCalledWith(instance, "translate", input, expect.objectContaining({
    approvedOrigins: new Set(["https://mock.invalid"]), signal: expect.anything(),
  }));
  expect(invokeProviderPort).not.toHaveBeenCalled();
  expect(localAiHost).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
  expect(providerHostBusy()).toBe(false);
});
test("background validates grants and connects to host directly with the captured instance", async () => {
  const cancel = jest.fn();
  invokeProviderPort.mockReturnValue({
    result: Promise.resolve({ regions: [] }),
    events: (async function* () {})(),
    cancel,
  });
  await expect(
    invokeBackgroundPlugin(
      instance,
      "analyzeLayout",
      { image: {} },
      { timeoutMs: 500 }
    ).result
  ).resolves.toEqual({ regions: [] });
  expect(invokeProviderPort).toHaveBeenCalledWith(
    "host",
    { instance, approvedOrigins: ["https://mock.invalid"] },
    "analyzeLayout",
    { image: {} },
    expect.objectContaining({ signal: expect.anything() })
  );
  expect(cancel).toHaveBeenCalled();
  expect(providerHostBusy()).toBe(false);
  expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
});
test("revocation during grant verification releases the lease and prevents a late host call", async () => {
  let answer;
  approvedProviderOrigins.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  const task = invokeBackgroundPlugin(
    instance,
    "analyzeLayout",
    {},
    { timeoutMs: 500 }
  );
  await flush();
  expect(providerHostBusy()).toBe(true);
  browser.storage.onChanged.addListener.mock.calls[0][0](
    { "grant:image": { newValue: undefined } },
    "local"
  );
  await expect(task.result).rejects.toMatchObject({
    code: "PERMISSION_REQUIRED",
  });
  expect(providerHostBusy()).toBe(false);
  answer(new Set());
  await flush();
  expect(invokeProviderPort).not.toHaveBeenCalled();
});
test("cancelling during host creation releases ownership immediately without replay", async () => {
  let answer;
  localAiHost.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    })
  );
  const task = invokeBackgroundPlugin(
    instance,
    "recognizeText",
    {},
    { timeoutMs: 500 }
  );
  await flush();
  task.cancel();
  await expect(task.result).rejects.toMatchObject({ name: "AbortError" });
  await flush();
  expect(providerHostBusy()).toBe(false);
  answer({});
  await flush();
  expect(invokeProviderPort).not.toHaveBeenCalled();
});

test("plugin revocation cancels every background version and leaves other plugins active", async () => {
  const cancels = [];
  invokeProviderPort.mockImplementation(() => {
    const cancel = jest.fn();
    cancels.push(cancel);
    return {
      result: new Promise(() => {}),
      events: (async function* () {})(),
      cancel,
    };
  });
  const apis = ["old", "new", "other"].map((apiSlug) => ({
    ...instance,
    apiSlug,
    provider: {
      ...instance.provider,
      code: apiSlug,
      source: {
        pluginId: apiSlug === "other" ? "other" : "shared",
        version: apiSlug === "old" ? "1.0.0" : "2.0.0",
      },
    },
  }));
  const tasks = apis.map((api) =>
    invokeBackgroundPlugin(api, "analyzeLayout", {})
  );
  const outcomes = Promise.allSettled(tasks.map((task) => task.result));
  await flush();
  browser.storage.onChanged.addListener.mock.calls.forEach(([changed]) =>
    changed({ "grant:shared": { newValue: undefined } }, "local")
  );
  await flush();
  expect(cancels[0]).toHaveBeenCalledTimes(1);
  expect(cancels[1]).toHaveBeenCalledTimes(1);
  expect(cancels[2]).not.toHaveBeenCalled();
  tasks[2].cancel();
  const results = await outcomes;
  expect(results[0].reason.code).toBe("PERMISSION_REQUIRED");
  expect(results[1].reason.code).toBe("PERMISSION_REQUIRED");
  expect(providerHostBusy()).toBe(false);
});
