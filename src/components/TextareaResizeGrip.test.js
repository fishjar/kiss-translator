import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import Box from "@mui/material/Box";
import TextareaResizeGrip, {
  GripGlyph,
  getGripRegistryKeys,
  resolveGripStyle,
} from "./TextareaResizeGrip";
import { TEXTAREA_GRIP_STYLE_KEYS } from "../config/textareaGripStyles";
import { I18N } from "../config/i18n";

// React 18 act 环境标志：缺失时 react-dom 对每次 createRoot+act 渲染
// 输出告警（仓库 A 类测试模板的既有约定，30+ 套件同款）。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ORIGINAL_INNER_HEIGHT = window.innerHeight;

function GripHost({ onResize, value, variant, onRelease, unlockHint }) {
  const targetRef = useRef(null);
  return (
    <Box className="MuiInputBase-root" sx={{ position: "relative" }}>
      <textarea ref={targetRef} data-testid="target" />
      <TextareaResizeGrip
        target={targetRef}
        onResize={onResize}
        value={value}
        label="field_resize_height"
        variant={variant}
        onRelease={onRelease}
        unlockHint={unlockHint}
      />
    </Box>
  );
}

async function renderGrip(onResize, value, variant, onRelease, unlockHint) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <GripHost
        onResize={onResize}
        value={value}
        variant={variant}
        onRelease={onRelease}
        unlockHint={unlockHint}
      />
    );
  });
  const grip = container.querySelector('[role="slider"]');
  const fieldRoot = container.querySelector(".MuiInputBase-root");
  return { container, root, grip, fieldRoot };
}

