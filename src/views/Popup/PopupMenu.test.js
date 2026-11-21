/* eslint-disable testing-library/no-unnecessary-act, testing-library/no-container */
import { act, useEffect, useState } from "react";
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
    // 三键同给（对齐 TranForm selectMenuProps 的同一契约）：MUI Menu/MenuList
    // 的容器聚焦腿与项腿全关，不与本组件 scriptFocus 的焦点交接竞争。本用例
    // 钉"容器不抢焦"：ul 不得被 MUI 自动聚焦路径调用 focus()（正常交接只应
    // 聚焦菜单项）。
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

  test("re-hands focus when an async children update swaps the item set", async () => {
    // 打开→首项聚焦后，children 异步换组（重挂条目集）：首项焦点 effect
    // 只看 open/anchorEl/placementReady 的话不会重触发，旧项卸载后焦点落
    // 空在 body；焦点交接必须随可聚焦项集合的变化补做。
    render();
    const deadline0 = Date.now() + 1000;
    while (Date.now() < deadline0) {
      if (document.activeElement?.textContent === "Style one") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(document.activeElement.textContent).toContain("Style one");

    render({}, [
      <MenuItem key="swap-one">Swap one</MenuItem>,
      <MenuItem key="swap-two">Swap two</MenuItem>,
    ]);
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      if (document.activeElement?.textContent === "Swap one") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(document.activeElement?.textContent).toBe("Swap one");
  });

  test("re-hands focus when an existing item's disabled attribute flips in place", async () => {
    // 就地解禁形态：菜单项节点不替换、childList 零事件，仅 disabled 语义
    // 属性翻转（MUI MenuItem 以 aria-disabled 表达禁用）。观察器只听
    // childList 时补做交接缺席，焦点滞留触发器；attributes 观察使解禁
    // 也重做交接（焦点须落可用项）。
    render({ direction: "down" }, [
      <MenuItem key="style-one" disabled>
        Style one
      </MenuItem>,
      <MenuItem key="style-two" disabled>
        Style two
      </MenuItem>,
    ]);
    anchor.focus();
    const settle = Date.now() + 200;
    while (Date.now() < settle) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    // 前置态：首项交接已尝试过（全部禁用无可落点），焦点滞留触发器。
    expect(document.activeElement).toBe(anchor);
    const firstItem = container.querySelector(
      ".kt-popup-style-menu .MuiMenuItem-root"
    );
    const nodeBefore = firstItem;
    act(() => {
      // MUI 禁用态 = class（Mui-disabled）+ aria-disabled 双属性，就地解禁
      // 二者同翻——观察器的 attributeFilter 须覆盖 class 才能吃到该突变。
      firstItem.classList.remove("Mui-disabled");
      firstItem.removeAttribute("aria-disabled");
    });
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      if (document.activeElement?.textContent === "Style one") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(document.activeElement?.textContent).toBe("Style one");
    // 节点不替换：交接由属性突变触发，而非重挂后的 childList 信号。
    expect(
      container.querySelector(".kt-popup-style-menu .MuiMenuItem-root")
    ).toBe(nodeBefore);
  });

  test("re-hands focus when a stable child inserts items asynchronously", async () => {
    // children 引用不变的稳定 child：内部异步装载（数据到达后 setState 插入
    // 菜单项）不改变 children 身份、也不触发本组件重渲染——渲染期任何签名
    // 都观测不到，paper 子树 childList 变更须作为补做交接的信号。
    function LateHost() {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const timer = setTimeout(() => setReady(true), 30);
        return () => clearTimeout(timer);
      }, []);
      return ready
        ? [
            <MenuItem key="late-one">Late one</MenuItem>,
            <MenuItem key="late-two">Late two</MenuItem>,
          ]
        : [<div key="placeholder" />];
    }
    render({}, [<LateHost key="host" />]);
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (document.activeElement?.textContent === "Late one") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(document.activeElement?.textContent).toBe("Late one");
  });

  test("document menus with listbox role stop at the last item instead of wrapping", () => {
    // listbox 载体（roving tabindex 数据单选）末项按 ArrowDown 不绕回首项；
    // 普通 DOM 与 shadow 宿主两条拓扑同契约，shadow 侧另有专项用例。
    const paper = render({ direction: "down", menuRole: "listbox" }, [
      <div key="opt-one" role="option" tabIndex={0}>
        Style one
      </div>,
      <div key="opt-two" role="option" tabIndex={0}>
        Style two
      </div>,
      <div key="opt-three" role="option" tabIndex={0}>
        Style three
      </div>,
    ]);
    const list = paper.querySelector('[role="listbox"]');
    const items = paper.querySelectorAll('[role="option"]');
    items[2].focus();
    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(document.activeElement).toBe(items[2]);
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
    const paper = render({ direction: "down" }, [
      <MenuItem key="multi-one" role="menuitemcheckbox" aria-checked selected>
        Style one
      </MenuItem>,
      <MenuItem key="multi-two" role="menuitemcheckbox" aria-checked={false}>
        Style two
      </MenuItem>,
      <MenuItem key="multi-three" role="menuitemcheckbox" aria-checked={false}>
        Style three
      </MenuItem>,
    ]);
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
    // Jest 默认不因 console.error 失败，故此处显式断言其发生。
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
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

  test("closes from the trigger via Escape when no item is focusable (document topology)", () => {
    // 非 shadow 拓扑（light DOM）同契约：空菜单 + 焦点停触发器，Escape 经
    // document capture 兜底腿关闭——与影子用例分测 ownerDocument 两路。
    const onClose = jest.fn();
    render({ direction: "down", onClose }, []);
    expect(container.querySelector(".kt-popup-style-menu")).not.toBeNull();
    anchor.focus();
    act(() => {
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "escapeKeyDown");
  });

  test("closes from the trigger via Escape when every menu item is disabled", () => {
    const onClose = jest.fn();
    render({ direction: "down", onClose }, [
      <MenuItem key="style-one" disabled>
        Style one
      </MenuItem>,
      <MenuItem key="style-two" disabled>
        Style two
      </MenuItem>,
    ]);
    const items = container.querySelectorAll(".MuiMenuItem-root");
    expect(items).toHaveLength(2);
    expect(
      Array.from(items).every(
        (item) => item.getAttribute("aria-disabled") === "true"
      )
    ).toBe(true);
    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    act(() => {
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "escapeKeyDown");
  });

  test("lets another open surface own Escape instead of closing this menu", () => {
    // 落点属另一个 MUI Modal 门户面（Dialog/Popover 共用门户）时，关闭语义
    // 归该面自身；本兜底腿若不让位，会在本菜单与其它弹层共存时把本层代关。
    const onClose = jest.fn();
    render({ direction: "down", onClose });
    const dialog = document.createElement("div");
    dialog.className = "MuiModal-root";
    const dialogButton = document.createElement("button");
    dialogButton.textContent = "Dialog action";
    dialog.appendChild(dialogButton);
    container.appendChild(dialog);
    act(() => dialogButton.focus());
    act(() => {
      dialogButton.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector(".kt-popup-style-menu")).not.toBeNull();
    dialog.remove();
  });

  test("closes from the trigger via Tab when no item is focusable (document topology)", () => {
    // 空菜单/全禁用时焦点留在触发器，Tab 事件不经弹层——MUI 自身的
    // tabKeyDown 兜底同样收不到，键盘闭环缺失。文档级兜底腿只补关闭
    // 语义，不阻断焦点转移（Tab 默认行为保留，焦点自然移出）。
    const onClose = jest.fn();
    render({ direction: "down", onClose }, []);
    expect(container.querySelector(".kt-popup-style-menu")).not.toBeNull();
    anchor.focus();
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    act(() => {
      anchor.dispatchEvent(event);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "tabKeyDown");
    expect(event.defaultPrevented).toBe(false);
  });

  test("Tab leg yields to the popup surface and to another open modal surface", () => {
    // 落点属另一个 MUI Modal 门户面时，关闭语义归该面自身，本兜底腿不代
    // 关本层；落点在弹层内时让位给 MUI 自身 tabKeyDown 处理，不双关
    // （onClose 恰一次）。
    const onClose = jest.fn();
    render({ direction: "down", onClose }, [
      <MenuItem key="style-one">Style one</MenuItem>,
    ]);
    const modal = document.createElement("div");
    modal.className = "MuiModal-root";
    const modalInput = document.createElement("input");
    modal.appendChild(modalInput);
    container.appendChild(modal);
    try {
      act(() => modalInput.focus());
      act(() => {
        modalInput.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(container.querySelector(".kt-popup-style-menu")).not.toBeNull();
      const item = container.querySelector(".MuiMenuItem-root");
      act(() => {
        item.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(expect.anything(), "tabKeyDown");
    } finally {
      modal.remove();
    }
  });
});

describe("Popup menu keyboard navigation and focus-scroll sync (shadow host)", () => {
  // 生产拓扑：PopupMenu 经 MUI Popover portal 进 shadow 容器（anchorEl 在
  // shadow 内的 .kt-m3-root 下）。MUI MenuList 的方向键导航读
  // ownerDocument().activeElement，shadow 宿主下被重定向为 host，导致
  // ArrowDown 恒落首项——本组用例钉"shadow 宿主内逐项巡航"的回归锁。
  let container;
  let host;
  let shadowRoot;
  let anchor;
  let root;
  let scrollWrites;
  let restoreMocks;

  beforeEach(() => {
    // jsdom 无布局：scrollTop 赋值是静默 no-op。拦截 div 原型上的写操作，
    // 让"paper.scrollTop += 增量"可被断言（记录写值并落地到实例字段）。
    scrollWrites = [];
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      HTMLDivElement.prototype,
      "scrollTop"
    );
    Object.defineProperty(HTMLDivElement.prototype, "scrollTop", {
      configurable: true,
      get() {
        return this._ktTestScrollTop ?? 0;
      },
      set(value) {
        scrollWrites.push([this, value]);
        this._ktTestScrollTop = value;
      },
    });
    const originalOffsetHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    );
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetWidth"
    );
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        if (this.classList.contains("kt-popup-menu")) return 120;
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
    const realGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;
    const geometry = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function () {
        if (this === anchor) return rectangle(24, 40, 172, 40);
        if (this.classList.contains("kt-popup-menu")) {
          return rectangle(
            Number.parseFloat(this.style.left) || 0,
            Number.parseFloat(this.style.top) || 0,
            this.offsetWidth,
            this.offsetHeight
          );
        }
        if (this.classList.contains("MuiMenuItem-root")) {
          const paper = this.closest(".kt-popup-menu");
          // paper 矩形复用同一 mock 形（style.left/top + 桩化 offset 尺寸），
          // 不绕回原始布局 API——两条路径取的 paper 矩形必须同源。
          const paperRect = paper
            ? paper.getBoundingClientRect()
            : rectangle(0, 0, 0, 0);
          const index = Array.from(
            paper.querySelectorAll(".MuiMenuItem-root")
          ).indexOf(this);
          return rectangle(24, paperRect.top + 8 + index * 34, 172, 34);
        }
        return realGetBoundingClientRect.call(this);
      });

    container = document.createElement("div");
    container.className = "kt-m3-root";
    document.body.appendChild(container);
    host = document.createElement("div");
    shadowRoot = host.attachShadow({ mode: "open" });
    const shadowBox = document.createElement("div");
    shadowBox.className = "kt-m3-root";
    shadowRoot.appendChild(shadowBox);
    container.appendChild(host);
    anchor = document.createElement("button");
    anchor.textContent = "Style";
    shadowBox.appendChild(anchor);
    const renderTarget = document.createElement("div");
    shadowBox.appendChild(renderTarget);
    root = createRoot(renderTarget);

    // 清理必须放 afterEach：Jest 只认 afterEach 的返回清理，beforeEach 的
    // 返回值被忽略——曾致 spy/描述符跨测试堆叠（getBoundingClientRect 层层
    // 包裹后栈溢出）。
    restoreMocks = () => {
      geometry.mockRestore();
      restoreDescriptor(
        HTMLDivElement.prototype,
        "scrollTop",
        originalScrollTop
      );
      restoreDescriptor(
        HTMLElement.prototype,
        "offsetHeight",
        originalOffsetHeight
      );
      restoreDescriptor(
        HTMLElement.prototype,
        "offsetWidth",
        originalOffsetWidth
      );
    };
  });

  function restoreDescriptor(target, name, descriptor) {
    if (descriptor) Object.defineProperty(target, name, descriptor);
    else delete target[name];
  }

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    restoreMocks();
  });

  async function renderShadow(props = {}, children) {
    await act(async () => {
      root.render(
        <PopupMenu
          anchorEl={anchor}
          open
          onClose={jest.fn()}
          className="kt-popup-style-menu"
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
      );
    });
    // focusFirstItem 挂在 requestAnimationFrame 里，且该 rAF 在 placement 二次
    // 渲染后由 effect 排程——act 收尾会丢掉这个排队帧，须在 act 外等真实时钟
    // 让回调 firing（回调只做 focus 与 scrollTop 写入，无 React 状态更新）。
    // 条件轮询代替固定 60ms：等 shadowRoot.activeElement 落进菜单 Paper 内，
    // 1s 期限到达后无论如何返回 Paper（断言自身会兜住未就位形态）。
    const deadline = Date.now() + 1000;
    const paper = shadowRoot.querySelector(".kt-popup-style-menu");
    while (Date.now() < deadline) {
      const active = shadowRoot.activeElement;
      if (paper && active && paper.contains(active)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return shadowRoot.querySelector(".kt-popup-style-menu");
  }

  test("shadow host: ArrowDown advances to the next item instead of restarting at the first", async () => {
    const paper = await renderShadow({ direction: "down" });
    const list = paper.querySelector('[role="menu"]');
    const items = paper.querySelectorAll(".MuiMenuItem-root");
    items[1].focus();
    expect(shadowRoot.activeElement).toBe(items[1]);

    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(shadowRoot.activeElement).toBe(items[2]);
  });

  test("shadow host: listbox role stops at the last item instead of wrapping", async () => {
    const paper = await renderShadow(
      { direction: "down", menuRole: "listbox" },
      [
        <div key="opt-one" role="option" tabIndex={0}>
          Style one
        </div>,
        <div key="opt-two" role="option" tabIndex={0}>
          Style two
        </div>,
        <div key="opt-three" role="option" tabIndex={0}>
          Style three
        </div>,
      ]
    );
    const list = paper.querySelector('[role="listbox"]');
    const items = paper.querySelectorAll('[role="option"]');
    items[2].focus();

    act(() => {
      list.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    expect(shadowRoot.activeElement).toBe(items[2]);
  });

  test("opening with a selected item syncs paper scroll to the focused row", async () => {
    const paper = await renderShadow({ direction: "down" });
    // scriptFocus 聚焦选中项后必须把当前项滚入 paper 视区：scrollTop 只加
    // 视口矩形增量（选中项 rect.top − paper rect.top；jsdom clientHeight/
    // offsetHeight 均为 0，故期望值即两项 rect.top 之差）。jsdom 的 scrollTop
    // 赋值是 no-op，故经原型拦截记录写操作断言。焦点-滚动脱节（重开时焦点
    // 在选中项、滚动条仍在顶部）即此断言红。
    const selected = paper.querySelector(".MuiMenuItem-root");
    const paperRect = paper.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const expected =
      selectedRect.top -
      paperRect.top -
      (paper.clientHeight - selected.offsetHeight) / 2;
    const paperWrite = scrollWrites.find(([el]) => el === paper);
    expect(paperWrite).toBeDefined();
    expect(paperWrite[1]).toBe(expected);
  });

  test("opening with an out-of-viewport selected item scrolls it into view", async () => {
    // 选中项在 paper 视口之外（第 4 行：paperRect.top + 8 + 3*34 = +110，
    // paper 高 120 仅容前 3 行）：滚动增量必须把它推回可视区，写入值与
    // 视口内用例同公式（jsdom clientHeight 0，居中偏移同为 −17）。
    const paper = await renderShadow({ direction: "down" }, [
      <MenuItem key="style-one">Style one</MenuItem>,
      <MenuItem key="style-two">Style two</MenuItem>,
      <MenuItem key="style-three">Style three</MenuItem>,
      <MenuItem key="style-four" selected>
        Style four
      </MenuItem>,
    ]);
    const selected = paper.querySelectorAll(".MuiMenuItem-root")[3];
    const paperRect = paper.getBoundingClientRect();
    const selectedRect = selected.getBoundingClientRect();
    const expected =
      selectedRect.top -
      paperRect.top -
      (paper.clientHeight - selected.offsetHeight) / 2;
    const paperWrite = scrollWrites.find(([el]) => el === paper);
    expect(paperWrite).toBeDefined();
    expect(paperWrite[1]).toBe(expected);
    expect(paperWrite[1]).toBeGreaterThan(0);
    expect(shadowRoot.activeElement).toBe(selected);
  });

  test("closes from the trigger via Escape when every menu item is disabled", async () => {
    const onClose = jest.fn();
    await renderShadow({ direction: "down", onClose }, [
      <MenuItem key="style-one" disabled>
        Style one
      </MenuItem>,
      <MenuItem key="style-two" disabled>
        Style two
      </MenuItem>,
    ]);
    const items = shadowRoot.querySelectorAll(".MuiMenuItem-root");
    expect(items).toHaveLength(2);
    expect(
      Array.from(items).every(
        (item) => item.getAttribute("aria-disabled") === "true"
      )
    ).toBe(true);
    anchor.focus();
    expect(shadowRoot.activeElement).toBe(anchor);
    act(() => {
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "escapeKeyDown");
  });

  test("closes from the trigger via Escape when the menu has no focusable item", async () => {
    // 空菜单/全禁用时 focusFirstItem 无落点，且 autoFocus 三键全关使焦点留
    // 触发器；MUI 自身的 Escape 缝（modal 根 onKeyDown、MenuList keydown）
    // 都要求事件路径经过弹层子树——焦点在触发器时按键不经弹层，键盘闭环
    // 缺失即此断言红。
    const onClose = jest.fn();
    await renderShadow({ direction: "down", onClose }, []);
    expect(shadowRoot.querySelector(".kt-popup-style-menu")).not.toBeNull();
    anchor.focus();
    expect(shadowRoot.activeElement).toBe(anchor);
    act(() => {
      anchor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
          composed: true,
        })
      );
    });
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "escapeKeyDown");
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
