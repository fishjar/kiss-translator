import { act } from "react";
import { createRoot } from "react-dom/client";
import LocalModelSelect from "./LocalModelSelect";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../localAi/fileOperations", () => ({
  installedModelsForCapabilities: jest.fn(async (capabilities = []) => {
    const caps = Array.isArray(capabilities) ? capabilities : [];
    const groups = [];
    if (caps.includes("ocr")) {
      groups.push({
        category: "ocr",
        title: "OCR / 识图模型",
        items: [
          { id: "ppocr-v6-medium", name: "PP-OCRv6 Medium", task: "ocr" },
        ],
      });
    }
    if (caps.includes("translation") || caps.includes("llm")) {
      groups.push({
        category: "llm",
        title: "大语言 / 翻译模型",
        items: [
          { id: "hy-mt2-1.8b", name: "Hy-MT2 1.8B", task: "llm" },
        ],
      });
    }
    return groups;
  }),
}));

describe("LocalModelSelect", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const { installedModelsForCapabilities } = require("../../localAi/fileOperations");
    installedModelsForCapabilities.mockImplementation(async (capabilities = []) => {
      const caps = Array.isArray(capabilities) ? capabilities : [];
      const groups = [];
      if (caps.includes("ocr")) {
        groups.push({
          category: "ocr",
          title: "OCR / 识图模型",
          items: [
            { id: "ppocr-v6-medium", name: "PP-OCRv6 Medium", task: "ocr" },
          ],
        });
      }
      if (caps.includes("translation") || caps.includes("llm")) {
        groups.push({
          category: "llm",
          title: "大语言 / 翻译模型",
          items: [
            { id: "hy-mt2-1.8b", name: "Hy-MT2 1.8B", task: "llm" },
          ],
        });
      }
      return groups;
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders single group items when only one capability is requested", async () => {
    await act(async () => {
      root.render(
        <LocalModelSelect
          value="ppocr-v6-medium"
          capabilities={["ocr"]}
          onChange={jest.fn()}
        />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const select = container.querySelector(".MuiSelect-select");
    expect(select).not.toBeNull();
    expect(container.textContent).toContain("PP-OCRv6 Medium");
  });

  test("renders subheaders and grouped items when multiple capabilities are requested", async () => {
    await act(async () => {
      root.render(
        <LocalModelSelect
          value="hy-mt2-1.8b"
          capabilities={["translation", "ocr"]}
          onChange={jest.fn()}
        />
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
        <LocalModelSelect
          value="non-existent-model"
          capabilities={["ocr"]}
          onChange={jest.fn()}
        />
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(container.textContent).toContain("本机未安装");
  });
});
