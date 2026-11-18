import { STOKEY_SETTING } from "../config/storage";
jest.mock("webextension-polyfill", () => ({
  storage: { onChanged: { addListener: jest.fn(), removeListener: jest.fn() } },
}));
jest.mock("./bridge", () => ({
  invokeProviderPort: jest.fn(),
  PROVIDER_HOST_PORT: "host",
}));
jest.mock("./runtime", () => ({ invokeInstance: jest.fn() }));
jest.mock("../libs/localAiBackground", () => ({ localAiHost: jest.fn() }));
jest.mock("./originRulesBackground", () => ({
  ensurePluginOriginRules: jest.fn(),
}));
import browser from "webextension-polyfill";
import { invokeBackgroundPlugin } from "./backgroundInvocation";
import { invokeProviderPort } from "./bridge";
import { localAiHost } from "../libs/localAiBackground";
import { providerHostBusy } from "./hostLease";
import { invokeInstance } from "./runtime";
import { ensurePluginOriginRules } from "./originRulesBackground";
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
  localAiHost.mockResolvedValue({});
  ensurePluginOriginRules.mockResolvedValue(undefined);
});
afterEach(() => {
  global.chrome = previousChrome;
});

test("a declared Origin permission waits for synchronization before starting the host", async () => {
  let release;
  ensurePluginOriginRules.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  invokeProviderPort.mockReturnValue({
    result: Promise.resolve({ text: "ok" }),
    events: (async function* () {})(),
    cancel: jest.fn(),
  });
  const declared = {
    ...instance,
    provider: {
      ...instance.provider,
      permissions: { originRewrite: ["https://api.example"] },
    },
  };
  const call = invokeBackgroundPlugin(declared, "parseImage", {});
  await flush();
  expect(ensurePluginOriginRules).toHaveBeenCalledWith(declared);
  expect(localAiHost).not.toHaveBeenCalled();
  expect(invokeProviderPort).not.toHaveBeenCalled();
  release();
  await expect(call.result).resolves.toEqual({ text: "ok" });
});

test("Origin synchronization failure prevents a dependent request", async () => {
  ensurePluginOriginRules.mockRejectedValueOnce(
    new Error("DNR quota exceeded")
  );
  const declared = {
    ...instance,
    provider: {
      ...instance.provider,
      permissions: { originRewrite: ["https://api.example"] },
    },
  };
  await expect(
    invokeBackgroundPlugin(declared, "parseImage", {}).result
  ).rejects.toThrow("DNR quota exceeded");
  expect(invokeProviderPort).not.toHaveBeenCalled();
});
test("background without offscreen executes translation locally without local authorization", async () => {
  global.chrome = {};
  const cancel = jest.fn();
  invokeInstance.mockReturnValue({
    result: Promise.resolve({ items: [{ id: "0", text: "译文" }] }),
    events: (async function* () {})(),
    cancel,
  });
  const input = { items: [{ id: "0", text: "hello" }] };
  await expect(
    invokeBackgroundPlugin(instance, "translate", input).result
  ).resolves.toMatchObject({ items: [{ id: "0", text: "译文" }] });
  expect(invokeInstance).toHaveBeenCalledWith(
    instance,
    "translate",
    input,
    expect.objectContaining({
      signal: expect.anything(),
    })
  );
  expect(invokeProviderPort).not.toHaveBeenCalled();
  expect(localAiHost).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
  expect(providerHostBusy()).toBe(false);
});
test("background connects to host directly with the captured instance", async () => {
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
    { instance },
    "analyzeLayout",
    { image: {} },
    expect.objectContaining({ signal: expect.anything() })
  );
  expect(cancel).toHaveBeenCalled();
  expect(providerHostBusy()).toBe(false);
  expect(browser.storage.onChanged.removeListener).toHaveBeenCalled();
});
test("disabling during host startup prevents a late host call", async () => {
  let answer;
  localAiHost.mockReturnValueOnce(
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
  browser.storage.onChanged.addListener.mock.calls[0][0](
    { [STOKEY_SETTING]: { newValue: { transApis: [] } } },
    "local"
  );
  await expect(task.result).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
  });
  expect(providerHostBusy()).toBe(false);
  answer({});
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

test("old grant changes do not cancel background calls", async () => {
  const cancel = jest.fn();
  invokeProviderPort.mockReturnValue({
    result: new Promise(() => {}),
    events: (async function* () {})(),
    cancel,
  });
  const task = invokeBackgroundPlugin(instance, "analyzeLayout", {});
  await flush();
  browser.storage.onChanged.addListener.mock.calls[0][0](
    { "kiss-provider-plugin-grant:example": { newValue: undefined } },
    "local"
  );
  expect(cancel).not.toHaveBeenCalled();
  task.cancel();
  await expect(task.result).rejects.toMatchObject({ name: "AbortError" });
  await flush();
  expect(cancel).toHaveBeenCalled();
  expect(providerHostBusy()).toBe(false);
});
