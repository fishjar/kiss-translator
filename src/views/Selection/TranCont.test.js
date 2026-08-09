import { act } from "react";
import { createRoot } from "react-dom/client";
import TranCont from "./TranCont";
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
  useI18n: () => (key) => key,
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

  test("preserves line breaks and decodes HTML entities for Google2", async () => {
    apiTranslate.mockResolvedValueOnce({
      trText:
        "First isn&#39;t &quot;plain&quot; &amp; simple<br><br> Second<br/>\tThird<br /> Fourth",
    });

    const { container, root } = renderTranCont({
      text: "First\n\nSecond\r\nThird\rFourth",
      apiSlug: "google2",
      transApis: [google2ApiSetting],
    });
    await flushEffects();

    expect(apiTranslate.mock.calls[0][0].text).toBe(
      "First<br><br>Second<br>Third<br>Fourth"
    );
    const expectedText =
      'First isn\'t "plain" & simple\n\nSecond\nThird\nFourth';
    expect(container.querySelector("textarea").value).toBe(expectedText);
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
    });
    await flushEffects();

    expect(apiTranslate.mock.calls.map(([args]) => args.text)).toEqual([
      "First",
      "Second",
      "Third",
      "Fourth",
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
