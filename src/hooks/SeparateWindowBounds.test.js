import { act } from "react";
import { createRoot } from "react-dom/client";
import { MSG_UPDATE_SEPARATE_WINDOW_BOUNDS } from "../config/msg";
import { browser } from "../libs/browser";
import { sendBgMsg } from "../libs/msg";
import { useSeparateWindowBounds } from "./SeparateWindowBounds";

jest.mock("../libs/browser", () => ({ browser: {} }));
jest.mock("../libs/msg", () => ({ sendBgMsg: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const geometryKeys = ["screenX", "screenY", "outerWidth", "outerHeight"];
const originalGeometry = Object.fromEntries(
  geometryKeys.map((key) => [key, Object.getOwnPropertyDescriptor(window, key)])
);

function setGeometry(values) {
  Object.entries(values).forEach(([key, value]) => {
    Object.defineProperty(window, key, {
      configurable: true,
      writable: true,
      value,
    });
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Harness({ enabled }) {
  useSeparateWindowBounds(enabled);
  return null;
}

describe("useSeparateWindowBounds", () => {
  let root;

  async function render(enabled = true) {
    if (!root) root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Harness enabled={enabled} />);
    });
  }

  async function advanceTime(milliseconds = 250) {
    await act(async () => {
      jest.advanceTimersByTime(milliseconds);
    });
  }

  function resize(values) {
    setGeometry(values);
    window.dispatchEvent(new Event("resize"));
  }

  beforeEach(() => {
    jest.useFakeTimers();
    sendBgMsg.mockReset();
    sendBgMsg.mockResolvedValue(undefined);
    browser.windows = {
      getCurrent: jest.fn().mockResolvedValue({ id: 42, type: "popup" }),
    };
    setGeometry({
      screenX: 100,
      screenY: 150,
      outerWidth: 500,
      outerHeight: 400,
    });
  });

  afterEach(() => {
    if (root) act(() => root.unmount());
    root = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
    geometryKeys.forEach((key) => {
      if (originalGeometry[key]) {
        Object.defineProperty(window, key, originalGeometry[key]);
      } else {
        delete window[key];
      }
    });
  });

  test("does not start tracking an embedded panel", async () => {
    await render(false);
    resize({ outerWidth: 600 });
    await advanceTime(1000);

    expect(browser.windows.getCurrent).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test("does not start tracking without the extension window API", async () => {
    browser.windows = undefined;
    await render();
    resize({ outerHeight: 600 });
    await advanceTime(1000);

    expect(jest.getTimerCount()).toBe(0);
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test.each([
    { id: 42, type: "normal" },
    { id: 42, type: "panel" },
    { type: "popup" },
    { id: -1, type: "popup" },
    { id: "42", type: "popup" },
  ])(
    "ignores a window that is not a valid popup: %p",
    async (currentWindow) => {
      browser.windows.getCurrent.mockResolvedValue(currentWindow);
      await render();
      resize({ outerWidth: 600 });
      await advanceTime(1000);

      expect(jest.getTimerCount()).toBe(0);
      expect(sendBgMsg).not.toHaveBeenCalled();
    }
  );

  test("polls only changed geometry when native bounds events are unavailable", async () => {
    await render();
    await advanceTime(1000);
    expect(sendBgMsg).not.toHaveBeenCalled();

    setGeometry({ screenX: 250, screenY: 300 });
    await advanceTime();
    expect(sendBgMsg).toHaveBeenCalledWith(MSG_UPDATE_SEPARATE_WINDOW_BOUNDS, {
      windowId: 42,
    });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);

    await advanceTime(1000);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);

    resize({ outerWidth: 640, outerHeight: 480 });
    await advanceTime();
    expect(sendBgMsg).toHaveBeenCalledTimes(2);
    await advanceTime(1000);
    expect(sendBgMsg).toHaveBeenCalledTimes(2);
  });

  test("reports resizing immediately without polling when native bounds events exist", async () => {
    browser.windows.onBoundsChanged = { addListener: jest.fn() };
    const setIntervalSpy = jest.spyOn(window, "setInterval");
    await render();

    setGeometry({ screenX: 300 });
    await advanceTime(1000);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(sendBgMsg).not.toHaveBeenCalled();

    resize({ outerWidth: 550 });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    expect(sendBgMsg).toHaveBeenCalledWith(MSG_UPDATE_SEPARATE_WINDOW_BOUNDS, {
      windowId: 42,
    });
    await advanceTime();
    resize({ outerWidth: 550 });
    await advanceTime();
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
  });

  test("detects geometry changed while the current window is resolving", async () => {
    const lookup = deferred();
    browser.windows.getCurrent.mockReturnValue(lookup.promise);
    await render();
    resize({ outerHeight: 700 });
    expect(sendBgMsg).not.toHaveBeenCalled();

    await act(async () => {
      lookup.resolve({ id: 42, type: "popup" });
    });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    await advanceTime(1000);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
  });

  test("reports a resize before closing and clears listeners and polling on unmount", async () => {
    const addListenerSpy = jest.spyOn(window, "addEventListener");
    const removeListenerSpy = jest.spyOn(window, "removeEventListener");
    await render();
    const resizeHandler = addListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "resize"
    )[1];
    resize({ outerWidth: 600 });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    root = undefined;
    expect(removeListenerSpy).toHaveBeenCalledWith("resize", resizeHandler);
    expect(jest.getTimerCount()).toBe(0);

    resizeHandler();
    resize({ outerWidth: 700 });
    await advanceTime(1000);
    expect(jest.getTimerCount()).toBe(0);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
  });

  test("clears tracking when the panel stops being separate", async () => {
    await render();
    resize({ outerHeight: 600 });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    await render(false);
    expect(jest.getTimerCount()).toBe(0);

    resize({ outerHeight: 700 });
    await advanceTime(1000);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
  });

  test("ignores a late window lookup after unmount", async () => {
    const lookup = deferred();
    browser.windows.getCurrent.mockReturnValue(lookup.promise);
    const addListenerSpy = jest.spyOn(window, "addEventListener");
    await render();
    act(() => root.unmount());
    root = undefined;

    await act(async () => {
      lookup.resolve({ id: 42, type: "popup" });
    });
    resize({ outerWidth: 700 });
    await advanceTime(1000);
    expect(addListenerSpy).not.toHaveBeenCalledWith(
      "resize",
      expect.any(Function)
    );
    expect(jest.getTimerCount()).toBe(0);
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test("ignores a previous activation's window lookup after re-enabling", async () => {
    const oldLookup = deferred();
    browser.windows.getCurrent
      .mockReturnValueOnce(oldLookup.promise)
      .mockResolvedValueOnce({ id: 43, type: "popup" });
    await render();
    await render(false);
    await render();

    await act(async () => {
      oldLookup.resolve({ id: 42, type: "popup" });
    });
    resize({ outerWidth: 700 });
    await advanceTime();
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    expect(sendBgMsg).toHaveBeenCalledWith(MSG_UPDATE_SEPARATE_WINDOW_BOUNDS, {
      windowId: 43,
    });
  });

  test("serializes requests and sends the latest change after an in-flight update", async () => {
    const update = deferred();
    sendBgMsg.mockReturnValueOnce(update.promise);
    await render();
    resize({ outerWidth: 600 });
    await advanceTime();
    resize({ outerWidth: 650 });
    await advanceTime();
    resize({ outerWidth: 700 });
    await advanceTime();
    expect(sendBgMsg).toHaveBeenCalledTimes(1);

    await act(async () => {
      update.resolve();
    });
    expect(sendBgMsg).toHaveBeenCalledTimes(2);
    await advanceTime(1000);
    expect(sendBgMsg).toHaveBeenCalledTimes(2);
  });

  test("does not flush queued changes after an in-flight request outlives unmount", async () => {
    const update = deferred();
    sendBgMsg.mockReturnValueOnce(update.promise);
    await render();
    resize({ outerWidth: 600 });
    await advanceTime();
    resize({ outerWidth: 700 });
    await advanceTime();
    act(() => root.unmount());
    root = undefined;

    await act(async () => {
      update.resolve();
    });
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(["synchronous", "asynchronous"])(
    "handles %s window lookup failures",
    async (failureMode) => {
      const error = new Error("Window unavailable");
      if (failureMode === "synchronous") {
        browser.windows.getCurrent.mockImplementation(() => {
          throw error;
        });
      } else {
        browser.windows.getCurrent.mockRejectedValue(error);
      }
      await render();
      resize({ outerWidth: 600 });
      await advanceTime(1000);

      expect(jest.getTimerCount()).toBe(0);
      expect(sendBgMsg).not.toHaveBeenCalled();
    }
  );

  test.each(["synchronous", "asynchronous"])(
    "handles %s update failures and can report later changes",
    async (failureMode) => {
      const error = new Error("Background unavailable");
      if (failureMode === "synchronous") {
        sendBgMsg.mockImplementationOnce(() => {
          throw error;
        });
      } else {
        sendBgMsg.mockRejectedValueOnce(error);
      }
      await render();
      resize({ outerWidth: 600 });
      await advanceTime();
      expect(sendBgMsg).toHaveBeenCalledTimes(1);

      await advanceTime(1000);
      expect(sendBgMsg).toHaveBeenCalledTimes(1);
      resize({ outerWidth: 700 });
      await advanceTime();
      expect(sendBgMsg).toHaveBeenCalledTimes(2);
    }
  );
});
