/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act, testing-library/render-result-naming-convention */
import { act } from "react";
import { createRoot } from "react-dom/client";
import TranCont from "./TranCont";
import { apiTranslate } from "../../apis";
import {
  __getSessionHeightMapForTests,
  __resetSessionHeightMapForTests,
} from "../../hooks/useTextareaHeightLock";

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
  useI18n: () => (key) =>
    ({
      popup_text_request_failed: "Request failed ({status})",
      popup_text_auth_failed: "Check your API Key in Settings.",
      popup_text_failed: "Translation failed. Please retry.",
    })[key] || key,
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

jest.mock("../../components/ApiProviderIcon", () => {
  const React = require("react");

  return ({ apiType }) =>
    React.createElement("span", {
      "data-provider-api": apiType,
      "aria-hidden": true,
    });
});

// 手柄样式：部分 mock（requireActual 保留真实默认导出），只替换
// useTextareaGripStyle 驱动 corner-pill 等自绘样式行为。
// 同时最小 mock ./Setting：斩断 requireActual(真实 hook) → ./Setting → Storage →
// apis → query-string(ESM) 的未转译链；真实默认导出不调用 useSetting，零影响。
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: {} }),
}));
const mockUseTextareaGripStyle = jest.fn(() => "concentric-smooth");
jest.mock("../../hooks/useTextareaHeightLock", () => {
  const actual = jest.requireActual("../../hooks/useTextareaHeightLock");
  return {
    ...actual,
    __esModule: true,
    useTextareaGripStyle: () => mockUseTextareaGripStyle(),
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
    __resetSessionHeightMapForTests();
    apiTranslate.mockReset();
    document.body.innerHTML = "";
  });

  describe("popup results", () => {
    test("formats a raw unauthorized response without exposing request diagnostics", async () => {
      const rawError = `Uncaught Error: ${JSON.stringify({
        url: "https://api.openai.com/v1/chat/completions?key=secret",
        status: 401,
        statusText: "Unauthorized",
        response: { error: { message: "Fixture authorization failure (401)" } },
      })}\n    at apiTranslate (https://example.com/background.js:10:3)`;
      apiTranslate.mockRejectedValueOnce(new Error(rawError));
      const { container, root } = renderTranCont({ isPopup: true });
      await flushEffects();

      expect(
        container.querySelector(".kt-popup-text-result__error p").textContent
      ).toBe("Request failed (401): Check your API Key in Settings.");
      expect(container.textContent).not.toContain("https://");
      expect(container.textContent).not.toContain("secret");
      expect(container.textContent).not.toContain("statusText");
      expect(container.textContent).not.toContain("Uncaught Error");
      expect(
        container.querySelector(".kt-popup-text-result__retry")
      ).not.toBeNull();
      act(() => root.unmount());
    });

    test.each([
      [
        JSON.stringify({
          url: "https://example.com/translate",
          status: 429,
          response: JSON.stringify({
            error: { message: "Rate limit exceeded." },
          }),
        }),
        "Request failed (429): Rate limit exceeded.",
      ],
      [
        JSON.stringify({
          status: 503,
          response: { message: "Service temporarily unavailable." },
        }),
        "Request failed (503): Service temporarily unavailable.",
      ],
      [
        "This model does not support the selected language.",
        "This model does not support the selected language.",
      ],
      ["Unauthorized", "Check your API Key in Settings."],
      [
        JSON.stringify({ debug: { url: "https://example.com/translate" } }),
        "Translation failed. Please retry.",
      ],
      [
        JSON.stringify([{ status: 401, url: "https://example.com/translate" }]),
        "Translation failed. Please retry.",
      ],
      [
        "https://example.com/translate\n    at apiTranslate",
        "Translation failed. Please retry.",
      ],
    ])(
      "uses a concise popup error for %s",
      async (rawError, expectedMessage) => {
        apiTranslate.mockRejectedValueOnce(new Error(rawError));
        const { container, root } = renderTranCont({ isPopup: true });
        await flushEffects();
        expect(
          container.querySelector(".kt-popup-text-result__error p").textContent
        ).toBe(expectedMessage);
        expect(container.textContent).not.toContain("https://");
        act(() => root.unmount());
      }
    );

    test("preserves raw request errors in the default selection result", async () => {
      const rawError = JSON.stringify({
        url: "https://example.com/translate",
        status: 401,
        response: { error: { message: "Unauthorized" } },
      });
      apiTranslate.mockRejectedValueOnce(new Error(rawError));
      const { container, root } = renderTranCont();
      await flushEffects();
      expect(
        container.querySelector(".MuiFormHelperText-root").textContent
      ).toBe(rawError);
      act(() => root.unmount());
    });

    test("waits for a detection-dependent target before sending one popup request", async () => {
      apiTranslate.mockResolvedValueOnce({ trText: "Detected target result" });
      const { container, root } = renderTranCont({
        isPopup: true,
        waitForSourceDetection: true,
        sourceDetectionPending: true,
      });
      await flushEffects();
      expect(apiTranslate).not.toHaveBeenCalled();
      expect(
        container
          .querySelector(".kt-popup-text-result")
          .getAttribute("aria-busy")
      ).toBe("true");
      expect(
        container.querySelector(".kt-popup-text-result__loading")
      ).not.toBeNull();

      act(() => {
        root.render(
          <TranCont
            text="hello"
            fromLang="auto"
            toLang="en"
            apiSlug="openai"
            transApis={[baseApiSetting]}
            isPopup
            waitForSourceDetection
            sourceDetectionPending={false}
            detectedLang="zh-CN"
          />
        );
      });
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(apiTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "hello",
          fromLang: "auto",
          toLang: "en",
        })
      );
      expect(
        container.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Detected target result");
      act(() => root.unmount());
    });

    test("preserves ordinary selection requests while optional detection is pending", async () => {
      apiTranslate.mockResolvedValueOnce({ trText: "Selection result" });
      const { container, root } = renderTranCont({
        sourceDetectionPending: true,
      });
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(container.querySelector("textarea").value).toBe(
        "Selection result"
      );
      act(() => root.unmount());
    });

    test("uses the shared streaming request and enables actions for partial text", async () => {
      const deferred = createDeferred();
      apiTranslate.mockReturnValueOnce(deferred.promise);
      const { container, root } = renderTranCont({ isPopup: true });
      await flushEffects();
      const result = container.querySelector(".kt-popup-text-result");
      expect(container.querySelector("textarea")).toBeNull();
      expect(result.getAttribute("aria-busy")).toBe("true");
      expect(
        result.querySelectorAll(
          ".kt-popup-text-result__actions button:disabled"
        )
      ).toHaveLength(2);
      expect(
        result.querySelector(".kt-popup-text-result__provider").textContent
      ).toBe("OpenAI");
      expect(apiTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "hello",
          apiSetting: baseApiSetting,
          textFormat: "text",
          onStreamChunk: expect.any(Function),
        })
      );

      await act(async () => {
        apiTranslate.mock.calls[0][0].onStreamChunk({ text: "Partial result" });
      });
      expect(
        result.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Partial result");
      expect(result.querySelector("[data-copy-text]").dataset.copyText).toBe(
        "Partial result"
      );
      expect(
        result.querySelector("[data-speech-text]").dataset.speechText
      ).toBe("Partial result");

      await act(async () => {
        deferred.resolve({ trText: "Final result" });
        await deferred.promise;
      });
      expect(
        result.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Final result");
      expect(result.getAttribute("aria-busy")).toBe("false");
      expect(result.querySelector(".kt-popup-text-result__loading")).toBeNull();
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      act(() => root.unmount());
    });

    test("moves single-provider actions between toolbar hosts without restarting a request", async () => {
      const deferred = createDeferred();
      apiTranslate.mockReturnValueOnce(deferred.promise);
      const firstToolbar = document.createElement("div");
      const secondToolbar = document.createElement("div");
      document.body.append(firstToolbar, secondToolbar);
      const { container, root } = renderTranCont({
        isPopup: true,
        showProvider: false,
        actionContainer: firstToolbar,
      });
      await flushEffects();
      const signal = apiTranslate.mock.calls[0][0].signal;
      expect(
        firstToolbar.querySelector(".kt-popup-text-result__actions")
      ).not.toBeNull();
      expect(
        container.querySelector(".kt-popup-text-result__header")
      ).toBeNull();
      expect(
        container.querySelector(".kt-popup-text-result__provider")
      ).toBeNull();

      act(() => {
        root.render(
          <TranCont
            text="hello"
            fromLang="auto"
            toLang="zh-CN"
            apiSlug="openai"
            transApis={[baseApiSetting]}
            isPopup
            showProvider={false}
            actionContainer={secondToolbar}
          />
        );
      });
      await flushEffects();
      expect(
        firstToolbar.querySelector(".kt-popup-text-result__actions")
      ).toBeNull();
      expect(
        secondToolbar.querySelector(".kt-popup-text-result__actions")
      ).not.toBeNull();
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      expect(signal.aborted).toBe(false);

      await act(async () => {
        deferred.resolve({ trText: "Toolbar result" });
        await deferred.promise;
      });
      expect(
        secondToolbar.querySelector("[data-copy-text]").dataset.copyText
      ).toBe("Toolbar result");
      expect(
        container.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Toolbar result");
      act(() => root.unmount());
      expect(
        secondToolbar.querySelector(".kt-popup-text-result__actions")
      ).toBeNull();
    });

    test("appends keyed provider results without refetching an existing provider", async () => {
      apiTranslate.mockImplementation(({ apiSetting }) =>
        Promise.resolve({ trText: `${apiSetting.apiSlug} result` })
      );
      const container = document.createElement("div");
      const toolbar = document.createElement("div");
      document.body.append(container, toolbar);
      const root = createRoot(container);
      const apis = [baseApiSetting, googleApiSetting];
      const renderResults = (slugs) => {
        act(() => {
          root.render(
            <>
              {slugs.map((apiSlug) => (
                <TranCont
                  key={apiSlug}
                  text="hello"
                  fromLang="auto"
                  toLang="zh-CN"
                  apiSlug={apiSlug}
                  transApis={[...apis]}
                  isPopup
                  showProvider={slugs.length > 1}
                  actionContainer={slugs.length === 1 ? toolbar : null}
                />
              ))}
            </>
          );
        });
      };
      renderResults(["openai"]);
      await flushEffects();
      const firstResult = container.querySelector('[data-api-slug="openai"]');
      const firstSignal = apiTranslate.mock.calls[0][0].signal;
      expect(
        firstResult.querySelector(".kt-popup-text-result__provider")
      ).toBeNull();
      expect(toolbar.querySelector("[data-copy-text]").dataset.copyText).toBe(
        "openai result"
      );

      renderResults(["openai", "google"]);
      await flushEffects();
      expect(container.querySelector('[data-api-slug="openai"]')).toBe(
        firstResult
      );
      expect(container.querySelectorAll(".kt-popup-text-result")).toHaveLength(
        2
      );
      expect(
        firstResult.querySelector(".kt-popup-text-result__provider").textContent
      ).toBe("OpenAI");
      expect(
        toolbar.querySelector(".kt-popup-text-result__actions")
      ).toBeNull();
      expect(
        apiTranslate.mock.calls.map(([args]) => args.apiSetting.apiSlug)
      ).toEqual(["openai", "google"]);
      expect(firstSignal.aborted).toBe(false);

      renderResults(["openai"]);
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(firstSignal.aborted).toBe(false);
      expect(toolbar.querySelector("[data-copy-text]").dataset.copyText).toBe(
        "openai result"
      );
      act(() => root.unmount());
    });

    test("retries errors per provider and keeps an explicit reload independent", async () => {
      apiTranslate
        .mockRejectedValueOnce(new Error("Provider unavailable"))
        .mockResolvedValueOnce({ trText: "Retry result" })
        .mockResolvedValueOnce({ trText: "Reload result" });
      const { container, root } = renderTranCont({ isPopup: true });
      await flushEffects();
      const error = container.querySelector(".kt-popup-text-result__error");
      expect(error.getAttribute("role")).toBe("alert");
      expect(error.textContent).toContain("Provider unavailable");
      expect(
        container.querySelectorAll(
          ".kt-popup-text-result__actions button:disabled"
        )
      ).toHaveLength(2);
      act(() => {
        error
          .querySelector(".kt-popup-text-result__retry")
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flushEffects();
      expect(
        container.querySelector(".kt-popup-text-result__error")
      ).toBeNull();
      expect(
        container.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Retry result");
      expect(apiTranslate).toHaveBeenCalledTimes(2);

      act(() => {
        root.render(
          <TranCont
            text="hello"
            fromLang="auto"
            toLang="zh-CN"
            apiSlug="openai"
            transApis={[baseApiSetting]}
            isPopup
            requestRevision={1}
          />
        );
      });
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(3);
      expect(
        container.querySelector(".kt-popup-text-result__content").textContent
      ).toBe("Reload result");
      act(() => root.unmount());
    });

    test("keeps an empty provider section and disabled actions without sending a request", async () => {
      const { container, root } = renderTranCont({ text: "", isPopup: true });
      await flushEffects();
      expect(
        container.querySelector(".kt-popup-text-result__provider").textContent
      ).toBe("OpenAI");
      expect(
        container.querySelector(".kt-popup-text-result__empty").textContent
      ).toBe("popup_text_result_empty");
      expect(
        container.querySelectorAll(
          ".kt-popup-text-result__actions button:disabled"
        )
      ).toHaveLength(2);
      expect(apiTranslate).not.toHaveBeenCalled();
      act(() => root.unmount());
    });

    test("does not clear a selection result height memory when the popup is empty", async () => {
      apiTranslate.mockResolvedValueOnce({ trText: "Selection result" });
      const selection = renderTranCont();
      await flushEffects();
      act(() => {
        selection.container
          .querySelector('[role="slider"]')
          .dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
          );
      });
      const rememberedHeight = __getSessionHeightMapForTests().get(
        "trancont-result:openai"
      );
      expect(rememberedHeight).toBeGreaterThan(0);

      const popup = renderTranCont({ text: "", isPopup: true });
      await flushEffects();
      expect(
        __getSessionHeightMapForTests().get("trancont-result:openai")
      ).toBe(rememberedHeight);
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      act(() => {
        popup.root.unmount();
        selection.root.unmount();
      });
    });
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
    expect(getComputedStyle(textarea).resize).toBe("none");
    // 内容门控（空内容 → 不在场）：空态结果框不渲染手柄。
    expect(
      textarea.closest(".MuiInputBase-root").querySelector('[role="slider"]')
    ).toBeNull();
    expect(textarea.placeholder).toBe("playground_translation_empty_result");
    expect(container.querySelector("button[data-copy-text]")).toBeNull();
    expect(apiTranslate).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("shows the drawn grip once a result arrives and locks the root height on keyboard adjust", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const resultTextarea = container.querySelector(
      '.kt-translation-result textarea:not([aria-hidden="true"])'
    );
    expect(resultTextarea.value).toBe("译文");
    const resultRoot = resultTextarea.closest(".MuiInputBase-root");
    // 内容门控（有内容 → 在场）。
    const grip = resultRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    expect(grip.getAttribute("aria-label")).toBe("field_resize_height");
    act(() => {
      grip.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    expect(resultRoot.classList).toContain("kt-height-locked");
    expect(resultRoot.style.height).toBe("64px");
    act(() => root.unmount());
  });

  test("clearing the result releases the locked height completely", async () => {
    __resetSessionHeightMapForTests();
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const resultTextarea = container.querySelector(
      '.kt-translation-result textarea:not([aria-hidden="true"])'
    );
    const resultRoot = resultTextarea.closest(".MuiInputBase-root");
    const grip = resultRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    act(() => {
      grip.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    expect(resultRoot.classList).toContain("kt-height-locked");

    // 清空结果（text="" 重渲染触发 setTrText("")）→ 彻底解锁：手柄消失、
    // root 类与内联高度还原。
    act(() => {
      root.render(
        <TranCont
          text=""
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="openai"
          transApis={[baseApiSetting]}
        />
      );
    });
    await flushEffects();
    expect(resultRoot.querySelector('[role="slider"]')).toBeNull();
    expect(resultRoot.classList).not.toContain("kt-height-locked");
    expect(resultRoot.style.height).toBe("");
    act(() => root.unmount());
  });

  // 重译同一原文不得清掉会话高度记忆：新请求内部 setTrText("") 只是
  // 中间态，释放判据须跟原文（text）走（契约：记忆在原文存续期内有效）。
  // 断言路径复用同 apiSlug 的二次挂载实例（会话记忆键随 apiSlug，重挂载
  // 恢复），两次断言取同一元素（.MuiInputBase-root 承载锁定类与内联高度，
  // 与上方清空释放用例同口径）。
  test("keeps the remembered height when a new request reuses the same source text", async () => {
    __resetSessionHeightMapForTests();
    apiTranslate.mockResolvedValueOnce({ trText: "第一版" });
    const first = renderTranCont();
    await flushEffects();
    const firstRoot = first.container
      .querySelector(
        '.kt-translation-result textarea:not([aria-hidden="true"])'
      )
      .closest(".MuiInputBase-root");
    const grip = firstRoot.querySelector('[role="slider"]');
    await act(async () => {
      grip.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
    });
    const locked = firstRoot.style.height;
    expect(locked).not.toBe("");
    act(() => first.root.unmount());

    // 同 apiSlug 同原文二次挂载：新请求内部会先 setTrText("") 再到达译文，
    // 记忆必须存活（修复前会被中间态清空判据误删）。
    apiTranslate.mockResolvedValueOnce({ trText: "重译" });
    const second = renderTranCont();
    await flushEffects();
    const secondRoot = second.container
      .querySelector(
        '.kt-translation-result textarea:not([aria-hidden="true"])'
      )
      .closest(".MuiInputBase-root");
    expect(secondRoot.classList).toContain("kt-height-locked");
    expect(secondRoot.style.height).toBe(locked);
    act(() => second.root.unmount());
  });

  // 并存多实例（TranForm 以 key={slug} 渲染多个结果实例）时，会话高度
  // 记忆必须按 apiSlug 隔离：共享键会让后挂载实例改写/清除先挂载实例
  // 的记忆。断言面为会话记忆内容（挂载期空内容释放 effect 会抹平 DOM
  // 级可观测性）。
  test("scopes result height memories per provider slug", async () => {
    __resetSessionHeightMapForTests();
    apiTranslate.mockResolvedValueOnce({ trText: "A译文" });
    const first = renderTranCont();
    await flushEffects();
    const aRoot = first.container
      .querySelector(
        '.kt-translation-result textarea:not([aria-hidden="true"])'
      )
      .closest(".MuiInputBase-root");
    jest.spyOn(aRoot, "offsetHeight", "get").mockReturnValue(100);
    act(() => {
      aRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(aRoot.style.height).toBe("112px");

    apiTranslate.mockResolvedValueOnce({ trText: "B译文" });
    const second = renderTranCont({
      apiSlug: "google",
      transApis: [googleApiSetting],
    });
    await flushEffects();
    const bRoot = second.container
      .querySelector(
        '.kt-translation-result textarea:not([aria-hidden="true"])'
      )
      .closest(".MuiInputBase-root");
    act(() => {
      bRoot
        .querySelector('[role="slider"]')
        .dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
        );
    });
    expect(bRoot.style.height).toBe("64px");

    // 两条会话记忆并存：A 实例的 112 不被 B 实例的 64 改写或清除。
    const memories = [...__getSessionHeightMapForTests().values()].sort(
      (a, b) => a - b
    );
    expect(memories).toEqual([64, 112]);
    act(() => first.root.unmount());
    act(() => second.root.unmount());
  });

  test("renders an accessible read-only result with copy and speech actions", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const result = container.querySelector(".kt-translation-result");
    expect(result).not.toBeNull();
    const textarea = result.querySelector('textarea:not([aria-hidden="true"])');
    expect(textarea.value).toBe("译文");
    expect(textarea.readOnly).toBe(true);
    expect(textarea.getAttribute("aria-label")).toBe(
      "translated_text - OpenAI"
    );
    expect(result.querySelector("[data-copy-text]").dataset.copyText).toBe(
      "译文"
    );
    expect(result.querySelector("[data-speech-text]").dataset.speechText).toBe(
      "译文"
    );
    act(() => root.unmount());
  });

  test.each([undefined, ""])(
    "identifies a provider without a display name (%s) by its slug",
    async (apiName) => {
      apiTranslate.mockResolvedValueOnce({ trText: "Translated result" });
      const { container, root } = renderTranCont({
        transApis: [{ ...baseApiSetting, apiName }],
      });
      await flushEffects();

      expect(container.querySelector("label").textContent).toBe(
        "translated_text - openai"
      );
      expect(
        container.querySelector("textarea").getAttribute("aria-label")
      ).toBe("translated_text - openai");
      expect(container.querySelector('[role="status"]').textContent).toBe(
        "translated_text - openai: Translated result"
      );
      act(() => root.unmount());
    }
  );

  test.each(["success", "error"])(
    "announces the final %s without announcing streaming chunks",
    async (outcome) => {
      const deferred = createDeferred();
      apiTranslate.mockReturnValueOnce(deferred.promise);
      const { container, root } = renderTranCont();
      await flushEffects();

      const status = container.querySelector('[role="status"]');
      expect(status).not.toBeNull();
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.getAttribute("aria-atomic")).toBe("true");
      expect(status.textContent).toBe("");

      act(() => {
        apiTranslate.mock.calls[0][0].onStreamChunk({
          text: "Partial translation",
        });
      });
      expect(container.querySelector("textarea").value).toBe(
        "Partial translation"
      );
      expect(status.textContent).toBe("");

      await act(async () => {
        if (outcome === "success") {
          deferred.resolve({ trText: "Final translation" });
        } else {
          deferred.reject(new Error("Translation failed"));
        }
        await deferred.promise.catch(() => {});
      });

      expect(container.querySelector('[role="status"]')).toBe(status);
      expect(status.textContent).toBe(
        `translated_text - OpenAI: ${
          outcome === "success" ? "Final translation" : "Translation failed"
        }`
      );
      act(() => root.unmount());
    }
  );

  test.each(["", " \t\r\n "])(
    "keeps the result empty for empty or whitespace source %j",
    async (text) => {
      const { container, root } = renderTranCont({ text });
      await flushEffects();

      const textarea = container.querySelector(
        'textarea[readonly]:not([aria-hidden="true"])'
      );
      expect(textarea.value).toBe("");
      expect(textarea.getAttribute("aria-busy")).toBe("false");
      expect(container.querySelector("[data-copy-text]")).toBeNull();
      expect(apiTranslate).not.toHaveBeenCalled();
      act(() => root.unmount());
    }
  );

  test("keeps the result empty when automatic detection matches the target language", async () => {
    apiTranslate.mockResolvedValueOnce({
      trText: "hello",
      srLang: "en",
      srCode: "en",
      isSame: true,
    });
    const { container, root } = renderTranCont({
      text: "hello",
      fromLang: "auto",
      toLang: "en",
    });
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "hello",
        fromLang: "auto",
        toLang: "en",
      })
    );
    const textarea = container.querySelector(
      'textarea[readonly]:not([aria-hidden="true"])'
    );
    expect(textarea.value).toBe("");
    expect(textarea.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    act(() => root.unmount());
  });

  test("keeps the result empty when a successful translation returns no text", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "", isSame: false });
    const { container, root } = renderTranCont();
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    const textarea = container.querySelector(
      'textarea[readonly]:not([aria-hidden="true"])'
    );
    expect(textarea.value).toBe("");
    expect(textarea.getAttribute("aria-busy")).toBe("false");
    expect(container.querySelector("[data-copy-text]")).toBeNull();
    act(() => root.unmount());
  });

  test("keeps the copy action hidden until translation text exists", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValueOnce(deferred.promise);
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector(
      'textarea[readonly]:not([aria-hidden="true"])'
    );
    expect(textarea.getAttribute("aria-busy")).toBe("true");
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
    expect(textarea.getAttribute("aria-busy")).toBe("false");
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

describe("TranCont textarea grip style", () => {
  beforeEach(() => {
    __resetSessionHeightMapForTests();
    apiTranslate.mockReset();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mockUseTextareaGripStyle.mockReset();
    mockUseTextareaGripStyle.mockReturnValue("concentric-smooth");
  });

  test("corner-pill renders the grip with the selected variant and locks resize", async () => {
    mockUseTextareaGripStyle.mockReturnValue("corner-pill");
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector(
      '.kt-translation-result textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    const grip = fieldRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    expect(getComputedStyle(textarea).resize).toBe("none");
    expect(grip.querySelector("svg path").getAttribute("d")).toBe(
      "M14 6V9.5C14 11.985 11.985 14 9.5 14H6"
    );
    act(() => root.unmount());
  });

  // B1：hidden = 完全不渲染手柄 + textarea 原生 resize 回退（红：现实现
  // 渲染空图形手柄且 resize 压成 none）。
  test("hidden variant renders no grip and restores native resize", async () => {
    mockUseTextareaGripStyle.mockReturnValue("hidden");
    apiTranslate.mockResolvedValueOnce({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector(
      '.kt-translation-result textarea:not([aria-hidden="true"])'
    );
    expect(textarea.style.resize).toBe("vertical");
    expect(
      textarea.closest(".MuiInputBase-root").querySelector('[role="slider"]')
    ).toBeNull();
    act(() => root.unmount());
  });

  // 意见 A：grip 样式切到 hidden 时自动释放会话高度锁（红：现实现残留
  // kt-height-locked 与内联高度，字段被永久钉死）。
  test("switching to hidden releases the session height lock", async () => {
    mockUseTextareaGripStyle.mockReturnValue("concentric-smooth");
    apiTranslate.mockResolvedValue({ trText: "译文" });
    const { container, root } = renderTranCont();
    await flushEffects();

    const textarea = container.querySelector(
      '.kt-translation-result textarea:not([aria-hidden="true"])'
    );
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    const grip = fieldRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    await act(async () => {
      grip.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");

    mockUseTextareaGripStyle.mockReturnValue("hidden");
    // 以新元素重渲染：复用同一元素对象会被 React 判等跳过提交。
    await act(async () =>
      root.render(
        <TranCont
          text="hello"
          fromLang="auto"
          toLang="zh-CN"
          apiSlug="openai"
          transApis={[baseApiSetting]}
        />
      )
    );
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("");
    act(() => root.unmount());
  });
});
