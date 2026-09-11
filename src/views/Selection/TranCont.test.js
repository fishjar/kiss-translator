import { act } from "react";
import { createRoot } from "react-dom/client";
import TranCont, {
  CONTROL_HEIGHT,
  CONTROL_CENTER_FROM_RIGHT,
  NOTCH_STRIP_HEIGHT,
  NOTCH_HORIZONTAL_PAD,
} from "./TranCont";
import { apiTranslate } from "../../apis";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiTranslate: jest.fn(),
}));

jest.mock("../../config", () => ({
  API_SPE_TYPES: {
    ai: new Set(["OpenAI"]),
    stream: new Set(["OpenAI"]),
  },
  OPT_TRANS_BUILTINAI: "BuiltinAI",
  OPT_TRANS_GOOGLE: "Google",
  OPT_TRANS_GOOGLE_2: "Google2",
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => jest.requireActual("../../config/i18n").newI18n("en"),
}));

jest.mock("./CopyBtn", () => {
  const React = require("react");

  return ({ text }) =>
    React.createElement(
      "button",
      { type: "button", "data-copy-text": text },
      "copy"
    );
});

/**
 * 创建一个可由测试主动 resolve/reject 的 Promise。
 *
 * @returns {{promise: Promise<unknown>, resolve: Function, reject: Function}} 可控 Promise 句柄。
 */
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * 将 React effect 与 Promise 微任务推进到稳定状态。
 *
 * @returns {Promise<void>} 等待队列清空的 Promise。
 */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * 构造 prefers-reduced-motion 的 matchMedia stub。
 *
 * @param {boolean} matches 是否开启"减少动态效果"。
 * @returns {Function} 可赋给 window.matchMedia 的 jest mock。
 */
function matchMediaStub(matches) {
  return jest.fn().mockReturnValue({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  });
}

/**
 * 收集当前 document.styleSheets 中所有 CSS 规则。
 *
 * @returns {Array<CSSRule>} 全部规则（跨源样式表读取失败时跳过）。
 */
function collectRules() {
  return Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules);
    } catch {
      return [];
    }
  });
}

/**
 * 读取所有 Emotion 样式表规则文本（speedy 模式下规则通过 insertRule 写入
 * sheet.cssRules，textContent 为空；两者优先读取）。
 *
 * @returns {string} 合并后的 CSS 文本。
 */
function emotionCssText() {
  const tags = Array.from(document.querySelectorAll("style[data-emotion]"));
  return tags
    .flatMap((tag) => {
      const rules = tag.sheet && tag.sheet.cssRules;
      if (rules && rules.length) {
        return Array.from(rules).map((r) => r.cssText || "");
      }
      return [tag.textContent || ""];
    })
    .join("\n");
}

const baseApiSetting = {
  apiSlug: "openai",
  apiName: "OpenAI",
  apiType: "OpenAI",
  useStream: true,
  useBatchFetch: true,
  streamRenderMode: "realtime",
};

const google2ApiSetting = {
  ...baseApiSetting,
  apiSlug: "google2",
  apiName: "Google2",
  apiType: "Google2",
  useStream: false,
};

const googleApiSetting = {
  ...baseApiSetting,
  apiSlug: "google",
  apiName: "Google",
  apiType: "Google",
  useStream: false,
};

const builtinApiSetting = {
  ...baseApiSetting,
  apiSlug: "builtinai",
  apiName: "BuiltinAI",
  apiType: "BuiltinAI",
  useStream: false,
};

const microsoftApiSetting = {
  ...baseApiSetting,
  apiSlug: "microsoft",
  apiName: "Microsoft",
  apiType: "Microsoft",
  useStream: false,
};

/**
 * 渲染划词翻译结果组件。
 *
 * @param {Object} props 覆盖默认组件参数。
 * @returns {{container: HTMLElement, root: Object}} React 根节点与容器。
 */
function renderTranCont(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TranCont
        text="hello"
        fromLang="auto"
        toLang="zh-CN"
        apiSlug="openai"
        transApis={[baseApiSetting]}
        {...props}
      />
    );
  });

  return { container, root };
}

