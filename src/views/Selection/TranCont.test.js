/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act, testing-library/render-result-naming-convention */
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

jest.mock("./AudioBtn", () => {
  const React = require("react");

  return {
    BrowserTtsBtn: ({ text }) =>
      React.createElement(
        "button",
        { type: "button", "data-speech-text": text },
        "speak"
      ),
  };
});

/**
 * Create a Promise that tests can resolve or reject explicitly.
 *
 * @returns {{promise: Promise<unknown>, resolve: Function, reject: Function}} Controllable Promise handle.
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
 * Flush React effects and Promise microtasks.
 *
 * @returns {Promise<void>} Promise that resolves after the queues settle.
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
 * Render the selection translation result component.
 *
 * @param {Object} props Overrides for the default component props.
 * @returns {{container: HTMLElement, root: Object}} React root and container.
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

  test("renders an explicit read-only empty state in the Playground", async () => {
    const { container, root } = renderTranCont({
      text: "",
      isPlayground: true,
    });
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(
      container.querySelector(".kt-playground-translator__result")
    ).not.toBeNull();
    expect(textarea.readOnly).toBe(true);
    expect(textarea.classList).toContain("kt-resizable-textarea");
    expect(textarea.closest(".kt-resizable-text-field")).not.toBeNull();
    expect(
      getComputedStyle(textarea.closest(".MuiInputBase-root")).overflow
    ).toBe("visible");
    expect(getComputedStyle(textarea).resize).toBe("vertical");
    expect(textarea.placeholder).toBe("playground_translation_empty_result");
    expect(container.querySelector("button[data-copy-text]")).toBeNull();
    expect(apiTranslate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("renders the Popup M3 result card with copy and speech actions", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont({ popupStyle: true });
    await flushEffects();

    const result = container.querySelector(".kt-popup-translation-result");
    expect(result).not.toBeNull();
    expect(result.textContent).toContain("译文");
    expect(result.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "译文"
    );
    expect(result.querySelector("[data-speech-text]").dataset.speechText).toBe(
      "译文"
    );
    act(() => root.unmount());
  });

  test("keeps the Popup copy action hidden until translation text exists", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);
    const { container, root } = renderTranCont({ popupStyle: true });
    await flushEffects();

    const body = container.querySelector(".kt-popup-translation-result__body");
    expect(body.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector("[data-copy-text]")).toBeNull();

    await act(async () => {
      apiTranslate.mock.calls[0][0].onStreamChunk({
        text: "partial translation",
        isComplete: false,
      });
    });
    expect(container.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "partial translation"
    );

    await act(async () => {
      deferred.resolve({ trText: "final translation" });
      await deferred.promise;
    });
    expect(body.getAttribute("aria-busy")).toBe("false");
    act(() => root.unmount());
  });

  test("renders streaming chunks before the final translation", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);

    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector("textarea");
    expect(textarea.value).toBe("");
    expect(textarea.getAttribute("aria-busy")).toBe("true");
    expect(
      container.querySelector(
        '[role="progressbar"][aria-label="popup_translating"]'
      )
    ).not.toBeNull();

    await act(async () => {
      // Simulate an SSE chunk; the output should display the partial translation immediately.
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
    expect(textarea.getAttribute("aria-busy")).toBe("false");

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
      // A late response from an old request must not overwrite the new translation.
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
