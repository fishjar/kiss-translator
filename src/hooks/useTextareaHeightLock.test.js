import { act } from "react";
import { createRoot } from "react-dom/client";
import TextField from "@mui/material/TextField";
import useTextareaHeightLock, {
  useTextareaGripStyle,
  useReleaseOnGripHidden,
  __getSessionHeightMapForTests,
  __resetSessionHeightMapForTests,
} from "./useTextareaHeightLock";

// React 18 act 环境标志：缺失时 react-dom 对每次 createRoot+act 渲染
// 输出告警（仓库 A 类测试模板的既有约定，30+ 套件同款）。
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 视口钳制用例的视口口径：用例内按需改写，afterEach 统一还原。
const ORIGINAL_INNER_HEIGHT = window.innerHeight;

// 单帧确定性推进：以真实 rAF 回调内 resolve 的 Promise 等待一帧（与
// 「单帧、无 runAllTimers」的推进意图同构）。不使用 fake timers：Jest 27
// 的 ModernFakeTimers.useFakeTimers() 不转发 shouldClearNativeTimers，而
// MUI TextareaAutosize 的卸载清理会无条件 cancelAnimationFrame(-1) 哨兵
// （TextareaAutosize.js:141/169），fake 环境下 sinon 必产原生定时器告警；
// 真实定时器下该调用是静默 no-op。
const advanceFrame = () =>
  act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

// useTextareaGripStyle 依赖 useSetting；以可变 mockGripSetting 驱动缺省回落、
// 存量值透传与已下线样式 key 归一三条断言。默认导出 useTextareaHeightLock
// 不调用 useSetting，故本 mock 对锁定用例零影响。
const mockGripSetting = { textareaGripStyle: undefined };
jest.mock("./Setting", () => ({
  useSetting: () => ({ setting: mockGripSetting }),
}));

// 夹具用真实 TextField multiline：锁定标记与高度经 lock.rootProps 进入
// InputProps，与生产接线同构。这是本文件的核心保真度要求——只有真实 MUI
// 组合才能复现「InputBase 自带 focused state 触发的、仅 InputBase 子树
// 重渲染并重写 root className」这条路径。
function FieldHost({ lockKey, minRows = 3, error, onChange }) {
  const lock = useTextareaHeightLock(lockKey);
  onChange(lock);
  return (
    <TextField
      multiline
      minRows={minRows}
      maxRows={minRows + 5}
      error={error}
      inputRef={lock.textareaRef}
      InputProps={{ ...lock.rootProps }}
      inputProps={{ className: "kt-resizable-textarea" }}
    />
  );
}

async function renderField(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(ui));
  return {
    container,
    root,
    fieldRoot: container.querySelector(".MuiInputBase-root"),
    textarea: container.querySelector("textarea"),
  };
}

function GripStyleHost({ onResult }) {
  onResult(useTextareaGripStyle());
  return null;
}

async function renderGripStyle() {
  let captured;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<GripStyleHost onResult={(value) => (captured = value)} />);
  });
  return { root, getCaptured: () => captured };
}

