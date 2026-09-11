import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import DraggableResizable from "./DraggableResizable";
import { ResizeHandle } from "../../components/ResizeHandle";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/mobile", () => ({ isMobile: false }));

const emptyRect = {
  x: 0,
  y: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};

describe("DraggableResizable auto height bounds", () => {
  let container;
  let root;
  let outerHeight;
  let resizeCallback;
  let getBoundingClientRect;
  let originalResizeObserver;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    outerHeight = 100;
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      constructor(callback) {
        resizeCallback = callback;
      }

      observe() {}

      disconnect() {}
    };
    HTMLElement.prototype.setPointerCapture = jest.fn();
    getBoundingClientRect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this.classList?.contains("KT-draggable")) {
          return { ...emptyRect, height: outerHeight, bottom: outerHeight };
        }
        return emptyRect;
      });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 500,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    getBoundingClientRect.mockRestore();
    window.ResizeObserver = originalResizeObserver;
  });

  function renderPanel(props = {}) {
    const defaults = {
      position: { x: 0, y: 0 },
      size: { w: 320, h: 400 },
      minSize: { w: 100, h: 100 },
      maxSize: { w: 800, h: 800 },
      setSize: jest.fn(),
      setPosition: jest.fn(),
      autoHeight: true,
      header: <span>header</span>,
      children: <div>content</div>,
    };

    const panel = { ...defaults, ...props };
    act(() => root.render(<DraggableResizable {...panel} />));
    return panel;
  }

  test("allows a short auto-height panel to reach the viewport bottom", () => {
    const panel = renderPanel();
    panel.setPosition.mockClear();
    const header = container.querySelector(".KT-draggable-header");

    act(() => {
      header.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      header.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 0,
          clientY: 1000,
        })
      );
    });

    expect(panel.setPosition).toHaveBeenLastCalledWith({ x: 0, y: 400 });
  });

  test("clamps the position when auto-height content grows", () => {
    const panel = renderPanel({ position: { x: 0, y: 400 } });
    panel.setPosition.mockClear();
    outerHeight = 300;

    act(() => resizeCallback());

    const updater = panel.setPosition.mock.calls.at(-1)[0];
    expect(updater({ x: 0, y: 400 })).toEqual({ x: 0, y: 200 });
  });
});

