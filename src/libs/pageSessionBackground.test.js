jest.mock("./storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("./rules", () => ({ matchRule: jest.fn() }));
jest.mock("./blacklist", () => ({ isInBlacklist: jest.fn(() => false) }));
import { createPageSessionBackend } from "./pageSessionBackground";
import { getSettingWithDefault } from "./storage";
import { matchRule } from "./rules";
import { SESSION_PROBE, SESSION_SNAPSHOT } from "./pageSession";
import { MSG_TRANS_TOGGLE, MSG_OPEN_TRANBOX } from "../config";
import { webcrypto } from "crypto";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});

function fixture() {
  const data = {};
  const documents = { 0: { token: "top", url: "https://main.test" } };
  const tab = { url: "https://main.test", status: "complete" };
  const browser = {
    tabs: {
      get: jest.fn(async () => ({ ...tab })),
      sendMessage: jest.fn(async (_id, message, { frameId }) => {
        const doc = documents[frameId];
        if (message.action === SESSION_PROBE) return doc;
        return message.expectedDocumentToken === doc?.token
          ? { ok: true }
          : { code: "STALE_DOCUMENT" };
      }),
      onRemoved: { addListener: jest.fn() },
      onUpdated: { addListener: jest.fn() },
    },
    storage: {
      session: {
        get: jest.fn(async (key) => ({ [key]: data[key] })),
        set: jest.fn(async (value) =>
          Object.assign(data, JSON.parse(JSON.stringify(value)))
        ),
        remove: jest.fn(async (key) => delete data[key]),
      },
    },
  };
  const handle = createPageSessionBackend(browser);
  const sender = (frameId) => ({ tab: { id: 1 }, frameId });
  return {
    browser,
    documents,
    tab,
    handle,
    sender,
    register(frameId, token) {
      documents[frameId] = { token, url: tab.url };
      return handle({ kind: "register", token }, sender(frameId));
    },
    update(change) {
      browser.tabs.onUpdated.addListener.mock.calls[0][0](1, change);
    },
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  getSettingWithDefault.mockResolvedValue({
    tranboxSetting: { transOpen: true },
  });
  matchRule.mockResolvedValue({ transOpen: "false", selector: "#main" });
});

test("registration returns pending without waiting for rule loading", async () => {
  let resolve;
  const loading = new Promise((started) => {
    matchRule.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
          started();
        })
    );
  });
  const { handle, browser, register } = fixture();
  expect(await register(7, "child")).toEqual({ pending: true });
  await loading;
  resolve({ transOpen: "false" });
  const state = await handle({ kind: "query", tabId: 1 });
  expect(state.url).toBe("https://main.test");
  expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ expectedDocumentToken: "child" }),
    { frameId: 7 }
  );
});

test("concurrent commands serialize and all registered frames receive the same revision", async () => {
  const { handle, browser, register } = fixture();
  await register(0, "top");
  await handle({ kind: "query", tabId: 1 });
  await register(8, "child");
  const results = await Promise.all(
    [1, 2].map(() =>
      handle({ kind: "command", tabId: 1, action: MSG_TRANS_TOGGLE })
    )
  );
  expect(results.map((state) => state.rule.transOpen)).toEqual([
    "true",
    "false",
  ]);
  const latest = browser.tabs.sendMessage.mock.calls.filter(
    (call) => call[1].args?.revision === 3
  );
  expect(latest.map((call) => call[2].frameId).sort()).toEqual([0, 8]);
});

test("restores sessions after worker restart and rejects retired document commands", async () => {
  const { handle, browser, sender, documents, register } = fixture();
  await register(0, "top");
  await handle({ kind: "query", tabId: 1 });
  await handle({ kind: "command", tabId: 1, action: MSG_TRANS_TOGGLE });
  const restored = createPageSessionBackend(browser);
  expect((await restored({ kind: "query", tabId: 1 })).rule.transOpen).toBe(
    "true"
  );
  documents[0].token = "new-top";
  expect(
    await restored(
      { kind: "command", action: MSG_TRANS_TOGGLE, token: "top" },
      sender(0)
    )
  ).toMatchObject({ code: "STALE_DOCUMENT" });
});

