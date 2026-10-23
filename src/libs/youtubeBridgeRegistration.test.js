import browser from "webextension-polyfill";
import fs from "fs";
import path from "path";
import vm from "vm";
import { ensureYoutubeBridgeRegistered } from "./youtubeBridgeRegistration";
import { logger } from "./log";

jest.mock("webextension-polyfill", () => ({ scripting: {} }));
jest.mock("./log", () => ({ logger: { warn: jest.fn() } }));

const id = "kiss-youtube-subtitle-bridge";
const definition = {
  id,
  matches: ["https://www.youtube.com/*"],
  js: ["injector-subtitle.js"],
  runAt: "document_start",
  allFrames: false,
  persistAcrossSessions: true,
  world: "MAIN",
};
const originalClient = process.env.REACT_APP_CLIENT;

beforeEach(() => {
  process.env.REACT_APP_CLIENT = "chrome";
  jest.clearAllMocks();
  browser.scripting = {
    getRegisteredContentScripts: jest.fn(async () => []),
    registerContentScripts: jest.fn(async () => {}),
    updateContentScripts: jest.fn(async () => {}),
    unregisterContentScripts: jest.fn(),
  };
});
afterAll(() => {
  if (originalClient === undefined) delete process.env.REACT_APP_CLIENT;
  else process.env.REACT_APP_CLIENT = originalClient;
});

test.each(["chrome", "edge"])(
  "%s registers only the top www.youtube.com frame at document_start",
  async (client) => {
    process.env.REACT_APP_CLIENT = client;
    await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(true);
    expect(browser.scripting.getRegisteredContentScripts).toHaveBeenCalledWith({
      ids: [id],
    });
    expect(browser.scripting.registerContentScripts).toHaveBeenCalledWith([
      definition,
    ]);
  }
);

test("Firefox MV2 registers the isolated bootstrap instead of a MAIN world script", async () => {
  process.env.REACT_APP_CLIENT = "firefox";
  await ensureYoutubeBridgeRegistered();
  const actual = browser.scripting.registerContentScripts.mock.calls[0][0][0];
  expect(actual).toEqual({
    ...definition,
    js: ["subtitle-bootstrap.js"],
    world: undefined,
  });
  expect(actual).not.toHaveProperty("world");
});

test.each(["userscript", "web", "thunderbird"])(
  "%s does not register a browser script",
  async (client) => {
    process.env.REACT_APP_CLIENT = client;
    await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(false);
    expect(
      browser.scripting.getRegisteredContentScripts
    ).not.toHaveBeenCalled();
  }
);

test("concurrent startup and installation calls share one pending registration", async () => {
  let finish;
  browser.scripting.registerContentScripts.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const first = ensureYoutubeBridgeRegistered();
  const second = ensureYoutubeBridgeRegistered();
  expect(second).toBe(first);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  expect(browser.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
  finish();
  await expect(first).resolves.toBe(true);
});

test("repeated startup leaves the correct registration and other IDs untouched", async () => {
  browser.scripting.getRegisteredContentScripts.mockResolvedValue([
    { id: "another-feature", matches: ["<all_urls>"] },
    definition,
  ]);
  await ensureYoutubeBridgeRegistered();
  await ensureYoutubeBridgeRegistered();
  expect(browser.scripting.registerContentScripts).not.toHaveBeenCalled();
  expect(browser.scripting.updateContentScripts).not.toHaveBeenCalled();
  expect(browser.scripting.unregisterContentScripts).not.toHaveBeenCalled();
});

test("updates its own changed definition without unregistering unrelated scripts", async () => {
  browser.scripting.getRegisteredContentScripts.mockResolvedValue([
    {
      ...definition,
      matches: ["https://*.youtube.com/*"],
      runAt: "document_idle",
    },
  ]);
  await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(true);
  expect(browser.scripting.updateContentScripts).toHaveBeenCalledWith([
    expect.objectContaining(definition),
  ]);
  expect(browser.scripting.unregisterContentScripts).not.toHaveBeenCalled();
});

test("re-registers if a later update cleared the persisted script", async () => {
  browser.scripting.getRegisteredContentScripts.mockResolvedValueOnce([
    definition,
  ]);
  await ensureYoutubeBridgeRegistered();
  await ensureYoutubeBridgeRegistered();
  expect(browser.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
});

test("missing APIs keep the foreground fallback available without rejecting", async () => {
  browser.scripting = undefined;
  await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(false);
  expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
    phase: "capability",
    code: "UNSUPPORTED",
  });
});

test("a missing update API keeps the previous registration instead of deleting it", async () => {
  browser.scripting.getRegisteredContentScripts.mockResolvedValue([
    { ...definition, runAt: "document_idle" },
  ]);
  delete browser.scripting.updateContentScripts;
  await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(false);
  expect(browser.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  expect(browser.scripting.registerContentScripts).not.toHaveBeenCalled();
});

test("background module load starts registration before other service initialization", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../background.js"),
    "utf8"
  );
  const calls = [];
  const context = vm.createContext({
    browser,
    ensureYoutubeBridgeRegistered: () => calls.push("registration"),
    installStorageCoordinator: () => calls.push("storage"),
    installAsrCacheBackend: () => calls.push("asr-cache"),
    installFileTranslationBackend: () => calls.push("files"),
    restoreFileTranslationBridges: () => calls.push("restore"),
  });
  vm.runInContext(
    source.slice(
      source.indexOf("globalThis.__KISS_CONTEXT__"),
      source.indexOf("let openingOptionsPage")
    ),
    context
  );
  expect(calls).toEqual([
    "registration",
    "storage",
    "asr-cache",
    "files",
    "restore",
  ]);
});

test.each([
  "getRegisteredContentScripts",
  "registerContentScripts",
  "updateContentScripts",
])(
  "%s failure is bounded, sanitized, and permits a later retry",
  async (method) => {
    if (method === "updateContentScripts")
      browser.scripting.getRegisteredContentScripts.mockResolvedValue([
        { ...definition, runAt: "document_idle" },
      ]);
    browser.scripting[method].mockRejectedValueOnce(
      new Error("secret signed URL")
    );
    await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(false);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret");
    await expect(ensureYoutubeBridgeRegistered()).resolves.toBe(true);
    expect(browser.scripting[method]).toHaveBeenCalledTimes(2);
  }
);

test("installation/update and browser startup check registration before slow initialization", async () => {
  const handlers = {};
  const source = fs.readFileSync(
    path.join(__dirname, "../background.js"),
    "utf8"
  );
  const start = source.indexOf("browser.runtime.onInstalled.addListener");
  const end = source.indexOf("const injectToCurrentTab", start);
  const ensure = jest.fn();
  const context = vm.createContext({
    browser: {
      runtime: Object.fromEntries(
        ["onInstalled", "onStartup"].map((name) => [
          name,
          {
            addListener: (handler) => {
              handlers[name] = handler;
            },
          },
        ])
      ),
    },
    ensureYoutubeBridgeRegistered: ensure,
    runDataMigration: async () => true,
    getUiLanguage: () => new Promise(() => {}),
    getSettingWithDefault: () => new Promise(() => {}),
  });
  vm.runInContext(source.slice(start, end), context);
  handlers.onInstalled({ reason: "update" });
  expect(ensure).toHaveBeenCalledTimes(1);
  handlers.onStartup();
  expect(ensure).toHaveBeenCalledTimes(2);
});
