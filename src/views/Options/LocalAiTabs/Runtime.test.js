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
    request: jest.fn(),
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
  const sessionButton = (service) =>
    container.querySelector(
      `button[aria-label="结束会话并卸载模型 (${service})"]`
    );

  it("shows an icon action for every service and only enables idle loaded sessions", async () => {
    for (const service of [
      "decision",
      "asr",
      "ocr",
      "llm",
      "vlm",
      "tts",
      "doc",
    ]) {
      expect(sessionButton(service).querySelector("svg")).not.toBeNull();
      expect(sessionButton(service).disabled).toBe(service !== "llm");
    }
    const next = status();
    next.sessions = {
      decision: { modelId: "jev", state: "ready", busy: true },
      asr: { modelId: "asr", state: "loading" },
      ocr: { modelId: "ocr", state: "unloading" },
      llm: { modelId: "qwen", state: "idle" },
      vlm: { modelId: "glm", state: "idle", busy: true },
      tts: { modelId: "tts", state: "unloaded" },
      doc: { modelId: null, state: "ready" },
    };
    getRuntimeStatus.mockResolvedValue(next);
    await act(async () => Simulate.click(container.querySelector("button")));
    for (const service of Object.keys(next.sessions)) {
      expect(sessionButton(service).disabled).toBe(service !== "llm");
    }
  });

  it.each(["decision", "asr", "ocr", "llm", "vlm", "tts", "doc"])(
    "unloads only %s and refreshes the session and residency",
    async (service) => {
      const loaded = status();
      loaded.sessions[service] = {
        modelId: "model",
        state: "ready",
        sessionVersion: 7,
      };
      getRuntimeStatus.mockResolvedValueOnce(loaded);
      await act(async () => Simulate.click(container.querySelector("button")));
      const released = status();
      released.sessions[service] = {
        modelId: null,
        state: "unloaded",
        sessionVersion: 9,
      };
      released.pool = [];
      getRuntimeStatus.mockResolvedValueOnce(released);
      runtimeHost.request.mockResolvedValueOnce({ ok: true });
      await act(async () => Simulate.click(sessionButton(service)));
      expect(runtimeHost.request).toHaveBeenCalledTimes(1);
      expect(runtimeHost.request).toHaveBeenCalledWith({
        id: expect.any(String),
        service,
        method: "unload",
        payload: {},
      });
      const cells = sessionButton(service).closest("tr").querySelectorAll("td");
      expect(cells[1].textContent).toBe("—");
      expect(cells[2].textContent).toBe("unloaded");
      expect(cells[4].textContent).toBe("9");
      expect(sessionButton(service).disabled).toBe(true);
      expect(container.textContent).toContain("估算驻留: 0 MB");
    }
  );

  it("blocks repeated clicks while unloading and recovers after a busy rejection", async () => {
    let rejectUnload;
    runtimeHost.request.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectUnload = reject;
        })
    );
    await act(async () => {
      Simulate.click(sessionButton("llm"));
      Simulate.click(sessionButton("llm"));
    });
    expect(runtimeHost.request).toHaveBeenCalledTimes(1);
    expect(sessionButton("llm").disabled).toBe(true);
    expect(sessionButton("vlm").disabled).toBe(true);
    await act(async () => rejectUnload(Error("SERVICE_BUSY: 服务正在使用")));
    expect(container.querySelector('[role="alert"]').textContent).toContain(
      "SERVICE_BUSY"
    );
    expect(sessionButton("llm").disabled).toBe(false);
    runtimeHost.request.mockResolvedValueOnce({ ok: true });
    await act(async () => Simulate.click(sessionButton("llm")));
    expect(runtimeHost.request).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
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
