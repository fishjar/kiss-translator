import { act } from "react";
import { createRoot } from "react-dom/client";
import DraggableResizable from "./DraggableResizable";

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
  let layoutOuterHeight;
  let transformedOuterHeight;
  let resizeCallback;
  let getBoundingClientRect;
  let getOffsetHeight;
  let originalResizeObserver;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    layoutOuterHeight = 100;
    transformedOuterHeight = 97;
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
          return {
            ...emptyRect,
            height: transformedOuterHeight,
            bottom: transformedOuterHeight,
          };
        }
        return emptyRect;
      });
    getOffsetHeight = jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(function () {
        return this.classList?.contains("KT-draggable") ? layoutOuterHeight : 0;
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
    getOffsetHeight.mockRestore();
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

  test("clamps with layout height while the entrance transform scales visual bounds", () => {
    const panel = renderPanel({ position: { x: 0, y: 400 } });
    panel.setPosition.mockClear();
    transformedOuterHeight = 291;
    layoutOuterHeight = 300;

    act(() => resizeCallback());

    const updater = panel.setPosition.mock.calls.at(-1)[0];
    expect(updater({ x: 0, y: 400 })).toEqual({ x: 0, y: 200 });
  });

  // The header contains buttons and an overflow menu as well as the drag area.
  // Opening the menu must not make the panel follow the pointer.
  test("pressing a control inside the header does not start a drag", () => {
    const panel = renderPanel({
      header: (
        <span>
          <button type="button">more</button>
        </span>
      ),
    });
    panel.setPosition.mockClear();
    const header = container.querySelector(".KT-draggable-header");
    const button = header.querySelector("button");

    act(() => {
      button.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      header.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 0,
          clientY: 200,
        })
      );
    });

    expect(panel.setPosition).not.toHaveBeenCalled();
  });

  // Browsers do not emit pointerup after pointercancel, so cancellation must
  // clear origin too. Otherwise, an interrupted drag leaves a stale origin and
  // moving over the header resumes dragging without any button pressed.
  test("a cancelled pointer ends the drag instead of leaving it stuck", () => {
    const panel = renderPanel();
    const header = container.querySelector(".KT-draggable-header");

    act(() => {
      header.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      header.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
    });

    panel.setPosition.mockClear();
    act(() => {
      header.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 0,
          clientY: 200,
        })
      );
    });

    expect(panel.setPosition).not.toHaveBeenCalled();
  });
});
