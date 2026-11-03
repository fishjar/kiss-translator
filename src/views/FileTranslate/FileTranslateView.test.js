/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import * as fflate from "fflate";
import FileTranslatePage from "./index";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalResizeObserver = globalThis.ResizeObserver;
let mockConnected = true;
let mockPdfStateOverrides = {};
const mockAnalyzeLayout = jest.fn().mockResolvedValue({ regions: [] });
beforeAll(() => {
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      this.callback([{ contentRect: { width: 1000 } }]);
    }
    disconnect() {}
  };
});
afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

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
      connected: mockConnected,
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
        analyzeLayout: (...args) => mockAnalyzeLayout(...args),
        recognize: (file, selection, signal, options = {}) =>
          ops.recognizeFileImage(
            file,
            {
              groupId:
                setting.transApis.find(
                  (api) => api.apiSlug === selection?.apiSlug
                )?.modelRef ||
                setting.fileTranslateSetting.image.ocrGroup ||
                "ppocr-v5-mobile",
              device: setting.fileTranslateSetting.image.ocrDevice || "webgpu",
              ...(options.cacheMode && { cacheMode: options.cacheMode }),
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
      enabledCapabilities: ["translate"],
    },
    {
      apiSlug: "local-layout",
      apiType: "LocalAI",
      apiName: "本地版面分析",
      sourceType: "local",
      modelRef: "pp-doclayout-v3-onnx",
      device: "wasm",
      enabledCapabilities: ["analyzeLayout"],
    },
    {
      apiSlug: "gpu-layout",
      apiType: "Plugin",
      provider: {
        apiVersion: 1,
        implementation: { kind: "script", entry: "layout.js" },
        capabilities: {
          analyzeLayout: { handler: "layout", coordinates: true },
        },
      },
      apiName: "GPU版面分析",
      sourceType: "local",
      modelRef: "pp-doclayout-v3-onnx",
      device: "webgpu",
      enabledCapabilities: ["analyzeLayout"],
    },
  ],
  prompts: [],
  fileTranslateSetting: {
    txt: {
      apiSlug: "primary",
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      textStyle: "style_none",
    },
    markdown: {
      apiSlug: "primary",
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      textStyle: "style_none",
    },
    image: {
      apiSlug: "primary",
      fromLang: "auto",
      toLang: "zh-CN",
      promptSlug: "",
      recognitionService: { apiSlug: "test-ocr", capability: "recognizeText" },
      fontFamily: "default",
    },
    pdf: {
      apiSlug: "primary",
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
    const onStateChange = React.useRef(props.onStateChange);
    React.useEffect(() => {
      if (onStateChange.current) {
        onStateChange.current({
          phase: "ready",
          progress: { done: 0, total: 10 },
          pdf: { numPages: 10 },
          result: { complete: true },
          blocks: [{ id: "b1", text: "hello" }],
          busy: false,
          failedCount: 0,
          ...mockPdfStateOverrides,
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
    mockConnected = true;
    mockPdfStateOverrides = {};
    mockAnalyzeLayout.mockResolvedValue({ regions: [] });
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

  describe("toolbar actions", () => {
    test("a selected undownloaded local translation service shows the model download entry", async () => {
      const openSettings = jest
        .spyOn(require("../../libs/navigation"), "openOptionsPage")
        .mockResolvedValue(undefined);
      const original = mockSetting.fileTranslateSetting.txt.apiSlug;
      mockSetting.transApis.push({
        apiSlug: "local-translate",
        apiName: "本地翻译模型",
        apiType: "LocalAI",
        modelRef: "hy-mt2-1.8b",
        device: "webgpu",
        enabledCapabilities: ["translate"],
      });
      mockSetting.fileTranslateSetting.txt.apiSlug = "local-translate";
      try {
        await act(async () => root.render(<FileTranslatePage />));
        expect(container.textContent).toContain(
          "本地翻译模型：本地模型未下载或下载不完整"
        );
        const button = [...container.querySelectorAll("button")].find(
          (item) => item.textContent === "下载模型"
        );
        expect(button).toBeDefined();
        await act(async () => button.click());
        expect(openSettings).toHaveBeenCalledWith("/local-ai");
      } finally {
        mockSetting.fileTranslateSetting.txt.apiSlug = original;
        mockSetting.transApis.pop();
        openSettings.mockRestore();
      }
    });
    const button = (label) =>
      [...container.querySelectorAll("button")].find(
        (item) => item.textContent === label
      );
    const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')];
    const upload = async (name, content = "hello") => {
      const file = new File([content], name);
      file.text = async () => content;
      file.arrayBuffer = async () => new ArrayBuffer(16);
      await act(async () => {
        const input = container.querySelector('input[type="file"]');
        Object.defineProperty(input, "files", {
          value: [file],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    const openMenu = async (label) =>
      act(async () =>
        container.querySelector(`[aria-label="${label}"]`).click()
      );

    const paste = async ({ files = [], text = "", items = [] } = {}) => {
      await act(async () => button("粘贴文件或文本").click());
      const area = document.querySelector('[aria-label="粘贴区域"]');
      expect(document.activeElement).toBe(area);
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: {
          files,
          items,
          getData: (type) => (type === "text/plain" ? text : ""),
        },
      });
      await act(async () => {
        area.dispatchEvent(event);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    };
    const switchFormat = async (label) => {
      const select = container.querySelector(
        '[aria-label="文本格式"][role="combobox"]'
      );
      await act(async () =>
        select.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0 })
        )
      );
      await act(async () =>
        [...document.querySelectorAll('[role="option"]')]
          .find((item) => item.textContent === label)
          .click()
      );
    };

    test.each(["  hello\nworld  ", "  \n\t", "# Title\n\n**bold**"])(
      "pasted text preserves content and defaults to TXT: %j",
      async (text) => {
        const lib = require("../../libs/fileTranslate");
        lib.translateTxt
          .mockReset()
          .mockResolvedValue({ text: "translated", comparisons: [] });
        await act(async () => root.render(<FileTranslatePage />));
        await paste({ text });
        expect(container.textContent).toContain("粘贴文本.txt");
        expect(
          container.querySelector('[aria-label="文本格式"][role="combobox"]')
            .textContent
        ).toBe("TXT");
        expect(lib.translateTxt).not.toHaveBeenCalled();
        await act(async () => button("一键翻译").click());
        expect(lib.translateTxt.mock.calls[0][0]).toBe(text);
      }
    );

    test("invalid and empty paste keep the current document and results", async () => {
      const lib = require("../../libs/fileTranslate");
      lib.translateTxt
        .mockReset()
        .mockResolvedValue({ text: "kept result", comparisons: [] });
      await act(async () => root.render(<FileTranslatePage />));
      await upload("keep.txt");
      await act(async () => button("一键翻译").click());
      await paste({
        files: [new File(["bad"], "bad.exe")],
        text: "not a fallback",
      });
      expect(document.querySelector('[role="alert"]').textContent).toContain(
        "暂不支持"
      );
      expect(container.textContent).toContain("keep.txt");
      expect(container.textContent).toContain("kept result");
      await act(async () =>
        [...document.querySelectorAll('[role="dialog"] button')]
          .find((item) => item.textContent === "取消")
          .click()
      );
      await paste();
      expect(document.querySelector('[role="alert"]').textContent).toContain(
        "未获取到"
      );
      expect(container.textContent).toContain("kept result");
    });

    test("files take priority and the first supported file is imported", async () => {
      await act(async () => root.render(<FileTranslatePage />));
      const file = new File(["# File"], "first.md");
      file.text = async () => "# File";
      await paste({
        files: [
          new File(["bad"], "bad.exe"),
          file,
          new File(["later"], "later.txt"),
        ],
        text: "ignore",
      });
      expect(container.textContent).toContain("first.md");
      expect(
        container.querySelector('[aria-label="文本格式"][role="combobox"]')
          .textContent
      ).toBe("Markdown");
      expect(
        require("../../libs/fileTranslate").splitMarkdownBlocks
      ).toHaveBeenCalledWith("# File");
    });

    test("clipboard file items support unnamed screenshots", async () => {
      const original = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => "blob:paste-image");
      URL.revokeObjectURL = jest.fn();
      try {
        await act(async () => root.render(<FileTranslatePage />));
        await paste({
          items: [
            {
              kind: "file",
              getAsFile: () => new File(["image"], "", { type: "image/png" }),
            },
          ],
        });
        expect(
          container.querySelector('img[src="blob:paste-image"]')
        ).not.toBeNull();
        expect(container.querySelector('[aria-label="文本格式"]')).toBeNull();
      } finally {
        await act(async () => root.unmount());
        root = createRoot(container);
        URL.createObjectURL = original;
        URL.revokeObjectURL = originalRevoke;
      }
    });

    test.each(["txt", "md"])(
      "%s switches both ways and confirms clearing results",
      async (extension) => {
        const lib = require("../../libs/fileTranslate");
        lib.splitMarkdownBlocks.mockReturnValue([]);
        lib.translateTxt
          .mockReset()
          .mockResolvedValue({ text: "TXT result", comparisons: [] });
        lib.translateMarkdown.mockReset().mockResolvedValue({
          translatedMd: "MD result",
          comparisons: [],
          blocks: [],
        });
        await act(async () => root.render(<FileTranslatePage />));
        await upload(`sample.${extension}`, "# Original");
        const next = extension === "txt" ? "Markdown" : "TXT";
        const initial = extension === "txt" ? "TXT" : "Markdown";
        await act(async () => button("一键翻译").click());
        await switchFormat(next);
        expect(document.querySelector('[role="dialog"]').textContent).toContain(
          "切换格式将清空翻译结果"
        );
        await act(async () =>
          [...document.querySelectorAll('[role="dialog"] button')]
            .find((item) => item.textContent === "取消")
            .click()
        );
        expect(
          container.querySelector('[aria-label="文本格式"][role="combobox"]')
            .textContent
        ).toBe(initial);
        await switchFormat(next);
        await act(async () =>
          [...document.querySelectorAll('[role="dialog"] button')]
            .find((item) => item.textContent === "切换格式")
            .click()
        );
        expect(container.textContent).not.toContain("TXT result");
        expect(container.textContent).not.toContain("MD result");
        expect(container.textContent).toContain(`sample.${extension}`);
        await act(async () => button("一键翻译").click());
        const target =
          next === "TXT" ? lib.translateTxt : lib.translateMarkdown;
        expect(target.mock.calls.at(-1)[0]).toBe("# Original");
      }
    );

    test("pasted text switches without results and downloads using the selected format", async () => {
      const lib = require("../../libs/fileTranslate");
      lib.splitMarkdownBlocks.mockReturnValue([]);
      lib.translateTxt.mockResolvedValue({
        text: "TXT export",
        comparisons: [],
      });
      lib.translateMarkdown.mockResolvedValue({
        translatedMd: "MD export",
        comparisons: [],
        blocks: [],
      });
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => "blob:download");
      URL.revokeObjectURL = jest.fn();
      const downloads = [];
      const click = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function () {
          downloads.push(this.download);
        });
      try {
        await act(async () => root.render(<FileTranslatePage />));
        await paste({ text: "# Keep original" });
        await switchFormat("Markdown");
        expect(document.body.textContent).not.toContain(
          "切换格式将清空翻译结果"
        );
        expect(lib.splitMarkdownBlocks).toHaveBeenCalledWith("# Keep original");
        await act(async () => button("一键翻译").click());
        await act(async () => button("下载译文 MD").click());
        expect(downloads.at(-1)).toBe("粘贴文本-translated.md");
        await switchFormat("TXT");
        await act(async () =>
          [...document.querySelectorAll('[role="dialog"] button')]
            .find((item) => item.textContent === "切换格式")
            .click()
        );
        await act(async () => button("一键翻译").click());
        await act(async () => button("下载译文 TXT").click());
        expect(downloads.at(-1)).toBe("粘贴文本-translated.txt");
        expect(lib.translateTxt.mock.calls.at(-1)[0]).toBe("# Keep original");
        await act(
          async () => new Promise((resolve) => setTimeout(resolve, 10))
        );
      } finally {
        click.mockRestore();
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
      }
    });

    test("pasting a replacement aborts old translation and stale callbacks cannot overwrite a format switch", async () => {
      const lib = require("../../libs/fileTranslate");
      lib.splitMarkdownBlocks.mockReturnValue([]);
      let finish;
      let progress;
      lib.translateTxt.mockImplementation(
        (text, scene, setting, signal, onProgress) => {
          progress = onProgress;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
      );
      await act(async () => root.render(<FileTranslatePage />));
      await upload("old.txt");
      await act(async () => button("一键翻译").click());
      const signal = lib.translateTxt.mock.calls[0][3];
      await paste({ text: "# New source" });
      expect(signal.aborted).toBe(true);
      await switchFormat("Markdown");
      await act(async () => {
        progress(1, 1, { index: 0, source: "old", target: "stale callback" });
        finish({ text: "stale result", comparisons: [] });
      });
      expect(container.textContent).not.toContain("stale result");
      expect(container.textContent).not.toContain("stale callback");
      expect(
        container.querySelector('[aria-label="文本格式"][role="combobox"]')
          .textContent
      ).toBe("Markdown");
      expect(lib.splitMarkdownBlocks).toHaveBeenCalledWith("# New source");
    });

    test("Markdown source preview alone does not require clearing confirmation", async () => {
      const lib = require("../../libs/fileTranslate");
      lib.splitMarkdownBlocks.mockReturnValue([{ source: "# Original" }]);
      lib.renderMarkdownBlocksToHtml.mockReturnValue("<p>Original</p>");
      await act(async () => root.render(<FileTranslatePage />));
      await upload("source.md", "# Original");
      await switchFormat("TXT");
      expect(document.body.textContent).not.toContain("切换格式将清空翻译结果");
      expect(
        container.querySelector('[aria-label="文本格式"][role="combobox"]')
          .textContent
      ).toBe("TXT");
    });

    test("format switching is disabled during translation", async () => {
      const lib = require("../../libs/fileTranslate");
      let finish;
      lib.translateTxt.mockReset().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      await act(async () => root.render(<FileTranslatePage />));
      await upload("busy.txt");
      await act(async () => button("一键翻译").click());
      expect(
        container
          .querySelector('[aria-label="文本格式"][role="combobox"]')
          .getAttribute("aria-disabled")
      ).toBe("true");
      await act(async () => finish({ text: "done", comparisons: [] }));
    });

    test.each(["txt", "md"])(
      "%s menu runs immediately and leaves the main action as paragraph translation",
      async (extension) => {
        const lib = require("../../libs/fileTranslate");
        const paragraph =
          extension === "txt" ? lib.translateTxt : lib.translateMarkdown;
        const entire =
          extension === "txt"
            ? lib.translateEntireTxt
            : lib.translateEntireMarkdown;
        const result = {
          text: "translated",
          comparisons: [],
          translatedMd: "translated",
          blocks: [],
        };
        paragraph.mockReset().mockResolvedValue(result);
        entire.mockReset().mockResolvedValue(result);
        await act(async () => root.render(<FileTranslatePage />));
        await upload(`sample.${extension}`);
        await openMenu("选择翻译模式");
        expect(menuItems().map((item) => item.textContent)).toEqual([
          "分段翻译 (默认)",
          "整篇翻译 (全文连贯)",
        ]);
        await act(async () => menuItems()[1].click());
        expect(entire).toHaveBeenCalledTimes(1);
        expect(paragraph).not.toHaveBeenCalled();
        expect(
          container
            .querySelector('[aria-label="选择翻译模式"]')
            .getAttribute("aria-expanded")
        ).not.toBe("true");
        expect(button("一键翻译")).toBeDefined();
        await act(async () => button("一键翻译").click());
        expect(paragraph).toHaveBeenCalledTimes(1);
        expect(entire).toHaveBeenCalledTimes(1);
        await openMenu("选择翻译模式");
        expect(menuItems().map((item) => item.textContent)).toEqual([
          "分段翻译 (默认)",
          "整篇翻译 (全文连贯)",
        ]);
        await act(async () => menuItems()[0].click());
        expect(paragraph).toHaveBeenCalledTimes(2);
        await upload(`replacement.${extension}`);
        expect(button("一键翻译")).toBeDefined();
      }
    );

    test("long entire translation still asks for content confirmation", async () => {
      const lib = require("../../libs/fileTranslate");
      lib.translateEntireTxt
        .mockReset()
        .mockResolvedValue({ text: "translated" });
      await act(async () => root.render(<FileTranslatePage />));
      await upload("long.txt", "a".repeat(10001));
      await openMenu("选择翻译模式");
      await act(async () => menuItems()[1].click());
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(lib.translateEntireTxt).not.toHaveBeenCalled();
      expect(button("一键翻译")).toBeDefined();
      await act(async () =>
        [...document.querySelectorAll('[role="dialog"] button')]
          .find((item) => item.textContent === "继续整篇翻译")
          .click()
      );
      expect(lib.translateEntireTxt).toHaveBeenCalledTimes(1);
      expect(button("一键翻译")).toBeDefined();
    });

    test("PDF menu actions execute once in fixed order and never replace the main action", async () => {
      mockPdfStateOverrides = { hasLayoutResult: true };
      Object.values(mockPdfWorkspaceActions).forEach((action) =>
        action.mockClear()
      );
      await act(async () => root.render(<FileTranslatePage />));
      await upload("sample.pdf");
      const labels = ["布局检测", "文本识别", "文本翻译"];
      const actions = ["detectLayout", "recognizeText", "translate"];
      for (let index = 0; index < labels.length; index++) {
        await openMenu("PDF 处理步骤");
        expect(menuItems().map((item) => item.textContent)).toEqual(labels);
        await act(async () => menuItems()[index].click());
        expect(mockPdfWorkspaceActions[actions[index]]).toHaveBeenCalledTimes(
          1
        );
        expect(
          container
            .querySelector('[aria-label="PDF 处理步骤"]')
            .getAttribute("aria-expanded")
        ).toBe("false");
        expect(button("一键翻译")).toBeDefined();
      }
      await act(async () => button("一键翻译").click());
      expect(mockPdfWorkspaceActions.oneClickTranslate).toHaveBeenCalledTimes(
        1
      );
      expect(mockPdfWorkspaceActions.detectLayout).toHaveBeenCalledTimes(1);
    });

    test.each([
      [{ hasLayoutResult: false, blocks: [] }, true, [false, true, true]],
      [{}, false, [true, true, true]],
      [
        { hasLayoutResult: true, result: { complete: false } },
        true,
        [false, false, true],
      ],
    ])(
      "PDF action admission matches the current prerequisites: %j",
      async (state, connected, disabled) => {
        mockConnected = connected;
        mockPdfStateOverrides = state;
        await act(async () => root.render(<FileTranslatePage />));
        await upload("sample.pdf");
        await openMenu("PDF 处理步骤");
        expect(
          menuItems().map(
            (item) => item.getAttribute("aria-disabled") === "true"
          )
        ).toEqual(disabled);
        expect(button("一键翻译").disabled).toBe(disabled[0]);
      }
    );

    test.each([
      [
        {
          busy: true,
          recognitionBusy: true,
          translationBusy: false,
          automaticBusy: false,
          canTranslate: true,
        },
        [true, true, false],
      ],
      [
        {
          busy: true,
          recognitionBusy: true,
          translationBusy: true,
          automaticBusy: false,
          canTranslate: false,
        },
        [true, true, true],
      ],
      [
        {
          busy: true,
          recognitionBusy: true,
          translationBusy: false,
          automaticBusy: false,
          canTranslate: false,
        },
        [true, true, true],
      ],
    ])(
      "PDF recognition permits only ready incremental translation: %j",
      async (state, disabled) => {
        mockPdfStateOverrides = state;
        await act(async () => root.render(<FileTranslatePage />));
        await upload("incremental.pdf");
        expect(
          container.querySelector('[aria-label="PDF 处理步骤"]').disabled
        ).toBe(false);
        await openMenu("PDF 处理步骤");
        expect(
          menuItems().map(
            (item) => item.getAttribute("aria-disabled") === "true"
          )
        ).toEqual(disabled);
        expect(button("一键翻译").disabled).toBe(true);
      }
    );

    test("PDF toolbar disables all actions while a task is busy", async () => {
      mockPdfStateOverrides = { busy: true };
      await act(async () => root.render(<FileTranslatePage />));
      await upload("sample.pdf");
      expect(button("一键翻译").disabled).toBe(true);
      expect(
        container.querySelector('[aria-label="PDF 处理步骤"]').disabled
      ).toBe(true);
    });

    test("PDF main action resumes the whole pipeline even with failed translations", async () => {
      mockPdfStateOverrides = { failedCount: 2 };
      mockPdfWorkspaceActions.translate.mockClear();
      mockPdfWorkspaceActions.oneClickTranslate.mockClear();
      await act(async () => root.render(<FileTranslatePage />));
      await upload("retry.pdf");
      await act(async () => button("一键翻译").click());
      expect(mockPdfWorkspaceActions.translate).not.toHaveBeenCalled();
      expect(mockPdfWorkspaceActions.oneClickTranslate).toHaveBeenCalledTimes(
        1
      );
      expect(button("一键翻译")).toBeDefined();
    });
  });

  test("image translation submits every OCR block and reassembles coordinates in source order", async () => {
    const { recognizeFileImage } = require("../../localAi/fileOperations");
    const {
      translateFileText,
      synthesizeTranslatedImage,
    } = require("../../libs/fileTranslate");
    const originalCreate = URL.createObjectURL,
      originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => "blob:image-test");
    URL.revokeObjectURL = jest.fn();
    const items = Array.from({ length: 51 }, (_, i) => ({
      text: `Source${i}`,
      box: [i, 0, 5, 5],
      poly: [
        [i, 0],
        [i + 5, 0],
        [i, 5],
      ],
    }));
    const pending = [];
    mockSetting.transApis.push({
      apiSlug: "test-ocr",
      apiType: "Plugin",
      sourceType: "network",
      recognitionFeatures: {
        recognizeText: { coordinates: true, available: true },
      },
      enabledCapabilities: ["recognizeText"],
    });
    recognizeFileImage.mockResolvedValue({ items });
    translateFileText
      .mockReset()
      .mockImplementation(
        (text, scene, setting, signal) =>
          new Promise((resolve) => pending.push({ text, resolve, signal }))
      );
    synthesizeTranslatedImage.mockReset().mockResolvedValue(null);
    try {
      await act(async () => root.render(<FileTranslatePage />));
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        Object.defineProperty(input, "files", {
          value: [new File(["image"], "sample.png", { type: "image/png" })],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () =>
        [...container.querySelectorAll("button")]
          .find((button) => button.textContent.includes("一键翻译"))
          .click()
      );
      expect(pending).toHaveLength(51);
      expect(synthesizeTranslatedImage).not.toHaveBeenCalled();
      await act(async () =>
        [...pending]
          .reverse()
          .forEach(({ text, resolve }) => resolve(`译${text}`))
      );
      expect(synthesizeTranslatedImage).toHaveBeenCalledTimes(1);
      expect(synthesizeTranslatedImage.mock.calls[0][1]).toEqual(
        items.map((item) => ({
          source: item.text,
          target: `译${item.text}`,
          enabled: true,
          translated: true,
          translationKey: expect.any(String),
          poly: item.poly,
          box: item.box,
        }))
      );
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
    const poly = [
      [10, 20],
      [100, 20],
      [100, 60],
      [10, 60],
    ];
    let originalCreate, originalRevoke;
    const button = (label) =>
      [...container.querySelectorAll("button")].find(
        (item) => item.textContent === label
      );
    const upload = async (name = "sample.png") => {
      await act(async () => {
        const input = container.querySelector('input[type="file"]');
        Object.defineProperty(input, "files", {
          value: [new File(["image"], name, { type: "image/png" })],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    const openMenu = async () =>
      act(async () =>
        container.querySelector('[aria-label="图片处理步骤"]').click()
      );
    const menuItem = (label) =>
      [...document.querySelectorAll('[role="menuitem"]')].find(
        (item) => item.textContent === label
      );
    const step = async (label) => {
      await openMenu();
      await act(async () => menuItem(label).click());
    };
    const measurePreview = async () => {
      const image = container.querySelector('img[alt="原图预览"]');
      Object.defineProperties(image, {
        naturalWidth: { value: 200, configurable: true },
        naturalHeight: { value: 100, configurable: true },
      });
      await act(async () => image.dispatchEvent(new Event("load")));
    };
    const regions = () => [...container.querySelectorAll("polygon")];
    beforeEach(async () => {
      originalCreate = URL.createObjectURL;
      originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = jest.fn(() => "blob:stage-test");
      URL.revokeObjectURL = jest.fn();
      mockSetting.transApis.push({
        apiSlug: "test-ocr",
        apiType: "Plugin",
        sourceType: "network",
        recognitionFeatures: {
          recognizeText: {
            coordinates: true,
            taskModes: ["doc"],
            available: true,
          },
        },
        enabledCapabilities: ["recognizeText"],
      });
      ops.recognizeFileImage
        .mockReset()
        .mockResolvedValue({ items: [{ text: "source block", poly }] });
      lib.translateFileText.mockReset().mockResolvedValue("translated block");
      lib.synthesizeTranslatedImage
        .mockReset()
        .mockResolvedValue(new Blob(["png"]));
    });
    const setup = async () => {
      await act(async () => root.render(<FileTranslatePage />));
      await upload();
    };
    test.each([true, false])(
      "image recognition label and prerequisite match layout availability: %s",
      async (available) => {
        const savedApis = mockSetting.transApis;
        try {
          if (!available)
            mockSetting.transApis = savedApis.filter(
              (api) => !api.enabledCapabilities?.includes("analyzeLayout")
            );
          await setup();
          await openMenu();
          expect(menuItem(available ? "布局与识别" : "识别文本")).toBeDefined();
          expect(menuItem("布局检测")).toBeUndefined();
          expect(menuItem("翻译文本").getAttribute("title")).toBe(
            available ? "请先执行布局与识别" : "请先识别文本"
          );
          await act(async () =>
            menuItem(available ? "布局与识别" : "识别文本").click()
          );
          expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
          expect(mockAnalyzeLayout).toHaveBeenCalledTimes(available ? 1 : 0);
        } finally {
          mockSetting.transApis = savedApis;
        }
      }
    );
    test("layout paragraphs drive translation and preview selection", async () => {
      const paragraph = [
        [0, 0],
        [200, 0],
        [200, 80],
        [0, 80],
      ];
      mockAnalyzeLayout.mockResolvedValue({
        imageSize: { width: 200, height: 100 },
        regions: [
          {
            id: "paragraph",
            type: "text",
            bbox: [0, 0, 200, 80],
            polygon: paragraph,
            order: 0,
          },
        ],
      });
      ops.recognizeFileImage.mockResolvedValue({
        imageSize: { width: 200, height: 100 },
        items: [
          {
            text: "The research",
            poly: [
              [10, 10],
              [190, 10],
              [190, 25],
              [10, 25],
            ],
          },
          {
            text: "since 2024",
            poly: [
              [10, 35],
              [190, 35],
              [190, 50],
              [10, 50],
            ],
          },
        ],
      });
      await setup();
      await step("布局与识别");
      await measurePreview();
      expect(mockAnalyzeLayout).toHaveBeenCalledTimes(1);
      expect(regions()).toHaveLength(1);
      expect(regions()[0].getAttribute("points")).toBe("0,0 200,0 200,80 0,80");
      expect(container.textContent).toContain("布局线框");
      expect(
        container.querySelector('[data-testid="image-layout-type"]').textContent
      ).toBe("正文");
      await step("翻译文本");
      expect(lib.translateFileText).toHaveBeenCalledTimes(1);
      expect(lib.translateFileText.mock.calls[0][0]).toBe(
        "The research since 2024"
      );
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(regions()[0].getAttribute("aria-pressed")).toBe("false");
    });
    afterEach(() => {
      act(() => root.render(null));
      mockSetting.transApis.pop();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });
    test("switching image layout services saves only the service and invalidates recognition", async () => {
      const savedScenes = mockSetting.fileTranslateSetting;
      try {
        await setup();
        await step("布局与识别");
        const field = [...container.querySelectorAll(".MuiInputLabel-root")]
          .find((label) => label.textContent === "界面分析服务")
          .closest(".MuiFormControl-root");
        await act(async () =>
          field
            .querySelector('[role="combobox"]')
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
        );
        await act(async () =>
          document
            .querySelector('[role="option"][data-value="gpu-layout"]')
            .click()
        );
        const updated = mockUpdateChild.mock.calls.at(-1)[0];
        expect(updated.image).toEqual({
          ...savedScenes.image,
          layoutApiSlug: "gpu-layout",
        });
        mockSetting.fileTranslateSetting = updated;
        await act(async () => root.render(<FileTranslatePage />));
        await openMenu();
        expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
        await act(async () => menuItem("布局与识别").click());
        expect(ops.recognizeFileImage).toHaveBeenCalledTimes(2);
        expect(mockAnalyzeLayout.mock.calls.at(-1)[4]).toBe("gpu-layout");
      } finally {
        mockSetting.fileTranslateSetting = savedScenes;
      }
    });
    test.each(["toLang", "apiSlug", "promptSlug", "service"])(
      "image translation invalidates %s changes without repeating OCR",
      async (field) => {
        await setup();
        await step("布局与识别");
        await step("翻译文本");
        expect(lib.translateFileText).toHaveBeenCalledTimes(1);
        const scene = mockSetting.fileTranslateSetting.image;
        const savedScenes = mockSetting.fileTranslateSetting;
        const api = mockSetting.transApis.find(
          (item) => item.apiSlug === scene.apiSlug
        );
        const oldSignature = api?.translationSignature;
        try {
          if (field === "service") api.translationSignature = "changed-service";
          else
            mockSetting.fileTranslateSetting = {
              ...savedScenes,
              image: {
                ...scene,
                [field]: {
                  toLang: "ja",
                  apiSlug: "replacement",
                  promptSlug: "new-prompt",
                }[field],
              },
            };
          await act(async () => root.render(<FileTranslatePage />));
          await step("翻译文本");
          expect(lib.translateFileText).toHaveBeenCalledTimes(2);
          expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
          expect(lib.translateFileText.mock.calls.at(-1)[0]).toBe(
            "source block"
          );
        } finally {
          mockSetting.fileTranslateSetting = savedScenes;
          if (api) {
            if (oldSignature === undefined) delete api.translationSignature;
            else api.translationSignature = oldSignature;
          }
        }
      }
    );
    test("ignore cache is temporary and forces image recognition and text translation", async () => {
      await setup();
      const cacheSwitch = () =>
        [...container.querySelectorAll('input[type="checkbox"]')].find(
          (input) => input.closest("label")?.textContent.includes("忽略缓存")
        );
      expect(cacheSwitch().checked).toBe(false);
      await step("布局与识别");
      expect(
        ops.recognizeFileImage.mock.calls.at(-1)[1].cacheMode
      ).toBeUndefined();
      await step("翻译文本");
      expect(lib.translateFileText).toHaveBeenCalledTimes(1);
      await step("翻译文本");
      expect(lib.translateFileText).toHaveBeenCalledTimes(1);
      expect(cacheSwitch().closest(".MuiCollapse-root")).not.toBeNull();
      await act(async () => cacheSwitch().click());
      await act(async () =>
        container.querySelector('button[aria-label="收起配置"]').click()
      );
      expect(
        container.querySelector('button[aria-label="展开配置"]')
      ).not.toBeNull();
      expect(cacheSwitch().checked).toBe(true);
      await act(async () =>
        container.querySelector('button[aria-label="展开配置"]').click()
      );
      expect(cacheSwitch().checked).toBe(true);
      await step("翻译文本");
      expect(lib.translateFileText.mock.calls.at(-1)[4].cacheMode).toBe(
        "refresh"
      );
      await step("布局与识别");
      expect(ops.recognizeFileImage.mock.calls.at(-1)[1].cacheMode).toBe(
        "refresh"
      );
      await setup();
      expect(cacheSwitch().checked).toBe(false);
    });

    test("stages reuse prior results, show source, copy/export source, and show persistent regions", async () => {
      await setup();
      await openMenu();
      expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("布局与识别").click());
      expect(button("原文").getAttribute("aria-pressed")).toBe("true");
      expect(container.textContent).toContain("source block");
      expect(lib.translateFileText).not.toHaveBeenCalled();
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      const img = container.querySelector('img[alt="原图预览"]');
      Object.defineProperties(img, {
        naturalWidth: { value: 200 },
        naturalHeight: { value: 100 },
      });
      await act(async () => img.dispatchEvent(new Event("load")));
      const text = [...container.querySelectorAll("span")].find(
        (item) => item.textContent === "source block"
      );
      await act(async () =>
        text.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      );
      expect(container.querySelector("polygon").getAttribute("points")).toBe(
        "10,20 100,20 100,60 10,60"
      );
      await act(async () =>
        text.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
      );
      expect(container.querySelector("polygon")).not.toBeNull();
      const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      const writeText = jest.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      const click = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function () {
          expect(this.download).toBe("sample-source.txt");
        });
      try {
        await act(async () => button("复制").click());
        expect(writeText).toHaveBeenCalledWith("source block");
        await act(async () =>
          [...container.querySelectorAll("button")]
            .find((item) => item.textContent.includes("下载") && !item.disabled)
            .click()
        );
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
      await step("布局与识别");
      expect(container.querySelector('img[alt="译图结果"]')).toBeNull();
      expect(container.textContent).not.toContain("translated block");
    });
    test("region selection filters translation, synthesis, display, copy and export while retaining all source text", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValueOnce({
        items: [
          { text: "selected first", poly },
          { text: "excluded second", poly },
          { text: "selected third", poly },
        ],
      });
      await step("布局与识别");
      await measurePreview();
      await act(async () =>
        regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(regions()[1].getAttribute("aria-pressed")).toBe("false");
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      let finishFirst;
      lib.translateFileText
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishFirst = resolve;
            })
        )
        .mockResolvedValueOnce("translated third");
      await act(async () => button("一键翻译").click());
      expect(lib.translateFileText.mock.calls.map((call) => call[0])).toEqual([
        "selected first",
        "selected third",
      ]);
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
      expect(regions()[0].getAttribute("aria-disabled")).toBe("true");
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
      await act(async () => finishFirst("translated first"));
      expect(
        lib.synthesizeTranslatedImage.mock.calls[0][1].map((row) => row.source)
      ).toEqual(["selected first", "selected third"]);
      expect(
        lib.synthesizeTranslatedImage.mock.calls[0][1].map((row) => row.target)
      ).toEqual(["translated first", "translated third"]);

      const originalClipboard = Object.getOwnPropertyDescriptor(
        navigator,
        "clipboard"
      );
      const writeText = jest.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
      const anchorClick = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      try {
        for (const [view, content] of [
          ["原文", "selected first\n\nexcluded second\n\nselected third"],
          ["译文", "translated first\n\ntranslated third"],
          [
            "双语",
            "selected first\ntranslated first\n\nselected third\ntranslated third",
          ],
        ]) {
          await act(async () => button(view).click());
          await act(async () => button("复制").click());
          expect(writeText).toHaveBeenLastCalledWith(content);
          const downloadButton = [...container.querySelectorAll("button")].find(
            (item) => item.textContent.includes("下载") && !item.disabled
          );
          await act(async () => downloadButton.click());
          const blob = URL.createObjectURL.mock.calls.at(-1)[0];
          const exported = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsText(blob);
          });
          expect(exported).toBe(content);
        }
        const resultCard = [
          ...container.querySelectorAll(".MuiCard-root"),
        ].find((card) => card.textContent.includes("翻译结果"));
        expect(resultCard.textContent).not.toContain("excluded second");
      } finally {
        anchorClick.mockRestore();
        if (originalClipboard)
          Object.defineProperty(navigator, "clipboard", originalClipboard);
        else delete navigator.clipboard;
      }
    });

    test("all deselected disables processing; hiding regions preserves selection; explicit recognition restores it", async () => {
      await setup();
      await step("布局与识别");
      await measurePreview();
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(button("一键翻译").disabled).toBe(true);
      expect(container.textContent).toContain("请至少选择一个文字区域");
      await act(async () => button("译图").click());
      expect(container.textContent).not.toContain("识别结果没有区域坐标");
      await openMenu();
      expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("布局与识别").click());
      expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      const regionSwitch = () =>
        [...container.querySelectorAll('input[type="checkbox"]')].find(
          (input) => input.closest("label")?.textContent.includes("布局线框")
        );
      await act(async () => regionSwitch().click());
      expect(regions()).toHaveLength(0);
      await act(async () => regionSwitch().click());
      expect(regions()[0].getAttribute("aria-pressed")).toBe("false");
      await act(async () =>
        regions()[0].dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      );
      expect(button("一键翻译").disabled).toBe(false);
      expect(regions()[0].getAttribute("aria-pressed")).toBe("true");
    });

    test("selection changes invalidate generated images and synthesis follows selected completion", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValueOnce({
        items: [
          { text: "first", poly },
          { text: "second", poly },
        ],
      });
      await step("布局与识别");
      await measurePreview();
      await act(async () =>
        regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      await act(async () => button("一键翻译").click());
      expect(container.querySelector('img[alt="译图结果"]')).not.toBeNull();
      await act(async () =>
        regions()[1].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      expect(container.querySelector('img[alt="译图结果"]')).toBeNull();
      await openMenu();
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("翻译文本").click());
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      await step("合成图片");
      expect(
        lib.synthesizeTranslatedImage.mock.calls
          .at(-1)[1]
          .map((row) => row.source)
      ).toEqual(["second"]);
      expect(lib.translateFileText).toHaveBeenCalledTimes(2);
    });

    test("recognition configuration changes discard old selection and cancel pending output", async () => {
      await setup();
      await step("布局与识别");
      await measurePreview();
      let finish;
      lib.translateFileText.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      await step("翻译文本");
      const service = mockSetting.transApis.find(
        (api) => api.apiSlug === "test-ocr"
      );
      service.modelRef = "replacement-model";
      try {
        await act(async () => root.render(<FileTranslatePage />));
        await act(async () => finish("stale target"));
        expect(container.textContent).not.toContain("stale target");
        expect(regions()).toHaveLength(0);
        await act(async () => button("一键翻译").click());
        expect(ops.recognizeFileImage).toHaveBeenCalledTimes(2);
      } finally {
        delete service.modelRef;
      }
    });

    test("mixed coordinate results always include unlocated text and disable image synthesis", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValueOnce({
        items: [
          { text: "located", poly },
          { text: "unlocated", poly: null },
        ],
      });
      await step("布局与识别");
      await measurePreview();
      expect(regions()).toHaveLength(1);
      await act(async () =>
        regions()[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      );
      await act(async () => button("一键翻译").click());
      expect(lib.translateFileText.mock.calls.map((call) => call[0])).toEqual([
        "unlocated",
      ]);
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
    });

    test("text-only recognition completes without synthesis", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValue({ text: "plain text" });
      await act(async () => button("一键翻译").click());
      expect(lib.translateFileText.mock.calls[0][0]).toBe("plain text");
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      expect(container.textContent).toContain("识别结果没有区域坐标");
      expect(container.textContent).toContain("无法通过线框选择");
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
      lib.translateFileText.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
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
      lib.synthesizeTranslatedImage.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      await act(async () => button("一键翻译").click());
      await upload("replacement.png");
      await act(async () => resolve(new Blob(["old image"])));
      expect(container.querySelector('img[alt="译图结果"]')).toBeNull();
      await openMenu();
      expect(menuItem("翻译文本").getAttribute("aria-disabled")).toBe("true");
    });
    test("recognition failure does not select another available service", async () => {
      mockSetting.transApis.push({
        apiSlug: "other",
        apiType: "LocalAI",
        modelRef: "paddleocr-vl-1.6-onnx-q8",
        device: "webgpu",
        enabledCapabilities: ["parseImage"],
      });
      try {
        await setup();
        ops.recognizeFileImage.mockRejectedValueOnce(
          new Error("selected recognition failed")
        );
        await act(async () => button("一键翻译").click());
        expect(container.textContent).toContain("selected recognition failed");
        expect(ops.recognizeFileImage).toHaveBeenCalledTimes(1);
        expect(lib.translateFileText).not.toHaveBeenCalled();
      } finally {
        mockSetting.transApis.pop();
      }
    });
    test("partial coordinates preserve text translation but disable image synthesis", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValueOnce({
        items: [
          { text: "located", poly },
          { text: "unlocated", poly: null },
        ],
      });
      await act(async () => button("一键翻译").click());
      expect(lib.translateFileText).toHaveBeenCalledTimes(2);
      expect(lib.synthesizeTranslatedImage).not.toHaveBeenCalled();
      await openMenu();
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
    });
    test("recognition failure stays failed after alert dismissal and resets on retry", async () => {
      await setup();
      ops.recognizeFileImage.mockRejectedValueOnce(
        new Error("Text result is required.")
      );
      await act(async () => button("一键翻译").click());
      expect(container.textContent).toContain("文本识别失败，请重试");
      expect(container.textContent).not.toContain("已就绪");
      await act(async () =>
        container.querySelector(".MuiAlert-action button").click()
      );
      expect(container.textContent).not.toContain("Text result is required.");
      for (const label of ["译图", "原文"]) {
        await act(async () => button(label).click());
        expect(container.textContent).toContain("文本识别失败，请重试");
        expect(container.textContent).not.toContain("已就绪");
      }
      await step("布局与识别");
      expect(container.textContent).toContain("source block");
      expect(container.textContent).not.toContain("文本识别失败");
    });
    test("replacement and cancellation discard late recognition failures", async () => {
      await setup();
      ops.recognizeFileImage.mockRejectedValueOnce(
        new Error("recognition failed")
      );
      await step("布局与识别");
      await upload("replacement.png");
      expect(container.textContent).toContain("已就绪");
      expect(container.textContent).not.toContain("文本识别失败");
      for (const replace of [false, true]) {
        let reject;
        ops.recognizeFileImage.mockImplementationOnce(
          () =>
            new Promise((_, fail) => {
              reject = fail;
            })
        );
        await act(async () => button("一键翻译").click());
        if (replace) await upload("new.png");
        else await act(async () => button("取消").click());
        await act(async () => reject(new Error("late failure")));
        expect(container.textContent).not.toContain("late failure");
        expect(container.textContent).not.toContain("文本识别失败");
      }
    });
    test("empty recognition is a failure rather than ready", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValueOnce({ text: "", items: [] });
      await act(async () => button("一键翻译").click());
      expect(container.textContent).toContain("图片识别返回空结果");
      expect(container.textContent).toContain("文本识别失败，请重试");
      expect(container.textContent).not.toContain("已就绪");
      expect(lib.translateFileText).not.toHaveBeenCalled();
    });
    test("translation failure preserves source and completed rows", async () => {
      await setup();
      ops.recognizeFileImage.mockResolvedValue({
        items: [
          { text: "first", poly },
          { text: "second", poly },
        ],
      });
      lib.translateFileText
        .mockResolvedValueOnce("first translated")
        .mockRejectedValueOnce(new Error("service failed"));
      await act(async () => button("一键翻译").click());
      expect(container.textContent).toContain("service failed");
      expect(container.textContent).toContain("first translated");
      await openMenu();
      expect(menuItem("合成图片").getAttribute("aria-disabled")).toBe("true");
      await act(async () => menuItem("翻译文本").click());
      expect(lib.translateFileText).toHaveBeenCalledTimes(3);
      expect(lib.translateFileText.mock.calls.at(-1)[4]).toMatchObject({
        cacheMode: "refresh",
      });
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

    // 验证 Logo 链接指向主页
    const expectedHomepage =
      process.env.REACT_APP_SITEURL || "https://kiss-translator.rayjar.com";
    const logoLink = container.querySelector(`a[href="${expectedHomepage}"]`);
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
    expect(container.textContent).toContain("一键翻译");
    expect(container.textContent).toContain("Aa");
  });

  test("换书时自动中止正在运行的翻译任务并防止旧任务回调写入状态（修复问题 1）", async () => {
    const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
    const opfXml1 = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book One</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`;
    const uint8_1 = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(containerXml),
      "OEBPS/content.opf": fflate.strToU8(opfXml1),
      "OEBPS/ch1.xhtml": fflate.strToU8(
        `<html><body><p>Book 1 Content</p></body></html>`
      ),
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

    const translateBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("试译当前章节")
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
      "OEBPS/ch1.xhtml": fflate.strToU8(
        `<html><body><p>Book 2 Content</p></body></html>`
      ),
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
      "OEBPS/ch1.xhtml": fflate.strToU8(
        `<html><body><p>Slow Content</p></body></html>`
      ),
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
      "OEBPS/ch1.xhtml": fflate.strToU8(
        `<html><body><p>Fast Content</p></body></html>`
      ),
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
    const mockFileA = new File(["Content A"], "fileA.txt", {
      type: "text/plain",
    });
    mockFileA.text = async () => "Content A";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [mockFileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 2. 点击翻译，启动文件 A 翻译
    const translateBtnA = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("一键翻译")
    );
    expect(translateBtnA).toBeDefined();

    await act(async () => {
      translateBtnA.click();
    });

    // 确认旧任务已启动
    expect(oldSignal).toBeDefined();
    expect(oldSignal.aborted).toBe(false);

    // 3. 换入新文件 B
    const mockFileB = new File(["Content B"], "fileB.txt", {
      type: "text/plain",
    });
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
    const translateBtnB = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("一键翻译")
    );
    await act(async () => {
      translateBtnB.click();
    });

    // 新任务已启动
    expect(newSignal).toBeDefined();
    expect(newSignal.aborted).toBe(false);

    // 此时页面上应当存在“取消”按钮（因为处于 busy 状态）
    const cancelBtnBefore = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("取消"));
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
    const cancelBtnAfter = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("取消"));
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
    const menuItems = Array.from(
      document.querySelectorAll(".MuiMenuItem-root")
    );
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
    const mockFileA = new File(["Slow Content A"], "fileA.txt", {
      type: "text/plain",
    });
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
    const mockFileB = new File(["Fast Content B"], "fileB.txt", {
      type: "text/plain",
    });
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

    translateTxt.mockImplementationOnce(
      (content, scene, setting, signal, onProgress) => {
        oldSignal = signal;
        oldProgressCb = onProgress;
        return oldPromise;
      }
    );

    await act(async () => {
      root.render(<FileTranslatePage />);
    });

    const fileInput = container.querySelector('input[type="file"]');
    const mockFile = new File(["Initial Content"], "fileA.txt", {
      type: "text/plain",
    });
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
    const translateBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("一键翻译")
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
      const deletePropsKey = Object.keys(deleteIcon).find((k) =>
        k.startsWith("__reactProps$")
      );
      if (deletePropsKey && deleteIcon[deletePropsKey]?.onClick) {
        deleteIcon[deletePropsKey].onClick({ stopPropagation: () => {} });
      } else {
        const chip = container.querySelector(".MuiChip-root");
        const chipPropsKey =
          chip && Object.keys(chip).find((k) => k.startsWith("__reactProps$"));
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
    const translateBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("试译当前章节")
    );
    expect(translateBtn).toBeDefined();

    await act(async () => {
      translateBtn.click();
    });

    // 模拟流式写入了半截未完成译文
    await act(async () => {
      progressCb?.(1, 2, {
        partialBilingualHtml:
          "<p>Original Chapter Content</p><p>Partial Trans Text</p>",
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
    const mockFile = new File(
      [fflate.zipSync(zipData)],
      "malicious-book.epub",
      {
        type: "application/epub+zip",
      }
    );
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

    const exportChapterItem = Array.from(
      document.querySelectorAll(".MuiMenuItem-root")
    ).find((item) => item.textContent?.includes("导出当前章节 HTML"));
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
    const fileA = new File(["Content of File A"], "fileA.txt", {
      type: "text/plain",
    });
    fileA.text = async () => "Content of File A";

    await act(async () => {
      Object.defineProperty(fileInput, "files", {
        value: [fileA],
        configurable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Content of File A");
    const translateBtnBefore = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("一键翻译"));
    expect(translateBtnBefore).toBeDefined();
    expect(translateBtnBefore.disabled).toBe(false);

    // 2. 用户选入慢速大文件 B（挂起尚未读取完成）
    let resolveReadB;
    const slowReadPromise = new Promise((resolve) => {
      resolveReadB = resolve;
    });
    const fileB = new File(["Content of Big File B"], "bigFileB.txt", {
      type: "text/plain",
    });
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
    const translateBtnDuring = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("一键翻译"));
    // 翻译按钮处于不可用/禁用状态，无法用旧文件启动翻译
    expect(translateBtnDuring.disabled).toBe(true);

    // 4. 文件 B 慢速读取完成
    await act(async () => {
      resolveReadB("Content of Big File B");
    });

    // 呈现新文件 B 的内容，且翻译按钮恢复可用
    expect(container.textContent).toContain("Content of Big File B");
    const translateBtnAfter = Array.from(
      container.querySelectorAll("button")
    ).find((b) => b.textContent?.includes("一键翻译"));
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
      b.textContent?.includes("一键翻译")
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

  test.each([{}, { parseMode: "fast", toLang: "en", apiSlug: "primary" }])(
    "PDF 部分配置 %j 补齐语言、翻译服务和 DOC 设置",
    async (partial) => {
      const original = mockSetting.fileTranslateSetting.pdf;
      mockSetting.fileTranslateSetting.pdf = partial;
      try {
        await act(async () => root.render(<FileTranslatePage />));
        const input = container.querySelector('input[type="file"]');
        await act(async () => {
          Object.defineProperty(input, "files", {
            value: [
              new File(["pdf"], "defaults.pdf", { type: "application/pdf" }),
            ],
            configurable: true,
          });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        const valueFor = (label) => {
          const field = Array.from(
            container.querySelectorAll(".MuiFormControl-root")
          ).find((node) => node.querySelector("label")?.textContent === label);
          return field?.querySelector("input")?.value;
        };
        expect(valueFor("源语言")).toBe("auto");
        expect(valueFor("目标语言")).toBe(partial.toLang || "zh-CN");
        expect(valueFor("翻译服务")).toBe(
          partial.apiSlug || partial.apiSlugs?.[0] || "Microsoft"
        );
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

    const layoutServiceField = labels
      .find((label) => label.textContent === "界面分析服务")
      .closest(".MuiFormControl-root");
    await act(async () => {
      layoutServiceField
        .querySelector('[role="combobox"]')
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      document
        .querySelector('[role="option"][data-value="gpu-layout"]')
        .click();
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
    // 菜单立即执行，主按钮仍然执行一键翻译。
    expect(mockPdfWorkspaceActions.detectLayout).toHaveBeenCalledTimes(1);
    expect(translateBtn.textContent).toBe("一键翻译");

    // 单步执行后点击主按钮不会重复执行该步骤。
    await act(async () => {
      translateBtn.click();
    });
    expect(mockPdfWorkspaceActions.detectLayout).toHaveBeenCalledTimes(1);
    expect(
      mockPdfWorkspaceActions.oneClickTranslate.mock.calls.length +
        mockPdfWorkspaceActions.parseAndTranslate.mock.calls.length
    ).toBe(2);
  });

  test("PDF 模式下未配置界面分析服务时，下拉菜单中布局检测置灰禁用", async () => {
    const originalApis = mockSetting.transApis;
    mockSetting.transApis = originalApis.filter(
      (api) => !api.enabledCapabilities?.includes("analyzeLayout")
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

  test("EPUB width survives settings echoes, reconnect and a new mount", async () => {
    const originalScenes = mockSetting.fileTranslateSetting;
    mockSetting.fileTranslateSetting = {
      ...originalScenes,
      epub: {
        apiSlug: "primary",
        fromLang: "auto",
        toLang: "zh-CN",
        promptSlug: "",
        readerPreferences: {
          fontSize: 20,
          fontFamily: "serif",
          themeId: "sepia",
        },
      },
    };
    mockUpdateChild.mockImplementation((scenes) => {
      mockSetting.fileTranslateSetting = scenes;
    });
    const zip = fflate.zipSync({
      mimetype: fflate.strToU8("application/epub+zip"),
      "META-INF/container.xml": fflate.strToU8(
        '<container><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>'
      ),
      "content.opf": fflate.strToU8(
        '<package xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Width Test</dc:title></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>'
      ),
      "ch1.xhtml": fflate.strToU8(
        '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Width test text</p></body></html>'
      ),
    });
    const file = new File([zip], "width.epub", {
      type: "application/epub+zip",
    });
    file.arrayBuffer = async () => zip.buffer;
    const loadFile = async () => {
      const input = container.querySelector('input[type="file"]');
      await act(async () => {
        Object.defineProperty(input, "files", {
          value: [file],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    const openPreferences = async () => {
      const button = [...container.querySelectorAll("button")].find((item) =>
        item.textContent.includes("Aa")
      );
      await act(async () => button.click());
    };
    const rerender = () => act(async () => root.render(<FileTranslatePage />));
    try {
      await rerender();
      await loadFile();
      await openPreferences();
      expect(document.body.textContent).toContain("840 px");
      for (const [label, width] of [
        ["W+", 880],
        ["W+", 920],
        ["W-", 880],
        ["窄版 (680)", 680],
        ["适中 (840)", 840],
        ["宽版 (1020)", 1020],
      ]) {
        const button = [...document.querySelectorAll("button")].find(
          (item) => item.textContent === label
        );
        await act(async () => button.click());
        // Simulate the backend returning a fresh copy of the saved preferences.
        mockSetting.fileTranslateSetting = JSON.parse(
          JSON.stringify(mockSetting.fileTranslateSetting)
        );
        await rerender();
        expect(document.body.textContent).toContain(`${width} px`);
        expect(mockSetting.fileTranslateSetting.epub.readerPreferences).toEqual(
          {
            pageWidth: width,
            fontSize: 20,
            fontFamily: "serif",
            themeId: "sepia",
          }
        );
        expect(
          getComputedStyle(container.querySelector(".kt-epub-reader-body"))
            .maxWidth
        ).toBe(`${width}px`);
      }
      mockConnected = false;
      await rerender();
      mockConnected = true;
      await rerender();
      expect(document.body.textContent).toContain("1020 px");
      act(() => root.unmount());
      root = createRoot(container);
      await rerender();
      await loadFile();
      await openPreferences();
      expect(document.body.textContent).toContain("1020 px");
    } finally {
      mockSetting.fileTranslateSetting = originalScenes;
      mockUpdateChild.mockReset();
    }
  });
});
