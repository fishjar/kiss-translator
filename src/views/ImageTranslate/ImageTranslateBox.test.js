/* eslint-disable testing-library/no-unnecessary-act, testing-library/no-render-in-setup -- These tests use React DOM directly, which requires act and explicit root setup. */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ImageTranslateBox from "./ImageTranslateBox";
import ImageTranslateHeader from "./ImageTranslateHeader";
import ImageTranslateContent from "./ImageTranslateContent";
import { sendBgMsg } from "../../libs/msg";
import { MSG_IMAGE_TRANSLATE_EXECUTE } from "../../config/msg";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.crypto = require("crypto").webcrypto;

jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
let mockProgressListener;
jest.mock("../../libs/browser", () => ({
  browser: {
    runtime: {
      onMessage: {
        addListener: (listener) => {
          mockProgressListener = listener;
        },
        removeListener: (listener) => {
          if (mockProgressListener === listener) mockProgressListener = null;
        },
      },
    },
  },
}));
jest.mock("./ImageTranslateHeader", () => jest.fn(() => null));
jest.mock("./ImageTranslateContent", () => jest.fn(() => null));
jest.mock("../Selection/DraggableResizable", () => {
  const React = require("react");
  return ({ header, children }) =>
    React.createElement("div", null, header, children);
});

