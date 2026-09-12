import { act } from "react";
import { createRoot } from "react-dom/client";
import { useMediaQueryMatch } from "./MediaQuery";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderMediaQuery() {
  const container = document.createElement("div");
  const root = createRoot(container);
  function Harness() {
    const matches = useMediaQueryMatch("(max-width: 859px)");
    return <span>{String(matches)}</span>;
  }
  act(() => root.render(<Harness />));
  return { container, root };
}

describe("useMediaQueryMatch", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("tracks modern MediaQueryList change events", () => {
    let changeHandler;
    const removeEventListener = jest.fn();
    window.matchMedia = jest.fn(() => ({
      matches: false,
      addEventListener: (_name, handler) => {
        changeHandler = handler;
      },
      removeEventListener,
    }));
    const view = renderMediaQuery();

    act(() => changeHandler({ matches: true }));
    expect(view.container.textContent).toBe("true");

    act(() => view.root.unmount());
    expect(removeEventListener).toHaveBeenCalledWith("change", changeHandler);
  });

  test("supports legacy MediaQueryList listeners", () => {
    let changeHandler;
    const removeListener = jest.fn();
    window.matchMedia = jest.fn(() => ({
      matches: true,
      addListener: (handler) => {
        changeHandler = handler;
      },
      removeListener,
    }));
    const view = renderMediaQuery();

    act(() => changeHandler({ matches: false }));
    expect(view.container.textContent).toBe("false");

    act(() => view.root.unmount());
    expect(removeListener).toHaveBeenCalledWith(changeHandler);
  });
});
