/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import ImageSourcePreview from "./ImageSourcePreview";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const poly = [[10, 20], [100, 20], [100, 60], [10, 60]];
const rows = [
  { source: "selected", poly, enabled: true },
  { source: "excluded", poly, enabled: false },
  { source: "unlocated", poly: null },
  { source: "degenerate", poly: [[0, 0], [1, 1], [2, 2]] },
];

describe("ImageSourcePreview regions", () => {
  let container, root, resize, originalObserver;
  beforeEach(() => {
    originalObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() {}
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.ResizeObserver = originalObserver;
  });

  const measure = (width = 400, height = 200) => {
    const image = container.querySelector("img");
    Object.defineProperties(image, {
      naturalWidth: { value: width }, naturalHeight: { value: height },
    });
    act(() => image.dispatchEvent(new Event("load")));
    return image;
  };
  const render = (props = {}) => act(() => root.render(<div onClick={props.onZoom}><ImageSourcePreview
    src="sample.png" alt="source" rows={rows} regionLabel={(row) => row.source}
    selectLabel="include" excludeLabel="exclude" {...props}
  /></div>));

  test.each([[400, 200], [200, 400]])("maps %i x %i source coordinates and updates rendered bounds on resize", (width, height) => {
    render();
    const image = measure(width, height);
    let imageRect = { left: 30, top: 40, width: 200, height: 100 };
    image.getBoundingClientRect = () => imageRect;
    image.parentElement.getBoundingClientRect = () => ({ left: 10, top: 20 });
    act(() => resize());
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${width} ${height}`);
    expect(getComputedStyle(svg).left).toBe("20px");
    expect(getComputedStyle(svg).width).toBe("200px");
    expect(container.querySelectorAll("polygon")).toHaveLength(2);
    expect(container.querySelector("polygon").getAttribute("points")).toBe("10,20 100,20 100,60 10,60");
    imageRect = { left: 40, top: 50, width: 100, height: 50 };
    act(() => resize());
    expect(getComputedStyle(svg).left).toBe("30px");
    expect(getComputedStyle(svg).width).toBe("100px");
  });

  test("click and keyboard toggle the correct region without bubbling to image zoom", () => {
    const toggle = jest.fn(), zoom = jest.fn();
    render({ onToggleRegion: toggle, onZoom: zoom });
    measure();
    const polygons = container.querySelectorAll("polygon");
    expect(polygons[0].getAttribute("aria-pressed")).toBe("true");
    expect(polygons[1].getAttribute("stroke-dasharray")).toBe("4 3");
    expect(getComputedStyle(polygons[1]).outline).toBe("none");
    act(() => polygons[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    act(() => polygons[1].dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
    expect(toggle.mock.calls).toEqual([[0], [1]]);
    expect(zoom).not.toHaveBeenCalled();
    act(() => container.querySelector("img").dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(zoom).toHaveBeenCalledTimes(1);
    render({ onToggleRegion: toggle, disabled: true, onZoom: zoom });
    act(() => polygons[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(polygons[0].getAttribute("tabindex")).toBe("-1");
    render({ showRegions: false });
    expect(container.querySelector("svg")).toBeNull();
  });
});
