import browser from "webextension-polyfill";
import { FILE_CHANNEL } from "./fileTranslation/protocol";
import { FileTranslationClient } from "./fileTranslation/client";

jest.mock("webextension-polyfill", () => ({
  runtime: { id: "ext", connect: jest.fn() },
}));
jest.mock("./fileTranslation/protocol", () => ({
  ...jest.requireActual("./fileTranslation/protocol"),
  FILE_CHANNEL: "kiss-file-translation-v1",
  FILE_PROTOCOL: 1,
  isFileBridgePage: () => true,
}));

let ports;
const inject = () => jest.isolateModules(() => require("./fileBridge"));
const send = (data) =>
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      origin: window.location.origin,
      data: { channel: FILE_CHANNEL, direction: "web", ...data },
    })
  );
beforeEach(() => {
  ports = [];
  browser.runtime.id = "ext";
  browser.runtime.connect.mockReset();
  browser.runtime.connect.mockImplementation(() => {
    const port = {
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
      disconnect: jest.fn(() =>
        port.onDisconnect.addListener.mock.calls[0]?.[0]()
      ),
    };
    ports.push(port);
    return port;
  });
  jest.spyOn(window, "postMessage").mockImplementation(() => {});
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => "bridge-id" },
  });
});
afterEach(() => {
  window.__kissFileTranslationBridge?.dispose();
  jest.restoreAllMocks();
});

test("repeated injection retains one listener and one port", () => {
  inject();
  inject();
  send({ type: "discover" });
  expect(browser.runtime.connect).toHaveBeenCalledTimes(1);
  expect(window.postMessage).toHaveBeenCalledTimes(1);
  send({ type: "disconnect", extensionId: "ext", bridgeId: "bridge-id" });
  expect(ports[0].disconnect).toHaveBeenCalledTimes(1);
  // Intentional disconnect must not report a spurious port failure.
  expect(window.postMessage).toHaveBeenCalledTimes(1);
});

test("an invalid instance is removed and a new extension can take over", () => {
  inject();
  send({ type: "discover" });
  browser.runtime.id = undefined;
  ports[0].disconnect.mockImplementation(() => {
    throw new Error("invalid context");
  });
  send({ type: "discover" });
  expect(window.__kissFileTranslationBridge).toBeUndefined();
  expect(window.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "disconnected",
      extensionId: "ext",
    }),
    window.location.origin
  );
  browser.runtime.id = "new";
  inject();
  send({ type: "discover" });
  expect(browser.runtime.connect).toHaveBeenCalledTimes(2);
  expect(window.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "available",
      extensionId: "new",
    }),
    window.location.origin
  );
});

test("reinjection replaces an invalid instance before its next discovery", () => {
  inject();
  const old = window.__kissFileTranslationBridge;
  browser.runtime.id = "new";
  inject();
  expect(window.__kissFileTranslationBridge).not.toBe(old);
  send({ type: "discover" });
  expect(browser.runtime.connect).toHaveBeenCalledTimes(1);
  expect(window.postMessage).toHaveBeenCalledTimes(1);
});

test("port send failures are reported and a later discovery reconnects", () => {
  inject();
  send({ type: "discover" });
  ports[0].postMessage.mockImplementation(() => {
    throw new Error("closed port");
  });
  send({
    type: "request",
    extensionId: "ext",
    bridgeId: "bridge-id",
    request: {},
  });
  expect(window.postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: "disconnected",
    }),
    window.location.origin
  );
  send({ type: "discover" });
  expect(browser.runtime.connect).toHaveBeenCalledTimes(2);
});

test("pagehide closes the port and discovery can restore it on pageshow", () => {
  inject();
  send({ type: "discover" });
  window.dispatchEvent(new Event("pagehide"));
  send({ type: "discover" });
  expect(ports[0].disconnect).toHaveBeenCalledTimes(1);
  expect(browser.runtime.connect).toHaveBeenCalledTimes(2);
});

test.each([true, false])("a silent backend port is replaced on %s automatic recovery without reloading", async (automatic) => {
  jest.useFakeTimers();
  let sequence = 0;
  crypto.randomUUID = () => `id-${++sequence}`;
  const target = {
    location: window.location,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    postMessage: (data) => send(data),
  };
  const client = new FileTranslationClient(target);
  window.postMessage.mockImplementation((data) => client.receive({
    source: target, origin: target.location.origin, data,
  }));
  const createPort = browser.runtime.connect.getMockImplementation();
  browser.runtime.connect.mockImplementation(() => {
    const port = createPort();
    if (ports.length > 1) port.postMessage.mockImplementation((request) => {
      if (request.method === "handshake") port.onMessage.addListener.mock.calls[0][0]({
        type: "response", requestId: request.requestId,
        result: { protocolVersion: 1, extensionId: "ext", sessionId: "recovered" },
      });
    });
    return port;
  });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  try {
    inject();
    const first = client.connect("ext").catch((error) => error);
    jest.advanceTimersByTime(500);
    await flush();
    jest.advanceTimersByTime(10000);
    await flush();
    expect(await first).toMatchObject({ code: "REQUEST_TIMEOUT" });
    expect(ports[0].disconnect).toHaveBeenCalledTimes(1);
    if (automatic) jest.advanceTimersByTime(1000);
    else client.connect("ext");
    jest.advanceTimersByTime(500);
    await flush();
    expect(ports).toHaveLength(2);
    expect(client.session.sessionId).toBe("recovered");
    ports[0].onDisconnect.addListener.mock.calls[0][0]();
    expect(client.session.sessionId).toBe("recovered");
  } finally {
    client.dispose();
    jest.useRealTimers();
  }
});
