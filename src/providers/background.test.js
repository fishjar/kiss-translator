jest.mock("webextension-polyfill", () => ({
  runtime: { onConnect: { addListener: jest.fn() } },
  storage: { onChanged: { addListener: jest.fn() } },
}));
jest.mock("../libs/storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("../libs/localAiBackground", () => ({ localAiHost: jest.fn() }));
jest.mock("./bridge", () => ({
  PROVIDER_PORT: "client",
  PROVIDER_HOST_PORT: "host",
}));
jest.mock("./host", () => ({ serveProviderPort: jest.fn() }));
import browser from "webextension-polyfill";
import { installProviderRelay } from "./background";
import { getSettingWithDefault } from "../libs/storage";
import { serveProviderPort } from "./host";
import { STOKEY_SETTING } from "../config/storage";
import { providerHostBusy } from "./hostLease";
import { localAiHost } from "../libs/localAiBackground";

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
  installProviderRelay();
  return {
    connect: browser.runtime.onConnect.addListener.mock.calls[0][0],
    change: browser.storage.onChanged.addListener.mock.calls[0][0],
  };
}

test("saved local ASR is hosted without external grants and disabling releases its lease", async () => {
  const previousChrome = global.chrome;
  const previousConnect = browser.runtime.connect;
  const relay = setup(),
    page = client();
  const host = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: jest.fn(),
    disconnect: jest.fn(),
  };
  browser.runtime.connect = jest.fn(() => host);
  global.chrome = { offscreen: { createDocument: jest.fn() } };
  getSettingWithDefault.mockResolvedValue({
    transApis: [
      {
        apiSlug: "local",
        apiType: "LocalAI",
        enabledCapabilities: ["transcribe"],
      },
    ],
  });
  try {
    relay.connect(page);
    page.onMessage.emit({
      type: "start",
      serviceId: "local",
      capability: "transcribe",
      input: { audio: { assetId: "test" } },
    });
    await flush();
    expect(localAiHost).toHaveBeenCalledWith({ action: "ensure" });
    expect(providerHostBusy()).toBe(true);
    host.onMessage.emit({ type: "ready" });
    expect(host.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instance: expect.objectContaining({ apiSlug: "local" }),
      })
    );
    relay.change(
      { [STOKEY_SETTING]: { newValue: { transApis: [] } } },
      "local"
    );
    expect(page.disconnect).toHaveBeenCalled();
    expect(providerHostBusy()).toBe(false);
  } finally {
    page.onDisconnect.emit();
    global.chrome = previousChrome;
    browser.runtime.connect = previousConnect;
  }
});

test("local host startup failure returns a typed error and releases its lease", async () => {
  const previousChrome = global.chrome;
  const relay = setup(),
    page = client();
  global.chrome = { offscreen: { createDocument: jest.fn() } };
  getSettingWithDefault.mockResolvedValue({
    transApis: [{ apiSlug: "local", apiType: "LocalAI" }],
  });
  localAiHost.mockRejectedValueOnce(new Error("Host startup failed"));
  try {
    relay.connect(page);
    page.onMessage.emit({
      type: "start",
      serviceId: "local",
      capability: "transcribe",
    });
    await flush();
    expect(page.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ code: "HOST_STARTUP_FAILED" }),
      })
    );
    expect(providerHostBusy()).toBe(false);
  } finally {
    page.onDisconnect.emit();
    global.chrome = previousChrome;
  }
});

test("a local host without a ready handshake times out without retaining its port or lease", async () => {
  jest.useFakeTimers();
  const previousChrome = global.chrome,
    previousConnect = browser.runtime.connect;
  const relay = setup(),
    page = client();
  const host = {
    onMessage: event(),
    onDisconnect: event(),
    postMessage: jest.fn(),
    disconnect: jest.fn(),
  };
  global.chrome = { offscreen: { createDocument: jest.fn() } };
  browser.runtime.connect = jest.fn(() => host);
  getSettingWithDefault.mockResolvedValue({
    transApis: [{ apiSlug: "local", apiType: "LocalAI" }],
  });
  try {
    relay.connect(page);
    page.onMessage.emit({
      type: "start",
      serviceId: "local",
      capability: "transcribe",
    });
    await flush();
    jest.advanceTimersByTime(10000);
    expect(page.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "HOST_STARTUP_FAILED" }),
      })
    );
    expect(host.disconnect).toHaveBeenCalled();
    expect(page.disconnect).toHaveBeenCalled();
    expect(providerHostBusy()).toBe(false);
  } finally {
    page.onDisconnect.emit();
    global.chrome = previousChrome;
    browser.runtime.connect = previousConnect;
    jest.useRealTimers();
  }
});

test.each([
  {
    apiType: "LocalAI",
    provider: {
      apiVersion: 1,
      source: { external: true },
      implementation: { kind: "native", entry: "LocalAI" },
    },
  },
  {
    apiType: "LocalAI",
    provider: {
      apiVersion: 1,
      implementation: { kind: "native", entry: "Other" },
    },
  },
  { apiType: "Other", provider: { implementation: { kind: "native" } } },
])(
  "untrusted native snapshots cannot enter the local ASR host: %j",
  async (instance) => {
    const relay = setup(),
      page = client();
    getSettingWithDefault.mockResolvedValue({
      transApis: [{ ...instance, apiSlug: "local" }],
    });
    relay.connect(page);
    page.onMessage.emit({
      type: "start",
      serviceId: "local",
      capability: "transcribe",
    });
    await flush();
    expect(localAiHost).not.toHaveBeenCalled();
    expect(page.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" })
    );
  }
);

test("delete one instance across pages without cancelling a different instance", async () => {
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
    { [STOKEY_SETTING]: { newValue: { transApis: [{ apiSlug: "two" }] } } },
    "local"
  );
  expect(pages[0].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[1].disconnect).toHaveBeenCalledTimes(1);
  expect(pages[2].disconnect).not.toHaveBeenCalled();
  expect(pages[0].postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "error",
      error: expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }),
    })
  );
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

test("disabling cancels the remote host and releases its lease without a local disconnect event", async () => {
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
      {
        [STOKEY_SETTING]: {
          newValue: { transApis: [{ apiSlug: "one", isDisabled: true }] },
        },
      },
      "local"
    );
    expect(host.disconnect).toHaveBeenCalledTimes(1);
    expect(providerHostBusy()).toBe(false);
  } finally {
    global.chrome = previousChrome;
  }
});

test("legacy grant removals do not cancel active services", async () => {
  const relay = setup();
  const pages = [client(), client()];
  pages.forEach(relay.connect);
  pages.forEach((page, index) =>
    page.onMessage.emit({ type: "start", serviceId: index ? "two" : "one" })
  );
  await flush();
  expect(serveProviderPort).toHaveBeenCalledTimes(2);
  relay.change(
    { "kiss-provider-plugin-grant:shared": { newValue: undefined } },
    "local"
  );
  pages.forEach((page) => expect(page.disconnect).not.toHaveBeenCalled());
  relay.change({ [STOKEY_SETTING]: { newValue: { transApis: [] } } }, "local");
  pages.forEach((page) => expect(page.disconnect).toHaveBeenCalledTimes(1));
});
