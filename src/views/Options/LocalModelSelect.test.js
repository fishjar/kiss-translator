import { act } from "react";
import { createRoot } from "react-dom/client";
import LocalModelSelect from "./LocalModelSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../localAi/fileOperations", () => ({
  serviceModelOptions: jest.fn(),
}));
jest.mock("../../localAi/core/modelManager", () => ({
  sharedModelManager: { subscribe: jest.fn(() => jest.fn()) },
}));
jest.mock("./LocalModelDownload", () => {
  const React = require("react");
  return function Download() {
    return React.createElement("div", null, "下载模型");
  };
});
const groups = [
  {
    category: "ocr",
    title: "OCR / 文字识别",
    items: [
      {
        id: "ppocr-v6-medium",
        name: "PP-OCRv6 Medium",
        task: "ocr",
        unavailableReasons: [],
      },
    ],
  },
  {
    category: "vlm",
    title: "VLM / 识图与文档解析",
    items: [
      {
        id: "missing",
        name: "Missing model",
        task: "ocr-vlm",
        installed: false,
        unavailableReasons: [],
      },
      {
        id: "unsupported",
        name: "GPU model",
        task: "ocr-vlm",
        unavailableReasons: ["当前环境不支持 WebGPU"],
      },
    ],
  },
  {
    category: "llm",
    title: "LLM",
    items: [
      {
        id: "hy-mt2-1.8b",
        name: "Hy-MT2 1.8B",
        task: "llm",
        unavailableReasons: [],
      },
    ],
  },
];

describe("LocalModelSelect", () => {
  let container;
  let root;

  beforeEach(() => {
    require("../../localAi/core/modelManager").sharedModelManager.subscribe.mockReturnValue(
      jest.fn()
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    require("../../localAi/fileOperations").serviceModelOptions.mockResolvedValue(
      groups
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("selects an installed OCR model without capability filtering", async () => {
    await act(async () => {
      root.render(
        <LocalModelSelect value="ppocr-v6-medium" onChange={jest.fn()} />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const select = container.querySelector(".MuiSelect-select");
    expect(select).not.toBeNull();
    expect(container.textContent).toContain("PP-OCRv6 Medium");
  });

  test("selects a language model from the same installed catalogue", async () => {
    await act(async () => {
      root.render(
        <LocalModelSelect value="hy-mt2-1.8b" onChange={jest.fn()} />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const select = container.querySelector(".MuiSelect-select");
    expect(select).not.toBeNull();
    expect(container.textContent).toContain("Hy-MT2 1.8B");
  });

  test("shows not installed hint when value is not in installed list", async () => {
    await act(async () => {
      root.render(
        <LocalModelSelect value="non-existent-model" onChange={jest.fn()} />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain("模型不在当前目录中");
  });
  test("undownloaded models are selectable while unsupported models remain disabled", async () => {
    const change = jest.fn();
    await act(async () =>
      root.render(
        <LocalModelSelect value="ppocr-v6-medium" onChange={change} />
      )
    );
    await act(async () =>
      container
        .querySelector(".MuiSelect-select")
        .dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
    );
    const headers = [...document.querySelectorAll(".MuiListSubheader-root")];
    expect(headers.map((header) => header.textContent)).toEqual([
      "OCR / 文字识别",
      "VLM / 识图与文档解析",
      "LLM",
    ]);
    const unsupported = document.querySelector(
      '[role=option][data-value="unsupported"]'
    );
    expect(unsupported.getAttribute("aria-disabled")).toBe("true");
    expect(unsupported.textContent).toContain("不支持 WebGPU");
    await act(async () => unsupported.click());
    expect(change).not.toHaveBeenCalled();
    const missing = document.querySelector(
      '[role=option][data-value="missing"]'
    );
    expect(missing.getAttribute("aria-disabled")).not.toBe("true");
    expect(missing.textContent).toContain("未下载");
    await act(async () => missing.click());
    expect(change).toHaveBeenCalledWith("missing");
    await act(async () =>
      container
        .querySelector(".MuiSelect-select")
        .dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
    );
    await act(async () =>
      document.querySelector('[role=option][data-value="hy-mt2-1.8b"]').click()
    );
    expect(change).toHaveBeenCalledWith("hy-mt2-1.8b");
  });

  test("marks a missing model red and clears the warning after a model subscription update", async () => {
    await act(async () =>
      root.render(<LocalModelSelect value="missing" onChange={jest.fn()} />)
    );
    expect(
      container.querySelector(".MuiFormControl-root .Mui-error")
    ).not.toBeNull();
    expect(container.textContent).toContain("下载模型");
    const manager =
      require("../../localAi/core/modelManager").sharedModelManager;
    const refresh = manager.subscribe.mock.calls.at(-1)[0];
    require("../../localAi/fileOperations").serviceModelOptions.mockResolvedValue(
      groups.map((group) => ({
        ...group,
        items: group.items.map((item) => ({ ...item, installed: true })),
      }))
    );
    await act(async () => refresh("missing", { state: "installed" }));
    expect(container.querySelector(".Mui-error")).toBeNull();
    expect(container.textContent).not.toContain("下载模型");
  });
});
