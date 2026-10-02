/* eslint-disable testing-library/no-unnecessary-act, testing-library/no-container */
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import usePopupPageHeight, {
  measurePopupPageHeight,
} from "./usePopupPageHeight";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("page height reference", () => {
  let container;
  let root;
  let bodyHeight;
  let originalScrollingElement;
  let originalInnerHeight;

  beforeEach(() => {
    bodyHeight = 432;
    originalScrollingElement = Object.getOwnPropertyDescriptor(
      document,
      "scrollingElement"
    );
    originalInnerHeight = Object.getOwnPropertyDescriptor(
      window,
      "innerHeight"
    );
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 25,
    });
    document.documentElement.scrollTop = 180;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.classList.remove("kt-toolbar-popup--text");
    document.documentElement.scrollTop = 0;
    if (originalScrollingElement)
      Object.defineProperty(
        document,
        "scrollingElement",
        originalScrollingElement
      );
    else delete document.scrollingElement;
    Object.defineProperty(window, "innerHeight", originalInnerHeight);
    jest.useRealTimers();
  });

  function Harness({ activeTab = "text", isSeparate = false }) {
    const shellRef = useRef(null);
    const chromeRef = useRef(null);
    const pageRef = useRef(null);
    const reference = usePopupPageHeight({
      shellRef,
      chromeRef,
      pageRef,
      activeTab,
      isSeparate,
      generation: 1,
      isLoading: false,
    });
    return (
      <main
        ref={(node) => {
          shellRef.current = node;
          if (node) node.getBoundingClientRect = () => ({ width: 396 });
        }}
      >
        <header
          ref={(node) => {
            chromeRef.current = node;
            if (node) node.getBoundingClientRect = () => ({ height: 48 });
          }}
        />
        <div
          hidden={activeTab !== "page"}
          data-page
          ref={(node) => {
            pageRef.current = node;
            if (node)
              node.getBoundingClientRect = () => ({
                height:
                  !node.hidden || node.style.display === "block"
                    ? bodyHeight
                    : 0,
              });
          }}
        >
          Page actions
        </div>
        <output>{reference ? reference.height : "unmeasured"}</output>
      </main>
    );
  }

  const render = (props = {}) => act(() => root.render(<Harness {...props} />));

  test("measures a hidden page at its own width and restores its styles", () => {
    const shell = document.createElement("main");
    const chrome = document.createElement("header");
    const page = document.createElement("div");
    shell.getBoundingClientRect = () => ({ width: 396 });
    chrome.getBoundingClientRect = () => ({ height: 48 });
    page.hidden = true;
    page.setAttribute("style", "color: blue; margin: 3px");
    const initialStyle = page.getAttribute("style");
    page.getBoundingClientRect = () => {
      expect(page.style.display).toBe("block");
      expect(page.style.width).toBe("396px");
      expect(page.style.visibility).toBe("hidden");
      return { height: 431.8 };
    };
    expect(measurePopupPageHeight(shell, chrome, page)).toEqual({
      height: 479.8,
      header: 48,
    });
    expect(page.hidden).toBe(true);
    expect(page.getAttribute("style")).toBe(initialStyle);
  });

  test("opens the default text view using page height instead of its tiny initial viewport", () => {
    render();
    expect(container.querySelector("output").textContent).toBe("480");
    expect(
      document.documentElement.classList.contains("kt-toolbar-popup--text")
    ).toBe(true);
    expect(document.documentElement.scrollTop).toBe(0);
  });

  test("keeps the same page instance and restores page scrolling on return", () => {
    render();
    const page = container.querySelector("[data-page]");
    render({ activeTab: "page" });
    expect(container.querySelector("[data-page]")).toBe(page);
    expect(container.querySelector("output").textContent).toBe("480");
    expect(
      document.documentElement.classList.contains("kt-toolbar-popup--text")
    ).toBe(false);
    expect(document.documentElement.scrollTop).toBe(180);
    render();
    act(() => root.unmount());
    expect(
      document.documentElement.classList.contains("kt-toolbar-popup--text")
    ).toBe(false);
    expect(document.documentElement.scrollTop).toBe(180);
  });

  test("updates the reference from page geometry on resize without using viewport height", () => {
    jest.useFakeTimers();
    render();
    bodyHeight = 400;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      jest.advanceTimersByTime(30);
    });
    expect(container.querySelector("output").textContent).toBe("448");
  });

  test("leaves separate windows outside toolbar measurement and overflow mode", () => {
    render({ isSeparate: true });
    expect(container.querySelector("output").textContent).toBe("unmeasured");
    expect(
      document.documentElement.classList.contains("kt-toolbar-popup--text")
    ).toBe(false);
    expect(document.documentElement.scrollTop).toBe(180);
  });
});