function firePointer(grip, type, clientY, pointerId) {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
    // jsdom 无 PointerEvent 构造器：以实例属性注入 pointerId 模拟指针
    // 身份（未传时保持 undefined，与 MouseEvent 现状一致）。
    if (pointerId !== undefined) {
      Object.defineProperty(event, "pointerId", { value: pointerId });
    }
    grip.dispatchEvent(event);
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

  // 原型链键名穿透回归护栏：GRIP_SVGS 是对象字面量，真值查表会被
  // Object.prototype 上的 "constructor" / "toString" 键名命中（得到
  // Function/函数，truthy），产出无 path 的空 svg。两处消费端（组件与
  // GripGlyph）都必须经 hasOwnProperty 判定回落双弧。
  test("falls back to the concentric arcs for the constructor prototype key", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, undefined, "constructor");
    const paths = grip.querySelectorAll("svg path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    await act(async () => root.unmount());
  });

  test("falls back to the concentric arcs for the toString prototype key", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, undefined, "toString");
    const paths = grip.querySelectorAll("svg path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    await act(async () => root.unmount());
  });

  test("renders a focusable vertical slider with an accessible label", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120);
    expect(grip).not.toBeNull();
    expect(grip.getAttribute("aria-orientation")).toBe("vertical");
    expect(grip.getAttribute("aria-label")).toBe("field_resize_height");
    expect(grip.getAttribute("aria-valuenow")).toBe("120");
    expect(grip.getAttribute("aria-valuemax")).toBe("600");
    expect(grip.getAttribute("aria-valuetext")).toBe("120px");
    expect(grip.tabIndex).toBe(0);
    // aria-keyshortcuts 完整播报键盘契约：ArrowUp/Down 调整 + Escape
    // 显式解锁（与双击等价），读屏与辅助技术经该属性获知全部入口。
    expect(grip.getAttribute("aria-keyshortcuts")).toBe(
      "ArrowUp ArrowDown Escape"
    );
    await act(async () => root.unmount());
  });

  // 未锁定（value 非数值）时 role="slider" 仍必须携带 aria-valuenow
  // （ARIA 规范必需属性，axe 校验项）：首个渲染事务内 target ref 尚未
  // 挂载，回落最小高度；锁定态边界变更（B6 依赖收敛的合法补测触发）
  // 回落基线元素实测高度（jsdom offsetHeight 恒 0，经 spy 注入实测值
  // 验证测量路径）。同 props 重渲染不再逐渲染实测（见 B6 专用用例）。
  test("reports a slider value fallback while the height is unlocked", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    expect(grip.getAttribute("aria-valuenow")).toBe("40");
    expect(grip.getAttribute("aria-valuetext")).toBe("40px");
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(128);
    // value undefined→null 的锁定态边界变更触发一次补测。
    await act(async () => {
      root.render(<GripHost onResize={onResize} value={null} />);
    });
    expect(grip.getAttribute("aria-valuenow")).toBe("128");
    expect(grip.getAttribute("aria-valuetext")).toBe("128px");
    await act(async () => root.unmount());
  });

  // ARIA 下界契约：播报下界随锁定态取同一钳制托底口径——锁定态（value
  // 为有限数）真实可调下界是 LOCKED_MIN_TARGET_HEIGHT_PX（64），未锁定
  // 回落路径才是 MIN_TARGET_HEIGHT_PX（40）；valuemin/valuemax/valuenow
  // 三者必须构成自洽区间（valuenow 落在 [valuemin, valuemax]）。
  test("reports the locked lower bound in aria-valuemin and keeps the slider range self-consistent", async () => {
    const onResize = jest.fn();
    const { grip: lockedGrip, root: lockedRoot } = await renderGrip(
      onResize,
      120
    );
    expect(lockedGrip.getAttribute("aria-valuemin")).toBe("64");
    expect(
      Number(lockedGrip.getAttribute("aria-valuemax"))
    ).toBeGreaterThanOrEqual(64);
    const lockedNow = Number(lockedGrip.getAttribute("aria-valuenow"));
    expect(lockedNow).toBeGreaterThanOrEqual(64);
    expect(lockedNow).toBeLessThanOrEqual(
      Number(lockedGrip.getAttribute("aria-valuemax"))
    );
    await act(async () => lockedRoot.unmount());

    const { grip: unlockedGrip, root: unlockedRoot } = await renderGrip(
      onResize
    );
    expect(unlockedGrip.getAttribute("aria-valuemin")).toBe("40");
    await act(async () => unlockedRoot.unmount());
  });

  // aria-valuemax 不得停留在初始视口保守值：拖拽/键盘会话经 clampHeight
  // 现算出的真实钳制上界（视口与全部纵向可滚动祖先的最小者）必须同步进
  // 读屏播报，否则窗口 resize/嵌套滚动后播报上界偏大。
  test("syncs aria-valuemax to the actual clamped upper bound", async () => {
    const onResize = jest.fn();
    const { grip, container, fieldRoot, root } = await renderGrip(onResize);
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    outerPanel.appendChild(container);
    const originalGetComputedStyle = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((el) =>
      el === outerPanel ? { overflowY: "auto" } : originalGetComputedStyle(el)
    );
    jest.spyOn(outerPanel, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 300,
    });
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    jest.spyOn(fieldRoot, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 100,
      height: 100,
    });
    // 初始播报上界 = 视口保守值（beforeEach 已固定 innerHeight=600）。
    expect(grip.getAttribute("aria-valuemax")).toBe("600");
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointermove", 2000);
    // 钳制上界 292 = 外层面板可见下缘 300 − 字段顶 0 − 留白 8。
    expect(onResize).toHaveBeenLastCalledWith(292);
    expect(grip.getAttribute("aria-valuemax")).toBe("292");
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
    expect(onResize).toHaveBeenLastCalledWith(64);
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

  // A4 护栏：测量基准不可解析（closest 未命中）时键盘路径仅保下界钳制，
  // 不做视口/祖先上界钳制——innerHeight=30 下若命中基线，上限会被钳到
  // floor(30 − 0 − 8) = 22 → 64；未命中则 52 经下界托底上报 64（hook 侧
  // 「跳过重钳」的对称口径由 useTextareaHeightLock.test.js 覆盖）。
  test("clamps keyboard output to the lower bound only when the baseline element is unresolvable", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 30,
    });
    const onResize = jest.fn();
    const { grip, container, root } = await renderGrip(onResize);
    const textarea = container.querySelector('[data-testid="target"]');
    jest.spyOn(textarea, "closest").mockReturnValue(null);
    fireKey(grip, "ArrowDown");
    expect(onResize).toHaveBeenLastCalledWith(64);
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

  // capture 不可用 → 不建立拖拽会话：与 onLostPointerCapture 的
  // 「capture 成功才可拖拽」语义一致；无 capture 的会话会在指针移出
  // 热区后丢失全部事件，terminate 语义不制造该状态。
  test("does not start a drag session when pointer capture is unavailable", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    HTMLElement.prototype.setPointerCapture = jest.fn(() => {
      throw new Error("capture unavailable");
    });
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointermove", 140);
    expect(onResize).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  // 多指防护：活动会话期间第二指 pointerdown 不覆盖会话；异 pointerId
  // 的 move 不改高度、不触发 onResize；仅会话所属指针能闭合会话。
  test("ignores a second pointer and foreign pointer ids during an active drag session", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    firePointer(grip, "pointerdown", 100, 1);
    firePointer(grip, "pointerdown", 500, 2);
    firePointer(grip, "pointermove", 140, 2);
    expect(onResize).not.toHaveBeenCalled();
    firePointer(grip, "pointermove", 140, 1);
    expect(onResize).toHaveBeenLastCalledWith(140);
    firePointer(grip, "pointerup", 140, 1);
    firePointer(grip, "pointermove", 300, 1);
    expect(onResize).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  // 拖高上界取「全部纵向可滚动祖先各层上限的最小值」与视口的较小者：
  // 字段不得推出任何一层滚动容器的可见范围，否则手柄随字段沉入折叠区
  // 不可达。双层嵌套时外层上界更紧——若实现命中最近一层即停，会漏掉
  // 外层的更小上界。上限现测现算不缓存。
  test("caps drag output at the tightest scrollable ancestor before the viewport", async () => {
    const onResize = jest.fn();
    const { grip, container, fieldRoot, root } = await renderGrip(onResize);
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    const innerPanel = document.createElement("div");
    outerPanel.appendChild(innerPanel);
    innerPanel.appendChild(container);
    const originalGetComputedStyle = window.getComputedStyle;
    jest.spyOn(window, "getComputedStyle").mockImplementation((el) =>
      el === outerPanel || el === innerPanel
        ? { overflowY: "auto" }
        : originalGetComputedStyle(el)
    );
    jest.spyOn(outerPanel, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 300,
    });
    jest.spyOn(innerPanel, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 600,
    });
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    jest.spyOn(fieldRoot, "getBoundingClientRect").mockReturnValue({
      top: 0,
      bottom: 100,
      height: 100,
    });
    firePointer(grip, "pointerdown", 100);
    firePointer(grip, "pointermove", 2000);
    // 外层面板可见下缘 300 − 字段顶 0 − 留白 8 = 292，紧于内层的 592 与
    // 视口的 592：全链最小上界取胜。
    expect(onResize).toHaveBeenLastCalledWith(292);
    await act(async () => root.unmount());
  });

  // B2：拖拽会话边界在 pointerdown 快照一次——会话内指针被 capture，用
  // 户无法同时滚动祖先容器，祖先几何在会话内不变，pointermove 不再逐事
  // 件实测（红：现实现每 move 上溯全部祖先 getComputedStyle + 基线
  // getBoundingClientRect）；拖拽最终高度与既有钳制口径一致。
  test("snapshots the drag bounds once per session instead of measuring on every pointermove", async () => {
    const onResize = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(onResize);
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    const gcsSpy = jest.spyOn(window, "getComputedStyle");
    const gBCRSpy = jest.spyOn(fieldRoot, "getBoundingClientRect");
    firePointer(grip, "pointerdown", 100);
    const gcsAtDown = gcsSpy.mock.calls.length;
    const gBCRAtDown = gBCRSpy.mock.calls.length;
    for (let i = 0; i < 10; i += 1) {
      firePointer(grip, "pointermove", 100 + (i + 1) * 10);
    }
    // 会话内祖先几何不变：move 阶段零实测（红：现实现每 move 实测）。
    expect(gcsSpy.mock.calls.length).toBe(gcsAtDown);
    expect(gBCRSpy.mock.calls.length).toBe(gBCRAtDown);
    // 最终高度与既有口径一致：startHeight 100 + (200 − 100) = 200。
    expect(onResize).toHaveBeenLastCalledWith(200);
    await act(async () => root.unmount());
  });

  // B3：双击手柄显式解锁——onRelease 恰被调用一次；title 合并解锁提示
  // （组件不引 i18n，维持现契约，提示串由消费方经 unlockHint 传入）。
  test("releases the height on double-click and merges the unlock hint into the title", async () => {
    const onRelease = jest.fn();
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(
      onResize,
      120,
      undefined,
      onRelease,
      "双击解锁高度"
    );
    expect(grip.getAttribute("title")).toBe("field_resize_height双击解锁高度");
    await act(async () => {
      grip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onRelease).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  // Escape 键盘解锁：手柄聚焦时按 Escape 等价于双击——preventDefault
  // 后调 onRelease 恰一次；与方向键调节、双击共同构成完整键盘可达
  // 解锁路径（onRelease 未传时 preventDefault 仍发生、调用为 no-op）。
  test("releases the height on Escape keydown without altering arrow-key resize", async () => {
    const onRelease = jest.fn();
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120, undefined, onRelease);
    // 未聚焦的其他键不触发解锁（对照样本：非 Escape 键走既有分支）。
    fireKey(grip, "Enter");
    expect(onRelease).not.toHaveBeenCalled();
    // Escape：preventDefault 且 onRelease 恰被调用一次。
    let prevented = false;
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
        cancelable: true,
      });
      grip.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(onRelease).toHaveBeenCalledTimes(1);
    // 方向键调节路径不受 Escape 分支影响：ArrowDown 仍走 onResize。
    jest.spyOn(grip, "offsetHeight", "get").mockReturnValue(100);
    fireKey(grip, "ArrowDown");
    expect(onResize).toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  test("ignores Escape when onRelease is not provided", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120);
    let prevented = false;
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
        cancelable: true,
      });
      grip.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await act(async () => root.unmount());
  });

  // PR #7 遗留意见（#43/#41/#36/#40）：Escape 分支缺 stopPropagation。
  // 手柄祖先链上有 React onKeyDown（Action/index.js 弹窗壳
  // setShowPopup(false)），preventDefault 对祖先 handler 无效——不阻断
  // 冒泡会在「解锁高度」的同时关掉整个弹窗。断言祖先容器监听不被触达。
  test("stops Escape propagation so ancestor popup handlers are not reached", async () => {
    const onRelease = jest.fn();
    const { grip, container, root } = await renderGrip(
      jest.fn(),
      120,
      undefined,
      onRelease
    );
    // React 18 在根容器上委托监听：祖先 React handler（弹窗壳）经合成
    // stopPropagation 阻断，对应 native 事件在根容器处停止上行。故监听
    // 器挂在根容器之上的外层面板（与弹窗壳在手柄上层的真实拓扑一致）；
    // 挂在容器自身会因同节点监听器不受 stopPropagation 影响而误报。
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    outerPanel.appendChild(container);
    const ancestorSpy = jest.fn();
    outerPanel.addEventListener("keydown", ancestorSpy);
    fireKey(grip, "Escape");
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(ancestorSpy).not.toHaveBeenCalled();
    outerPanel.removeEventListener("keydown", ancestorSpy);
    await act(async () => root.unmount());
  });

  // 未锁定态 Escape：事件阻断收窄到锁定态——preventDefault 与冒泡阻断
  // 均不得发生，祖先浮层的 Esc 关闭路径保持可达；onRelease 仍恰好一次
  // （键盘解锁入口的存在性与锁定态无关）。
  test("lets unlocked Escape bubble to ancestor handlers while still releasing", async () => {
    const onRelease = jest.fn();
    const { grip, container, root } = await renderGrip(
      jest.fn(),
      undefined,
      undefined,
      onRelease
    );
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    outerPanel.appendChild(container);
    const ancestorSpy = jest.fn();
    outerPanel.addEventListener("keydown", ancestorSpy);
    let prevented = false;
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
        cancelable: true,
      });
      grip.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(false);
    expect(ancestorSpy).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
    outerPanel.removeEventListener("keydown", ancestorSpy);
    await act(async () => root.unmount());
  });

  // 拖拽会话中按 Escape：会话终止必须复用 endSession 的焦点归还语义——
  // 焦点滞留手柄时交还 textarea，否则方向键被 slider 吞掉、输入焦点丢失。
  test("returns focus to the textarea when Escape terminates a drag session", async () => {
    const onRelease = jest.fn();
    const { grip, container, root } = await renderGrip(
      jest.fn(),
      undefined,
      undefined,
      onRelease
    );
    const textarea = container.querySelector('[data-testid="target"]');
    act(() => {
      textarea.focus();
    });
    firePointer(grip, "pointerdown", 100, 1);
    act(() => {
      grip.focus();
    });
    expect(document.activeElement).toBe(grip);
    fireKey(grip, "Escape");
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(textarea);
    await act(async () => root.unmount());
  });

  // PR #7 遗留意见：拖拽会话进行中按 Escape——必须终止活跃会话并释放
  // pointer capture，否则后续 pointermove 继续触发 onResize，把刚解锁的
  // 高度重新锁回去。无活跃会话时 Escape 不得触碰 releasePointerCapture
  // 也不得抛错（空值守卫）。
  test("terminates the active pointer session and releases capture on Escape", async () => {
    const onResize = jest.fn();
    const onRelease = jest.fn();
    const { grip, fieldRoot, root } = await renderGrip(
      onResize,
      undefined,
      undefined,
      onRelease
    );
    jest.spyOn(fieldRoot, "offsetHeight", "get").mockReturnValue(100);
    firePointer(grip, "pointerdown", 100, 1);
    fireKey(grip, "Escape");
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalledWith(1);
    // 会话已终止：同指针的后续 move 不得再把高度锁回去。
    firePointer(grip, "pointermove", 300, 1);
    expect(onResize).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  test("does not touch pointer capture on Escape without an active session", async () => {
    const onRelease = jest.fn();
    const { grip, root } = await renderGrip(
      jest.fn(),
      120,
      undefined,
      onRelease
    );
    fireKey(grip, "Escape");
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.releasePointerCapture).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  // 对照防过修：锁定态 Escape 仍须阻断默认语义与冒泡（弹窗壳不被误关），
  // 收窄只针对未锁定态。
  test("still blocks locked Escape propagation so ancestor handlers are not reached", async () => {
    const onRelease = jest.fn();
    const { grip, container, root } = await renderGrip(
      jest.fn(),
      120,
      undefined,
      onRelease
    );
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    outerPanel.appendChild(container);
    const ancestorSpy = jest.fn();
    outerPanel.addEventListener("keydown", ancestorSpy);
    let prevented = false;
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
        cancelable: true,
      });
      grip.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(ancestorSpy).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledTimes(1);
    outerPanel.removeEventListener("keydown", ancestorSpy);
    await act(async () => root.unmount());
  });

  test("keeps the shared constant key list and the grip registry in lockstep", () => {
    // 单一事实源双向对账：
    //  正向——清单逐键必须被注册表自有属性命中（清单多写/改名时必红）；
    //  反向——注册表键序（含顺序）必须与清单恒等（注册表新增/删除/改名/
    //  调序而漏同步清单时必红，含 concentric-smooth 被删时正向回落值恰
    //  等于期望值而漏判的盲点）。
    for (const key of TEXTAREA_GRIP_STYLE_KEYS) {
      expect(resolveGripStyle(key)).toBe(key);
    }
    expect(TEXTAREA_GRIP_STYLE_KEYS).toContain("hidden");
    // 判红能力常驻自检：同长度、异内容的变异序列必须判不等（等长换名，
    // 避免 StylesSetting.test.js 近恒真自检的长度差退化形态）。哨兵位以
    // slice(0, -1) 相对清单长度派生，清单增长后仍保持等长换名，而非退化
    // 为长度差比较（硬编码下标会随清单变长静默失效）。
    const registryKeys = getGripRegistryKeys();
    expect([...registryKeys.slice(0, -1), "not-a-registry-key"]).not.toEqual([
      ...TEXTAREA_GRIP_STYLE_KEYS,
    ]);
    expect(registryKeys).toEqual([...TEXTAREA_GRIP_STYLE_KEYS]);
  });

  // 会话窗口 Escape 阻断：pointerdown 已建立会话但尚未 move 时 onResize
  // 未被调过、value 仍非有限数——阻断条件并入会话态后，Esc 必须被拦下
  // （祖先浮层关闭语义不得误触），且会话被终止、onRelease 恰好一次。
  test("blocks Escape while a pointer session is active even when unlocked", async () => {
    const onRelease = jest.fn();
    const { grip, container, root } = await renderGrip(
      jest.fn(),
      undefined,
      undefined,
      onRelease
    );
    const outerPanel = document.createElement("div");
    document.body.appendChild(outerPanel);
    outerPanel.appendChild(container);
    const ancestorSpy = jest.fn();
    outerPanel.addEventListener("keydown", ancestorSpy);
    // pointerdown 建立会话但不派发 pointermove：value 仍非有限数。
    firePointer(grip, "pointerdown", 100, 1);
    let prevented = false;
    act(() => {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        key: "Escape",
        cancelable: true,
      });
      grip.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    expect(ancestorSpy).not.toHaveBeenCalled();
    expect(onRelease).toHaveBeenCalledTimes(1);
    outerPanel.removeEventListener("keydown", ancestorSpy);
    await act(async () => root.unmount());
  });

  // 意见 C：解锁提示文案本体自带括号（zh/zh_TW 全角、其余半角+前导空格），
  // 组件侧零括号直连——锁死真实 I18N 字典的括号形态契约。PR #7 遗留意见
  // （#44/#29 后半/#37 后半）：提示须同时提及 Esc 键盘解锁入口。
  test("ships the unlock hint with brackets baked into the i18n copy", () => {
    const entry = I18N.field_resize_unlock_hint;
    expect(entry).toBeDefined();
    expect(entry.zh).toBe("（双击或按 Esc 解锁高度）");
    expect(entry.zh_TW).toBe("（雙擊或按 Esc 解鎖高度）");
    expect(entry.en).toBe(" (Double-click or press Esc to unlock height)");
    for (const lang of ["ja", "ko", "tr", "vi"]) {
      expect(entry[lang]).toMatch(/^ \(.+\)$/);
      expect(entry[lang].startsWith("（")).toBe(false);
      expect(entry[lang].includes("）")).toBe(false);
      expect(entry[lang].includes("Esc")).toBe(true);
    }
  });

  // 焦点归属契约：鼠标 pointerdown 不得抢走 textarea 焦点。输入框已聚焦
  // 并已输入内容时按下手柄，焦点、光标、选区全程不受扰动（输入法合成态
  // 同理依赖此不变式）。键盘调高经 Tab 聚焦手柄后由 handleKeyDown 承载，
  // 见对照组用例，不靠 pointerdown 抢焦点实现。旧实现显式
  // currentTarget.focus() 会把 activeElement 移到 grip，本用例即线上缺陷
  // （点手柄即 blur 输入框）的 jsdom 复现。
  test("keeps focus on the textarea when a primary-button pointerdown starts a drag", async () => {
    const { grip, container, root } = await renderGrip(jest.fn());
    const textarea = container.querySelector('[data-testid="target"]');
    act(() => {
      textarea.value = "划词翻译草稿";
      textarea.setSelectionRange(2, 4);
      textarea.focus();
    });
    expect(document.activeElement).toBe(textarea);
    firePointer(grip, "pointerdown", 100);
    // 按下即抢焦点是被推翻的旧设计：新契约下焦点必须仍在 textarea。
    expect(document.activeElement).toBe(textarea);
    // 光标与选区未被打断（本仓库划词场景下输入法合成态同理依赖此不变式）。
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(4);
    firePointer(grip, "pointerup", 100);
    expect(document.activeElement).toBe(textarea);
    await act(async () => root.unmount());
  });

  // 焦点归还兜底：某些平台在 preventDefault 下仍会把焦点转移到手柄。会话
  // 建立时 textarea 持有焦点、endSession 时焦点滞留手柄，则交还 textarea
  // （preventScroll）。jsdom 不会因派发 MouseEvent 自动挪焦点，故用
  // grip.focus() 显式模拟该平台的焦点滞留。
  test("returns focus to the textarea on pointerup when focus is stuck on the grip", async () => {
    const { grip, container, root } = await renderGrip(jest.fn());
    const textarea = container.querySelector('[data-testid="target"]');
    act(() => {
      textarea.focus();
    });
    firePointer(grip, "pointerdown", 100);
    act(() => {
      grip.focus();
    });
    expect(document.activeElement).toBe(grip);
    firePointer(grip, "pointerup", 100);
    expect(document.activeElement).toBe(textarea);
    await act(async () => root.unmount());
  });

  // 对照防误伤：非主键（右键）pointerdown 早退，不产生焦点副作用。
  test("does not focus the grip on non-primary-button pointerdown", async () => {
    const { grip, root } = await renderGrip(jest.fn());
    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 2,
          clientY: 100,
        })
      );
    });
    expect(document.activeElement).not.toBe(grip);
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

  // variant 可配置化：默认（未传/未知值）回落同心双弧；填充族把 fill 放
  // svg 根、子元素不带 fill；hidden 渲染空 svg 保留热区。字符串契约锁定
  // path d 逐字值与 fill 归属，防资产漂移。
  test("defaults to the concentric arc when no variant is provided", async () => {
    const { grip, root } = await renderGrip(jest.fn(), 120);
    const paths = grip.querySelectorAll("svg path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    await act(async () => root.unmount());
  });

  test("renders the dotted single family with fill on the svg root only", async () => {
    const { grip, root } = await renderGrip(jest.fn(), 120, "dotted-single");
    const svg = grip.querySelector("svg");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    const dots = svg.querySelectorAll("circle");
    expect(dots).toHaveLength(7);
    // fill 归属 svg 根，circle 自身不得携带 fill。
    dots.forEach((dot) => {
      expect(dot.getAttribute("fill")).toBeNull();
    });
    await act(async () => root.unmount());
  });

  // B1 决策反转：hidden = 完全不渲染手柄 + textarea 原生 resize 回退。
  // 旧「隐形热区」语义（空图形 + 24×24 可交互 Box）被推翻——不可见却可
  // 拖是隐蔽交互面，回退原生 resize 才是「隐藏」的自然语义。GRIP_SVGS
  // 的 hidden 条目保留（TEXTAREA_GRIP_STYLE_KEYS 清单须含 hidden，由
  // 双向对账锁定，删注册表条目必红；resolveGripStyle("hidden") 归一化
  // 原样返回，早退分支对存量 hidden 用户必然触发）；GripGlyph 仍渲染空
  // svg 占位（下拉图标），视图侧 resize 三元由各视图测试覆盖。
  test("renders nothing for the hidden variant so the textarea falls back to native resize", async () => {
    const { container, root } = await renderGrip(jest.fn(), 120, "hidden");
    expect(container.querySelector('[role="slider"]')).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    await act(async () => root.unmount());
  });

  // 播报值钳制护栏：aria-valuenow 不得超过 aria-valuemax。锁定高度可能
  // 超出当前播报上界（会话高度记忆恢复、锁定期间窗口缩小后播报上界不再
  // 同步），ARIA slider 规范要求 valuenow 落在 [valuemin, valuemax]；
  // valuetext 与 valuenow 同源同钳，读屏播报口径一致。
  test("clamps the announced slider value to aria-valuemax", async () => {
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 800);
    expect(grip.getAttribute("aria-valuemax")).toBe("600");
    expect(grip.getAttribute("aria-valuenow")).toBe("600");
    expect(grip.getAttribute("aria-valuetext")).toBe("600px");
    await act(async () => root.unmount());
  });

  // 挂载补测护栏：未锁定且消费方挂载后无重渲染时（如只读字段一次性
  // 渲染），slider 回落值必须在挂载后补测基线高度，不得停留在初始最小
  // 高度。渲染前生效的原型级 spy 模拟 jsdom 下可测的真实高度；未补测的
  // 实现仅在渲染期读 DOM，首渲染 ref 未挂载即回落 40 且无人再触发重渲染。
  test("measures the unlocked slider value after mount without a consumer re-render", async () => {
    const onResize = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    jest.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(128);
    await act(async () => {
      root.render(<GripHost onResize={onResize} />);
    });
    const grip = container.querySelector('[role="slider"]');
    expect(grip.getAttribute("aria-valuenow")).toBe("128");
    expect(grip.getAttribute("aria-valuetext")).toBe("128px");
    await act(async () => root.unmount());
  });

  // B6：fallback 补测依赖收敛——未锁定态下消费方重渲染（如键入引起的内容
  // 更新）不再逐渲染实测 offsetHeight（fallbackHeight 仅作 slider 播报回
  // 落值，非布局数据，短暂过期可接受；锁定态切换与目标变更仍补测）。
  test("measures the unlocked fallback height once instead of on every render", async () => {
    const onResize = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const offsetHeightSpy = jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(128);
    await act(async () => {
      root.render(<GripHost onResize={onResize} />);
    });
    // 两次无 props 变化的重渲染：补测不得随渲染重复读数（红：现实现无依
    // 赖数组，逐渲染实测 3 次）。
    await act(async () => {
      root.render(<GripHost onResize={onResize} />);
    });
    await act(async () => {
      root.render(<GripHost onResize={onResize} />);
    });
    expect(offsetHeightSpy.mock.calls.length).toBe(1);
    await act(async () => root.unmount());
  });

  // B6 护栏：依赖收敛不得漏掉「锁定态切换」补测——解锁时基线高度可能已
  // 变（锁定期间内容增高等），补测必须重跑，播报值不得滞留旧实测。
  test("re-measures the fallback height after the locked value releases", async () => {
    const onResize = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const offsetHeightSpy = jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(128);
    await act(async () => {
      root.render(<GripHost onResize={onResize} />);
    });
    const grip = container.querySelector('[role="slider"]');
    expect(grip.getAttribute("aria-valuenow")).toBe("128");
    // 锁定期间基线实测高度变化。
    offsetHeightSpy.mockReturnValue(200);
    await act(async () => {
      root.render(<GripHost onResize={onResize} value={400} />);
    });
    // 解锁（锁定态切换）：必须重新补测并更新播报回落值。
    await act(async () => {
      root.render(<GripHost onResize={onResize} value={null} />);
    });
    expect(grip.getAttribute("aria-valuenow")).toBe("200");
    expect(grip.getAttribute("aria-valuetext")).toBe("200px");
    await act(async () => root.unmount());
  });

  // 非有限锁定高度的播报护栏：NaN 穿透 typeof 数值检查后经 Math.min 产出
  // "NaN" 播报（aria-valuenow/valuetext 同源）。Number.isFinite 口径下 NaN
  // 不算有效锁定，按未锁定回落补测基线高度（jsdom offsetHeight 经原型级
  // spy 注入实测值，沿用既有补测用例的形态）。
  test("falls back to the measured baseline when the locked value is NaN", async () => {
    const onResize = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(128);
    await act(async () => {
      root.render(<GripHost onResize={onResize} value={NaN} />);
    });
    const grip = container.querySelector('[role="slider"]');
    expect(grip.getAttribute("aria-valuenow")).toBe("128");
    expect(grip.getAttribute("aria-valuetext")).toBe("128px");
    await act(async () => root.unmount());
  });

  // 病态视口护栏：innerHeight 低于锁定下界（64px）时，ARIA 区间仍须自洽
  // ——锁定态 valuemin=64，valuemax 经 effectiveMax 托底恒不低于 valuemin，
  // valuenow 被有效上界钳制，三者同落 64px。
  test("keeps the slider bounds sane when the viewport is below the minimum height", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 30,
    });
    const onResize = jest.fn();
    const { grip, root } = await renderGrip(onResize, 120);
    expect(grip.getAttribute("aria-valuemin")).toBe("64");
    expect(grip.getAttribute("aria-valuemax")).toBe("64");
    expect(grip.getAttribute("aria-valuenow")).toBe("64");
    expect(grip.getAttribute("aria-valuetext")).toBe("64px");
    await act(async () => root.unmount());
  });
});

