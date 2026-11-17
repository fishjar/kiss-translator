jest.mock("../../hooks/useTouchTranslateState", () => ({
  useTouchState: () => mockTouch,
}));
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
  MSG_IMAGE_SCREENSHOT,
} from "../../config";
import { sendBgMsg } from "../../libs/msg";
import { useFab } from "../../hooks/Fab";
import { useI18n } from "../../hooks/I18n";
import { newI18n } from "../../config/i18n";
import { ACTION_STYLES } from "./styles";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockTouch = {
  state: null,
  failed: false,
  saveFailed: false,
  pending: false,
  change: jest.fn(),
};

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
  useI18n: jest.fn(() => (key) => key),
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
    useI18n.mockImplementation(() => (key) => key);
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
    mockTouch.state = {
      mode: "off",
      supported: true,
      blocked: false,
      direction: "left",
    };
    mockTouch.failed = false;
    mockTouch.saveFailed = false;
    mockTouch.pending = false;
    mockTouch.change = jest.fn();
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
    Array.from(
      container.querySelectorAll(
        "#kt-content-fab-menu .kt-content-fab-menu__item"
      )
    );
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
  const gestureEntry = () => container.querySelector("#kt-fab-gesture-entry");
  const gestureView = () =>
    container.querySelector(".kt-content-fab-menu__gesture");
  const gestureListbox = () =>
    container.querySelector("#kt-fab-gesture-listbox");
  const gestureOptions = () =>
    Array.from(
      container.querySelectorAll("#kt-fab-gesture-listbox [role='option']")
    );
  const setTouch = (patch) => {
    Object.assign(mockTouch, patch);
    render();
  };
  const openGestureView = () => {
    expect(gestureEntry()).not.toBeNull();
    act(() => gestureEntry().click());
  };
  const statusInPanel = () =>
    container.querySelector(".kt-content-fab-menu [role='status']");

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

  test("hides visibility controls on touch devices even when temporarily shown", () => {
    useFab.mockReturnValue({ fab: { isHide: true }, updateFab });
    render();
    clickFab();
    expect(container.querySelector('[role="menuitemcheckbox"]')).toBeNull();
    expect(menuItems().map((item) => item.textContent)).not.toContain(
      "touch_paragraph"
    );
  });

  test("localizes the screenshot menu item in English", () => {
    useI18n.mockReturnValue(newI18n("en"));
    render();
    clickFab();
    expect(menuItems().map((item) => item.textContent)).toContain(
      "Screenshot Translate"
    );
    expect(menuItems().map((item) => item.textContent)).not.toContain(
      "截图翻译"
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
      "fab_toggle_style",
      "fab_open_translation",
      "image_screenshot_translate",
      "open_menu",
      "open_setting",
      "touch_mode_shorttouch_summary_off",
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
    [4, MSG_POPUP_TOGGLE],
    [3, MSG_IMAGE_SCREENSHOT],
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
    expect(focusRoot.activeElement).toBe(menuItems()[4]);
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[5]);
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[4]);
  });

  test("matches typed prefixes after the first character", () => {
    render();
    clickFab();

    for (const key of "open_s") {
      pressMenuKey(key);
    }

    expect(focusRoot.activeElement).toBe(menuItems()[5]);
    expect(processActions).not.toHaveBeenCalled();
  });

  test("resets typeahead when the menu is quickly closed and reopened", () => {
    jest.spyOn(performance, "now").mockReturnValue(1000);
    jest.spyOn(Date, "now").mockReturnValue(1000);
    render();
    clickFab();
    pressMenuKey("o");
    expect(focusRoot.activeElement).toBe(menuItems()[4]);

    pressMenuKey("Escape");
    clickFab();
    pressMenuKey("f");

    expect(focusRoot.activeElement).toBe(menuItems()[1]);
  });

  test("the settings item goes to the background, not through processActions", () => {
    render();
    clickFab();

    act(() => menuItems()[5].click());

    expect(sendBgMsg).toHaveBeenCalledWith(MSG_OPEN_OPTIONS);
    expect(processActions).not.toHaveBeenCalled();
    expect(menuItems()).toHaveLength(0);
  });

  test("saves only the hide preference and shows a themed reminder before hiding", async () => {
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0 });
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
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0 });
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
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0 });
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
      Object.defineProperty(navigator, "maxTouchPoints", { value: 0 });
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
      Object.defineProperty(navigator, "maxTouchPoints", { value: 0 });
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

  test("gesture drill-down keeps level 1 a pure menu with a listbox entry", () => {
    render();
    clickFab();

    const menu = container.querySelector("#kt-content-fab-menu");
    expect(menu.getAttribute("role")).toBe("menu");
    expect(
      menu.querySelectorAll(
        '[role="combobox"], .MuiSelect-root, .MuiSelect-select'
      )
    ).toHaveLength(0);
    expect(gestureEntry()).not.toBeNull();
    expect(gestureEntry().getAttribute("role")).toBe("menuitem");

    expect(gestureView()).not.toBeNull();
    expect(gestureView().hasAttribute("hidden")).toBe(true);
    expect(gestureListbox().getAttribute("role")).toBe("listbox");
    expect(
      gestureListbox().querySelector(".kt-content-fab-menu__back")
    ).toBeNull();
    const options = gestureOptions();
    expect(options).toHaveLength(4);
    expect(options.map((option) => option.dataset.mode)).toEqual([
      "off",
      "tap",
      "swipe-right",
      "swipe-left",
    ]);
  });

  test("selected gesture state marks exactly one option", () => {
    setTouch({ state: { mode: "tap", supported: true, blocked: false } });
    render();
    clickFab();

    const selected = gestureOptions().filter(
      (option) => option.getAttribute("aria-selected") === "true"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.mode).toBe("tap");
  });

  test("gesture entry carries popup semantics and toggles aria-expanded", () => {
    render();
    clickFab();

    expect(gestureEntry().getAttribute("aria-haspopup")).toBe("listbox");
    expect(gestureEntry().getAttribute("aria-controls")).toBe(
      "kt-fab-gesture-listbox"
    );
    expect(gestureEntry().getAttribute("aria-expanded")).toBe("false");

    openGestureView();

    expect(gestureEntry().getAttribute("aria-expanded")).toBe("true");
    expect(gestureView().hasAttribute("hidden")).toBe(false);
    expect(gestureView().hasAttribute("aria-hidden")).toBe(false);
    expect(
      container.querySelector("#kt-content-fab-menu").hasAttribute("hidden")
    ).toBe(true);

    act(() =>
      gestureView().querySelector(".kt-content-fab-menu__back").click()
    );

    expect(gestureEntry().getAttribute("aria-expanded")).toBe("false");
    expect(gestureView().hasAttribute("hidden")).toBe(true);
    expect(
      container.querySelector("#kt-content-fab-menu").hasAttribute("hidden")
    ).toBe(false);
  });

  test("gesture entry is excluded from visibility and selection item semantics", () => {
    render();
    clickFab();

    expect(gestureEntry()).not.toBeNull();
    expect(gestureEntry().hasAttribute("aria-checked")).toBe(false);
    expect(gestureEntry().getAttribute("role")).toBe("menuitem");
  });

  test("drill-down containers are never focus targets and initial focus selects the current mode", () => {
    render();
    clickFab();

    const menu = container.querySelector("#kt-content-fab-menu");
    expect(menu.getAttribute("tabindex")).toBe("-1");
    expect(gestureListbox().hasAttribute("tabindex")).toBe(false);
    const listboxFocus = jest.spyOn(gestureListbox(), "focus");
    const menuFocusSpy = jest.spyOn(menu, "focus");

    openGestureView();

    const selected = gestureListbox().querySelector(
      '[role="option"][aria-selected="true"]'
    );
    expect(selected).not.toBeNull();
    expect(selected.dataset.mode).toBe("off");
    expect(focusRoot.activeElement).toBe(selected);
    expect(listboxFocus).not.toHaveBeenCalled();
    expect(menuFocusSpy).not.toHaveBeenCalled();
  });

  test.each(["Escape", "ArrowLeft"])(
    "%s from the listbox returns to the entry without closing the panel",
    (key) => {
      render();
      clickFab();
      openGestureView();
      const focused = focusRoot.activeElement;
      expect(focused.closest("#kt-fab-gesture-listbox")).not.toBeNull();
      const onPageKeyDown = jest.fn();
      window.addEventListener("keydown", onPageKeyDown);

      try {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        act(() => focused.dispatchEvent(event));

        expect(event.defaultPrevented).toBe(true);
        expect(onPageKeyDown).not.toHaveBeenCalled();
        expect(menuItems()).not.toHaveLength(0);
        expect(focusRoot.activeElement).toBe(gestureEntry());
      } finally {
        window.removeEventListener("keydown", onPageKeyDown);
      }
    }
  );

  test.each(["Enter", " ", "ArrowRight"])(
    "activating the gesture entry with %s drills into level 2",
    (key) => {
      render();
      clickFab();
      const entry = gestureEntry();
      expect(entry).not.toBeNull();
      act(() => entry.focus());
      const onPageKeyDown = jest.fn();
      window.addEventListener("keydown", onPageKeyDown);

      try {
        expect(pressMenuKey(key).defaultPrevented).toBe(true);

        expect(gestureEntry().getAttribute("aria-expanded")).toBe("true");
        expect(focusRoot.activeElement).not.toBe(entry);
        expect(gestureListbox().contains(focusRoot.activeElement)).toBe(true);
        expect(onPageKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("keydown", onPageKeyDown);
      }
    }
  );

  test("back button keyboard activation returns to the entry", () => {
    render();
    clickFab();
    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");
    act(() => back.focus());
    expect(pressMenuKey("Enter").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(gestureEntry());
  });

  test("ArrowUp from the first option reaches the back button", () => {
    render();
    clickFab();
    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");
    act(() => gestureOptions()[0].focus());

    expect(pressMenuKey("ArrowUp").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(back);
  });

  test("back button arrow roving wraps across the first and last options", () => {
    render();
    clickFab();
    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");

    act(() => back.focus());
    expect(pressMenuKey("ArrowDown").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(gestureOptions()[0]);

    act(() => back.focus());
    expect(pressMenuKey("ArrowUp").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(gestureOptions()[3]);
  });

  test("ArrowDown from the last option reaches the back button", () => {
    render();
    clickFab();
    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");
    act(() => gestureOptions()[3].focus());

    expect(pressMenuKey("ArrowDown").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(back);
  });

  test("entry and back button labels localize to a four character label", () => {
    useI18n.mockReturnValue(newI18n("zh"));
    render();
    clickFab();

    const entry = gestureEntry();
    expect(entry.textContent).toContain("手势翻译");
    expect(entry.textContent).not.toContain("触摸");

    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");
    expect(back.textContent).toContain("手势翻译");
    expect(back.textContent).not.toContain("触摸");
  });

  test.each([
    ["off", "off", undefined],
    ["tap", "tap", undefined],
    ["swipe-right", "swipe", "right"],
    ["swipe-left", "swipe", "left"],
  ])(
    "choosing %s dispatches change(mode, direction) and returns to level 1",
    (value, mode, direction) => {
      render();
      clickFab();
      openGestureView();
      const option = gestureListbox().querySelector(
        `[role="option"][data-mode="${value}"]`
      );

      act(() => option.click());

      expect(mockTouch.change).toHaveBeenCalledWith(mode, direction);
      expect(gestureEntry().getAttribute("aria-expanded")).toBe("false");
      expect(focusRoot.activeElement).toBe(gestureEntry());
    }
  );

  test.each(["Enter", " "])(
    "%s selects the focused option, dispatches change and returns to the entry",
    (key) => {
      render();
      clickFab();
      openGestureView();
      const tapOption = gestureListbox().querySelector(
        '[role="option"][data-mode="tap"]'
      );
      act(() => tapOption.focus());

      const event = pressMenuKey(key);

      expect(event.defaultPrevented).toBe(true);
      expect(mockTouch.change).toHaveBeenCalledWith("tap", undefined);
      expect(gestureEntry().getAttribute("aria-expanded")).toBe("false");
      expect(focusRoot.activeElement).toBe(gestureEntry());
    }
  );

  test("blocked state disables tap and swipe options and keeps roving on off", () => {
    setTouch({
      state: { mode: "off", supported: true, blocked: true, direction: "left" },
    });
    render();
    clickFab();
    openGestureView();

    for (const option of gestureOptions()) {
      const disabled = option.dataset.mode !== "off";
      expect(option.getAttribute("aria-disabled")).toBe(
        disabled ? "true" : null
      );
    }
    expect(focusRoot.activeElement).toBe(
      gestureListbox().querySelector('[role="option"][data-mode="off"]')
    );

    pressMenuKey("ArrowDown");
    expect(focusRoot.activeElement).toBe(
      gestureListbox().querySelector('[role="option"][data-mode="off"]')
    );
    pressMenuKey("ArrowUp");
    expect(focusRoot.activeElement).toBe(
      gestureListbox().querySelector('[role="option"][data-mode="off"]')
    );
  });

  test("blocked off option still submits through the hook change", () => {
    setTouch({
      state: { mode: "off", supported: true, blocked: true, direction: "left" },
    });
    render();
    clickFab();
    openGestureView();

    act(() =>
      gestureListbox().querySelector('[role="option"][data-mode="off"]').click()
    );

    expect(mockTouch.change).toHaveBeenCalledWith("off", undefined);
  });

  test("selecting through a disabled option neither persists nor collapses the listbox", () => {
    setTouch({
      state: { mode: "off", supported: true, blocked: true, direction: "left" },
    });
    render();
    clickFab();
    openGestureView();
    const tapOption = gestureListbox().querySelector(
      '[role="option"][data-mode="tap"]'
    );
    expect(tapOption.getAttribute("aria-disabled")).toBe("true");

    act(() => tapOption.click());

    expect(mockTouch.change).not.toHaveBeenCalled();
    expect(gestureView().hasAttribute("hidden")).toBe(false);
  });

  test("level 2 feedback reports page rejection without touching other controls", () => {
    setTouch({ state: { mode: "tap", supported: true }, failed: true });
    render();
    clickFab();
    openGestureView();

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe("touch_failed");
  });

  test.each([
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
    "Enter",
    " ",
    "ArrowLeft",
    "Escape",
  ])(
    "level 2 containment: %s prevents default and stays inside the panel",
    (key) => {
      render();
      clickFab();
      openGestureView();
      const focused = focusRoot.activeElement;
      expect(focused.closest(".kt-content-fab-menu__gesture")).not.toBeNull();
      const onPageKeyDown = jest.fn();
      window.addEventListener("keydown", onPageKeyDown);

      try {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          composed: true,
        });
        act(() => focused.dispatchEvent(event));

        expect(event.defaultPrevented).toBe(true);
        expect(onPageKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("keydown", onPageKeyDown);
      }
    }
  );

  test("level 2 arrow roving stays inside the listbox options", () => {
    render();
    clickFab();
    openGestureView();

    expect(pressMenuKey("ArrowDown").defaultPrevented).toBe(true);
    expect(focusRoot.activeElement).toBe(gestureOptions()[1]);
    pressMenuKey("End");
    expect(focusRoot.activeElement).toBe(gestureOptions()[3]);
    pressMenuKey("Home");
    expect(focusRoot.activeElement).toBe(gestureOptions()[0]);
    expect(
      focusRoot.activeElement.closest("#kt-fab-gesture-listbox")
    ).not.toBeNull();
  });

  test("action styles ship the focus-visible ring with forced-colors fallback", () => {
    expect(
      ACTION_STYLES.includes(".kt-content-fab-menu__item:focus-visible") ||
        ACTION_STYLES.includes(".kt-content-fab-menu__option:focus-visible")
    ).toBe(true);
    expect(ACTION_STYLES).toContain("outline: 2px solid var(--kt-pri)");
    const ringIndex = ACTION_STYLES.indexOf(
      ":focus-visible { outline: 2px solid var(--kt-pri)"
    );
    const forcedIndex = ACTION_STYLES.indexOf("@media (forced-colors: active)");
    expect(ringIndex).toBeGreaterThan(-1);
    expect(forcedIndex).toBeGreaterThan(-1);
    expect(forcedIndex).toBeGreaterThan(ringIndex);
    expect(ACTION_STYLES).toContain("outline: 2px solid CanvasText");
  });

  test("action styles keep a forced-colors marker for the selected option", () => {
    const forcedIndex = ACTION_STYLES.indexOf("@media (forced-colors: active)");
    const forcedBody = ACTION_STYLES.slice(forcedIndex);
    expect(forcedBody).toMatch(
      /\.kt-content-fab-menu__option\[aria-selected="true"\]\s*\{[^}]*border:\s*2px solid Highlight;/
    );
  });

  test("action styles keep the geometry budget", () => {
    expect(ACTION_STYLES).toContain(
      "max-width: min(280px, calc(100vw - 24px))"
    );
    expect(ACTION_STYLES).toContain("min-height: 48px");
    expect(ACTION_STYLES).toContain("min-width: 112px");
    expect(ACTION_STYLES).toContain("width: max-content");
    expect(ACTION_STYLES).toContain(
      "max-height: min(400px, calc(100vh - 24px))"
    );
  });

  test("gesture options carry no leading glyph and mark selection by state", () => {
    setTouch({ state: { mode: "tap", supported: true, blocked: false } });
    render();
    clickFab();
    openGestureView();

    const options = gestureOptions();
    const selected = options.filter(
      (option) => option.getAttribute("aria-selected") === "true"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].dataset.mode).toBe("tap");
    expect(
      options.filter(
        (option) => option.getAttribute("aria-selected") === "false"
      )
    ).toHaveLength(3);
    for (const option of options) {
      expect(
        option.querySelector(".kt-content-fab-menu__option-icon")
      ).toBeNull();
      expect(option.querySelector("svg")).toBeNull();
    }
  });

  test("the gesture entry renders a single leading icon and no trailing chevron", () => {
    render();
    clickFab();

    const entry = gestureEntry();
    expect(entry.querySelectorAll(".MuiListItemIcon-root svg")).toHaveLength(1);
    expect(entry.querySelectorAll("svg")).toHaveLength(1);
    expect(entry.textContent).toContain("touch_mode_short");
  });

  test("glyphs never leak into the option accessible name", () => {
    render();
    clickFab();
    openGestureView();

    expect(gestureOptions().map((option) => option.textContent)).toEqual([
      "touch_summary_off",
      "touch_summary_tap",
      "touch_summary_right",
      "touch_summary_left",
    ]);
  });

  test("no feedback node exists while the mode is healthy", () => {
    render();
    clickFab();
    openGestureView();

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("no feedback node exists before the state arrives", () => {
    setTouch({ state: null });
    render();
    clickFab();
    openGestureView();

    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("a rejected change stays visible after the view returns to level 1", () => {
    setTouch({ state: { mode: "tap", supported: true }, failed: true });
    render();
    clickFab();

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe("touch_failed");
    expect(gestureView().hasAttribute("hidden")).toBe(true);
    expect(status.closest("[hidden]")).toBeNull();
  });

  test.each([
    [{ failed: true }, "touch_failed"],
    [{ saveFailed: true }, "touch_save_failed"],
    [{ failed: true, saveFailed: true }, "touch_save_failed"],
    [{ state: null, failed: true }, "touch_failed"],
    [{ state: null, saveFailed: true }, "touch_save_failed"],
  ])("level 2 feedback surfaces %s", (patch, text) => {
    setTouch({ ...patch });
    render();
    clickFab();
    openGestureView();

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe(text);
  });

  test.each([
    [
      { mode: "off", supported: true, blocked: true, direction: "left" },
      "touch_blocked",
    ],
    [{ mode: "off", supported: false }, "touch_unsupported"],
  ])("level 2 feedback surfaces state %s", (state, text) => {
    setTouch({ state });
    render();
    clickFab();
    openGestureView();

    expect(container.querySelector('[role="status"]').textContent).toBe(text);
  });

  test("level 2 options expose a roving tab stop", () => {
    render();
    clickFab();
    openGestureView();
    const tabStops = () =>
      gestureOptions().map((option) => option.getAttribute("tabindex"));

    expect(tabStops()).toEqual(["0", "-1", "-1", "-1"]);
    pressMenuKey("ArrowDown");
    expect(tabStops()).toEqual(["-1", "0", "-1", "-1"]);
    pressMenuKey("End");
    expect(tabStops()).toEqual(["-1", "-1", "-1", "0"]);
  });

  test("the selected mode seeds the roving tab stop", () => {
    setTouch({
      state: { mode: "swipe", supported: true, direction: "left" },
    });
    render();
    clickFab();
    openGestureView();

    expect(
      gestureOptions().map((option) => option.getAttribute("tabindex"))
    ).toEqual(["-1", "-1", "-1", "0"]);
  });

  test("a disabled selected mode keeps the tab stop on the fallback", () => {
    setTouch({ state: { mode: "tap", supported: false } });
    render();
    clickFab();
    openGestureView();

    expect(
      gestureOptions().map((option) => option.getAttribute("tabindex"))
    ).toEqual(["0", "-1", "-1", "-1"]);
  });

  test("an unknown mode never leaves the listbox without a tab stop", () => {
    setTouch({ state: { mode: "hover", supported: true } });
    render();
    clickFab();
    openGestureView();

    expect(
      gestureOptions().map((option) => option.getAttribute("tabindex"))
    ).toEqual(["0", "-1", "-1", "-1"]);
  });

  test("a stop that becomes disabled while open falls back to off", () => {
    setTouch({ state: { mode: "swipe", supported: true, direction: "left" } });
    render();
    clickFab();
    openGestureView();
    expect(gestureOptions()[3].getAttribute("tabindex")).toBe("0");

    setTouch({ state: { mode: "swipe", supported: false } });

    expect(gestureOptions()[0].getAttribute("tabindex")).toBe("0");
    expect(gestureOptions()[3].getAttribute("tabindex")).toBe("-1");
    expect(focusRoot.activeElement).toBe(gestureOptions()[3]);
  });

  test("Tab from level 2 closes the panel and restores the FAB", () => {
    render();
    clickFab();
    openGestureView();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    act(() => focusRoot.activeElement.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(menuItems()).toHaveLength(0);
    expect(focusRoot.activeElement).toBe(fab());
  });

  test("entry metrics and ellipsis are pinned by the style contract", () => {
    const itemRule = ACTION_STYLES.match(
      /\.kt-content-fab-menu__item\s*\{([^}]*)\}/
    )[1];
    expect(itemRule).toContain("min-height: 48px");
    expect(itemRule).toContain("padding: 0 16px");
    expect(itemRule).toContain("border-radius: 4px");
    expect(itemRule).toContain("font-size: 12.5px");
    expect(itemRule).toContain("font-weight: 650");
    expect(itemRule).toContain("line-height: 20px");
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__item .MuiListItemText-root { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__option svg { width: 19px; height: 19px; flex-shrink: 0; }"
    );
  });

  test.each(["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "])(
    "level 1 containment: %s prevents default and stays inside the panel",
    (key) => {
      render();
      clickFab();
      menuItems()[0].focus();
      const onPageKeyDown = jest.fn();
      window.addEventListener("keydown", onPageKeyDown);

      try {
        const event = pressMenuKey(key);
        expect(event.defaultPrevented).toBe(true);
        expect(onPageKeyDown).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("keydown", onPageKeyDown);
      }
    }
  );

  test.each(["Enter", " "])(
    "%s activates the focused action item and closes the menu",
    (key) => {
      render();
      clickFab();
      menuItems()[1].focus();

      expect(pressMenuKey(key).defaultPrevented).toBe(true);
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_TRANS_TOGGLE_STYLE,
      });
      expect(menuItems()).toHaveLength(0);
    }
  );

  test.each(["Enter", " "])(
    "a disabled menu item never receives a synthetic activation on %s",
    (key) => {
      selectionEnabled = false;
      render();
      clickFab();
      const item = menuItems()[2];
      act(() => item.focus());
      const clickSpy = jest.spyOn(item, "click");

      const event = pressMenuKey(key);

      expect(event.defaultPrevented).toBe(true);
      expect(clickSpy).not.toHaveBeenCalled();
      expect(processActions).not.toHaveBeenCalled();
    }
  );

  test("every interactive row renders a state layer node", () => {
    render();
    clickFab();

    for (const item of menuItems()) {
      expect(item.querySelector(".kt-state-layer")).not.toBeNull();
    }
    expect(
      container
        .querySelector(".kt-content-fab-menu__back")
        .querySelector(".kt-state-layer")
    ).not.toBeNull();

    openGestureView();
    for (const option of gestureOptions()) {
      expect(option.querySelector(".kt-state-layer")).not.toBeNull();
    }
  });

  test("hover and active feedback use the state layer, not solid tokens", () => {
    expect(ACTION_STYLES).not.toContain("var(--kt-sf1)");
    expect(ACTION_STYLES).not.toContain("transform: scale(.97)");
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__item:hover .kt-state-layer { opacity: .08; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__item:active .kt-state-layer { opacity: .12; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-state-layer { position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: 0; pointer-events: none; transition: opacity .2s ease; z-index: 1; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__item .MuiListItemIcon-root { min-width: 24px; color: var(--kt-onv); }"
    );
  });

  test("menu rows suppress the theme solid hover in favor of the state layer", () => {
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu .kt-content-fab-menu__item:hover { background-color: transparent; }"
    );
    expect(ACTION_STYLES).toContain(
      ".kt-content-fab-menu__item:hover .kt-state-layer { opacity: .08; }"
    );
  });

  test("the hover override outranks the MUI theme menu item hover", () => {
    // The theme injects one class + pseudo; the override scopes two classes
    // plus pseudo, so it wins the cascade regardless of injection order.
    const rule = ACTION_STYLES.match(
      /([^{}]*:hover[^{}]*)\{\s*background-color:\s*transparent;?\s*\}/
    );
    expect(rule).not.toBeNull();
    const classes = (rule[1].match(/\.[a-zA-Z][\w-]*/g) || []).length;
    expect(classes).toBeGreaterThan(1);
  });

  test("ring nodes never render a focus state layer", () => {
    expect(ACTION_STYLES).not.toMatch(
      /kt-state-layer[^{}]*:focus|:focus[^{}]*kt-state-layer/
    );
  });

  test("keyboard focus scrolls only the panel, never the page", () => {
    render();
    clickFab();
    openGestureView();
    const scroller = container.querySelector(".kt-content-fab-menu");
    jest
      .spyOn(scroller, "getBoundingClientRect")
      .mockReturnValue({ top: 100, bottom: 200 });
    jest
      .spyOn(gestureOptions()[1], "getBoundingClientRect")
      .mockReturnValue({ top: 260, bottom: 308 });

    pressMenuKey("ArrowDown");

    expect(scroller.scrollTop).toBe(108);
    expect(window.scrollY).toBe(0);
  });

  test("focuses the back button when the gesture view has no usable option", () => {
    setTouch({ pending: true });
    clickFab();
    openGestureView();
    const back = gestureView().querySelector(".kt-content-fab-menu__back");
    expect(back).not.toBeNull();
    expect(focusRoot.activeElement).toBe(back);
  });

  test.each(["Enter", " "])("a disabled option stays inert to %s", (key) => {
    setTouch({ state: { mode: "off", supported: true, blocked: true } });
    render();
    clickFab();
    openGestureView();
    const tapOption = gestureListbox().querySelector(
      '[role="option"][data-mode="tap"]'
    );
    act(() => tapOption.focus());

    const event = pressMenuKey(key);

    expect(event.defaultPrevented).toBe(true);
    expect(mockTouch.change).not.toHaveBeenCalled();
  });

  test("an in-flight save marks the listbox busy", () => {
    setTouch({ pending: true });
    render();
    clickFab();
    openGestureView();

    expect(gestureListbox().getAttribute("aria-busy")).toBe("true");
  });

  test("an in-flight save disables every option including off", () => {
    setTouch({ pending: true, state: { mode: "off", supported: true } });
    render();
    clickFab();
    openGestureView();

    expect(
      gestureOptions().map((option) => option.getAttribute("aria-disabled"))
    ).toEqual(["true", "true", "true", "true"]);
  });

  test("an in-flight save leaves the tab stop on no option", () => {
    setTouch({ pending: true, state: { mode: "tap", supported: true } });
    render();
    clickFab();
    openGestureView();

    expect(
      gestureOptions().map((option) => option.getAttribute("tabindex"))
    ).toEqual(["-1", "-1", "-1", "-1"]);

    setTouch({ pending: false });

    expect(
      gestureOptions().map((option) => option.getAttribute("tabindex"))
    ).toEqual(["-1", "0", "-1", "-1"]);
  });

  test("a pending save keeps the gesture view open when off is clicked", () => {
    setTouch({ pending: true, state: { mode: "off", supported: true } });
    render();
    clickFab();
    openGestureView();

    act(() =>
      gestureListbox().querySelector('[role="option"][data-mode="off"]').click()
    );

    expect(mockTouch.change).not.toHaveBeenCalled();
    expect(gestureView().hasAttribute("hidden")).toBe(false);
  });

  test("a settled listbox keeps no busy attribute", () => {
    render();
    clickFab();
    openGestureView();

    expect(gestureListbox().hasAttribute("aria-busy")).toBe(false);
  });

  test("a swipe state without a direction shows no direction summary", () => {
    setTouch({ state: { mode: "swipe", supported: true } });
    render();
    clickFab();

    const summary = gestureEntry().querySelector(
      ".kt-content-fab-menu__entry-summary"
    );
    expect(summary.textContent).not.toContain("touch_summary_left");
    expect(summary.textContent).not.toContain("touch_summary_right");
  });
});
