jest.mock("../hooks/Setting", () => ({
  SettingProvider: ({ children }) => children,
}));
jest.mock(
  "../hooks/M3Theme",
  () =>
    ({ children }) =>
      children
);
jest.mock("../libs/msg", () => ({ sendTabMsg: jest.fn() }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TouchTranslateControl, {
  TouchTranslateStatus,
} from "./TouchTranslateControl";
import {
  EVENT_KISS_INNER,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
} from "../config";

const mockSave = jest.fn();
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../hooks/MouseHover", () => ({
  useMouseHoverSetting: () => ({ updateMouseHoverSetting: mockSave }),
}));
jest.mock("../hooks/I18n", () => ({ useI18n: () => (key) => key }));

describe("touch mode controls", () => {
  let root, container, dispatch;
  beforeEach(() => {
    window.PointerEvent = MouseEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    dispatch = jest.fn(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "off",
        direction: "left",
        supported: true,
      },
    }));
    mockSave.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = async () => {
    await act(async () => {
      root.render(<TouchTranslateControl processActions={dispatch} />);
    });
  };
  const select = async (mode) => {
    act(() =>
      Simulate.mouseDown(container.querySelector('[role="combobox"]'), {
        button: 0,
      })
    );
    await act(async () => {
      document.querySelector(`[data-value="${mode}"]`).click();
    });
  };

  test("reads page state without saving defaults; saves only explicitly selected preference", async () => {
    await render();
    expect(dispatch).toHaveBeenCalledWith({
      action: MSG_TOUCH_TRANSLATE_STATE,
      args: undefined,
    });
    expect(mockSave).not.toHaveBeenCalled();
    await select("swipe");
    expect(dispatch).toHaveBeenLastCalledWith({
      action: MSG_TOUCH_TRANSLATE_MODE_SET,
      args: { mode: "swipe" },
    });
    expect(mockSave).toHaveBeenCalledWith({ touchMode: "swipe" });
    expect(container.textContent).toContain("touch_left");
    await select("off");
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith({ touchMode: "off" });
  });

  test("opens the menu in the document body when no theme root exists", async () => {
    await render();
    act(() =>
      Simulate.mouseDown(container.querySelector('[role="combobox"]'), {
        button: 0,
      })
    );
    const list = document.querySelector('[role="listbox"]');
    expect(list).not.toBeNull();
    expect(container.contains(list)).toBe(false);
    expect(list.closest(".MuiModal-root").parentElement).toBe(document.body);
    await act(async () => list.querySelector('[data-value="tap"]').click());
    expect(container.querySelector('[role="combobox"]').textContent).toBe(
      "touch_tap"
    );
  });

  test("updates mounted controls from the page event without persisting runtime state", async () => {
    await render();
    act(() =>
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: {
            action: MSG_TOUCH_TRANSLATE_STATE,
            touchTranslate: {
              mode: "tap",
              supported: true,
              direction: "right",
            },
          },
        })
      )
    );
    expect(container.querySelector('[role="combobox"]').textContent).toBe(
      "touch_tap"
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("the independent status bar saves off when closed", async () => {
    dispatch.mockImplementation(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "tap",
        supported: true,
        direction: "right",
      },
    }));
    await act(async () => {
      root.render(<TouchTranslateStatus processActions={dispatch} />);
    });
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      container.querySelector("button").click();
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(mockSave).toHaveBeenCalledWith({ touchMode: "off" });
  });

  test("hides on a mouse-only desktop", async () => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 0,
    });
    await render();
    expect(container.innerHTML).toBe("");
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("silently hides when the initial query has no receiver", async () => {
    dispatch.mockResolvedValue(undefined);
    await render();
    expect(container.innerHTML).toBe("");
  });

  test("shows operation failure while retaining confirmed mode", async () => {
    await render();
    await select("tap");
    dispatch.mockRejectedValue(new Error("No receiver"));
    await select("swipe");
    expect(container.querySelector('[role="combobox"]').textContent).toBe(
      "touch_tap"
    );
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      "touch_failed"
    );
  });

  test("allows exit on a blacklisted page with an active mode", async () => {
    dispatch.mockImplementation(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "tap",
        supported: true,
        blocked: true,
        direction: "right",
      },
    }));
    await render();
    await select("off");
    expect(container.querySelector('[role="combobox"]').textContent).toBe(
      "touch_off"
    );
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      "touch_blocked"
    );
  });

  test("does not persist a mode rejected by the page", async () => {
    await render();
    dispatch.mockImplementation(() => ({
      touchTranslate: { mode: "off", supported: true, direction: "right" },
    }));
    await select("tap");
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("keeps the applied mode and reports a persistence failure", async () => {
    mockSave.mockRejectedValueOnce(new Error("Storage unavailable"));
    await render();
    await select("swipe");
    expect(container.querySelector('[role="combobox"]').textContent).toBe(
      "touch_left"
    );
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      "touch_save_failed"
    );
  });

  test("keeps status feedback visible after off fails to save and allows retry", async () => {
    dispatch.mockImplementation(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "tap",
        supported: true,
        direction: "right",
      },
    }));
    mockSave.mockRejectedValueOnce(new Error("Storage unavailable"));
    await act(async () => {
      root.render(<TouchTranslateStatus processActions={dispatch} />);
    });
    await act(async () => container.querySelector("button").click());
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      "touch_save_failed"
    );
    await act(async () => container.querySelector("button").click());
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockSave).toHaveBeenLastCalledWith({ touchMode: "off" });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test("blocks repeated status actions until persistence finishes", async () => {
    let finishSave;
    mockSave.mockImplementationOnce(
      () => new Promise((resolve) => (finishSave = resolve))
    );
    dispatch.mockImplementation(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "tap",
        supported: true,
        direction: "right",
      },
    }));
    await act(async () => {
      root.render(<TouchTranslateStatus processActions={dispatch} />);
    });
    await act(async () => {
      container.querySelector("button").click();
      container.querySelector("button").click();
    });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button").disabled).toBe(true);
    await act(async () => finishSave());
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