describe("TranCont", () => {
  beforeEach(() => {
    apiTranslate.mockReset();
    document.body.innerHTML = "";
  });

  test("renders streaming chunks before the final translation", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea.value).toBe("");

    await act(async () => {
      // 模拟底层 SSE 增量返回，输出框应立即展示已经到达的部分译文。
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "阶段译文",
        isComplete: false,
      });
    });
    expect(textarea.value).toBe("阶段译文");

    await act(async () => {
      deferred.resolve({ trText: "最终译文" });
      await deferred.promise;
    });
    expect(textarea.value).toBe("最终译文");

    act(() => {
      root.unmount();
    });
  });

  test("clears streamed text when the final response identifies the same language", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont({ translateVariants: false });
    await flushEffects();
    const textarea = container.querySelector("textarea");

    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "临时译文",
        isComplete: false,
      });
    });
    expect(textarea.value).toBe("临时译文");

    await act(async () => {
      deferred.resolve({ trText: "最终译文", isSame: true });
      await deferred.promise;
    });
    expect(textarea.value).toBe("");

    act(() => root.unmount());
  });

  test("requests plain text without provider-specific normalization", async () => {
    apiTranslate.mockResolvedValueOnce({
      trText: 'First isn\'t "plain" & simple\n\nSecond\nThird\nFourth',
    });

    const { container, root } = renderTranCont({
      text: "First\n\nSecond\r\nThird\rFourth",
      apiSlug: "google2",
      transApis: [google2ApiSetting],
    });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        text: "First\n\nSecond\r\nThird\rFourth",
        textFormat: "text",
      })
    );
    const expectedText =
      'First isn\'t "plain" & simple\n\nSecond\nThird\nFourth';
    expect(container.querySelector("textarea").value).toBe(expectedText);
    // 聚焦后复制按钮才显示
    act(() => {
      container.querySelector("textarea").focus();
    });
    expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
      expectedText
    );

    act(() => {
      root.unmount();
    });
  });

  test("removes whitespace around Google line breaks", async () => {
    apiTranslate.mockResolvedValueOnce({
      trText: "First sentence. \n\n And you?\r\n\tWhat about her?",
    });

    const { container, root } = renderTranCont({
      text: "第一句。\n\n你呢？\n她呢？",
      apiSlug: "google",
      transApis: [googleApiSetting],
    });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].text).toBe(
      "第一句。\n\n你呢？\n她呢？"
    );
    expect(container.querySelector("textarea").value).toBe(
      "First sentence.\n\nAnd you?\nWhat about her?"
    );

    act(() => {
      root.unmount();
    });
  });

  test("does not normalize HTML entities or line breaks for other APIs", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "A&amp;B<br>C" });

    const { container, root } = renderTranCont({ text: "A\nB" });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].text).toBe("A\nB");
    expect(container.querySelector("textarea").value).toBe("A&amp;B<br>C");

    act(() => {
      root.unmount();
    });
  });

  test("restores escaped line breaks from AI when the source has line breaks", async () => {
    apiTranslate.mockResolvedValueOnce({
      trText: "First\\n\\nSecond\\r\\nThird",
    });

    const { container, root } = renderTranCont({
      text: "First\n\nSecond\nThird",
    });
    await flushEffects();

    expect(container.querySelector("textarea").value).toBe(
      "First\n\nSecond\nThird"
    );

    act(() => {
      root.unmount();
    });
  });

  test("keeps real AI line breaks and escaped text without multiline source unchanged", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "First\n\nSecond" });

    const first = renderTranCont({ text: "First\n\nSecond" });
    await flushEffects();
    expect(first.container.querySelector("textarea").value).toBe(
      "First\n\nSecond"
    );
    act(() => {
      first.root.unmount();
    });

    apiTranslate.mockResolvedValueOnce({ trText: "Use \\n in code" });
    const second = renderTranCont({ text: "Use a newline escape in code" });
    await flushEffects();
    expect(second.container.querySelector("textarea").value).toBe(
      "Use \\n in code"
    );
    act(() => {
      second.root.unmount();
    });
  });

  test("does not restore escaped line breaks for non-AI APIs", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "First\\nSecond" });

    const { container, root } = renderTranCont({
      text: "First\nSecond",
      apiSlug: "microsoft",
      transApis: [microsoftApiSetting],
    });
    await flushEffects();

    expect(container.querySelector("textarea").value).toBe("First\\nSecond");

    act(() => {
      root.unmount();
    });
  });

  test("translates BuiltinAI text fragments and preserves mixed line breaks", async () => {
    apiTranslate.mockImplementation(async ({ text }) => ({
      trText: `translated:${text}`,
    }));

    const { container, root } = renderTranCont({
      text: "First\n\nSecond\r\nThird\rFourth",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
      detectedLang: "en",
    });
    await flushEffects();

    expect(apiTranslate.mock.calls.map(([args]) => args.text)).toEqual([
      "First",
      "Second",
      "Third",
      "Fourth",
    ]);
    expect(apiTranslate.mock.calls.map(([args]) => args.fromLang)).toEqual([
      "en",
      "en",
      "en",
      "en",
    ]);
    expect(
      new Set(apiTranslate.mock.calls.map(([args]) => args.signal)).size
    ).toBe(1);
    expect(container.querySelector("textarea").value).toBe(
      "translated:First\n\ntranslated:Second\ntranslated:Third\ntranslated:Fourth"
    );

    act(() => {
      root.unmount();
    });
  });

  test("waits for complete-input detection before translating BuiltinAI fragments", async () => {
    apiTranslate.mockResolvedValue({ trText: "translated" });
    const { container, root } = renderTranCont({
      text: "First\nSecond",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
      sourceDetectionPending: true,
    });
    await flushEffects();

    expect(apiTranslate).not.toHaveBeenCalled();
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    act(() => {
      root.render(
        <TranCont
          text={"First\nSecond"}
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="builtinai"
          transApis={[builtinApiSetting]}
          detectedLang="en"
          sourceDetectionPending={false}
        />
      );
    });
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(2);
    expect(apiTranslate.mock.calls.map(([args]) => args.fromLang)).toEqual([
      "en",
      "en",
    ]);

    act(() => root.unmount());
  });

  test("uses one auto seed and reuses its source language for remaining BuiltinAI fragments", async () => {
    const seed = createDeferred();
    apiTranslate
      .mockReturnValueOnce(seed.promise)
      .mockImplementation(async ({ text }) => ({
        trText: `translated:${text}`,
        srLang: "en",
        srCode: "en",
        isSame: false,
      }));

    const { container, root } = renderTranCont({
      text: "First\nSecond\nThird",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
    });
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ text: "First", fromLang: "auto" })
    );

    await act(async () => {
      seed.resolve({
        trText: "translated:First",
        srLang: "en",
        srCode: "en",
        isSame: false,
      });
      await seed.promise;
      await Promise.resolve();
    });

    expect(apiTranslate).toHaveBeenCalledTimes(3);
    expect(
      apiTranslate.mock.calls.slice(1).map(([args]) => args.fromLang)
    ).toEqual(["en", "en"]);
    expect(container.querySelector("textarea").value).toBe(
      "translated:First\ntranslated:Second\ntranslated:Third"
    );

    act(() => root.unmount());
  });

  test("stops BuiltinAI multiline translation when the auto seed fails", async () => {
    apiTranslate.mockRejectedValueOnce(new Error("source detection failed"));

    const { container, root } = renderTranCont({
      text: "First\nSecond\nThird",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
    });
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(container.querySelector("textarea").value).toBe("");
    expect(container.textContent).toContain("source detection failed");

    act(() => root.unmount());
  });

  test("does not restart non-BuiltinAI translation when detection metadata changes", async () => {
    apiTranslate.mockResolvedValue({ trText: "translated" });
    const transApis = [baseApiSetting];
    const { root } = renderTranCont({
      transApis,
      sourceDetectionPending: true,
    });
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <TranCont
          text="hello"
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="openai"
          transApis={transApis}
          detectedLang="en"
          sourceDetectionPending={false}
        />
      );
    });
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  test("shows a BuiltinAI fragment error without rendering a partial result", async () => {
    apiTranslate.mockImplementation(async ({ text }) => {
      if (text === "Second") {
        throw new Error("fragment failed");
      }
      return { trText: `translated:${text}` };
    });

    const { container, root } = renderTranCont({
      text: "First\nSecond",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
      detectedLang: "en",
    });
    await flushEffects();

    expect(container.querySelector("textarea").value).toBe("");
    expect(container.textContent).toContain("fragment failed");

    act(() => {
      root.unmount();
    });
  });

  test("aborts every BuiltinAI fragment request on unmount", async () => {
    const first = createDeferred();
    const second = createDeferred();
    apiTranslate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { root } = renderTranCont({
      text: "First\nSecond",
      apiSlug: "builtinai",
      transApis: [builtinApiSetting],
      detectedLang: "en",
    });
    await flushEffects();

    const signals = apiTranslate.mock.calls.map(([args]) => args.signal);
    act(() => {
      root.unmount();
    });
    expect(signals.every((signal) => signal.aborted)).toBe(true);

    await act(async () => {
      first.resolve({ trText: "translated:First" });
      second.resolve({ trText: "translated:Second" });
      await Promise.all([first.promise, second.promise]);
    });
  });

  test("does not pass stream callback when stream rendering is disabled", async () => {
    const disabledByMode = {
      ...baseApiSetting,
      streamRenderMode: "disabled",
    };
    apiTranslate.mockResolvedValueOnce({ trText: "完整译文" });

    const rendered = renderTranCont({ transApis: [disabledByMode] });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].onStreamChunk).toBeUndefined();

    act(() => {
      rendered.root.unmount();
    });

    apiTranslate.mockResolvedValueOnce({ trText: "完整译文" });
    const disabledByUseStream = {
      ...baseApiSetting,
      useStream: false,
    };
    const second = renderTranCont({ transApis: [disabledByUseStream] });
    await flushEffects();

    expect(apiTranslate.mock.calls[1][0].onStreamChunk).toBeUndefined();

    act(() => {
      second.root.unmount();
    });
  });

  test("划词翻译不携带 glossary（规则级 AI 术语不作用于划词）", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });

    const { root } = renderTranCont();
    await flushEffects();

    // 划词走 apiTranslate，不注入规则级 glossary
    expect(apiTranslate.mock.calls[0][0].glossary).toBeUndefined();

    act(() => {
      root.unmount();
    });
  });

  test("passes stream callback when batch fetch is disabled", async () => {
    const nonBatchStream = {
      ...baseApiSetting,
      useBatchFetch: false,
    };
    apiTranslate.mockResolvedValueOnce({ trText: "完整译文" });

    const rendered = renderTranCont({ transApis: [nonBatchStream] });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].onStreamChunk).toEqual(
      expect.any(Function)
    );

    act(() => {
      rendered.root.unmount();
    });
  });

  test("aborts stale request and prevents stale result overwrite", async () => {
    const first = createDeferred();
    const second = createDeferred();
    apiTranslate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { container, root } = renderTranCont();
    await flushEffects();

    act(() => {
      root.render(
        <TranCont
          text="world"
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="openai"
          transApis={[baseApiSetting]}
        />
      );
    });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].signal.aborted).toBe(true);

    await act(async () => {
      // 旧请求即使晚返回，也不能覆盖新请求的最终译文。
      first.resolve({ trText: "旧译文" });
      await first.promise;
      second.resolve({ trText: "新译文" });
      await second.promise;
    });

    expect(container.querySelector("textarea").value).toBe("新译文");

    act(() => {
      root.unmount();
    });
  });

  test("leaves LaTeX untouched while the addon is off", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont();
    await flushEffects();
    const textarea = container.querySelector("textarea");

    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "\\(\\dot{x}_1\\) 部分",
        isComplete: false,
      });
    });
    expect(textarea.value).toBe("\\(\\dot{x}_1\\) 部分");

    await act(async () => {
      deferred.resolve({ trText: "\\(\\dot{x}_1\\) 是速度" });
      await deferred.promise;
    });
    expect(textarea.value).toBe("\\(\\dot{x}_1\\) 是速度");

    act(() => {
      root.unmount();
    });
  });

  test("converts LaTeX in stream and final text when the addon is on", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont({ parseLatex: true });
    await flushEffects();
    const textarea = container.querySelector("textarea");

    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "\\(\\dot{x}_1\\) 部分",
        isComplete: false,
      });
    });
    expect(textarea.value).toBe("ẋ₁ 部分");

    await act(async () => {
      deferred.resolve({ trText: "\\(\\dot{x}_1\\) 是速度" });
      await deferred.promise;
    });
    expect(textarea.value).toBe("ẋ₁ 是速度");

    act(() => {
      root.unmount();
    });
  });

  test("converts LaTeX before the multiline de-escaping of an AI response", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    // 多行原文会触发 `\\n|\\r` 反转义规则，`\right` 必须先被公式转换消化掉。
    const { container, root } = renderTranCont({
      parseLatex: true,
      text: "hello\nworld",
    });
    await flushEffects();

    await act(async () => {
      deferred.resolve({ trText: "\\(\\left(x\\right)\\)" });
      await deferred.promise;
    });

    const textarea = container.querySelector("textarea");
    expect(textarea.value).toBe("(x)");
    expect(textarea.value).not.toContain("ight");

    act(() => {
      root.unmount();
    });
  });

  test("keeps the multiline de-escaping untouched while the addon is off", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont({ text: "hello\nworld" });
    await flushEffects();

    await act(async () => {
      deferred.resolve({ trText: "第一行\\n第二行" });
      await deferred.promise;
    });

    expect(container.querySelector("textarea").value).toBe("第一行\n第二行");

    act(() => {
      root.unmount();
    });
  });

  test("aborts active request when component unmounts", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { root } = renderTranCont();
    await flushEffects();

    const signal = apiTranslate.mock.calls[0][0].signal;
    expect(signal.aborted).toBe(false);

    act(() => {
      root.unmount();
    });

    expect(signal.aborted).toBe(true);

    await act(async () => {
      deferred.resolve({ trText: "卸载后的译文" });
      await deferred.promise;
    });
  });
});

