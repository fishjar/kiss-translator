import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import SubtitleSegmentationPlayground from "./SubtitleSegmentationPlayground";
import { handleSubtitle } from "../../apis/trans";
import { I18N, UI_LANGS } from "../../config/i18n";
import { downloadBlobFile } from "../../libs/utils";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockConfirm = jest.fn(() => Promise.resolve(true));

jest.mock("../../apis/trans", () => ({
  detectSubtitleProtocol: () => "boundary-v3",
  handleSubtitle: jest.fn(),
}));

jest.mock("../../hooks/Confirm", () => ({
  useConfirm: () => mockConfirm,
}));

jest.mock("../../hooks/I18n", () => ({
  // 组件测试固定使用中文备用文案，避免依赖完整的设置上下文。
  useI18n:
    () =>
    (_, fallback = "") =>
      fallback,
}));

jest.mock("../../libs/utils", () => {
  const actual = jest.requireActual("../../libs/utils");
  return { ...actual, downloadBlobFile: jest.fn() };
});

/** 等待 React effect 和异步事件处理器完成一次状态提交。 */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 通过 MUI 下拉菜单选择本地字幕的明确源语言。 */
async function selectSourceLanguage(container, language) {
  const languageSelect = container.querySelectorAll('[role="combobox"]')[1];
  await act(async () => {
    languageSelect.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    );
    await Promise.resolve();
  });
  const option = document.body.querySelector(`[data-value="${language}"]`);
  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function renderPlayground({ subtitleSetting, transApis = [] } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <SubtitleSegmentationPlayground
        subtitleSetting={
          subtitleSetting || {
            segSlug: "-",
            useAlgorithmBreaker: "rule",
            longSentenceThreshold: 120,
            toLang: "zh-CN",
          }
        }
        transApis={transApis}
        prompts={[]}
      />
    );
  });
  return { container, root };
}

describe("SubtitleSegmentationPlayground", () => {
  const source = JSON.stringify({
    lang: "en",
    events: [
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: "Hello world." }],
      },
    ],
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    handleSubtitle.mockReset();
    mockConfirm.mockClear();
    mockConfirm.mockResolvedValue(true);
    downloadBlobFile.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1, samples: [] }),
    });
  });

  test("covers every page copy key in all supported UI languages", () => {
    // 从实际组件提取翻译键，防止后续新增文案时只补中文而遗漏其他语言。
    const sourceFiles = [
      "SubtitleSegmentationPlayground.js",
      "Playground.js",
    ].map((fileName) =>
      fs.readFileSync(path.join(__dirname, fileName), "utf8")
    );
    const keyPattern =
      /["'](subtitle_playground_[a-z0-9_]+|playground_text_translation|subtitle_segmentation)["']/g;
    const keys = new Set(["cancel"]);
    for (const sourceFile of sourceFiles) {
      for (const match of sourceFile.matchAll(keyPattern)) keys.add(match[1]);
    }

    for (const key of keys) {
      for (const [language] of UI_LANGS) {
        expect(I18N[key]?.[language]).toEqual(expect.any(String));
        expect(I18N[key][language]).not.toBe("");
      }
    }
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("uploads a sample, runs rule segmentation, switches VTT and downloads it", async () => {
    const { container, root } = renderPlayground();
    await flushEffects();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/subtitle-samples/index.json"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    const input = container.querySelector('input[type="file"]');
    const file = new File([source], "sample.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: async () => source });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    let runButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent.includes("运行测试")
    );
    expect(runButton.disabled).toBe(false);
    expect(container.textContent).not.toContain("不支持 AutoDetect");
    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("不支持 AutoDetect");
    await selectSourceLanguage(container, "en");
    runButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent.includes("运行测试")
    );
    expect(runButton.disabled).toBe(false);
    expect(container.textContent).not.toContain("不支持 AutoDetect");
    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("断句统计信息");
    expect(container.textContent).toContain("已过滤非语音片段");
    expect(container.textContent).toContain("100%");

    const vttButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "VTT"
    );
    const sourceArea = container.querySelector(
      'textarea[aria-label="原始字幕 JSON"]'
    );
    const resultArea = container.querySelector(
      'textarea[aria-label="断句结果"]'
    );
    expect(sourceArea.getAttribute("rows")).toBe("5");
    expect(resultArea.getAttribute("rows")).toBe("5");
    expect(container.textContent.indexOf("当前生效的断句配置")).toBeLessThan(
      container.textContent.indexOf("内置字幕样本")
    );
    // 切换和下载控件应与结果文本框处于同一浮动容器内。
    expect(
      resultArea
        .closest(".MuiFormControl-root")
        .parentElement.contains(vttButton)
    ).toBe(true);
    await act(async () => {
      vttButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      [...container.querySelectorAll("textarea")].some((area) =>
        area.value.includes("WEBVTT")
      )
    ).toBe(true);

    const downloadButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "下载"
    );
    act(() => {
      downloadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(downloadBlobFile).toHaveBeenCalledWith(
      expect.stringContaining("WEBVTT"),
      expect.stringMatching(/^sample-rule-.*\.vtt$/)
    );

    act(() => root.unmount());
  });

  test("uses useConfirm and previews completed AI cues while streaming", async () => {
    let resolveResponse;
    const streamedCue = {
      start: 0,
      end: 1000,
      text: "Hello world.",
      translation: "你好，世界。",
      _si: 0,
      _ei: 0,
    };
    handleSubtitle.mockImplementation(({ onSubtitleChunk }) => {
      onSubtitleChunk({ subtitles: [streamedCue], isFinal: false });
      return new Promise((resolve) => {
        resolveResponse = resolve;
      });
    });
    const { container, root } = renderPlayground({
      subtitleSetting: {
        segSlug: "test-ai",
        chunkLength: 2000,
        longSentenceThreshold: 120,
        toLang: "zh-CN",
      },
      transApis: [
        {
          apiSlug: "test-ai",
          apiName: "测试 AI",
          apiType: "openai",
          model: "test-model",
          useStream: true,
        },
      ],
    });
    await flushEffects();
    expect(container.textContent).toContain("boundary-v3");
    expect(container.textContent).toContain(
      "当前 AI Chunk 长度高于推荐默认值 1000"
    );

    const input = container.querySelector('input[type="file"]');
    const file = new File([source], "stream.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", { value: async () => source });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    const runButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent.includes("运行测试")
    );
    // AI 模式允许本地字幕保留 AutoDetect，不应阻止发起测试。
    expect(runButton.disabled).toBe(false);
    await act(async () => {
      runButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "发送 AI 断句请求",
        confirmText: "继续",
      })
    );
    expect(
      container.querySelector('textarea[aria-label="断句结果"]').value
    ).toContain("Hello world.");
    expect(container.textContent).not.toContain("断句统计信息");
    expect(
      container
        .querySelector('[data-testid="segmentation-actions"]')
        .contains(
          container.querySelector('[data-testid="segmentation-progress"]')
        )
    ).toBe(true);

    await act(async () => {
      resolveResponse([streamedCue]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("断句统计信息");
    expect(container.textContent).not.toContain("当前结果已过期");

    act(() => root.unmount());
  });
});
