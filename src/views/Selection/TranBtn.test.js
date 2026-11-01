/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TranBtn from "./TranBtn";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderTranBtn(overrides = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const props = {
    position: { x: 20, y: 30 },
    btnEvent: "onMouseUp",
    onTrigger: jest.fn(),
    label: "Translate highlighted text",
    ...overrides,
  };

  act(() => {
    root.render(<TranBtn {...props} />);
  });

  const button = container.querySelector(".KT-tranbtn");

  return {
    button,
    container,
    onTrigger: props.onTrigger,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

test("keeps the selection FAB inside its themed render root", () => {
  const view = renderTranBtn();
  const { button, container } = view;

  expect(button).not.toBeNull();
  expect(button.tagName).toBe("BUTTON");
  expect(button.type).toBe("button");
  expect(button.getAttribute("aria-label")).toBe("Translate highlighted text");
  expect(button.tabIndex).toBe(0);
  expect(button.parentElement).toBe(container);
  expect(button.style.position).toBe("fixed");
  expect(button.style.left).toBe("20px");
  expect(button.style.top).toBe("30px");
  expect(button.querySelector('[data-testid="TranslateRoundedIcon"]')).not.toBe(
    null
  );
  expect(button.innerHTML).not.toContain("#209CEE");

  const mouseDown = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    button.dispatchEvent(mouseDown);
  });
  expect(mouseDown.defaultPrevented).toBe(true);

  view.cleanup();
});

test.each([
  ["onMouseUp", "mouseup"],
  ["onMouseOver", "mouseover"],
  ["onTouchEnd", "touchend"],
])(
  "preserves %s activation without repeating it for the pointer click",
  (btnEvent, eventName) => {
    const view = renderTranBtn({ btnEvent });

    act(() => {
      view.button.dispatchEvent(
        eventName === "touchend"
          ? new Event(eventName, { bubbles: true, cancelable: true })
          : new MouseEvent(eventName, {
              bubbles: true,
              cancelable: true,
              detail: 1,
            })
      );
      view.button.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          detail: 1,
        })
      );
    });

    expect(view.onTrigger).toHaveBeenCalledTimes(1);
    view.cleanup();
  }
);

test("activates once for a keyboard-generated click", () => {
  const view = renderTranBtn();

  act(() => {
    view.button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 0,
      })
    );
  });

  expect(view.onTrigger).toHaveBeenCalledTimes(1);
  view.cleanup();
});

describe("hover trigger delay", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("fires a hover trigger only after the pointer rests for the delay", () => {
    const view = renderTranBtn({ btnEvent: "onMouseOver", hoverDelay: 300 });

    act(() => {
      view.button.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, detail: 1 })
      );
    });
    expect(view.onTrigger).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(view.onTrigger).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  test("cancels a pending hover trigger when the pointer leaves early", () => {
    const view = renderTranBtn({ btnEvent: "onMouseOver", hoverDelay: 300 });

    act(() => {
      view.button.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, detail: 1 })
      );
      view.button.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, detail: 1 })
      );
    });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(view.onTrigger).not.toHaveBeenCalled();
    view.cleanup();
  });

  test("does not fire a pending hover trigger after unmount", () => {
    const view = renderTranBtn({ btnEvent: "onMouseOver", hoverDelay: 300 });

    act(() => {
      view.button.dispatchEvent(
        new MouseEvent("mouseover", { bubbles: true, detail: 1 })
      );
    });
    view.cleanup();
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(view.onTrigger).not.toHaveBeenCalled();
  });

  test("keeps the click trigger untouched by a positive delay", () => {
    const view = renderTranBtn({ btnEvent: "onClick", hoverDelay: 300 });

    act(() => {
      view.button.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
    });
    expect(view.onTrigger).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(view.onTrigger).toHaveBeenCalledTimes(1);
    view.cleanup();
  });
});

test("fires immediately on hover when the delay is 0", () => {
  const view = renderTranBtn({ btnEvent: "onMouseOver", hoverDelay: 0 });

  act(() => {
    view.button.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, detail: 1 })
    );
  });
  expect(view.onTrigger).toHaveBeenCalledTimes(1);
  view.cleanup();
});
