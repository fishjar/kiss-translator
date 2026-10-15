import { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import Vlm from "./Vlm";
const mockChat = jest.fn();
const mockLog = jest.fn();
const mockValidateInputFile = jest.fn();
jest.mock("../../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));
jest.mock("../../../localAi/core/inputFiles", () => ({
  validateInputFile: (...args) => mockValidateInputFile(...args),
}));
jest.mock("../../../localAi/core/shared", () => ({ setShared: jest.fn() }));
jest.mock("../../../localAi/core/catalog", () => ({
  CATALOG: [
    {
      id: "glm-ocr-onnx-q4",
      name: "GLM",
      task: "ocr-vlm",
      runtime: "onnx",
      backend: ["webgpu"],
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
jest.mock("../../../localAi/core/vlmClient", () => ({
  VlmClient: class {
    chat(...args) {
      return mockChat(...args);
    }
  },
}));
jest.mock("./RuntimeControls", () => ({
  ModelStatus: () => null,
  UnloadModelButton: () => null,
  useRuntimeService: () => ({ busy: false, loaded: true }),
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
  mockChat.mockResolvedValue({ text: "recognized" });
  URL.createObjectURL = jest.fn(() => "blob:test");
  URL.revokeObjectURL = jest.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Vlm />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});
const button = (text) =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === text
  );
const editor = () =>
  container.querySelector('textarea:not([aria-hidden="true"])');
test("edits a test-only visual instruction, sends it and resets when changing mode", async () => {
  await act(async () => Simulate.click(button("提示词模板")));
  expect(editor().value).toBe("Text Recognition:");
  await act(async () =>
    Simulate.change(editor(), { target: { value: "custom OCR" } })
  );
  const file = {
    name: "sample.png",
    size: 3,
    type: "image/png",
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  await act(async () =>
    Simulate.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    })
  );
  await act(async () => Simulate.click(button("开始解析")));
  expect(mockChat.mock.calls[0][0][0]).toMatchObject({
    role: "user",
    content: "custom OCR",
  });
  await act(async () => Simulate.click(button("重置默认模板")));
  expect(editor().value).toBe("Text Recognition:");
  await act(async () =>
    Simulate.change(container.querySelector('input[value="doc"]'), {
      target: { value: "table" },
    })
  );
  expect(editor().value).toBe("Table Recognition:");
});
test("rejects empty instructions and starts fresh after remounting", async () => {
  await act(async () => Simulate.click(button("提示词模板")));
  await act(async () => Simulate.change(editor(), { target: { value: "" } }));
  expect(button("开始解析").disabled).toBe(true);
  await act(async () => root.render(null));
  await act(async () => root.render(<Vlm />));
  await act(async () => Simulate.click(button("提示词模板")));
  expect(editor().value).toBe("Text Recognition:");
});
