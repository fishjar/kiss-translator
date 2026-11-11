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
      restoreDescriptor(HTMLDivElement.prototype, "scrollTop", originalScrollTop);
      restoreDescriptor(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
      restoreDescriptor(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
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
});
