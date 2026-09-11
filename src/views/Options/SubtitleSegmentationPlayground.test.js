import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";
import SubtitleSegmentationPlayground from "./SubtitleSegmentationPlayground";
import { handleSubtitle } from "../../apis/trans";
import { I18N, UI_LANGS } from "../../config/i18n";
import { MIN_RESIZE_HEIGHT_MEDIUM } from "../../components/resizeBounds";
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

jest.mock("../../hooks/I18n", () => {
  const i18nModule = jest.requireActual("../../config/i18n");
  return {
    useI18n: () => (key) => i18nModule.I18N[key]?.["zh"] || "",
  };
});

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

/**
 * 构造一个带 clientY/pointerId 的通用指针事件。
 * @param {string} type 事件类型（如 pointerdown/pointermove）。
 * @param {Object} opts 可选的 clientY 与 pointerId。
 * @returns {Event} 可被 React 与 jsdom 识别的指针事件。
 */
function makePointerEvent(type, { clientY = 0, pointerId = 1 } = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clientY", { value: clientY });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event;
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
    // 输入框使用 minRows={5}（可自动增长到 maxRows=10）。MUI InputBase 显式传
    // rows:undefined 覆盖了 TextareaAutosize 内部的 rows={minRows}，DOM 上不再有
    // rows 属性（高度由 TextareaAutosize 的 style.height 决定），只断言元素存在。
    expect(sourceArea).not.toBeNull();
    expect(resultArea).not.toBeNull();
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

  test("resize handles drag to control textarea height on both fields", async () => {
    // 冒烟回归锁：两个输入框的手柄拖动 → 高度跟随。此前本文件没有任何
    // resize 用例，抽 ResizableSubtitleField 包装组件后若引入回归将无测试可拦。
    const { container, root } = renderPlayground();
    await flushEffects();

    // 手柄静态常显（无 focus-gating）：无需聚焦即可命中。
    const sourceHandle = container.querySelector(
      '[data-testid="segmentation-source-resize-handle"]'
    );
    const resultHandle = container.querySelector(
      '[data-testid="segmentation-result-resize-handle"]'
    );
    const sourceNotch = container.querySelector(
      '[data-testid="segmentation-source-resize-notch"]'
    );
    expect(sourceHandle).not.toBeNull();
    expect(resultHandle).not.toBeNull();
    expect(sourceNotch).not.toBeNull();

    const sourceArea = container.querySelector(
      'textarea[aria-label="原始字幕 JSON"]'
    );
    const sourceField = sourceArea.closest(".MuiInputBase-root");
    Object.defineProperty(sourceField, "offsetHeight", {
      configurable: true,
      value: 100,
    });

    // 未拖动：根节点不持有受控高度，textarea 不持有受控 maxHeight。
    expect(sourceField.style.height).toBe("");
    expect(sourceArea.style.maxHeight).toBe("");

    // 6px 内轻触不进入高度调整；超过阈值后受控像素高度落到 InputBase 根节点
    // （与 Selection 根节点高度模型对齐）。
    await act(async () => {
      sourceHandle.dispatchEvent(
        makePointerEvent("pointerdown", { clientY: 0 })
      );
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 4 }));
    });
    expect(sourceField.style.height).toBe("");
    expect(sourceArea.style.maxHeight).toBe("");
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    expect(sourceField.style.height).toBe("120px");
    // 根节点不持有受控 overflowY（可见 textarea 的强制滚动经 scoped sx 规则）
    expect(sourceField.style.overflowY).toBe("");
    expect(sourceArea.style.maxHeight).toBe("");

    // 松手结束会话，后续移动不再改变高度。
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 20 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 80 }));
    });
    expect(sourceField.style.height).toBe("120px");
    expect(sourceArea.style.maxHeight).toBe("");

    // 结果框手柄同样可拖（同一包装组件的第二个调用点）。
    const resultArea = container.querySelector(
      'textarea[aria-label="断句结果"]'
    );
    const resultField = resultArea.closest(".MuiInputBase-root");
    Object.defineProperty(resultField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    await act(async () => {
      resultHandle.dispatchEvent(
        makePointerEvent("pointerdown", { clientY: 0 })
      );
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: -60 }));
    });
    // 向上拖出初始高度：不低于 medium 最小高度（100 - 60 = 40 → 56）。
    expect(resultField.style.height).toBe(`${MIN_RESIZE_HEIGHT_MEDIUM}px`);
    expect(resultArea.style.maxHeight).toBe("");
    expect(resultField.style.overflowY).toBe("");
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: -60 }));
    });

    act(() => root.unmount());
  });

  test("pixel-precise drag height lands on the InputBase root and carries into the next drag", async () => {
    // 锁定 Task 3 的精确像素契约：拖动高度不再量化成整数 minRows 行，
    // 连续值逐像素生效，且第二轮以第一次结束值为基线（jsdom 仅验证状态值与
    // 样式归属，不证明 TextareaAutosize 的真实浏览器逐像素视觉连续）。
    const { container, root } = renderPlayground();
    await flushEffects();

    const sourceArea = container.querySelector(
      'textarea[aria-label="原始字幕 JSON"]'
    );
    const sourceField = sourceArea.closest(".MuiInputBase-root");
    Object.defineProperty(sourceField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="segmentation-source-resize-handle"]'
    );

    // 未拖动：根节点不持有受控像素高度。
    expect(sourceField.style.height).toBe("");

    // 突破 6px 阈值后，高度连续值 107 → 101 → 102 逐像素生效（不再量化整行）。
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 7 }));
    });
    expect(sourceField.style.height).toBe("107px");
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 1 }));
    });
    expect(sourceField.style.height).toBe("101px");
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 2 }));
    });
    expect(sourceField.style.height).toBe("102px");

    // 受控像素高度落在 .MuiInputBase-root（可见根节点），根节点不持有受控
    // overflowY（可见 textarea 的强制滚动经 scoped sx 规则承载）。
    expect(sourceField.style.alignItems).toBe("flex-start");
    expect(sourceField.style.overflowY).toBe("");
    expect(sourceArea.style.maxHeight).toBe("");

    // 情感样式表存在 scoped 强制滚动规则（`& textarea:not([aria-hidden=...])`
    // 匹配 overflow: auto !important）
    const emotionCss = Array.from(
      document.querySelectorAll("style[data-emotion]")
    )
      .flatMap((tag) => {
        const rules = tag.sheet && tag.sheet.cssRules;
        if (rules && rules.length) {
          return Array.from(rules).map((r) => r.cssText || "");
        }
        return [tag.textContent || ""];
      })
      .join("\n");
    expect(emotionCss).toMatch(
      /textarea:not\(\[aria-hidden=['"]true['"]\]\)\s*\{[^}]*overflow:\s*auto\s*!important/
    );

    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 2 }));
    });

    // 第二轮拖动以第一次结束值 102px 为基线；下拖穿越到 medium 最小高度。
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: -62 }));
    });
    expect(sourceField.style.height).toBe(`${MIN_RESIZE_HEIGHT_MEDIUM}px`);
    expect(sourceArea.style.maxHeight).toBe("");

    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: -62 }));
    });
    act(() => root.unmount());
  });

  test("playground handles floor at the medium minimum height (aria-valuemin)", async () => {
    const { container, root } = renderPlayground();
    await flushEffects();

    const sourceHandle = container.querySelector(
      '[data-testid="segmentation-source-resize-handle"]'
    );
    const resultHandle = container.querySelector(
      '[data-testid="segmentation-result-resize-handle"]'
    );
    expect(sourceHandle).not.toBeNull();
    expect(resultHandle).not.toBeNull();
    expect(sourceHandle.getAttribute("aria-valuemin")).toBe(
      String(MIN_RESIZE_HEIGHT_MEDIUM)
    );
    expect(resultHandle.getAttribute("aria-valuemin")).toBe(
      String(MIN_RESIZE_HEIGHT_MEDIUM)
    );

    act(() => root.unmount());
  });

  test("uncontrolled aria-valuenow publishes the raw measured height below the medium floor", async () => {
    const { container, root } = renderPlayground();
    await flushEffects();

    const sourceArea = container.querySelector(
      'textarea[aria-label="原始字幕 JSON"]'
    );
    const sourceField = sourceArea.closest(".MuiInputBase-root");
    Object.defineProperty(sourceField, "offsetHeight", {
      configurable: true,
      value: 40,
    });
    const handle = container.querySelector(
      '[data-testid="segmentation-source-resize-handle"]'
    );
    // stub 发生在测量 layout effect 之后：jsdom 无 ResizeObserver，须显式派发
    // resize 强制重测（schedule → 微任务 → applyMeasured 重读 offsetHeight）。
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
      await Promise.resolve();
    });
    // 实测值低于 medium 下界 56 时仍播报原始实测值，不得被抬成 56（Z1）
    expect(handle.getAttribute("aria-valuenow")).toBe("40");
    expect(handle.getAttribute("aria-valuemin")).toBe(
      String(MIN_RESIZE_HEIGHT_MEDIUM)
    );

    act(() => root.unmount());
  });
});
