import { act } from "react";
import { createRoot } from "react-dom/client";
import { useRef, useState } from "react";
import {
  useFocusClosingGate,
  FOCUS_CLOSE_DELAY_MS,
} from "./useFocusClosingGate";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * B 类 Hook 测试宿主：收集 hook 返回值并通过事件驱动 state 变化，
 * 覆盖初始加载、更新、焦点迁移、reduced-motion 与卸载清理。
 */
function FocusGateHost({ prefersReducedMotion, onTrueBlur, onClosingEnd }) {
  const { focused, closing, handleFocus, handleBlur } = useFocusClosingGate({
    prefersReducedMotion,
    onTrueBlur,
    onClosingEnd,
  });
  const [text, setText] = useState("");
  const ref = useRef(null);

  return (
    <div ref={ref} onBlur={handleBlur} data-testid="gate">
      <input
        data-testid="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={handleFocus}
      />
      <button type="button" data-testid="button" onFocus={handleFocus}>
        copy
      </button>
      <output data-testid="state">
        {String(focused)}:{String(closing)}
      </output>
    </div>
  );
}

function renderHost(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onTrueBlur = jest.fn();
  const onClosingEnd = jest.fn();

  act(() => {
    root.render(
      <FocusGateHost
        prefersReducedMotion={false}
        onTrueBlur={onTrueBlur}
        onClosingEnd={onClosingEnd}
        {...props}
      />
    );
  });

  return { container, root, onTrueBlur, onClosingEnd };
}

// React 的 onFocus/onBlur 由 focusin/focusout 冒泡事件驱动（non-native focus/blur
// 不会命中 React 合成事件分发），测试必须派发 focusin/focusout 并携带 relatedTarget。
function blurWith(container, targetTestId, relatedTarget) {
  const target = container.querySelector(`[data-testid="${targetTestId}"]`);
  act(() => {
    target.dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: relatedTarget || null,
      })
    );
  });
}

function focusWith(container, testId) {
  act(() => {
    container
      .querySelector(`[data-testid="${testId}"]`)
      .dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
}

function stateOf(container) {
  return container.querySelector('[data-testid="state"]').textContent;
}

describe("useFocusClosingGate", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.clearAllTimers();
    });
    jest.useRealTimers();
  });

  test("keeps the gate open on internal focus moves (Tab inside the container)", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();

    focusWith(container, "input");
    const gate = container.querySelector('[data-testid="gate"]');
    const button = container.querySelector('[data-testid="button"]');
    // Tab 从 input 到内部按钮：relatedTarget 在容器内，不得触发提交或关闭
    blurWith(container, "input", button);
    expect(onTrueBlur).not.toHaveBeenCalled();
    expect(stateOf(container)).toBe("true:false");
    expect(onClosingEnd).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("true blur commits once and runs the closing transition then ends", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();

    focusWith(container, "input");
    blurWith(container, "input", document.body);
    // 真离场：立即提交一次并进入 closing
    expect(onTrueBlur).toHaveBeenCalledTimes(1);
    expect(stateOf(container)).toBe("false:true");

    // 120ms 后退出动画结束
    act(() => {
      jest.advanceTimersByTime(FOCUS_CLOSE_DELAY_MS);
    });
    expect(onClosingEnd).toHaveBeenCalledTimes(1);
    expect(stateOf(container)).toBe("false:false");

    act(() => root.unmount());
  });

  test("refocus during closing cancels the timer and restores focused", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();

    focusWith(container, "input");
    blurWith(container, "input", document.body);
    expect(stateOf(container)).toBe("false:true");

    // closing 期间重新进入任意子元素：取消未到期定时器，恢复 focused
    focusWith(container, "input");
    expect(stateOf(container)).toBe("true:false");
    expect(onClosingEnd).not.toHaveBeenCalled();
    expect(onTrueBlur).toHaveBeenCalledTimes(1);

    // 推进超过 120ms：旧定时器已被取消，不得触发 closing end
    act(() => {
      jest.advanceTimersByTime(FOCUS_CLOSE_DELAY_MS * 3);
    });
    expect(onClosingEnd).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("true blur is not re-submitted on a second internal blur while closing", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();

    focusWith(container, "input");
    const gate = container.querySelector('[data-testid="gate"]');
    const button = container.querySelector('[data-testid="button"]');
    blurWith(container, "input", document.body);
    expect(onTrueBlur).toHaveBeenCalledTimes(1);

    // 仍然在 closing 期间 Tab 回内部按钮：relatedTarget 在容器内，不得二次提交
    blurWith(container, "input", button);
    expect(onTrueBlur).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  test("reduced-motion true blur closes synchronously with no leftover timer", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost({
      prefersReducedMotion: true,
    });

    focusWith(container, "input");
    expect(jest.getTimerCount()).toBe(0);
    blurWith(container, "input", document.body);
    // 同步关闭，无 closing 过渡
    expect(stateOf(container)).toBe("false:false");
    expect(onTrueBlur).toHaveBeenCalledTimes(1);
    // 订正：同步关闭也必须触发一次 onClosingEnd，完成生命周期清理
    // （TranForm 依赖它把 editMode 归位，否则 reduced-motion 下外部 text 永久失同步）
    expect(onClosingEnd).toHaveBeenCalledTimes(1);
    // 无遗留 timer
    expect(jest.getTimerCount()).toBe(0);

    act(() => root.unmount());
  });

  test("unmount during closing cancels the timer without warnings", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    focusWith(container, "input");
    blurWith(container, "input", document.body);
    expect(stateOf(container)).toBe("false:true");
    expect(jest.getTimerCount()).toBe(1);

    // closing 期间父组件卸载：清理定时器，无幽灵更新
    act(() => root.unmount());
    expect(jest.getTimerCount()).toBe(0);
    act(() => {
      jest.advanceTimersByTime(FOCUS_CLOSE_DELAY_MS * 2);
    });
    expect(onClosingEnd).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  test("true blur on an unmonitored focus still commits and runs closing transition safely", () => {
    const { container, root, onTrueBlur, onClosingEnd } = renderHost();

    blurWith(container, "input", document.body);
    expect(onTrueBlur).toHaveBeenCalledTimes(1);
    expect(stateOf(container)).toBe("false:true");

    act(() => {
      jest.advanceTimersByTime(FOCUS_CLOSE_DELAY_MS);
    });
    expect(onClosingEnd).toHaveBeenCalledTimes(1);
    expect(stateOf(container)).toBe("false:false");

    act(() => root.unmount());
  });
});
