import { act } from "react";
import { createRoot } from "react-dom/client";
import LocalModelDownload from "./LocalModelDownload";
import { sharedModelManager as manager } from "../../localAi/core/modelManager";
import { runtimeHost } from "../../localAi/runtime/runtimeHostAdapter";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../localAi/core/modelManager", () => ({
  sharedModelManager: {
    init: jest.fn(async () => {}),
    list: jest.fn(),
    get: jest.fn(),
    getMirror: () => "hf-mirror",
    subscribe: jest.fn(),
    download: jest.fn(async () => {}),
  },
}));
jest.mock("../../localAi/runtime/runtimeHostAdapter", () => ({
  runtimeHost: { request: jest.fn(), onServiceState: jest.fn() },
}));
jest.mock("../../localAi/core/catalog", () => ({
  OCR_GROUPS: [{ id: "ocr", detId: "det", recId: "rec" }],
}));

let container, root, records, listener, unsubscribe;
const record = (id, state = "not-installed", downloaded = 0) => ({
  manifest: {
    id,
    files: [{ path: "model", size: 100 }],
    base: id === "det" ? "https://official.example/models" : undefined,
  },
  state,
  files: { model: { downloaded } },
});
beforeEach(() => {
  jest.clearAllMocks();
  manager.init.mockResolvedValue(undefined);
  records = [record("det", "installed", 100), record("rec"), record("llm")];
  manager.list.mockImplementation(() => records);
  manager.get.mockImplementation((id) =>
    records.find((item) => item.manifest.id === id)
  );
  unsubscribe = jest.fn();
  manager.subscribe.mockImplementation((fn) => {
    listener = fn;
    return unsubscribe;
  });
  manager.download.mockResolvedValue(undefined);
  runtimeHost.request.mockImplementation(async ({ payload }) => ({
    mirror: payload.mirror || "hf-mirror",
  }));
  runtimeHost.onServiceState.mockReturnValue(jest.fn());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const render = async (modelRef = "ocr") =>
  act(async () =>
    root.render(<LocalModelDownload key={modelRef} modelRef={modelRef} />)
  );
const download = () =>
  [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "下载模型"
  );

test("downloads only missing OCR components and sums their byte progress", async () => {
  await render();
  expect(container.textContent).toContain("https://official.example/models");
  await act(async () => download().click());
  expect(manager.download.mock.calls).toEqual([["rec"]]);
  records[1] = record("rec", "downloading", 50);
  await act(async () => listener());
  expect(
    container
      .querySelector('[role="progressbar"]')
      .getAttribute("aria-valuenow")
  ).toBe("75");
  expect(download().disabled).toBe(true);
  records[1] = record("rec", "verifying", 100);
  await act(async () => listener());
  expect(container.textContent).toContain("校验中");
});
test("reports start failures and allows retry", async () => {
  manager.download.mockRejectedValueOnce(new Error("network failed"));
  await render("llm");
  await act(async () => download().click());
  expect(container.textContent).toContain("network failed");
  expect(download().disabled).toBe(false);
  await act(async () => download().click());
  expect(manager.download).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("network failed");
});
test("fixed official model sources do not offer an ineffective mirror change", async () => {
  records[1].manifest.base = "https://official.example/models";
  await render();
  expect(container.textContent).toContain("此模型使用官方固定下载源");
  expect(
    container
      .querySelector('[role="combobox"],[role="button"] .MuiSelect-select')
      ?.getAttribute("aria-disabled")
  ).toBe("true");
});
test("changing models drops previous progress and cleans up subscriptions", async () => {
  records[1] = record("rec", "downloading", 50);
  await render();
  expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  await render("llm");
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="progressbar"]')).toBeNull();
});
test("persists the shared mirror and receives external settings updates", async () => {
  await render("llm");
  await act(async () =>
    container
      .querySelector(".MuiSelect-select")
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
  );
  await act(async () =>
    document.querySelector('[role=option][data-value="huggingface"]').click()
  );
  expect(runtimeHost.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "updateSettings",
      payload: { mirror: "huggingface" },
    })
  );
  expect(container.textContent).toContain("https://huggingface.co");
  await act(async () =>
    runtimeHost.onServiceState.mock.calls.at(-1)[0]({
      settings: { mirror: "modelscope" },
    })
  );
  expect(container.textContent).toContain("https://modelscope.cn");
});