describe("useTextareaHeightLock", () => {
  let setItemSpy;

  beforeEach(() => {
    // 会话记忆是模块级 Map，跨用例存活：统一在用例入口重置，替代各用例
    // 尾部的散调，避免新增用例遗漏清理造成 key 串扰。
    __resetSessionHeightMapForTests();
    setItemSpy = jest.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: ORIGINAL_INNER_HEIGHT,
    });
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("renders no lock props while unlocked and leaves the InputBase root clean", async () => {
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="fresh-test" onChange={(api) => (lock = api)} />
    );
    expect(lock.lockedHeight).toBeNull();
    expect(lock.rootProps).toEqual({});
    expect(fieldRoot.style.height).toBe("");
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    await act(async () => root.unmount());
  });

  test("renders the lock class and the pixel height on the InputBase root", async () => {
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="pin-test" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(180));
    expect(lock.rootProps).toEqual({
      className: "kt-height-locked",
      style: { height: "180px" },
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("180px");
    await act(async () => root.unmount());
  });

  // 回归：InputBase 内置 focused state 在聚焦/失焦时只重渲染 InputBase 自身
  // 子树，其 root className 由 clsx(classes.root, rootProps.className,
  // className, …) 重新拼装。命令式 classList 写入的锁定标记会被该次重写抹掉，
  // 而父视图不参与该次提交、无从补写，类与内联高度就此失同步。锁定态改由
  // React 承载后，类与高度都是受管属性，任何重渲染都只能重放出同一份锁定态。
  test("survives the InputBase-only re-render triggered by focus and blur", async () => {
    let lock;
    const { root, fieldRoot, textarea } = await renderField(
      <FieldHost lockKey="focus-test" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(180));
    expect(fieldRoot.classList).toContain("kt-height-locked");

    await act(async () => textarea.focus());
    // 前提断言：聚焦确实触发了 InputBase 自身的聚焦重渲染。
    expect(fieldRoot.classList).toContain("Mui-focused");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("180px");

    await act(async () => textarea.blur());
    expect(fieldRoot.classList).not.toContain("Mui-focused");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("180px");
    await act(async () => root.unmount());
  });

  // 对照组：父视图参与的提交（ownerState 变化同样改写 root className）。
  // 新旧实现都应通过，用于锁死「重渲染不得松动锁定态」这一契约的完整覆盖面。
  test("survives a re-render triggered by an InputBase ownerState change", async () => {
    let lock;
    const first = await renderField(
      <FieldHost lockKey="owner-state-test" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(200));
    expect(first.fieldRoot.classList).toContain("kt-height-locked");

    await act(async () =>
      first.root.render(
        <FieldHost
          lockKey="owner-state-test"
          error
          onChange={(api) => (lock = api)}
        />
      )
    );
    expect(first.fieldRoot.classList).toContain("kt-height-locked");
    expect(first.fieldRoot.style.height).toBe("200px");
    await act(async () => first.root.unmount());
  });

  test("restores the locked height and the root props after remount within the same session", async () => {
    let lock;
    const first = await renderField(
      <FieldHost lockKey="remember-me" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(220));
    await act(async () => first.root.unmount());

    let lock2;
    const second = await renderField(
      <FieldHost lockKey="remember-me" onChange={(api) => (lock2 = api)} />
    );
    expect(second.fieldRoot.classList).toContain("kt-height-locked");
    expect(second.fieldRoot.style.height).toBe("220px");
    await act(async () => second.root.unmount());
  });

  test("keeps two locks with different keys independent", async () => {
    let lockA;
    let lockB;
    const first = await renderField(
      <FieldHost lockKey="inst-a" onChange={(api) => (lockA = api)} />
    );
    const second = await renderField(
      <FieldHost lockKey="inst-b" onChange={(api) => (lockB = api)} />
    );
    await act(async () => lockA.applyHeight(150));
    expect(first.fieldRoot.classList).toContain("kt-height-locked");
    expect(first.fieldRoot.style.height).toBe("150px");
    expect(lockB.lockedHeight).toBeNull();
    expect(second.fieldRoot.classList).not.toContain("kt-height-locked");
    expect(second.fieldRoot.style.height).toBe("");
    await act(async () => first.root.unmount());
    await act(async () => second.root.unmount());
  });

  test("keeps the session memory out of any storage", async () => {
    let lock;
    const { root } = await renderField(
      <FieldHost lockKey="no-storage" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(120));
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("no-storage")).toBeNull();
    await act(async () => root.unmount());
  });

  test("releaseHeight clears the session memory and the root props", async () => {
    let lock;
    const first = await renderField(
      <FieldHost lockKey="release-me" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(180));
    expect(lock.lockedHeight).toBe(180);
    expect(first.fieldRoot.classList).toContain("kt-height-locked");
    expect(first.fieldRoot.style.height).toBe("180px");

    await act(async () => lock.releaseHeight());
    expect(lock.lockedHeight).toBeNull();
    expect(lock.rootProps).toEqual({});
    // 会话记忆同步清除：Map 内不再有该 key（双击解锁链路的 hook 侧护栏）。
    expect(__getSessionHeightMapForTests().has("release-me")).toBe(false);
    expect(first.fieldRoot.classList).not.toContain("kt-height-locked");
    expect(first.fieldRoot.style.height).toBe("");

    // 会话记忆同步清除：同 key 卸载重挂载不再恢复高度。
    await act(async () => first.root.unmount());
    let lock2;
    const second = await renderField(
      <FieldHost lockKey="release-me" onChange={(api) => (lock2 = api)} />
    );
    expect(lock2.lockedHeight).toBeNull();
    expect(second.fieldRoot.classList).not.toContain("kt-height-locked");
    expect(second.fieldRoot.style.height).toBe("");
    await act(async () => second.root.unmount());
  });

  test("useTextareaGripStyle falls back to the default concentric arc", async () => {
    mockGripSetting.textareaGripStyle = undefined;
    const { root, getCaptured } = await renderGripStyle();
    expect(getCaptured()).toBe("concentric-smooth");
    await act(async () => root.unmount());
  });

  test("useTextareaGripStyle passes through a stored grip style value", async () => {
    mockGripSetting.textareaGripStyle = "hidden";
    const { root, getCaptured } = await renderGripStyle();
    expect(getCaptured()).toBe("hidden");
    await act(async () => root.unmount());
    mockGripSetting.textareaGripStyle = undefined;
  });

  // 已下线样式 key 的存量设置值：归一为默认样式，避免设置页下拉匹配不到
  // 选项而显示空值。
  test("useTextareaGripStyle normalizes retired stored grip style values", async () => {
    for (const retired of ["firefox-native", "upstream-chrome"]) {
      mockGripSetting.textareaGripStyle = retired;
      const { root, getCaptured } = await renderGripStyle();
      expect(getCaptured()).toBe("concentric-smooth");
      await act(async () => root.unmount());
    }
    mockGripSetting.textareaGripStyle = undefined;
  });

  // 会话记忆恢复的双向钳制与挂载后实测重钳：记忆可能来自更高视口
  // （600px 视口恢复 800px 记忆），直接落内联高度会溢出实际元素。恢复
  // 经 useState 惰性初始化按当前视口钳上界、最小高度钳下界；挂载后布局
  // 效应再按实测基线位置重钳——jsdom 基线 top 恒 0，上界为
  // floor(600 − 0 − 8) = 592，裸 innerHeight 口径的 600 仍会溢出底部留白。
  // 实测重钳经 rAF 承载（A3）：断言前推进一帧等待实测完成。
  test("clamps a restored remembered height to the current viewport on mount", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    __getSessionHeightMapForTests().set("viewport-clamp", 800);
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="viewport-clamp" onChange={(api) => (lock = api)} />
    );
    await advanceFrame();
    expect(lock.lockedHeight).toBe(592);
    expect(fieldRoot.style.height).toBe("592px");
    await act(async () => root.unmount());
  });

  // lockKey 变更重读路径与惰性初始化同口径钳制，并同样经挂载后实测
  // 重钳收敛（600 − 0 − 8 = 592）。实测重钳经 rAF 承载（A3）：断言前
  // 推进一帧等待实测完成。
  test("clamps a remembered height re-read on lockKey change", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    let lock;
    const first = await renderField(
      <FieldHost lockKey="key-a" onChange={(api) => (lock = api)} />
    );
    __getSessionHeightMapForTests().set("key-b", 800);
    await act(async () =>
      first.root.render(
        <FieldHost lockKey="key-b" onChange={(api) => (lock = api)} />
      )
    );
    await advanceFrame();
    expect(lock.lockedHeight).toBe(592);
    expect(first.fieldRoot.style.height).toBe("592px");
    await act(async () => first.root.unmount());
  });

  // 公开写入口 applyHeight 的双向钳制：程序化调用可能绕过手柄
  // clampHeight 的全量口径，边界责任由 hook 自持；落定高度随后被挂载
  // 事务后的实测重钳进一步收敛进「视口 − 基线 top − 留白」真实上限
  // （jsdom 基线 top 恒 0：600 − 0 − 8 = 592）。实测重钳经 rAF 承载
  // （A3）：断言前推进一帧等待实测完成。
  test("clamps applyHeight to the minimum height and the current viewport", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="apply-clamp" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(800));
    await advanceFrame();
    expect(fieldRoot.style.height).toBe("592px");
    await act(async () => lock.applyHeight(10));
    await advanceFrame();
    expect(fieldRoot.style.height).toBe("64px");
    await act(async () => root.unmount());
  });

  // 非有限数静默拒绝：applyHeight(NaN) 不得把 no-op 失败收敛成 40 的
  // 意外锁定态——会话记忆与锁定态都必须保持调用前的原样。
  test("applyHeight silently rejects non-finite heights without locking", async () => {
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="nan-reject" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(Number.NaN));
    expect(lock.lockedHeight).toBeNull();
    expect(lock.rootProps).toEqual({});
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("");
    expect(__getSessionHeightMapForTests().has("nan-reject")).toBe(false);
    await act(async () => root.unmount());
  });

  // A1：cap 低于最小目标高度（基线整体在视口下缘之外）不构成可用上限：
  // 跳过重钳，保留用户锁定高度。强行钳到最小值会把首屏之下字段的锁定高度
  // 永久压扁且无自愈路径。
  test("keeps the locked height when the measured viewport cap is below the minimum", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="viewport-floor" onChange={(api) => (lock = api)} />
    );
    // 基线整体在视口下缘之外：cap = floor(600 − 700 − 8) = −108 < 64。
    jest
      .spyOn(fieldRoot, "getBoundingClientRect")
      .mockReturnValue({ top: 700, bottom: 900, width: 0, height: 200 });
    await act(async () => lock.applyHeight(400));
    await advanceFrame();
    expect(lock.lockedHeight).toBe(400);
    expect(fieldRoot.style.height).toBe("400px");
    expect(fieldRoot.classList).toContain("kt-height-locked");
    await act(async () => root.unmount());
  });

  // A2：重钳输入源必须取当前 lockKey 的会话记忆。同挂载从已锁定 key-a
  // 切到无记忆 key-b 的同一提交里，lockedHeight state 仍持旧 key 的闭包
  // 值；以它参与重钳会把旧高度写进本应未锁定的 key-b（视口收窄时落成
  // 92px 的幽灵锁定态）。几何恢复后切回 key-a，记忆 400 必须原样恢复。
  test("does not re-clamp a memory-less lockKey from the previous key's stale state", async () => {
    let lock;
    const first = await renderField(
      <FieldHost lockKey="stale-key-a" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(400));
    await advanceFrame();
    expect(lock.lockedHeight).toBe(400);
    // 收紧视口制造「clamped ≠ 旧 state」的重钳分支：
    // cap = floor(300 − 200 − 8) = 92（≥ 64，避开 A1 的无效 cap 早退）。
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 300,
    });
    const gBCRSpy = jest
      .spyOn(first.fieldRoot, "getBoundingClientRect")
      .mockReturnValue({ top: 200, bottom: 300, width: 0, height: 100 });
    await act(async () =>
      first.root.render(
        <FieldHost lockKey="stale-key-b" onChange={(api) => (lock = api)} />
      )
    );
    expect(lock.lockedHeight).toBeNull();
    expect(first.fieldRoot.classList).not.toContain("kt-height-locked");
    expect(first.fieldRoot.style.height).toBe("");
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    gBCRSpy.mockRestore();
    await act(async () =>
      first.root.render(
        <FieldHost lockKey="stale-key-a" onChange={(api) => (lock = api)} />
      )
    );
    expect(lock.lockedHeight).toBe(400);
    expect(first.fieldRoot.style.height).toBe("400px");
    await act(async () => first.root.unmount());
  });

  // A3：重钳实测经 rAF 承载——同一提交内多次 lockedHeight 变更只做一次
  // getBoundingClientRect 同步布局读；首次 rAF 句柄必须被取消（无幽灵
  // setLockedHeight）；最终重钳结果与既有口径一致。
  test("batches re-clamp measurements into a single animation frame per commit", async () => {
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="raf-batch" onChange={(api) => (lock = api)} />
    );
    const rafSpy = jest.spyOn(window, "requestAnimationFrame");
    const cancelSpy = jest.spyOn(window, "cancelAnimationFrame");
    const gBCRSpy = jest.spyOn(fieldRoot, "getBoundingClientRect");
    await act(async () => lock.applyHeight(200));
    await act(async () => lock.applyHeight(300));
    await advanceFrame();
    // 两次 applyHeight 只触发一次实测（红：现实现逐变更同步实测 2 次）。
    expect(gBCRSpy.mock.calls.length).toBeLessThanOrEqual(1);
    expect(cancelSpy).toHaveBeenCalledWith(rafSpy.mock.results[0].value);
    expect(lock.lockedHeight).toBe(300);
    await act(async () => root.unmount());
  });

  // A3 扩展：视口 resize 后按会话记忆重钳（rAF trailing 合并、无效 cap
  // 护栏同 A1）；卸载后监听器移除，resize 不再调度任何 rAF（无幽灵
  // setState）。
  test("re-clamps the locked height on viewport resize and detaches on unmount", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    let lock;
    const { root, fieldRoot } = await renderField(
      <FieldHost lockKey="resize-reclamp" onChange={(api) => (lock = api)} />
    );
    await act(async () => lock.applyHeight(400));
    await advanceFrame();
    expect(lock.lockedHeight).toBe(400);
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 300,
    });
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await advanceFrame();
    // 新 cap = floor(300 − 0 − 8) = 292（jsdom 基线 top 恒 0）。
    expect(lock.lockedHeight).toBe(292);
    expect(fieldRoot.style.height).toBe("292px");
    const rafSpy = jest.spyOn(window, "requestAnimationFrame");
    await act(async () => root.unmount());
    await act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // 监听器移除是同步事实：若仍挂载，dispatchEvent 的同步路径即调度 rAF，
    // 无需等帧即可断言无幽灵调度。
    expect(rafSpy).not.toHaveBeenCalled();
  });

  // A4 护栏：测量基准不可解析（closest 未命中）时重钳必须跳过，锁定态
  // 不被改写（手柄侧「仅下界钳制」的对称口径由组件测试覆盖）。
  test("skips the re-clamp when the baseline element is unresolvable", async () => {
    let lock;
    const { root, fieldRoot, textarea } = await renderField(
      <FieldHost lockKey="selector-miss" onChange={(api) => (lock = api)} />
    );
    jest.spyOn(textarea, "closest").mockReturnValue(null);
    await act(async () => lock.applyHeight(400));
    await advanceFrame();
    expect(lock.lockedHeight).toBe(400);
    expect(fieldRoot.classList).toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("400px");
    await act(async () => root.unmount());
  });
});

