/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import LogViewer, { useLocalAiLog } from "./LogViewer";

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
