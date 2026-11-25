/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import LogViewer, {
  useLocalAiLog,
  LOG_LEVEL_COLORS,
  logLevelColor,
} from "./LogViewer";

jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (_, fallback) => fallback,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("local AI log scrolling", () => {
  let container, root, originalScrollIntoView;
  const logs = [{ time: "12:00:00", level: "info", message: "model log" }];
  const render = (entries = logs) =>
    act(() => root.render(<LogViewer logs={entries} />));
  const logBox = () =>
    Array.from(container.querySelectorAll("span")).find(
      (node) => node.textContent === "model log"
    ).parentElement.parentElement;

  beforeEach(() => {
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = jest.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    if (originalScrollIntoView) {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete HTMLElement.prototype.scrollIntoView;
    }
  });

  it("follows appended logs inside the log box without scrolling ancestors", () => {
    render();
    const box = logBox();
    Object.defineProperty(box, "scrollHeight", { value: 600 });
    box.scrollTop = 20;
    container.scrollTop = 100;
    render([...logs, { ...logs[0], message: "model unloaded" }]);
    expect(box.scrollTop).toBe(600);
    expect(container.scrollTop).toBe(100);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows an ordinary card with the same heading and spacing as the operation cards", () => {
    render([]);
    expect(container.querySelectorAll(".MuiCard-root")).toHaveLength(1);
    expect(container.querySelector(".MuiAccordion-root")).toBeNull();
    const heading = container.querySelector("h6");
    expect(heading.textContent).toBe("运行日志");
    const content = container.querySelector(".MuiCardContent-root");
    expect(getComputedStyle(content).paddingLeft).toBe("16px");
    expect(
      getComputedStyle(heading.parentElement.parentElement).marginBottom
    ).toBe("16px");
    expect(container.textContent).toContain("暂无运行日志");
    act(() => heading.click());
    expect(container.textContent).toContain("暂无运行日志");
  });

  it("clears logs through the card action", () => {
    const onClear = jest.fn();
    act(() => root.render(<LogViewer logs={logs} onClear={onClear} />));
    const clearButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "清空"
    );
    act(() => clearButton.click());
    expect(onClear).toHaveBeenCalledTimes(1);
  });
  it("follows new logs even when the retained count stays at the limit", () => {
    const entries = Array.from({ length: 500 }, () => logs[0]);
    render(entries);
    const box = logBox();
    Object.defineProperty(box, "scrollHeight", { value: 600 });
    box.scrollTop = 20;
    render([...entries.slice(1), { ...logs[0], message: "latest model log" }]);
    expect(box.scrollTop).toBe(600);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("retains the newest 500 batched logs and restarts after clearing", () => {
    let current;
    function Probe() {
      current = useLocalAiLog();
      return null;
    }
    act(() => root.render(<Probe />));
    act(() => {
      for (let i = 0; i < 501; i++) current.addLog(`entry ${i}`);
    });
    expect(current.logs.map((log) => log.message)).toEqual(
      Array.from({ length: 500 }, (_, i) => `entry ${i + 1}`)
    );
    act(() => current.addLog("latest error", "error"));
    expect(current.logs).toHaveLength(500);
    expect(current.logs[0].message).toBe("entry 2");
    expect(current.logs.at(-1)).toMatchObject({
      message: "latest error",
      level: "error",
    });
    act(() => current.clearLogs());
    expect(current.logs).toEqual([]);
    act(() => current.addLog("after clear"));
    expect(current.logs.map((log) => log.message)).toEqual(["after clear"]);
  });
});

describe("local AI log level colors consume kt tokens", () => {
  it("maps error/success/info to kt semantic tokens and pins warn as the only hex literal", () => {
    // 四键齐全：级色映射表是组件渲染与 tripwire 的共同契约面。
    expect(Object.keys(LOG_LEVEL_COLORS).sort()).toEqual([
      "error",
      "info",
      "success",
      "warn",
    ]);
    expect(LOG_LEVEL_COLORS.error).toBe("var(--kt-err)");
    expect(LOG_LEVEL_COLORS.success).toBe("var(--kt-grn)");
    expect(LOG_LEVEL_COLORS.info).toBe("var(--kt-pri)");
    // warn 无 kt 语义令牌（m3.js 令牌清单无 --kt-warn），暗色档使用琥珀字面量。
    expect(LOG_LEVEL_COLORS.warn).toBe("#f59e0b");
    // 全对象仅 warn 一个 hex 字面量：计数钉死＝1，防新增裸色回流。
    const hexLiterals = Object.values(LOG_LEVEL_COLORS).filter((value) =>
      /^#[0-9a-fA-F]{3,8}$/.test(value)
    );
    expect(hexLiterals).toEqual(["#f59e0b"]);
  });

  it("resolves warn per theme: amber on dark, deep amber on light", () => {
    // warn 暗色档琥珀 #f59e0b（#111827 底 8.26 ✓），浅色档深琥珀 #b45309
    // （#f8fafc 底 4.79 ✓，WCAG AA 4.5 线；浅色沿用 amber 仅 2.05）——
    // 与时间戳灰 --kt-onv 及 error/success/info 语义三色均分离。
    // 其余级别不随主题切换。
    expect(logLevelColor("warn", true)).toBe("#f59e0b");
    expect(logLevelColor("warn", false)).toBe("#b45309");
    // 每级暗/浅两档各钉一层：防后续为某级别静默引入主题分支而不被证伪。
    expect(logLevelColor("error", false)).toBe("var(--kt-err)");
    expect(logLevelColor("error", true)).toBe("var(--kt-err)");
    expect(logLevelColor("success", true)).toBe("var(--kt-grn)");
    expect(logLevelColor("success", false)).toBe("var(--kt-grn)");
    expect(logLevelColor("info", false)).toBe("var(--kt-pri)");
    expect(logLevelColor("info", true)).toBe("var(--kt-pri)");
    // 未知级别退回 info 主色。
    expect(logLevelColor("verbose", false)).toBe("var(--kt-pri)");
    // 原型链键不得被当作级别色：查找仅认自有属性，"constructor"/"toString"
    // 等键按未知级别回退主色（直取会把原型函数当颜色值）。
    expect(logLevelColor("constructor", false)).toBe("var(--kt-pri)");
    expect(logLevelColor("toString", true)).toBe("var(--kt-pri)");
  });
});

// 渲染面钉桩：正文取色分支须有直接渲染断言——error 正文与级别标签共用
// logLevelColor 单入口取值，非 error 正文恒 inherit；删除三元条件会让
// info/warn 正文被染色，本组断言即点名该回归形态。
// 通道说明：jsdom 16 的 cssstyle 会丢弃 var()/inherit 的属性赋值，渲染后
// DOM 状态读不到真实值（style.color 恒 ""），故须在赋值时刻钩住
// CSSStyleDeclaration 的 color 原型 setter 记录渲染实际写入的值。钩子
// 沿用仓库既有 jest.spyOn(..., "set") + mockRestore 范式（见
// ImageTranslate 同级视图中对 left setter 的孪生用法），还原由 jest
// 托管，避免手工描述符链在异常路径残留全局钩子。
describe("local AI log body coloring", () => {
  let container, root;
  const render = (entries) =>
    act(() => root.render(<LogViewer logs={entries} />));

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("colors the error body span through the shared logLevelColor entry", () => {
    const colorSetter = jest.spyOn(
      CSSStyleDeclaration.prototype,
      "color",
      "set"
    );
    try {
      render([{ time: "12:00:00", level: "error", message: "boom" }]);
      // 单行渲染顺序即 inline color 赋值点恰 3 处：时间戳灰 → 级别标签 →
      // 正文。全量数组钉桩＝顺带的数量闸：新增第 4 处赋值同样转红。
      expect(colorSetter.mock.calls.map(([value]) => value)).toEqual([
        "var(--kt-onv)",
        "var(--kt-err)",
        "var(--kt-err)",
      ]);
    } finally {
      colorSetter.mockRestore();
    }
  });

  it("keeps non-error bodies inherited while labels stay level-colored", () => {
    const colorSetter = jest.spyOn(
      CSSStyleDeclaration.prototype,
      "color",
      "set"
    );
    try {
      render([{ time: "12:00:00", level: "info", message: "plain" }]);
      // 标签侧仍走级别色，正文侧恒 inherit：inherit 消失即三元条件被删。
      expect(colorSetter.mock.calls.map(([value]) => value)).toEqual([
        "var(--kt-onv)",
        "var(--kt-pri)",
        "inherit",
      ]);
    } finally {
      colorSetter.mockRestore();
    }
  });
});
