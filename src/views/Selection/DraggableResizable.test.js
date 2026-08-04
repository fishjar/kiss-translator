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
