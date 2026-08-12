import { browser } from "./browser";
import {
  hasClipboardReadPermission,
  readClipboardTextIfAllowed,
  requestClipboardReadPermission,
} from "./clipboard";

jest.mock("./browser", () => ({
  browser: {
    permissions: {
      contains: jest.fn(),
      request: jest.fn(),
    },
  },
}));

describe("clipboard permissions", () => {
  beforeEach(() => {
    browser.permissions.contains.mockReset();
    browser.permissions.request.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: jest.fn() },
    });
  });

  test("checks and requests the optional clipboardRead permission", async () => {
    browser.permissions.contains.mockResolvedValue(true);
    browser.permissions.request.mockResolvedValue(true);

    await expect(hasClipboardReadPermission()).resolves.toBe(true);
    await expect(requestClipboardReadPermission()).resolves.toBe(true);
    expect(browser.permissions.contains).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    });
    expect(browser.permissions.request).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    });
  });

  test("reads text only after permission has been granted", async () => {
    browser.permissions.contains.mockResolvedValue(true);
    navigator.clipboard.readText.mockResolvedValue("clipboard text");

    await expect(readClipboardTextIfAllowed()).resolves.toBe("clipboard text");

    browser.permissions.contains.mockResolvedValue(false);
    await expect(readClipboardTextIfAllowed()).resolves.toBeNull();
    expect(navigator.clipboard.readText).toHaveBeenCalledTimes(1);
  });

  test("fails closed when permission or clipboard APIs reject", async () => {
    browser.permissions.contains.mockRejectedValue(new Error("unavailable"));
    await expect(hasClipboardReadPermission()).resolves.toBe(false);

    browser.permissions.request.mockRejectedValue(new Error("denied"));
    await expect(requestClipboardReadPermission()).resolves.toBe(false);

    browser.permissions.contains.mockResolvedValue(true);
    navigator.clipboard.readText.mockRejectedValue(new Error("blocked"));
    await expect(readClipboardTextIfAllowed()).resolves.toBeNull();
  });
});
