import { act } from "react";
import { createRoot } from "react-dom/client";
import Draggable, { getEdgePosition } from "./Draggable";
import { putFab } from "../../libs/storage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/mobile", () => ({ isMobile: false }));
jest.mock("../../libs/storage", () => ({ putFab: jest.fn() }));

describe("Draggable FAB edge locking", () => {
  let container;
  let root;
  let draggable;
  let originalClientWidth;
  let originalClientHeight;
  let getBoundingClientRect;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    originalClientWidth = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientWidth"
    );
    originalClientHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientHeight"
    );
    setViewport(600, 400);
    HTMLElement.prototype.setPointerCapture = jest.fn();
    getBoundingClientRect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this === draggable) {
          const match = this.style.transform.match(
            /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/
          );
          const left = Number(match?.[1] || 0);
          const top = Number(match?.[2] || 0);
          return {
            x: left,
            y: top,
            left,
            top,
            right: left + 40,
            bottom: top + 40,
            width: 40,
            height: 40,
            toJSON: () => ({}),
          };
        }
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        };
      });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    getBoundingClientRect.mockRestore();
    putFab.mockReset();
    jest.useRealTimers();
    restoreViewport("clientWidth", originalClientWidth);
    restoreViewport("clientHeight", originalClientHeight);
  });

  function setViewport(width, height) {
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: width,
    });
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: height,
    });
  }

  function restoreViewport(property, descriptor) {
    if (descriptor) {
      Object.defineProperty(document.documentElement, property, descriptor);
    } else {
      delete document.documentElement[property];
    }
  }

  function renderFab(props = {}) {
    const fab = {
      windowSize: { w: 600, h: 400 },
      width: 40,
      height: 40,
      left: 580,
      top: 200,
      edge: "right",
      snapEdge: true,
      handler: <span>fab</span>,
      ...props,
    };
    act(() => root.render(<Draggable {...fab} />));
    draggable = container.firstElementChild;
    return fab;
  }

  function rerenderFab(fab, props) {
    const nextFab = { ...fab, ...props };
    act(() => root.render(<Draggable {...nextFab} />));
    return nextFab;
  }

  test("keeps the right edge during immediate and debounced viewport resize", () => {
    const fab = renderFab();
    expect(draggable.style.transform).toBe("translate(580px, 200px)");

    setViewport(1200, 800);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(draggable.style.transform).toBe("translate(1180px, 400px)");

    rerenderFab(fab, { windowSize: { w: 1200, h: 800 } });
    expect(draggable.style.transform).toBe("translate(1180px, 400px)");
  });

  test.each([
    ["left", -20, 200, "translate(-20px, 400px)"],
    ["top", 300, -20, "translate(600px, -20px)"],
    ["bottom", 300, 380, "translate(600px, 780px)"],
  ])("keeps the %s edge after resize", (edge, left, top, expected) => {
    const fab = renderFab({ edge, left, top });
    setViewport(1200, 800);
    rerenderFab(fab, { windowSize: { w: 1200, h: 800 } });
    expect(draggable.style.transform).toBe(expected);
  });

  test("preserves fractional proportional position across uneven viewport resizes", () => {
    let fab = renderFab({ edge: "top", left: 300, top: -20 });

    setViewport(1001, 400);
    fab = rerenderFab(fab, { windowSize: { w: 1001, h: 400 } });
    expect(draggable.style.transform).toBe("translate(500.5px, -20px)");

    setViewport(600, 400);
    rerenderFab(fab, { windowSize: { w: 600, h: 400 } });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(300px, -20px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 300, y: -20, edge: "top" });
  });

  test("hovering expands the FAB without changing its saved edge", () => {
    renderFab();

    act(() =>
      draggable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    );
    expect(draggable.style.transform).toBe("translate(560px, 200px)");

    act(() =>
      draggable.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    );
    act(() => jest.runOnlyPendingTimers());
    expect(draggable.style.transform).toBe("translate(580px, 200px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 580, y: 200, edge: "right" });
  });

  test("changes the locked edge only after a real drag", () => {
    renderFab();
    const handler = draggable.firstElementChild.firstElementChild;

    act(() => {
      handler.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 590,
          clientY: 210,
        })
      );
    });
    act(() => {
      handler.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 300,
          clientY: 0,
        })
      );
    });
    act(() => {
      handler.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(draggable.style.transform).toBe("translate(290px, -20px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 290, y: -20, edge: "top" });
  });

  test("infers and persists an edge for legacy FAB positions", () => {
    renderFab({ edge: undefined });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(580px, 200px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 580, y: 200, edge: "right" });
  });

  test("poison coordinates from a narrower viewport are clamped into drag-reachable bounds on mount", () => {
    // 毒坐标新视口挂载回归：800×600 视口挂载遗留自宽视口的 {x:1400, y:-20, edge:"top"}。
    // top: -20 是历史毒坐标输入，但 top 分支输出 -20 实际来自 -height / 2（贴边隐藏语义），不是输入值。
    // putFab 为 mock：本测试只证明传给 putFab 的 payload 不再含越界正交坐标，不覆盖真实 storage 读写闭环。
    setViewport(800, 600);
    const fab = renderFab({
      left: 1400,
      top: -20,
      edge: "top",
      windowSize: { w: 800, h: 600 },
    });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(780px, -20px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 780, y: -20, edge: "top" });
  });

  test.each([
    ["left", -20, "translate(-20px, 0px)"],
    ["right", 580, "translate(780px, 580px)"],
    ["top", -20, "translate(-20px, -20px)"],
    ["bottom", 780, "translate(780px, 580px)"],
  ])(
    "keeps half-hidden corner semantics for %s edge under drag-same-bound clamp",
    (edge, ortho, expected) => {
      // 四个角落：只有被 clamp 的正交轴越界值收敛（如 edge=left 的 top=-20 -> 0，
      // 因拖拽 min y=0），其余拖拽可达位置全部保持原样（如右下/左上双半隐藏）。
      setViewport(800, 600);
      const fab = renderFab({
        left: edge === "top" || edge === "bottom" ? ortho : 1400,
        top: edge === "left" || edge === "right" ? ortho : 500,
        edge,
        windowSize: { w: 800, h: 600 },
      });
      act(() => jest.runOnlyPendingTimers());

      expect(draggable.style.transform).toBe(expected);
    }
  );

  test("zero viewport yields finite in-range corners without NaN or negative upper bound", () => {
    setViewport(0, 0);
    const fab = renderFab({
      left: 0,
      top: 0,
      edge: "top",
      windowSize: { w: 0, h: 0 },
    });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(-20px, -20px)");
    expect(draggable.style.transform).not.toMatch(/NaN|Infinity/);
    expect(putFab).toHaveBeenLastCalledWith({ x: -20, y: -20, edge: "top" });
  });

  test("non-finite coordinates fall back safely instead of producing illegal transforms", () => {
    const fab = renderFab({
      left: Infinity,
      top: Number.NaN,
      edge: "left",
      windowSize: { w: 800, h: 600 },
    });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(-20px, 0px)");
    expect(draggable.style.transform).not.toMatch(/NaN|Infinity/);
    expect(putFab).toHaveBeenLastCalledWith({ x: -20, y: 0, edge: "left" });
  });

  test("default edge (undefined) follows top semantics when clamping the orthogonal axis", () => {
    // switch default 分支按"贴顶"重算 top，正交轴应为 left：
    // 毒坐标 1400 收敛到 780，top 保持 -height/2 半隐藏语义，不被误收敛到 0
    const result = getEdgePosition({
      x: 1400,
      y: -20,
      width: 40,
      height: 40,
      windowWidth: 800,
      windowHeight: 600,
      hover: false,
      edge: undefined,
    });
    expect(result).toEqual({ x: 780, y: -20 });
  });
});