describe("TranCont translation controls and resize handle", () => {
  beforeEach(() => {
    apiTranslate.mockReset();
    document.body.innerHTML = "";
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
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

  /**
   * 构造一个带 touches 数组的触摸事件。
   *
   * @param {Array<{clientY: number}>} touches 触点数组。
   * @returns {Event} 可被 React 与 jsdom 识别的触摸事件。
   */
  function makeTouchEvent(type, touches) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    Object.defineProperty(event, "targetTouches", { value: touches });
    return event;
  }

  /**
   * 渲染译文框并使其 textarea 聚焦：focus-gating 下复制按钮与缩放手柄只在聚焦时显示。
   *
   * @param {Object} props 覆盖默认组件参数。
   * @returns {{container: HTMLElement, root: Object, textarea: HTMLTextAreaElement}} 渲染结果。
   */
  async function renderFocusedTranCont(props = {}) {
    const rendered = renderTranCont(props);
    await flushEffects();
    const textarea = rendered.container.querySelector("textarea");
    act(() => {
      textarea.focus();
    });
    return { ...rendered, textarea };
  }

  test("marks the translated textarea as read only", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea.readOnly).toBe(true);

    act(() => root.unmount());
  });

  test("hides copy and resize controls while loading or empty", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = await renderFocusedTranCont();

    // 加载中（即使聚焦）：无有效译文，复制与缩放手柄均隐藏
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();

    await act(async () => {
      deferred.resolve({ trText: "" });
      await deferred.promise;
    });

    // 空译文（聚焦中）：仍隐藏
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();

    act(() => root.unmount());
  });

  test("streaming loading with partial text hides rail, notch, copy and resize consistently", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = await renderFocusedTranCont();

    // 流式加载中，已有部分译文（聚焦中）：此时不可复制、不可 resize，
    // rail 系列控件必须整体隐藏，不得出现「rail/notch 还在、可操作按钮却
    // 全部消失」的视觉缺口。
    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "部分译文",
        isComplete: false,
      });
    });
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();
    expect(container.querySelector('[data-testid="trancont-rail"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-rail-notch"]')
    ).toBeNull();

    // 流式完成（loading=false）：rail / 复制 / 手柄恢复可见，部分译文可复制
    await act(async () => {
      deferred.resolve({ trText: "完整译文" });
      await deferred.promise;
    });
    expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "完整译文"
    );
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-rail"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-rail-notch"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("multiple concurrent error TranCont instances receive unique, instance-stable helper IDs", async () => {
    apiTranslate.mockImplementation(async ({ apiSetting }) => {
      throw new Error(`${apiSetting.apiName} error`);
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <>
          <TranCont
            text="hello"
            fromLang="auto"
            toLang="zh-CN"
            apiSlug="openai"
            transApis={[baseApiSetting, googleApiSetting]}
          />
          <TranCont
            text="hello"
            fromLang="auto"
            toLang="zh-CN"
            apiSlug="google"
            transApis={[baseApiSetting, googleApiSetting]}
          />
        </>
      );
    });
    await flushEffects();

    const helperElements = container.querySelectorAll(
      ".MuiFormHelperText-root"
    );
    expect(helperElements.length).toBe(2);
    const helperIds = Array.from(helperElements).map((el) => el.id);
    // 每个 helper 节点必须持有非空的唯一 ID（不能共享硬编码的 trancont-helper-text）
    expect(helperIds[0]).toBeTruthy();
    expect(helperIds[1]).toBeTruthy();
    expect(helperIds[0]).not.toBe(helperIds[1]);

    // 过滤出用户可见的 textarea（排除 TextareaAutosize 用于测量的 shadow textarea）
    const textareas = Array.from(container.querySelectorAll("textarea")).filter(
      (ta) => ta.tabIndex !== -1
    );
    expect(textareas.length).toBe(2);
    const describedBys = textareas.map((ta) =>
      ta.getAttribute("aria-describedby")
    );
    // 两个输入框必须分别与其对应的错误文本关联
    expect(describedBys[0]).toBe(helperIds[0]);
    expect(describedBys[1]).toBe(helperIds[1]);

    act(() => root.unmount());
  });

  test("does not leave a dangling aria-describedby when there is no error", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "正常译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea.getAttribute("aria-describedby")).toBeNull();
    expect(container.querySelector(".MuiFormHelperText-root")).toBeNull();

    act(() => root.unmount());
  });

  test("empty read-only translation does not float the label (no notched gap on focus)", async () => {
    // 空译文：即使聚焦，label 也不应浮动到边框（不挖 notchedOutline 缺口），
    // 因为没有内容可复制、不能输入、不能提交，浮动 label 无意义。
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);
    const { container, root } = await renderFocusedTranCont();

    await act(async () => {
      deferred.resolve({ trText: "" });
      await deferred.promise;
    });

    const label = container.querySelector(".MuiInputLabel-outlined");
    expect(label).not.toBeNull();
    // shrink=false：label 停留在输入框内作为占位，不浮动、不挖缺口
    expect(label.classList.contains("MuiInputLabel-shrink")).toBe(false);

    act(() => root.unmount());
  });

  test("translation text floats the label (notched gap only when there is content)", async () => {
    // 有译文：label 浮动到边框（正常挖缺口标识字段），这是有内容的合理表现。
    apiTranslate.mockResolvedValueOnce({ trText: "有内容的译文" });
    const { container, root } = await renderFocusedTranCont();

    const label = container.querySelector(".MuiInputLabel-outlined");
    expect(label).not.toBeNull();
    expect(label.classList.contains("MuiInputLabel-shrink")).toBe(true);

    act(() => root.unmount());
  });

  test("empty translation on focus renders no rail, rail-notch, or copy button", async () => {
    // 空译文 + 聚焦：只读空框右上角无可执行操作，不得挖出空的装饰缺口。
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);
    const { container, root } = await renderFocusedTranCont();

    await act(async () => {
      deferred.resolve({ trText: "" });
      await deferred.promise;
    });

    expect(
      container.querySelector('[data-testid="trancont-rail-notch"]')
    ).toBeNull();
    expect(container.querySelector('[data-testid="trancont-rail"]')).toBeNull();
    expect(container.querySelector("[data-copy-text]")).toBeNull();

    act(() => root.unmount());
  });

  test("translation on focus renders the rail and rail-notch", async () => {
    // 有译文 + 聚焦：rail 嵌入顶边框的装饰缺口正常出现（有内容可复制）。
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    expect(
      container.querySelector('[data-testid="trancont-rail-notch"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-rail"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("shows copy and resize controls for a valid translation", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "完整的译文" });
    const { container, root } = await renderFocusedTranCont();

    expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "完整的译文"
    );
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("keeps copy and resize controls when an error occurs after partial text", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = await renderFocusedTranCont();

    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "部分译文",
        isComplete: false,
      });
    });
    await act(async () => {
      deferred.reject(new Error("网络错误"));
      await deferred.promise.catch(() => {});
    });

    // 错误发生前已有的部分译文仍可复制
    expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "部分译文"
    );
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("hides copy and resize controls when an error leaves no translation or on blur", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = await renderFocusedTranCont();

    await act(async () => {
      deferred.reject(new Error("请求失败"));
      await deferred.promise.catch(() => {});
    });

    expect(container.textContent).toContain("请求失败");
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();

    // 失焦也不残留可命中控件（空译文失焦后仍隐藏）
    act(() => {
      container.querySelector("textarea").blur();
    });
    expect(container.querySelector("[data-copy-text]")).toBeNull();

    act(() => root.unmount());
  });

  test("simpleStyle keeps rendering Typography without textarea, copy or resize controls", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont({ simpleStyle: true });
    await flushEffects();

    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();
    expect(container.textContent).toContain("译文");

    act(() => root.unmount());
  });

  test("does not propagate pointer or touch start events from the resize handle", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    const pointerSpy = jest.fn();
    const touchSpy = jest.fn();
    document.body.addEventListener("pointerdown", pointerSpy);
    document.body.addEventListener("touchstart", touchSpy);

    act(() => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientY: 0 }]));
    });

    // 起始事件已隔离，不会冒泡到外层拖动/缩放容器
    expect(pointerSpy).not.toHaveBeenCalled();
    expect(touchSpy).not.toHaveBeenCalled();

    document.body.removeEventListener("pointerdown", pointerSpy);
    document.body.removeEventListener("touchstart", touchSpy);
    act(() => root.unmount());
  });

  test("keeps the height unchanged below the 6px threshold and resizes above it", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    // 模拟输入框真实高度作为首次拖动起点
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });

    // 纵向移动 6px 内：高度不变
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 6 }));
    });
    expect(textField.style.height).toBe("");

    // 超过 6px 即启动（7px 边界，100 + 7 = 107）
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 7 }));
    });
    expect(textField.style.height).toBe("107px");

    // 继续拖动继续调整（100 + 20 = 120）
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    expect(textField.style.height).toBe("120px");

    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 20 }));
    });
    act(() => root.unmount());
  });

  test("a gesture starting outside the hot area never starts resizing", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    const textarea = container.querySelector("textarea");

    // 手势从热区外的正文区开始
    await act(async () => {
      textarea.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 100 }));
    });
    expect(textField.style.height).toBe("");

    act(() => root.unmount());
  });

  test("ends the touch session on touchend even when the touches array is empty", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    await act(async () => {
      handle.dispatchEvent(makeTouchEvent("touchstart", [{ clientY: 0 }]));
    });
    // touchend 时触点数组为空，会话应正常结束
    await act(async () => {
      window.dispatchEvent(new Event("touchend"));
    });
    // 会话结束后再移动不再改变高度
    await act(async () => {
      window.dispatchEvent(makeTouchEvent("touchmove", [{ clientY: 50 }]));
    });
    expect(textField.style.height).toBe("");

    act(() => root.unmount());
  });

  test("removes all window listeners on unmount while dragging a pointer session", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    // 进入拖动会话。jsdom 无 Pointer capture，pointerdown 激活完整 window fallback，
    // 会话期间 window 上存在 pointermove/pointerup/pointercancel 降级监听。
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });

    const removeSpy = jest.spyOn(window, "removeEventListener");
    act(() => root.unmount());

    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    for (const type of ["pointermove", "pointerup", "pointercancel", "blur"]) {
      expect(removedTypes).toContain(type);
    }
    removeSpy.mockRestore();
  });

  test("removes all window listeners on unmount while dragging a touch session", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    // 进入 Touch 会话：touchmove/touchend/touchcancel 监听仅随活动会话安装
    await act(async () => {
      handle.dispatchEvent(
        makeTouchEvent("touchstart", [{ clientY: 0, identifier: 1 }])
      );
    });

    const removeSpy = jest.spyOn(window, "removeEventListener");
    act(() => root.unmount());

    const removedTypes = removeSpy.mock.calls.map(([type]) => type);
    for (const type of ["touchmove", "touchend", "touchcancel", "blur"]) {
      expect(removedTypes).toContain(type);
    }
    removeSpy.mockRestore();
  });

  test("hides copy and resize controls once the textarea loses focus", async () => {
    jest.useFakeTimers("legacy");
    try {
      apiTranslate.mockResolvedValueOnce({ trText: "完整的译文" });
      const { container, root } = await renderFocusedTranCont();

      // 聚焦且有效译文：复制与缩放手柄显示
      expect(container.querySelector("[data-copy-text]")).not.toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).not.toBeNull();

      // 失焦：缩放手柄与 copy rail 同构，均播放退出动画后卸载（不再瞬时卸载）
      act(() => {
        container.querySelector("textarea").blur();
      });
      // 退出动画期间复制与缩放手柄仍在 DOM（淡出中）
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).not.toBeNull();
      expect(container.querySelector("[data-copy-text]")).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(container.querySelector("[data-copy-text]")).toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("gives the resize handle a non-empty accessible name via the real i18n dictionary", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    expect(handle).not.toBeNull();
    // 使用真实 I18N 字典获取本地化文案，不依赖硬编码 fallback
    expect(handle.getAttribute("aria-label")).toBeTruthy();
    expect(handle.getAttribute("title")).toBeTruthy();
    expect(handle.getAttribute("aria-label")).toBe(
      jest.requireActual("../../config/i18n").newI18n("en")(
        "field_resize_height"
      )
    );

    act(() => root.unmount());
  });

  test("a manually resized box keeps the resize handle visible after the translation is cleared", async () => {
    apiTranslate
      .mockResolvedValueOnce({ trText: "译文" })
      .mockResolvedValueOnce({ trText: "" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    expect(handle).not.toBeNull();

    // 拖动放大产生手动高度
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 200 }));
    });
    expect(textField.style.height).toBe("300px");

    // 重新划词翻译（文本变化清空 trText）：已有手动高度仍是显示手柄的理由
    await act(async () => {
      root.render(
        <TranCont
          text="hello again"
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="openai"
          transApis={[baseApiSetting]}
        />
      );
      await Promise.resolve();
    });
    await flushEffects();
    expect(container.querySelector("textarea").value).toBe("");
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("exposes a keyboard-operable separator with arrow-key resizing", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // keyboard-operable separator：保留可读名称，且可聚焦、支持方向键调整
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-label")).toBeTruthy();
    expect(handle.getAttribute("title")).toBeTruthy();
    expect(handle.getAttribute("tabindex")).toBe("0");
    // 手柄物理上是贴在字段底边框上的横向分隔条：横向语义与 ArrowUp/Down 对应
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");
    expect(handle.getAttribute("aria-valuemin")).toBe("40");
    // 未受控态：实测自动高度作为 aria-valuenow（ARIA 1.2 focusable separator
    // MUST set aria-valuenow）。jsdom 无 ResizeObserver，测量 effect 只在挂载
    // 与 window resize 时重跑，故 stub offsetHeight 后须显式派发 resize 重测。
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(handle.getAttribute("aria-valuenow")).toBe("100");

    // W3C Window Splitter 语义（上方文本框为主区域）：
    // ArrowDown：增加高度（从测量基线 100 增加一个步进 12px → 112px）
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(textField.style.height).toBe("112px");
    // 持有受控高度后 valuenow 输出真实值
    expect(handle.getAttribute("aria-valuenow")).toBe("112");

    // ArrowUp：以受控高度为基线递减一个步进（112 - 12 = 100px）
    await act(async () => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          bubbles: true,
          cancelable: true,
        })
      );
      await Promise.resolve();
    });
    expect(textField.style.height).toBe("100px");

    // 连续 ArrowUp 触底：不得低于 MIN_RESIZE_HEIGHT (40)
    for (let i = 0; i < 6; i += 1) {
      await act(async () => {
        handle.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowUp",
            bubbles: true,
            cancelable: true,
          })
        );
        await Promise.resolve();
      });
    }
    expect(textField.style.height).toBe("40px");

    act(() => root.unmount());
  });

  test("tabbing focus to the handle keeps the field open (relatedTarget keep-alive)", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // 焦点从 textarea 迁移到手柄（Tab 等价场景）：focusout 冒泡到字段包装层，
    // relatedTarget 在包装层内 → 不关闭、不卸载
    await act(async () => {
      handle.focus();
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(handle);
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();
    // rail 同样保持挂载（字段未关闭）
    expect(
      container.querySelector('[data-testid="trancont-rail"]')
    ).not.toBeNull();

    act(() => root.unmount());
  });

  test("keeps dragging when the textarea blurs mid-drag until pointerup", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // 进入拖动会话并移动超过阈值
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    expect(textField.style.height).toBe("120px");

    // 缩放中途失焦：进入退出动画，但活动会话期间手柄保持挂载与监听
    act(() => {
      container.querySelector("textarea").blur();
    });
    // 退出动画期间（closing=true）拖动不受 pointer-events 阻断
    expect(handle.style.pointerEvents).toBe("auto");

    // 等待超过 120ms 退出动画：失焦不再终止会话（新契约）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 130));
    });
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).not.toBeNull();

    // 失焦后 height 仍在跟随鼠标
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 40 }));
    });
    expect(textField.style.height).toBe("140px");

    // 松手结束会话：重渲染后按新门控自然卸载
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 40 }));
    });
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();

    // 后续 pointermove 不再改变高度
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 60 }));
    });
    expect(textField.style.height).toBe("140px");

    act(() => root.unmount());
  });

  test("drag height lands on the InputBase root and the visible textarea scrolls internally", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // 拖动 200px：受控像素高度 300px 直接落在 InputBase 根节点（已超过
    // maxRows=10 的高度，钳制必须释放，不得把内框压回固定行高形成死区）
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 200 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointerup", { clientY: 200 }));
    });
    expect(textField.style.height).toBe("300px");
    // 受控高度落在 InputBase 根节点；根节点不持有受控 overflowY
    // （避免 MUI TextareaAutosize 每帧重写 textarea.style.overflow 与 root 级
    // 滚动形成双滚动条）
    expect(textField.style.overflowY).toBe("");

    // 可见 textarea（过滤测量用 shadow 副本）的强制滚动规则来自 scoped sx
    // （`& textarea:not([aria-hidden="true"])`），不写入 React inline style。
    const visibleTextareas = Array.from(
      container.querySelectorAll("textarea")
    ).filter((ta) => ta.tabIndex !== -1);
    expect(visibleTextareas.length).toBe(1);
    expect(visibleTextareas[0].style.maxHeight).toBe("");

    // 情感样式表存在同时匹配 textarea:not([aria-hidden=...]) 与
    // overflow: auto !important 的 scoped 强制滚动规则
    expect(emotionCssText()).toMatch(
      /textarea:not\(\[aria-hidden=['"]true['"]\]\)\s*\{[^}]*overflow:\s*auto\s*!important/
    );
    // 测量用 shadow textarea 不命中强制滚动规则（aria-hidden="true" 排除），
    // 其测量关键基准 height:0 必须原样保留
    const shadowTextareas = Array.from(
      container.querySelectorAll("textarea")
    ).filter((ta) => ta.tabIndex === -1);
    for (const shadow of shadowTextareas) {
      expect(shadow.style.height).toBe("0px");
    }

    act(() => root.unmount());
  });

  test("floats the label while loading so it does not overlap the spinner", async () => {
    // loading 期间（译文挂起）：label 必须随 spinner 一并浮动到边框，
    // 避免与 startAdornment 的 spinner 在框内视觉重叠。
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);
    const { container, root } = await renderFocusedTranCont();

    const label = container.querySelector(".MuiInputLabel-outlined");
    expect(label).not.toBeNull();
    expect(label.classList.contains("MuiInputLabel-shrink")).toBe(true);

    // resolve 空译文后（非 loading 且无内容）：label 回到非浮动占位
    await act(async () => {
      deferred.resolve({ trText: "" });
      await deferred.promise;
    });
    expect(label.classList.contains("MuiInputLabel-shrink")).toBe(false);

    act(() => root.unmount());
  });

  test("unmounts the handle and ignores pointer moves when blur happens without a drag session", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });

    // 从未进入拖动会话：失焦后按旧契约卸载，且后续指针移动无效
    // （无监听器响应，等价于"监听器已移除"的功能性断言）。
    act(() => {
      container.querySelector("textarea").blur();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 130));
    });
    expect(
      container.querySelector('[data-testid="trancont-resize-handle"]')
    ).toBeNull();
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
    });
    expect(textField.style.height).toBe("");

    act(() => root.unmount());
  });

  test("prevents default on compatible mousedown to guard textarea focus", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = await renderFocusedTranCont();
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // 兼容 mousedown 必须被 preventDefault 抑制（防失焦兜底，与 TranForm
    // 提交按钮/CopyBtn 同一套先例），且 mousedown 本身不是拖动会话入口。
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      handle.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    act(() => root.unmount());
  });

  test("keeps resizing after instant blur when prefers-reduced-motion is enabled", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = matchMediaStub(true);
      const { container, root } = await renderFocusedTranCont();
      const textField = container.querySelector(".MuiInputBase-root");
      Object.defineProperty(textField, "offsetHeight", {
        configurable: true,
        value: 100,
      });
      const handle = container.querySelector(
        '[data-testid="trancont-resize-handle"]'
      );

      // 进入拖动会话并移动超过阈值
      await act(async () => {
        handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
      });
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
      });
      expect(textField.style.height).toBe("120px");

      // 减少动态效果：失焦跳过退出动画立即翻转 visible，活动会话必须存活
      act(() => {
        container.querySelector("textarea").blur();
      });
      // 拖动继续：高度仍在跟随，且不被 pointer-events 阻断
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 50 }));
      });
      expect(textField.style.height).toBe("150px");
      expect(handle.style.pointerEvents).not.toBe("none");

      // 松手结束会话：按新门控卸载；后续移动不再改变高度
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointerup", { clientY: 50 }));
      });
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).toBeNull();
      await act(async () => {
        window.dispatchEvent(makePointerEvent("pointermove", { clientY: 80 }));
      });
      expect(textField.style.height).toBe("150px");

      act(() => root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("reads prefers-reduced-motion and subscribes/unsubscribes to runtime changes", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const originalMatchMedia = window.matchMedia;
    const changeHandlers = [];
    const removeFn = jest.fn();
    const mql = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
      addEventListener: (type, handler) => {
        if (type === "change") changeHandlers.push(handler);
      },
      removeEventListener: removeFn,
    };
    window.matchMedia = jest.fn().mockReturnValue(mql);

    try {
      const { container, root } = await renderFocusedTranCont();

      // 组件确以"减少动态效果"媒体查询读取系统偏好
      expect(window.matchMedia).toHaveBeenCalledWith(
        "(prefers-reduced-motion: reduce)"
      );
      // TranCont 唯一注册运行时订阅：ResizeHandle 改由 prop 接收偏好值，
      // 不再内部重复订阅（单一状态真源）。
      expect(changeHandlers.length).toBe(1);

      act(() => {
        changeHandlers[0]({ matches: false });
      });
      expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
        "译文"
      );

      act(() => root.unmount());
      expect(removeFn).toHaveBeenCalledWith("change", expect.any(Function));
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test("does not inject the enter animation when prefers-reduced-motion is enabled", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const originalMatchMedia = window.matchMedia;

    try {
      const matchMediaStub = (matches) =>
        jest.fn().mockReturnValue({
          matches,
          media: "(prefers-reduced-motion: reduce)",
          onchange: null,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          addListener: jest.fn(),
          removeListener: jest.fn(),
          dispatchEvent: jest.fn(),
        });

      // 未开启减少动态效果：进入动画关键帧应注入
      window.matchMedia = matchMediaStub(false);
      apiTranslate.mockResolvedValueOnce({ trText: "译文" });
      const normal = await renderFocusedTranCont();
      const normalCopy = normal.container.querySelector("[data-copy-text]");
      const normalStack = normalCopy.parentElement;
      const normalClasses = (normalStack.className || "")
        .split(" ")
        .filter(Boolean);
      const normalRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const normalOwnAnimations = normalRules.filter(
        (rule) =>
          rule.selectorText &&
          normalClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(normalOwnAnimations.length).toBeGreaterThan(0);
      act(() => normal.root.unmount());

      // 开启减少动态效果：该实例的控制组不得注入进入动画关键帧
      window.matchMedia = matchMediaStub(true);
      apiTranslate.mockResolvedValueOnce({ trText: "译文" });
      const reduced = await renderFocusedTranCont();
      const reducedCopy = reduced.container.querySelector("[data-copy-text]");
      const reducedStack = reducedCopy.parentElement;
      const reducedClasses = (reducedStack.className || "")
        .split(" ")
        .filter(Boolean);
      const reducedOwnAnimations = Array.from(document.styleSheets)
        .flatMap((sheet) => {
          try {
            return Array.from(sheet.cssRules);
          } catch {
            return [];
          }
        })
        .filter(
          (rule) =>
            rule.selectorText &&
            reducedClasses.some((c) =>
              rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
            ) &&
            /transition[^;]*opacity/.test(rule.cssText)
        );
      expect(reducedOwnAnimations.length).toBe(0);

      act(() => reduced.root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});

describe("TranCont embedded border controls", () => {
  beforeEach(() => {
    apiTranslate.mockReset();
    document.body.innerHTML = "";
  });

  /**
   * 渲染译文框并使其 textarea 聚焦：focus-gating 下复制 rail 与缩放手柄只在聚焦时显示。
   *
   * @param {Object} props 覆盖默认组件参数。
   * @returns {{container: HTMLElement, root: Object, textarea: HTMLTextAreaElement}} 渲染结果。
   */
  async function renderFocusedTranCont(props = {}) {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const rendered = renderTranCont(props);
    await flushEffects();
    const textarea = rendered.container.querySelector("textarea");
    act(() => {
      textarea.focus();
    });
    return { ...rendered, textarea };
  }

  test("resize handle and rail are not shielded by the overlay pointer-events none", async () => {
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    const rail = container.querySelector('[data-testid="trancont-rail"]');
    expect(handle).not.toBeNull();
    expect(rail).not.toBeNull();

    // 覆盖层父级显式 pointer-events: none，控件自身必须内联覆盖为 auto
    expect(getComputedStyle(handle).pointerEvents).toBe("auto");
    expect(getComputedStyle(rail).pointerEvents).toBe("auto");
    expect(getComputedStyle(handle).cursor).toBe("row-resize");

    act(() => root.unmount());
  });

  test("anchors the resize handle centered on the bottom border", async () => {
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    expect(handle).not.toBeNull();

    // 跨底边框居中：共享中心轴距右边缘 12px，热区宽 16，中心偏移 8
    expect(parseFloat(handle.style.right)).toBe(CONTROL_CENTER_FROM_RIGHT - 8);
    expect(parseFloat(handle.style.bottom)).toBe(-8);
    // jsdom 下桌面命中热区 = 16
    expect(parseFloat(handle.style.width)).toBe(16);
    expect(parseFloat(handle.style.height)).toBe(16);

    act(() => root.unmount());
  });

  test("rail and handle share the same right center axis", async () => {
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    const rail = container.querySelector('[data-testid="trancont-rail"]');

    // 右上 rail 与缩放手柄均以共享中心轴定位：中心 = right + 自身宽度/2 = CONTROL_CENTER_FROM_RIGHT
    const railCenter = parseFloat(rail.style.right) + CONTROL_HEIGHT / 2;
    expect(railCenter).toBe(CONTROL_CENTER_FROM_RIGHT);

    // rail 以顶边为中心垂直居中：top = -CONTROL_HEIGHT/2，中心落在边框线 y=0
    expect(parseFloat(rail.style.top)).toBe(-Math.round(CONTROL_HEIGHT / 2));
    expect(parseFloat(rail.style.top) + CONTROL_HEIGHT / 2).toBe(0);

    // 手柄同样以共享中心轴定位（跨底边框居中）
    const handleCenter =
      parseFloat(handle.style.right) + parseFloat(handle.style.width) / 2;
    expect(handleCenter).toBe(CONTROL_CENTER_FROM_RIGHT);

    act(() => root.unmount());
  });

  test("rail and handle both have notch strips", async () => {
    const { container, root } = await renderFocusedTranCont();

    const railNotch = container.querySelector(
      '[data-testid="trancont-rail-notch"]'
    );
    expect(railNotch).not.toBeNull();
    const resizeNotch = container.querySelector(
      '[data-testid="trancont-resize-notch"]'
    );
    expect(resizeNotch).not.toBeNull();

    // rail 遮罩 top 在顶边框线，宽度 = 控件宽度 + 两侧水平 padding
    expect(parseFloat(railNotch.style.top)).toBe(
      -Math.round(NOTCH_STRIP_HEIGHT / 2)
    );
    expect(parseFloat(railNotch.style.width)).toBe(
      CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2
    );

    // 缩放手柄遮罩 bottom 在底边框线，宽度 = 控件宽度 + 两侧水平 padding
    expect(parseFloat(resizeNotch.style.bottom)).toBe(
      -Math.round(NOTCH_STRIP_HEIGHT / 2)
    );
    expect(parseFloat(resizeNotch.style.width)).toBe(
      CONTROL_HEIGHT + NOTCH_HORIZONTAL_PAD * 2
    );

    // 两个遮罩条均以 background.paper 主题色遮盖边框
    const rules = collectRules();
    const notchPairs = [
      (railNotch.className || "").split(" ").filter(Boolean),
      (resizeNotch.className || "").split(" ").filter(Boolean),
    ];
    notchPairs.forEach((classes) => {
      const ownRules = rules.filter(
        (rule) =>
          rule.selectorText &&
          classes.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          rule.cssText.includes("background-color")
      );
      expect(ownRules.length).toBeGreaterThan(0);
      expect(
        ownRules.every((rule) => !rule.cssText.includes("background.paper"))
      ).toBe(true);
    });

    act(() => root.unmount());
  });

  test("renders the DragIndicatorIcon inside the resize handle", async () => {
    const { container, root } = await renderFocusedTranCont();

    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );
    expect(handle).not.toBeNull();
    // 六点 DragIndicator 图标渲染在手柄热区内
    expect(
      handle.querySelector('[data-testid="DragIndicatorIcon"]')
    ).not.toBeNull();

    // 不再使用 ::before 折角画线：styleSheets 中不应存在该伪元素的规则
    const handleClasses = (handle.className || "").split(" ").filter(Boolean);
    const ownBeforeRules = collectRules().filter(
      (rule) =>
        rule.selectorText &&
        handleClasses.some((c) =>
          rule.selectorText
            .split(",")
            .some((sel) => sel.trim() === `.${c}::before`)
        )
    );
    expect(ownBeforeRules.length).toBe(0);

    act(() => root.unmount());
  });

  test("hidden state leaves no rail, handle or notch in the DOM", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root, textarea } = await renderFocusedTranCont();

      // 失焦：缩放手柄与 rail-notch 同构，均播放退出动画后卸载（不再瞬时卸载）
      act(() => {
        textarea.blur();
      });
      // 退出动画期间缩放手柄与 rail-notch 仍在 DOM（淡出中）
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-resize-notch"]')
      ).not.toBeNull();

      // 退出动画期间 rail 与 notch 仍在 DOM
      expect(
        container.querySelector('[data-testid="trancont-rail"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-rail-notch"]')
      ).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        container.querySelector('[data-testid="trancont-rail"]')
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-rail-notch"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("plays the rail exit animation on blur and unmounts after 120ms", async () => {
    jest.useFakeTimers("legacy");
    try {
      const { container, root, textarea } = await renderFocusedTranCont();

      act(() => {
        textarea.blur();
      });

      // 退出动画期间 rail 仍在 DOM，且注入 opacity/visibility 过渡规则。
      // 注意：closing 翻转会使 rail 的 emotion 类名变化，须在 blur 后重新取类名过滤。
      const rail = container.querySelector('[data-testid="trancont-rail"]');
      expect(rail).not.toBeNull();
      const railClasses = (rail.className || "").split(" ").filter(Boolean);
      const ownOutAnimations = collectRules().filter(
        (rule) =>
          rule.selectorText &&
          railClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(ownOutAnimations.length).toBeGreaterThan(0);

      // 缩放手柄同构：失焦后参与退出动画（淡出中仍在 DOM），退出期间禁用命中
      const exitHandle = container.querySelector(
        '[data-testid="trancont-resize-handle"]'
      );
      expect(exitHandle).not.toBeNull();
      expect(getComputedStyle(exitHandle).pointerEvents).toBe("none");

      // 退出动画期间 rail 屏蔽指针事件，防止残留按钮被点击触发复制
      expect(
        getComputedStyle(
          container.querySelector('[data-testid="trancont-rail"]')
        ).pointerEvents
      ).toBe("none");

      // 120ms 后 rail 与缩放手柄均卸载
      act(() => {
        jest.advanceTimersByTime(120);
      });
      expect(
        container.querySelector('[data-testid="trancont-rail"]')
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="trancont-resize-handle"]')
      ).toBeNull();

      act(() => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  test("removes the rail immediately on blur without exit animation when prefers-reduced-motion is enabled", async () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = matchMediaStub(true);
      const { container, root, textarea } = await renderFocusedTranCont();
      const rail = container.querySelector('[data-testid="trancont-rail"]');
      const railClasses = (rail.className || "").split(" ").filter(Boolean);

      act(() => {
        textarea.blur();
      });

      // reduced-motion：跳过 120ms 滞留，立即卸载
      expect(
        container.querySelector('[data-testid="trancont-rail"]')
      ).toBeNull();

      // 未注入 opacity/visibility 退出过渡（reduced-motion 下 transition: none）
      const ownOutAnimations = collectRules().filter(
        (rule) =>
          rule.selectorText &&
          railClasses.some((c) =>
            rule.selectorText.split(",").some((sel) => sel.trim() === `.${c}`)
          ) &&
          /transition[^;]*opacity/.test(rule.cssText)
      );
      expect(ownOutAnimations.length).toBe(0);

      act(() => root.unmount());
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  /**
   * 构造一个带 clientY/pointerId 的通用指针事件。
   *
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

  /**
   * 解析真实浏览器级联下 fieldset 的 border-width。
   *
   * jsdom 的级联按样式表文档顺序解析而不是按选择器特异性，而 emotion 把每条
   * 规则注入到独立的 <style> 标签，标签顺序随挂载顺序变化（同一 DOM 在不同
   * 测试文件里的计算值可能不同）。这里取"实际匹配该元素且类数量最多"的选择器
   * 所声明的 border-width，模拟浏览器的特异性级联，可靠断言聚焦边框宽度。
   *
   * @param {HTMLElement} outline .MuiOutlinedInput-notchedOutline 元素。
   * @returns {string} 胜者规则中声明的 border-width（如 "1px" / "2px"）。
   */
  function winningBorderWidth(outline) {
    const matched = collectRules()
      .filter((rule) => rule.selectorText && /border-width/.test(rule.cssText))
      .map((rule) => ({
        rule,
        selectors: rule.selectorText.split(",").map((s) => s.trim()),
      }))
      .filter(({ selectors }) => selectors.some((sel) => outline.matches(sel)))
      .map(({ rule, selectors }) => ({
        rule,
        classCount: Math.max(
          ...selectors.map(
            (sel) => (sel.match(/\.-?[_a-zA-Z][\w-]*/g) || []).length
          )
        ),
      }))
      .sort((a, b) => b.classCount - a.classCount)[0];
    expect(matched).toBeDefined();
    return /border-width:\s*([^;]+)/.exec(matched.rule.cssText)?.[1]?.trim();
  }

  test("keeps the focused notched outline at 2px border width", async () => {
    const { container, root } = await renderFocusedTranCont();

    const focusedOutline = container.querySelector(
      ".MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline"
    );
    expect(focusedOutline).not.toBeNull();
    // 保留 MUI 原生 2px 聚焦边框（键盘焦点可见性，WCAG 2.4.7）；装饰缺口由
    // NOTCH_STRIP_HEIGHT=4 的遮罩条把两层边框一起清掉，不再用字段局部样式压制。
    expect(winningBorderWidth(focusedOutline)).toBe("2px");

    act(() => root.unmount());
  });

  test("keeps rail, handle and notches outside the scrollable input root after a drag", async () => {
    const { container, root } = await renderFocusedTranCont();

    const textField = container.querySelector(".MuiInputBase-root");
    Object.defineProperty(textField, "offsetHeight", {
      configurable: true,
      value: 100,
    });
    const handle = container.querySelector(
      '[data-testid="trancont-resize-handle"]'
    );

    // 完成一次超过 6px 阈值的高度拖动，使 resizeHeight 进入受控状态
    await act(async () => {
      handle.dispatchEvent(makePointerEvent("pointerdown", { clientY: 0 }));
    });
    await act(async () => {
      window.dispatchEvent(makePointerEvent("pointermove", { clientY: 20 }));
    });
    // 受控高度已接管 InputBase 根节点；根节点不持有受控 overflowY
    // （jsdom/cssstyle 不展开 overflow shorthand，且 MUI TextareaAutosize 会
    // 每帧重写 textarea.style.overflow——root 级 overflowY 会让可见 textarea
    // 无法成为唯一滚动容器）
    expect(textField.style.height).toBe("120px");
    expect(textField.style.overflowY).toBe("");

    // rail、六点手柄与两处 notch 必须与滚动根节点同级（或其外层），
    // 祖先链不得包含该滚动节点，否则会被 overflow-y: auto 裁切。
    for (const testId of [
      "trancont-rail",
      "trancont-resize-handle",
      "trancont-resize-notch",
    ]) {
      const node = container.querySelector(`[data-testid="${testId}"]`);
      expect(node).not.toBeNull();
      expect(node.closest(".MuiInputBase-root")).toBeNull();
    }

    act(() => root.unmount());
  });
});
