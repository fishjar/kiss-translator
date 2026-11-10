/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import LogViewer, { useLocalAiLog, LOG_LEVEL_COLORS, logLevelColor } from "./LogViewer";

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

describe("local AI log level colors consume kt tokens (W13)", () => {
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
    expect(logLevelColor("error", false)).toBe("var(--kt-err)");
    expect(logLevelColor("success", true)).toBe("var(--kt-grn)");
    expect(logLevelColor("info", false)).toBe("var(--kt-pri)");
    // 未知级别退回 info 主色。
    expect(logLevelColor("verbose", false)).toBe("var(--kt-pri)");
    // 原型链键不得被当作级别色：查找仅认自有属性，"constructor"/"toString"
    // 等键按未知级别回退主色（直取会把原型函数当颜色值）。
    expect(logLevelColor("constructor", false)).toBe("var(--kt-pri)");
    expect(logLevelColor("toString", true)).toBe("var(--kt-pri)");
  });
});
