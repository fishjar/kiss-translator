import { act } from "react";
import { createRoot } from "react-dom/client";
import FileTranslate from "./FileTranslate";

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
    },
    image: {
      apiSlugs: ["primary"],
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
    },
  },
};

const mockUpdateChild = jest.fn();

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockSetting,
    updateChild: () => mockUpdateChild,
  }),
}));

jest.mock("../../hooks/Prompt", () => ({
  usePromptList: () => ({
    prompts: [
      { slug: "prompt-1", name: "通用翻译", category: "translation" },
    ],
  }),
}));

jest.mock("../../libs/fileTranslate", () => ({
  IMAGE_FONT_OPTIONS: [
    { value: "default", label: "系统默认 (无衬线)" },
    { value: "yahei", label: "微软雅黑 / 苹方" },
  ],
  translateFileText: jest.fn(),
  translateTxt: jest.fn(),
  translateMarkdown: jest.fn(),
  translateEntireTxt: jest.fn().mockResolvedValue({ text: "整篇译文结果" }),
  translateEntireMarkdown: jest.fn().mockResolvedValue({
    text: "整篇 MD 译文",
    translatedMd: "整篇 MD 译文",
    bilingualMd: "",
    translatedHtml: "<p>整篇 MD 译文</p>",
    bilingualHtml: "",
    sourceHtml: "<p>源码</p>",
    blocks: [],
  }),
  splitMarkdownBlocks: jest.fn().mockReturnValue([]),
  renderMarkdownBlocksToHtml: jest.fn().mockReturnValue("<p>mock-html</p>"),
  generateStandaloneHtml: jest.fn().mockReturnValue("<html>mock</html>"),
  synthesizeTranslatedImage: jest
    .fn()
    .mockResolvedValue(new Blob(["fake-img"], { type: "image/png" })),
}));

jest.mock("../../localAi/fileOperations", () => ({
  OCR_GROUPS: [
    {
      id: "ppocr-v5-mobile",
      name: "PP-OCRv5 Mobile",
      detId: "det-1",
      recId: "rec-1",
    },
    {
      id: "ppocr-v6-tiny",
      name: "PP-OCRv6 Tiny",
      detId: "det-2",
      recId: "rec-2",
    },
  ],
  ALL_OCR_MODELS: [
    {
      id: "ppocr-v5-mobile",
      name: "PP-OCRv5 Mobile",
      category: "paddle",
      supportsInpainting: true,
    },
    {
      id: "ppocr-v6-tiny",
      name: "PP-OCRv6 Tiny",
      category: "paddle",
      supportsInpainting: true,
    },
    {
      id: "glm-ocr-onnx-q4",
      name: "GLM-OCR 0.9B",
      category: "vlm",
      supportsInpainting: false,
    },
  ],
  installedLlmModels: jest.fn().mockResolvedValue([]),
  installedOcrGroups: jest.fn().mockResolvedValue(["ppocr-v5-mobile"]),
  recognizeFileImage: jest.fn().mockResolvedValue({ items: [] }),
  translateWithLocalModel: jest.fn().mockResolvedValue(""),
}));

import {
  translateFileText,
  translateTxt,
  translateMarkdown,
  translateEntireTxt,
  translateEntireMarkdown,
  synthesizeTranslatedImage,
} from "../../libs/fileTranslate";
import {
  installedLlmModels,
  installedOcrGroups,
  recognizeFileImage,
  translateWithLocalModel,
} from "../../localAi/fileOperations";

