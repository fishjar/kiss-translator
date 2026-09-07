/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Action from "./index";
import { EVENT_KISS_INNER, MSG_POPUP_TOGGLE } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockWindowSize = { w: 240, h: 300 };

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../Popup/PopupTheme", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }) =>
      React.createElement("div", { className: "kt-m3-root" }, children),
  };
});
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => mockWindowSize,
}));
jest.mock("../../libs/client", () => ({ isExt: false }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../Popup/Header", () => {
  const React = require("react");
  return function Header({ onClose }) {
    return React.createElement("button", { onClick: onClose }, "Close");
  };
});
jest.mock("../Popup/PopupCont", () => {
  const React = require("react");
  return function PopupCont() {
    return React.createElement(
      "div",
      { "data-testid": "popup-content" },
      React.createElement("input", { "aria-label": "Panel input" })
    );
  };
});
jest.mock("./Draggable", () => {
  const React = require("react");
  return function Draggable({ width, handler, children }) {
    return React.createElement(
      "div",
      {
        "data-testid": "draggable",
        "data-width": width,
        onClick: (event) => event.stopPropagation(),
      },
      handler,
      children
    );
  };
});
jest.mock("@mui/material/Box", () => {
  const React = require("react");
  return React.forwardRef(function Box(
    { width, children, style, ...props },
    ref
  ) {
    return React.createElement(
      "div",
      {
        ...props,
        ref,
        style,
        "data-box-width": width,
        "data-box-max-height": style?.maxHeight,
        "data-box-overflow-y": style?.overflowY,
      },
      children
    );
  });
});
jest.mock("@mui/material/Divider", () => {
  const React = require("react");
  return function Divider() {
    return React.createElement("hr");
  };
});