// useReleaseOnGripHidden：grip 样式切到 hidden 的渲染轮自动释放高度锁，
// 杜绝字段被 kt-height-locked 永久钉死。语义锚：
// ① 非 hidden（含 undefined/未知 key）不调用 releaseHeight；
// ② 切到 hidden 时调用一次；
// ③ hidden 下重复渲染幂等（无记忆时 releaseHeight 本身空操作安全）；
// ④ 卸载不抛错。
describe("useReleaseOnGripHidden", () => {
  beforeEach(() => {
    __resetSessionHeightMapForTests();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function ReleaseHost({ gripStyle, onRelease }) {
    useReleaseOnGripHidden(gripStyle, onRelease);
    return null;
  }

  async function renderRelease(ui) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(ui));
    return { container, root };
  }

  test("does not release for non-hidden grip styles", async () => {
    const onRelease = jest.fn();
    const { root } = await renderRelease(
      <ReleaseHost gripStyle="concentric-smooth" onRelease={onRelease} />
    );
    expect(onRelease).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  test("releases exactly once when switching to hidden", async () => {
    const onRelease = jest.fn();
    const { root } = await renderRelease(
      <ReleaseHost gripStyle="concentric-smooth" onRelease={onRelease} />
    );
    expect(onRelease).not.toHaveBeenCalled();
    await act(async () =>
      root.render(<ReleaseHost gripStyle="hidden" onRelease={onRelease} />)
    );
    expect(onRelease).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  test("releases immediately when mounted straight into hidden", async () => {
    const onRelease = jest.fn();
    const { root } = await renderRelease(
      <ReleaseHost gripStyle="hidden" onRelease={onRelease} />
    );
    expect(onRelease).toHaveBeenCalledTimes(1);
    // hidden 下重复渲染幂等：不追加调用、不抛错。
    await act(async () =>
      root.render(<ReleaseHost gripStyle="hidden" onRelease={onRelease} />)
    );
    expect(onRelease).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  test("normalizes unknown grip style keys before the hidden check", async () => {
    const onRelease = jest.fn();
    const { root } = await renderRelease(
      <ReleaseHost gripStyle="retired-key" onRelease={onRelease} />
    );
    // 未知 key 经 resolveGripStyle 归一为默认样式，非 hidden，不释放。
    expect(onRelease).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