describe("DraggableResizable inner/outer drag isolation", () => {
  let container;
  let root;
  let getBoundingClientRect;
  let originalResizeObserver;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}

      disconnect() {}
    };
    // 默认：setPointerCapture 成功（hasPointerCapture 存在且返回 true）→ 元素主路径
    HTMLElement.prototype.setPointerCapture = jest.fn(function () {
      return true;
    });
    HTMLElement.prototype.hasPointerCapture = jest.fn(function () {
      return true;
    });
    HTMLElement.prototype.releasePointerCapture = jest.fn(function () {
      return undefined;
    });
    getBoundingClientRect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this.classList?.contains("KT-draggable")) {
          return { ...emptyRect, height: 400, bottom: 400 };
        }
        return emptyRect;
      });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    getBoundingClientRect.mockRestore();
    window.ResizeObserver = originalResizeObserver;
    delete HTMLElement.prototype.releasePointerCapture;
    delete HTMLElement.prototype.hasPointerCapture;
  });

  /** 构造一个可与主事件流配合的指针事件（pointerdown 需要在句柄元素上派发）。 */
  function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clientY", { value: clientY });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    return event;
  }

  /**
   * 真实 ResizeHandle 宿主：内部 state 就是 handle 的拖动高度，
   * 拖动发生变化时其调用的 onHeightChange 与外部 position/size setter 无关。
   */
  function InnerResizableField({ onHeightChange, onDragStart }) {
    const boxRef = useRef(null);
    const [height, setHeight] = useState(null);
    return (
      <div ref={boxRef} style={{ position: "relative" }}>
        <textarea readOnly value="inner" data-testid="inner-field" />
        <ResizeHandle
          visible
          closing={false}
          height={height}
          containerRef={boxRef}
          onHeightChange={(value) => {
            setHeight(value);
            onHeightChange(value);
            onDragStart();
          }}
          title="Resize"
          ariaLabel="Resize"
          testId="inner-resize-handle"
          notchTestId="inner-resize-notch"
        />
      </div>
    );
  }

  // 冲刷 ResizeHandle 挂载后的微任务测量：常显手柄（visible=true 挂载）的测量
  // effect 会经 activate() 的微任务重试补测容器 ref，setState 必须落在 act 边界内，
  // 否则 React 抛 "not wrapped in act" 警告（与 SubtitleSegmentationPlayground 的
  // flushEffects 同款配方：双 Promise.resolve 冲刷微任务队列）。
  async function flushEffects() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderIsolationScenario() {
    const setSize = jest.fn();
    const setPosition = jest.fn();
    let innerLatestHeight = null;

    act(() => {
      root.render(
        <DraggableResizable
          position={{ x: 0, y: 0 }}
          size={{ w: 320, h: 400 }}
          minSize={{ w: 100, h: 100 }}
          maxSize={{ w: 800, h: 800 }}
          setSize={setSize}
          setPosition={setPosition}
          autoHeight
          header={<span>header</span>}
          onClick={() => {}}
        >
          <InnerResizableField
            onHeightChange={(h) => {
              innerLatestHeight = h;
            }}
            onDragStart={() => {}}
          />
        </DraggableResizable>
      );
    });

    // 等 ResizeHandle 挂载期测量（activate 微任务重试）完成，避免其 setState 落在 act 外
    await flushEffects();

    const boxDiv = container.querySelector(
      '[data-testid="inner-field"]'
    ).parentElement;
    Object.defineProperty(boxDiv, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="inner-resize-handle"]'
    );

    // 清理初次挂载时 autoHeight clampPosition 对 setPosition 的初始调用
    setSize.mockClear();
    setPosition.mockClear();

    return {
      setSize,
      setPosition,
      boxDiv,
      handle,
      getLatest: () => innerLatestHeight,
    };
  }

  test("element capture main path: inner resize does not move or resize the outer panel", async () => {
    const { setSize, setPosition, handle, getLatest } =
      await renderIsolationScenario();
    expect(handle).not.toBeNull();

    // 元素 capture 主路径：pointerdown 在句柄元素上建立会话并 setPointerCapture 成功，
    // 后续 move/up 直接派发在句柄元素上（window 降级监听不参与）。
    act(() => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    act(() => {
      handle.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    act(() => {
      handle.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
    });
    act(() => {
      handle.dispatchEvent(makePointerEvent("pointerup", { clientY: 50 }));
    });

    // 内层高度确实跟随拖动了（100 + 50 = 150）
    expect(getLatest()).toBe(150);

    // 外层面板的 size/position setter 一律未被调用（事件被 stopPropagation 隔离）
    expect(setSize).not.toHaveBeenCalled();
    expect(setPosition).not.toHaveBeenCalled();
  });

  test("window fallback path: capture failure still resizes and stays isolated", async () => {
    // 模拟 Pointer capture 失败（缺失）：setPointerCapture 不可用 →
    // pointerdown 激活完整 window fallback，window 承接的 move 仍可调高。
    HTMLElement.prototype.setPointerCapture = undefined;
    HTMLElement.prototype.hasPointerCapture = undefined;

    const { setSize, setPosition, handle, getLatest } =
      await renderIsolationScenario();
    expect(handle).not.toBeNull();

    // capture 失败：pointerdown 建立会话并同步激活 window 降级监听
    act(() => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    // 拖出元素（window 承接 move 仍有效）
    act(() => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    act(() => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
    });
    act(() => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 50 }));
    });

    // window 降级路径下内层高度仍跟随拖动（100 + 50 = 150）
    expect(getLatest()).toBe(150);
    expect(setSize).not.toHaveBeenCalled();
    expect(setPosition).not.toHaveBeenCalled();
  });
});
