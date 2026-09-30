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
  const render = (expanded, entries = logs) =>
    act(() => root.render(<LogViewer expanded={expanded} logs={entries} />));
  const logBox = () =>
    Array.from(container.querySelectorAll("span"))
      .find((node) => node.textContent === "model log")
      .parentElement.parentElement;

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
    render(true);
    const box = logBox();
    Object.defineProperty(box, "scrollHeight", { value: 600 });
    box.scrollTop = 20;
    container.scrollTop = 100;
    render(true, [...logs, { ...logs[0], message: "model unloaded" }]);
    expect(box.scrollTop).toBe(600);
    expect(container.scrollTop).toBe(100);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("waits until the log panel is expanded to follow new logs", () => {
    render(false);
    const box = logBox();
    Object.defineProperty(box, "scrollHeight", { value: 600 });
    box.scrollTop = 20;
    const entries = [...logs, { ...logs[0], message: "model loaded" }];
    render(false, entries);
    expect(box.scrollTop).toBe(20);
    render(true, entries);
    expect(box.scrollTop).toBe(600);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps a 16px gap above the log panel when expanded and collapsed", () => {
    for (const expanded of [false, true, false]) {
      act(() => root.render(<><div>Upload buttons</div><LogViewer expanded={expanded} logs={logs} /></>));
      const panel = container.querySelector(".MuiAccordion-root");
      expect(getComputedStyle(panel.parentElement).paddingTop).toBe("16px");
      expect(getComputedStyle(panel).marginTop).toBe("0px");
    }
  });

  it("follows new logs even when the retained count stays at the limit", () => {
    const entries = Array.from({ length: 500 }, () => logs[0]);
    render(true, entries);
    const box = logBox();
    Object.defineProperty(box, "scrollHeight", { value: 600 });
    box.scrollTop = 20;
    render(true, [...entries.slice(1), { ...logs[0], message: "latest model log" }]);
    expect(box.scrollTop).toBe(600);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("retains the newest 500 batched logs, expands on error, and restarts after clearing", () => {
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
    expect(current.logs.at(-1)).toMatchObject({ message: "latest error", level: "error" });
    expect(current.expanded).toBe(true);
    act(() => current.clearLogs());
    expect(current.logs).toEqual([]);
    act(() => current.addLog("after clear"));
    expect(current.logs.map((log) => log.message)).toEqual(["after clear"]);
  });
});