test("selection is delivered only to the top document, not broadcast", async () => {
  const { handle, browser, sender, register } = fixture();
  await register(0, "top");
  await handle({ kind: "query", tabId: 1 });
  await register(3, "child");
  await handle({ kind: "query", tabId: 1 });
  browser.tabs.sendMessage.mockClear();
  await handle(
    {
      kind: "command",
      token: "child",
      action: MSG_OPEN_TRANBOX,
      args: { text: "selected" },
    },
    sender(3)
  );
  const deliveries = browser.tabs.sendMessage.mock.calls.filter(
    ([, message]) => message.action !== SESSION_PROBE
  );
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0][2]).toEqual({ frameId: 0 });
  expect(deliveries[0][1].args).toMatchObject({
    text: "selected",
    fromFrame: true,
  });
});

test("SPA and hash navigation preserve overrides, while same-URL reload and BFCache restore reset the session", async () => {
  const { handle, documents, tab, update, register } = fixture();
  await register(0, "top");
  await handle({ kind: "query", tabId: 1 });
  const first = await handle({
    kind: "command",
    tabId: 1,
    action: MSG_TRANS_TOGGLE,
    args: { enabled: true },
  });
  for (const route of ["/route", "/route#anchor"]) {
    tab.url = documents[0].url = `https://main.test${route}`;
    matchRule.mockResolvedValue({ transOpen: "false", selector: route });
    update({ url: tab.url });
    const state = await handle({ kind: "query", tabId: 1 });
    expect(state.url).toBe(tab.url);
    expect(state.rule).toMatchObject({ transOpen: "true", selector: route });
    expect(state.sessionId).toBe(first.sessionId);
  }
  await register(0, "next-top");
  const next = await handle({ kind: "query", tabId: 1 });
  expect(next.rule.transOpen).toBe("false");
  expect(next.sessionId).not.toBe(first.sessionId);
  await register(0, "top");
  const restored = await handle({ kind: "query", tabId: 1 });
  expect(restored.sessionId).not.toBe(first.sessionId);
  expect(restored.rule.transOpen).toBe("false");
});

test("global selection shortcut asks the selected child to capture text instead of opening an empty top panel", async () => {
  const { handle, browser, sender, register } = fixture();
  await register(0, "top");
  await handle({ kind: "query", tabId: 1 });
  await register(3, "child");
  await handle(
    {
      kind: "command",
      action: "kiss_page_focus",
      token: "child",
      args: { selection: true, enabled: true },
    },
    sender(3)
  );
  browser.tabs.sendMessage.mockClear();
  await handle({ kind: "command", tabId: 1, action: MSG_OPEN_TRANBOX });
  expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ action: MSG_OPEN_TRANBOX }),
    { frameId: 3 }
  );
});

test("an early child gets only the new main document's session", async () => {
  const { handle, browser, documents, register, tab, update } = fixture();
  await register(0, "top");
  const old = await handle({ kind: "query", tabId: 1 });
  delete documents[0];
  browser.tabs.sendMessage.mockClear();
  await register(3, "new-child");
  await register(4, "removed-child");
  delete documents[4];
  update({ status: "complete" });
  expect(await handle({ kind: "query", tabId: 1 })).toEqual({ pending: true });
  const snapshots = () =>
    browser.tabs.sendMessage.mock.calls.filter(
      ([, message]) => message.action === SESSION_SNAPSHOT
    );
  expect(snapshots()).toHaveLength(0);
  tab.url = "https://main.test/new";
  await register(0, "new-top");
  const next = await handle({ kind: "query", tabId: 1 });
  expect(next.sessionId).not.toBe(old.sessionId);
  expect(next.url).toBe(tab.url);
  expect(
    snapshots().map(([, message, target]) => [
      target.frameId,
      message.expectedDocumentToken,
      message.args.sessionId,
    ])
  ).toEqual([
    [0, "new-top", next.sessionId],
    [3, "new-child", next.sessionId],
  ]);
});

test("discard rules resolved after navigation and wait for the current document", async () => {
  const { handle, browser, documents, register, tab } = fixture();
  let finish;
  const loading = new Promise((started) => {
    matchRule.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started();
        })
    );
  });
  await register(0, "top");
  await loading;
  tab.url = "https://main.test/new";
  expect(documents[0].url).not.toBe(tab.url);
  finish({ selector: "#retired" });
  expect(await handle({ kind: "query", tabId: 1 })).toEqual({ pending: true });
  expect(
    browser.tabs.sendMessage.mock.calls.some(
      ([, message]) => message.action === SESSION_SNAPSHOT
    )
  ).toBe(false);
  await register(0, "new-top");
  expect(await handle({ kind: "query", tabId: 1 })).toMatchObject({
    url: tab.url,
    rule: { selector: "#main" },
  });
});
