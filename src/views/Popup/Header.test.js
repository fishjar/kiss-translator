/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Header from "./Header";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";
import { useI18n } from "../../hooks/I18n";
import { newI18n } from "../../config/i18n";
import { openFileTranslatePage } from "../../libs/navigation";
import { sendTabMsg } from "../../libs/msg";
import { checkScreenshotSupport } from "../../libs/imageTranslate/screenshotSupport";
import { MSG_IMAGE_SCREENSHOT } from "../../config/msg";

jest.mock("../../libs/navigation", () => ({
  openFileTranslatePage: jest.fn(),
}));
jest.mock("../../libs/client", () => ({ isExt: true }));

jest.mock("../../libs/imageTranslate/screenshotSupport", () => ({
  checkScreenshotSupport: jest.fn(async () => true),
}));
jest.mock("../../libs/msg", () => ({ sendTabMsg: jest.fn(async () => {}) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: jest.fn(() => (key) => key),
}));

jest.mock("../../components/Logo", () => () => null);

describe("Popup Header support menu", () => {
  let container;
  let root;
  let originalWindowOpen;

  beforeEach(() => {
    checkScreenshotSupport.mockResolvedValue(true);
    sendTabMsg.mockResolvedValue(undefined);
    useI18n.mockImplementation(() => (key) => key);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalWindowOpen = window.open;
    window.open = jest.fn();
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    window.open = originalWindowOpen;
  });

  test("places support, settings and close in the content header", () => {
    const openSettings = jest.fn();
    const onClose = jest.fn();
    act(() =>
      root.render(<Header onClose={onClose} openSettings={openSettings} />)
    );
    const buttons = container.querySelectorAll(
      ".kt-popup-header__actions button"
    );
    expect(
      Array.from(buttons, (button) => button.getAttribute("aria-label"))
    ).toEqual([
      "popup_support",
      "file_translate_title",
      "image_screenshot_translate",
      "setting",
      "close",
    ]);
    act(() => buttons[3].click());
    expect(openSettings).toHaveBeenCalledTimes(1);
    act(() => buttons[4].click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("keeps the content support menu inside its shadow theme root", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const themeRoot = document.createElement("div");
    themeRoot.className = "kt-m3-root";
    shadow.appendChild(themeRoot);
    act(() => root.unmount());
    root = createRoot(themeRoot);
    act(() =>
      root.render(<Header onClose={jest.fn()} openSettings={jest.fn()} />)
    );
    const sponsor = themeRoot.querySelector('[aria-label="popup_support"]');
    act(() => sponsor.click());
    const items = shadow.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(document.body.querySelector('[role="menuitem"]')).toBeNull();
    act(() => items[0].click());
    expect(window.open).toHaveBeenCalledWith(
      REVIEW_URL,
      "_blank",
      "noopener,noreferrer"
    );
    expect(shadow.querySelector('[role="menuitem"]')).toBeNull();
    expect(shadow.activeElement).toBe(sponsor);
  });

  test("unsupported screenshot leaves popup open", async () => {
    const {
      checkScreenshotSupport,
    } = require("../../libs/imageTranslate/screenshotSupport");
    const { sendTabMsg } = require("../../libs/msg");
    checkScreenshotSupport.mockResolvedValueOnce(false);
    const close = jest.spyOn(window, "close").mockImplementation(() => {});
    sendTabMsg.mockClear();
    act(() => root.render(<Header />));
    await act(async () =>
      container
        .querySelector('[aria-label="image_screenshot_translate"]')
        .click()
    );
    expect(sendTabMsg).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  test("localizes the screenshot button tooltip and accessible name in English", () => {
    useI18n.mockReturnValue(newI18n("en"));
    act(() => root.render(<Header />));
    const button = container.querySelector(
      '[aria-label="Screenshot Translate"]'
    );
    expect(button).not.toBeNull();
    expect(button.title).toBe("Screenshot Translate");
  });

  test.each([false, true])(
    "opens file translation from either header (content: %s)",
    async (isContent) => {
      openFileTranslatePage.mockClear();
      act(() =>
        root.render(<Header onClose={isContent ? jest.fn() : undefined} />)
      );
      await act(async () =>
        container.querySelector('[aria-label="file_translate_title"]').click()
      );
      expect(openFileTranslatePage).toHaveBeenCalledTimes(1);
    }
  );

  test("closes the content panel before dispatching screenshot translation locally", async () => {
    const onClose = jest.fn();
    const processActions = jest.fn(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    const close = jest.spyOn(window, "close").mockImplementation(() => {});
    sendTabMsg.mockClear();
    act(() =>
      root.render(<Header onClose={onClose} processActions={processActions} />)
    );
    await act(async () =>
      container
        .querySelector('[aria-label="image_screenshot_translate"]')
        .click()
    );
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_IMAGE_SCREENSHOT,
    });
    expect(sendTabMsg).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    close.mockRestore();
  });

  test("keeps the content panel open when screenshot translation is unsupported", async () => {
    const onClose = jest.fn();
    const processActions = jest.fn();
    checkScreenshotSupport.mockResolvedValueOnce(false);
    act(() =>
      root.render(<Header onClose={onClose} processActions={processActions} />)
    );
    await act(async () =>
      container
        .querySelector('[aria-label="image_screenshot_translate"]')
        .click()
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(processActions).not.toHaveBeenCalled();
  });

  test("dispatches popup screenshot translation to the tab and closes the popup", async () => {
    sendTabMsg.mockClear();
    const close = jest.spyOn(window, "close").mockImplementation(() => {});
    act(() => root.render(<Header />));
    await act(async () =>
      container
        .querySelector('[aria-label="image_screenshot_translate"]')
        .click()
    );
    expect(sendTabMsg).toHaveBeenCalledWith(MSG_IMAGE_SCREENSHOT);
    expect(close).toHaveBeenCalledTimes(1);
    close.mockRestore();
  });

  test("places Sponsor before the window and settings actions", () => {
    act(() => {
      root.render(
        <Header openSeparateWindow={jest.fn()} openSettings={jest.fn()} />
      );
    });

    const sponsor = container.querySelector('[aria-label="popup_support"]');
    const separate = container.querySelector(
      '[aria-label="open_separate_window"]'
    );
    const settings = container.querySelector('[aria-label="setting"]');

    expect(sponsor.compareDocumentPosition(separate)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(separate.compareDocumentPosition(settings)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  test("keeps review and sponsorship actions in an anchored menu", () => {
    act(() => {
      root.render(
        <Header openSeparateWindow={jest.fn()} openSettings={jest.fn()} />
      );
    });

    const sponsor = container.querySelector('[aria-label="popup_support"]');
    act(() => sponsor.click());

    const menuItems = document.body.querySelectorAll('[role="menuitem"]');
    expect(menuItems).toHaveLength(2);
    expect(menuItems[0].textContent).toContain("comment_support");
    expect(menuItems[1].textContent).toContain("appreciate_support");

    act(() => menuItems[1].click());
    expect(window.open).toHaveBeenCalledWith(
      SUPPORT_URL,
      "_blank",
      "noopener,noreferrer"
    );
  });

  test("opens the upstream store review page", () => {
    act(() => {
      root.render(
        <Header openSeparateWindow={jest.fn()} openSettings={jest.fn()} />
      );
    });

    expect(container.querySelector(".kt-popup-brand-button").title).toBe(
      `${process.env.REACT_APP_NAME || "KISS Translator"} v${process.env.REACT_APP_VERSION}`
    );
    act(() => container.querySelector('[aria-label="popup_support"]').click());
    act(() => document.body.querySelector('[role="menuitem"]').click());

    expect(window.open).toHaveBeenCalledWith(
      REVIEW_URL,
      "_blank",
      "noopener,noreferrer"
    );
  });

  test("opens homepage when brand logo is clicked", () => {
    act(() => {
      root.render(<Header />);
    });

    const brandBtn = container.querySelector(".kt-popup-brand-button");
    expect(brandBtn).not.toBeNull();
    act(() => brandBtn.click());

    expect(window.open).toHaveBeenCalledWith(
      process.env.REACT_APP_SITEURL,
      "_blank",
      "noopener,noreferrer"
    );
  });

  test("collapses to a close button when hosted in the page", () => {
    const onClose = jest.fn();
    act(() => root.render(<Header onClose={onClose} />));

    const close = container.querySelector('[aria-label="close"]');
    expect(close).not.toBeNull();
    expect(
      container.querySelector('[aria-label="open_separate_window"]')
    ).toBeNull();

    act(() => close.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("embeds the existing tab controls beside the logo", () => {
    act(() => {
      root.render(
        <Header>
          <div role="tablist">
            <button role="tab">Page translation</button>
            <button role="tab">Text translation</button>
          </div>
        </Header>
      );
    });

    expect(
      container.querySelector(".kt-popup-header [role='tablist']")
    ).not.toBeNull();
    expect(container.querySelector(".kt-popup-header__identity")).toBeNull();
  });

  test("keeps feature controls outside the header actions", () => {
    act(() => {
      root.render(
        <Header
          setting={{
            tranboxSetting: { transOpen: true },
            mouseHoverSetting: { useMouseHover: true },
            inputRule: { transOpen: false },
          }}
          capabilities={{
            selectionTranslation: true,
            hoverTranslation: true,
            inputTranslation: true,
          }}
        />
      );
    });

    expect(
      container.querySelectorAll(".kt-popup-header__actions button")
    ).toHaveLength(5);
    expect(
      container.querySelector('[aria-label="image_screenshot_translate"]')
    ).not.toBeNull();
    expect(container.querySelector(".kt-popup-header__global")).toBeNull();
    expect(container.querySelector(".kt-popup-header__badge")).toBeNull();
    expect(document.querySelector("#kt-popup-global-menu")).toBeNull();
    expect(
      container.querySelector('[aria-label="popup_global_features"]')
    ).toBeNull();
  });
});
