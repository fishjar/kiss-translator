/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Action from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../Popup/PopupTheme", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => ({ w: 240, h: 300 }),
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
  test("injects Popup styles and constrains its inner width", () => {
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
    ).toBe("240");
    expect(
      container.querySelector('[data-testid="popup-content"]').parentElement
        .dataset.boxWidth
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

    act(() => root.unmount());
    container.remove();
  });
});
