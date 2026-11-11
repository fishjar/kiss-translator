import {
  createMenuKeyDownHandler,
  focusMenuTarget,
  getMenuActiveElement,
} from "./menuFocus";

describe.each(["open", "closed"])(
  "menu navigation in a %s shadow root",
  (mode) => {
    let host;
    let shadow;
    let menu;
    let items;
    let navigate;

    beforeEach(() => {
      host = document.createElement("div");
      document.body.appendChild(host);
      shadow = host.attachShadow({ mode });
      menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      shadow.appendChild(menu);
      items = ["Alpha", "Beta", "Disabled", "Bravo"].map((label, index) => {
        const item = document.createElement("button");
        item.setAttribute("role", "menuitem");
        item.tabIndex = -1;
        item.textContent = label;
        if (index === 2) item.setAttribute("aria-disabled", "true");
        menu.appendChild(item);
        return item;
      });
      navigate = createMenuKeyDownHandler({ shadowOnly: true });
      menu.addEventListener("keydown", navigate, true);
      items[0].focus();
    });

    afterEach(() => {
      host.remove();
      jest.restoreAllMocks();
    });

    const press = (key, options = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
        ...options,
      });
      shadow.activeElement.dispatchEvent(event);
      return event;
    };

    test("reads real focus, skips disabled items and wraps at both ends", () => {
      expect(document.activeElement).toBe(host);
      expect(getMenuActiveElement(menu)).toBe(items[0]);
      expect(press("ArrowDown").defaultPrevented).toBe(true);
      expect(shadow.activeElement).toBe(items[1]);
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[3]);
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[0]);
      press("ArrowUp");
      expect(shadow.activeElement).toBe(items[3]);
      press("Home");
      expect(shadow.activeElement).toBe(items[0]);
      press("End");
      expect(shadow.activeElement).toBe(items[3]);
    });

    test("supports repeated letters, word prefixes and timeout reset", () => {
      let now = 1000;
      jest.spyOn(Date, "now").mockImplementation(() => now);
      press("b");
      expect(shadow.activeElement).toBe(items[1]);
      press("b");
      expect(shadow.activeElement).toBe(items[3]);
      now += 600;
      press("b");
      press("r");
      expect(shadow.activeElement).toBe(items[3]);
      now += 600;
      press("a");
      expect(shadow.activeElement).toBe(items[0]);
    });

    test("keeps Select arrow navigation at its boundaries while typeahead can wrap", () => {
      menu.removeEventListener("keydown", navigate, true);
      menu.addEventListener(
        "keydown",
        createMenuKeyDownHandler({
          shadowOnly: true,
          disableListWrap: true,
        }),
        true
      );
      press("ArrowUp");
      expect(shadow.activeElement).toBe(items[0]);
      press("End");
      press("ArrowDown");
      expect(shadow.activeElement).toBe(items[3]);
      press("a");
      expect(shadow.activeElement).toBe(items[0]);
    });

    test("keeps handled keys out of MUI and leaves dismissal and activation to callers", () => {
      const bubble = jest.fn();
      menu.addEventListener("keydown", bubble);
      press("ArrowDown");
      press("z");
      expect(bubble).not.toHaveBeenCalled();
      for (const key of ["Escape", "Tab", "Enter", " "]) {
        expect(press(key).defaultPrevented).toBe(false);
      }
      expect(bubble).toHaveBeenCalledTimes(4);
      expect(press("a", { ctrlKey: true }).defaultPrevented).toBe(false);
      expect(shadow.activeElement).toBe(items[1]);
    });
  }
);

test("leaves document menus to MUI when shadowOnly is enabled", () => {
  const menu = document.createElement("div");
  menu.innerHTML =
    '<button role="menuitem">Alpha</button><button role="menuitem">Beta</button>';
  document.body.appendChild(menu);
  menu.addEventListener(
    "keydown",
    createMenuKeyDownHandler({ shadowOnly: true }),
    true
  );
  const first = menu.firstElementChild;
  first.focus();
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  });
  first.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(first);
  menu.remove();
});

