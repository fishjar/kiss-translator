/* eslint-disable testing-library/no-unnecessary-act -- Native React DOM events require act. */
import { act } from "react";
import { createRoot } from "react-dom/client";
import DraggableResizable from "../../views/Selection/DraggableResizable";
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
  test("covers selection translation panels even when mounted after the screenshot overlay", () => {
    const host = document.createElement("div");
    document.documentElement.appendChild(host);
    const panelRoot = createRoot(host);
    try {
      act(() =>
        panelRoot.render(
          <DraggableResizable
            position={{ x: 100, y: 100 }}
            size={{ w: 320, h: 300 }}
            minSize={{ w: 100, h: 100 }}
            maxSize={{ w: 800, h: 800 }}
            setPosition={jest.fn()}
            setSize={jest.fn()}
            autoHeight={false}
            header={<span>Translation</span>}
          >
            <div>Selected text translation</div>
          </DraggableResizable>
        )
      );
      const panel = host.querySelector(".KT-draggable");
      expect(panel.textContent).toContain("Selected text translation");
      expect(Number(getComputedStyle(root()).zIndex)).toBeGreaterThan(
        Number(getComputedStyle(panel).zIndex)
      );
    } finally {
      act(() => panelRoot.unmount());
      host.remove();
    }
  });
  const drag = (x, y, endX, endY, target = root().firstElementChild) => {
    act(() => {
      mouse(target, "pointerdown", x, y);
      mouse(document, "pointermove", endX, endY);
      mouse(document, "pointerup", endX, endY);
    });
  };

  const flushCapture = async () =>
    act(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await Promise.resolve();
    });
  const pointer = (target, type, x, y, id = 1, primary = true) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: "touch" },
      isPrimary: { value: primary },
    });
    target.dispatchEvent(event);
  };
  test("touch selects, ignores other fingers, moves and resizes", () => {
    act(() => {
      pointer(root().firstElementChild, "pointerdown", 20, 30);
      pointer(root().firstElementChild, "pointerdown", 500, 500, 2, false);
      pointer(document, "pointermove", 600, 600, 2, false);
      pointer(document, "pointermove", 220, 230);
      pointer(document, "pointerup", 220, 230);
    });
    expect(geometry()).toEqual({
      left: "20px",
      top: "30px",
      width: "200px",
      height: "200px",
    });
    act(() => {
      pointer(root().firstElementChild, "pointerdown", 40, 50);
      pointer(document, "pointermove", 60, 70);
      pointer(document, "pointerup", 60, 70);
    });
    expect(geometry().left).toBe("40px");
    act(() => {
      pointer(
        root().querySelector(".kt-screenshot-selection"),
        "pointerdown",
        240,
        250
      );
      pointer(document, "pointermove", 270, 280);
      pointer(document, "pointerup", 270, 280);
    });
    expect(geometry().width).toBe("230px");
  });
  test("resizes by dragging anywhere along each border and at a corner", () => {
    drag(100, 100, 300, 250);
    const selection = () => root().querySelector(".kt-screenshot-selection");

    drag(180, 100, 180, 80, selection());
    expect(geometry()).toMatchObject({ top: "80px", height: "170px" });

    drag(170, 250, 170, 270, selection());
    expect(geometry().height).toBe("190px");

    drag(100, 170, 80, 170, selection());
    expect(geometry()).toMatchObject({ left: "80px", width: "220px" });

    drag(300, 170, 330, 170, selection());
    expect(geometry().width).toBe("250px");

    drag(80, 80, 60, 60, selection());
    expect(geometry()).toMatchObject({
      left: "60px",
      top: "60px",
      width: "270px",
      height: "210px",
    });
  });

  test("keeps the original eight interactive resize handles", () => {
    drag(100, 100, 300, 250);
    const handles = root().querySelectorAll(".kt-screenshot-handle");
    expect(handles).toHaveLength(8);
    expect(root().querySelectorAll(".kt-screenshot-handle-decoration")).toHaveLength(0);
  });

  test("keeps the selection anchored to document coordinates while the page scrolls", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise(requestAnimationFrame);
    });
    expect(geometry().top).toBe("0px");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 60 });
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await new Promise(requestAnimationFrame);
    });
    expect(geometry().top).toBe("60px");
  });

  test("pointer cancellation keeps geometry without translating and releases gesture", async () => {
    await act(async () => button("menu").click());
    await flushCapture();
    const count = callbacks.onComplete.mock.calls.length;
    act(() => {
      pointer(root().firstElementChild, "pointerdown", 150, 150);
      pointer(document, "pointermove", 170, 180);
      pointer(document, "pointercancel", 170, 180);
    });
    expect(geometry().left).toBe("120px");
    await flushCapture();
    expect(callbacks.onComplete).toHaveBeenCalledTimes(count + 1);
    expect(callbacks.onComplete).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "update" })
    );
    drag(10, 10, 70, 80);
    expect(geometry().left).toBe("10px");
  });
  test("capture rejection is reported when the selected region is confirmed", async () => {
    const alert = jest.spyOn(window, "alert").mockImplementation(() => {});
    sendBgMsg.mockRejectedValueOnce(new Error("permission denied"));
    await act(async () => button("translate").click());
    await flushCapture();
    expect(alert).toHaveBeenCalledWith("permission denied");
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    expect(root()).not.toBeNull();
    alert.mockRestore();
  });

  test("coarse pointer gets touch hints and a wider draggable selection border", async () => {
    const previous = window.matchMedia;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    try {
      act(() => overlay.destroy());
      overlay = new ScreenshotOverlay({});
      await act(async () => overlay.start(callbacks));
      expect(root().textContent).toContain("拖动框选区域，可滚动页面扩展选区，点击 × 取消");
      expect(root().querySelector("button").style.minWidth).toBe("44px");
      drag(100, 120, 400, 280);
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
      drag(400, 200, 430, 200, root().querySelector(".kt-screenshot-selection"));
      expect(geometry().width).toBe("330px");
    } finally {
      window.matchMedia = previous;
    }
  });
  test("closing during a touch removes active document listeners", () => {
    act(() => {
      pointer(root().firstElementChild, "pointerdown", 20, 30);
      overlay.destroy();
      pointer(document, "pointermove", 220, 230);
      pointer(document, "pointerup", 220, 230);
    });
    expect(root()).toBeNull();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });

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
      Object.defineProperty(image, "naturalHeight", {
        value: window.innerHeight,
      });
      Object.defineProperty(image, "src", {
        get: () => "data:image/png;base64,capture",
        set: () => Promise.resolve().then(() => image.onload?.()),
      });
      return image;
    };
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({
        drawImage: jest.fn(),
        set imageSmoothingEnabled(_value) {},
        set imageSmoothingQuality(_value) {},
      })
    );
    jest.spyOn(window, "scrollTo").mockImplementation(() => {});
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
    HTMLCanvasElement.prototype.getContext.mockRestore();
    window.scrollTo.mockRestore();
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    document.documentElement.removeAttribute("style");
    document.body.removeAttribute("style");
  });

  test("uses the live page as the screenshot background and keeps the selection overlay", () => {
    expect(root().querySelector(".kt-screenshot-background")).toBeNull();
    expect(root().querySelector("img")).toBeNull();
    expect(root().querySelector(".kt-screenshot-selection").children).toHaveLength(0);
    expect(root().querySelector(".kt-screenshot-mask").style.clipPath).toContain(
      "polygon(evenodd"
    );
    expect(root().style.touchAction).toBe("pan-x pan-y");
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
      act(() => mouse(root().firstElementChild, "pointerdown", 150, 150));
      act(() => {
        mouse(document, "pointermove", 160, 160);
        mouse(document, "pointermove", 180, 190);
        mouse(document, "pointermove", 200, 210);
      });
      expect(request).toHaveBeenCalledTimes(1);
      act(() => paint());
      expect(geometry()).toMatchObject({ left: "150px", top: "180px" });
      act(() => mouse(document, "pointermove", 220, 230));
      expect(request).toHaveBeenCalledTimes(2);
      act(() => {
        mouse(document, "pointermove", 150, 150);
        mouse(document, "pointerup", 150, 150);
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
        mouse(root().firstElementChild, "pointerdown", 500, 400);
        mouse(document, "pointermove", 700, 600);
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
      root().querySelector(".kt-screenshot-selection")
    );
    const selection = { ...geometry() };
    await act(async () => button("download").click());
    await flushCapture();
    expect(cropAndCompressImage).toHaveBeenLastCalledWith(
      expect.any(HTMLCanvasElement),
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
        dpr: 1,
        maxEdge: 4096,
      })
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
    drag(10, 10, 80, 80);
    let finish;
    cropAndCompressImage.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const selection = geometry();
    act(() => button("download").click());
    await flushCapture();
    const cropCount = cropAndCompressImage.mock.calls.length;
    act(() => button("download").click());
    drag(10, 10, 80, 80);
    expect(cropAndCompressImage).toHaveBeenCalledTimes(cropCount);
    expect(geometry()).toEqual(selection);
    act(() => button("cancel").click());
    await act(async () => finish({ blob: new Blob(["old image"]) }));
    expect(downloadImageBlob).not.toHaveBeenCalled();
  });

  test("reports a download failure with an alert and keeps the selection", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    drag(10, 10, 80, 80);
    cropAndCompressImage.mockRejectedValueOnce(new Error("export failed"));
    const selection = geometry();
    await act(async () => button("download").click());
    await flushCapture();
    expect(alertMock).toHaveBeenCalledWith("export failed");
    expect(root()).not.toBeNull();
    expect(button("download").disabled).toBe(false);
    expect(geometry()).toEqual(selection);
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    alertMock.mockRestore();
  });

  test("shows the localized message when JPEG encoding fails", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    drag(10, 10, 80, 80);
    cropAndCompressImage.mockRejectedValueOnce(
      Object.assign(new Error("encoding failed"), {
        code: "IMAGE_ENCODE_FAILED",
      })
    );
    await act(async () => button("download").click());
    await flushCapture();
    expect(alertMock).toHaveBeenCalledWith("无法压缩截图，请重试");
    alertMock.mockRestore();
  });

  test("retains all five buttons and excluded regions after opening the dialog", async () => {
    expect(root().matches(KISS_UI_SELECTOR)).toBe(true);
    await act(async () => button("layout").click());
    await flushCapture();
    act(() =>
      root()
        .querySelectorAll("polygon")[1]
        .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    );
    await act(async () => button("translate").click());
    await flushCapture();
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
    sendBgMsg
      .mockResolvedValueOnce({ dataUrl: "data:image/png;base64,capture" })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
    await act(async () => button("layout").click());
    await flushCapture();
    const previous = geometry();
    expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
    drag(150, 150, 180, 180);
    drag(500, 500, 700, 700);
    expect(geometry()).toEqual(previous);
    await act(async () =>
      finish({ success: true, result: { layout: { regions } } })
    );
    expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
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
      root().querySelector(".kt-screenshot-selection")
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
    await flushCapture();
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
      mouse(root().firstElementChild, "pointerdown", 150, 170);
      mouse(document, "pointerup", 150, 170);
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
    await flushCapture();
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
      sendBgMsg
        .mockResolvedValueOnce({ dataUrl: "data:image/png;base64,capture" })
        .mockReturnValueOnce(
          new Promise((resolve) => {
            finish = resolve;
          })
        );
      await act(async () => button("layout").click());
      await flushCapture();
      act(() => {
        if (entry === "button") button("layout").click();
        else overlay.setLayoutState(null);
      });
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
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
    await flushCapture();
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

  test("allows page scrolling while screenshot mode is active", async () => {
    document.documentElement.style.setProperty("overflow-y", "scroll", "important");
    document.body.style.setProperty("overflow-x", "clip");
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    const key = new KeyboardEvent("keydown", {
      key: "PageDown",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);

    act(() => window.dispatchEvent(new Event("scroll")));
    expect(document.documentElement.style.overflowY).toBe("scroll");
    expect(document.body.style.overflowX).toBe("clip");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(root()).toBeNull();
    expect(document.documentElement.style.overflowY).toBe("scroll");
    expect(document.body.style.overflowX).toBe("clip");
  });

  test("failed analysis and crop unlock the same selection for retry", async () => {
    const alertMock = jest.spyOn(window, "alert").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const previous = geometry();
      sendBgMsg
        .mockResolvedValueOnce({ dataUrl: "data:image/png;base64,capture" })
        .mockResolvedValueOnce({
          success: false,
          error: "analysis failed",
        });
      await act(async () => button("layout").click());
      await flushCapture();
      expect(alertMock).toHaveBeenLastCalledWith("analysis failed");
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
      cropAndCompressImage.mockRejectedValueOnce(new Error("crop failed"));
      await act(async () => button("translate").click());
      await flushCapture();
      expect(alertMock).toHaveBeenLastCalledWith("crop failed");
      expect(geometry()).toEqual(previous);
      expect(root().querySelectorAll(".kt-screenshot-handle")).toHaveLength(0);
      expect(callbacks.onCancel).not.toHaveBeenCalled();
      await act(async () => button("menu").click());
      await flushCapture();
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
      act(() => mouse(root().firstElementChild, "pointerdown", 150, 150));
      act(() => {
        if (event === "resize") window.dispatchEvent(new Event("resize"));
        else
          root().firstElementChild.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
          );
      });
      expect(root()).toBeNull();
      expect(document.documentElement.style.overflowY).toBe("");
      act(() => mouse(document, "pointermove", 200, 200));
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
