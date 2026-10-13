/* eslint-disable testing-library/no-render-in-setup, testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import TocDrawer from "./TocDrawer";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root, resize;
const originalObserver = globalThis.ResizeObserver;
function Reader() {
  const [open, setOpen] = useState(false),
    [width, setWidth] = useState(270);
  const toggle = useRef(null);
  return (
    <div>
      <button ref={toggle} onClick={() => setOpen(!open)}>
        目录
      </button>
      <TocDrawer
        open={open}
        onClose={() => setOpen(false)}
        toggleRef={toggle}
        width={width}
        defaultWidth={270}
        onWidthChange={setWidth}
      >
        <input aria-label="搜索目录" />
        <button onClick={() => setOpen(false)}>章节</button>
      </TocDrawer>
      <p>正文</p>
    </div>
  );
}
beforeEach(() => {
  globalThis.ResizeObserver = class {
    constructor(callback) {
      resize = callback;
    }
    observe() {
      resize([{ contentRect: { width: 900 } }]);
    }
    disconnect() {}
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Reader />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalObserver;
});
const panel = () => container.querySelector(".kt-toc-drawer");
const toggle = () => act(() => container.querySelector("button").click());
const pointer = (target, type, x = 270) =>
  act(() =>
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, button: 0 })
    )
  );
test("toggle, search, selection, outside and Escape dismissal", () => {
  expect(panel().getAttribute("aria-hidden")).toBe("true");
  toggle();
  pointer(container.querySelector("input"), "pointerdown");
  expect(panel().getAttribute("aria-hidden")).toBe("false");
  pointer(container.querySelector("button"), "pointerdown");
  toggle();
  expect(panel().getAttribute("aria-hidden")).toBe("true");
  toggle();
  pointer(container.querySelector("p"), "pointerdown");
  expect(panel().getAttribute("aria-hidden")).toBe("true");
  toggle();
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  );
  expect(panel().getAttribute("aria-hidden")).toBe("true");
  expect(document.activeElement).toBe(container.querySelector("button"));
  toggle();
  act(() => panel().querySelector("button").click());
  expect(panel().getAttribute("aria-hidden")).toBe("true");
});
test("width limits, keyboard, default reset and viewport shrink", () => {
  toggle();
  const handle = container.querySelector('[role="separator"]');
  pointer(handle, "pointerdown");
  pointer(window, "pointerup", 10000);
  expect(panel().style.width).toBe("600px");
  act(() => resize([{ contentRect: { width: 390 } }]));
  expect(panel().style.width).toBe("366px");
  act(() =>
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    )
  );
  expect(panel().style.width).toBe("350px");
  act(() =>
    handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  );
  expect(panel().style.width).toBe("270px");
  pointer(handle, "pointerdown");
  pointer(window, "pointerup", -1000);
  expect(panel().style.width).toBe("180px");
});
test("closing during drag restores cursor and detaches listeners", () => {
  toggle();
  const handle = container.querySelector('[role="separator"]');
  const cursor = document.body.style.cursor;
  pointer(handle, "pointerdown");
  pointer(window, "pointermove", 400);
  toggle();
  expect(document.body.style.cursor).toBe(cursor);
  pointer(window, "pointerup", 550);
  toggle();
  expect(panel().style.width).toBe("270px");
});
