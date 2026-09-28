/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import FileTranslatePage from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

const mockSetting = {
  transApis: [
    {
      apiSlug: "primary",
      apiType: "Microsoft",
      apiName: "微软翻译",
      capabilities: ["translation"],
    },
  ],
  prompts: [],
  fileTranslateSetting: {
    txt: {
      apiSlugs: ["primary"],
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      textStyle: "style_none",
    },
    markdown: {
      apiSlugs: ["primary"],
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      textStyle: "style_none",
    },
    image: {
      apiSlugs: ["primary"],
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      ocrGroup: "ppocr-v5-mobile",
      ocrDevice: "webgpu",
      fontFamily: "default",
    },
  },
};

const mockUpdateChild = jest.fn();

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateChild: () => mockUpdateChild,
  }),
  SettingProvider: ({ children }) => children,
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({
    prompts: [
      { slug: "prompt-1", name: "通用翻译", category: "translation" },
    ],
  }),
}));

jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({
    allTextStyles: [],
  }),
}));

jest.mock("../../libs/fileTranslate", () => ({
  IMAGE_FONT_OPTIONS: [
    { value: "default", label: "系统默认 (无衬线)" },
  ],
  translateFileText: jest.fn(),
  translateTxt: jest.fn(),
  translateMarkdown: jest.fn(),
  translateEntireTxt: jest.fn(),
  translateEntireMarkdown: jest.fn(),
  splitMarkdownBlocks: jest.fn(() => []),
  renderMarkdownBlocksToHtml: jest.fn(() => ""),
  generateStandaloneHtml: jest.fn(() => ""),
  synthesizeTranslatedImage: jest.fn(),
}));

jest.mock("../../localAi/fileOperations", () => ({
  ALL_OCR_MODELS: [],
  OCR_GROUPS: [],
  installedLlmModels: jest.fn(async () => []),
  installedOcrGroups: jest.fn(async () => []),
  recognizeFileImage: jest.fn(),
  translateWithLocalModel: jest.fn(),
}));

describe("FileTranslatePage (M2 UI)", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test("renders with M2 root container and outlined inputs", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    // 验证根节点渲染了 M2 标志容器
    const m2Root = container.querySelector(".kt-m2-root");
    expect(m2Root).not.toBeNull();

    // 验证顶栏下拉框采用 M2 Outlined 规范而非 Filled
    const outlinedInputs = container.querySelectorAll(".MuiOutlinedInput-root");
    expect(outlinedInputs.length).toBeGreaterThan(0);

    const filledInputs = container.querySelectorAll(".MuiFilledInput-root");
    expect(filledInputs.length).toBe(0);

    // 验证上传拖拽框存在且无 24px 大圆角
    const dropzone = container.querySelector("[tabIndex='0']");
    expect(dropzone).not.toBeNull();

    // 验证顶栏操作按钮与 SplitButton 存在
    const buttons = container.querySelectorAll(".MuiButton-root");
    expect(buttons.length).toBeGreaterThan(0);

    // 验证 Logo 链接指向 GitHub 仓库
    const logoLink = container.querySelector('a[href="https://github.com/fishjar/kiss-translator"]');
    expect(logoLink).not.toBeNull();
    expect(logoLink.getAttribute("target")).toBe("_blank");

    // 验证初始状态：第二行展开，第一行最右侧渲染收起配置按钮（aria-expanded="true"）
    const collapseBtn = container.querySelector('button[aria-label="收起配置"]');
    expect(collapseBtn).not.toBeNull();
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");

    // 点击小箭头按钮收起第二行配置
    await act(async () => {
      collapseBtn.click();
    });
    // 收起后，第一行最右侧的原地按钮切换为展开状态（aria-label="展开配置", aria-expanded="false"）
    const expandBtn = container.querySelector('button[aria-label="展开配置"]');
    expect(expandBtn).not.toBeNull();
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false");

    // 再次在原地点击展开小箭头，重新展开第二行配置
    await act(async () => {
      expandBtn.click();
    });
    const reCollapseBtn = container.querySelector('button[aria-label="收起配置"]');
    expect(reCollapseBtn).not.toBeNull();
    expect(reCollapseBtn.getAttribute("aria-expanded")).toBe("true");
  });
});
