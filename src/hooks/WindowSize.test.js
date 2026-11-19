import { act } from "react";
import { createRoot } from "react-dom/client";
import useWindowSize from "./WindowSize";
import { getViewportSize } from "../libs/viewport";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../libs/viewport", () => ({ getViewportSize: jest.fn() }));

test("reads viewport dimensions on mount and after a debounced resize", () => {
  jest.useFakeTimers();
  const root = createRoot(document.createElement("div"));
  let size;
  function Probe() {
    size = useWindowSize();
    return null;
  }
  try {
    getViewportSize.mockReturnValue({ w: 1431, h: 779 });
    act(() => root.render(<Probe />));
    expect(size).toEqual({ w: 1431, h: 779 });

    getViewportSize.mockReturnValue({ w: 1000, h: 600 });
    act(() => window.dispatchEvent(new Event("resize")));
    expect(size).toEqual({ w: 1431, h: 779 });
    act(() => jest.advanceTimersByTime(200));
    expect(size).toEqual({ w: 1000, h: 600 });
  } finally {
    act(() => root.unmount());
    getViewportSize.mockReset();
    jest.useRealTimers();
  }
});
