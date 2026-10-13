/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import InferenceCache from "./InferenceCache";
import { runtimeHost } from "../../../localAi/runtime/runtimeHostAdapter";
import { getRuntimeSettings, updateRuntimeSettings } from "../../../localAi/core/runtimeClient";
jest.mock("../../../localAi/runtime/runtimeHostAdapter", () => ({ runtimeHost: {
  request: jest.fn(), onServiceState: jest.fn(() => () => {}),
} }));
jest.mock("../../../localAi/core/runtimeClient", () => ({ getRuntimeSettings: jest.fn(), updateRuntimeSettings: jest.fn() }));
jest.mock("../../../hooks/I18n", () => ({ useI18n: () => (_, fallback) => fallback }));
jest.mock("../../../localAi/runtime/rpc", () => ({ nextRpcId: () => "cache" }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
const settings = { inferenceCacheEnabled: true, inferenceCacheMB: 256, inferenceCacheDays: 30 };
beforeEach(async () => {
  jest.clearAllMocks();
  runtimeHost.onServiceState.mockReturnValue(() => {});
  getRuntimeSettings.mockResolvedValue(settings);
  updateRuntimeSettings.mockImplementation(async (patch) => patch);
  runtimeHost.request.mockResolvedValue({ count: 2, bytes: 1048576 });
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
test("shows local text-only cache stats and saves numeric policy without altering other settings", async () => {
  await act(async () => root.render(<InferenceCache />));
  expect(container.textContent).toContain("条目数: 2");
  expect(container.textContent).toContain("1.00 MiB");
  expect(container.textContent).toContain("二进制结果暂不缓存");
  const capacity = container.querySelector('input[type="number"]');
  act(() => Simulate.change(capacity, { target: { value: "128" } }));
  const save = [...container.querySelectorAll("button")].find((button) => button.textContent === "保存");
  await act(async () => save.click());
  expect(updateRuntimeSettings).toHaveBeenCalledWith({ ...settings, inferenceCacheMB: 128 });
});
test("clears only AI inference cache and reports storage errors", async () => {
  await act(async () => root.render(<InferenceCache />));
  const clear = [...container.querySelectorAll("button")].find((button) => button.textContent === "清空 AI 结果缓存");
  runtimeHost.request.mockRejectedValueOnce(new Error("storage failed"));
  await act(async () => clear.click());
  expect(runtimeHost.request).toHaveBeenCalledWith(expect.objectContaining({ service: "runtime", method: "clearInferenceCache" }));
  expect(container.textContent).toContain("storage failed");
  expect(updateRuntimeSettings).not.toHaveBeenCalled();
});
