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
    stream: new Set(["OpenAI"]),
  },
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
