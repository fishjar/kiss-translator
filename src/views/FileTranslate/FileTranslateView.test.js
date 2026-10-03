/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as fflate from "fflate";
import FileTranslatePage from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { this.callback([{ contentRect: { width: 1000 } }]); }
    disconnect() {}
  };
});
afterAll(() => { globalThis.ResizeObserver = originalResizeObserver; });


jest.mock("./State", () => ({
  FileTranslationProvider: ({ children }) => children,
  useFileTranslation: () => {
    const { setting, updateChild } =
      require("../../hooks/Setting").useSetting();
    const ops = require("../../localAi/fileOperations");
    const i18n = require("../../hooks/I18n").useI18n();
    return {
      context: {
        scenes: setting.fileTranslateSetting,
        services: setting.transApis,
        prompts: require("../../hooks/Prompt").usePromptList().prompts,
        styles: [],
        models: [],
        ocrModels: ops.ALL_OCR_MODELS || ops.OCR_GROUPS,
      },
      connected: true,
      i18n,
      uiLang: "zh",
      allTextStyles: require("../../hooks/CustomStyles").useAllTextStyles()
        .allTextStyles,
      patchScene: (kind, patch) =>
        updateChild("fileTranslateSetting")({
          ...setting.fileTranslateSetting,
          [kind]: { ...setting.fileTranslateSetting[kind], ...patch },
        }),
      client: {
        recognize: (file, serviceId, signal) =>
          ops.recognizeFileImage(
            file,
            {
              groupId:
                setting.transApis.find((api) => api.apiSlug === serviceId)
                  ?.modelRef ||
                setting.fileTranslateSetting.image.ocrGroup ||
                "ppocr-v5-mobile",
              device: setting.fileTranslateSetting.image.ocrDevice || "webgpu",
            },
            signal
          ),
      },
      openSettings: require("../../libs/navigation").openOptionsPage,
      toggleTheme: () => {},
    };
  },
}));


jest.mock("../../localAi/core/inputFiles", () => ({
  validateInputFile: jest.fn().mockResolvedValue(undefined),
}));

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
    {
      apiSlug: "local-layout",
      apiType: "LocalAI",
      apiName: "本地版面分析",
      sourceType: "local",
      modelRef: "pp-doclayout-v3-onnx",
      device: "wasm",
      capabilities: ["layout"],
    },
    {
      apiSlug: "gpu-layout",
      apiType: "LocalAI",
      apiName: "GPU版面分析",
      sourceType: "local",
      modelRef: "pp-doclayout-v3-onnx",
      device: "webgpu",
      capabilities: ["layout"],
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
    pdf: {
      apiSlugs: ["primary"],
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      textStyle: "style_none",
      parseMode: "smart",
    },
  },
};

export const mockPdfWorkspaceActions = {
  translate: jest.fn(),
  parse: jest.fn(),
  parseAndTranslate: jest.fn(),
  oneClickTranslate: jest.fn(),
  detectLayout: jest.fn(),
  recognizeText: jest.fn(),
  download: jest.fn(),
  abort: jest.fn(),
};

jest.mock("./PdfWorkspace", () => {
  const React = require("react");
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => mockPdfWorkspaceActions);
    React.useEffect(() => {
      if (props.onStateChange) {
        props.onStateChange({
          phase: "ready",
          progress: { done: 0, total: 10 },
          pdf: { numPages: 10 },
          result: { complete: false },
          blocks: [{ id: "b1", text: "hello" }],
          busy: false,
          failedCount: 0,
        });
      }
    }, []); // 仅在挂载时同步一次初始 mock 状态，避免死循环 re-render
    return React.createElement(
      "div",
      { "data-testid": "pdf-workspace" },
      "PDF Workspace"
    );
  });
});

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
    prompts: [{ slug: "prompt-1", name: "通用翻译", category: "translation" }],
  }),
}));

jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({
    allTextStyles: [],
  }),
}));

