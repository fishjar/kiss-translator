/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import SettingsTab from "./Settings";
import {
  DEFAULT_SETTINGS,
  INPUT_LIMIT_KEYS,
} from "../../../localAi/core/types";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";

jest.mock("../../../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn(), onServiceState: jest.fn() },
}));
jest.mock("../../../localAi/runtime/rpc", () => ({ nextRpcId: () => "test" }));
jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (_, fallback) => fallback,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("local AI settings", () => {
  let container, root, broadcast;
  const initial = {
    ...DEFAULT_SETTINGS,
    mirror: "hf-mirror",
    autoUnloadMinutes: 10,
    exclusiveResourceMode: false,
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    runtimeHost.onServiceState.mockImplementation((callback) => {
      broadcast = callback;
      return () => {};
    });
    runtimeHost.request.mockImplementation(async (req) => ({
      ...initial,
      ...req.payload,
    }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<SettingsTab />);
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const edit = async (value, event = "blur", key) => {
    const input = container.querySelector(
      key ? `input[data-limit="${key}"]` : 'input[type="number"]'
    );
    await act(async () => {
      Simulate.change(input, { target: { value } });
    });
    await act(async () => {
      if (event === "blur") Simulate.blur(input);
      else Simulate.keyDown(input, { key: "Enter", preventDefault() {} });
    });
  };
  const writes = () =>
    runtimeHost.request.mock.calls.filter(
      ([req]) => req.method === "updateSettings"
    );

  it("shows default minutes and the mode's tradeoff", () => {
    expect(container.querySelector('input[type="number"]').value).toBe("10");
    expect(container.textContent).toContain("减少内存和显存占用");
    expect(container.textContent).toContain("等待时间更长");
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(
      false
    );
  });
  it.each(["", "-1", "1.5"])(
    "does not save invalid input %s",
    async (value) => {
      await edit(value);
      expect(writes()).toHaveLength(0);
      expect(container.textContent).toContain("请输入非负整数");
    }
  );
  it("saves a partial time update on Enter and accepts zero", async () => {
    await edit("3", "enter");
    expect(writes()[0][0].payload).toEqual({ autoUnloadMinutes: 3 });
    await edit("0");
    expect(writes()[1][0].payload).toEqual({ autoUnloadMinutes: 0 });
  });
  it.each(["", "-1", "1.5"])(
    "rejects invalid residency budget %s",
    async (value) => {
      await edit(value, "blur", "residentMemoryBudgetMB");
      expect(writes()).toHaveLength(0);
      expect(container.textContent).toContain("请输入非负整数");
    }
  );
  it("saves residency budget and allows disabling it", async () => {
    await edit("4096", "enter", "residentMemoryBudgetMB");
    expect(writes()[0][0].payload).toEqual({ residentMemoryBudgetMB: 4096 });
    await edit("0", "blur", "residentMemoryBudgetMB");
    expect(writes()[1][0].payload).toEqual({ residentMemoryBudgetMB: 0 });
  });
  it("shows a failed save and keeps the mode unchecked", async () => {
    runtimeHost.request.mockRejectedValueOnce(new Error("保存失败"));
    await act(async () => {
      Simulate.change(container.querySelector('input[type="checkbox"]'), {
        target: { checked: true },
      });
    });
    expect(container.textContent).toContain("保存失败");
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(
      false
    );
  });
  it("updates when another page changes settings", async () => {
    await act(async () => {
      broadcast({
        settings: {
          ...initial,
          autoUnloadMinutes: 7,
          exclusiveResourceMode: true,
        },
      });
    });
    expect(container.querySelector('input[type="number"]').value).toBe("7");
    expect(container.querySelector('input[type="checkbox"]').checked).toBe(
      true
    );
  });
  it.each(INPUT_LIMIT_KEYS)(
    "shows and saves a positive %s limit",
    async (key) => {
      expect(container.querySelector(`input[data-limit="${key}"]`).value).toBe(
        String(DEFAULT_SETTINGS[key])
      );
      await edit("2", "enter", key);
      expect(writes()[0][0].payload).toEqual({ [key]: 2 });
    }
  );
  it.each(["", "0", "-1", "1.5"])(
    "rejects an invalid input limit %s",
    async (value) => {
      await edit(value, "blur", "maxImageEdge");
      expect(writes()).toHaveLength(0);
      expect(container.textContent).toContain("请输入正整数");
    }
  );
  it("shows a failed limit save and accepts a later broadcast", async () => {
    runtimeHost.request.mockRejectedValueOnce(new Error("保存失败"));
    await edit("2048", "blur", "maxImageEdge");
    expect(container.textContent).toContain("保存失败");
    await act(async () =>
      broadcast({ settings: { ...initial, maxImageEdge: 1024 } })
    );
    expect(
      container.querySelector('input[data-limit="maxImageEdge"]').value
    ).toBe("1024");
  });
});
