/**
 * @file imageTranslateManager.test.js
 * @description ImageTranslateManager 单元测试。
 */

import { act } from "react";
import { APP_CONSTS } from "../../config/app";
import { MSG_IMAGE_SCREENSHOT } from "../../config/msg";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.crypto = require("crypto").webcrypto;

const mockAddListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockReadImage = jest.fn();
const mockSendBgMsg = jest.fn();
let mockRealScreenshot = false;

jest.mock("./imageReader", () => ({
  readImageAsBlob: (...args) => mockReadImage(...args),
  blobToDataUrl: async () => "data:image/png;base64,test",
}));

jest.mock("../msg", () => ({
  sendBgMsg: (...args) => mockSendBgMsg(...args),
}));

jest.mock("../browser", () => ({
  browser: {
    runtime: {
      onMessage: {
        addListener: (...args) => mockAddListener(...args),
        removeListener: (...args) => mockRemoveListener(...args),
      },
    },
  },
}));

jest.mock("../../views/ImageTranslate", () => {
  const React = require("react");
  return jest.fn((props) =>
    React.createElement("div", {
      "data-testid": "image-translate-box",
      "data-show": String(props.showBox),
    })
  );
});

const mockStart = jest.fn(({ onComplete }) => {
  onComplete?.({ blob: new Blob(["dummy"]), action: "all" });
});
const mockDestroy = jest.fn();
const mockSetScreenshotLayout = jest.fn();
const mockSetScreenshotTask = jest.fn();

jest.mock("./screenshotOverlay", () => {
  return {
    ScreenshotOverlay: function () {
      if (mockRealScreenshot) {
        return new (jest.requireActual(
          "./screenshotOverlay"
        ).ScreenshotOverlay)(...arguments);
      }
      this.start = mockStart;
      this.destroy = mockDestroy;
      this.setLayoutState = mockSetScreenshotLayout;
      this.setTaskState = mockSetScreenshotTask;
    },
  };
});

const { ImageTranslateManager } = require("./imageTranslateManager");

