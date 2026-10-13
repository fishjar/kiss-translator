/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import Runtime from "./Runtime";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { getRuntimeStatus } from "../../../localAi/core/runtimeClient";

jest.mock("../../../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: {
    onServiceState: jest.fn(),
    getPendingCount: () => 2,
    onPendingChange: jest.fn(() => () => {}),
  },
}));
jest.mock("../../../localAi/core/runtimeClient", () => ({
  getRuntimeStatus: jest.fn(),
}));
jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (_, fallback) => fallback,
}));
jest.mock(
  "./Settings",
  () => () => require("react").createElement("div", null, "运行时设置")
);
jest.mock("./InferenceCache", () => () => null);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("runtime sessions", () => {
  let container, root, broadcast, unsubscribe;
  const status = (state = "ready") => ({
    scheduler: { active: 1, queued: 3 },
    pool: [{ memoryMB: 1194 }],
    sessions: {
      llm: { modelId: "qwen", state, backend: "cpu", sessionVersion: 7 },
      vlm: { modelId: "glm", state: "loading", sessionVersion: 8 },
    },
  });
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    unsubscribe = jest.fn();
    runtimeHost.onServiceState.mockImplementation((cb) => {
      broadcast = cb;
      return unsubscribe;
    });
    getRuntimeStatus.mockResolvedValue(status());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Runtime />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });
  it("shows independent services and actual backend above the settings", () => {
    expect(
      [...container.querySelectorAll("tbody tr")].map(
        (row) => row.firstChild.textContent
      )
    ).toEqual(["decision", "asr", "ocr", "llm", "vlm", "tts", "doc"]);
    expect(container.textContent).toContain("cpu");
    expect(container.textContent).toContain("估算驻留: 1194 MB");
    expect(container.textContent.indexOf("会话与任务")).toBeLessThan(
      container.textContent.indexOf("运行时设置")
    );
  });
  it("coalesces events and refreshes unloaded state without polling", async () => {
    getRuntimeStatus.mockResolvedValue(status("unloaded"));
    await act(async () => {
      broadcast({});
      broadcast({});
      jest.runOnlyPendingTimers();
    });
    expect(getRuntimeStatus).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll("tbody tr")[3].textContent).toContain(
      "unloaded"
    );
    await act(async () => jest.advanceTimersByTime(60000));
    expect(getRuntimeStatus).toHaveBeenCalledTimes(2);
  });
  it("allows manual refresh and reports failure", async () => {
    getRuntimeStatus.mockRejectedValueOnce(Error("host failed"));
    await act(async () => Simulate.click(container.querySelector("button")));
    expect(container.textContent).toContain("host failed");
  });
  it("updates the local pending count when requests settle", async () => {
    const callback = runtimeHost.onPendingChange.mock.calls[0][0];
    await act(async () => callback(0));
    expect(container.textContent).toContain("本页 RPC 等待: 0");
  });
  it("does not apply an older snapshot after a newer refresh", async () => {
    let resolveOld;
    getRuntimeStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    await act(async () => {
      broadcast({});
      jest.runOnlyPendingTimers();
    });
    getRuntimeStatus.mockResolvedValueOnce(status("unloaded"));
    await act(async () => {
      broadcast({});
      jest.runOnlyPendingTimers();
    });
    await act(async () => resolveOld(status("ready")));
    expect(container.querySelectorAll("tbody tr")[3].textContent).toContain(
      "unloaded"
    );
  });
  it("unsubscribes and cancels scheduled refresh on unmount", async () => {
    broadcast({});
    act(() => root.unmount());
    root = { unmount() {} };
    await act(async () => jest.runOnlyPendingTimers());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(getRuntimeStatus).toHaveBeenCalledTimes(1);
  });
});
