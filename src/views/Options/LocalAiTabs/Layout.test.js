import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import Layout from "./Layout";

const mockAnalyze = jest.fn();
const mockLoad = jest.fn();
const mockStop = jest.fn();
const mockUnload = jest.fn();
const mockLog = jest.fn();
const mockValidateInputFile = jest.fn();

jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../../localAi/core/inputFiles", () => ({
  validateInputFile: (...args) => mockValidateInputFile(...args),
}));
jest.mock("../../../localAi/core/catalog", () => ({
  DOC_MODEL_ID: "pp-doclayout-v3-onnx",
  CATALOG: [
    {
      id: "pp-doclayout-v3-onnx",
      name: "PP-DocLayoutV3 (ONNX · 文档布局)",
      task: "doc-layout",
      runtime: "onnx",
      backend: ["wasm"],
      files: [],
    },
  ],
  getModelDisplayName: (model) => model.name,
}));
jest.mock("../../../localAi/core/modelManager", () => ({
  sharedModelManager: {
    subscribe: () => () => {},
    init: async () => {},
    get: () => ({ state: "installed" }),
  },
}));
jest.mock("../../../localAi/core/docClient", () => ({
  DocClient: class {
    analyze(...args) {
      return mockAnalyze(...args);
    }
    load(...args) {
      return mockLoad(...args);
    }
    stop(...args) {
      return mockStop(...args);
    }
    unload(...args) {
      return mockUnload(...args);
    }
  },
}));
jest.mock("./RuntimeControls", () => ({
  ModelStatus: () => null,
  UnloadModelButton: () => null,
  useRuntimeService: () => ({ busy: false, loaded: true, matches: true }),
}));
jest.mock("./LogViewer", () => ({
  __esModule: true,
  default: () => null,
  useLocalAiLog: () => ({
    logs: [],
    addLog: mockLog,
    clearLogs: mockLog,
    expanded: false,
    setExpanded: mockLog,
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container, root;

beforeEach(async () => {
  mockValidateInputFile.mockResolvedValue(undefined);
  mockLoad.mockResolvedValue({ backend: "wasm" });
  mockAnalyze.mockResolvedValue({
    backend: "wasm",
    elapsedMs: 88,
    imageSize: { width: 800, height: 1000 },
    regions: [
      {
        id: "r1",
        label: "title",
        score: 0.95,
        order: 1,
        bbox: [10, 10, 200, 50],
        polygon: [
          [10, 10],
          [200, 10],
          [200, 50],
          [10, 50],
        ],
      },
      {
        id: "r2",
        label: "text",
        score: 0.9,
        order: 2,
        bbox: [10, 60, 400, 200],
        polygon: [
          [10, 60],
          [400, 60],
          [400, 200],
          [10, 200],
        ],
      },
    ],
  });
  URL.createObjectURL = jest.fn(() => "blob:test-image");
  URL.revokeObjectURL = jest.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Layout />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const button = (text) =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent.trim() === text
  );

test("renders standardized 3 cards layout with model controls and actions", () => {
  expect(container.textContent).toContain("本地文档版面分析 (PP-DocLayout)");
  expect(container.textContent).toContain("文档图像与版面分析");
  expect(button("选择图片")).toBeTruthy();
  expect(button("开始分析")).toBeTruthy();
});

test("uploads an image, performs layout analysis, and displays stats and regions", async () => {
  const file = {
    name: "doc_page.png",
    size: 2048,
    type: "image/png",
  };
  const input = container.querySelector('input[type="file"]');
  await act(async () => {
    Simulate.change(input, { target: { files: [file] } });
  });

  expect(mockValidateInputFile).toHaveBeenCalledWith(file, "image");
  expect(container.textContent).toContain("doc_page.png");

  const runBtn = button("开始分析");
  expect(runBtn.disabled).toBe(false);

  await act(async () => {
    Simulate.click(runBtn);
  });

  expect(mockAnalyze).toHaveBeenCalledWith(
    file,
    expect.objectContaining({ device: "wasm" })
  );
  expect(container.textContent).toContain("88 ms");
  expect(container.textContent).toContain("2 个区域");
  expect(container.textContent).toContain("标题 1");
  expect(container.textContent).toContain("段落正文 1");
});