describe("FileTranslate view", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();

    const mockCreate = () => "blob:http://localhost/fake-blob";
    const mockRevoke = () => {};
    global.URL.createObjectURL = mockCreate;
    global.URL.revokeObjectURL = mockRevoke;
    window.URL.createObjectURL = mockCreate;
    window.URL.revokeObjectURL = mockRevoke;

    installedOcrGroups.mockResolvedValue(["ppocr-v5-mobile"]);
    installedLlmModels.mockResolvedValue([]);
    recognizeFileImage.mockResolvedValue({ items: [] });
    translateWithLocalModel.mockResolvedValue("");
    translateFileText.mockResolvedValue("");
    synthesizeTranslatedImage.mockResolvedValue(
      new Blob(["fake-img"], { type: "image/png" })
    );
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  test("renders layout: compact top toolbar and clean middle dropzone when no file uploaded", async () => {
    await act(async () => {
      root.render(<FileTranslate />);
    });

    // 1. 顶部精简工具栏
    expect(container.textContent).toContain("文件翻译");
    const labels = Array.from(container.querySelectorAll("label")).map(
      (l) => l.textContent
    );
    expect(labels).toContain("源语言");
    expect(labels).toContain("目标语言");
    expect(labels).toContain("翻译服务");
    expect(labels).toContain("翻译提示词");
    expect(labels).toContain("译文样式");

    // 顶栏操作按钮
    const buttonTexts = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(
      buttonTexts.some(
        (t) => t.includes("分段翻译") || t.includes("开始翻译")
      )
    ).toBe(true);
    expect(buttonTexts.some((t) => t.includes("下载译文 TXT"))).toBe(true);

    // 2. 未上传文件时：下方展示大面积纯净拖拽上传框，不展示左右两栏
    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    expect(dropzone).not.toBeNull();
    expect(dropzone.textContent).toContain("点击选择文件 或 拖拽文件到此处");
    expect(dropzone.textContent).toContain(
      "支持 .txt 文本、.md Markdown 文档及 PNG、JPEG、WebP 格式图片"
    );

    // 未上传文件时，左右双栏不展示
    expect(container.textContent).not.toContain("原文内容");
    expect(container.textContent).not.toContain("翻译结果");
  });

  test("handles TXT file drop, hides dropzone, shows two columns and handles translation", async () => {
    translateTxt.mockResolvedValueOnce({
      text: "你好世界",
      comparisons: [{ source: "Hello world", target: "你好世界" }],
    });

    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeFile = new File(["Hello world"], "sample.txt", {
      type: "text/plain",
    });
    fakeFile.text = jest.fn().mockResolvedValue("Hello world");

    // 模拟拖入 TXT 文件
    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 上传框完全隐藏，顶栏展示已选文件胶囊
    expect(container.textContent).toContain("sample.txt");

    // 下方展开左右两栏
    expect(container.textContent).toContain("原文内容");
    expect(container.textContent).toContain("Hello world");
    expect(container.textContent).toContain("翻译结果");

    // 点击开始翻译
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("分段翻译") || b.textContent.includes("开始翻译")
    );
    expect(startBtn.disabled).toBe(false);

    await act(async () => {
      startBtn.click();
    });

    expect(translateTxt).toHaveBeenCalled();
    expect(container.textContent).toContain("你好世界");

    // 切换为双语对照模式
    const bilingualBtn = Array.from(
      container.querySelectorAll('button[value="bilingual"]')
    )[0];
    expect(bilingualBtn).not.toBeUndefined();

    await act(async () => {
      bilingualBtn.click();
    });

    // 下载按钮自适应变为“下载双语 TXT”
    const allButtons = Array.from(container.querySelectorAll("button")).map(
      (b) => b.textContent
    );
    expect(allButtons.some((t) => t.includes("下载双语 TXT"))).toBe(true);

    // 切换回“译文”模式
    const targetBtn = Array.from(
      container.querySelectorAll('button[value="target"]')
    )[0];
    await act(async () => {
      targetBtn.click();
    });

    const revertedButtons = Array.from(
      container.querySelectorAll("button")
    ).map((b) => b.textContent);
    expect(revertedButtons.some((t) => t.includes("下载译文 TXT"))).toBe(true);
  });

  test("clears file when delete icon on chip is clicked", async () => {
    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeFile = new File(["Content"], "test.txt", { type: "text/plain" });
    fakeFile.text = jest.fn().mockResolvedValue("Content");

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    expect(container.textContent).toContain("test.txt");

    // 点击 Chip 上的删除图标
    const deleteIcon = container.querySelector(".MuiChip-deleteIcon");
    expect(deleteIcon).not.toBeNull();

    await act(async () => {
      deleteIcon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 恢复未上传状态，展示居中大上传框
    expect(container.textContent).toContain("点击选择文件 或 拖拽文件到此处");
    expect(container.textContent).not.toContain("原文内容");
  });

  test("shows error when dropping an invalid file format", async () => {
    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const invalidFile = new File(["binary"], "doc.pdf", {
      type: "application/pdf",
    });

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [invalidFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    expect(container.textContent).toContain(
      "暂不支持该文件格式，支持 .txt 文本、.md Markdown 文档及 PNG、JPEG、WebP 图片"
    );
  });

  test("automatically detects image file and reveals OCR options in top toolbar", async () => {
    await act(async () => {
      root.render(<FileTranslate />);
    });

    // 未选文件时顶栏不展示 OCR 模型配置
    expect(container.textContent).not.toContain("OCR 识别模型");

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeImage = new File(["fake-image"], "photo.png", {
      type: "image/png",
    });

    // 拖入图片文件，系统全自动识别为图片识别模式
    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeImage] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 顶栏自适应展开 OCR 识别模型、计算设备和译文字体
    expect(container.textContent).toContain("OCR 识别模型");
    expect(container.textContent).toContain("计算设备");
    expect(container.textContent).toContain("译文字体");
  });

  test("handles image translation, view switching, synthesis, and image viewer dialog", async () => {
    recognizeFileImage.mockResolvedValueOnce({
      items: [
        {
          text: "Sample OCR text",
          poly: [
            [10, 10],
            [100, 10],
            [100, 40],
            [10, 40],
          ],
        },
      ],
    });
    translateFileText.mockResolvedValueOnce("测试翻译文本");

    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeImage = new File(["fake-image-binary"], "test-diagram.png", {
      type: "image/png",
    });

    // 拖入图片
    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeImage] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // 左栏展示原图预览
    expect(container.textContent).toContain("原图预览");
    expect(container.textContent).toContain("点击放大查看");

    // 开始翻译
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("开始翻译")
    );
    await act(async () => {
      startBtn.click();
    });

    expect(recognizeFileImage).toHaveBeenCalled();
    expect(translateFileText).toHaveBeenCalled();
    expect(synthesizeTranslatedImage).toHaveBeenCalled();

    // 切换到“双语”对照视图
    const bilingualBtn = Array.from(
      container.querySelectorAll('button[value="bilingual"]')
    )[0];
    await act(async () => {
      bilingualBtn.click();
    });

    expect(container.textContent).toContain("Sample OCR text");
    expect(container.textContent).toContain("测试翻译文本");

    // 切换到“仅译文”视图
    const targetBtn = Array.from(
      container.querySelectorAll('button[value="target"]')
    )[0];
    await act(async () => {
      targetBtn.click();
    });

    expect(container.textContent).toContain("测试翻译文本");

    // 点击原图放大，打开图片弹窗
    const previewBox = container.querySelector('img[alt="原图预览"]')
      ?.parentElement;
    expect(previewBox).not.toBeNull();
    await act(async () => {
      previewBox.click();
    });

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain("原图预览");
  });

  test("shows clear explanation when VLM model is used and image view is selected", async () => {
    mockSetting.fileTranslateSetting.image = {
      ...mockSetting.fileTranslateSetting.image,
      ocrGroup: "glm-ocr-onnx-q4",
    };

    recognizeFileImage.mockResolvedValueOnce({
      items: [{ text: "VLM detected text" }],
    });
    translateFileText.mockResolvedValueOnce("VLM 译文");

    try {
      await act(async () => {
        root.render(<FileTranslate />);
      });

      const dropzone = container.querySelector('[role="button"][tabindex="0"]');
      const fakeImage = new File(["fake-image-bytes"], "vlm-doc.png", {
        type: "image/png",
      });

      await act(async () => {
        const dropEvent = new Event("drop", { bubbles: true });
        Object.defineProperty(dropEvent, "dataTransfer", {
          value: { files: [fakeImage] },
        });
        dropzone.dispatchEvent(dropEvent);
      });

      const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent.includes("开始翻译")
      );
      await act(async () => {
        startBtn.click();
      });

      // 切换到“译图”模式
      const toggleButtons = Array.from(
        container.querySelectorAll(".MuiToggleButton-root")
      );
      const imageViewBtn = toggleButtons.find(
        (b) => b.getAttribute("value") === "image"
      );
      await act(async () => {
        imageViewBtn.click();
      });

      expect(container.textContent).toContain("VLM 端到端模型不支持生成译图");
      expect(container.textContent).toContain("PaddleOCR");
    } finally {
      delete mockSetting.fileTranslateSetting.image.ocrGroup;
    }
  });

  test("defaults to translated image view and passes fontFamily to synthesizeTranslatedImage", async () => {
    recognizeFileImage.mockResolvedValueOnce({
      items: [
        {
          text: "Text to replace",
          poly: [
            [0, 0],
            [50, 0],
            [50, 20],
            [0, 20],
          ],
        },
      ],
    });
    translateFileText.mockResolvedValueOnce("替换译文");

    await act(async () => {
      root.render(<FileTranslate />);
    });

    // 拖入图片自动进入图片识别模式
    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeImage = new File(["fake-image-bytes"], "comic.png", {
      type: "image/png",
    });
    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeImage] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 开始翻译
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("开始翻译")
    );
    await act(async () => {
      startBtn.click();
    });

    // 验证右侧结果视图默认激活的是“译图”
    expect(container.textContent).toContain("下载译图 (PNG)");
    expect(synthesizeTranslatedImage).toHaveBeenCalledWith(
      fakeImage,
      expect.arrayContaining([
        expect.objectContaining({
          source: "Text to replace",
          target: "替换译文",
        }),
      ]),
      expect.objectContaining({ fontFamily: expect.any(String) })
    );
  });

  test("renders paragraphs cleanly without Paper card wraps and applies text style in bilingual mode", async () => {
    translateTxt.mockResolvedValueOnce({
      text: "你好世界\n第二段",
      comparisons: [
        { source: "Hello world", target: "你好世界" },
        { source: "Second paragraph", target: "第二段" },
      ],
    });

    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeFile = new File(["Hello world\nSecond paragraph"], "sample.txt", {
      type: "text/plain",
    });
    fakeFile.text = jest.fn().mockResolvedValue("Hello world\nSecond paragraph");

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("分段翻译") || b.textContent.includes("开始翻译")
    );
    await act(async () => {
      startBtn.click();
    });

    // 切换为双语对照模式
    const bilingualBtn = Array.from(
      container.querySelectorAll('button[value="bilingual"]')
    )[0];
    await act(async () => {
      bilingualBtn.click();
    });

    // 验证翻译结果区域不存在单个段落的 Paper 包裹
    const resultCard = container.querySelectorAll(".MuiCard-root")[1];
    expect(resultCard.querySelectorAll(".MuiPaper-root").length).toBe(0);

    // 验证双语模式下包含原文和译文
    expect(resultCard.textContent).toContain("Hello world");
    expect(resultCard.textContent).toContain("你好世界");
    expect(resultCard.textContent).toContain("Second paragraph");
    expect(resultCard.textContent).toContain("第二段");
  });

  test("handles Markdown file drop, toggles preview/source view, and displays markdown HTML translation", async () => {
    const { translateMarkdown } = require("../../libs/fileTranslate");
    translateMarkdown.mockResolvedValueOnce({
      text: "# 标题译文\n\n段落译文",
      translatedMd: "# 标题译文\n\n段落译文",
      bilingualMd: "# Title\n# 标题译文\n\nSource paragraph\n\n段落译文",
      translatedHtml: "<h1>标题译文</h1><p>段落译文</p>",
      bilingualHtml: '<div class="kt-md-bilingual-block"><p class="kt-md-source">Source paragraph</p><p class="kt-md-target">段落译文</p></div>',
      sourceHtml: "<h1>Title</h1><p>Source paragraph</p>",
      comparisons: [{ source: "Source paragraph", target: "段落译文" }],
    });

    await act(async () => {
      root.render(<FileTranslate />);
    });

    // 拖入 Markdown 文件
    const mdFile = new File(["# Title\n\nSource paragraph"], "doc.md", {
      type: "text/markdown",
    });
    mdFile.text = jest.fn().mockResolvedValue("# Title\n\nSource paragraph");
    const dropzone = container.querySelector('[role="button"][tabindex="0"]');

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [mdFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 验证左栏包含 Markdown 原文标题与渲染/源码切换开关
    expect(container.textContent).toContain("Markdown 原文");
    expect(container.textContent).toContain("渲染视图");
    expect(container.textContent).toContain("源码");

    // 点击开始翻译
    const startBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("分段翻译") || b.textContent.includes("开始翻译")
    );
    expect(startBtn).not.toBeNull();
    await act(async () => {
      startBtn.click();
    });

    // 验证渲染好的翻译结果存在
    expect(container.textContent).toContain("标题译文");

    // 验证下载主按钮显示为下载译文 MD
    expect(container.textContent).toContain("下载译文 MD");
  });

  test("supports entire translation mode, locks to target view, and disables bilingual view with tooltip", async () => {
    translateEntireTxt.mockResolvedValueOnce({
      text: "这是整篇翻译的完整内容",
      comparisons: [],
      isEntire: true,
    });

    await act(async () => {
      root.render(<FileTranslate />);
    });

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeFile = new File(["Short article content"], "article.txt", {
      type: "text/plain",
    });
    fakeFile.text = jest.fn().mockResolvedValue("Short article content");

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 点击下拉箭头展开翻译模式选择菜单
    const dropdownBtn = container.querySelector('button[title="选择翻译模式"]');
    expect(dropdownBtn).not.toBeNull();
    await act(async () => {
      dropdownBtn.click();
    });

    // 选中“整篇翻译”
    const entireMenuItem = Array.from(document.querySelectorAll("li")).find((li) =>
      li.textContent.includes("整篇翻译")
    );
    expect(entireMenuItem).not.toBeNull();
    await act(async () => {
      entireMenuItem.click();
    });

    // 按钮文本变为“整篇翻译”
    const entireStartBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("整篇翻译")
    );
    expect(entireStartBtn).not.toBeNull();

    // 点击执行整篇翻译
    await act(async () => {
      entireStartBtn.click();
    });

    expect(translateEntireTxt).toHaveBeenCalledWith(
      "Short article content",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(container.textContent).toContain("这是整篇翻译的完整内容");

    // 验证“双语”按钮被置灰禁用
    const bilingualBtn = Array.from(
      container.querySelectorAll('button[value="bilingual"]')
    )[0];
    expect(bilingualBtn.disabled).toBe(true);
  });

  test("shows confirmation dialog when entire translation is requested for content over 10000 characters", async () => {
    translateEntireTxt.mockResolvedValueOnce({
      text: "超长文本整篇译文",
      comparisons: [],
      isEntire: true,
    });

    await act(async () => {
      root.render(<FileTranslate />);
    });

    const longText = "a".repeat(10001);
    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    const fakeFile = new File([longText], "long.txt", { type: "text/plain" });
    fakeFile.text = jest.fn().mockResolvedValue(longText);

    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 切换到整篇翻译
    const dropdownBtn = container.querySelector('button[title="选择翻译模式"]');
    await act(async () => {
      dropdownBtn.click();
    });
    const entireMenuItem = Array.from(document.querySelectorAll("li")).find((li) =>
      li.textContent.includes("整篇翻译")
    );
    await act(async () => {
      entireMenuItem.click();
    });

    // 点击整篇翻译
    const entireStartBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent.includes("整篇翻译")
    );
    await act(async () => {
      entireStartBtn.click();
    });

    // 验证弹窗出现，且尚未调用翻译
    expect(document.body.textContent).toContain("确认整篇翻译？");
    expect(document.body.textContent).toContain("当前文档超过 10,000 字符");
    expect(translateEntireTxt).not.toHaveBeenCalled();

    // 点击取消
    const cancelBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent.trim() === "取消"
    );
    await act(async () => {
      cancelBtn.click();
    });
    expect(translateEntireTxt).not.toHaveBeenCalled();

    // 再次点击整篇翻译并确认
    await act(async () => {
      entireStartBtn.click();
    });
    const confirmBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent.includes("继续整篇翻译")
    );
    await act(async () => {
      confirmBtn.click();
    });

    expect(translateEntireTxt).toHaveBeenCalled();
  });

  test("synchronizes scroll percentage bidirectionally between left and right columns", async () => {
    await act(async () => {
      root.render(<FileTranslate />);
    });

    const fakeFile = new File(["Sample line 1\nSample line 2"], "sample.txt", {
      type: "text/plain",
    });
    fakeFile.text = jest.fn().mockResolvedValue("Sample line 1\nSample line 2");

    const dropzone = container.querySelector('[role="button"][tabindex="0"]');
    await act(async () => {
      const dropEvent = new Event("drop", { bubbles: true });
      Object.defineProperty(dropEvent, "dataTransfer", {
        value: { files: [fakeFile] },
      });
      dropzone.dispatchEvent(dropEvent);
    });

    // 查找左右两栏的可滚动容器
    const scrollContainers = container.querySelectorAll(
      ".MuiCard-root > .MuiBox-root"
    );
    const leftScrollBox = scrollContainers[1];
    const rightScrollBox = scrollContainers[3];
    expect(leftScrollBox).not.toBeNull();
    expect(rightScrollBox).not.toBeNull();

    // 模拟容器滚动高度
    Object.defineProperty(leftScrollBox, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(leftScrollBox, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(rightScrollBox, "scrollHeight", { value: 1800, configurable: true });
    Object.defineProperty(rightScrollBox, "clientHeight", { value: 200, configurable: true });

    // 模拟左侧滚动到 50% (400 / 800)
    leftScrollBox.scrollTop = 400;
    await act(async () => {
      leftScrollBox.dispatchEvent(new Event("scroll"));
    });

    // 右侧的最大滚动距离为 1800 - 200 = 1600，50% 应该为 800
    expect(rightScrollBox.scrollTop).toBe(800);
  });
});


