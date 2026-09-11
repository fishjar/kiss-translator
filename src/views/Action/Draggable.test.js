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

  test("keeps the cross-axis fully visible at viewport corners", () => {
    const dimensions = {
      x: 580,
      y: 390,
      width: 56,
      height: 56,
      windowWidth: 600,
      windowHeight: 400,
    };

    expect(
      getEdgePosition({ ...dimensions, revealed: false, edge: "right" })
    ).toEqual({ x: 572, y: 344 });
    expect(
      getEdgePosition({ ...dimensions, revealed: true, edge: "right" })
    ).toEqual({ x: 544, y: 344 });
    expect(
      getEdgePosition({ ...dimensions, revealed: false, edge: "bottom" })
    ).toEqual({ x: 544, y: 372 });
    expect(
      getEdgePosition({ ...dimensions, revealed: true, edge: "bottom" })
    ).toEqual({ x: 544, y: 344 });
  });

  test("keeps the right edge during immediate and debounced viewport resize", () => {
    const fab = renderFab();
    expect(draggable.style.width).toBe("40px");
    expect(draggable.style.transform).toBe("translate(580px, 200px)");

    setViewport(1200, 800);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(draggable.style.transform).toBe("translate(1180px, 400px)");

    rerenderFab(fab, { windowSize: { w: 1200, h: 800 } });
    expect(draggable.style.transform).toBe("translate(1180px, 400px)");
  });

  test("constrains a content panel to its requested width", () => {
    renderFab({
      width: 360,
      height: 442,
      left: 120,
      top: 40,
      edge: undefined,
      snapEdge: false,
      usePaper: true,
    });

    expect(draggable.style.width).toBe("360px");
    expect(draggable.querySelector(".MuiPaper-root")).not.toBeNull();
  });

  test("does not begin a panel drag from an interactive header control", () => {
    const onStart = jest.fn();
    renderFab({
      width: 360,
      height: 442,
      left: 120,
      top: 40,
      edge: undefined,
      snapEdge: false,
      usePaper: true,
      onStart,
      handler: (
        <div>
          <button type="button">Close</button>
          <span data-testid="drag-surface">Header</span>
        </div>
      ),
    });

    const button = draggable.querySelector("button");
    act(() =>
      button.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 10,
          clientY: 10,
        })
      )
    );
    expect(onStart).not.toHaveBeenCalled();
    expect(button.setPointerCapture).not.toHaveBeenCalled();

    const surface = draggable.querySelector('[data-testid="drag-surface"]');
    act(() =>
      surface.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          clientX: 10,
          clientY: 10,
        })
      )
    );
    expect(onStart).toHaveBeenCalledTimes(1);
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
    expect(draggable.style.opacity).toBe("1");
    expect(draggable.style.transition).toContain("opacity");
    expect(draggable.style.transition).toContain("transform");

    act(() =>
      draggable.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    );
    expect(draggable.style.transform).toBe("translate(560px, 200px)");
    expect(draggable.style.opacity).toBe("1");

    act(() =>
      draggable.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
    );
    act(() => jest.runOnlyPendingTimers());
    expect(draggable.style.transform).toBe("translate(580px, 200px)");
    expect(draggable.style.opacity).toBe("1");
    expect(putFab).toHaveBeenLastCalledWith({ x: 580, y: 200, edge: "right" });
  });

  test("keyboard focus reveals the snapped FAB and blur hides it halfway", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    renderFab({ handler: <button type="button">fab</button> });
    const handler = draggable.querySelector("button");

    act(() => handler.focus());
    expect(draggable.style.transform).toBe("translate(560px, 200px)");

    act(() => outside.focus());
    expect(draggable.style.transform).toBe("translate(580px, 200px)");
    outside.remove();
  });

  test("ignores pointer movement when no drag is active", () => {
    const onMove = jest.fn();
    renderFab({ onMove });
    const handler = draggable.firstElementChild.firstElementChild;

    act(() => {
      handler.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 300,
          clientY: 100,
        })
      );
    });

    expect(onMove).not.toHaveBeenCalled();
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
    expect(draggable.style.transition).not.toContain("transform");
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
    expect(draggable.style.transition).toContain("transform");
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

  // Cancellation must clear the drag because no later pointerup is guaranteed.
  test("a cancelled pointer ends the drag instead of leaving it stuck", () => {
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
      handler.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
    });
    const afterCancel = draggable.style.transform;

    act(() => {
      handler.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 300,
        })
      );
    });

    expect(draggable.style.transform).toBe(afterCancel);
  });

  test("keeps the container unconstrained when fitContent is set", () => {
    renderFab({ fitContent: true });
    expect(draggable.style.width).toBe("");
  });

  test("an expanded overlay reveals the snapped control for touch input", () => {
    const fab = renderFab();
    expect(draggable.style.opacity).toBe("1");
    expect(draggable.style.transform).toBe("translate(580px, 200px)");

    rerenderFab(fab, { expanded: true });
    expect(draggable.style.opacity).toBe("1");
    expect(draggable.style.transform).toBe("translate(560px, 200px)");
  });

  test("clamps a saved position from a wider viewport while keeping the cross-axis visible", () => {
    // The top edge remains half-hidden; the cross-axis fits the narrower viewport.
    // The mocked storage verifies only the persisted payload.
    setViewport(800, 600);
    renderFab({
      left: 1400,
      top: -20,
      edge: "top",
      windowSize: { w: 800, h: 600 },
    });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(760px, -20px)");
    expect(putFab).toHaveBeenLastCalledWith({ x: 760, y: -20, edge: "top" });
  });

  test.each([
    ["left", -20, "translate(-20px, 0px)"],
    ["right", 580, "translate(780px, 560px)"],
    ["top", -20, "translate(0px, -20px)"],
    ["bottom", 780, "translate(760px, 580px)"],
  ])(
    "keeps only the snapped %s edge half-hidden at viewport corners",
    (edge, ortho, expected) => {
      setViewport(800, 600);
      renderFab({
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
    renderFab({
      left: 0,
      top: 0,
      edge: "top",
      windowSize: { w: 0, h: 0 },
    });
    act(() => jest.runOnlyPendingTimers());

    expect(draggable.style.transform).toBe("translate(0px, -20px)");
    expect(draggable.style.transform).not.toMatch(/NaN|Infinity/);
    expect(putFab).toHaveBeenLastCalledWith({ x: 0, y: -20, edge: "top" });
  });

  test("non-finite coordinates fall back safely instead of producing illegal transforms", () => {
    renderFab({
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
    // The default branch uses the top edge and clamps the horizontal position.
    const result = getEdgePosition({
      x: 1400,
      y: -20,
      width: 40,
      height: 40,
      windowWidth: 800,
      windowHeight: 600,
      revealed: false,
      edge: undefined,
    });
    expect(result).toEqual({ x: 760, y: -20 });
  });
});
