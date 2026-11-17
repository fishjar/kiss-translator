/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  EVENT_KISS_INNER,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
} from "../config";
import { useTouchState } from "./useTouchTranslateState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/msg", () => ({ sendTabMsg: jest.fn() }));

const mockSave = jest.fn();
jest.mock("./MouseHover", () => ({
  useMouseHoverSetting: () => ({ updateMouseHoverSetting: mockSave }),
}));

describe("useTouchState contract", () => {
  let container;
  let root;
  let latest;
  let dispatch;

  function Probe() {
    latest = useTouchState(dispatch);
    return null;
  }

  beforeEach(() => {
    mockSave.mockReset();
    latest = undefined;
    dispatch = jest.fn(async ({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "off",
        direction: args?.direction || "left",
        supported: true,
      },
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const mount = async () => {
    await act(async () => {
      root.render(<Probe />);
    });
  };

  test("reads the page state on mount without persisting anything", async () => {
    await mount();

    expect(dispatch).toHaveBeenCalledWith({
      action: MSG_TOUCH_TRANSLATE_STATE,
      args: undefined,
    });
    expect(mockSave).not.toHaveBeenCalled();
    expect(latest.state).toMatchObject({ mode: "off", supported: true });
    expect(latest.failed).toBe(false);
    expect(latest.saveFailed).toBe(false);
  });

  test("persists a confirmed swipe mode with both direction keys", async () => {
    await mount();

    await act(async () => {
      await latest.change("swipe", "left");
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      action: MSG_TOUCH_TRANSLATE_MODE_SET,
      args: { mode: "swipe", direction: "left" },
    });
    expect(mockSave).toHaveBeenCalledWith({
      touchMode: "swipe",
      touchDirection: "left",
    });
    expect(latest.state).toMatchObject({ mode: "swipe", direction: "left" });
    expect(latest.failed).toBe(false);
  });

  test("persists a confirmed non-swipe mode without a direction key", async () => {
    await mount();

    await act(async () => {
      await latest.change("tap");
    });

    expect(dispatch).toHaveBeenLastCalledWith({
      action: MSG_TOUCH_TRANSLATE_MODE_SET,
      args: { mode: "tap" },
    });
    expect(mockSave).toHaveBeenCalledWith({ touchMode: "tap" });
  });

  test("does not persist or overwrite state when the page rejects the mode", async () => {
    await mount();
    dispatch.mockImplementation(async () => ({
      touchTranslate: { mode: "off", supported: true, direction: "left" },
    }));

    await act(async () => {
      await latest.change("tap");
    });

    expect(mockSave).not.toHaveBeenCalled();
    expect(latest.failed).toBe(true);
    expect(latest.state).toMatchObject({ mode: "off" });
  });

  test("stays silent when the initial query has no receiver", async () => {
    dispatch.mockResolvedValue(undefined);

    await mount();

    expect(latest.state).toBeNull();
    expect(latest.failed).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("a stale initial query cannot overwrite a newer mode or clear a failure flag", async () => {
    let resolveInitial;
    dispatch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        })
    );

    await mount();

    // 初始 STATE 查询在途悬挂；此时改模式成功落位。
    await act(async () => {
      await latest.change("tap");
    });
    expect(latest.state).toMatchObject({ mode: "tap" });

    // 随后一次改模式被页面拒绝：失败提示在场。
    dispatch.mockImplementation(async () => ({
      touchTranslate: { mode: "off", supported: true, direction: "left" },
    }));
    await act(async () => {
      await latest.change("swipe", "left");
    });
    expect(latest.failed).toBe(true);

    // 迟到的初始查询返回 off：既不得覆盖 tap 模式，也不得清除失败提示。
    await act(async () => {
      resolveInitial({
        touchTranslate: { mode: "off", supported: true, direction: "left" },
      });
    });
    expect(latest.state).toMatchObject({ mode: "tap" });
    expect(latest.failed).toBe(true);
  });

  test("reports a persistence failure while keeping the applied mode", async () => {
    await mount();
    mockSave.mockRejectedValueOnce(new Error("Storage unavailable"));

    await act(async () => {
      await latest.change("swipe", "left");
    });

    expect(latest.saveFailed).toBe(true);
    expect(latest.state).toMatchObject({ mode: "swipe", direction: "left" });
  });

  test("rejects a second change while one is still pending", async () => {
    await mount();
    let finish;
    dispatch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({ touchTranslate: { mode: "tap", supported: true } });
        })
    );

    let first;
    await act(async () => {
      first = latest.change("tap");
      await latest.change("swipe", "right");
      finish();
      await first;
    });

    const modeSetCalls = dispatch.mock.calls.filter(
      ([request]) => request.action === MSG_TOUCH_TRANSLATE_MODE_SET
    );
    expect(modeSetCalls).toHaveLength(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith({ touchMode: "tap" });
  });

  test("adopts page events without persisting runtime state", async () => {
    await mount();

    act(() => {
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
      );
    });

    expect(latest.state).toMatchObject({ mode: "tap", direction: "right" });
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("drops the page listener when the consumer unmounts", async () => {
    const removeListener = jest.spyOn(document, "removeEventListener");
    await mount();

    act(() => root.render(null));

    expect(removeListener).toHaveBeenCalledWith(
      EVENT_KISS_INNER,
      expect.any(Function)
    );
    removeListener.mockRestore();
  });

  test("discards a state reply that resolves after a confirmed mode change", async () => {
    let resolveState;
    dispatch.mockImplementation(({ action }) => {
      if (action === MSG_TOUCH_TRANSLATE_STATE) {
        return new Promise((resolve) => {
          resolveState = resolve;
        });
      }
      return Promise.resolve({
        touchTranslate: { mode: "tap", supported: true },
      });
    });

    await mount();

    // change 先行确认落位：state=tap。
    await act(async () => {
      await latest.change("tap");
    });
    expect(latest.state).toMatchObject({ mode: "tap" });

    // 迟到的初始 STATE 应答（off）不得覆盖已确认的模式。
    await act(async () => {
      resolveState({ touchTranslate: { mode: "off", supported: true } });
    });
    expect(latest.state).toMatchObject({ mode: "tap" });
    expect(latest.failed).toBe(false);
  });

  test("keeps the mode-rejection failure against a late state reply", async () => {
    let stateQueries = 0;
    let resolveInitial;
    let resolveRequery;
    dispatch.mockImplementation(({ action }) => {
      if (action === MSG_TOUCH_TRANSLATE_STATE) {
        stateQueries += 1;
        return new Promise((resolve) => {
          if (stateQueries === 1) resolveInitial = resolve;
          else resolveRequery = resolve;
        });
      }
      // 页面拒绝：对 tap 请求回显 off。
      return Promise.resolve({
        touchTranslate: { mode: "off", supported: true, direction: "left" },
      });
    });

    await mount();

    await act(async () => {
      await latest.change("tap");
    });
    expect(latest.failed).toBe(true);
    expect(latest.state).toBeNull();
    // 提交失败且从未拿到状态：补发恰好一次查询。
    expect(stateQueries).toBe(2);

    // 迟到的初始应答既不覆盖状态，也不清除失败提示：纪元作废。
    await act(async () => {
      resolveInitial({ touchTranslate: { mode: "off", supported: true } });
    });
    expect(latest.failed).toBe(true);
    expect(latest.state).toBeNull();

    // 补发的应答拿到页面真值：状态落位，失败提示保留到提交成功。
    await act(async () => {
      resolveRequery({
        touchTranslate: {
          mode: "swipe",
          supported: true,
          direction: "left",
        },
      });
    });
    expect(latest.state).toMatchObject({ mode: "swipe", direction: "left" });
    expect(latest.failed).toBe(true);
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("re-queries once after a failed commit when no state was ever read", async () => {
    let stateQueries = 0;
    let resolveRequery;
    dispatch.mockImplementation(({ action }) => {
      if (action === MSG_TOUCH_TRANSLATE_STATE) {
        stateQueries += 1;
        if (stateQueries === 1) return Promise.resolve(undefined);
        return new Promise((resolve) => {
          resolveRequery = resolve;
        });
      }
      return Promise.reject(new Error("No receiver"));
    });

    await mount();
    expect(stateQueries).toBe(1);
    expect(latest.state).toBeNull();
    expect(latest.failed).toBe(false);

    await act(async () => {
      await latest.change("tap");
    });
    expect(latest.failed).toBe(true);
    expect(stateQueries).toBe(2);

    await act(async () => {
      resolveRequery({ touchTranslate: { mode: "off", supported: true } });
    });
    expect(latest.state).toMatchObject({ mode: "off" });
    expect(latest.failed).toBe(true);

    // 失败提示只由提交成功撤销。
    await act(async () => {
      dispatch.mockImplementation(({ args }) =>
        Promise.resolve({
          touchTranslate: {
            mode: args?.mode || "off",
            supported: true,
            direction: "left",
          },
        })
      );
      await latest.change("off");
    });
    expect(latest.failed).toBe(false);
    expect(mockSave).toHaveBeenCalledWith({ touchMode: "off" });
  });

  test("discards the pending state reply after a page broadcast is adopted", async () => {
    let resolveState;
    dispatch.mockImplementation(({ action }) => {
      if (action === MSG_TOUCH_TRANSLATE_STATE) {
        return new Promise((resolve) => {
          resolveState = resolve;
        });
      }
      return Promise.resolve({
        touchTranslate: { mode: "tap", supported: true },
      });
    });

    await mount();

    // 页面广播先被采纳：state=tap。
    act(() => {
      document.dispatchEvent(
        new CustomEvent(EVENT_KISS_INNER, {
          detail: {
            action: MSG_TOUCH_TRANSLATE_STATE,
            touchTranslate: { mode: "tap", supported: true },
          },
        })
      );
    });
    expect(latest.state).toMatchObject({ mode: "tap" });

    // 采纳后到达的迟到应答（off）作废。
    await act(async () => {
      resolveState({ touchTranslate: { mode: "off", supported: true } });
    });
    expect(latest.state).toMatchObject({ mode: "tap" });
  });
});
