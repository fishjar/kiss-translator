/** @jest-environment node */
import { createDiagnosticsBackend } from "./background";

const browser = {
  runtime: {
    id: "extension",
    getURL: (path) => `chrome-extension://extension/${path}`,
  },
};
const page = {
  id: "extension",
  url: browser.runtime.getURL("options.html"),
  tab: { id: 1 },
};
const content = {
  id: "extension",
  url: "https://example.com/private",
  tab: { id: 2 },
  frameId: 3,
};
let store, backend;
beforeEach(() => {
  store = {
    append: jest.fn().mockResolvedValue({ count: 1 }),
    query: jest.fn().mockResolvedValue({ records: [], stats: {} }),
    clear: jest.fn().mockResolvedValue(),
  };
  backend = createDiagnosticsBackend({ browser, getLevel: () => 4, store });
});

test.each([
  ["extension tab", page, true, true],
  ["extension without tab", { ...page, tab: undefined }, true, true],
  ["content script", content, true, false],
  ["external URL without tab", { ...content, tab: undefined }, true, false],
  ["missing URL", { id: "extension" }, true, false],
  ["other extension", { ...page, id: "other" }, false, false],
  ["missing sender", undefined, false, false],
])("sender permissions: %s", async (_label, sender, canAppend, canManage) => {
  const appended = await backend.handle(
    { operation: "append", records: [] },
    sender
  );
  expect(appended).toMatchObject(
    canAppend ? { ok: true } : { ok: false, error: "LOG_ACCESS_DENIED" }
  );

  for (const operation of [
    "query",
    "status",
    "clear",
    "detailStatus",
    "setDetail",
  ]) {
    const result = await backend.handle({ operation, enabled: false }, sender);
    expect(result).toMatchObject(
      canManage ? { ok: true } : { ok: false, error: "LOG_ACCESS_DENIED" }
    );
  }
  expect(store.query).toHaveBeenCalledTimes(canManage ? 2 : 0);
  expect(store.clear).toHaveBeenCalledTimes(canManage ? 1 : 0);
});

test("SILENT console setting still collects every severity", async () => {
  const records = ["debug", "info", "warn", "error"].map((level) => ({
    level,
    event: "test",
  }));
  expect(
    await backend.handle({ operation: "append", records }, content)
  ).toMatchObject({ ok: true });
  expect(store.append.mock.calls[0][0].map((r) => r.level)).toEqual([
    "debug",
    "info",
    "warn",
    "error",
  ]);
  expect(store.append.mock.calls[0][0][0]).toMatchObject({
    environment: "content",
    tabId: 2,
    frameId: 3,
    origin: "https://example.com",
  });
});

test("only own extension documents can read, export or clear", async () => {
  for (const operation of ["query", "status", "clear"]) {
    expect(await backend.handle({ operation }, content)).toMatchObject({
      ok: false,
      error: "LOG_ACCESS_DENIED",
    });
    expect(
      await backend.handle({ operation }, { ...page, id: "other" })
    ).toMatchObject({ ok: false });
    expect(await backend.handle({ operation }, page)).toMatchObject({
      ok: true,
    });
  }
});

test("acknowledgement waits for persistence, failures are visible and recoverable", async () => {
  let finish;
  store.append.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  let acknowledged = false;
  const pending = backend
    .handle({ operation: "append", records: [] }, content)
    .then((result) => {
      acknowledged = true;
      return result;
    });
  await Promise.resolve();
  expect(acknowledged).toBe(false);
  finish({ count: 0 });
  await expect(pending).resolves.toMatchObject({ ok: true });
  store.append.mockRejectedValueOnce(new Error("disk full"));
  await expect(
    backend.handle({ operation: "append", records: [] }, content)
  ).resolves.toMatchObject({ ok: false });
  expect(await backend.handle({ operation: "status" }, page)).toMatchObject({
    storageError: "LOG_STORAGE_FAILED",
  });
  await backend.handle({ operation: "append", records: [] }, content);
  expect(await backend.handle({ operation: "status" }, page)).toMatchObject({
    storageError: null,
  });
});

test("detail control is restricted to extension pages and append strips bodies while disabled", async () => {
  expect(
    await backend.handle({ operation: "setDetail", enabled: true }, content)
  ).toMatchObject({ ok: false, error: "LOG_ACCESS_DENIED" });
  const records = [
    {
      event: "http.success",
      request: { url: "https://example.com/api", preview: { text: "PRIVATE" } },
    },
  ];
  await backend.handle({ operation: "append", records }, page);
  expect(store.append.mock.calls[0][0][0].request.preview).toBeUndefined();
  expect(
    await backend.handle({ operation: "setDetail", enabled: true }, page)
  ).toMatchObject({ ok: true, detail: { enabled: true } });
  await backend.handle({ operation: "append", records }, page);
  expect(store.append.mock.calls[1][0][0].request.preview.text).toBe("PRIVATE");
  await backend.handle({ operation: "setDetail", enabled: false }, page);
  await backend.handle({ operation: "append", records }, page);
  expect(store.append.mock.calls[2][0][0].request.preview).toBeUndefined();
});
