/* eslint-disable testing-library/no-unnecessary-act -- These tests use React createRoot directly. */
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileTranslationProvider, useFileTranslation } from "./State";
import { getFileClient } from "../../fileTranslation/client";
import { useTheme } from "@mui/material";

jest.mock("../../fileTranslation/client", () => ({ getFileClient: jest.fn() }));

function makeClient() {
  let subscriber;
  return {
    connect: jest.fn(),
    request: jest.fn(),
    subscribe: jest.fn((listener) => {
      subscriber = listener;
      return jest.fn();
    }),
    dispose: jest.fn(function () {
      this.disposed = true;
    }),
    emit: (event) => subscriber(event),
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let value, container, root;
function Content() {
  value = useFileTranslation();
  const theme = useTheme();
  return (
    <>
      <h1>File Translation</h1>
      {value.connectionStatus}
      {value.connectionNotice}
      <div data-testid="content">File content</div>
      <div data-testid="theme">{theme.palette.mode}</div>
    </>
  );
}
beforeEach(() => {
  localStorage.removeItem("kiss-file-translate-lang");
  localStorage.removeItem("kiss-homepage-lang");
  localStorage.setItem("kiss-homepage-theme", "light");
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

test("StrictMode ignores an old connection failure and keeps notices below the title", async () => {
  const old = makeClient(),
    current = makeClient();
  const attempt = deferred();
  old.connect.mockReturnValue(attempt.promise);
  current.session = { sessionId: "new", extensionVersion: "2.1.0" };
  current.connect.mockResolvedValue(current.session);
  current.request.mockResolvedValue({
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    models: [],
    ocrModels: [],
  });
  getFileClient.mockReturnValueOnce(old).mockReturnValue(current);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <StrictMode>
        <FileTranslationProvider>
          <Content />
        </FileTranslationProvider>
      </StrictMode>
    )
  );
  await act(async () => attempt.reject(new Error("stale failure")));
  expect(old.dispose).toHaveBeenCalledTimes(1);
  expect(value.connected).toBe(true);
  expect(container.textContent).not.toContain("stale failure");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("Connected · 2.1.0");
  await act(async () =>
    current.emit({ type: "disconnected", error: new Error("connection lost") })
  );
  expect(value.connected).toBe(false);
  expect(container.textContent).toContain("connection lost");
  const title = container.querySelector("h1"),
    notice = container.querySelector('[role="alert"]');
  expect(
    title.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});

test("queued scene writes retain order and never replay into a new session", async () => {
  const client = makeClient(),
    firstWrite = deferred();
  client.session = { sessionId: "first", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockImplementation(async (method) =>
    method === "getContext"
      ? {
          scenes: { txt: { toLang: "en" } },
          services: [],
          prompts: [],
          styles: [],
          models: [],
          ocrModels: [],
        }
      : firstWrite.promise
  );
  getFileClient.mockReturnValue(client);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  await act(async () => {
    value.patchScene("txt", { toLang: "zh-CN" });
    value.patchScene("txt", { toLang: "ja" });
  });
  expect(
    client.request.mock.calls.filter(([method]) => method === "patchScene")
  ).toHaveLength(1);
  client.session = { sessionId: "second" };
  await act(async () => firstWrite.resolve({}));
  expect(
    client.request.mock.calls.filter(([method]) => method === "patchScene")
  ).toHaveLength(1);
});

test("connected language follows extension changes and survives disconnect", async () => {
  const client = makeClient();
  const context = {
    scenes: {},
    services: [],
    prompts: [],
    styles: [],
    models: [],
    ocrModels: [],
    uiLang: "zh",
  };
  client.session = { sessionId: "language", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue(context);
  getFileClient.mockReturnValue(client);
  // eslint-disable-next-line testing-library/no-unnecessary-act -- This uses React createRoot, not Testing Library.
  await act(async () =>
    root.render(
      <FileTranslationProvider>
        <Content />
      </FileTranslationProvider>
    )
  );
  expect(value.uiLang).toBe("zh");
  expect(value.i18n("translate")).toBe("翻译");
  expect(document.documentElement.lang).toBe("zh-CN");
  client.request.mockResolvedValue({ ...context, uiLang: "ja" });
  jest.useFakeTimers();
  try {
    await act(async () => {
      client.emit({ type: "contextChanged" });
      jest.advanceTimersByTime(150);
    });
    expect(value.uiLang).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    await act(async () =>
      client.emit({ type: "disconnected", error: new Error("disconnected") })
    );
    expect(value.uiLang).toBe("ja");
    expect(document.documentElement.lang).toBe("ja");
    expect(localStorage.getItem("kiss-file-translate-lang")).toBe("ja");
  } finally {
    jest.useRealTimers();
  }
});


test("automatic reconnect clears the notice and refreshes extension context", async () => {
  const client = makeClient();
  client.session = { sessionId: "first", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({ scenes: {}, services: [], prompts: [], styles: [], models: [], ocrModels: [] });
  getFileClient.mockReturnValue(client);
  await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
  await act(async () => client.emit({ type: "disconnected", error: new Error("lost") }));
  expect(value.connected).toBe(false);
  await act(async () => client.emit({ type: "reconnecting" }));
  expect(container.textContent).toContain("Reconnecting");
  client.session = { sessionId: "restored", extensionVersion: "2.1.0" };
  const before = client.request.mock.calls.length;
  await act(async () => client.emit({ type: "connected", reconnecting: true, session: client.session }));
  expect(value.connected).toBe(true);
  expect(container.textContent).not.toContain("lost");
  expect(client.request.mock.calls.length).toBe(before + 1);
});

test("cached language and toggled theme survive disconnect and a new page mount", async () => {
  const client = makeClient();
  client.session = { sessionId: "preferences", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({ scenes: {}, services: [], prompts: [], styles: [], uiLang: "zh" });
  getFileClient.mockReturnValue(client);
  await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
  await act(async () => value.toggleTheme());
  expect(localStorage.getItem("kiss-homepage-theme")).toBe("dark");
  await act(async () => client.emit({ type: "disconnected", error: new Error("lost") }));
  expect(value.uiLang).toBe("zh");
  expect(container.querySelector('[data-testid="theme"]').textContent).toBe("dark");
  act(() => root.unmount());
  root = createRoot(container);
  const next = makeClient();
  next.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(next);
  await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
  expect(value.uiLang).toBe("zh");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(container.querySelector('[data-testid="theme"]').textContent).toBe("dark");
  expect(localStorage.getItem("kiss-homepage-lang")).toBeNull();
});

test("retry countdown uses the scheduled deadline and manual connect exits the wait", async () => {
  jest.useFakeTimers();
  const client = makeClient();
  client.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(client);
  try {
    await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
    const reconnectAt = Date.now() + 8000;
    await act(async () => client.emit({ type: "reconnectScheduled", reconnectAt }));
    expect(container.textContent).toContain("Reconnecting in 8s");
    await act(async () => jest.advanceTimersByTime(2000));
    expect(container.textContent).toContain("Reconnecting in 6s");
    jest.setSystemTime(reconnectAt - 1000);
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.textContent).toContain("Reconnecting in 1s");
    const pending = deferred();
    client.connect.mockReturnValue(pending.promise);
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Reconnect now");
    await act(async () => button.click());
    expect(client.connect).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Connecting");
    expect(container.textContent).not.toContain("Reconnecting in");
    await act(async () => pending.reject(new Error("timeout")));
    expect(container.querySelector('button[aria-label="Connect extension"]').disabled).toBe(false);
  } finally { jest.useRealTimers(); }
});

test("unavailable storage does not lose the in-memory extension language", async () => {
  const client = makeClient();
  client.session = { sessionId: "storage", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockResolvedValue({ scenes: {}, services: [], prompts: [], styles: [], uiLang: "ja" });
  getFileClient.mockReturnValue(client);
  const store = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("unavailable"); });
  try {
    await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
    await act(async () => client.emit({ type: "disconnected", error: new Error("lost") }));
    expect(value.uiLang).toBe("ja");
  } finally { store.mockRestore(); }
});

test("automatic discovery exposes multiple extensions for manual selection", async () => {
  const client = makeClient();
  client.connect.mockRejectedValue(new Error("missing"));
  getFileClient.mockReturnValue(client);
  await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
  await act(async () => client.emit({ type: "reconnecting" }));
  await act(async () => client.emit({
    type: "reconnectFailed", error: Object.assign(new Error("choose extension"), {
      extensions: ["one", "two"],
    }),
  }));
  expect(container.querySelector('[role="combobox"]')).not.toBeNull();
  expect(container.textContent).toContain("choose extension");
  expect(container.querySelector('button[aria-label="Connect extension"]').disabled).toBe(false);
});

test.each(["resolve", "reject"])("a previous session context %s cannot replace restored settings", async (settlement) => {
  const client = makeClient(), oldContext = deferred();
  const context = { scenes: {}, services: [], prompts: [], styles: [], models: [], ocrModels: [] };
  client.session = { sessionId: "first", extensionVersion: "2.1.0" };
  client.connect.mockResolvedValue(client.session);
  client.request.mockReturnValueOnce(oldContext.promise).mockResolvedValue({ ...context, uiLang: "ja" });
  getFileClient.mockReturnValue(client);
  await act(async () => root.render(<FileTranslationProvider><Content /></FileTranslationProvider>));
  await act(async () => client.emit({ type: "disconnected", error: new Error("lost") }));
  client.session = { sessionId: "restored", extensionVersion: "2.1.0" };
  await act(async () => client.emit({ type: "connected", reconnecting: true, session: client.session }));
  await act(async () => oldContext[settlement](settlement === "resolve"
    ? { ...context, uiLang: "zh" } : new Error("stale failure")));
  expect(value.uiLang).toBe("ja");
  expect(value.connected).toBe(true);
  expect(container.textContent).not.toContain("stale failure");
  expect(container.querySelector('[data-testid="content"]').textContent).toBe("File content");
});
