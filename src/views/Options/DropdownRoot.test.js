/* eslint-disable testing-library/no-unnecessary-act */
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import OptionsTheme from "./OptionsTheme";
import DropdownRoot from "./DropdownRoot";
import ReusableAutocomplete from "./ReusableAutocomplete";
import { notePointerInteraction } from "../../hooks/focusModality";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light" }),
}));
jest.mock("../../hooks/SystemColorScheme", () => ({
  useSystemDarkPreference: () => false,
}));

let container;
let root;
const outsideClick = jest.fn();

beforeEach(() => {
  outsideClick.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mountSelect({ multiple = false, open = true } = {}) {
  function Harness() {
    const [value, setValue] = useState(multiple ? ["a"] : "a");
    return (
      <StrictMode>
        <OptionsTheme>
          <TextField
            select
            label="Mode"
            value={value}
            SelectProps={{ multiple }}
            onChange={(event) => setValue(event.target.value)}
          >
            <MenuItem value="a">First</MenuItem>
            <MenuItem value="b">Second</MenuItem>
          </TextField>
          <button onClick={outsideClick}>Other control</button>
        </OptionsTheme>
      </StrictMode>
    );
  }
  act(() => root.render(<Harness />));
  const trigger = container.querySelector('[role="combobox"]');
  trigger.parentElement.getBoundingClientRect = () => ({
    top: 100,
    bottom: 148,
    left: 100,
    right: 360,
    width: 260,
    height: 48,
  });
  if (open) {
    act(() => Simulate.mouseDown(trigger, { button: 0 }));
  }
  return trigger;
}

const listbox = () => document.querySelector('[role="listbox"]');
const dispatch = (target, event) => act(() => target.dispatchEvent(event));

test("keeps the page accessible and dismisses on the first unconsumed wheel gesture", () => {
  const trigger = mountSelect();
  expect(listbox()).not.toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(container.getAttribute("aria-hidden")).toBeNull();
  expect(document.activeElement.textContent).toBe("First");
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });
  dispatch(container, event);
  expect(event.defaultPrevented).toBe(false);
  expect(listbox()).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

test.each(["wheel", "touchmove", "scroll"])(
  "keeps internal %s events in a multi-select menu, then closes on page scroll",
  (type) => {
    const trigger = mountSelect({ multiple: true });
    dispatch(listbox(), new Event(type, { bubbles: true, cancelable: true }));
    expect(listbox()).not.toBeNull();
    act(() => document.querySelector('[data-value="b"]').click());
    expect(trigger.textContent).toBe("First, Second");
    expect(listbox()).not.toBeNull();
    dispatch(document, new Event(type, { bubbles: true, cancelable: true }));
    expect(listbox()).toBeNull();
  }
);

test("allows another control to act on the same pointer press that closes the menu", () => {
  mountSelect();
  const button = container.querySelector("button");
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  dispatch(button, event);
  expect(event.defaultPrevented).toBe(false);
  expect(listbox()).toBeNull();
  act(() => {
    button.focus();
    button.click();
  });
  expect(outsideClick).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(button);
});

test("pointer-opened menus mark the focused option as silent", () => {
  notePointerInteraction();
  mountSelect();
  const focused = document.activeElement;
  expect(focused).not.toBe(document.body);
  expect(focused.getAttribute("data-kt-focus-silent")).toBe("true");
  act(() => {
    focused.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  expect(focused.hasAttribute("data-kt-focus-silent")).toBe(false);
});

test("keyboard-opened menus keep the focus ring marker-free", () => {
  // 真键盘路径开菜单：触发器聚焦后原生 Enter keydown 冒泡驱动（与既有
  // Escape 用例同型）——手工伪造键盘态 + mouseDown 开菜单证不了
  // "键盘开启"语义；M3Theme 挂载的 document keydown 捕获层经真实
  // 派发路径把模态翻入键盘态。
  const trigger = mountSelect({ open: false });
  trigger.focus();
  act(() => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      })
    );
  });
  expect(listbox()).not.toBeNull();
  try {
    expect(document.activeElement.hasAttribute("data-kt-focus-silent")).toBe(
      false
    );
  } finally {
    notePointerInteraction();
  }
});

test.each(["Escape", "Tab"])("closes on %s and restores the trigger", (key) => {
  const trigger = mountSelect();
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  dispatch(document.activeElement, event);
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(event.defaultPrevented).toBe(key === "Escape");
});

