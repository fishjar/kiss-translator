import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CopyBtn from "./CopyBtn";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * 渲染复制按钮组件。
 *
 * @param {Object} props 覆盖默认组件参数。
 * @returns {{container: HTMLElement, root: Object}} React 根节点与容器。
 */
function renderCopyBtn(props = {}, options = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    const element = <CopyBtn text="hello" title="Copy" {...props} />;
    root.render(
      options.strict ? <React.StrictMode>{element}</React.StrictMode> : element
    );
  });

  return { container, root };
}

describe("CopyBtn", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("copies the full text and recovers the copy state after the timeout", async () => {
    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    // 复制成功后显示成功图标
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).toBeNull();

    act(() => {
      jest.advanceTimersByTime(500);
    });

    // 临时状态按时恢复为普通复制按钮
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).toBeNull();

    act(() => root.unmount());
  });

  test("a new copy replaces the previous timer", async () => {
    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // 第一个定时器只运行 400ms，尚未到期
    act(() => {
      jest.advanceTimersByTime(400);
    });

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // 第二个定时器运行 200ms；若旧定时器未被替换，此时（首个定时器 600ms）早已恢复
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();

    // 第二个定时器到期后才恢复
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("keeps the copy state when the clipboard write is denied", async () => {
    // 切真实定时器：unhandledRejection 需要真实微任务/宏任务时序才能暴露
    jest.useRealTimers();
    navigator.clipboard.writeText.mockRejectedValue(new Error("denied"));
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    try {
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }

    // 拒绝必须被组件自身捕获：不得产生 unhandled rejection，也不翻转 copied
    expect(unhandled.length).toBe(0);
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).toBeNull();

    act(() => root.unmount());
  });

  test("is inert when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 无剪贴板能力：不抛错、不翻转 copied、不创建状态定时器
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).toBeNull();
    expect(jest.getTimerCount()).toBe(0);

    act(() => root.unmount());
  });

  test("does not flip the state or leak timers when unmounted mid-copy", async () => {
    // 卸载竞态（AGENTS §7.4 幽灵定时器模式）：卸载发生在 writeText 的
    // await 期间时，既有 cleanup 先跑（此刻定时器尚不存在），随后 await
    // 返回仍不得 setState 或新建 500ms 定时器。
    let resolveWrite;
    navigator.clipboard.writeText.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    );
    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // handleClick 挂起在 writeText 上，此刻尚无状态定时器
    expect(jest.getTimerCount()).toBe(0);

    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    act(() => root.unmount());
    await act(async () => {
      resolveWrite();
      await Promise.resolve();
      await Promise.resolve();
    });

    // 卸载后不得新建幽灵定时器
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  test("clears the timer on unmount so no state update happens afterwards", async () => {
    const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();

    clearTimeoutSpy.mockClear();
    act(() => root.unmount());
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);

    // 卸载后推进定时器，不应抛错或更新状态
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    }).not.toThrow();

    clearTimeoutSpy.mockRestore();
  });

  test("works correctly when mounted under React.StrictMode (double effect setup/cleanup)", async () => {
    const { container, root } = renderCopyBtn({}, { strict: true });
    const button = container.querySelector("button");

    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // StrictMode 挂载下复制完成图标仍必须出现（mountedRef 已正确恢复 true）
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("out-of-order copy promises do not overwrite a newer copied state or leak timers", async () => {
    let slowResolve;
    let fastResolve;
    let callCount = 0;

    navigator.clipboard.writeText.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return new Promise((r) => {
          slowResolve = r;
        });
      }
      return new Promise((r) => {
        fastResolve = r;
      });
    });

    const { container, root } = renderCopyBtn();
    const button = container.querySelector("button");

    // 第一次慢复制
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    // 第二次快复制
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 快复制先 resolve
    await act(async () => {
      fastResolve();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();

    // 慢复制后 resolve：不得覆盖第二代的状态，也不得新建旧代 timer
    await act(async () => {
      slowResolve();
      await Promise.resolve();
    });
    expect(
      container.querySelector('[data-testid="LibraryAddCheckIcon"]')
    ).not.toBeNull();

    // 快复制的 500ms 到期后恢复普通图标
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(
      container.querySelector('[data-testid="ContentCopyIcon"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });
});
