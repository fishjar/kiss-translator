jest.mock("../../components/TouchTranslateControl", () => () => null);
/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import ContentFab from "./ContentFab";
import {
  EVENT_KISS_INNER,
  MSG_OPEN_OPTIONS,
  MSG_OPEN_TRANBOX,
  MSG_POPUP_TOGGLE,
  MSG_TRANS_TOGGLE,
  MSG_TRANS_TOGGLE_STYLE,
  MSG_TRANSBOX_TOGGLE,
} from "../../config";
import { sendBgMsg } from "../../libs/msg";
import { useFab } from "../../hooks/Fab";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockIsVideoFullscreen = false;
let draggableProps = null;

jest.mock("../../hooks/Fab", () => ({ useFab: jest.fn() }));

jest.mock("../../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock("../../hooks/M3Theme", () => ({
  __esModule: true,
  default: ({ children }) => {
    const React = require("react");
    return React.createElement("div", { className: "kt-m3-root" }, children);
  },
}));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../hooks/WindowSize", () => ({
  __esModule: true,
  default: () => ({ w: 800, h: 600 }),
}));
jest.mock("../../hooks/useFullscreenDetect", () => ({
  useFullscreenDetect: () => ({ isVideoFullscreen: mockIsVideoFullscreen }),
}));
jest.mock("../../libs/client", () => ({ isExt: true }));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));

// Replace Draggable to access the FAB and menu directly.
// Keep onStart/onMove callable to simulate the click after a drag.
jest.mock("./Draggable", () => {
  const React = require("react");
  return function Draggable(props) {
    draggableProps = props;
    return React.createElement(
      "div",
      { "data-testid": "draggable" },
      props.handler,
      props.children
    );
  };
});