describe("content action Popup integration", () => {
  let fixture;
  let container;
  let previousFocus;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    mockWindowSize = { w: 240, h: 300 };
    fixture = document.createElement("div");
    document.body.appendChild(fixture);
    container = document.createElement("div");
    previousFocus = document.createElement("button");
    fixture.append(previousFocus, container);
    previousFocus.focus();
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    fixture.remove();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const renderAction = () => {
    act(() => {
      root.render(
        <Action
          translator={{ rule: {}, setting: {} }}
          processActions={jest.fn()}
        />
      );
    });
    return container.querySelector('[role="dialog"]');
  };

  const focusPanel = () => {
    act(() => jest.advanceTimersByTime(20));
  };

  const pressEscape = (target) => {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        })
      );
    });
  };

  const createNestedShadowRoot = () => {
    const host = document.createElement("div");
    fixture.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const nestedHost = document.createElement("div");
    shadowRoot.appendChild(nestedHost);
    return nestedHost.attachShadow({ mode: "open" });
  };

  test("passes the narrow viewport width to the draggable panel", () => {
    const panel = renderAction();

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
    expect(panel.getAttribute("aria-label")).toBe(
      process.env.REACT_APP_NAME || "KISS Translator"
    );
    expect(panel.tabIndex).toBe(-1);
  });

  test("caps the draggable panel at 360 pixels on wide viewports", () => {
    mockWindowSize = { w: 800, h: 600 };
    renderAction();

    expect(
      container.querySelector('[data-testid="draggable"]').dataset.width
    ).toBe("360");
  });

  test("focuses the panel and restores the opener after Escape", () => {
    const panel = renderAction();
    expect(document.activeElement).toBe(previousFocus);

    focusPanel();
    expect(document.activeElement).toBe(panel);
    const input = panel.querySelector("input");
    input.focus();
    expect(document.activeElement).toBe(input);

    pressEscape(input);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(previousFocus);
  });

  test("preserves focus on an outside input clicked to dismiss the panel", () => {
    const panel = renderAction();
    focusPanel();
    expect(document.activeElement).toBe(panel);
    const outsideInput = document.createElement("input");
    fixture.appendChild(outsideInput);

    act(() => {
      outsideInput.focus();
      outsideInput.click();
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outsideInput);
  });

  test.each(["document", "shadow"])(
    "keeps a menu-opening click inside the panel in %s",
    (scope) => {
      if (scope === "shadow") {
        createNestedShadowRoot().appendChild(container);
      }
      const panel = renderAction();
      const popupRoot = panel.closest(".kt-m3-root");
      const backdrop = document.createElement("div");
      popupRoot.appendChild(backdrop);
      const hostClick = jest.fn();
      window.addEventListener("click", hostClick);

      const dispatchMouse = (target, type) => {
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      };

      try {
        act(() => {
          // Match the browser trace: opening a portal changes the mouseup
          // target, so click is dispatched on the shared theme root.
          dispatchMouse(panel.querySelector("input"), "mousedown");
          dispatchMouse(backdrop, "mouseup");
          dispatchMouse(popupRoot, "click");
        });

        expect(container.querySelector('[role="dialog"]')).toBe(panel);
        expect(hostClick).toHaveBeenCalledTimes(1);

        act(() => dispatchMouse(backdrop, "click"));

        expect(container.querySelector('[role="dialog"]')).toBe(panel);
        expect(hostClick).toHaveBeenCalledTimes(2);
      } finally {
        window.removeEventListener("click", hostClick);
        backdrop.remove();
      }
    }
  );

  test("restores focus when the focused header close button dismisses the panel", () => {
    renderAction();
    focusPanel();
    const closeButton = container.querySelector("button");
    closeButton.focus();
    expect(document.activeElement).toBe(closeButton);

    act(() => closeButton.click());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(previousFocus);
  });

  test("restores nested shadow focus when a focused panel is toggled closed", () => {
    const shadowRoot = createNestedShadowRoot();
    shadowRoot.append(previousFocus, container);
    previousFocus.focus();
    const panel = renderAction();
    focusPanel();
    expect(shadowRoot.activeElement).toBe(panel);

    act(() => {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: { action: MSG_POPUP_TOGGLE },
        })
      );
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(shadowRoot.activeElement).toBe(previousFocus);
  });

  test("preserves outside input focus within the same nested shadow root", () => {
    const shadowRoot = createNestedShadowRoot();
    shadowRoot.append(previousFocus, container);
    previousFocus.focus();
    const panel = renderAction();
    focusPanel();
    expect(shadowRoot.activeElement).toBe(panel);
    const outsideInput = document.createElement("input");
    shadowRoot.appendChild(outsideInput);

    act(() => {
      outsideInput.focus();
      outsideInput.dispatchEvent(
        new MouseEvent("click", { bubbles: true, composed: true })
      );
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(shadowRoot.activeElement).toBe(outsideInput);
  });

  test("restores focus when a focused panel is removed with its Action", () => {
    const panel = renderAction();
    focusPanel();
    expect(document.activeElement).toBe(panel);

    act(() => root.render(null));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(previousFocus);
  });

  test("does not restore focus to an opener that has been disconnected", () => {
    const panel = renderAction();
    focusPanel();
    expect(document.activeElement).toBe(panel);
    previousFocus.remove();
    const restoreFocus = jest.spyOn(previousFocus, "focus");

    pressEscape(panel);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(restoreFocus).not.toHaveBeenCalled();
  });

  test("cancels pending panel focus when dismissed before the opening frame", () => {
    const panel = renderAction();
    const focus = jest.spyOn(panel, "focus");
    const outsideInput = document.createElement("input");
    fixture.appendChild(outsideInput);

    act(() => {
      outsideInput.focus();
      outsideInput.click();
    });
    focusPanel();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outsideInput);
  });

  test("captures the current opener again when the panel reopens", () => {
    const panel = renderAction();
    focusPanel();
    expect(document.activeElement).toBe(panel);
    const outsideInput = document.createElement("input");
    fixture.appendChild(outsideInput);
    act(() => {
      outsideInput.focus();
      outsideInput.click();
    });
    expect(document.activeElement).toBe(outsideInput);

    act(() => {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: { action: MSG_POPUP_TOGGLE },
        })
      );
    });
    const reopenedPanel = container.querySelector('[role="dialog"]');
    focusPanel();
    expect(document.activeElement).toBe(reopenedPanel);

    pressEscape(reopenedPanel);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(outsideInput);
  });
});
