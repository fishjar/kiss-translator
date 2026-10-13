import { act } from "react";
import { createRoot } from "react-dom/client";
import LocalServiceNotice from "./LocalServiceNotice";
import { sharedModelManager as manager } from "../localAi/core/modelManager";
jest.mock("../localAi/core/modelManager", () => ({
  sharedModelManager: {
    init: jest.fn(async () => {}),
    subscribe: jest.fn(() => jest.fn()),
    list: jest.fn(),
  },
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const apis = [
  {
    apiType: "LocalAI",
    apiSlug: "ocr",
    apiName: "Local OCR",
    modelRef: "ppocr-v6-medium",
  },
];
const i18n = (key, fallback) => fallback || key;
let container, root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  manager.init.mockResolvedValue(undefined);
  manager.subscribe.mockReturnValue(jest.fn());
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
test("uses backend state in file translation and warns until both OCR components are installed", async () => {
  const onDownload = jest.fn();
  const models = [{ id: "ppocr-v6-medium-det", state: "installed" }];
  await act(async () =>
    root.render(
      <LocalServiceNotice
        apis={apis}
        models={models}
        i18n={i18n}
        onDownload={onDownload}
      />
    )
  );
  expect(container.textContent).toContain(
    "Local OCR：本地模型未下载或下载不完整"
  );
  expect(manager.init).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button").click());
  expect(onDownload).toHaveBeenCalledTimes(1);
  await act(async () =>
    root.render(
      <LocalServiceNotice
        apis={apis}
        models={[...models, { id: "ppocr-v6-medium-rec", state: "installed" }]}
        i18n={i18n}
      />
    )
  );
  expect(container.textContent).toBe("");
});
test("scene selectors subscribe to installation changes and ignore network services", async () => {
  manager.list.mockReturnValue([]);
  await act(async () =>
    root.render(<LocalServiceNotice apis={apis} i18n={i18n} />)
  );
  expect(container.textContent).toContain("未下载");
  manager.list.mockReturnValue(
    ["det", "rec"].map((suffix) => ({
      manifest: { id: `ppocr-v6-medium-${suffix}` },
      state: "installed",
    }))
  );
  await act(async () => manager.subscribe.mock.calls[0][0]());
  expect(container.textContent).toBe("");
  await act(async () =>
    root.render(
      <LocalServiceNotice apis={[{ apiType: "OpenAI" }]} i18n={i18n} />
    )
  );
  expect(container.textContent).toBe("");
});
test("a failed backend model query is not reported as an undownloaded model", async () => {
  await act(async () =>
    root.render(<LocalServiceNotice apis={apis} models={null} i18n={i18n} />)
  );
  expect(container.textContent).toBe("");
  expect(manager.init).not.toHaveBeenCalled();
});
