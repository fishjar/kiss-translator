jest.mock("./browser", () => ({
  browser: {
    runtime: {
      getURL: jest.fn(),
      openOptionsPage: jest.fn(),
    },
    tabs: {
      create: jest.fn(),
    },
  },
}));

import { browser } from "./browser";
import {
  CEFR_OPTIONS_HASH,
  buildOptionsHashUrl,
  shouldOpenCEFROnInstall,
  openOptionsHash,
} from "./optionsPage";

describe("optionsPage helpers", () => {
  const originalWindowOpen = window.open;

  beforeEach(() => {
    browser.runtime.getURL.mockReset();
    browser.runtime.openOptionsPage.mockReset();
    browser.runtime.getURL.mockReturnValue("moz-extension://abc/options.html");
    browser.tabs = { create: jest.fn() };
    window.open = jest.fn();
  });

  afterAll(() => {
    window.open = originalWindowOpen;
  });

  test("buildOptionsHashUrl appends CEFR hash", () => {
    expect(CEFR_OPTIONS_HASH).toBe("#/cefr");
    expect(buildOptionsHashUrl()).toBe("moz-extension://abc/options.html#/cefr");
    expect(browser.runtime.getURL).toHaveBeenCalledWith("options.html");
  });

  test("shouldOpenCEFROnInstall is true only for first install with incomplete assessment", () => {
    expect(
      shouldOpenCEFROnInstall(
        { reason: "install" },
        { cefrSetting: { assessmentCompleted: false } }
      )
    ).toBe(true);

    expect(
      shouldOpenCEFROnInstall(
        { reason: "update" },
        { cefrSetting: { assessmentCompleted: false } }
      )
    ).toBe(false);

    expect(
      shouldOpenCEFROnInstall(
        { reason: "install" },
        { cefrSetting: { assessmentCompleted: true } }
      )
    ).toBe(false);
  });

  test("openOptionsHash uses tabs.create when available", async () => {
    browser.tabs.create.mockResolvedValue({ id: 1 });

    const created = await openOptionsHash();

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://abc/options.html#/cefr",
    });
    expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
    expect(created).toEqual({ id: 1 });
  });

  test("openOptionsHash falls back to opening the hash URL when tabs.create is unavailable", async () => {
    browser.tabs = undefined;

    const opened = await openOptionsHash();

    expect(window.open).toHaveBeenCalledWith(
      "moz-extension://abc/options.html#/cefr",
      "_blank"
    );
    expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
    expect(opened).toBeUndefined();
  });
});
