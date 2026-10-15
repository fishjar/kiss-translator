jest.mock("webextension-polyfill", () => ({
  runtime: { onConnect: { addListener: jest.fn() } },
  storage: { onChanged: { addListener: jest.fn() } },
}));
jest.mock("../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("../libs/localAiBackground", () => ({ localAiHost: jest.fn() }));
jest.mock("./grants", () => ({
  approvedProviderOrigins: jest.fn(async () => new Set()),
  providerGrantKey: (id) => `kiss-provider-grant:${id}`,
  providerPluginId: (instance) =>
    instance.provider?.source?.pluginId ||
    instance.provider?.code ||
    instance.apiSlug,
}));
jest.mock("./bridge", () => ({
  PROVIDER_PORT: "client",
  PROVIDER_HOST_PORT: "host",
}));
jest.mock("./host", () => ({ serveProviderPort: jest.fn() }));
import browser from "webextension-polyfill";
import { installProviderRelay } from "./background";
import { getSettingWithDefault } from "../libs/storage";
import { approvedProviderOrigins } from "./grants";
import { serveProviderPort } from "./host";
import { STOKEY_SETTING } from "../config/storage";
import { providerHostBusy } from "./hostLease";

const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function event() {
  const listeners = [];
  return {
    addListener: (fn) => listeners.push(fn),
    emit: (value) => {
      for (const fn of listeners) fn(value);
    },
  };
}
function client() {
  const connection = {
    name: "client",
    onMessage: event(),
    onDisconnect: event(),
    postMessage: jest.fn(),
  };
  // Real Chrome only emits onDisconnect on the other end of an explicit close.
  connection.disconnect = jest.fn();
  return connection;
}
function setup() {
  jest.clearAllMocks();
  getSettingWithDefault.mockResolvedValue({
    transApis: ["one", "two"].map((apiSlug) => ({
      apiSlug,
      apiType: "Plugin",
      provider: { implementation: { kind: "script" } },
    })),
  });
  approvedProviderOrigins.mockResolvedValue(new Set());
  installProviderRelay();
  return {
    connect: browser.runtime.onConnect.addListener.mock.calls[0][0],
    change: browser.storage.onChanged.addListener.mock.calls[0][0],
  };
}

test("revoke one instance across pages without cancelling a different instance", async () => {
  const relay = setup();
  const pages = [client(), client(), client()];
  for (const [index, page] of pages.entries()) {
    relay.connect(page);
    page.onMessage.emit({
      type: "start",
      serviceId: index === 2 ? "two" : "one",
    });
  }
  await flush();
  expect(serveProviderPort).toHaveBeenCalledTimes(3);
  relay.change(
    { "kiss-provider-grant:one": { oldValue: {}, newValue: undefined } },
    "local"
  );
  expect(pages[0].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[1].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[2].disconnect).not.toHaveBeenCalled();
  expect(pages[0].postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "error",
      error: expect.objectContaining({ code: "PERMISSION_REQUIRED" }),
    })
  );
});

test("revocation during asynchronous grant verification prevents a late host start", async () => {
  const relay = setup();
  let resolveGrant;
  approvedProviderOrigins.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveGrant = resolve;
      })
  );
  const page = client();
  relay.connect(page);
  page.onMessage.emit({ type: "start", serviceId: "one" });
  await flush();
  relay.change(
    { "kiss-provider-grant:one": { oldValue: {}, newValue: undefined } },
    "local"
  );
  resolveGrant(new Set());
  await flush();
  expect(serveProviderPort).not.toHaveBeenCalled();
  expect(page.disconnect).toHaveBeenCalledTimes(1);
});

test("ordinary edits and renewed grants preserve in-flight snapshots; disable cancels them", async () => {
  const relay = setup();
  const page = client();
  relay.connect(page);
  page.onMessage.emit({ type: "start", serviceId: "one" });
  await flush();
  relay.change(
    {
      [STOKEY_SETTING]: {
        newValue: JSON.stringify({
          transApis: [{ apiSlug: "one", pluginConfig: { model: "changed" } }],
        }),
      },
      "kiss-provider-grant:one": { newValue: {} },
    },
    "local"
  );
  expect(page.disconnect).not.toHaveBeenCalled();
  relay.change(
    {
      [STOKEY_SETTING]: {
        newValue: JSON.stringify({
          transApis: [{ apiSlug: "one", isDisabled: true }],
        }),
      },
    },
    "local"
  );
  expect(page.disconnect).toHaveBeenCalledTimes(1);
  expect(page.postMessage.mock.calls.at(-1)[0].error.code).toBe(
    "SERVICE_UNAVAILABLE"
  );
});

test("local revocation cancels the remote host and releases its lease without a local disconnect event", async () => {
  const previousChrome = global.chrome;
  const relay = setup();
  const host = client();
  browser.runtime.connect = jest.fn(() => host);
  global.chrome = { offscreen: { createDocument: jest.fn() } };
  try {
    const page = client();
    relay.connect(page);
    page.onMessage.emit({ type: "start", serviceId: "one" });
    await flush();
    expect(providerHostBusy()).toBe(true);
    relay.change(
      { "kiss-provider-grant:one": { newValue: undefined } },
      "local"
    );
    expect(host.disconnect).toHaveBeenCalledTimes(1);
    expect(providerHostBusy()).toBe(false);
  } finally {
    global.chrome = previousChrome;
  }
});

test("plugin revocation cancels different versions and implementations while leaving other plugins running", async () => {
  const relay = setup();
  getSettingWithDefault.mockResolvedValue({
    transApis: ["one", "two", "other"].map((apiSlug) => ({
      apiSlug,
      provider: {
        code: `implementation-${apiSlug}`,
        source: {
          pluginId: apiSlug === "other" ? "different" : "shared",
          version: apiSlug === "one" ? "1.0.0" : "2.0.0",
        },
        implementation: { kind: "script" },
      },
    })),
  });
  const pages = ["one", "two", "other"].map(() => client());
  pages.forEach(relay.connect);
  pages.forEach((page, index) =>
    page.onMessage.emit({
      type: "start",
      serviceId: ["one", "two", "other"][index],
    })
  );
  await flush();
  browser.storage.onChanged.addListener.mock.calls[0][0](
    { "kiss-provider-grant:shared": { newValue: undefined } },
    "local"
  );
  expect(pages[0].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[1].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[2].disconnect).not.toHaveBeenCalled();
  browser.storage.onChanged.addListener.mock.calls[0][0](
    { "kiss-provider-grant:different": { newValue: undefined } },
    "local"
  );
});
