/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Popup from ".";
import { getCurTab, sendBgMsg } from "../../libs/msg";
import { MSG_OPEN_OPTIONS } from "../../config";
import { kissLog } from "../../libs/log";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSendTabMsg = jest.fn();
let mockPopupContentAutofocus = false;
let mockSetting;

jest.mock("./loadData", () => ({
  loadPopupData: () => mockSendTabMsg(),
}));

jest.mock("../../libs/msg", () => ({
  getCurTab: jest.fn(async () => ({
    id: 1,
    windowId: 1,
    url: "https://example.com",
  })),
  sendBgMsg: jest.fn(),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
}));

jest.mock("../../libs/browser", () => ({
  browser: { runtime: { openOptionsPage: jest.fn() } },
}));

jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: mockSetting }),
}));

jest.mock("./Header", () => {
  const React = require("react");
  return ({ openSettings }) =>
    React.createElement(
      "div",
      null,
      "header",
      React.createElement(
        "button",
        { type: "button", onClick: openSettings },
        "open-settings"
      )
    );
});

jest.mock("./PopupCont", () => {
  const React = require("react");
  return () =>
    mockPopupContentAutofocus
      ? React.createElement("select", { autoFocus: true }, null)
      : React.createElement("div", null, "content");
});

jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return ({ autoFocusInput }) =>
    React.createElement(
      "div",
      null,
      "translation",
      React.createElement("input", {
        "aria-label": "translation-input",
        autoFocus: autoFocusInput,
      })
    );
});

describe("Popup focus", () => {
  beforeEach(() => {
    getCurTab.mockResolvedValue({
      id: 1,
      windowId: 1,
      url: "https://example.com",
    });
    mockPopupContentAutofocus = false;
    mockSetting = { tranboxSetting: {} };
    mockSendTabMsg.mockResolvedValue(undefined);
    sendBgMsg.mockReset();
    kissLog.mockClear();
    window.history.replaceState({}, "", "/popup.html");
  });

  afterEach(() => jest.restoreAllMocks());

  test("closes only after the background confirms that settings opened", async () => {
    let confirmOpened;
    sendBgMsg.mockReturnValue(
      new Promise((resolve) => {
        confirmOpened = resolve;
      })
    );
    const closePopup = jest.spyOn(window, "close").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });
    act(() => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "open-settings")
        .click();
    });

    expect(sendBgMsg).toHaveBeenCalledWith(MSG_OPEN_OPTIONS);
    expect(closePopup).not.toHaveBeenCalled();

    await act(async () => {
      confirmOpened(true);
      await Promise.resolve();
    });
    expect(closePopup).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  test.each([false, undefined])(
    "keeps the popup open when the background does not confirm success: %s",
    async (result) => {
      sendBgMsg.mockResolvedValue(result);
      const closePopup = jest
        .spyOn(window, "close")
        .mockImplementation(() => {});
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      await act(async () => {
        root.render(<Popup />);
        await Promise.resolve();
      });
      await act(async () => {
        Array.from(container.querySelectorAll("button"))
          .find((button) => button.textContent === "open-settings")
          .click();
        await Promise.resolve();
      });

      expect(closePopup).not.toHaveBeenCalled();
      act(() => root.unmount());
      container.remove();
    }
  );

  test("handles a rejected settings message without closing the popup", async () => {
    const error = new Error("Background is unavailable");
    sendBgMsg.mockRejectedValue(error);
    const closePopup = jest.spyOn(window, "close").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "open-settings")
        .click();
      await Promise.resolve();
    });

    expect(closePopup).not.toHaveBeenCalled();
    expect(kissLog).toHaveBeenCalledWith("open options page from popup", error);
    act(() => root.unmount());
    container.remove();
  });

  test("keeps input autofocus when the configured default is the text tab", async () => {
    mockSetting = {
      tranboxSetting: {},
      autoTranslateClipboard: false,
      popupDefaultView: "text",
    };
    mockSendTabMsg.mockReturnValue(new Promise(() => {}));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });

    expect(
      container.querySelector('[role="tab"][aria-selected="true"]').textContent
    ).toBe("popup_text_translation");
    expect(document.activeElement).toBe(
      container.querySelector('[aria-label="translation-input"]')
    );

    act(() => root.unmount());
    container.remove();
  });

  test("announces configuration loading without calling it translation", async () => {
    mockSendTabMsg.mockReturnValue(new Promise(() => {}));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('.kt-popup-loading[role="status"]')
        .getAttribute("aria-label")
    ).toBe("popup_loading");

    act(() => root.unmount());
    container.remove();
  });

  test("announces translation settings loading as loading", async () => {
    mockSetting = null;
    mockSendTabMsg.mockResolvedValue({
      rule: { pattern: "*", transOpen: "true" },
      setting: { darkMode: "auto" },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const textTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === "popup_text_translation"
    );
    await act(async () => {
      textTab.click();
      await Promise.resolve();
    });

    expect(
      container
        .querySelector('.kt-popup-loading[role="status"]')
        .getAttribute("aria-label")
    ).toBe("popup_loading");

    act(() => root.unmount());
    container.remove();
  });

  test("focuses the popup shell instead of the first form control", async () => {
    const previousControl = document.createElement("select");
    document.body.appendChild(previousControl);
    previousControl.focus();

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    const shell = container.querySelector(".kt-popup-shell");
    expect(shell.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(shell);

    act(() => root.unmount());
    container.remove();
    previousControl.remove();
  });

  test("restores shell focus after asynchronously loaded controls mount", async () => {
    mockPopupContentAutofocus = true;
    mockSendTabMsg.mockResolvedValue({
      rule: { transOpen: "false" },
      setting: { darkMode: "auto" },
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    const shell = container.querySelector(".kt-popup-shell");
    const select = container.querySelector("select");
    const selectedTab = container.querySelector(
      '[role="tab"][aria-selected="true"]'
    );
    const panel = container.querySelector('[role="tabpanel"]');
    expect(select).not.toBeNull();
    expect(document.activeElement).toBe(shell);
    expect(selectedTab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(selectedTab.id);

    await act(async () => {
      select.focus();
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(shell);

    await act(async () => {
      select.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      select.focus();
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    });
    expect(document.activeElement).toBe(select);

    act(() => root.unmount());
    container.remove();
  });

  test("does not steal focus after the user switches tabs during loading", async () => {
    let resolvePopupData;
    mockSendTabMsg.mockReturnValue(
      new Promise((resolve) => {
        resolvePopupData = resolve;
      })
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });

    const textTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === "popup_text_translation"
    );
    await act(async () => {
      textTab.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      textTab.click();
      await Promise.resolve();
    });

    const translationInput = container.querySelector(
      '[aria-label="translation-input"]'
    );
    act(() => {
      translationInput.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true })
      );
      translationInput.focus();
    });

    await act(async () => {
      resolvePopupData({
        rule: { transOpen: "false" },
        setting: { darkMode: "auto" },
      });
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    expect(document.activeElement).toBe(translationInput);

    act(() => root.unmount());
    container.remove();
  });

  test("renders the page panel when popup data is available", async () => {
    mockSendTabMsg.mockResolvedValue({
      rule: { pattern: "*", transOpen: "true" },
      setting: { darkMode: "auto" },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("content");
    expect(container.textContent).not.toContain("popup_page_unavailable");

    act(() => root.unmount());
    container.remove();
  });
});
