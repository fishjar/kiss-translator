jest.mock("./storage", () => ({ getSettingWithDefault: jest.fn() }));
jest.mock("./rules", () => ({ matchRule: jest.fn() }));
jest.mock("./blacklist", () => ({ isInBlacklist: jest.fn(() => false) }));
import { createPageSessionBackend } from "./pageSessionBackground";
import { getSettingWithDefault } from "./storage";
import { matchRule } from "./rules";
import { MSG_TRANS_TOGGLE, MSG_OPEN_TRANBOX } from "../config";

function fixture() {
  const data = {};
  const browser = {
    tabs: {
      get: jest.fn(async () => ({ url: "https://main.test" })),
      sendMessage: jest.fn(async () => ({ ok: true })),
      onRemoved: { addListener: jest.fn() },
      onUpdated: { addListener: jest.fn() },
    },
    webNavigation: {
      onCommitted: { addListener: jest.fn() },
      onHistoryStateUpdated: { addListener: jest.fn() },
      onReferenceFragmentUpdated: { addListener: jest.fn() },
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
  return {
    browser,
    handle: createPageSessionBackend(browser),
    sender: (frameId, token) => ({
      tab: { id: 1 },
      frameId,
      url: "https://main.test",
      token,
    }),
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
  matchRule.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const { handle, browser, sender } = fixture();
  expect(await handle({ kind: "register", token: "child" }, sender(7))).toEqual(
    { pending: true }
  );
  await new Promise((done) => setTimeout(done, 0));
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
  const { handle, browser, sender } = fixture();
  await handle({ kind: "register", token: "top" }, sender(0));
  await handle({ kind: "query", tabId: 1 });
  await handle({ kind: "register", token: "child" }, sender(8));
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
  const { handle, browser, sender } = fixture();
  await handle({ kind: "register", token: "top" }, sender(0));
  await handle({ kind: "query", tabId: 1 });
  await handle({ kind: "command", tabId: 1, action: MSG_TRANS_TOGGLE });
  const restored = createPageSessionBackend(browser);
  expect((await restored({ kind: "query", tabId: 1 })).rule.transOpen).toBe(
    "true"
  );
  await restored({ kind: "register", token: "new-top" }, sender(0));
  await restored({ kind: "query", tabId: 1 });
  expect(
    await restored(
      { kind: "command", action: MSG_TRANS_TOGGLE, token: "top" },
      sender(0)
    )
  ).toMatchObject({ code: "STALE_DOCUMENT" });
});

test("selection is delivered only to the top document, not broadcast", async () => {
  const { handle, browser, sender } = fixture();
  await handle({ kind: "register", token: "top" }, sender(0));
  await handle({ kind: "query", tabId: 1 });
  await handle({ kind: "register", token: "child" }, sender(3));
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
  expect(browser.tabs.sendMessage).toHaveBeenCalledTimes(1);
  expect(browser.tabs.sendMessage.mock.calls[0][2]).toEqual({ frameId: 0 });
  expect(browser.tabs.sendMessage.mock.calls[0][1].args).toMatchObject({
    text: "selected",
    fromFrame: true,
  });
});

test("history navigation preserves explicit settings while committed navigation resets the session", async () => {
  const { handle, browser, sender } = fixture();
  await handle({ kind: "register", token: "top" }, sender(0));
  await handle({ kind: "query", tabId: 1 });
  const first = await handle({
    kind: "command",
    tabId: 1,
    action: MSG_TRANS_TOGGLE,
    args: { enabled: true },
  });
  browser.tabs.get.mockResolvedValue({ url: "https://main.test/route" });
  browser.webNavigation.onHistoryStateUpdated.addListener.mock.calls[0][0]({
    tabId: 1,
    frameId: 0,
  });
  const route = await handle({ kind: "query", tabId: 1 });
  expect(route.rule.transOpen).toBe("true");
  expect(route.sessionId).toBe(first.sessionId);
  browser.webNavigation.onCommitted.addListener.mock.calls[0][0]({
    tabId: 1,
    frameId: 0,
  });
  await handle(
    { kind: "register", token: "next-top" },
    { ...sender(0), url: "https://main.test/route" }
  );
  const next = await handle({ kind: "query", tabId: 1 });
  expect(next.rule.transOpen).toBe("false");
  expect(next.sessionId).not.toBe(first.sessionId);
});

test("global selection shortcut asks the selected child to capture text instead of opening an empty top panel", async () => {
  const { handle, browser, sender } = fixture();
  await handle({ kind: "register", token: "top" }, sender(0));
  await handle({ kind: "query", tabId: 1 });
  await handle({ kind: "register", token: "child" }, sender(3));
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
  expect(browser.tabs.sendMessage.mock.calls[0][2]).toEqual({ frameId: 3 });
  expect(browser.tabs.sendMessage.mock.calls[0][1].action).toBe(
    MSG_OPEN_TRANBOX
  );
});
