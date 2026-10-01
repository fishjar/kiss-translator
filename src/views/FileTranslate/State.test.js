import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FileTranslationProvider, useFileTranslation } from "./State";
import { getFileClient } from "../../fileTranslation/client";

jest.mock("../../fileTranslation/client", () => ({ getFileClient: jest.fn() }));
jest.mock("../../homepage/useHomepageSettings", () => ({
  useHomepageSettings: () => ({
    language: "en",
    themeMode: "light",
    toggleThemeMode: jest.fn(),
  }),
}));

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
  return (
    <>
      <h1>File Translation</h1>
      {value.connectionStatus}
      {value.connectionNotice}
      <div data-testid="content">File content</div>
    </>
  );
}
beforeEach(() => {
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

test("connected language follows extension changes and falls back to homepage after disconnect", async () => {
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
    expect(value.uiLang).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  } finally {
    jest.useRealTimers();
  }
});
