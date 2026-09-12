import { act } from "react";
import { createRoot } from "react-dom/client";
import FloatingPanel from "./FloatingPanel";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, height, resize, originalResizeObserver, rectSpy;
beforeEach(() => {
  height = 400;
  originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      resize = callback;
    }
    observe() {}
    disconnect() {}
  };
  rectSpy = jest
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(() => ({ height }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  rectSpy.mockRestore();
  globalThis.ResizeObserver = originalResizeObserver;
});
const render = (
  viewport = { w: 1280, h: 900 },
  position = { x: 1000, y: 700 }
) =>
  act(() =>
    root.render(
      <FloatingPanel
        title="Editor"
        moveLabel="Move"
        position={position}
        onMove={jest.fn()}
        width={448}
        viewport={viewport}
      >
        <div style={{ overflowY: "auto" }} data-testid="entries">
          Entries
        </div>
      </FloatingPanel>
    )
  );

test("restored coordinates, growing content and smaller visual viewports stay bounded", () => {
  render();
  const panel = container.querySelector("aside");
  expect(getComputedStyle(panel).left).toBe("820px");
  expect(getComputedStyle(panel).top).toBe("488px");
  height = 600;
  act(() => resize());
  expect(getComputedStyle(panel).top).toBe("288px");
  render({ x: 30, y: 40, w: 360, h: 640 });
  expect(getComputedStyle(panel).left).toBe("42px");
  expect(getComputedStyle(panel).top).toBe("68px");
  expect(getComputedStyle(panel).width).toBe("336px");
});

test("wheel input only scrolls entries while they can consume it", () => {
  render();
  const entries = container.querySelector('[data-testid="entries"]');
  Object.defineProperties(entries, {
    scrollHeight: { value: 800 },
    clientHeight: { value: 200 },
  });
  const wheel = (target, deltaY) => {
    const event = new WheelEvent("wheel", {
      deltaY,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(wheel(entries, -100)).toBe(true);
  expect(wheel(entries, 100)).toBe(false);
  entries.scrollTop = 600;
  expect(wheel(entries, 100)).toBe(true);
  expect(wheel(entries, -100)).toBe(false);
  expect(wheel(container.querySelector("header"), 100)).toBe(true);
});
