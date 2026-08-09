/* eslint-disable testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Header from "./Header";

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
      process.env.REACT_APP_SUPPORT_URL,
      "_blank",
      "noopener,noreferrer"
    );
  });
});