describe("ImageTranslateManager", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockAddListener.mockClear();
    mockRemoveListener.mockClear();
    mockReadImage.mockReset().mockResolvedValue({ blob: new Blob(["image"]) });
    mockSendBgMsg.mockReset();
    mockRealScreenshot = false;
    mockStart.mockReset();
    mockStart.mockImplementation(({ onComplete }) => {
      onComplete?.({ blob: new Blob(["dummy"]), action: "all" });
    });
  });

  test("synchronizes screenshot layout, selection, busy state and exit with the popup", async () => {
    let manager;
    const regions = [{ order: 0, enabled: false, bbox: [0, 0, 50, 50] }];
    await act(async () => {
      manager = new ImageTranslateManager({
        setting: {},
        rule: {},
        isIframe: false,
      });
      return manager.startScreenshot();
    });
    const callbacks = mockStart.mock.calls.slice(-1)[0][0];
    const boxProps = () =>
      require("../../views/ImageTranslate").mock.calls.slice(-1)[0][0];
    const firstProps = boxProps();
    act(() => firstProps.onLayoutDetected(regions, { replace: true }));
    expect(mockSetScreenshotLayout).toHaveBeenLastCalledWith(regions, true);
    act(() => boxProps().onSettingResetLayout());
    expect(mockSetScreenshotLayout).toHaveBeenLastCalledWith(null);
    act(() => callbacks.onLayoutChange(regions));
    expect(boxProps().selectedRegions).toEqual(regions);
    act(() => callbacks.onLayoutStart());
    expect(boxProps().selectedRegions).toBeNull();
    expect(boxProps().imageBlob).not.toBeNull();
    const taskCalls = mockSetScreenshotTask.mock.calls.length;
    act(() =>
      firstProps.onTaskStateChange({
        busy: true,
        requestVersion: firstProps.requestVersion,
      })
    );
    expect(mockSetScreenshotTask).toHaveBeenCalledTimes(taskCalls);
    act(() =>
      boxProps().onTaskStateChange({
        busy: true,
        requestVersion: boxProps().requestVersion,
      })
    );
    expect(mockSetScreenshotTask).toHaveBeenLastCalledWith(true);
    act(() => callbacks.onSelectionChange());
    expect(boxProps().imageBlob).toBeNull();
    expect(boxProps().sourceBusy).toBe(true);
    act(() =>
      callbacks.onComplete({
        action: "update",
        blob: new Blob(["new crop"]),
        selectedRegions: null,
      })
    );
    expect(boxProps().initialAutoTranslate).toBe(false);
    expect(boxProps().imageBlob).not.toBeNull();
    expect(boxProps().sourceBusy).toBe(false);
    act(() => callbacks.onCancel());
    expect(boxProps().showBox).toBe(false);
    act(() =>
      callbacks.onComplete({ action: "all", blob: new Blob(["stale"]) })
    );
    expect(boxProps().showBox).toBe(false);
    act(() => manager.destroy());
  });

  describe("layout state across translation", () => {
    const regions = [
      { order: 0, bbox: [0, 0, 200, 50], enabled: true },
      { order: 1, bbox: [0, 60, 200, 100], enabled: true },
    ];
    const setting = {
      uiLang: "zh",
      imageTranslateSetting: { layoutApiSlug: "layout" },
      transApis: [
        {
          apiSlug: "layout",
          provider: {
            apiVersion: 1,
            implementation: { kind: "native" },
            capabilities: { analyzeLayout: { coordinates: true } },
          },
        },
      ],
    };
    let manager;
    let image;
    let frameSpy;
    const hover = () =>
      image.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const button = (name) =>
      document.querySelector(`.kt-image-dual-btn--${name}`);
    const boxProps = () =>
      require("../../views/ImageTranslate").mock.calls.slice(-1)[0][0];
    const waitForRead = () =>
      act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const open = async (action) => {
      act(() => button(action).click());
      await waitForRead();
    };

    beforeEach(async () => {
      frameSpy = jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((callback) => {
          callback();
          return 1;
        });
      image = document.createElement("img");
      image.src = "https://example.com/image.png";
      Object.defineProperties(image, {
        complete: { value: true },
        naturalWidth: { value: 400 },
        naturalHeight: { value: 300 },
      });
      image.getBoundingClientRect = () => ({
        top: 100,
        left: 20,
        right: 420,
        bottom: 400,
        width: 400,
        height: 300,
      });
      document.body.appendChild(image);
      mockSendBgMsg.mockResolvedValue({
        success: true,
        result: { layout: { regions } },
      });
      act(() => {
        manager = new ImageTranslateManager({
          setting,
          rule: {},
          isIframe: false,
        });
        hover();
      });
      await act(async () => button("layout").click());
      expect(document.querySelectorAll("polygon")).toHaveLength(2);
    });

    afterEach(() => {
      act(() => manager.destroy());
      frameSpy.mockRestore();
    });

    test.each(["translate", "menu"])(
      "keeps outlines while %s waits for image data and hands off once",
      async (action) => {
        let resolveRead;
        mockReadImage.mockReturnValue(
          new Promise((resolve) => {
            resolveRead = resolve;
          })
        );
        act(() => {
          button(action).click();
          button(action).click();
        });
        expect(mockReadImage).toHaveBeenCalledTimes(1); // only analysis, before the first paint
        expect(document.querySelectorAll("polygon")).toHaveLength(2);
        expect(document.getElementById(APP_CONSTS.imageBoxID)).not.toBeNull();
        expect(boxProps().showBox).toBe(true);
        expect(boxProps().sourceBusy).toBe(true);
        expect(boxProps().initialAutoTranslate).toBe(false);
        await waitForRead();
        expect(mockReadImage).toHaveBeenCalledTimes(2);
        await act(async () => resolveRead({ blob: new Blob(["image"]) }));
        expect(
          document.querySelectorAll(".kt-image-layout-overlay")
        ).toHaveLength(1);
        expect(document.querySelectorAll("polygon")).toHaveLength(2);
        expect(boxProps().showBox).toBe(true);
        expect(boxProps().sourceBusy).toBe(false);
        expect(boxProps().initialAutoTranslate).toBe(action === "translate");
      }
    );

    test("retains disabled regions after translation, re-hover, and visibility toggles", async () => {
      act(() =>
        document
          .querySelectorAll("polygon")[1]
          .dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      await open("translate");
      expect(boxProps().selectedRegions[1].enabled).toBe(false);
      act(() => boxProps().onLayoutDetected(regions));
      expect(
        document.querySelectorAll("polygon")[1].getAttribute("stroke-dasharray")
      ).toBe("4 3");
      act(() => {
        document.getElementById(APP_CONSTS.imageBoxID).click();
        hover();
      });
      expect(button("layout").getAttribute("aria-pressed")).toBe("true");
      act(() => button("layout").click());
      expect(
        document.querySelector(".kt-image-manager-layout-root").style.display
      ).toBe("none");
      act(() => button("layout").click());
      expect(
        document.querySelector(".kt-image-manager-layout-root").style.display
      ).toBe("block");
      expect(mockSendBgMsg).toHaveBeenCalledTimes(1);
      act(() => manager.closeBox());
      expect(document.querySelectorAll("polygon")).toHaveLength(0);
      act(() => hover());
      expect(
        document.querySelectorAll("polygon")[1].getAttribute("stroke-dasharray")
      ).toBe("4 3");
    });

    test("preserves layout on OCR changes and invalidates it on layout service changes", async () => {
      await open("translate");
      act(() =>
        manager.updateSetting({
          ...setting,
          imageTranslateSetting: {
            ...setting.imageTranslateSetting,
            recognitionService: { apiSlug: "other-ocr" },
          },
        })
      );
      expect(button("layout").getAttribute("aria-pressed")).toBe("true");
      expect(document.querySelectorAll("polygon")).toHaveLength(2);
      act(() =>
        manager.updateSetting({
          ...setting,
          imageTranslateSetting: { layoutApiSlug: "other-layout" },
        })
      );
      expect(button("layout").getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelectorAll("polygon")).toHaveLength(0);
      expect(boxProps().selectedRegions).toBeNull();
      await act(async () => button("layout").click());
      expect(mockSendBgMsg).toHaveBeenCalledTimes(2);
    });

    test.each(["translate", "menu"])(
      "keeps the selection after a %s read failure and allows retry",
      async (action) => {
        mockReadImage.mockRejectedValueOnce(new Error("read failed"));
        await open(action);
        expect(boxProps().sourceError).toBe("read failed");
        expect(boxProps().sourceBusy).toBe(false);
        expect(document.querySelectorAll("polygon")).toHaveLength(2);
        act(() => boxProps().onRetrySource());
        await waitForRead();
        expect(boxProps().sourceError).toBe("");
        expect(boxProps().showBox).toBe(true);
        expect(boxProps().initialAutoTranslate).toBe(action === "translate");
      }
    );

    test("does not open a stale request after the image changes", async () => {
      let resolveRead;
      mockReadImage.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        })
      );
      act(() => button("translate").click());
      await waitForRead();
      act(() => manager.closeBox());
      await act(async () => resolveRead({ blob: new Blob(["image"]) }));
      expect(boxProps().showBox).toBe(false);
      expect(boxProps().imageBlob).toBeNull();
    });

    test("closing before the first paint skips image preparation", async () => {
      act(() => button("translate").click());
      act(() => boxProps().onCancelSource());
      await waitForRead();
      expect(mockReadImage).toHaveBeenCalledTimes(1);
      expect(boxProps().showBox).toBe(false);
    });

    test("menu hides and restores the same pending image without restarting preparation", async () => {
      let resolveRead;
      mockReadImage.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        })
      );
      await open("translate");
      const version = boxProps().requestVersion;
      act(() => button("menu").click());
      expect(boxProps().boxVisible).toBe(false);
      expect(boxProps().sourceBusy).toBe(true);
      await act(async () => resolveRead({ blob: new Blob(["image"]) }));
      expect(boxProps().boxVisible).toBe(false);
      expect(boxProps().initialAutoTranslate).toBe(true);
      act(() => button("menu").click());
      expect(boxProps().boxVisible).toBe(true);
      expect(boxProps().requestVersion).toBe(version);
      expect(mockReadImage).toHaveBeenCalledTimes(2); // analysis plus a single preparation
    });

    test.each(["menu", "translate", "layout", "hidden"])(
      "clears %s UI before screenshot capture and retains only cached layout",
      async (state) => {
        if (state !== "layout") await open(state === "hidden" ? "menu" : state);
        if (state === "hidden") act(() => button("menu").click());
        mockStart.mockImplementation(() => {
          const host = document.getElementById(APP_CONSTS.imageBoxID);
          expect(
            host?.shadowRoot.querySelector('[data-show="true"]') || null
          ).toBeNull();
          expect(
            document.querySelector(".kt-image-source-highlight")
          ).toBeNull();
          expect(document.querySelectorAll("polygon")).toHaveLength(0);
          expect(button("menu")).toBeNull();
        });
        let pending;
        act(() => {
          pending = manager.startScreenshot();
        });
        expect(mockStart).not.toHaveBeenCalled(); // capture must wait for a paint
        act(() => hover());
        expect(button("menu")).toBeNull();
        await act(async () => pending);
        expect(mockStart).toHaveBeenCalledTimes(1);
        act(() => manager.closeBox());
        expect(button("menu")).toBeNull();
        act(() => hover());
        expect(document.querySelectorAll("polygon")).toHaveLength(2);
        expect(mockSendBgMsg).toHaveBeenCalledTimes(1); // cached layout, no reanalysis
      }
    );

    test("switches to another image's layout and rejects the previous popup callbacks", async () => {
      await open("translate");
      const stale = boxProps();
      const other = image.cloneNode();
      Object.defineProperties(other, {
        complete: { value: true },
        naturalWidth: { value: 400 },
        naturalHeight: { value: 300 },
      });
      other.getBoundingClientRect = image.getBoundingClientRect;
      document.body.appendChild(other);
      act(() =>
        other.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      );
      await act(async () => button("layout").click());
      expect(boxProps().showBox).toBe(false);
      expect(document.querySelector(".kt-image-source-highlight")).toBeNull();
      act(() => {
        stale.onLayoutDetected(regions, { replace: true });
        stale.setShowBox(false);
      });
      expect(document.querySelectorAll("polygon")).toHaveLength(2);
      await open("menu");
      expect(boxProps().showBox).toBe(true);
      expect(
        document.querySelectorAll(".kt-image-source-highlight")
      ).toHaveLength(1);
      expect(document.querySelectorAll("polygon")).toHaveLength(2);
    });

    test("ignores an image read that finishes after screenshot startup", async () => {
      let resolveRead;
      mockReadImage.mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve;
        })
      );
      await open("translate");
      mockStart.mockImplementation(() => {});
      await act(async () => manager.startScreenshot());
      await act(async () => resolveRead({ blob: new Blob(["late image"]) }));
      expect(boxProps().showBox).toBe(false);
      expect(boxProps().imageBlob).toBeNull();
      expect(button("menu")).toBeNull();
    });

    test("cancels pending hover analysis when screenshot starts and ignores its late result", async () => {
      act(() =>
        manager.updateSetting({
          ...setting,
          imageTranslateSetting: { layoutApiSlug: "replacement" },
        })
      );
      let finishAnalysis;
      mockSendBgMsg.mockImplementation((message) =>
        message === "image_translate_execute"
          ? new Promise((resolve) => {
              finishAnalysis = resolve;
            })
          : Promise.resolve({})
      );
      act(() => button("layout").click());
      await waitForRead();
      const taskId = mockSendBgMsg.mock.calls.slice(-1)[0][1].taskId;
      mockStart.mockImplementation(() => {});
      await act(async () => manager.startScreenshot());
      expect(mockSendBgMsg).toHaveBeenLastCalledWith("image_translate_cancel", {
        taskId,
      });
      await act(async () =>
        finishAnalysis({ result: { layout: { regions } } })
      );
      expect(button("menu")).toBeNull();
      expect(document.querySelectorAll("polygon")).toHaveLength(0);
    });
  });

  test("only the latest screenshot startup survives the paint wait, and image startup invalidates its callbacks", async () => {
    const manager = new ImageTranslateManager({
      setting: {},
      rule: {},
      isIframe: false,
    });
    mockStart.mockImplementation(() => {});
    await act(async () => {
      await Promise.all([manager.startScreenshot(), manager.startScreenshot()]);
    });
    expect(mockStart).toHaveBeenCalledTimes(1);
    const stale = mockStart.mock.calls[0][0];
    act(() => manager.openBox({ blob: new Blob(["new image"]) }));
    const view = require("../../views/ImageTranslate");
    const props = () => view.mock.calls.slice(-1)[0][0];
    const version = props().requestVersion;
    act(() => {
      stale.onComplete({ blob: new Blob(["late crop"]), action: "all" });
      stale.onLayoutChange([{ enabled: true }]);
      stale.onCancel();
    });
    expect(props().requestVersion).toBe(version);
    expect(props().showBox).toBe(true);
    let pending;
    act(() => {
      pending = manager.startScreenshot();
      manager.destroy();
    });
    await act(async () => pending);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(document.getElementById(APP_CONSTS.imageBoxID)).toBeNull();
  });

  test.each(["cancel", "image", "destroy"])(
    "pauses the FAB before capture, retains suspension across restarts, and restores on %s",
    async (exit) => {
      const onScreenshotSessionChange = jest.fn();
      const manager = new ImageTranslateManager({
        setting: {},
        rule: {},
        isIframe: false,
        onScreenshotSessionChange,
      });
      mockStart.mockImplementation(() => {
        expect(onScreenshotSessionChange).toHaveBeenLastCalledWith(true);
      });
      await act(async () => manager.startScreenshot());
      const stale = mockStart.mock.calls[0][0];
      await act(async () => manager.startScreenshot());
      expect(onScreenshotSessionChange.mock.calls).toEqual([[true]]);
      act(() => stale.onCancel());
      expect(onScreenshotSessionChange.mock.calls).toEqual([[true]]);
      act(() => {
        if (exit === "cancel") mockStart.mock.calls[1][0].onCancel();
        if (exit === "image") manager.openBox({ blob: new Blob(["image"]) });
        if (exit === "destroy") manager.destroy();
      });
      expect(onScreenshotSessionChange.mock.calls).toEqual([[true], [false]]);
      if (exit !== "destroy") act(() => manager.destroy());
    }
  );

  test("restores the FAB after actual screenshot capture failure", async () => {
    mockRealScreenshot = true;
    const onScreenshotSessionChange = jest.fn();
    const manager = new ImageTranslateManager({
      setting: {},
      rule: {},
      isIframe: false,
      onScreenshotSessionChange,
    });
    let failCapture;
    mockSendBgMsg.mockReturnValue(
      new Promise((resolve) => {
        failCapture = resolve;
      })
    );
    await act(async () => manager.startScreenshot());
    expect(onScreenshotSessionChange.mock.calls).toEqual([[true]]);
    await act(async () => failCapture({}));
    expect(onScreenshotSessionChange.mock.calls).toEqual([[true], [false]]);
    act(() => manager.destroy());
  });

  test("the actual capture boundary observes cleared UI and late capture cannot recreate an exited session", async () => {
    mockRealScreenshot = true;
    const manager = new ImageTranslateManager({
      setting: {},
      rule: {},
      isIframe: false,
    });
    act(() => manager.openBox({ blob: new Blob(["image"]) }));
    let finishCapture;
    mockSendBgMsg.mockImplementation(() => {
      const host = document.getElementById(APP_CONSTS.imageBoxID);
      expect(host.shadowRoot.querySelector('[data-show="true"]')).toBeNull();
      expect(
        document.querySelector(
          ".kt-image-source-highlight, .kt-image-manager-layout-root, .kt-screenshot-overlay-root"
        )
      ).toBeNull();
      expect(
        document.querySelector(".kt-image-hover-root").childElementCount
      ).toBe(0);
      return new Promise((resolve) => {
        finishCapture = resolve;
      });
    });
    await act(async () => manager.startScreenshot());
    expect(mockSendBgMsg).toHaveBeenCalledTimes(1);
    act(() => manager.closeBox());
    await act(async () =>
      finishCapture({ dataUrl: "data:image/png;base64,late" })
    );
    expect(document.querySelector(".kt-screenshot-overlay-root")).toBeNull();
    act(() => manager.destroy());
  });

  test("initializes without mounting container until openBox is called", () => {
    let manager;
    act(() => {
      manager = new ImageTranslateManager({
        setting: { uiLang: "zh" },
        rule: {},
        isIframe: false,
      });
    });

    expect(document.getElementById(APP_CONSTS.imageBoxID)).toBeNull();

    act(() => {
      manager.openBox({ blob: new Blob(["test"]), autoTranslate: true });
    });

    const host = document.getElementById(APP_CONSTS.imageBoxID);
    expect(host).not.toBeNull();
    expect(host.shadowRoot).not.toBeNull();

    act(() => {
      manager.closeBox();
    });

    // 弹框关闭后宿主仍在，等待下次打开或 destroy
    expect(document.getElementById(APP_CONSTS.imageBoxID)).not.toBeNull();

    act(() => {
      manager.destroy();
    });

    expect(document.getElementById(APP_CONSTS.imageBoxID)).toBeNull();
  });

  test("startScreenshot starts screenshot overlay and opens box upon completion", async () => {
    let manager;
    act(() => {
      manager = new ImageTranslateManager({
        setting: { uiLang: "zh" },
        rule: {},
        isIframe: false,
      });
    });

    await act(async () => {
      return manager.startScreenshot();
    });

    // 截图完成回调会触发 openBox
    expect(document.getElementById(APP_CONSTS.imageBoxID)).not.toBeNull();

    act(() => {
      manager.destroy();
    });
  });

  test("does not initialize overlays or listen to messages in iframes", async () => {
    let manager;
    act(() => {
      manager = new ImageTranslateManager({
        setting: { uiLang: "zh" },
        rule: {},
        isIframe: true,
      });
    });

    expect(mockAddListener).not.toHaveBeenCalled();

    await act(async () => {
      return manager.startScreenshot();
    });

    expect(document.getElementById(APP_CONSTS.imageBoxID)).toBeNull();

    act(() => {
      manager.destroy();
    });
  });
});