describe("focusMenuTarget", () => {
  const buildPaper = ({ disabledFirst = false } = {}) => {
    const paper = document.createElement("div");
    paper.setAttribute("role", "menu");
    const fallback = document.createElement("button");
    fallback.setAttribute("role", "menuitem");
    fallback.tabIndex = -1;
    fallback.textContent = "Enabled";
    paper.appendChild(fallback);
    if (disabledFirst) {
      const disabled = document.createElement("button");
      disabled.setAttribute("role", "menuitem");
      disabled.tabIndex = -1;
      disabled.disabled = true;
      disabled.textContent = "Disabled";
      paper.insertBefore(disabled, fallback);
    }
    document.body.appendChild(paper);
    return { paper, fallback };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    document
      .querySelectorAll('[role="menu"], [role="listbox"]')
      .forEach((paper) => paper.remove());
  });

  test("skips a natively disabled selected option and falls back to a usable candidate", () => {
    // 选中项族与可用项族同口径排除原生 disabled：禁用选中项不得成为
    // 交接目标，须由回退链交给仍可用的候选项。
    const paper = document.createElement("div");
    paper.setAttribute("role", "listbox");
    const disabledSelected = document.createElement("button");
    disabledSelected.setAttribute("role", "option");
    disabledSelected.setAttribute("aria-selected", "true");
    disabledSelected.disabled = true;
    const usable = document.createElement("button");
    usable.setAttribute("role", "menuitem");
    usable.tabIndex = -1;
    paper.append(disabledSelected, usable);
    document.body.appendChild(paper);
    expect(focusMenuTarget(paper)).toBe(usable);
    expect(document.activeElement).toBe(usable);
  });

  test("treats menuitemradio rows as eligible initial focus targets", () => {
    // 键盘导航候选用 [role^="menuitem"] 覆盖 menuitemradio；
    // 初始焦点候选口径不得比导航口径窄，否则该类面板打开时无落点。
    const paper = document.createElement("div");
    paper.setAttribute("role", "menu");
    const row = document.createElement("button");
    row.setAttribute("role", "menuitemradio");
    row.tabIndex = -1;
    paper.appendChild(row);
    document.body.appendChild(paper);
    expect(focusMenuTarget(paper)).toBe(row);
  });

  test("prefers the checked menuitemradio over earlier unchecked rows", () => {
    // 已选口径须纳入 menuitemradio[aria-checked="true"]：数据单选菜单打开
    // 时焦点落在勾选行，而非排在它前面的未选中条目。
    const paper = document.createElement("div");
    paper.setAttribute("role", "menu");
    const unchecked = document.createElement("button");
    unchecked.setAttribute("role", "menuitemradio");
    unchecked.tabIndex = -1;
    const checked = document.createElement("button");
    checked.setAttribute("role", "menuitemradio");
    checked.setAttribute("aria-checked", "true");
    checked.tabIndex = -1;
    paper.append(unchecked, checked);
    document.body.appendChild(paper);
    expect(focusMenuTarget(paper)).toBe(checked);
    expect(document.activeElement).toBe(checked);
  });

  test("skips a hidden selected option and falls back to a visible candidate", () => {
    // 选择器不吃 hidden 派生态（display:none 不落入 :disabled /
    // aria-disabled）：隐藏的已选项必须先被过滤，焦点交给可见候选。
    const paper = document.createElement("div");
    paper.setAttribute("role", "listbox");
    const hiddenSelected = document.createElement("button");
    hiddenSelected.setAttribute("role", "option");
    hiddenSelected.setAttribute("aria-selected", "true");
    hiddenSelected.hidden = true;
    const visible = document.createElement("button");
    visible.setAttribute("role", "menuitem");
    visible.tabIndex = -1;
    paper.append(hiddenSelected, visible);
    document.body.appendChild(paper);
    expect(focusMenuTarget(paper)).toBe(visible);
    expect(document.activeElement).toBe(visible);
  });

  test("skips options hidden by an ancestor's CSS and falls back to visible ones", () => {
    // hidden 属性只是派生态之一：祖先链 display:none 的已选项同样不可聚焦，
    // 可见性判定必须沿祖先链走（选择器无法表达祖先态）。
    const paper = document.createElement("div");
    paper.setAttribute("role", "listbox");
    const collapsed = document.createElement("div");
    collapsed.style.display = "none";
    const collapsedSelected = document.createElement("button");
    collapsedSelected.setAttribute("role", "option");
    collapsedSelected.setAttribute("aria-selected", "true");
    collapsedSelected.tabIndex = -1;
    collapsed.appendChild(collapsedSelected);
    const visible = document.createElement("button");
    visible.setAttribute("role", "menuitem");
    visible.tabIndex = -1;
    paper.append(collapsed, visible);
    document.body.appendChild(paper);
    expect(focusMenuTarget(paper)).toBe(visible);
    expect(document.activeElement).toBe(visible);
  });

  test("visibility walk stops at the paper and ignores hidden ancestors outside it", () => {
    // 可见性判定以 paper 为界：菜单外的隐藏祖先（页面滚动容器临时折叠等）
    // 与候选可见性无关，不读其计算样式——paper 在外层隐藏包装内时，paper
    // 内部的候选仍按 paper 内布局判定。
    const outer = document.createElement("div");
    outer.style.display = "none";
    const paper = document.createElement("div");
    paper.setAttribute("role", "listbox");
    const selected = document.createElement("button");
    selected.setAttribute("role", "option");
    selected.setAttribute("aria-selected", "true");
    selected.tabIndex = -1;
    paper.appendChild(selected);
    outer.appendChild(paper);
    document.body.appendChild(outer);
    expect(focusMenuTarget(paper)).toBe(selected);
    expect(document.activeElement).toBe(selected);
    outer.remove();
  });

  test("keyboard navigation skips items hidden by an ancestor's CSS", () => {
    // getMenuItems 与焦点候选共用同一可见性判定：祖先链 display:none 的
    // 条目不得进入方向键导航序列。
    const paper = document.createElement("div");
    paper.setAttribute("role", "menu");
    const collapsed = document.createElement("div");
    collapsed.style.display = "none";
    const hiddenItem = document.createElement("button");
    hiddenItem.setAttribute("role", "menuitem");
    hiddenItem.tabIndex = -1;
    hiddenItem.textContent = "Hidden";
    collapsed.appendChild(hiddenItem);
    const visibleItem = document.createElement("button");
    visibleItem.setAttribute("role", "menuitem");
    visibleItem.tabIndex = -1;
    visibleItem.textContent = "Visible";
    paper.append(collapsed, visibleItem);
    document.body.appendChild(paper);
    visibleItem.focus();
    paper.addEventListener(
      "keydown",
      createMenuKeyDownHandler({ shadowOnly: false }),
      true
    );
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    visibleItem.dispatchEvent(event);
    expect(document.activeElement).toBe(visibleItem);
    paper.remove();
  });

  test("never picks a natively disabled menu item as the focus target", () => {
    // 候选族只挡 .Mui-disabled/aria-disabled 时，原生 <button disabled> 仍会被选中。
    const { paper, fallback } = buildPaper({ disabledFirst: true });
    expect(focusMenuTarget(paper)).toBe(fallback);
    expect(document.activeElement).toBe(fallback);
  });

  test("converts the Grow scale ratio back to layout scroll coordinates", () => {
    // 缩放过渡期 rect 为视觉坐标：视觉差 75 ÷ 比例 0.75 = 布局差 100，
    // 居中偏移 (200-40)/2 = 80 → scrollTop += 20；混算旧实现得 −5。
    const { paper, fallback } = buildPaper();
    Object.defineProperty(paper, "offsetHeight", {
      value: 200,
      configurable: true,
    });
    Object.defineProperty(paper, "clientHeight", {
      value: 200,
      configurable: true,
    });
    Object.defineProperty(fallback, "offsetHeight", {
      value: 40,
      configurable: true,
    });
    jest.spyOn(paper, "getBoundingClientRect").mockReturnValue({
      top: 125,
      height: 150,
    });
    jest.spyOn(fallback, "getBoundingClientRect").mockReturnValue({
      top: 200,
    });
    expect(focusMenuTarget(paper)).toBe(fallback);
    expect(paper.scrollTop).toBe(20);
  });

  test("falls back to a ratio of 1 when paper height is unavailable", () => {
    // 高度不可用（视觉高度 0）按 1 兜底：布局差 50 − 居中 80 → scrollTop = −30。
    const { paper, fallback } = buildPaper();
    Object.defineProperty(paper, "offsetHeight", {
      value: 200,
      configurable: true,
    });
    Object.defineProperty(paper, "clientHeight", {
      value: 200,
      configurable: true,
    });
    Object.defineProperty(fallback, "offsetHeight", {
      value: 40,
      configurable: true,
    });
    jest.spyOn(paper, "getBoundingClientRect").mockReturnValue({
      top: 100,
      height: 0,
    });
    jest.spyOn(fallback, "getBoundingClientRect").mockReturnValue({
      top: 150,
    });
    expect(focusMenuTarget(paper)).toBe(fallback);
    expect(paper.scrollTop).toBe(-30);
  });
});
