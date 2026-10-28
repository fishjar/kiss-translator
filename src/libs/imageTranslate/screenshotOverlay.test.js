/* eslint-disable testing-library/no-unnecessary-act -- Native React DOM events require act. */
import { act } from "react";
import { ScreenshotOverlay } from "./screenshotOverlay";
import { APP_CONSTS, MSG_CAPTURE_VISIBLE_TAB } from "../../config";
import { sendBgMsg } from "../msg";
import { cropAndCompressImage } from "./imageReader";
import { downloadImageBlob } from "./downloadImage";
import { KISS_UI_SELECTOR } from "../kissUi";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.crypto = require("crypto").webcrypto;
jest.mock("../msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("./downloadImage", () => ({ downloadImageBlob: jest.fn() }));
jest.mock("./imageReader", () => ({
  cropAndCompressImage: jest.fn(),
  blobToDataUrl: async () => "data:image/png;base64,cropped",
}));

describe("ScreenshotOverlay", () => {
  let overlay;
  let callbacks;
  const originalImage = global.Image;
  const regions = [
    { order: 0, enabled: true, bbox: [0, 0, 100, 50] },
    { order: 1, enabled: true, bbox: [0, 60, 100, 100] },
  ];
  const root = () => document.querySelector(".kt-screenshot-overlay-root");
  const button = (name) => root().querySelector(`.kt-image-dual-btn--${name}`);
  const geometry = () => {
    const style = root().firstElementChild.style;
    return {
      left: style.getPropertyValue("--kt-selection-x"),
      top: style.getPropertyValue("--kt-selection-y"),
      width: style.getPropertyValue("--kt-selection-width"),
      height: style.getPropertyValue("--kt-selection-height"),
    };
  };
  const mouse = (target, type, x, y) =>
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })
    );
  const drag = (x, y, endX, endY, target = root().firstElementChild) => {
    act(() => {
      mouse(target, "mousedown", x, y);
      mouse(document, "mousemove", endX, endY);
      mouse(document, "mouseup", endX, endY);
    });
  };

  beforeEach(async () => {
    document.body.innerHTML = "";
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    global.Image = function () {
      const image = document.createElement("img");
      Object.defineProperty(image, "naturalWidth", {
        value: window.innerWidth,
      });
      Object.defineProperty(image, "src", {
        get: () => "data:image/png;base64,capture",
        set: () => Promise.resolve().then(() => image.onload?.()),
      });
      return image;
    };
    cropAndCompressImage.mockImplementation(async (_image, options) => ({
      blob: new Blob(["crop"], { type: "image/png" }),
      width: options.width * options.dpr,
      height: options.height * options.dpr,
    }));
    sendBgMsg.mockImplementation(async (message) =>
      message === MSG_CAPTURE_VISIBLE_TAB
        ? { dataUrl: "data:image/png;base64,capture" }
        : { success: true, result: { layout: { regions } } }
    );
    callbacks = {
      onComplete: jest.fn(),
      onCancel: jest.fn(),
      onLayoutChange: jest.fn(),
      onSelectionChange: jest.fn(),
      onLocalBusyChange: jest.fn(),
      onToggleBox: jest.fn(),
    };
    overlay = new ScreenshotOverlay({
      setting: {
        imageTranslateSetting: { layoutApiSlug: "layout" },
        transApis: [
          {
            apiSlug: "layout",
            provider: {
              apiVersion: 1,
              implementation: { kind: "native" },
              capabilities: { analyzeLayout: {} },
            },
          },
        ],
      },
    });
    await act(async () => overlay.start(callbacks));
    drag(100, 120, 400, 280);
    callbacks.onSelectionChange.mockClear();
  });

  afterEach(() => {
    act(() => overlay.destroy());
    global.Image = originalImage;
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
  });

  test("uses one screenshot layer so page image styles cannot shift the selected pixels", () => {
    const background = root().querySelector(".kt-screenshot-background");
    expect(root().querySelector("img")).toBeNull();
    expect(background.style.all).toBe("initial");
    expect(background.style.width).toBe("100vw");
    expect(background.style.height).toBe("100vh");
    expect(background.style.backgroundSize).toBe("100% 100%");
    expect(
      root().querySelector(".kt-screenshot-selection").children
    ).toHaveLength(0);
    expect(
      root().querySelector(".kt-screenshot-mask").style.clipPath
    ).toContain("polygon(evenodd");
  });

  test("coalesces pointer movement into one frame and commits the latest selection on release", () => {
    let paint;
    const request = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        paint = callback;
        return 123;
      });
    const cancel = jest
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    try {
      act(() => mouse(root().firstElementChild, "mousedown", 150, 150));
      act(() => {
        mouse(document, "mousemove", 160, 160);
        mouse(document, "mousemove", 180, 190);
        mouse(document, "mousemove", 200, 210);
      });
      expect(request).toHaveBeenCalledTimes(1);
      act(() => paint());
      expect(geometry()).toMatchObject({ left: "150px", top: "180px" });
      act(() => mouse(document, "mousemove", 220, 230));
      expect(request).toHaveBeenCalledTimes(2);
      act(() => {
        mouse(document, "mousemove", 150, 150);
        mouse(document, "mouseup", 150, 150);
      });
      expect(cancel).toHaveBeenCalledWith(123);
      expect(geometry()).toMatchObject({ left: "100px", top: "120px" });
      expect(callbacks.onSelectionChange).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
      cancel.mockRestore();
    }
  });

  test("cancels a pending selection paint when the overlay closes", () => {
    const request = jest
      .spyOn(window, "requestAnimationFrame")
      .mockReturnValue(456);
    const cancel = jest
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});
    try {
      act(() => {
        mouse(root().firstElementChild, "mousedown", 500, 400);
        mouse(document, "mousemove", 700, 600);
      });
      expect(request).toHaveBeenCalledTimes(1);
      act(() => overlay.destroy());
      expect(cancel).toHaveBeenCalledWith(456);
      expect(root()).toBeNull();
    } finally {
      request.mockRestore();
      cancel.mockRestore();
    }
  });

  test("downloads the current resized selection at capture resolution without translating", async () => {
    global.Image = function () {
      const image = document.createElement("img");
      Object.defineProperty(image, "naturalWidth", {
        value: window.innerWidth * 2,
      });
      Object.defineProperty(image, "src", {
        set: () => Promise.resolve().then(() => image.onload?.()),
      });
      return image;
    };
    await act(async () => overlay.start(callbacks));
    drag(40, 60, 450, 300);
    drag(80, 100, 100, 130, root().querySelector(".kt-screenshot-selection"));
    drag(
      470,
      330,
      510,
      360,
      root().querySelectorAll(".kt-screenshot-handle")[4]
    );
    const selection = { ...geometry() };
    await act(async () => button("download").click());
    expect(cropAndCompressImage).toHaveBeenLastCalledWith(
      expect.any(HTMLImageElement),
      {
        x: 60,
        y: 90,
        width: 450,
        height: 270,
        dpr: 2,
        maxEdge: Infinity,
      }
    );
    expect(downloadImageBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "screenshot"
    );
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    expect(geometry()).toEqual(selection);
    expect(
      sendBgMsg.mock.calls.every(
        ([message]) => message === MSG_CAPTURE_VISIBLE_TAB
      )
    ).toBe(true);
  });

  test("locks selection during download, prevents duplicates and discards cancelled crops", async () => {
    let finish;
    cropAndCompressImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const selection = geometry();
    act(() => button("download").click());
    const cropCount = cropAndCompressImage.mock.calls.length;
    act(() => button("download").click());
    drag(10, 10, 80, 80);
    expect(cropAndCompressImage).toHaveBeenCalledTimes(cropCount);
    expect(geometry()).toEqual(selection);
    act(() => button("cancel").click());
    await act(async () => finish({ blob: new Blob(["old image"]) }));
    expect(downloadImageBlob).not.toHaveBeenCalled();
  });

  test("reports a download failure with a Snackbar and keeps the selection", async () => {
    cropAndCompressImage.mockRejectedValueOnce(new Error("export failed"));
    await act(async () => button("download").click());
    expect(document.querySelector(".MuiSnackbar-root").textContent).toContain(
      "图片下载失败"
    );
    expect(root()).not.toBeNull();
    expect(button("download").disabled).toBe(false);
    const selection = geometry();
    const closeNotice = document.querySelector(".MuiSnackbar-root button");
    act(() => {
      mouse(closeNotice, "mousedown", 500, 30);
      mouse(document, "mouseup", 500, 30);
      closeNotice.click();
    });
    expect(geometry()).toEqual(selection);
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });

  test("retains all five buttons and excluded regions after opening the dialog", async () => {
    expect(root().matches(KISS_UI_SELECTOR)).toBe(true);
    await act(async () => button("layout").click());
    act(() =>
      root()
        .querySelectorAll("polygon")[1]
        .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    await act(async () => button("translate").click());
    expect(root().querySelectorAll("button.kt-image-dual-btn")).toHaveLength(5);
    expect(root().style.pointerEvents).not.toBe("none");
    expect(callbacks.onComplete.mock.calls[0][0].selectedRegions).toEqual([
      expect.objectContaining({ enabled: true }),
      expect.objectContaining({ enabled: false }),
    ]);
    expect(
      root().querySelectorAll("polygon")[1].getAttribute("stroke-dasharray")
    ).toBe("4 3");
    const count = sendBgMsg.mock.calls.length;
    act(() => button("layout").click());
    expect(root().querySelector("polygon")).toBeNull();
    act(() => button("layout").click());
    expect(root().querySelectorAll("polygon")).toHaveLength(2);
    expect(sendBgMsg).toHaveBeenCalledTimes(count);
  });

  test("locks new selection, movement and resize during analysis and external tasks only", async () => {
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await act(async () => button("layout").click());
    const previous = geometry();
    expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
    drag(150, 150, 180, 180);
    drag(500, 500, 700, 700);
    expect(geometry()).toEqual(previous);
    await act(async () =>
      finish({ success: true, result: { layout: { regions } } })
    );
    expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(8);
    act(() => overlay.setTaskState(true));
    drag(150, 150, 180, 180);
    expect(geometry()).toEqual(previous);
    act(() => overlay.setTaskState(false));
    drag(150, 150, 180, 180);
    expect(geometry().left).toBe("130px");
    drag(
      430,
      310,
      450,
      330,
      root().querySelectorAll(".kt-screenshot-handle")[4]
    );
    expect(geometry().width).toBe("320px");
  });

  test("locks while cropping, invalidates on adjustment, and updates the open source without translation", async () => {
    let finish;
    cropAndCompressImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => button("menu").click());
    const previous = geometry();
    drag(150, 150, 200, 200);
    expect(geometry()).toEqual(previous);
    await act(async () =>
      finish({ blob: new Blob(["crop"]), width: 300, height: 160 })
    );
    act(() => overlay.setLayoutState(regions));
    drag(150, 150, 180, 180);
    expect(callbacks.onSelectionChange).toHaveBeenCalledTimes(1);
    expect(root().querySelector("polygon")).toBeNull();
    await act(async () => {});
    expect(callbacks.onComplete).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "update",
        selectedRegions: null,
        selection: { x: 130, y: 150, w: 300, h: 160 },
      })
    );
    const calls = callbacks.onComplete.mock.calls.length;
    act(() => {
      mouse(root().firstElementChild, "mousedown", 150, 170);
      mouse(document, "mouseup", 150, 170);
    });
    expect(callbacks.onComplete).toHaveBeenCalledTimes(calls);
  });

  test("replaces and resets layout supplied by the popup", () => {
    act(() => overlay.setLayoutState(regions));
    act(() => overlay.setLayoutState([{ bbox: [20, 20, 80, 80] }]));
    expect(root().querySelectorAll("polygon")).toHaveLength(1);
    expect(root().querySelector("polygon").getAttribute("points")).toBe(
      "20,20 80,20 80,80 20,80"
    );
    act(() => overlay.setLayoutState(null));
    expect(root().querySelector("polygon")).toBeNull();
    expect(button("layout").getAttribute("aria-pressed")).toBe("false");
  });

  test("menu toggles an existing dialog even during a task without cropping again", async () => {
    await act(async () => button("menu").click());
    const crops = cropAndCompressImage.mock.calls.length;
    callbacks.onToggleBox.mockReturnValue(true);
    act(() => overlay.setTaskState(true));
    act(() => button("menu").click());
    expect(callbacks.onToggleBox).toHaveBeenCalledTimes(2);
    expect(cropAndCompressImage).toHaveBeenCalledTimes(crops);
    expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
  });

  test.each(["button", "service reset"])(
    "%s cancels analysis, restores adjustment, and ignores the late result",
    async (entry) => {
      let finish;
      sendBgMsg.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      await act(async () => button("layout").click());
      act(() => {
        if (entry === "button") button("layout").click();
        else overlay.setLayoutState(null);
      });
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(8);
      expect(callbacks.onLocalBusyChange).toHaveBeenLastCalledWith(false);
      await act(async () =>
        finish({ success: true, result: { layout: { regions } } })
      );
      expect(root().querySelector("polygon")).toBeNull();
    }
  );

  test("a closed crop cannot reopen or modify a new screenshot session", async () => {
    let finish;
    cropAndCompressImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => button("translate").click());
    act(() => button("cancel").click());
    expect(root()).toBeNull();
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    await act(async () => overlay.start(callbacks));
    await act(async () =>
      finish({ blob: new Blob(["old"]), width: 300, height: 160 })
    );
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(root()).not.toBeNull();
    expect(root().querySelector(".kt-screenshot-selection")).toBeNull();
  });

  test("locks background scroll but allows popup scroll, and restores prior styles", async () => {
    act(() => overlay.destroy());
    document.documentElement.style.setProperty(
      "overflow-y",
      "scroll",
      "important"
    );
    document.body.style.setProperty("overflow-x", "clip");
    document.documentElement.style.setProperty(
      "scrollbar-gutter",
      "stable both-edges",
      "important"
    );
    document.body.style.setProperty("scrollbar-gutter", "stable");
    // Older jsdom versions discard unsupported scrollbar-gutter values.
    const savedGutter =
      document.documentElement.style.getPropertyValue("scrollbar-gutter");
    const savedPriority =
      document.documentElement.style.getPropertyPriority("scrollbar-gutter");
    const savedBodyGutter =
      document.body.style.getPropertyValue("scrollbar-gutter");
    const gutterStyle = jest.spyOn(
      document.documentElement.style,
      "setProperty"
    );
    await act(async () => overlay.start(callbacks));
    expect(document.documentElement.style.overflowY).toBe("hidden");
    expect(gutterStyle).toHaveBeenCalledWith(
      "scrollbar-gutter",
      "auto",
      "important"
    );
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    const key = new KeyboardEvent("keydown", {
      key: "PageDown",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    const popup = document.createElement("div");
    popup.id = APP_CONSTS.imageBoxID;
    document.body.appendChild(popup);
    const inner = popup
      .attachShadow({ mode: "open" })
      .appendChild(document.createElement("div"));
    const popupWheel = new WheelEvent("wheel", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    inner.dispatchEvent(popupWheel);
    expect(popupWheel.defaultPrevented).toBe(false);
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
    );
    expect(document.documentElement.style.overflowY).toBe("scroll");
    expect(
      document.documentElement.style.getPropertyPriority("overflow-y")
    ).toBe("important");
    expect(document.body.style.overflowX).toBe("clip");
    expect(
      document.documentElement.style.getPropertyValue("scrollbar-gutter")
    ).toBe(savedGutter);
    expect(
      document.documentElement.style.getPropertyPriority("scrollbar-gutter")
    ).toBe(savedPriority);
    expect(document.body.style.getPropertyValue("scrollbar-gutter")).toBe(
      savedBodyGutter
    );
    gutterStyle.mockRestore();
    const after = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  test("failed analysis and crop unlock the same selection for retry", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const previous = geometry();
      sendBgMsg.mockResolvedValueOnce({
        success: false,
        error: "analysis failed",
      });
      await act(async () => button("layout").click());
      expect(alertMock).toHaveBeenLastCalledWith("analysis failed");
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(8);
      cropAndCompressImage.mockRejectedValueOnce(new Error("crop failed"));
      await act(async () => button("translate").click());
      expect(alertMock).toHaveBeenLastCalledWith("crop failed");
      expect(geometry()).toEqual(previous);
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(8);
      expect(callbacks.onCancel).not.toHaveBeenCalled();
      await act(async () => button("menu").click());
      expect(callbacks.onComplete).toHaveBeenCalledTimes(1);
    } finally {
      alertMock.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  test.each(["contextmenu", "resize"])(
    "%s exits during a gesture and restores scrolling without retaining mouse handlers",
    async (event) => {
      act(() => mouse(root().firstElementChild, "mousedown", 150, 150));
      act(() => {
        if (event === "resize") window.dispatchEvent(new Event("resize"));
        else
          root().firstElementChild.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
          );
      });
      expect(root()).toBeNull();
      expect(document.documentElement.style.overflowY).toBe("");
      act(() => mouse(document, "mousemove", 200, 200));
      await act(async () => overlay.start(callbacks));
      drag(100, 120, 400, 280);
      expect(geometry()).toEqual({
        left: "100px",
        top: "120px",
        width: "300px",
        height: "160px",
      });
    }
  );
});
