jest.mock("../../hooks/I18n", () => ({
  useI18n: () => require("../../config/i18n").newI18n("zh"),
}));
import { act } from "react";
import { createRoot } from "react-dom/client";
import NativeCapabilityTest from "./NativeCapabilityTest";
import { invokeService } from "../../providers/serviceRuntime";

jest.mock("../../providers/serviceRuntime", () => ({
  invokeService: jest.fn(),
}));
jest.mock("../../builtin-plugins/capabilities", () => ({
  resolveBuiltinCapabilities: async () => ({}),
}));
jest.mock("../../config/serviceSelection", () => ({
  enabledApiCapabilities: (api) => api.enabledCapabilities,
}));
jest.mock("../../config/prompt", () => ({
  resolveApiPromptSettings: (api) => api,
}));
jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({ prompts: [] }),
}));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: {} }),
}));
jest.mock("../../providers/transport", () => ({
  createAssetStore: () => ({ clear: jest.fn() }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let node, root;
const button = (text) =>
  Array.from(node.querySelectorAll("button")).find(
    (item) => item.textContent === text
  );
const render = async (api) =>
  act(async () =>
    root.render(<NativeCapabilityTest key={api.apiSlug} api={api} />)
  );
beforeEach(() => {
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  invokeService.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
});

test("all capabilities are expanded immediately; disabling every capability hides input and execution", async () => {
  await render({ apiSlug: "asr", enabledCapabilities: ["transcribe"] });
  expect(node.querySelector('.kt-service-test input[type="file"]').accept).toBe(
    "audio/*"
  );
  expect(button("能力测试")).toBeUndefined();
  await render({ apiSlug: "asr", enabledCapabilities: [] });
  expect(node.textContent).toContain("未启用任何能力");
  expect(node.querySelector('input[type="file"]')).toBeNull();
  expect(button("执行测试").disabled).toBe(true);
});

test("saving keeps results; switching instances cancels an old task and prevents late results", async () => {
  const api = { apiSlug: "one", enabledCapabilities: ["chat"] };
  invokeService.mockReturnValueOnce({
    result: Promise.resolve({ text: "completed" }),
    cancel: jest.fn(),
  });
  await render(api);
  await act(async () => button("执行测试").click());
  await render({ ...api, apiName: "saved name" });
  expect(node.textContent).toContain("completed");
  let finish;
  const cancel = jest.fn();
  invokeService.mockReturnValueOnce({
    result: new Promise((resolve) => {
      finish = resolve;
    }),
    cancel,
  });
  await act(async () => button("执行测试").click());
  await render({ apiSlug: "two", enabledCapabilities: ["speak"] });
  expect(cancel).toHaveBeenCalledTimes(1);
  await act(async () => finish({ text: "late result" }));
  expect(node.textContent).not.toContain("late result");
  expect(node.textContent).not.toContain("completed");
});

test("cancel stays in the test card and completes through the existing task cancellation", async () => {
  let reject;
  const cancel = jest.fn(() => reject(new Error("Cancelled task")));
  invokeService.mockReturnValue({
    result: new Promise((_, fail) => {
      reject = fail;
    }),
    cancel,
  });
  await render({ apiSlug: "one", enabledCapabilities: ["chat"] });
  await act(async () => button("执行测试").click());
  expect(button("取消").closest(".kt-service-test__actions")).not.toBeNull();
  await act(async () => button("取消").click());
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("Cancelled task");
  expect(button("执行测试").disabled).toBe(false);
});