jest.mock("../../libs/fileTranslate", () => ({
  IMAGE_FONT_OPTIONS: [{ value: "default", label: "系统默认 (无衬线)" }],
  translateFileText: jest.fn(),
  translateTxt: jest.fn(),
  translateMarkdown: jest.fn(),
  translateEntireTxt: jest.fn(),
  translateEntireMarkdown: jest.fn(),
  splitMarkdownBlocks: jest.fn(() => []),
  renderMarkdownBlocksToHtml: jest.fn(() => ""),
  generateStandaloneHtml: jest.fn(() => ""),
  synthesizeTranslatedImage: jest.fn(),
  parseEpubBook: jest.requireActual("../../libs/epub/epubParser").parseEpubBook,
  translateEpubChapter: jest.fn(),
  translateEpubBook: jest.fn(),
  packEpub: jest.fn(),
  exportEpubFromChapterStates: jest.fn(() => ({
    blob: new Blob([]),
    filename: "test.epub",
  })),
  injectFooterIntoXhtml: jest.fn((html) => html),
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

  test("image translation submits every OCR block and reassembles coordinates in source order", async () => {
    const { recognizeFileImage } = require("../../localAi/fileOperations");
    const { translateFileText, synthesizeTranslatedImage } = require("../../libs/fileTranslate");
    const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => "blob:image-test");
    URL.revokeObjectURL = jest.fn();
    const items = Array.from({ length: 51 }, (_, i) => ({ text: `Source${i}`, box: [i, 0, 5, 5], poly: [[i, 0], [i + 5, 0], [i, 5]] }));
    const pending = [];
    mockSetting.transApis.push({ apiSlug: "test-ocr", apiType: "Custom", sourceType: "network", capabilities: ["ocr"] });
    recognizeFileImage.mockResolvedValue({ items });
    translateFileText.mockReset().mockImplementation((text, scene, setting, signal) => new Promise((resolve) => pending.push({ text, resolve, signal })));
    synthesizeTranslatedImage.mockReset().mockResolvedValue(null);
    try {
      await act(async () => root.render(<FileTranslatePage />));
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        Object.defineProperty(input, "files", { value: [new File(["image"], "sample.png", { type: "image/png" })], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent.includes("一键翻译")).click());
      expect(pending).toHaveLength(51);
      expect(synthesizeTranslatedImage).not.toHaveBeenCalled();
      await act(async () => [...pending].reverse().forEach(({ text, resolve }) => resolve(`译${text}`)));
      expect(synthesizeTranslatedImage).toHaveBeenCalledTimes(1);
      expect(synthesizeTranslatedImage.mock.calls[0][1]).toEqual(items.map((item) => ({ source: item.text, target: `译${item.text}`, poly: item.poly, box: item.box })));
    } finally {
      act(() => root.render(null));
      mockSetting.transApis.pop();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });

  describe("image stages", () => {
    const ops = require("../../localAi/fileOperations");
    const lib = require("../../libs/fileTranslate");
    const poly = [[10, 20], [100, 20], [100, 60], [10, 60]];
    let originalCreate, originalRevoke;
    const button = (label) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    const upload = async (name = "sample.png") => {
      await act(async () => {
        const input = container.querySelector('input[type="file"]');
        Object.defineProperty(input, "files", { value: [new File(["image"], name, { type: "image/png" })], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    const openMenu = async () => act(async () => container.querySelector('[aria-label="图片处理步骤"]').click());
    const menuItem = (label) => [...document.querySelectorAll('[role="menuitem"]')].find((item) => item.textContent === label);
    const step = async (label) => {
      await openMenu();
      await act(async () => menuItem(label).click());
    };
    beforeEach(async () => {
      originalCreate = URL.createObjectURL;
      originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => "blob:stage-test");
      URL.revokeObjectURL = jest.fn();
      mockSetting.transApis.push({ apiSlug: "test-ocr", apiType: "Custom", sourceType: "network", capabilities: ["ocr"] });
      ops.recognizeFileImage.mockReset().mockResolvedValue({ items: [{ text: "source block", poly }] });
      lib.translateFileText.mockReset().mockResolvedValue("translated block");
      lib.synthesizeTranslatedImage.mockReset().mockResolvedValue(new Blob(["png"]));
    });
    const setup = async () => {
      await act(async () => root.render(<FileTranslatePage />));
      await upload();
    };
    afterEach(() => {
      act(() => root.render(null));
      mockSetting.transApis.pop();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });
    test("stages reuse prior results, show source, copy/export source, and highlight regions", async () => {
      await setup();
      await openMenu();
      expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("识别文本").click());
      expect(button("原文").getAttribute("aria-pressed")).toBe("true");
      expect(container.textContent).toContain("source block");
      expect(lib.translateFileText).not.toHaveBeenCalled();
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      const img = container.querySelector('img[alt="原图预览"]');
      Object.defineProperties(img, { naturalWidth: { value: 200 }, naturalHeight: { value: 100 } });
      await act(async () => img.dispatchEvent(new Event("load")));
      const text = [...container.querySelectorAll("span")].find((item) => item.textContent === "source block");
      await act(async () => text.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
      expect(container.querySelector("polygon").getAttribute("points")).toBe("10,20 100,20 100,60 10,60");
      await act(async () => text.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
      expect(container.querySelector("polygon")).toBeNull();
      const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const writeText = jest.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
        expect(this.download).toBe("sample-source.txt");
      });
      try {
        await act(async () => button("复制").click());
        expect(writeText).toHaveBeenCalledWith("source block");
        await act(async () => [...container.querySelectorAll("button")].find((item) => item.textContent.includes("下载") && !item.disabled).click());
        expect(click).toHaveBeenCalled();
      } finally {
        click.mockRestore();
        if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
        else delete navigator.clipboard;
      }
      await step("翻译文本");
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      expect(button("译文").getAttribute("aria-pressed")).toBe("true");
      await step("合成图片");
      expect(lib.translateFileText).toHaveBeenCalledTimes(1);
      expect(button("译图").getAttribute("aria-pressed")).toBe("true");
      await step("识别文本");
      expect(container.querySelector('img[alt="译图结果"]')).toBeNull();
      expect(container.textContent).not.toContain("translated block");
    });
    test("text-only recognition completes without synthesis", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValue({ text: "plain text" });
      await act(async () => button("一键翻译").click());
      expect(lib.translateFileText.mock.calls[0][0]).toBe("plain text");
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      expect(container.textContent).toContain("识别结果没有区域坐标");
      expect(button("译文").getAttribute("aria-pressed")).toBe("true");
    });
    test("failed synthesis can be retried without OCR or translation", async () => {
      await setup();
      lib.synthesizeTranslatedImage.mockResolvedValueOnce(null);
      await act(async () => button("一键翻译").click());
      expect(container.textContent).toContain("图片合成失败");
      await step("合成图片");
      expect(lib.synthesizeTranslatedImage).toHaveBeenCalledTimes(2);
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
      expect(lib.translateFileText).toHaveBeenCalledTimes(1);
    });
    test("cancel preserves OCR and prevents late translation writes; retry reuses OCR", async () => {
      await setup();
      let resolve;
      lib.translateFileText.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
      await act(async () => button("一键翻译").click());
      await act(async () => button("取消").click());
      await act(async () => resolve("stale translation"));
      await act(async () => button("原文").click());
      expect(container.textContent).toContain("source block");
      expect(container.textContent).not.toContain("stale translation");
      await step("翻译文本");
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
      expect(lib.translateFileText).toHaveBeenCalledTimes(2);
    });
    test("file replacement discards pending synthesis", async () => {
      await setup();
      let resolve;
      lib.synthesizeTranslatedImage.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
      await act(async () => button("一键翻译").click());
      await upload("replacement.png");
      await act(async () => resolve(new Blob(["old image"])));
      expect(container.querySelector('img[alt="译图结果"]')).toBeNull();
      await openMenu();
      expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
    });
    test("translation failure preserves source and completed rows", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValue({ items: [{ text: "first", poly }, { text: "second", poly }] });
      lib.translateFileText.mockResolvedValueOnce("first translated").mockRejectedValueOnce(new Error("service failed"));
      await act(async () => button("一键翻译").click());
      expect(container.textContent).toContain("service failed");
      expect(container.textContent).toContain("first translated");
      await openMenu();
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("翻译文本").click());
      expect(lib.translateFileText).toHaveBeenCalledTimes(4);
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
    });
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
    const logoLink = container.querySelector(
      'a[href="https://github.com/fishjar/kiss-translator"]'
    );
    expect(logoLink).not.toBeNull();
    expect(logoLink.getAttribute("target")).toBe("_blank");

    // 验证初始状态：第二行展开，第一行最右侧渲染收起配置按钮（aria-expanded="true"）
    const collapseBtn = container.querySelector(
      'button[aria-label="收起配置"]'
    );
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
    const reCollapseBtn = container.querySelector(
      'button[aria-label="收起配置"]'
    );
    expect(reCollapseBtn).not.toBeNull();
    expect(reCollapseBtn.getAttribute("aria-expanded")).toBe("true");
  });

  test("选择 .epub 文件后成功渲染 EPUB 单主栏阅读器与书籍目录", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试小说</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<html><body><p>Hello EPUB</p></body></html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    };
    const uint8 = fflate.zipSync(zipData);
    const mockFile = new File([uint8], "test-book.epub", {
      type: "application/epub+zip",
    });

    // 为 jsdom 补齐 arrayBuffer 属性（jsdom 的 File 未必包含 arrayBuffer）
    mockFile.arrayBuffer = async () => uint8.buffer;

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 验证书籍目录标题及操作按钮成功呈现在页面中
    expect(container.textContent).toContain("书籍目录");
    expect(container.textContent).toContain("试译当前章节");
    expect(container.textContent).toContain("翻译整本书");
    expect(container.textContent).toContain("Aa");
  });

  test("换书时自动中止正在运行的翻译任务并防止旧任务回调写入状态（修复问题 1）", async () => {
    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml1 = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book One</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const uint8_1 = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml1),
      "OEBPS/ch1.xhtml": fflate.strToU8(`<html><body><p>Book 1 Content</p></body></html>`),
    });
    const mockFile1 = new File([uint8_1], "book1.epub", {
      type: "application/epub+zip",
    });
    mockFile1.arrayBuffer = async () => uint8_1.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');

    // 载入第一本书
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile1],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Book One");

    // 模拟启动试译当前章节
    let oldSignal;
    let oldProgressCallback;
    const { translateEpubChapter } = require("../../libs/fileTranslate");
    translateEpubChapter.mockImplementationOnce(
      (path, filesMap, scene, setting, signal, onProgress) => {
        oldSignal = signal;
        oldProgressCallback = onProgress;
        return new Promise(() => {}); // 挂起未完成
      }
    );

    const translateBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("试译当前章节")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    // 此时旧任务正在运行，oldSignal 尚未 aborted
    expect(oldSignal).toBeDefined();
    expect(oldSignal.aborted).toBe(false);

    // 此时用户换书，载入第二本书
    const opfXml2 = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book Two</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const uint8_2 = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml2),
      "OEBPS/ch1.xhtml": fflate.strToU8(`<html><body><p>Book 2 Content</p></body></html>`),
    });
    const mockFile2 = new File([uint8_2], "book2.epub", {
      type: "application/epub+zip",
    });
    mockFile2.arrayBuffer = async () => uint8_2.buffer;

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile2],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 1. 旧任务的 signal 必须已经被 abort
    expect(oldSignal.aborted).toBe(true);
    expect(container.textContent).toContain("Book Two");

    // 2. 如果旧任务滞后的进度回调尝试触发写入旧书内容，验证其被拦截，不污染新书页面
    await act(async () => {
      oldProgressCallback?.(1, 1, {
        partialBilingualHtml: "<p>旧书残余译文</p>",
      });
    });

    expect(container.textContent).not.toContain("旧书残余译文");
  });

  test("较早选入但读取慢的 EPUB 绝不覆盖较晚选入的书，且旧错误被静默丢弃（修复 selectFile 乱序竞态）", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

    // 构造慢速书 A
    let resolveBookA;
    const slowBufferPromise = new Promise((resolve) => {
      resolveBookA = resolve;
    });
    const opfXmlA = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Slow Book A</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const uint8_A = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXmlA),
      "OEBPS/ch1.xhtml": fflate.strToU8(`<html><body><p>Slow Content</p></body></html>`),
    });
    const mockFileA = new File([uint8_A], "slow-a.epub", {
      type: "application/epub+zip",
    });
    mockFileA.arrayBuffer = () => slowBufferPromise;

    // 构造快速书 B
    const opfXmlB = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Fast Book B</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const uint8_B = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXmlB),
      "OEBPS/ch1.xhtml": fflate.strToU8(`<html><body><p>Fast Content</p></body></html>`),
    });
    const mockFileB = new File([uint8_B], "fast-b.epub", {
      type: "application/epub+zip",
    });
    mockFileB.arrayBuffer = async () => uint8_B.buffer;

    // 1. 用户先选择慢速书 A（此时 A 阻塞在 arrayBuffer 读取）
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 2. 紧接着用户选择了快速书 B
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileB],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 验证当前界面成功呈现书 B
    expect(container.textContent).toContain("Fast Book B");
    expect(container.textContent).not.toContain("Slow Book A");

    // 3. 此时慢速书 A 的读取终于完成并返回
    await act(async () => {
      resolveBookA(uint8_A.buffer);
    });

    // 4. 验证书 A 绝对不能覆盖书 B，页面依然是 Fast Book B
    expect(container.textContent).toContain("Fast Book B");
    expect(container.textContent).not.toContain("Slow Book A");
  });

  test("慢速 TXT/Markdown 读取绝不覆盖后选文件的 sourceText（修复 readTxtFile 副作用竞态）", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');

    // 构造慢速 TXT 文件 A
    let resolveTxtA;
    const slowTxtPromise = new Promise((resolve) => {
      resolveTxtA = resolve;
    });
    const mockFileA = new File(["Slow A Content"], "slow-a.txt", {
      type: "text/plain",
    });
    mockFileA.text = () => slowTxtPromise;

    // 构造快速 TXT 文件 B
    const mockFileB = new File(["Fast B Content"], "fast-b.txt", {
      type: "text/plain",
    });
    mockFileB.text = async () => "Fast B Content";

    // 1. 用户先选慢速文件 A
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 2. 紧接着用户选入文件 B
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileB],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 此时页面左侧原文呈现 Fast B Content
    expect(container.textContent).toContain("Fast B Content");
    expect(container.textContent).not.toContain("Slow A Content");

    // 3. 此时慢速文件 A 终于读取完毕并返回
    await act(async () => {
      resolveTxtA("Slow A Content");
    });

    // 4. 验证 sourceText 绝未被慢速文件 A 覆盖
    expect(container.textContent).toContain("Fast B Content");
    expect(container.textContent).not.toContain("Slow A Content");
  });

  test("普通文件翻译旧任务的 finally 绝不重置新任务的 busy 状态、绝不清空新任务控制器，且旧任务结果不覆盖新任务（修复问题 7）", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    const { translateTxt } = require("../../libs/fileTranslate");

    let oldSignal;
    let oldProgressCb;
    let resolveOldTask;
    const oldPromise = new Promise((resolve) => {
      resolveOldTask = resolve;
    });

    let newSignal;
    let resolveNewTask;
    const newPromise = new Promise((resolve) => {
      resolveNewTask = resolve;
    });

    translateTxt
      .mockImplementationOnce((content, scene, setting, signal, onProgress) => {
        oldSignal = signal;
        oldProgressCb = onProgress;
        return oldPromise;
      })
      .mockImplementationOnce((content, scene, setting, signal) => {
        newSignal = signal;
        return newPromise;
      });

    // 1. 选入文件 A
    const mockFileA = new File(["Content A"], "fileA.txt", { type: "text/plain" });
    mockFileA.text = async () => "Content A";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 2. 点击翻译，启动文件 A 翻译
    const translateBtnA = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    expect(translateBtnA).toBeDefined();

    await act(async () => {
      translateBtnA.click();
    });

    // 确认旧任务已启动
    expect(oldSignal).toBeDefined();
    expect(oldSignal.aborted).toBe(false);

    // 3. 换入新文件 B
    const mockFileB = new File(["Content B"], "fileB.txt", { type: "text/plain" });
    mockFileB.text = async () => "Content B";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileB],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 旧任务此时已被 selectFile abort
    expect(oldSignal.aborted).toBe(true);

    // 4. 立即启动新文件 B 的翻译
    const translateBtnB = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    await act(async () => {
      translateBtnB.click();
    });

    // 新任务已启动
    expect(newSignal).toBeDefined();
    expect(newSignal.aborted).toBe(false);

    // 此时页面上应当存在“取消”按钮（因为处于 busy 状态）
    const cancelBtnBefore = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("取消")
    );
    expect(cancelBtnBefore).toBeDefined();

    // 5. 此时旧任务 A 延迟返回，尝试触发 progress 回调并 resolve 结束，走入 catch/finally
    await act(async () => {
      oldProgressCb?.(1, 1, { source: "Old A", target: "旧译文 A" });
      resolveOldTask({
        comparisons: [{ source: "Old A", target: "旧译文 A" }],
        text: "旧译文 A",
      });
    });

    // 6. 验证：
    // a. 旧任务的进度与结果没有写入界面
    expect(container.textContent).not.toContain("旧译文 A");

    // b. 新任务没有被旧任务的 finally 置为 busy=false，“取消”按钮依然存在
    const cancelBtnAfter = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("取消")
    );
    expect(cancelBtnAfter).toBeDefined();

    // c. 点击“取消”按钮，新任务的控制器能够正常响应 abort，说明未被旧任务清空
    await act(async () => {
      cancelBtnAfter.click();
    });
    expect(newSignal.aborted).toBe(true);

    // 清理未完成的 newPromise
    await act(async () => {
      resolveNewTask({ comparisons: [], text: "" });
    });
  });

  test("未翻译章节单章 HTML 导出支持回退读取源文档，并将图片内嵌为 Data URL 且不嵌套双重 html（修复问题 9）", async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-blob");
    URL.revokeObjectURL = jest.fn();

    const { generateStandaloneHtml } = require("../../libs/fileTranslate");
    generateStandaloneHtml.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>HTML Export Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
  <h1>Chapter Title</h1>
  <p>Some text</p>
  <img src="images/pic.png" alt="Test Image" />
</body>
</html>`;

    const fakePngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
      "OEBPS/images/pic.png": fakePngBytes,
    };
    const uint8 = fflate.zipSync(zipData);
    const mockFile = new File([uint8], "export-book.epub", {
      type: "application/epub+zip",
    });
    mockFile.arrayBuffer = async () => uint8.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 找到导出下拉菜单按钮
    const dropDownBtn = container.querySelector('button[title="更多导出选项"]');
    expect(dropDownBtn).not.toBeNull();

    await act(async () => {
      dropDownBtn.click();
    });

    // 查找并点击“导出当前章节 HTML (.html)”
    const menuItems = Array.from(document.querySelectorAll(".MuiMenuItem-root"));
    const exportChapterItem = menuItems.find((item) =>
      item.textContent?.includes("导出当前章节 HTML")
    );
    expect(exportChapterItem).toBeDefined();

    await act(async () => {
      exportChapterItem.click();
    });

    // 验证 generateStandaloneHtml 被成功调用
    expect(generateStandaloneHtml).toHaveBeenCalled();
    const passedHtml = generateStandaloneHtml.mock.calls[0][0];

    // 验证 cleanBodyHtml 提取了 body 内容，避免双重包含 <html>
    expect(passedHtml).not.toContain("<html");
    expect(passedHtml).not.toContain("<body");
    expect(passedHtml).toContain("Chapter Title");

    // 验证相对图片路径已被替换为 Base64 Data URL
    expect(passedHtml).toContain("data:image/png;base64,");
    expect(passedHtml).not.toContain('src="images/pic.png"');

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  test("handleStartTranslation 异步读取旧文件期间换新文件，旧回调被守卫拦截并不启动翻译（修复问题 10）", async () => {
    const { translateTxt } = require("../../libs/fileTranslate");
    translateTxt.mockClear();

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');

    // 构造慢速文本文件 A
    let resolveReadA;
    const slowReadPromise = new Promise((resolve) => {
      resolveReadA = resolve;
    });
    const mockFileA = new File(["Slow Content A"], "fileA.txt", { type: "text/plain" });
    mockFileA.text = () => slowReadPromise;

    // 1. 选入文件 A
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 2. 换入新文件 B
    const mockFileB = new File(["Fast Content B"], "fileB.txt", { type: "text/plain" });
    mockFileB.text = async () => "Fast Content B";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileB],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 3. 此时文件 A 的异步读取慢速结束并返回
    await act(async () => {
      resolveReadA("Slow Content A");
    });

    // 4. 验证翻译函数绝不会为文件 A 被隐式调用
    expect(translateTxt).not.toHaveBeenCalled();
    // 页面显示的原文应仍为 Fast Content B
    expect(container.textContent).toContain("Fast Content B");
    expect(container.textContent).not.toContain("Slow Content A");
  });

  test("移除文件 (handleClearFile) 彻底终止旧任务并自增 taskId，旧任务与回调不回写（第二轮修复问题 2）", async () => {
    const { translateTxt } = require("../../libs/fileTranslate");
    let oldSignal;
    let oldProgressCb;
    let resolveOldTask;
    const oldPromise = new Promise((resolve) => {
      resolveOldTask = resolve;
    });

    translateTxt.mockImplementationOnce((content, scene, setting, signal, onProgress) => {
      oldSignal = signal;
      oldProgressCb = onProgress;
      return oldPromise;
    });

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    const mockFile = new File(["Initial Content"], "fileA.txt", { type: "text/plain" });
    mockFile.text = async () => "Initial Content";

    // 1. 选入文件并读取完成
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Initial Content");

    // 2. 点击翻译按钮启动翻译
    const translateBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    expect(oldSignal).toBeDefined();
    expect(oldSignal.aborted).toBe(false);

    // 3. 用户在翻译进行中点击 Chip 上的叉号移除文件
    const deleteIcon = container.querySelector(".MuiChip-deleteIcon");
    expect(deleteIcon).not.toBeNull();

    await act(async () => {
      const deletePropsKey = Object.keys(deleteIcon).find((k) => k.startsWith("__reactProps$"));
      if (deletePropsKey && deleteIcon[deletePropsKey]?.onClick) {
        deleteIcon[deletePropsKey].onClick({ stopPropagation: () => {} });
      } else {
        const chip = container.querySelector(".MuiChip-root");
        const chipPropsKey = chip && Object.keys(chip).find((k) => k.startsWith("__reactProps$"));
        chip?.[chipPropsKey]?.onDelete?.();
      }
    });

    // 4. 核心验证：控制器被立即 abort，UI 完全重置清空
    expect(oldSignal.aborted).toBe(true);
    expect(container.querySelector(".MuiChip-root")).toBeNull();
    expect(container.textContent).not.toContain("Initial Content");

    // 5. 此时旧任务滞后产生进度并 resolve 结算
    await act(async () => {
      oldProgressCb?.(1, 1, { source: "Initial Content", target: "旧译文" });
      resolveOldTask({
        comparisons: [{ source: "Initial Content", target: "旧译文" }],
        text: "旧译文",
      });
    });

    // 验证旧译文绝不被写回已被清空的页面
    expect(container.textContent).not.toContain("旧译文");
  });

  test("试译章节中途出错或取消后，章节状态收敛为 idle 且清空半成品译文（第二轮修复问题 3）", async () => {
    const { translateEpubChapter } = require("../../libs/fileTranslate");
    let progressCb;
    let rejectTask;
    const taskPromise = new Promise((_, reject) => {
      rejectTask = reject;
    });

    translateEpubChapter.mockImplementationOnce(
      (path, filesMap, scene, setting, signal, onProgress) => {
        progressCb = onProgress;
        return taskPromise;
      }
    );

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Cancel Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<html><body><p>Original Chapter Content</p></body></html>`;

    const uint8 = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    });
    const mockFile = new File([uint8], "cancel-book.epub", {
      type: "application/epub+zip",
    });
    mockFile.arrayBuffer = async () => uint8.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 点击试译当前章节
    const translateBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("试译当前章节")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    // 模拟流式写入了半截未完成译文
    await act(async () => {
      progressCb?.(1, 2, {
        partialBilingualHtml: "<p>Original Chapter Content</p><p>Partial Trans Text</p>",
        partialTargetHtml: "<p>Partial Trans Text</p>",
      });
    });

    expect(container.textContent).toContain("Partial Trans Text");

    // 模拟任务失败抛错并中断
    await act(async () => {
      rejectTask(new Error("Translation Error"));
    });

    // 验证失败后，半截译文被清理，页面展示原本内容，不残留残缺译文
    expect(container.textContent).not.toContain("Partial Trans Text");
    expect(container.textContent).toContain("Original Chapter Content");
  });

  test("单章 HTML 导出严格过滤正文中的 script 标签与 on* 事件属性（第三轮修复问题 1）", async () => {
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => "blob:http://localhost/mock-blob");
    URL.revokeObjectURL = jest.fn();

    const { generateStandaloneHtml } = require("../../libs/fileTranslate");
    generateStandaloneHtml.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Malicious Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1WithXss = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body>
  <h1>Safe Title</h1>
  <script>alert("xss")</script>
  <img src="images/pic.png" onerror="alert('img_xss')" />
</body>
</html>`;

    const zipData = {
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1WithXss),
      "OEBPS/images/pic.png": new Uint8Array([1, 2, 3]),
    };
    const mockFile = new File([fflate.zipSync(zipData)], "malicious-book.epub", {
      type: "application/epub+zip",
    });
    mockFile.arrayBuffer = async () => fflate.zipSync(zipData).buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFile],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 展开导出菜单并点击“导出当前章节 HTML”
    const dropDownBtn = container.querySelector('button[title="更多导出选项"]');
    await act(async () => {
      dropDownBtn.click();
    });

    const exportChapterItem = Array.from(document.querySelectorAll(".MuiMenuItem-root")).find((item) =>
      item.textContent?.includes("导出当前章节 HTML")
    );
    expect(exportChapterItem).toBeDefined();

    await act(async () => {
      exportChapterItem.click();
    });

    expect(generateStandaloneHtml).toHaveBeenCalled();
    const passedHtml = generateStandaloneHtml.mock.calls[0][0];

    // 核心验证：导出的正文经过了严格净化，危险的 script 标签与 onerror 属性被彻底剥离
    expect(passedHtml).not.toContain("<script");
    expect(passedHtml).not.toContain("alert(");
    expect(passedHtml).not.toContain("onerror");
    expect(passedHtml).toContain("Safe Title");

    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  test("选入新文件异步读取期间，旧文件状态立即清空且翻译按钮禁用，杜绝竞态（第三轮修复问题 3）", async () => {
    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');

    // 1. 先选入快速文件 A 并完成读取
    const fileA = new File(["Content of File A"], "fileA.txt", { type: "text/plain" });
    fileA.text = async () => "Content of File A";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [fileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Content of File A");
    const translateBtnBefore = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    expect(translateBtnBefore).toBeDefined();
    expect(translateBtnBefore.disabled).toBe(false);

    // 2. 用户选入慢速大文件 B（挂起尚未读取完成）
    let resolveReadB;
    const slowReadPromise = new Promise((resolve) => {
      resolveReadB = resolve;
    });
    const fileB = new File(["Content of Big File B"], "bigFileB.txt", { type: "text/plain" });
    fileB.text = () => slowReadPromise;

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [fileB],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 3. 核心验证：在文件 B 异步读取期间，旧文件 A 的状态被立即清空，翻译按钮被安全禁用
    expect(container.textContent).not.toContain("Content of File A");
    const translateBtnDuring = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    // 翻译按钮处于不可用/禁用状态，无法用旧文件启动翻译
    expect(translateBtnDuring.disabled).toBe(true);

    // 4. 文件 B 慢速读取完成
    await act(async () => {
      resolveReadB("Content of Big File B");
    });

    // 呈现新文件 B 的内容，且翻译按钮恢复可用
    expect(container.textContent).toContain("Content of Big File B");
    const translateBtnAfter = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("分段翻译")
    );
    expect(translateBtnAfter.disabled).toBe(false);
  });

  test("下载 EPUB 具有结果缓存机制，重复点击下载不重复调用 exportEpubFromChapterStates（第五轮问题 4）", async () => {
    const { exportEpubFromChapterStates } = require("../../libs/fileTranslate");
    exportEpubFromChapterStates.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Cache Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello world</p></body>
</html>`;

    const epubZip = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    });

    const file = new File([epubZip], "cache_book.epub", {
      type: "application/epub+zip",
    });
    file.arrayBuffer = async () => epubZip.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 找到【下载双语 EPUB】按钮
    const downloadBilingualBtn = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("双语 EPUB"));

    expect(downloadBilingualBtn).toBeDefined();

    // 第一次点击下载
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);

    // 第二次点击下载，在状态未变更时命中缓存，不重复打包
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);
  });

  test("同一章重译后即使新旧译文长度相同也能使导出缓存失效并重新打包（第六轮问题 1）", async () => {
    const {
      exportEpubFromChapterStates,
      translateEpubChapter,
    } = require("../../libs/fileTranslate");
    exportEpubFromChapterStates.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Cache Invalidation Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello world</p></body>
</html>`;

    const epubZip = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    });

    const file = new File([epubZip], "cache_invalidation_book.epub", {
      type: "application/epub+zip",
    });
    file.arrayBuffer = async () => epubZip.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 第一次试译当前章节
    translateEpubChapter.mockResolvedValueOnce({
      status: "done",
      bilingualHtml: "<p>Hello world</p><p>你好世界</p>",
      targetHtml: "<p>你好世界</p>",
      bilingualXhtml: "<p>Hello world</p><p>你好世界</p>",
      targetXhtml: "<p>你好世界</p>",
    });

    const translateBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("试译当前章节")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    const downloadBilingualBtn = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("双语 EPUB"));

    // 第一次点击下载：调用导出
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);

    // 未重译前再次点击：命中缓存，不重复打包
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);

    // 第二次试译（重译）：新译文与旧译文字符长度完全相同（"你好世界" 与 "您好世界" 均为 4 字符）
    translateEpubChapter.mockResolvedValueOnce({
      status: "done",
      bilingualHtml: "<p>Hello world</p><p>您好世界</p>",
      targetHtml: "<p>您好世界</p>",
      bilingualXhtml: "<p>Hello world</p><p>您好世界</p>",
      targetXhtml: "<p>您好世界</p>",
    });

    await act(async () => {
      translateBtn.click();
    });

    // 重译后再次点击下载：虽然字符长度相同，但正文内容改变，缓存失效，必须重新打包
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(2);

    // 再次点击下载，命中最新缓存
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(2);
  });

  test("切换目标语言后已有的旧语言译文自动失效且不被导出（第七轮问题 1）", async () => {
    const {
      exportEpubFromChapterStates,
      translateEpubChapter,
    } = require("../../libs/fileTranslate");
    exportEpubFromChapterStates.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Lang Switch Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter 1</title></head>
<body><p>Hello world</p></body>
</html>`;

    const epubZip = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
    });

    const file = new File([epubZip], "lang_switch_book.epub", {
      type: "application/epub+zip",
    });
    file.arrayBuffer = async () => epubZip.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 1. 在当前中文目标语言下试译第 1 章
    translateEpubChapter.mockResolvedValueOnce({
      status: "done",
      bilingualHtml: "<p>Hello world</p><p>你好世界</p>",
      targetHtml: "<p>你好世界</p>",
      bilingualXhtml: "<p>Hello world</p><p>你好世界</p>",
      targetXhtml: "<p>你好世界</p>",
    });

    const translateBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("试译当前章节")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    const downloadBilingualBtn = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("双语 EPUB"));

    // 点击下载，导出中文双语 EPUB
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);
    const firstCallArgs = exportEpubFromChapterStates.mock.calls[0];
    // 首次导出包含已翻译的中文状态
    expect(firstCallArgs[1]["OEBPS/ch1.xhtml"]?.status).toBe("done");

    // 2. 切换目标语言为日语 "ja"
    const inputs = Array.from(container.querySelectorAll("input"));
    const toLangInput = inputs.find((i) => i.value === "zh-CN");
    expect(toLangInput).toBeDefined();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeSetter.call(toLangInput, "ja");
      toLangInput.dispatchEvent(new Event("input", { bubbles: true }));
      toLangInput.dispatchEvent(new Event("change", { bubbles: true }));

      // 同步更新 mockSetting 并重新渲染以触发 setting 监听闭环
      mockSetting.fileTranslateSetting.epub = {
        ...(mockSetting.fileTranslateSetting.epub || {}),
        toLang: "ja",
      };
      root.render(<FileTranslatePage />);
    });

    // 3. 语言切换后再次点击导出
    await act(async () => {
      downloadBilingualBtn.click();
    });

    // 验证：导出缓存已失效并触发重新导出（调用次数增至 2）
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(2);
    const secondCallArgs = exportEpubFromChapterStates.mock.calls[1];
    // 验证：传入的 chapterStates 中旧中文译文已被清空或失效，绝不夹杂旧语言译文
    expect(secondCallArgs[1]["OEBPS/ch1.xhtml"]).toBeUndefined();
  });

  test("EPUB 重新翻译后若正文不变但导航译文更新，导出缓存可靠失效并重新导出（第九轮缺陷修复）", async () => {
    const {
      exportEpubFromChapterStates,
      translateEpubBook,
    } = require("../../libs/fileTranslate");
    exportEpubFromChapterStates.mockClear();
    translateEpubBook.mockClear();

    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Nav Cache Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const ch1Xhtml = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter 1 Text</p></body></html>`;
    const navXhtml = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapter 1</a></li></ol></nav></html>`;

    const epubZip = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml),
      "OEBPS/ch1.xhtml": fflate.strToU8(ch1Xhtml),
      "OEBPS/nav.xhtml": fflate.strToU8(navXhtml),
    });

    const file = new File([epubZip], "nav_cache_book.epub", {
      type: "application/epub+zip",
    });
    file.arrayBuffer = async () => epubZip.buffer;

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 第一次全书翻译
    translateEpubBook.mockResolvedValueOnce({
      chapterResults: {
        "OEBPS/ch1.xhtml": {
          sourceHtml: ch1Xhtml,
          bilingualHtml: "<p>Chapter 1 Text</p><p>第一章 译文</p>",
          targetHtml: "<p>第一章 译文</p>",
        },
        "OEBPS/nav.xhtml": {
          sourceHtml: navXhtml,
          bilingualHtml: "<nav><a href='ch1.xhtml'>第一章 导航V1</a></nav>",
          targetHtml: "<nav><a href='ch1.xhtml'>第一章 导航V1</a></nav>",
        },
      },
    });

    const buttons = Array.from(container.querySelectorAll("button"));
    const translateBookBtn = buttons.find((b) =>
      b.textContent?.includes("翻译整本书")
    );
    expect(translateBookBtn).toBeDefined();

    await act(async () => {
      translateBookBtn.click();
    });

    const downloadBilingualBtn = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("双语 EPUB"));
    expect(downloadBilingualBtn).toBeDefined();

    // 首次导出
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);

    // 重复点击，命中缓存，调用次数不变
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(1);

    // 第二次全书翻译：正文 ch1.xhtml 保持完全一致，但导航文档 nav.xhtml 发生更新 (V2)
    translateEpubBook.mockResolvedValueOnce({
      chapterResults: {
        "OEBPS/ch1.xhtml": {
          sourceHtml: ch1Xhtml,
          bilingualHtml: "<p>Chapter 1 Text</p><p>第一章 译文</p>",
          targetHtml: "<p>第一章 译文</p>",
        },
        "OEBPS/nav.xhtml": {
          sourceHtml: navXhtml,
          bilingualHtml: "<nav><a href='ch1.xhtml'>第一章 导航V2更新</a></nav>",
          targetHtml: "<nav><a href='ch1.xhtml'>第一章 导航V2更新</a></nav>",
        },
      },
    });

    await act(async () => {
      translateBookBtn.click();
    });

    // 再次点击导出：因为导航译文变动，缓存必须失效，重新调用 exportEpubFromChapterStates
    await act(async () => {
      downloadBilingualBtn.click();
    });
    expect(exportEpubFromChapterStates).toHaveBeenCalledTimes(2);
  });

  test.each([{}, { parseMode: "fast", toLang: "en", apiSlugs: ["primary"] }])(
    "PDF 部分配置 %j 补齐语言、翻译服务和 DOC 设置",
    async (partial) => {
      const original = mockSetting.fileTranslateSetting.pdf;
      mockSetting.fileTranslateSetting.pdf = partial;
      try {
        await act(async () => root.render(<FileTranslatePage />));
        const input = container.querySelector('input[type="file"]');
        await act(async () => {
          Object.defineProperty(input, "files", {
            value: [new File(["pdf"], "defaults.pdf", { type: "application/pdf" })],
            configurable: true,
          });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        const valueFor = (label) => {
          const field = Array.from(container.querySelectorAll(".MuiFormControl-root"))
            .find((node) => node.querySelector("label")?.textContent === label);
          return field?.querySelector("input")?.value;
        };
        expect(valueFor("源语言")).toBe("auto");
        expect(valueFor("目标语言")).toBe(partial.toLang || "zh-CN");
        expect(valueFor("翻译服务")).toBe(partial.apiSlugs?.[0] || "Microsoft");
        expect(valueFor("界面分析服务")).toBe(
          partial.parseMode === "fast" ? undefined : "local-layout"
        );
        expect(container.textContent).not.toContain("管理模型");
      } finally {
        mockSetting.fileTranslateSetting.pdf = original;
      }
    }
  );

  test("选择 .pdf 文件后正确切换至 PDF 模式，渲染统一顶栏文件 Chip、第二行解析模式下拉框与译文样式，并挂载 PDF 工作区", async () => {
    mockPdfWorkspaceActions.translate.mockClear();
    mockPdfWorkspaceActions.parseAndTranslate.mockClear();
    mockPdfWorkspaceActions.download.mockClear();

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const file = new File(["dummy pdf content"], "sample_book.pdf", {
      type: "application/pdf",
    });
    file.arrayBuffer = async () => new ArrayBuffer(16);

    const fileInput = container.querySelector('input[type="file"]');
    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 验证 PDF 工作区成功挂载
    const pdfWorkspace = container.querySelector(
      '[data-testid="pdf-workspace"]'
    );
    expect(pdfWorkspace).not.toBeNull();

    // 验证顶栏文件 Chip 正常渲染，包含文件名与页数（10 页）
    const chips = Array.from(container.querySelectorAll(".MuiChip-root"));
    const fileChip = chips.find((c) =>
      c.textContent?.includes("sample_book.pdf")
    );
    expect(fileChip).toBeDefined();
    expect(fileChip.textContent).toContain("10 页");

    // 验证第二行统一设置栏包含“解析模式”与“译文样式”下拉项
    const labels = Array.from(
      container.querySelectorAll(".MuiInputLabel-root")
    );
    const parseModeLabel = labels.find((l) =>
      l.textContent?.includes("解析模式")
    );
    expect(parseModeLabel).toBeDefined();
    const textStyleLabel = labels.find((l) =>
      l.textContent?.includes("译文样式")
    );
    expect(textStyleLabel).toBeDefined();

    const layoutServiceField = labels.find((label) => label.textContent === "界面分析服务")
      .closest(".MuiFormControl-root");
    await act(async () => {
      layoutServiceField.querySelector('[role="combobox"]').dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });
    await act(async () => {
      document.querySelector('[role="option"][data-value="gpu-layout"]').click();
    });
    expect(mockUpdateChild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pdf: expect.objectContaining({
          layoutApiSlug: "gpu-layout",
          layoutDevice: "webgpu",
        }),
      })
    );

    // 验证顶栏一键翻译与导出按钮存在
    const buttons = Array.from(container.querySelectorAll("button"));
    const translateBtn = buttons.find((b) =>
      b.textContent?.includes("一键翻译")
    );
    expect(translateBtn).toBeDefined();

    const downloadMdBtn = buttons.find((b) =>
      b.textContent?.includes("下载 Markdown")
    );
    expect(downloadMdBtn).toBeDefined();

    // 验证点击顶栏“一键翻译”联动调用 PdfWorkspace 的 oneClickTranslate
    await act(async () => {
      translateBtn.click();
    });
    expect(
      mockPdfWorkspaceActions.oneClickTranslate.mock.calls.length +
        mockPdfWorkspaceActions.parseAndTranslate.mock.calls.length
    ).toBe(1);

    // 验证点击顶栏“下载 Markdown”联动调用 PdfWorkspace 的 download("md")
    await act(async () => {
      downloadMdBtn.click();
    });
    expect(mockPdfWorkspaceActions.download).toHaveBeenCalledWith("md");

    // 验证下拉菜单存在且点击“布局检测”联动调用 PdfWorkspace 的 detectLayout
    const dropdownArrowBtn = buttons.find((b) =>
      b.getAttribute("aria-label")?.includes("PDF 处理步骤")
    );
    expect(dropdownArrowBtn).toBeDefined();

    await act(async () => {
      dropdownArrowBtn.click();
    });

    const menuItems = Array.from(
      document.querySelectorAll('[role="menuitem"]')
    );
    const detectLayoutItem = menuItems.find((m) =>
      m.textContent?.includes("布局检测")
    );
    expect(detectLayoutItem).toBeDefined();

    await act(async () => {
      detectLayoutItem.click();
    });
    // 验证下拉菜单选择后仅切换模式，不立即执行
    expect(mockPdfWorkspaceActions.detectLayout).toHaveBeenCalledTimes(0);
    expect(translateBtn.textContent).toContain("布局检测");

    // 验证点击主按钮才真正执行选中的动作
    await act(async () => {
      translateBtn.click();
    });
    expect(mockPdfWorkspaceActions.detectLayout).toHaveBeenCalledTimes(1);
  });

  test("PDF 模式下未配置界面分析服务时，下拉菜单中布局检测置灰禁用", async () => {
    const originalApis = mockSetting.transApis;
    mockSetting.transApis = originalApis.filter(
      (api) => !api.capabilities?.includes("layout")
    );

    try {
      await act(async () => root.render(<FileTranslatePage />));

      const file = new File(["dummy pdf content"], "no_layout.pdf", {
        type: "application/pdf",
      });
      file.arrayBuffer = async () => new ArrayBuffer(16);

      const input = container.querySelector('input[type="file"]');
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });

      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const buttons = Array.from(container.querySelectorAll("button"));
      const dropdownArrowBtn = buttons.find((b) =>
        b.getAttribute("aria-label")?.includes("PDF 处理步骤")
      );
      expect(dropdownArrowBtn).toBeDefined();

      await act(async () => {
        dropdownArrowBtn.click();
      });

      const menuItems = Array.from(
        document.querySelectorAll('[role="menuitem"]')
      );
      const detectLayoutItem = menuItems.find((m) =>
        m.textContent?.includes("布局检测")
      );
      expect(detectLayoutItem).toBeDefined();
      expect(
        detectLayoutItem.getAttribute("aria-disabled") === "true" ||
          detectLayoutItem.hasAttribute("disabled") ||
          detectLayoutItem.classList.contains("Mui-disabled")
      ).toBe(true);
    } finally {
      mockSetting.transApis = originalApis;
    }
  });
});
