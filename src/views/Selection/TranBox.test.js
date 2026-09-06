/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TranBox from "./TranBox";
import { MSG_OPEN_SEPARATE_WINDOW } from "../../config/msg.js";
import { sendBgMsg } from "../../libs/msg.js";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockToggleDarkMode = jest.fn();

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
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({
    darkMode: "light",
    toggleDarkMode: mockToggleDarkMode,
  }),
}));
jest.mock("../../libs/client.js", () => ({ isExt: true }));
jest.mock("../../libs/msg.js", () => ({ sendBgMsg: jest.fn() }));
jest.mock("../../components/Logo", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("./TranForm.js", () => ({
  __esModule: true,
  default: () => null,
}));

// Mock positioning, dragging, and resizing to access the header directly.
jest.mock("./DraggableResizable", () => {
  const React = require("react");
  return function DraggableResizable({ header, children }) {
    return React.createElement("div", null, header, children);
  };
});

describe("TranBox header", () => {
  let container;
  let root;
  let handlers;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    handlers = {
      setShowBox: jest.fn(),
      setSimpleStyle: jest.fn(),
      setHideClickAway: jest.fn(),
      setFollowSelection: jest.fn(),
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sendBgMsg.mockReset();
    mockToggleDarkMode.mockReset();
  });

  function render(overrides = {}) {
    const props = {
      showBox: true,
      simpleStyle: false,
      hideClickAway: false,
      followSelection: false,
      text: "hello",
      setText: jest.fn(),
      boxPosition: { x: 0, y: 0 },
      boxSize: { w: 300, h: 300 },
      setBoxPosition: jest.fn(),
      setBoxSize: jest.fn(),
      tranboxSetting: {},
      transApis: [],
      prompts: [],
      ...handlers,
      ...overrides,
    };
    act(() => root.render(<TranBox {...props} />));
    return props;
  }

  const header = () => container.querySelector(".kt-tranbox-header");
  const actions = () =>
    Array.from(
      container.querySelectorAll(".kt-tranbox-header__actions button")
    );
  const menu = () => container.querySelector(".kt-tranbox-header__menu");
  const menuItems = () =>
    Array.from(container.querySelectorAll(".kt-tranbox-header__menu button"));
  const openMenu = () => act(() => actions()[1].click());

  test("keeps the lock, overflow and close actions always reachable", () => {
    render();

    expect(header()).not.toBeNull();
    expect(actions().map((button) => button.getAttribute("title"))).toEqual([
      "btn_tip_click_away",
      "more",
      "close",
    ]);
    expect(menu()).toBeNull();
  });

  test("the overflow menu holds the remaining four controls", () => {
    render();
    openMenu();

    expect(menuItems().map((item) => item.textContent)).toEqual([
      "open_separate_window",
      "btn_tip_simple_style",
      "btn_tip_follow_selection",
      "btn_tip_dark_mode",
    ]);
  });

  test("supports menu keyboard navigation and restores trigger focus", () => {
    render();
    const trigger = actions()[1];
    openMenu();

    expect(trigger.getAttribute("aria-controls")).toBe(menu().id);
    expect(menu().getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(document.activeElement).toBe(menuItems()[0]);

    const press = (key) =>
      act(() =>
        document.activeElement.dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          })
        )
      );

    press("ArrowDown");
    expect(document.activeElement).toBe(menuItems()[1]);
    press("End");
    expect(document.activeElement).toBe(menuItems()[3]);
    press("Home");
    expect(document.activeElement).toBe(menuItems()[0]);
    press("Escape");
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // These four controls were always visible in the previous header.
  // Moving them into the overflow menu must preserve every action.
  test.each([
    [1, "setSimpleStyle"],
    [2, "setFollowSelection"],
  ])("menu item %i still drives %s", (index, handlerName) => {
    render();
    openMenu();

    act(() => menuItems()[index].click());

    expect(handlers[handlerName]).toHaveBeenCalled();
  });

  test("the separate-window item still messages the background", () => {
    render();
    openMenu();

    act(() => menuItems()[0].click());

    expect(sendBgMsg).toHaveBeenCalledWith(MSG_OPEN_SEPARATE_WINDOW);
  });

  test("the dark mode item still toggles the color mode", () => {
    render();
    openMenu();

    act(() => menuItems()[3].click());

    expect(mockToggleDarkMode).toHaveBeenCalled();
  });

  test("the lock and close actions keep working from the action cluster", () => {
    render();

    act(() => actions()[0].click());
    expect(handlers.setHideClickAway).toHaveBeenCalled();

    act(() => actions()[2].click());
    expect(handlers.setShowBox).toHaveBeenCalledWith(false);
  });

  test("toggle state is exposed to assistive tech", () => {
    render({ hideClickAway: true, simpleStyle: true, followSelection: true });
    expect(actions()[0].getAttribute("aria-pressed")).toBe("true");

    openMenu();
    expect(menuItems()[1].getAttribute("aria-checked")).toBe("true");
    expect(menuItems()[2].getAttribute("aria-checked")).toBe("true");
  });

  test("clicking outside closes the overflow menu", async () => {
    render();
    openMenu();
    expect(menu()).not.toBeNull();

    // ClickAwayListener starts listening after setTimeout(0), preventing the
    // click that opens the menu from immediately closing it again.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    act(() => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(menu()).toBeNull();
  });
});