describe.each(["document", "shadow root"])("ContentFab in %s", (context) => {
  let container;
  let host;
  let focusRoot;
  let root;
  let processActions;
  let selectionEnabled;
  let updateFab;
  let onClose;
  let onVisibilityChange;
  const getSelectionEnabled = () => selectionEnabled;

  beforeEach(() => {
    window.PointerEvent = MouseEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    mockIsVideoFullscreen = false;
    draggableProps = null;
    processActions = jest.fn();
    selectionEnabled = true;
    updateFab = jest.fn().mockResolvedValue();
    onClose = jest.fn();
    onVisibilityChange = jest.fn();
    useFab.mockReturnValue({ fab: {}, updateFab });
    jest.spyOn(window, "alert").mockImplementation(() => {});
    host = document.createElement("div");
    document.body.appendChild(host);
    focusRoot =
      context === "shadow root"
        ? host.attachShadow({ mode: "open" })
        : document;
    container = document.createElement("div");
    (focusRoot === document ? host : focusRoot).appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    sendBgMsg.mockReset();
    jest.restoreAllMocks();
  });

  function render(fabConfig = {}) {
    act(() =>
      root.render(
        <ContentFab
          fabConfig={fabConfig}
          processActions={processActions}
          getSelectionEnabled={getSelectionEnabled}
          onClose={onClose}
          onVisibilityChange={onVisibilityChange}
        />
      )
    );
  }

  const fab = () => container.querySelector(".kt-content-fab");
  const menuItems = () =>
    Array.from(container.querySelectorAll(".kt-content-fab-menu__item"));
  const clickFab = () => act(() => fab().click());
  const pressMenuKey = (key) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    act(() => focusRoot.activeElement.dispatchEvent(event));
    return event;
  };

  test("uses Material 3 regular FAB geometry for edge snapping", () => {
    render();

    expect(draggableProps).toEqual(
      expect.objectContaining({
        width: 56,
        height: 56,
        snapEdge: true,
        fitContent: true,
      })
    );
  });

  test("opens the action menu on click and lists every action", () => {
    render();
    expect(menuItems()).toHaveLength(0);
    expect(fab().getAttribute("aria-expanded")).toBe("false");
    const speedDialIcon = fab().querySelector(".MuiSpeedDialIcon-root");
    expect(fab().querySelectorAll(".MuiSpeedDialIcon-root svg")).toHaveLength(
      2
    );
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-iconOpen")
    ).toBeNull();
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-openIconOpen")
    ).toBeNull();

    clickFab();

    expect(fab().getAttribute("aria-expanded")).toBe("true");
    expect(fab().id).toBe("kt-content-fab-button");
    expect(fab().getAttribute("aria-controls")).toBe("kt-content-fab-menu");
    const menu = container.querySelector("#kt-content-fab-menu");
    expect(menu.getAttribute("aria-labelledby")).toBe(fab().id);
    expect(menu.closest(".kt-m3-root")).not.toBeNull();
    expect(menu.getRootNode()).toBe(focusRoot);
    expect(focusRoot.activeElement).toBe(menuItems()[0]);
    if (context === "shadow root") {
      expect(document.activeElement).toBe(host);
    }
    expect(menuItems().map((item) => item.textContent)).toEqual([
      "popup_translate_page",
      "text_style_alt",
      "selection_translate",
      "open_menu",
      "open_setting",
      "touch_paragraph",
      "fab_turn_off",
    ]);
    expect(fab().querySelectorAll(".MuiSpeedDialIcon-root svg")).toHaveLength(
      2
    );
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-iconOpen")
    ).not.toBeNull();
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-openIconOpen")
    ).not.toBeNull();
    expect(menuItems().every((item) => item.style.animationDelay === "")).toBe(
      true
    );

    clickFab();
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-iconOpen")
    ).toBeNull();
    expect(
      speedDialIcon.querySelector(".MuiSpeedDialIcon-openIconOpen")
    ).toBeNull();
  });

  test.each([
    [0, MSG_TRANS_TOGGLE],
    [1, MSG_TRANS_TOGGLE_STYLE],
    [2, MSG_OPEN_TRANBOX],
    [3, MSG_POPUP_TOGGLE],
  ])("menu item %i dispatches its action and closes", (index, action) => {
    render();
    clickFab();

    act(() => menuItems()[index].click());

    expect(processActions).toHaveBeenCalledWith({ action });
    expect(menuItems()).toHaveLength(0);
    expect(focusRoot.activeElement).toBe(fab());
  });

  test.each(["Escape", "Tab"])(
    "%s closes the menu, restores focus, and does not reach the host page",
    (key) => {
      render();
      clickFab();
      menuItems()[0].focus();
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      const onPageKeyDown = jest.fn();
      window.addEventListener("keydown", onPageKeyDown);

      try {
        act(() => menuItems()[0].dispatchEvent(event));

        expect(event.defaultPrevented).toBe(true);
        expect(menuItems()).toHaveLength(0);
        expect(focusRoot.activeElement).toBe(fab());
        expect(onPageKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("keydown", onPageKeyDown);
      }
    }
  );

  test("disables selection translation while its runtime is disabled", () => {
    selectionEnabled = false;
    render();
    clickFab();

    expect(menuItems()[2].getAttribute("aria-disabled")).toBe("true");
    act(() => menuItems()[2].click());
    expect(processActions).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(7);

    pressMenuKey("ArrowDown");
    expect(focusRoot.activeElement).toBe(menuItems()[1]);
    pressMenuKey("ArrowDown");
    expect(focusRoot.activeElement).toBe(menuItems()[3]);
  });

  test("updates an open menu when the current tab changes selection availability", () => {
    selectionEnabled = false;
    render();
    clickFab();

    for (const enabled of [true, true, false, true]) {
      act(() => {
        selectionEnabled = enabled;
        document.dispatchEvent(
          new CustomEvent(EVENT_KISS_INNER, {
            detail: { action: MSG_TRANSBOX_TOGGLE },
          })
        );
      });
      expect(menuItems()[2].getAttribute("aria-disabled")).toBe(
        enabled ? null : "true"
      );
    }

    act(() => menuItems()[2].click());
    expect(processActions).toHaveBeenCalledWith({ action: MSG_OPEN_TRANBOX });
  });

  test("removes the selection availability listener when unmounted", () => {
    const addListener = jest.spyOn(document, "addEventListener");
    const removeListener = jest.spyOn(document, "removeEventListener");
    render();
    const listener = addListener.mock.calls.find(
      ([type]) => type === EVENT_KISS_INNER
    )[1];

    act(() => root.render(null));

    expect(removeListener).toHaveBeenCalledWith(EVENT_KISS_INNER, listener);
  });

  test("moves focus with arrow keys, wraps, and supports Home and End", () => {
    render();
    clickFab();

    expect(pressMenuKey("ArrowDown").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(menuItems()[1]);
    pressMenuKey("ArrowDown");
    expect(focusRoot.activeElement).toBe(menuItems()[2]);
    pressMenuKey("ArrowUp");
    expect(focusRoot.activeElement).toBe(menuItems()[1]);
    expect(pressMenuKey("End").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(menuItems()[6]);
    pressMenuKey("ArrowDown");
    expect(focusRoot.activeElement).toBe(menuItems()[0]);
    pressMenuKey("ArrowUp");
    expect(focusRoot.activeElement).toBe(menuItems()[6]);
    expect(pressMenuKey("Home").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(menuItems()[0]);
    expect(processActions).not.toHaveBeenCalled();
  });

  test("cycles matching labels when the same character is typed repeatedly", () => {
    render();
    clickFab();

    expect(pressMenuKey("o").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(menuItems()[3]);
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[4]);
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[3]);
  });

  test("matches typed prefixes after the first character", () => {
    render();
    clickFab();

    for (const key of "open_s") {
      pressMenuKey(key);
    }

    expect(focusRoot.activeElement).toBe(menuItems()[4]);
    expect(processActions).not.toHaveBeenCalled();
  });

  test("resets typeahead when the menu is quickly closed and reopened", () => {
    jest.spyOn(performance, "now").mockReturnValue(1000);
    jest.spyOn(Date, "now").mockReturnValue(1000);
    render();
    clickFab();
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[3]);

    pressMenuKey("Escape");
    clickFab();
    pressMenuKey("t");

    expect(focusRoot.activeElement).toBe(menuItems()[1]);
  });

  test("the settings item goes to the background, not through processActions", () => {
    render();
    clickFab();

    act(() => menuItems()[4].click());

    expect(sendBgMsg).toHaveBeenCalledWith(MSG_OPEN_OPTIONS);
    expect(processActions).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(0);
  });

  test("saves only the hide preference and shows a themed reminder before hiding", async () => {
    let finishSave;
    updateFab.mockReturnValue(new Promise((resolve) => (finishSave = resolve)));
    render();
    clickFab();
    const toggle = menuItems().at(-1);
    expect(toggle.getAttribute("role")).toBe("menuitemcheckbox");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.textContent).toBe("fab_turn_off");

    act(() => toggle.click());

    expect(updateFab).toHaveBeenCalledWith({ isHide: true });
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    expect(onClose).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onVisibilityChange).not.toHaveBeenCalled();
    await act(async () => finishSave());
    expect(onVisibilityChange).toHaveBeenCalledWith(true);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("fab_hidden_shortcut_hint");
    expect(dialog.getRootNode()).toBe(focusRoot);
    expect(dialog.closest(".kt-m3-root")).not.toBeNull();
    expect(dialog.closest('[data-testid="draggable"]')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(0);
    expect(processActions).not.toHaveBeenCalled();

    act(() => dialog.querySelector("button").click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("a temporarily shown FAB can restore the always-show preference", async () => {
    useFab.mockReturnValue({ fab: { isHide: true }, updateFab });
    render({ isHide: true });
    clickFab();
    const toggle = menuItems().at(-1);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.textContent).toBe("fab_always_show");
    expect(toggle.querySelector(".MuiListItemIcon-root")).not.toBeNull();
    expect(toggle.querySelector("input")).toBeNull();

    await act(async () => toggle.click());

    expect(updateFab).toHaveBeenCalledWith({ isHide: false });
    expect(onVisibilityChange).toHaveBeenCalledWith(false);
    expect(window.alert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(0);
  });

  test("keeps the FAB and menu available if saving the preference fails", async () => {
    updateFab.mockRejectedValue(new Error("Storage unavailable"));
    render();
    clickFab();

    await act(async () => menuItems().at(-1).click());

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("popup_save_failed");
    expect(onVisibilityChange).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(7);
    expect(menuItems().at(-1).getAttribute("aria-disabled")).toBeNull();
    act(() => dialog.querySelector("button").click());
    expect(onClose).not.toHaveBeenCalled();
  });

  test.each([false, true])(
    "toggles the effective page preference for a matching exception (global hide: %s)",
    async (isHide) => {
      const stored = { isHide, hideExceptionList: "*", size: 72 };
      useFab.mockReturnValue({ fab: stored, updateFab });
      render({ ...stored, isHide: !isHide });
      clickFab();
      const toggle = menuItems().at(-1);
      expect(toggle.getAttribute("aria-checked")).toBe(String(isHide));
      expect(toggle.textContent).toBe(
        isHide ? "fab_turn_off" : "fab_always_show"
      );

      await act(async () => toggle.click());

      expect(updateFab).toHaveBeenCalledWith({ isHide: !isHide });
      expect(onVisibilityChange).toHaveBeenCalledWith(isHide);
      expect(stored).toEqual({ isHide, hideExceptionList: "*", size: 72 });
      expect(menuItems()).toHaveLength(0);
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.textContent ?? "").toBe(
        isHide ? "hide_fab_buttonfab_hidden_shortcut_hintclose" : ""
      );
      expect(onClose).not.toHaveBeenCalled();
      if (isHide) {
        act(() => dialog.querySelector("button").click());
      }
      expect(onClose).toHaveBeenCalledTimes(Number(isHide));
    }
  );

  test.each(["Escape", "backdrop"])(
    "dismissing the shortcut reminder with %s hides the FAB",
    async (dismissal) => {
      render();
      clickFab();
      await act(async () => menuItems().at(-1).click());
      const dialog = container.querySelector('[role="dialog"]');
      if (dismissal === "Escape") {
        act(() =>
          dialog.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
          )
        );
      } else {
        const backdrop = dialog.closest(".MuiDialog-container");
        act(() => {
          backdrop.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true })
          );
          backdrop.click();
        });
      }
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(window.alert).not.toHaveBeenCalled();
    }
  );

  // Preserve the existing direct-translation behavior of fabClickAction === 1.
  // The action menu must not add an extra click for users with this setting.
  test("fabClickAction=1 translates directly and never opens the menu", () => {
    render({ fabClickAction: 1 });

    expect(fab().getAttribute("aria-expanded")).toBeNull();
    expect(fab().getAttribute("aria-haspopup")).toBeNull();
    expect(fab().getAttribute("aria-controls")).toBeNull();
    expect(fab().querySelector(".MuiSpeedDialIcon-root")).toBeNull();
    expect(fab().querySelectorAll("svg")).toHaveLength(1);
    clickFab();

    expect(processActions).toHaveBeenCalledWith({ action: MSG_TRANS_TOGGLE });
    expect(menuItems()).toHaveLength(0);
    expect(draggableProps.expanded).toBe(false);
  });

  test("fabClickAction=2 opens the translation panel without the action menu", () => {
    render({ fabClickAction: 2 });

    expect(fab().getAttribute("aria-label")).toBe("fab_click_popup");
    expect(fab().getAttribute("aria-haspopup")).toBe("dialog");
    expect(fab().getAttribute("aria-expanded")).toBeNull();
    expect(fab().getAttribute("aria-controls")).toBeNull();
    expect(fab().querySelector(".MuiSpeedDialIcon-root")).toBeNull();
    clickFab();

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({ action: MSG_POPUP_TOGGLE });
    expect(menuItems()).toHaveLength(0);
    expect(draggableProps.expanded).toBe(false);
  });

  test("switching to the panel action dismisses the menu and does not restore it later", () => {
    render();
    clickFab();
    expect(menuItems()).toHaveLength(7);

    render({ fabClickAction: 2 });
    expect(menuItems()).toHaveLength(0);
    render();
    expect(menuItems()).toHaveLength(0);
    expect(processActions).not.toHaveBeenCalled();

    clickFab();
    expect(menuItems()).toHaveLength(7);
  });

  test.each([0, 1, 2])(
    "a drag suppresses the click that ends it in action mode %i",
    (fabClickAction) => {
      render({ fabClickAction });

      act(() => {
        draggableProps.onStart();
        draggableProps.onMove();
      });
      clickFab();

      expect(processActions).not.toHaveBeenCalled();
      expect(menuItems()).toHaveLength(0);
    }
  );

  test.each([
    { x: -28, y: 0, edge: "left" },
    { x: 772, y: 544, edge: "right" },
    { x: 744, y: -28, edge: "top" },
    { x: 0, y: 572, edge: "bottom" },
  ])("closes an open menu when dragged from $edge", (fabConfig) => {
    render(fabConfig);
    clickFab();
    expect(draggableProps.expanded).toBe(true);

    act(() => draggableProps.onStart());
    expect(menuItems()).toHaveLength(7);
    act(() => draggableProps.onMove());

    expect(menuItems()).toHaveLength(0);
    expect(draggableProps.expanded).toBe(false);
    expect(focusRoot.activeElement).toBe(fab());
    clickFab();
    expect(menuItems()).toHaveLength(0);
    expect(processActions).not.toHaveBeenCalled();

    act(() => draggableProps.onStart());
    clickFab();
    expect(menuItems()).toHaveLength(7);
    expect(draggableProps.expanded).toBe(true);
  });

  test("pressing an open FAB without moving still toggles the menu closed", () => {
    render();
    clickFab();

    act(() => draggableProps.onStart());
    clickFab();

    expect(menuItems()).toHaveLength(0);
    expect(processActions).not.toHaveBeenCalled();
  });

  // Video fullscreen hides the FAB, so its menu must close too.
  // Otherwise an unreachable, undismissable panel remains over the video.
  test("entering video fullscreen closes an open menu", () => {
    render();
    clickFab();
    expect(menuItems()).toHaveLength(7);

    mockIsVideoFullscreen = true;
    act(() =>
      root.render(<ContentFab fabConfig={{}} processActions={processActions} />)
    );

    expect(menuItems()).toHaveLength(0);
  });
});
