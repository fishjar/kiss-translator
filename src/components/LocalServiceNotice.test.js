import { act } from "react";
import { createRoot } from "react-dom/client";
import LocalServiceNotice from "./LocalServiceNotice";
import ExtensionLocalServiceNotice from "./ExtensionLocalServiceNotice";
import { sharedModelManager as manager } from "../localAi/core/modelManager";
import { LOCAL_AI_I18N } from "../config/locales/localAi";
jest.mock("../libs/navigation", () => ({ openOptionsPage: jest.fn() }));
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
const i18n = (key, fallback) => LOCAL_AI_I18N[key]?.zh || fallback || key;
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
    "PP-OCRv6 medium 识别：本地模型未下载或下载不完整"
  );
  expect(container.textContent).not.toContain("PP-OCRv6 medium 检测");
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
    root.render(<ExtensionLocalServiceNotice apis={apis} i18n={i18n} />)
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
      <ExtensionLocalServiceNotice apis={[{ apiType: "OpenAI" }]} i18n={i18n} />
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

test("missing models warn while unknown state stays silent", async () => {
  await act(async () =>
    root.render(<LocalServiceNotice apis={apis} models={[]} i18n={i18n} />)
  );
  expect(container.textContent).toContain("未下载");
  expect(container.textContent).toContain("PP-OCRv6 medium 检测");
  expect(container.textContent).toContain("PP-OCRv6 medium 识别");
  await act(async () =>
    root.render(<LocalServiceNotice apis={apis} i18n={i18n} />)
  );
  expect(container.textContent).toBe("");
  expect(manager.init).not.toHaveBeenCalled();
});

test("names missing models across services, deduplicates them and falls back to model IDs", async () => {
  const local = (modelRef) => ({ apiType: "LocalAI", modelRef });
  await act(async () =>
    root.render(
      <LocalServiceNotice
        apis={[
          local("pp-doclayout-v3-onnx"),
          local("qwen2.5-0.5b"),
          local("pp-doclayout-v3-onnx"),
          local("custom-model"),
        ]}
        models={[
          { id: "qwen2.5-0.5b", name: "Qwen2.5 0.5B", state: "downloading" },
        ]}
        i18n={(key, fallback) =>
          key === "model_name_pp_doclayout_v3_onnx"
            ? "版面分析模型"
            : fallback || key
        }
      />
    )
  );
  expect(container.textContent.match(/版面分析模型/g)).toHaveLength(1);
  expect(container.textContent).toContain("Qwen2.5");
  expect(container.textContent).toContain("custom-model");
});

test("extension notices use manifest names without frontend catalogue imports", async () => {
  manager.list.mockReturnValue([
    {
      manifest: { id: "custom-model", name: "Custom OCR" },
      state: "not-installed",
    },
  ]);
  await act(async () =>
    root.render(
      <ExtensionLocalServiceNotice
        apis={[{ apiType: "LocalAI", modelRef: "custom-model" }]}
        i18n={i18n}
      />
    )
  );
  expect(container.textContent).toContain("Custom OCR");
});
test("extension subscription is cleaned up and network services skip initialization", async () => {
  const unsubscribe = jest.fn();
  manager.subscribe.mockReturnValue(unsubscribe);
  manager.list.mockReturnValue([]);
  await act(async () =>
    root.render(
      <ExtensionLocalServiceNotice apis={[{ apiType: "OpenAI" }]} i18n={i18n} />
    )
  );
  expect(manager.init).not.toHaveBeenCalled();
  await act(async () =>
    root.render(<ExtensionLocalServiceNotice apis={apis} i18n={i18n} />)
  );
  expect(manager.init).toHaveBeenCalledTimes(1);
  await act(async () => root.render(null));
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test("extension download opens model settings and initialization failure stays silent", async () => {
  manager.list.mockReturnValue([]);
  await act(async () =>
    root.render(<ExtensionLocalServiceNotice apis={apis} i18n={i18n} />)
  );
  await act(async () => container.querySelector("button").click());
  expect(require("../libs/navigation").openOptionsPage).toHaveBeenCalledWith(
    "/local-ai"
  );
  await act(async () => root.render(null));
  manager.init.mockRejectedValueOnce(new Error("unavailable"));
  await act(async () =>
    root.render(<ExtensionLocalServiceNotice apis={apis} i18n={i18n} />)
  );
  expect(container.textContent).toBe("");
});
