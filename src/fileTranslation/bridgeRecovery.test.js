import browser from "webextension-polyfill";
import { restoreFileTranslationBridges } from "./bridgeRecovery";
import { FILE_WEB_URL } from "./protocol";
import { kissLog } from "../libs/log";

jest.mock("webextension-polyfill", () => ({
  runtime: { getManifest: jest.fn() },
  tabs: { query: jest.fn(), executeScript: jest.fn() },
  scripting: { executeScript: jest.fn() },
}));
jest.mock("../libs/log", () => ({ kissLog: jest.fn() }));

const previousClient = process.env.REACT_APP_CLIENT;
beforeEach(() => {
  jest.clearAllMocks();
  process.env.REACT_APP_CLIENT = "chrome";
  browser.runtime.getManifest.mockReturnValue({ manifest_version: 3 });
  browser.tabs.query.mockResolvedValue([
    { id: 1, url: FILE_WEB_URL },
    { id: 2, url: "http://127.0.0.1:3000/file-translate.html?test=1" },
    { id: 3, url: "http://localhost:3000/file-translate.html-extra" },
    { id: 4, url: "https://example.com/file-translate.html" },
    { id: 5 },
    {
      id: 6,
      url: "https://kiss-translator-dev.rayjar.com/file-translate?test=1#preview",
    },
    {
      id: 7,
      url: "https://kiss-translator-dev.rayjar.com/file-translate-extra",
    },
    {
      id: 8,
      url: "https://kiss-translator-dev.rayjar.com/file-translate/other",
    },
    { id: 9, url: "https://kiss-translator-dev.rayjar.com/file-translate/" },
  ]);
  browser.scripting.executeScript.mockResolvedValue([]);
  browser.tabs.executeScript.mockResolvedValue([]);
});
afterAll(() => {
  if (previousClient === undefined) delete process.env.REACT_APP_CLIENT;
  else process.env.REACT_APP_CLIENT = previousClient;
});

test("restores only allowed pages and only their top frame", async () => {
  await restoreFileTranslationBridges();
  expect(
    browser.scripting.executeScript.mock.calls.map(([args]) => args)
  ).toEqual([
    { target: { tabId: 1, frameIds: [0] }, files: ["file-bridge.js"] },
    { target: { tabId: 2, frameIds: [0] }, files: ["file-bridge.js"] },
    { target: { tabId: 6, frameIds: [0] }, files: ["file-bridge.js"] },
  ]);
  expect(browser.tabs.executeScript).not.toHaveBeenCalled();
});

test("uses the MV2 injection API for Firefox", async () => {
  process.env.REACT_APP_CLIENT = "firefox";
  browser.runtime.getManifest.mockReturnValue({ manifest_version: 2 });
  await restoreFileTranslationBridges();
  expect(browser.tabs.executeScript).toHaveBeenCalledWith(1, {
    file: "file-bridge.js",
    allFrames: false,
    runAt: "document_start",
  });
  expect(browser.tabs.executeScript).toHaveBeenCalledWith(6, {
    file: "file-bridge.js",
    allFrames: false,
    runAt: "document_start",
  });
  expect(browser.tabs.executeScript).toHaveBeenCalledTimes(3);
  expect(browser.scripting.executeScript).not.toHaveBeenCalled();
});

test("one closed or inaccessible tab does not prevent other recoveries", async () => {
  browser.scripting.executeScript.mockRejectedValueOnce(
    new Error("tab closed")
  );
  await restoreFileTranslationBridges();
  expect(browser.scripting.executeScript).toHaveBeenCalledTimes(3);
  expect(kissLog).toHaveBeenCalledTimes(1);
});

test("query failures are handled and unsupported builds do not inject", async () => {
  browser.tabs.query.mockRejectedValueOnce(new Error("unavailable"));
  await expect(restoreFileTranslationBridges()).resolves.toBeUndefined();
  expect(kissLog).toHaveBeenCalledTimes(1);
  process.env.REACT_APP_CLIENT = "thunderbird";
  await restoreFileTranslationBridges();
  expect(browser.tabs.query).toHaveBeenCalledTimes(1);
});