describe("GripGlyph", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function renderGlyph(ui) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(ui));
    return { container, root };
  }

  test("falls back to the concentric arcs for unknown keys", async () => {
    const { container, root } = await renderGlyph(
      <GripGlyph variant="nonexistent-key" />
    );
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("18");
    const paths = svg.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    await act(async () => root.unmount());
  });

  test("renders an empty placeholder svg for the hidden variant", async () => {
    const { container, root } = await renderGlyph(
      <GripGlyph variant="hidden" />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll("path, line, circle").length).toBe(0);
    await act(async () => root.unmount());
  });

  test("falls back to the concentric arcs for a retired style key", async () => {
    const { container, root } = await renderGlyph(
      <GripGlyph variant="upstream-chrome" />
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // 已下线 key 必须落回默认同心双弧（2 条 path，首条 d 为外弧）。
    const paths = svg.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute("d")).toBe(
      "M15 5V9C15 12.3137 12.3137 15 9 15H5"
    );
    await act(async () => root.unmount());
  });

  test("falls back to the concentric arcs for prototype-chain keys", async () => {
    for (const prototypeKey of ["constructor", "toString"]) {
      const { container, root } = await renderGlyph(
        <GripGlyph variant={prototypeKey} />
      );
      const paths = container.querySelectorAll("svg path");
      expect(paths).toHaveLength(2);
      expect(paths[0].getAttribute("d")).toBe(
        "M15 5V9C15 12.3137 12.3137 15 9 15H5"
      );
      await act(async () => root.unmount());
    }
  });

  test("supports a custom rendered size while keeping the 18x18 viewBox", async () => {
    const { container, root } = await renderGlyph(
      <GripGlyph variant="concentric-smooth" size={14} />
    );
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("width")).toBe("14");
    expect(svg.getAttribute("height")).toBe("14");
    expect(svg.getAttribute("viewBox")).toBe("0 0 18 18");
    await act(async () => root.unmount());
  });
});
