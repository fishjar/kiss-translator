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
  openOptionsHashUrl,
} from "./optionsPage";

describe("optionsPage helpers", () => {
  beforeEach(() => {
    browser.runtime.getURL.mockReset();
    browser.runtime.openOptionsPage.mockReset();
    browser.runtime.getURL.mockReturnValue("moz-extension://abc/options.html");
    browser.tabs = { create: jest.fn() };
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

  test("openOptionsHashUrl uses tabs.create when available", async () => {
    browser.tabs.create.mockResolvedValue({ id: 1 });

    const created = await openOptionsHashUrl();

    expect(browser.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://abc/options.html#/cefr",
    });
    expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
    expect(created).toEqual({ id: 1 });
  });

  test("openOptionsHashUrl falls back to runtime.openOptionsPage", async () => {
    browser.tabs = undefined;
    browser.runtime.openOptionsPage.mockResolvedValue();

    const opened = await openOptionsHashUrl();

    expect(browser.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(opened).toBeUndefined();
  });
});