describe("ImageTranslateBox staged actions", () => {
  let root;
  let container;
  let props;
  const header = () => ImageTranslateHeader.mock.calls.slice(-1)[0][0];
  const content = () => ImageTranslateContent.mock.calls.slice(-1)[0][0];
  const regions = [{ order: 0, enabled: true, bbox: [0, 0, 100, 50] }];
  const scene = {
    layoutApiSlug: "layout",
    recognitionService: { apiSlug: "ocr", capability: "recognizeText" },
  };

  beforeEach(() => {
    sendBgMsg.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      showBox: true,
      imageDataUrl: "data:image/png;base64,test",
      requestVersion: 1,
      selectedRegions: regions,
      setting: { imageTranslateSetting: scene },
      onLayoutDetected: jest.fn(),
      onSettingResetLayout: jest.fn(),
      updateSetting: jest.fn(),
      onTaskStateChange: jest.fn(),
    };
    act(() => root.render(<ImageTranslateBox {...props} />));
    sendBgMsg.mockClear();
  });

  test("reports task locking through completion and cancellation and blocks actions while the source is being cropped", async () => {
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => {
      void header().onRunAction("recognize");
    });
    expect(props.onTaskStateChange).toHaveBeenLastCalledWith({
      busy: true,
      requestVersion: 1,
    });
    act(() => header().onCancel());
    expect(props.onTaskStateChange).toHaveBeenLastCalledWith({
      busy: false,
      requestVersion: 1,
    });
    await act(async () => finish({ success: true, result: { items: [] } }));
    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: { layout: { regions } },
    });
    await act(async () => header().onRunAction("layout"));
    expect(props.onTaskStateChange).toHaveBeenLastCalledWith({
      busy: false,
      requestVersion: 1,
    });
    act(() => root.render(<ImageTranslateBox {...props} sourceBusy />));
    expect(header().busy).toBe(true);
    const count = sendBgMsg.mock.calls.length;
    await act(async () => header().onRunAction("all"));
    expect(sendBgMsg).toHaveBeenCalledTimes(count);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const progress = (taskId, sequence, args) => {
    act(() =>
      mockProgressListener({
        action: "image_translate_progress",
        args: { taskId, sequence, ...args },
      })
    );
  };

  test("shows layout and partial originals during inference, rejects out-of-order and post-completion progress", async () => {
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => {
      void header().onRunAction("all");
    });
    const taskId = sendBgMsg.mock.calls[0][1].taskId;
    progress(taskId, 1, {
      stage: "recognize",
      current: 0,
      total: 2,
      layout: { regions },
      items: [],
    });
    expect(props.onLayoutDetected).toHaveBeenCalledWith(regions);
    expect(header().busy).toBe(true);
    progress(taskId, 3, {
      stage: "recognize",
      current: 1,
      total: 2,
      items: [{ original: "First", translation: "" }],
    });
    expect(content().items[0].original).toBe("First");
    expect(header().recognitionProgress).toEqual({ current: 1, total: 2 });
    progress(taskId, 2, {
      stage: "recognize",
      current: 0,
      total: 2,
      items: [],
    });
    expect(content().items).toHaveLength(1);
    expect(header().recognitionProgress.current).toBe(1);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({
        success: true,
        result: { items: [{ original: "First", translation: "译文" }] },
      })
    );
    progress(taskId, 99, {
      stage: "recognize",
      items: [{ original: "late", translation: "" }],
    });
    expect(content().items[0].translation).toBe("译文");
    expect(header().busy).toBe(false);
  });

  test.each(["cancel", "failure"])(
    "retains already displayed originals after %s and ignores late progress",
    async (ending) => {
      let finish;
      sendBgMsg.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      act(() => {
        void header().onRunAction("recognize");
      });
      const taskId = sendBgMsg.mock.calls[0][1].taskId;
      progress(taskId, 1, {
        stage: "recognize",
        current: 1,
        total: 2,
        items: [{ original: "First", translation: "" }],
      });
      if (ending === "cancel") act(() => header().onCancel());
      await act(async () =>
        finish({ success: false, error: "inference failed" })
      );
      progress(taskId, 99, { stage: "recognize", items: [] });
      expect(content().items[0].original).toBe("First");
      expect(header().busy).toBe(false);
      expect(content().error).toBe(
        ending === "failure" ? "inference failed" : ""
      );
    }
  );

  test("changing the source clears partial originals and rejects the previous task progress", async () => {
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => {
      void header().onRunAction("recognize");
    });
    const taskId = sendBgMsg.mock.calls[0][1].taskId;
    progress(taskId, 1, { stage: "recognize", items: [{ original: "old" }] });
    act(() =>
      root.render(
        <ImageTranslateBox
          {...props}
          requestVersion={2}
          imageDataUrl="data:image/png;base64,new"
        />
      )
    );
    progress(taskId, 2, { stage: "recognize", items: [{ original: "late" }] });
    await act(async () =>
      finish({ success: true, result: { items: [{ original: "late" }] } })
    );
    expect(content().items).toEqual([]);
    expect(header().busy).toBe(false);
  });

  test("retains partial recognition errors through translation and clears them on a new recognition", async () => {
    const recognitionErrors = [
      { order: 2, error: "RPC timed out" },
      { order: 3, error: "empty output" },
    ];
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => {
      void header().onRunAction("all");
    });
    const taskId = sendBgMsg.mock.calls[0][1].taskId;
    const items = [
      { original: "First", translation: "译一" },
      { original: "Second", translation: "译二" },
    ];
    progress(taskId, 1, {
      stage: "recognize",
      current: 4,
      total: 4,
      items,
      recognitionErrors,
    });
    expect(content().recognitionErrors).toEqual(recognitionErrors);
    await act(async () =>
      finish({ success: true, result: { items, recognitionErrors } })
    );
    expect(content().items).toHaveLength(2);
    expect(content().recognitionErrors).toEqual(recognitionErrors);
    sendBgMsg.mockResolvedValueOnce({ success: true, result: { items } });
    await act(async () => header().onRunAction("translate"));
    expect(content().recognitionErrors).toEqual(recognitionErrors);
    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: { items, recognitionErrors: [] },
    });
    await act(async () => header().onRunAction("recognize"));
    expect(content().recognitionErrors).toEqual([]);
  });

  test("shows source preparation immediately and starts automatic translation only when the image is ready", async () => {
    const onCancelSource = jest.fn();
    const pendingProps = {
      ...props,
      requestVersion: 2,
      imageDataUrl: null,
      sourceBusy: true,
      initialAutoTranslate: false,
      onCancelSource,
    };
    act(() => root.render(<ImageTranslateBox {...pendingProps} />));
    expect(header().busy).toBe(true);
    expect(header().stage).toBe("reading");
    expect(sendBgMsg).not.toHaveBeenCalled();
    act(() => header().onCancel());
    expect(onCancelSource).toHaveBeenCalledTimes(1);
    sendBgMsg.mockResolvedValue({ success: true, result: { items: [] } });
    await act(async () =>
      root.render(
        <ImageTranslateBox
          {...pendingProps}
          sourceBusy={false}
          imageDataUrl="data:image/png;base64,ready"
          initialAutoTranslate
        />
      )
    );
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    expect(sendBgMsg).toHaveBeenCalledWith(
      MSG_IMAGE_TRANSLATE_EXECUTE,
      expect.objectContaining({
        action: "all",
        dataUrl: "data:image/png;base64,ready",
      })
    );
  });

  test("displays source read errors with a source retry action", () => {
    const onRetrySource = jest.fn();
    act(() =>
      root.render(
        <ImageTranslateBox
          {...props}
          sourceError="read failed"
          onRetrySource={onRetrySource}
        />
      )
    );
    expect(content().error).toBe("read failed");
    act(() => content().onRetry());
    expect(onRetrySource).toHaveBeenCalledTimes(1);
    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test("hiding and restoring keeps an in-flight task and its results", async () => {
    let finish;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    act(() => {
      void header().onRunAction("all");
    });
    act(() => root.render(<ImageTranslateBox {...props} boxVisible={false} />));
    expect(container.firstElementChild.style.display).toBe("none");
    expect(header().busy).toBe(true);
    await act(async () =>
      finish({
        success: true,
        result: { items: [{ original: "source", translation: "译文" }] },
      })
    );
    expect(content().items[0].translation).toBe("译文");
    act(() => root.render(<ImageTranslateBox {...props} boxVisible />));
    expect(container.firstElementChild.style.display).toBe("contents");
    expect(content().items[0].translation).toBe("译文");
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
  });

  test("layout runs separately every time, immediately clears text, and supplies the next recognition layout", async () => {
    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: {
        items: [{ original: "old source", translation: "old translation" }],
      },
    });
    await act(async () => header().onRunAction("all"));
    expect(content().items[0].translation).toBe("old translation");

    let resolveLayout;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLayout = resolve;
      })
    );
    act(() => {
      void header().onRunAction("layout");
    });
    expect(content().items).toEqual([]);
    expect(header().busy).toBe(true);
    expect(header().stage).toBe("layout");
    expect(props.onSettingResetLayout).toHaveBeenCalledTimes(1);
    expect(sendBgMsg).toHaveBeenLastCalledWith(
      MSG_IMAGE_TRANSLATE_EXECUTE,
      expect.objectContaining({
        action: "layout",
        items: undefined,
        selectedRegions: undefined,
      })
    );
    const newRegions = [{ ...regions[0], bbox: [0, 0, 200, 100] }];
    await act(async () =>
      resolveLayout({
        success: true,
        result: { layout: { regions: newRegions } },
      })
    );
    expect(props.onLayoutDetected).toHaveBeenLastCalledWith(newRegions, {
      replace: true,
    });
    expect(content().items).toEqual([]);
    expect(content().hasExecuted).toBe(false);

    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: { items: [{ original: "new source" }] },
    });
    await act(async () => header().onRunAction("recognize"));
    expect(sendBgMsg).toHaveBeenLastCalledWith(
      MSG_IMAGE_TRANSLATE_EXECUTE,
      expect.objectContaining({
        action: "recognize",
        selectedRegions: newRegions,
      })
    );
    expect(content().items[0].translation).toBe("");

    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: { layout: { regions } },
    });
    await act(async () => header().onRunAction("layout"));
    expect(props.onSettingResetLayout).toHaveBeenCalledTimes(2);
    expect(content().items).toEqual([]);
  });

  test("OCR and language changes retain layout, while analysis service changes invalidate it", async () => {
    sendBgMsg.mockResolvedValueOnce({
      success: true,
      result: { items: [{ original: "source" }] },
    });
    await act(async () => header().onRunAction("recognize"));
    act(() =>
      header().onSettingChange({
        ...scene,
        recognitionService: {
          apiSlug: "other-ocr",
          capability: "recognizeText",
        },
      })
    );
    expect(content().items).toEqual([]);
    expect(props.onSettingResetLayout).not.toHaveBeenCalled();
    expect(content().hasExecuted).toBe(false);
    act(() => header().onSettingChange({ ...scene, fromLang: "en" }));
    expect(props.onSettingResetLayout).not.toHaveBeenCalled();
    act(() =>
      header().onSettingChange({ ...scene, layoutApiSlug: "other-layout" })
    );
    expect(props.onSettingResetLayout).toHaveBeenCalledTimes(1);
  });

  test("layout failure retries layout and ignores a cancelled late result", async () => {
    sendBgMsg.mockResolvedValueOnce({ success: false, error: "layout failed" });
    await act(async () => header().onRunAction("layout"));
    expect(content().error).toBe("layout failed");
    let resolveLayout;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLayout = resolve;
      })
    );
    act(() => {
      void content().onRetry();
    });
    expect(sendBgMsg).toHaveBeenLastCalledWith(
      MSG_IMAGE_TRANSLATE_EXECUTE,
      expect.objectContaining({ action: "layout" })
    );
    act(() => header().onCancel());
    await act(async () =>
      resolveLayout({ success: true, result: { layout: { regions } } })
    );
    expect(props.onLayoutDetected).not.toHaveBeenCalled();
    expect(content().items).toEqual([]);
  });

  test("shows VLM processing errors and clears the old error when changing recognition service", async () => {
    act(() =>
      header().onSettingChange({
        ...scene,
        recognitionService: { apiSlug: "vlm", capability: "parseImage" },
      })
    );
    expect(content().hasExecuted).toBe(false);
    sendBgMsg.mockResolvedValueOnce({
      success: false,
      error: "VLM crop failed",
    });
    await act(async () => header().onRunAction("recognize"));
    expect(content().error).toBe("VLM crop failed");
    act(() => header().onSettingChange(scene));
    expect(content().error).toBe("");
    expect(content().hasExecuted).toBe(false);
    expect(props.onSettingResetLayout).not.toHaveBeenCalled();
  });

  test("changing selected regions discards an in-flight result for the old selection", async () => {
    let resolveRecognition;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecognition = resolve;
      })
    );
    act(() => {
      void header().onRunAction("all");
    });
    act(() =>
      root.render(
        <ImageTranslateBox
          {...props}
          selectedRegions={[{ ...regions[0], enabled: false }]}
        />
      )
    );
    await act(async () =>
      resolveRecognition({
        success: true,
        result: {
          items: [
            { original: "old selection", translation: "stale translation" },
          ],
          layout: { regions },
        },
      })
    );
    expect(content().items).toEqual([]);
    expect(props.onLayoutDetected).not.toHaveBeenCalled();
    expect(header().busy).toBe(false);
  });

  test("resetting the parent selection during manual analysis does not cancel analysis itself", async () => {
    function ConnectedBox() {
      const [selected, setSelected] = React.useState(regions);
      return (
        <ImageTranslateBox
          {...props}
          selectedRegions={selected}
          onSettingResetLayout={() => setSelected(null)}
          onLayoutDetected={(next, { replace }) => {
            if (replace) setSelected(next);
          }}
        />
      );
    }
    act(() => root.render(<ConnectedBox />));
    sendBgMsg.mockClear();
    let resolveLayout;
    sendBgMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveLayout = resolve;
      })
    );
    act(() => {
      void header().onRunAction("layout");
    });
    expect(header().busy).toBe(true);
    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveLayout({ success: true, result: { layout: { regions } } })
    );
    expect(header().busy).toBe(false);
    sendBgMsg.mockResolvedValueOnce({ success: true, result: { items: [] } });
    await act(async () => header().onRunAction("recognize"));
    expect(sendBgMsg).toHaveBeenLastCalledWith(
      MSG_IMAGE_TRANSLATE_EXECUTE,
      expect.objectContaining({ action: "recognize", selectedRegions: regions })
    );
  });
});
