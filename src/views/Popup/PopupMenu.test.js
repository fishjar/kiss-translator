/* eslint-disable testing-library/no-unnecessary-act, testing-library/no-container */
import { act } from "react";
import { createRoot } from "react-dom/client";
import MenuItem from "@mui/material/MenuItem";
import PopupMenu from "./PopupMenu";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function rectangle(left, top, width, height) {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

describe("Popup menu placement", () => {
  let container;
  let anchor;
  let root;
  let anchorTop;
  let anchorHeight;
  let viewportHeight;
  let scrollBy;
  let originalInnerHeight;
  let originalInnerWidth;
  let originalScrollingElement;
  let originalScrollHeight;
  let originalClientHeight;
  let originalOffsetHeight;
  let originalOffsetWidth;
  let geometry;

  beforeEach(() => {
    viewportHeight = 400;
    anchorTop = 240;
    anchorHeight = 40;
    const documentElement = document.documentElement;
    originalInnerHeight = Object.getOwnPropertyDescriptor(
      window,
      "innerHeight"
    );
    originalInnerWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
    originalScrollingElement = Object.getOwnPropertyDescriptor(
      document,
      "scrollingElement"
    );
    originalScrollHeight = Object.getOwnPropertyDescriptor(
      documentElement,
      "scrollHeight"
    );
    originalClientHeight = Object.getOwnPropertyDescriptor(
      documentElement,
      "clientHeight"
    );
    originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    );
    originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth"
    );
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get: () => viewportHeight,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 396,
    });
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      get: () => documentElement,
    });
    Object.defineProperty(documentElement, "scrollHeight", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(documentElement, "clientHeight", {
      configurable: true,
      get: () => viewportHeight,
    });
    documentElement.scrollTop = 0;
    scrollBy = jest.spyOn(window, "scrollBy").mockImplementation(({ top }) => {
      documentElement.scrollTop += top;
    });

    // JSDOM does not lay out the Paper. Give real MUI positioning the clipped
    // border-box geometry it would receive from the browser, including its
    // default minimum height, so secondary viewport clamping remains active.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        if (this.classList.contains("kt-popup-menu")) {
          const limit = Number.parseFloat(this.style.maxHeight);
          return Math.max(
            16,
            Math.min(250, Number.isFinite(limit) ? limit : 250)
          );
        }
        return originalOffsetHeight.get.call(this);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return this.classList.contains("kt-popup-menu")
          ? 322
          : originalOffsetWidth.get.call(this);
      },
    });
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    geometry = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this === anchor) {
          return rectangle(
            24,
            anchorTop - documentElement.scrollTop,
            172,
            anchorHeight
          );
        }
        if (this.classList.contains("kt-popup-menu")) {
          return rectangle(
            Number.parseFloat(this.style.left) || 0,
            Number.parseFloat(this.style.top) || 0,
            this.offsetWidth,
            this.offsetHeight
          );
        }
        return getBoundingClientRect.call(this);
      });

    container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    anchor = document.createElement("button");
    anchor.textContent = "Style";
    container.appendChild(anchor);
    const renderTarget = document.createElement("div");
    container.appendChild(renderTarget);
    root = createRoot(renderTarget);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.classList.remove("kt-toolbar-popup");
    document.documentElement.classList.remove("kt-toolbar-popup--text");
    document.documentElement.scrollTop = 0;
    scrollBy.mockRestore();
    geometry.mockRestore();
    const restore = (target, name, descriptor) => {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else delete target[name];
    };
    restore(window, "innerHeight", originalInnerHeight);
    restore(window, "innerWidth", originalInnerWidth);
    restore(document, "scrollingElement", originalScrollingElement);
    restore(document.documentElement, "scrollHeight", originalScrollHeight);
    restore(document.documentElement, "clientHeight", originalClientHeight);
    restore(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    restore(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
  });

  function render(props = {}) {
    act(() =>
      root.render(
        <PopupMenu
          anchorEl={anchor}
          open
          onClose={jest.fn()}
          className="kt-popup-style-menu"
          estimatedHeight={250}
          {...props}
        >
          <MenuItem selected>Style one</MenuItem>
          <MenuItem>Style two</MenuItem>
          <MenuItem>Style three</MenuItem>
        </PopupMenu>
      )
    );
    return container.querySelector(".kt-popup-style-menu");
  }

  function expectDownwardPlacement(paper) {
    const triggerBounds = anchor.getBoundingClientRect();
    const menuBounds = paper.getBoundingClientRect();
    expect(menuBounds.top).toBeGreaterThanOrEqual(triggerBounds.bottom + 4);
    expect(menuBounds.bottom).toBeLessThanOrEqual(viewportHeight - 8);
    expect(menuBounds.height).toBeLessThanOrEqual(
      viewportHeight - menuBounds.top - 8
    );
  }

  test("stays below its trigger when there is more room above and lets MUI constrain its height", () => {
    const paper = render({ direction: "down" });
    expect(paper).not.toBeNull();
    expect(anchor.getBoundingClientRect().top - 12).toBeGreaterThan(
      viewportHeight - anchor.getBoundingClientRect().bottom - 12
    );
    expectDownwardPlacement(paper);
    expect(paper.offsetHeight).toBeLessThan(250);
    expect(paper.style.overflowY).toBe("auto");
    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("makes room for a complete row in a short native popup and repositions after resizing", () => {
    viewportHeight = 255;
    anchorTop = 210;
    document.documentElement.classList.add("kt-toolbar-popup");
    anchor.focus();
    const paper = render({ direction: "down" });
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "instant" })
    );
    expect(document.documentElement.scrollTop).toBeGreaterThan(0);
    expectDownwardPlacement(paper);
    // A 34px style row plus the menu's 16px padding must fit.
    expect(paper.offsetHeight).toBeGreaterThanOrEqual(50);

    const firstScrollTop = document.documentElement.scrollTop;
    viewportHeight = 220;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(document.documentElement.scrollTop).toBeGreaterThan(firstScrollTop);
    expectDownwardPlacement(paper);
    expect(paper.offsetHeight).toBeGreaterThanOrEqual(50);

    const finalScrollTop = document.documentElement.scrollTop;
    render({ direction: "down", open: false });
    expect(container.querySelector(".kt-popup-style-menu")).toBeNull();
    expect(document.activeElement).toBe(anchor);
    expect(document.documentElement.scrollTop).toBe(finalScrollTop);
    scrollBy.mockClear();
    act(() => window.dispatchEvent(new Event("resize")));
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("keeps automatic upward placement without scrolling a non-toolbar document", () => {
    viewportHeight = 255;
    anchorTop = 210;
    const paper = render();
    const menuBounds = paper.getBoundingClientRect();
    const triggerBounds = anchor.getBoundingClientRect();
    expect(menuBounds.bottom).toBeLessThanOrEqual(triggerBounds.top - 4);
    expect(menuBounds.top).toBeGreaterThanOrEqual(8);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  test("scrolls the whole text popup to make room below the provider menu", () => {
    viewportHeight = 255;
    anchorTop = 170;
    document.documentElement.classList.add(
      "kt-toolbar-popup",
      "kt-toolbar-popup--text"
    );
    const paper = render({ direction: "down" });
    expectDownwardPlacement(paper);
    expect(paper.offsetHeight).toBeGreaterThanOrEqual(50);
    expect(scrollBy).toHaveBeenCalled();
    expect(document.documentElement.scrollTop).toBeGreaterThan(0);
  });

  test("menu list container never seizes focus (three-key contract off)", () => {
    // 三键同给（autoFocus=false + disableAutoFocus + disableAutoFocusItem）
    // 确保 MUI 不自动聚焦 ul 容器。焦点交接唯一所有权归 scriptFocus
    // （focusFirstItem 主动交付给选中项）。spy HTMLUListElement.prototype.focus
    // 断言 render 后 ul.focus 未被调用——容器不抢焦。
    const focusCalls = [];
    const ulFocusSpy = jest
      .spyOn(HTMLUListElement.prototype, "focus")
      .mockImplementation(function () {
        focusCalls.push(this);
      });
    try {
      render({ direction: "down" });
      expect(focusCalls).toHaveLength(0);
    } finally {
      ulFocusSpy.mockRestore();
    }
  });
});

describe("PopupMenu focus contract locks", () => {
  // 轻量夹具：.kt-m3-root 内锚点 + 渲染靶点（与生产入口同构，无 shadow）。
  function mountMenuFixture() {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const m3Root = document.createElement("div");
    m3Root.className = "kt-m3-root";
    host.appendChild(m3Root);
    const anchorEl = document.createElement("button");
    anchorEl.textContent = "Style";
    m3Root.appendChild(anchorEl);
    const renderTarget = document.createElement("div");
    m3Root.appendChild(renderTarget);
    const root = createRoot(renderTarget);
    const render = (children) =>
      act(() =>
        root.render(
          <PopupMenu
            anchorEl={anchorEl}
            open
            onClose={jest.fn()}
            className="kt-popup-style-menu"
            estimatedHeight={250}
          >
            {children}
          </PopupMenu>
        )
      );
    return { host, root, render };
  }

  // rAF 间 Flush：focusFirstItem 由 requestAnimationFrame(placementReady)
  // 触发，间谍截获回调后统一在 act 内执行并清空，防跨用例串扰。
  async function flushFocusFrames(rafSpy) {
    await act(async () => {
      rafSpy.mock.calls.forEach((call) => call[0](16));
      rafSpy.mockClear();
    });
  }

  test("hands focus to the selected item and never to the ul container", async () => {
    // 焦点交接唯一所有权归 scriptFocus（focusFirstItem）：打开后焦点落
    // Mui-selected 项；三键同给（autoFocus=false + disableAutoFocus +
    // disableAutoFocusItem）下 MenuList 容器零聚焦腿——ul.focus 恒不调用。
    const rafSpy = jest.spyOn(window, "requestAnimationFrame");
    const ulFocusSpy = jest
      .spyOn(HTMLUListElement.prototype, "focus")
      .mockImplementation(() => {});
    const { host, root, render } = mountMenuFixture();
    try {
      render(<MenuItem selected>Selected item</MenuItem>);
      await flushFocusFrames(rafSpy);
      const paper = document.querySelector(".kt-popup-style-menu");
      const selected = paper.querySelector(".MuiMenuItem-root.Mui-selected");
      expect(selected).not.toBeNull();
      expect(document.activeElement).toBe(selected);
      expect(document.activeElement).not.toBe(paper.querySelector("ul"));
      expect(ulFocusSpy).not.toHaveBeenCalled();
    } finally {
      ulFocusSpy.mockRestore();
      rafSpy.mockRestore();
      act(() => root.unmount());
      host.remove();
    }
  });

  test("leaves focus untouched when no focusable item exists (no container fallback)", async () => {
    // 容器零焦点（宁缺勿错）：全部项不可聚焦时 focusFirstItem 不聚焦任何
    // 目标——严禁回退聚焦 [role="menu"] / ul 容器本体。
    const rafSpy = jest.spyOn(window, "requestAnimationFrame");
    const { host, root, render } = mountMenuFixture();
    try {
      render(<MenuItem disabled>Disabled item</MenuItem>);
      await flushFocusFrames(rafSpy);
      const paper = document.querySelector(".kt-popup-style-menu");
      expect(document.activeElement).not.toBe(paper.querySelector("ul"));
      expect(paper.contains(document.activeElement)).toBe(false);
    } finally {
      rafSpy.mockRestore();
      act(() => root.unmount());
      host.remove();
    }
  });

  test("isShadowMenu resolves true for shadow-mounted menus", () => {
    // isShadowMenu 判据的挂载拓扑前提锁：anchor 在 shadow root 内的
    // .kt-m3-root 中时，菜单最终挂载进 ShadowRoot（而非 document.body），
    // 容器根 getRootNode()=ShadowRoot、.host 存在。本用例只验证拓扑前提
    // 本身，不覆盖 disableEnforceFocus 的行为面（后者由三键 prop 与
    // FocusTrap 行为锁另行覆盖）。
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const m3Root = document.createElement("div");
    m3Root.className = "kt-m3-root";
    shadow.appendChild(m3Root);
    const shadowAnchor = document.createElement("button");
    shadowAnchor.textContent = "Shadow";
    m3Root.appendChild(shadowAnchor);
    const shadowRenderTarget = document.createElement("div");
    m3Root.appendChild(shadowRenderTarget);
    const shadowRootInstance = createRoot(shadowRenderTarget);

    try {
      act(() =>
        shadowRootInstance.render(
          <PopupMenu
            anchorEl={shadowAnchor}
            open
            onClose={jest.fn()}
            className="kt-popup-style-menu"
            estimatedHeight={250}
          >
            <MenuItem selected>Shadow item</MenuItem>
          </PopupMenu>
        )
      );
      // 菜单应挂载到 shadow root 内的 .kt-m3-root（而非 document.body）
      const paper = m3Root.querySelector(".kt-popup-style-menu");
      expect(paper).not.toBeNull();
      // 验证 paper 在 shadow root 内（getRootNode() 返回 ShadowRoot）
      expect(paper.getRootNode()).toBe(shadow);
    } finally {
      act(() => shadowRootInstance.unmount());
      host.remove();
    }
  });
});
