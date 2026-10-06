/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Header from "./Header";
import { REVIEW_URL, SUPPORT_URL } from "./supportLinks";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));

jest.mock("../../components/Logo", () => () => null);

describe("Popup Header support menu", () => {
  let container;
  let root;
  let originalWindowOpen;

  beforeEach(() => {
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

  test("keeps exactly three header actions without global feature controls", () => {
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
    ).toHaveLength(3);
    expect(container.querySelector(".kt-popup-header__global")).toBeNull();
    expect(container.querySelector(".kt-popup-header__badge")).toBeNull();
    expect(document.querySelector("#kt-popup-global-menu")).toBeNull();
    expect(
      container.querySelector('[aria-label="popup_global_features"]')
    ).toBeNull();
  });
});
