import { runInNewContext } from "vm";
import { webcrypto } from "crypto";
import { browser } from "./browser";
import {
  getPopupDocumentIdentity,
  isCurrentPopupDocument,
} from "./popupDocument";

jest.mock("./browser", () => ({
  browser: {
    tabs: { get: jest.fn(), executeScript: jest.fn() },
    scripting: { executeScript: jest.fn() },
  },
}));

const documentInfo = { token: "document-one", frameId: 7 };

describe("popup document identity", () => {
  beforeEach(() => {
    browser.tabs.get
      .mockReset()
      .mockResolvedValue({ id: 17, status: "loading" });
    browser.scripting.executeScript
      .mockReset()
      .mockResolvedValue([{ frameId: 7, result: { token: "document-one" } }]);
    browser.tabs.executeScript.mockReset();
  });

  test("the injected function is self-contained and creates one token per document", () => {
    const source = `const identify = ${getPopupDocumentIdentity.toString()}; [identify(), identify()]`;
    const first = runInNewContext(source, {
      crypto: webcrypto,
      location: { href: "https://example.com/same-url" },
    });
    const second = runInNewContext(source, {
      crypto: webcrypto,
      location: { href: "https://example.com/same-url" },
    });
    expect(first[0].token).toBe(first[1].token);
    expect(second[0].token).not.toBe(first[0].token);
    expect(first[0].url).toBe(second[0].url);
  });

  test("verifies an available child while the tab is loading", async () => {
    await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(true);
    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 17, frameIds: [7] },
      injectImmediately: true,
      func: getPopupDocumentIdentity,
    });
  });

  test("rejects a previous document even when its frame and URL are unchanged", async () => {
    browser.scripting.executeScript.mockResolvedValue([
      { frameId: 7, result: { token: "document-two" } },
    ]);
    await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(false);
  });

  test("does not accept the old document before a pending navigation commits", async () => {
    browser.tabs.get.mockResolvedValue({
      id: 17,
      pendingUrl: "https://example.com/new",
    });
    await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(false);
    expect(browser.scripting.executeScript).not.toHaveBeenCalled();
  });

  test("rejects inaccessible or removed frames without an unverified fallback", async () => {
    browser.scripting.executeScript.mockRejectedValue(
      new Error("Cannot access frame")
    );
    await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(false);
    expect(browser.tabs.executeScript).not.toHaveBeenCalled();
  });

  test("verifies the same token through the legacy MV2 injection API", async () => {
    const scripting = browser.scripting.executeScript;
    browser.scripting.executeScript = undefined;
    browser.tabs.executeScript.mockImplementation(async (_tabId, options) => {
      if (!options.matchAboutBlank) {
        throw new Error("Missing host permission for the blank frame");
      }
      return [{ token: "document-one" }];
    });
    try {
      await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(
        true
      );
      expect(browser.tabs.executeScript).toHaveBeenCalledWith(17, {
        frameId: 7,
        matchAboutBlank: true,
        runAt: "document_start",
        code: expect.stringContaining("__KISS_TRANSLATOR_DOCUMENT_TOKEN__"),
      });
      browser.tabs.executeScript.mockResolvedValue([{ token: "replacement" }]);
      await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(
        false
      );
      browser.tabs.executeScript.mockRejectedValue(
        new Error("Frame unavailable")
      );
      await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(
        false
      );
    } finally {
      browser.scripting.executeScript = scripting;
    }
  });

  test("does not trust a snapshot when neither injection API is available", async () => {
    const scripting = browser.scripting.executeScript;
    const legacy = browser.tabs.executeScript;
    browser.scripting.executeScript = undefined;
    browser.tabs.executeScript = undefined;
    try {
      await expect(isCurrentPopupDocument(17, documentInfo)).resolves.toBe(
        false
      );
      expect(browser.tabs.get).not.toHaveBeenCalled();
    } finally {
      browser.scripting.executeScript = scripting;
      browser.tabs.executeScript = legacy;
    }
  });

  test("requires a token and a browser-provided frame ID", async () => {
    await expect(
      isCurrentPopupDocument(17, { token: "document-one" })
    ).resolves.toBe(false);
    await expect(isCurrentPopupDocument(17, { frameId: 7 })).resolves.toBe(
      false
    );
    expect(browser.scripting.executeScript).not.toHaveBeenCalled();
  });
});
