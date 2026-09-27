import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import TextareaResizeGrip from "./TextareaResizeGrip";

const ORIGINAL_INNER_HEIGHT = window.innerHeight;

function GripHost({ onResize, value }) {
  const targetRef = useRef(null);
  return (
    <Box className="MuiInputBase-root" sx={{ position: "relative" }}>
      <textarea ref={targetRef} data-testid="target" />
      <TextareaResizeGrip
        target={targetRef}
        onResize={onResize}
        value={value}
        label="field_resize_height"
      />
    </Box>
  );
}

async function renderGrip(onResize, value) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<GripHost onResize={onResize} value={value} />);
  });
  const grip = container.querySelector('[role="separator"]');
  const fieldRoot = container.querySelector(".MuiInputBase-root");
  return { container, root, grip, fieldRoot };
}

function firePointer(grip, type, clientY) {
  act(() => {
    grip.dispatchEvent(
      new MouseEvent(type, { bubbles: true, button: 0, clientY })
    );
  });
}

function fireKey(grip, key, shiftKey) {
  act(() => {
    grip.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        key,
        shiftKey: Boolean(shiftKey),
      })
    );
  });
}

describe("TextareaResizeGrip", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    // jsdom 未实现 pointer capture（原型上无此方法，spyOn 会抛
    // "not a function"），沿用上游先例（DraggableResizable.test.js:47）
    // 的直接赋值形态，测试结束后删除还原。
    HTMLElement.prototype.setPointerCapture = jest.fn();
    HTMLElement.prototype.releasePointerCapture = jest.fn();
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: ORIGINAL_INNER_HEIGHT,
    });
    jest.restoreAllMocks();
    delete HTMLElement.prototype.setPointerCapture;
    delete HTMLElement.prototype.releasePointerCapture;
    document.body.innerHTML = "";
  });

  test("renders a focusable horizontal separator with an accessible label", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120);
    expect(grip).not.toBeNull();
    expect(grip.getAttribute("aria-orientation")).toBe("horizontal");
    expect(grip.getAttribute("aria-label")).toBe("field_resize_height");
    expect(grip.getAttribute("aria-valuenow")).toBe("120");
    expect(grip.tabIndex).toBe(0);
    await act(async () => root.unmount());
  });

  test("renders a concentric arc svg with the exact spec geometry", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120);
    const svg = grip.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const paths = svg.querySelectorAll("path");
    expect(paths.length).toBe(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    expect(paths[1].getAttribute("d")).toBe(
      "M12 6.5V9C12 10.6569 10.6569 12 9 12H6.5"
    );
    paths.forEach((path) => {
      expect(path.getAttribute("stroke")).toBe("currentColor");
      expect(path.getAttribute("stroke-width")).toBe("1.8");
      expect(path.getAttribute("stroke-linecap")).toBe("round");
    });
    await act(async () => root.unmount());
  });

  test("streams pointer drag deltas into onResize and ends the session on pointerup", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointermove", 140);
    expect(onResize).toHaveBeenLastCalledWith(140);
    firePointer(grip, "pointermove", 90);
    expect(onResize).toHaveBeenLastCalledWith(90);
    firePointer(grip, "pointerup", 90);
    firePointer(grip, "pointermove", 300);
    expect(onResize).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  test("clamps drag output to the minimum height and the current viewport", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    jest.spyOn(fieldRoot, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 100,
      height: 100,
    });
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointermove", -500);
    expect(onResize).toHaveBeenLastCalledWith(40);
    firePointer(grip, "pointermove", 2000);
    expect(onResize).toHaveBeenLastCalledWith(592);
    await act(async () => root.unmount());
  });

  test("adjusts height with ArrowDown/ArrowUp (Shift = 4x) and ignores other keys", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    fireKey(grip, "ArrowDown");
    expect(onResize).toHaveBeenLastCalledWith(112);
    fireKey(grip, "ArrowUp");
    expect(onResize).toHaveBeenLastCalledWith(88);
    fireKey(grip, "ArrowDown", true);
    expect(onResize).toHaveBeenLastCalledWith(148);
    fireKey(grip, "Home");
    expect(onResize).not.toHaveBeenCalledTimes(4);
    await act(async () => root.unmount());
  });

  test("ends the drag session on pointercancel", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointercancel", 100);
    firePointer(grip, "pointermove", 500);
    expect(onResize).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  // 手柄视觉样式全部经父级 Box sx 的 "& svg" 选择器由 Emotion 运行时
  // 注入（本仓库无 Emotion jsx pragma 编译路径，裸元素 sx 会静默失效）。
  // 本用例直读注入产物：自建独立 cache（speedy:false 使 jsdom 下 style
  // 标签保留完整 CSS 文本）包 CacheProvider 渲染，收集 head 中该 cache
  // 的 style[data-emotion] textContent，断言基态/hover/active 关键规则
  // 真实序列化注入，补上纯 DOM 结构断言之外的样式层验证。
  test("injects the grip svg styles into document.head via emotion", async () => {
    const cache = createCache({ key: "grip-css-test", speedy: false });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CacheProvider value={cache}>
          <GripHost onResize={jest.fn()} value={120} />
        </CacheProvider>
      );
    });

    const gripCss = [
      ...document.head.querySelectorAll('style[data-emotion^="grip-css-test"]'),
    ]
      .map((style) => style.textContent)
      .join("\n");

    // 基态 "& svg"：定位、透明度、过渡与指针/选区豁免。
    expect(gripCss).toContain("right:4px");
    expect(gripCss).toContain("bottom:4px");
    expect(gripCss).toContain("opacity:0.38");
    expect(gripCss).toContain("cubic-bezier(0.2, 0, 0, 1)");
    expect(gripCss).toContain("pointer-events:none");
    expect(gripCss).toContain("user-select:none");
    // hover / active 伪类态的透明度与缩放反馈。
    expect(gripCss).toContain(":hover");
    expect(gripCss).toContain("opacity:0.9");
    expect(gripCss).toContain("scale(1.08)");
    expect(gripCss).toContain("opacity:1");
    expect(gripCss).toContain("scale(0.95)");

    await act(async () => root.unmount());
    // 清理本用例注入的 style 标签（afterEach 只清 body，不清 head）。
    cache.sheet.flush();
  });
});
