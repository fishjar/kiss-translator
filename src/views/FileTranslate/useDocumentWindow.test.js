import { act } from "react";
import { createRoot } from "react-dom/client";
import { useRef } from "react";
import { useDocumentWindow } from "./useDocumentWindow";

describe("EPUB document window", () => {
  let root;
  let host;
  let scroll;
  let windowed;
  let actEnvironment;
  let render;

  beforeEach(() => {
    jest.useFakeTimers();
    actEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.body.appendChild(document.createElement("div"));
    root = createRoot(host);
    function Probe({ documentKey, layoutKey }) {
      const scrollRef = useRef(null);
      const bodyRef = useRef(null);
      windowed = useDocumentWindow(20, scrollRef, bodyRef, 900, 1, {
        frameUpdates: true,
        retainAdjacent: true,
        documentKey,
        layoutKey,
      });
      return (
        <div ref={scrollRef}>
          <div ref={bodyRef} />
        </div>
      );
    }
    render = (documentKey = "first", layoutKey = "source") =>
      act(() =>
        root.render(<Probe documentKey={documentKey} layoutKey={layoutKey} />)
      );
    render();
    scroll = host.firstElementChild;
    scroll.firstElementChild.getBoundingClientRect = () => ({
      top: -scroll.scrollTop,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    globalThis.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    jest.useRealTimers();
  });

  function move(top) {
    scroll.scrollTop = top;
    scroll.dispatchEvent(new Event("scroll"));
    jest.advanceTimersByTime(20);
  }

  test("an explicit target stays mounted through scroll and measurement until it is ready", () => {
    act(() => windowed.jump(10, { pin: true }));
    act(() => {
      windowed.measure(9, 6000);
      move(0);
    });
    expect(windowed.visibleStart).toBe(10);
    act(() => {
      windowed.finishJump();
      jest.advanceTimersByTime(20);
    });
    expect(windowed.visibleStart).toBe(0);
  });

  test("a new document discards pending measurements and unpins navigation", () => {
    act(() => {
      windowed.jump(10, { pin: true });
      windowed.measure(0, 4000);
    });
    render("second");
    expect(scroll.scrollTop).toBe(0);
    act(() => move(900));
    expect(windowed.visibleStart).toBe(1);
  });

  test("changing layout re-estimates measured items and preserves the visible position", () => {
    act(() => {
      windowed.measure(0, 1100);
      jest.advanceTimersByTime(20);
      move(1220);
    });
    render("first", "bilingual");
    expect(scroll.scrollTop).toBe(1220);
    act(() => {
      windowed.measure(0, 900);
      jest.advanceTimersByTime(20);
    });
    expect(scroll.scrollTop).toBe(1020);
    expect(windowed.visibleStart).toBe(1);
  });

  test("changing layout keeps the offset deep inside a measured chapter", () => {
    act(() => {
      windowed.measure(0, 12000);
      jest.advanceTimersByTime(20);
      move(9000);
    });
    render("first", "larger-font");
    expect(scroll.scrollTop).toBe(9000);
    expect(windowed.visibleStart).toBe(0);
  });

  test("a layout change keeps navigation callbacks and the pending target", () => {
    const { finishJump, jump } = windowed;
    act(() => jump(10, { pin: true }));
    render("first", "larger-font");
    expect(windowed.finishJump).toBe(finishJump);
    expect(windowed.jump).toBe(jump);
    act(() => move(0));
    expect(windowed.visibleStart).toBe(10);
    act(() => {
      finishJump();
      jest.advanceTimersByTime(20);
    });
    expect(windowed.visibleStart).toBe(0);
  });

  test("finishing a jump does not compensate for the measured destination twice", () => {
    act(() => windowed.jump(2, { pin: true }));
    act(() => {
      windowed.measure(2, 12000);
      scroll.scrollTop = 9000;
      windowed.finishJump();
      jest.advanceTimersByTime(20);
    });
    expect(scroll.scrollTop).toBe(9000);
    expect(windowed.visibleStart).toBe(2);
  });

  test("retains at most one nearby chapter until scroll settles and compensates fractional edges", () => {
    act(() => move(899.75));
    act(() => {
      windowed.measure(0, 1000);
      jest.advanceTimersByTime(20);
    });
    expect(scroll.scrollTop).toBeCloseTo(999.75);
    act(() => move(1900));
    expect(windowed.start).toBe(0);
    act(() => jest.advanceTimersByTime(150));
    expect(windowed.start).toBe(1);
  });
});
