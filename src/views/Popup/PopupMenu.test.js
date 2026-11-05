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

  function render(props = {}, children) {
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
          {children ?? [
            <MenuItem key="style-one" selected>
              Style one
            </MenuItem>,
            <MenuItem key="style-two">Style two</MenuItem>,
            <MenuItem key="style-three">Style three</MenuItem>,
          ]}
        </PopupMenu>
      )
    );
    return container.querySelector(".kt-popup-style-menu");
  }

  test("menu list container never seizes focus (autoFocus leg off)", () => {
    // 三键同给（对齐 TranForm selectMenuProps 的在册契约）：disableAutoFocusItem
    // 只关 MUI Menu 的项腿，autoFocus 腿（Menu.js:192 → MenuList 容器聚焦）仍在，
    // 会与本组件 scriptFocus 的焦点交接竞争。本用例钉"容器不抢焦"：ul 不得被
    // MUI 自动聚焦路径调用 focus()（正常交接只应聚焦菜单项）。
    const focusCalls = [];
    const ulFocusSpy = jest
      .spyOn(HTMLUListElement.prototype, "focus")
      .mockImplementation(function () {
        focusCalls.push(this);
      });
    try {
      render();
      expect(focusCalls).toHaveLength(0);
    } finally {
      ulFocusSpy.mockRestore();
    }
  });

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

  test("does not declare aria-multiselectable by default (single-select menus unchanged)", () => {
    const paper = render({ direction: "down" });
    const list = paper.querySelector('[role="menu"]');
    expect(list).not.toBeNull();
    expect(list.hasAttribute("aria-multiselectable")).toBe(false);
  });

  test("never declares aria-multiselectable (menu role forbids it; multi-select semantics live on menuitemcheckbox rows)", () => {
    // 多选语义承载于行级 role="menuitemcheckbox"+aria-checked（生产先例
    // PopupTextPanel.js:710-714）；PopupMenu 无 multiSelect prop（固定解构
    // 无 rest 透传），多选形态由 children 直接给出 checkbox 行来实证。
    const paper = render(
      { direction: "down" },
      [
        <MenuItem key="multi-one" role="menuitemcheckbox" aria-checked selected>
          Style one
        </MenuItem>,
        <MenuItem
          key="multi-two"
          role="menuitemcheckbox"
          aria-checked={false}
        >
          Style two
        </MenuItem>,
        <MenuItem
          key="multi-three"
          role="menuitemcheckbox"
          aria-checked={false}
        >
          Style three
        </MenuItem>,
      ]
    );
    const list = paper.querySelector('[role="menu"]');
    expect(list).not.toBeNull();
    // aria-multiselectable 非法于 role="menu"。
    expect(list.hasAttribute("aria-multiselectable")).toBe(false);
    // 多选形态契约钉：checkbox 行数 > 0（伪闸防线——若 children 被
    // 静默丢弃或 role 透传失效，此断言即红）。
    expect(
      list.querySelectorAll('[role="menuitemcheckbox"]').length
    ).toBeGreaterThan(0);
  });

  test("never hands Menu a Fragment child (MUI rejects that shape outright)", () => {
    // 事实依据：MenuList.js:196-200 在非 production 对 Fragment 子节点直接
    // console.error("MUI: The Menu component doesn't accept a Fragment as a
    // child.")；MenuList.js:185-215 的 selected 前瞻与 :216-228 的 tabIndex 注入
    // 都按 React.Children 逐项计数，Fragment 让它只看到一个"项"。
    // Jest 默认不因 console.error 失败，故此处显式取证。
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      render({ direction: "down" });
      const fragmentComplaint = errorSpy.mock.calls
        .map((args) => args.join(" "))
        .filter((text) => /Fragment as a child/.test(text));
      expect(fragmentComplaint).toEqual([]);
    } finally {
      errorSpy.mockRestore();
    }
  });

  test("MenuList sees every item as its own child", () => {
    // 形状同构的可观测面：MenuList 逐子项计数后，列表里应有 3 个菜单项节点，
    // 且已选项在 selectedMenu 变体下被识别为活动项（不因包装节点而塌成一个）。
    const paper = render({ direction: "down" });
    const items = paper.querySelectorAll(".MuiMenuItem-root");
    expect(items).toHaveLength(3);
  });
});
