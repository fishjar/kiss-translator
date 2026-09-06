/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Action from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockWindowSize = { w: 240, h: 300 };

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../Popup/PopupTheme", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => mockWindowSize,
}));
jest.mock("../../libs/client", () => ({ isExt: false }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../Popup/Header", () => {
  const React = require("react");
  return function Header() {
    return React.createElement("div", null, "header");
  };
});
jest.mock("../Popup/PopupCont", () => {
  const React = require("react");
  return function PopupCont() {
    return React.createElement("div", { "data-testid": "popup-content" });
  };
});
jest.mock("./Draggable", () => {
  const React = require("react");
  return function Draggable({ width, handler, children }) {
    return React.createElement(
      "div",
      { "data-testid": "draggable", "data-width": width },
      handler,
      children
    );
  };
});
jest.mock("@mui/material/Box", () => {
  const React = require("react");
  return function Box({ width, children, style, ...props }) {
    return React.createElement(
      "div",
      {
        ...props,
        style,
        "data-box-width": width,
        "data-box-max-height": style?.maxHeight,
        "data-box-overflow-y": style?.overflowY,
      },
      children
    );
  };
});
jest.mock("@mui/material/Divider", () => {
  const React = require("react");
  return function Divider() {
    return React.createElement("hr");
  };
});

describe("content action Popup integration", () => {
  beforeEach(() => {
    mockWindowSize = { w: 240, h: 300 };
  });

  test("passes the narrow viewport width to the draggable panel", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const previousFocus = document.createElement("button");
    document.body.appendChild(previousFocus);
    previousFocus.focus();
    const root = createRoot(container);

    act(() => {
      root.render(
        <Action
          translator={{ rule: {}, setting: {} }}
          processActions={jest.fn()}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="draggable"]').dataset.width
    ).toBe("240");
    expect(
      container.querySelector('[data-testid="popup-content"]').parentElement
        .dataset.boxMaxHeight
    ).toBe("243");
    expect(
      container.querySelector('[data-testid="popup-content"]').parentElement
        .dataset.boxOverflowY
    ).toBe("auto");
    expect(
      container
        .querySelector('[data-testid="popup-content"]')
        .parentElement.classList.contains("kt-popup-shell--content")
    ).toBe(true);
    expect(container.querySelector("style").textContent).toContain(
      ".kt-popup-shell"
    );
    const panel = container.querySelector('[role="dialog"]');
    expect(panel.getAttribute("aria-label")).toBe(
      process.env.REACT_APP_NAME || "KISS Translator"
    );
    expect(panel.tabIndex).toBe(-1);

    await act(async () => {
      panel.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(previousFocus);

    act(() => root.unmount());
    container.remove();
    previousFocus.remove();
  });

  test("caps the draggable panel at 360 pixels on wide viewports", () => {
    mockWindowSize = { w: 800, h: 600 };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Action
          translator={{ rule: {}, setting: {} }}
          processActions={jest.fn()}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="draggable"]').dataset.width
    ).toBe("360");

    act(() => root.unmount());
    container.remove();
  });
});
