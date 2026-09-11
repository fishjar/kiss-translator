/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import ContentFab from "./ContentFab";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/M3Theme", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
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

// Keep the actual Draggable and MUI components so event isolation is exercised.
describe.each(["document", "shadow root"])(
  "ContentFab outside interactions in %s",
  (context) => {
    let host;
    let contentRoot;
    let container;
    let root;
    let processActions;
    let outsideHost;

    beforeEach(() => {
      jest.useFakeTimers();
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
      root = createRoot(container);
      processActions = jest.fn();
      outsideHost = document.createElement("div");
      document.body.appendChild(outsideHost);
    });

    afterEach(() => {
      act(() => root.unmount());
      host.remove();
      outsideHost.remove();
      jest.clearAllTimers();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    function render() {
      act(() =>
        root.render(
          <ContentFab
            fabConfig={{ x: 0, y: 100, edge: "left" }}
            processActions={processActions}
            getSelectionEnabled={() => false}
          />
        )
      );
    }

    const fab = () => container.querySelector(".kt-content-fab");
    const menu = () => container.querySelector(".kt-content-fab-menu");
    const click = (target) => act(() => target.click());
    const openMenu = () => {
      click(fab());
      act(() => jest.runOnlyPendingTimers());
      expect(menu()).not.toBeNull();
    };
    const touch = (target, type) =>
      act(() =>
        target.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
      );

    test.each(["menu surface", "disabled item"])(
      "the first outside click closes after clicking the %s",
      (target) => {
        render();
        openMenu();
        const onPageClick = jest.fn();
        window.addEventListener("click", onPageClick);
        try {
          click(
            target === "menu surface"
              ? menu()
              : menu().querySelector('[aria-disabled="true"]')
          );
          expect(menu()).not.toBeNull();
          expect(onPageClick).not.toHaveBeenCalled();
          expect(processActions).not.toHaveBeenCalled();

          click(document.body);

          expect(menu()).toBeNull();
          expect(fab().getAttribute("aria-expanded")).toBe("false");
        } finally {
          window.removeEventListener("click", onPageClick);
        }
      }
    );

    test("clicking the open FAB closes without reopening the menu", () => {
      render();
      openMenu();
      click(menu());

      click(fab());

      expect(menu()).toBeNull();
      expect(processActions).not.toHaveBeenCalled();
      openMenu();
    });

    test.each(["same root", "another shadow root"])(
      "an outside click in %s closes even when its propagation is stopped",
      (location) => {
        const outside = document.createElement("button");
        const outsideRoot =
          location === "same root"
            ? contentRoot
            : outsideHost.attachShadow({ mode: "open" });
        outsideRoot.appendChild(outside);
        outside.addEventListener("click", (event) => event.stopPropagation());
        render();
        openMenu();
        click(menu());

        click(outside);

        expect(menu()).toBeNull();
        expect(processActions).not.toHaveBeenCalled();
      }
    );

    test("a touch outside closes while menu touches and scrolling keep it open", () => {
      render();
      openMenu();
      touch(menu(), "touchstart");
      touch(menu(), "touchend");
      expect(menu()).not.toBeNull();
      touch(document.body, "touchstart");
      touch(document.body, "touchmove");
      touch(document.body, "touchend");
      expect(menu()).not.toBeNull();

      touch(document.body, "touchstart");
      touch(document.body, "touchend");

      expect(menu()).toBeNull();
      expect(processActions).not.toHaveBeenCalled();
    });

    test.each(["close", "unmount"])(
      "removes outside interaction listeners on %s",
      (operation) => {
        const addListener = jest.spyOn(document, "addEventListener");
        const removeListener = jest.spyOn(document, "removeEventListener");
        render();
        openMenu();
        const eventTypes = ["click", "touchstart", "touchmove", "touchend"];
        // MUI registers shared pointer listeners while mounting its buttons.
        // The menu effect runs afterward, so inspect the latest callbacks.
        const menuCalls = [...addListener.mock.calls].reverse();
        const listeners = eventTypes.map((type) =>
          menuCalls.find(
            ([eventType, , capture]) => eventType === type && capture === true
          )
        );
        expect(listeners.every(Boolean)).toBe(true);

        if (operation === "close") {
          click(fab());
        } else {
          act(() => root.render(null));
        }

        for (const listener of listeners) {
          expect(removeListener).toHaveBeenCalledWith(...listener);
        }
      }
    );
  }
);
