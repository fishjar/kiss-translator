/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import ContentFab from "./ContentFab";
import { APP_CONSTS, MSG_POPUP_TOGGLE } from "../../config";
import { FAB_CLICK_ACTION_POPUP } from "../../config/fab";
import { PopupManager } from "../../libs/popupManager";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../components/TouchTranslateControl", () => () => null);
jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/M3Theme", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }) =>
      React.createElement("div", { className: "kt-m3-root" }, children),
  };
});
jest.mock("../Popup/PopupTheme", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: ({ children }) =>
      React.createElement("div", { className: "kt-m3-root" }, children),
  };
});
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => ({ w: 800, h: 600 }),
}));
jest.mock("../../hooks/useFullscreenDetect", () => ({
  useFullscreenDetect: () => ({ isVideoFullscreen: false }),
}));
jest.mock("../../libs/client", () => ({ isExt: true }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../libs/mobile", () => ({ isMobile: false }));
jest.mock("../../libs/storage", () => ({ putFab: jest.fn() }));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  logger: { info: jest.fn(), warn: jest.fn() },
}));
jest.mock("../Popup/Header", () => {
  const React = require("react");
  return function Header({ onClose }) {
    return React.createElement(
      "button",
      { "aria-label": "Close panel", onClick: onClose },
      "Close"
    );
  };
});
jest.mock("../Popup/PopupCont", () => {
  const React = require("react");
  return function PopupCont() {
    return React.createElement("input", { "aria-label": "Panel input" });
  };
});

// Keep the actual FAB, Draggable, PopupManager, and Action event boundaries.
describe.each(["document", "shadow root"])(
  "ContentFab panel integration in %s",
  (context) => {
    let host;
    let contentRoot;
    let container;
    let root;
    let popupManager;
    let processActions;
    let outsideInput;
    let originalPointerCapture;

    beforeEach(() => {
      jest.useFakeTimers();
      originalPointerCapture = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "setPointerCapture"
      );
      Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
        configurable: true,
        value: jest.fn(),
      });
      jest
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue({
          x: 0,
          y: 100,
          left: 0,
          top: 100,
          right: 56,
          bottom: 156,
          width: 56,
          height: 56,
          toJSON: () => ({}),
        });
      host = document.createElement("div");
      document.body.appendChild(host);
      contentRoot =
        context === "shadow root" ? host.attachShadow({ mode: "open" }) : host;
      container = document.createElement("div");
      contentRoot.appendChild(container);
      outsideInput = document.createElement("input");
      document.body.appendChild(outsideInput);
      root = createRoot(container);
      processActions = jest.fn(({ action }) => {
        if (action === MSG_POPUP_TOGGLE) popupManager.toggle();
      });
      popupManager = new PopupManager({
        translator: { rule: {}, setting: {} },
        processActions,
      });

      act(() => {
        root.render(
          <ContentFab
            fabConfig={{
              fabClickAction: FAB_CLICK_ACTION_POPUP,
              x: 0,
              y: 100,
              edge: "left",
            }}
            processActions={processActions}
          />
        );
      });
    });

    afterEach(() => {
      act(() => {
        popupManager.destroy();
        root.unmount();
      });
      host.remove();
      outsideInput.remove();
      jest.clearAllTimers();
      jest.restoreAllMocks();
      if (originalPointerCapture) {
        Object.defineProperty(
          HTMLElement.prototype,
          "setPointerCapture",
          originalPointerCapture
        );
      } else {
        delete HTMLElement.prototype.setPointerCapture;
      }
      jest.useRealTimers();
    });

    const fab = () => container.querySelector(".kt-content-fab");
    const panel = () =>
      document
        .getElementById(APP_CONSTS.popupID)
        ?.shadowRoot.querySelector('[role="dialog"]') || null;
    const focusRoot = () =>
      context === "shadow root" ? contentRoot : document;
    const clickFab = () => act(() => fab().click());
    const focusPanel = () => act(() => jest.advanceTimersByTime(20));
    const pressEscape = (target) => {
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
        cancelable: true,
      });
      act(() => target.dispatchEvent(event));
      return event;
    };
    const pointer = (type, clientX, clientY) => {
      act(() =>
        fab().dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            composed: true,
            button: 0,
            clientX,
            clientY,
          })
        )
      );
    };

    test("opens the actual panel, survives the opening click, and toggles it", () => {
      expect(panel()).toBeNull();
      expect(fab().getAttribute("aria-haspopup")).toBe("dialog");
      expect(fab().getAttribute("aria-label")).toBe("fab_click_popup");
      act(() => fab().focus());

      clickFab();

      const openedPanel = panel();
      expect(openedPanel).not.toBeNull();
      expect(
        openedPanel.querySelector('[aria-label="Panel input"]')
      ).not.toBeNull();
      expect(container.querySelector(".kt-content-fab-menu")).toBeNull();
      focusPanel();
      expect(panel()).toBe(openedPanel);
      expect(openedPanel.getRootNode().activeElement).toBe(openedPanel);

      act(() => {
        outsideInput.focus();
        outsideInput.click();
      });
      expect(panel()).toBeNull();
      expect(document.activeElement).toBe(outsideInput);

      act(() => fab().focus());
      clickFab();
      expect(panel()).not.toBeNull();
      clickFab();
      expect(panel()).toBeNull();
      clickFab();
      expect(panel()).not.toBeNull();
      expect(processActions.mock.calls).toEqual([
        [{ action: MSG_POPUP_TOGGLE }],
        [{ action: MSG_POPUP_TOGGLE }],
        [{ action: MSG_POPUP_TOGGLE }],
        [{ action: MSG_POPUP_TOGGLE }],
      ]);
      expect(container.querySelector(".kt-content-fab-menu")).toBeNull();
    });

    test.each(["close button", "Escape"])(
      "%s restores FAB focus and permits reopening the panel",
      (dismissal) => {
        act(() => fab().focus());
        clickFab();
        focusPanel();
        const openedPanel = panel();
        expect(openedPanel.getRootNode().activeElement).toBe(openedPanel);

        if (dismissal === "close button") {
          const closeButton = openedPanel
            .getRootNode()
            .querySelector('[aria-label="Close panel"]');
          act(() => {
            closeButton.focus();
            closeButton.click();
          });
        } else {
          const input = openedPanel.querySelector("input");
          act(() => input.focus());
          expect(pressEscape(input).defaultPrevented).toBe(true);
        }

        expect(panel()).toBeNull();
        expect(focusRoot().activeElement).toBe(fab());

        clickFab();
        focusPanel();
        const reopenedPanel = panel();
        expect(reopenedPanel).not.toBeNull();
        expect(reopenedPanel.getRootNode().activeElement).toBe(reopenedPanel);
        pressEscape(reopenedPanel);
        expect(panel()).toBeNull();
        expect(focusRoot().activeElement).toBe(fab());
        expect(processActions).toHaveBeenCalledTimes(2);
      }
    );

    test("a completed drag suppresses opening until the next ordinary click", () => {
      pointer("pointerdown", 10, 110);
      pointer("pointermove", 80, 150);
      pointer("pointerup", 80, 150);

      clickFab();

      expect(panel()).toBeNull();
      expect(processActions).not.toHaveBeenCalled();
      expect(container.querySelector(".kt-content-fab-menu")).toBeNull();

      pointer("pointerdown", 80, 150);
      pointer("pointerup", 80, 150);
      clickFab();

      expect(panel()).not.toBeNull();
      expect(processActions).toHaveBeenCalledTimes(1);
      expect(processActions).toHaveBeenCalledWith({ action: MSG_POPUP_TOGGLE });
    });
  }
);