test("closes when focus moves outside without stealing the new focus", () => {
  mountSelect();
  const button = container.querySelector("button");
  act(() => button.focus());
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("yields the blur close to another open MUI modal surface", () => {
  // 焦点落入另一个已打开的 MUI Modal 面（嵌套 Dialog/Popover/Autocomplete
  // 共用 MuiModal-root 门户）且该面不含本弹层时，关闭语义归该面自身：
  // dismissOnFocus 不误判为焦点丢失、不代关本层；焦点落到普通外部控件时
  // 照常关闭（正向对照）。
  mountSelect();
  const modal = document.createElement("div");
  modal.className = "MuiModal-root";
  const modalInput = document.createElement("input");
  modal.appendChild(modalInput);
  document.body.appendChild(modal);
  try {
    act(() => modalInput.focus());
    expect(listbox()).not.toBeNull();
    expect(document.activeElement).toBe(modalInput);
    const button = container.querySelector("button");
    act(() => button.focus());
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(button);
  } finally {
    modal.remove();
  }
});

test("closes a free-text autocomplete on page scroll without committing a draft", () => {
  const onChange = jest.fn();
  act(() =>
    root.render(
      <OptionsTheme>
        <ReusableAutocomplete
          name="model"
          label="Model"
          freeSolo
          value=""
          options={["First", "Second"]}
          onChange={onChange}
        />
      </OptionsTheme>
    )
  );
  const input = container.querySelector("input");
  act(() => {
    input.focus();
    Simulate.keyDown(input, { key: "ArrowDown" });
  });
  expect(listbox()).not.toBeNull();
  dispatch(listbox(), new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(listbox()).not.toBeNull();
  dispatch(document, new WheelEvent("wheel", { bubbles: true, deltaY: 100 }));
  expect(listbox()).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(onChange).not.toHaveBeenCalled();
});

test("zero-item popup does not focus the listbox container (no container fallback leg)", () => {
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <StrictMode>
        <OptionsTheme>
          <TextField
            select
            label="Mode"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <button onClick={outsideClick}>Other control</button>
        </OptionsTheme>
      </StrictMode>
    );
  }
  act(() => root.render(<Harness />));
  const trigger = container.querySelector('[role="combobox"]');
  trigger.parentElement.getBoundingClientRect = () => ({
    top: 100,
    bottom: 148,
    left: 100,
    right: 360,
    width: 260,
    height: 48,
  });
  act(() => Simulate.mouseDown(trigger, { button: 0 }));
  const box = document.querySelector('[role="listbox"]');
  expect(box).not.toBeNull();
  expect(document.activeElement).not.toBe(box);
  // 空菜单焦点始终留在触发器上：Escape 到不了 Popper 的 capture handler，
  // 关闭由 document capture 兜底腿承担——按键后菜单必须卸载且焦点复原。
  // 原生 KeyboardEvent 派发（Simulate 的合成路径不经过真实 DOM 传播，
  // document capture 监听收不到）。
  act(() =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("shadow-rooted popup restores the trigger on dismissal", () => {
  // 影子拓扑：paper 于影子根内，焦点在选项上时影子根 activeElement 才是
  // 真实焦点（ownerDocument.activeElement＝宿主）。清理 effect 须取
  // getRootNode().activeElement 同口径判据，否则关闭后触发器不复原。
  const host = document.createElement("div");
  container.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const shadowInner = document.createElement("div");
  shadowRoot.appendChild(shadowInner);

  function Harness() {
    const [value, setValue] = useState("a");
    return (
      <StrictMode>
        <OptionsTheme>
          <TextField
            select
            label="Mode"
            value={value}
            SelectProps={{
              MenuProps: {
                slots: { root: DropdownRoot },
                autoFocus: false,
                disableAutoFocusItem: true,
                disableScrollLock: true,
                container: shadowInner,
              },
            }}
            onChange={(event) => setValue(event.target.value)}
          >
            <MenuItem value="a">First</MenuItem>
            <MenuItem value="b">Second</MenuItem>
          </TextField>
        </OptionsTheme>
      </StrictMode>
    );
  }
  const shadowContainerEl = shadowInner;
  const shadowAppRoot = createRoot(shadowContainerEl);
  try {
    act(() => shadowAppRoot.render(<Harness />));
    const trigger = shadowContainerEl.querySelector('[role="combobox"]');
    trigger.parentElement.getBoundingClientRect = () => ({
      top: 100,
      bottom: 148,
      left: 100,
      right: 360,
      width: 260,
      height: 48,
    });
    act(() => Simulate.mouseDown(trigger, { button: 0 }));
    const paper = shadowContainerEl.querySelector(".MuiPaper-root");
    expect(paper).not.toBeNull();
    const focused = document.activeElement;
    expect(focused).toBe(host);
    expect(shadowRoot.activeElement).not.toBe(trigger);
    expect(paper.contains(shadowRoot.activeElement)).toBe(true);
    // 点选关闭：指针按下触发外点关闭语义，焦点尚在选项上——清理
    // effect 须把触发器复原（影子根口径）。
    const button = document.createElement("button");
    container.appendChild(button);
    act(() => {
      button.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        })
      );
    });
    expect(shadowContainerEl.querySelector(".MuiPaper-root")).toBeNull();
    expect(shadowRoot.activeElement).toBe(trigger);
    expect(document.activeElement).toBe(host);
  } finally {
    act(() => shadowAppRoot.unmount());
    host.remove();
  }
});

test("document bottom leg keys off the composed-path landing and keeps outside Escape propagating", () => {
  // 影子拓扑重定向：真实浏览器里 document capture 收到的 target 是影子宿主
  // （宿主是弹层的祖先，contains 恒假），落点判定必须取 composedPath 起始
  // 节点，否则影子树内弹层按键被兜底腿误判为弹层外而整层关闭。
  const host = document.createElement("div");
  container.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  const shadowInner = document.createElement("div");
  shadowRoot.appendChild(shadowInner);

  function Harness() {
    const [value, setValue] = useState("a");
    return (
      <StrictMode>
        <OptionsTheme>
          <TextField
            select
            label="Mode"
            value={value}
            SelectProps={{
              MenuProps: {
                slots: { root: DropdownRoot },
                autoFocus: false,
                disableAutoFocusItem: true,
                disableScrollLock: true,
                container: shadowInner,
              },
            }}
            onChange={(event) => setValue(event.target.value)}
          >
            <MenuItem value="a">First</MenuItem>
            <MenuItem value="b">Second</MenuItem>
          </TextField>
        </OptionsTheme>
      </StrictMode>
    );
  }
  const shadowContainerEl = shadowInner;
  const shadowAppRoot = createRoot(shadowContainerEl);
  try {
    act(() => shadowAppRoot.render(<Harness />));
    const trigger = shadowContainerEl.querySelector('[role="combobox"]');
    trigger.parentElement.getBoundingClientRect = () => ({
      top: 100,
      bottom: 148,
      left: 100,
      right: 360,
      width: 260,
      height: 48,
    });
    act(() => Simulate.mouseDown(trigger, { button: 0 }));
    const paper = shadowContainerEl.querySelector(".MuiPaper-root");
    expect(paper).not.toBeNull();
    // 模拟浏览器对影子事件的宿主重定向投递：事件在宿主上进入 document
    // capture，组合路径携带影子内真实落点链。
    const pathSpy = jest
      .spyOn(Event.prototype, "composedPath")
      .mockReturnValue([
        paper,
        shadowInner,
        shadowRoot,
        host,
        document.body,
        document.documentElement,
        document,
      ]);
    act(() =>
      host.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    );
    pathSpy.mockRestore();
    // 落点在弹层内：兜底腿让位，弹层不得被 document 层整层关闭。
    expect(shadowContainerEl.querySelector(".MuiPaper-root")).not.toBeNull();
    // 弹层外 Escape 仍由兜底腿关闭，且不再阻断事件向下游传播。
    // （宿主为 light DOM，事件可达 document capture；jsdom 对影子内派发的
    // keydown 不冒泡出影子树，故落点取宿主。）
    const propagationSpy = jest.fn();
    document.addEventListener("keydown", propagationSpy);
    try {
      act(() =>
        host.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
      );
      expect(shadowContainerEl.querySelector(".MuiPaper-root")).toBeNull();
      expect(propagationSpy).toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", propagationSpy);
    }
  } finally {
    act(() => shadowAppRoot.unmount());
    host.remove();
  }
});

test("yields the close decision to another open MUI modal surface", () => {
  // 落点属另一个已打开的 MUI Modal 面（嵌套 Dialog/Popover/Autocomplete
  // 共用 MuiModal-root 门户）时，关闭语义归该面自身：本兜底腿不代关本层、
  // 不把焦点抢回触发器。对齐 PopupMenu 兜底腿的同款让位守卫。
  const trigger = mountSelect();
  expect(listbox()).not.toBeNull();
  const modal = document.createElement("div");
  modal.className = "MuiModal-root";
  const modalInput = document.createElement("input");
  modal.appendChild(modalInput);
  document.body.appendChild(modal);
  try {
    act(() => modalInput.focus());
    expect(document.activeElement).toBe(modalInput);
    dispatch(
      modalInput,
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(listbox()).not.toBeNull();
    expect(document.activeElement).toBe(modalInput);
  } finally {
    modal.remove();
  }
});
