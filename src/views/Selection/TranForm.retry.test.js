/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiTranslate } from "../../apis";
import { mountShadowHost } from "../../libs/shadowHost";
import TranForm from "./TranForm";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));
jest.mock("./DictCont", () => () => null);
jest.mock("./AiDictCont", () => () => null);
jest.mock("./SugCont", () => () => null);
jest.mock("./Zdic", () => () => null);
jest.mock("./CopyBtn", () => () => null);
jest.mock("./AudioBtn", () => ({ BrowserTtsBtn: () => null }));

const baseProps = {
  apiSlugs: ["openai"],
  fromLang: "en",
  toLang: "zh-CN",
  toLang2: "-",
  transApis: [
    {
      apiSlug: "openai",
      apiName: "OpenAI",
      apiType: "OpenAI",
      useStream: true,
      streamRenderMode: "realtime",
    },
  ],
  langDetector: "-",
  enDict: "-",
  enSug: "-",
  aiDictApiSlug: "-",
  autoFocusInput: false,
  popupStyle: true,
};

function TranslationPanel({ initialText = "Source text", marker, ...props }) {
  const [text, setText] = useState(initialText);
  return (
    <div data-marker={marker}>
      <TranForm {...baseProps} {...props} text={text} setText={setText} />
    </div>
  );
}

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Explicit translation submissions", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    apiTranslate.mockReset();
    apiTranslate.mockResolvedValue({ trText: "Translated text" });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderPanel = async (props = {}) => {
    act(() => root.render(<TranslationPanel {...props} />));
    await flushEffects();
  };
  const input = () =>
    container.querySelector('textarea:not([aria-hidden="true"])');
  const submitButton = () =>
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "translate"
    );
  const updateDraft = (value) => {
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setValue.call(input(), value);
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const pressEnter = (options = {}) => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    act(() => input().dispatchEvent(event));
    return event;
  };

  test.each(["button", "Ctrl+Enter", "Cmd+Enter"])(
    "retries a failed request for unchanged text with %s",
    async (action) => {
      apiTranslate.mockRejectedValueOnce(new Error("Temporary network error"));
      await renderPanel();
      expect(container.textContent).toContain("Temporary network error");
      expect(apiTranslate).toHaveBeenCalledTimes(1);
      const firstRequest = apiTranslate.mock.calls[0][0];

      if (action === "button") {
        expect(submitButton().disabled).toBe(false);
        act(() => submitButton().click());
      } else {
        pressEnter({
          ctrlKey: action === "Ctrl+Enter",
          metaKey: action === "Cmd+Enter",
        });
      }
      await flushEffects();

      expect(apiTranslate).toHaveBeenCalledTimes(2);
      const retryRequest = apiTranslate.mock.calls[1][0];
      expect(retryRequest.text).toBe(firstRequest.text);
      expect(retryRequest.apiSetting).toBe(firstRequest.apiSetting);
      // Successful providers may still reuse their cache during a retry.
      expect(retryRequest.useCache).not.toBe(false);
      expect(firstRequest.signal.aborted).toBe(true);
      expect(retryRequest.signal.aborted).toBe(false);
      expect(container.textContent).toContain("Translated text");
      expect(container.textContent).not.toContain("Temporary network error");
    }
  );

  test("submits an entire edited draft beyond 5000 characters once", async () => {
    const longText = "Long source text ".repeat(400).trim();
    await renderPanel();
    expect(input().hasAttribute("maxLength")).toBe(false);
    updateDraft(`  ${longText}  `);
    expect(input().value).toBe(`  ${longText}  `);
    expect(
      container.querySelector(".kt-popup-translation-input__footer span")
        .textContent
    ).toBe(String(longText.length + 4));
    expect(apiTranslate).toHaveBeenCalledTimes(1);

    act(() => submitButton().click());
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(2);
    expect(apiTranslate.mock.calls.map(([request]) => request.text)).toEqual([
      "Source text",
      longText,
    ]);
  });

  test("retries all selected providers without enabling a disabled provider", async () => {
    apiTranslate.mockRejectedValue(new Error("Temporary network error"));
    await renderPanel({
      apiSlugs: ["openai", "google", "disabled"],
      transApis: [
        ...baseProps.transApis,
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        {
          apiSlug: "disabled",
          apiName: "Disabled",
          apiType: "OpenAI",
          isDisabled: true,
        },
      ],
    });
    expect(apiTranslate).toHaveBeenCalledTimes(2);
    apiTranslate.mockResolvedValue({ trText: "Recovered translation" });

    act(() => submitButton().click());
    await flushEffects();

    expect(
      apiTranslate.mock.calls.map(([request]) => request.apiSetting.apiSlug)
    ).toEqual(["openai", "google", "openai", "google"]);
    expect(
      [...container.querySelectorAll(".kt-popup-translation-result__body")].map(
        (result) => result.textContent
      )
    ).toEqual(["Recovered translation", "Recovered translation"]);
  });

  test("retries a failed provider while another selected provider is pending", async () => {
    const pending = createDeferred();
    apiTranslate
      .mockRejectedValueOnce(new Error("Temporary network error"))
      .mockReturnValueOnce(pending.promise);
    await renderPanel({
      apiSlugs: ["openai", "second"],
      transApis: [
        ...baseProps.transApis,
        { ...baseProps.transApis[0], apiSlug: "second", apiName: "Second" },
      ],
    });
    const pendingRequest = apiTranslate.mock.calls[1][0];

    act(() => submitButton().click());
    await flushEffects();

    expect(
      apiTranslate.mock.calls.map(([request]) => request.apiSetting.apiSlug)
    ).toEqual(["openai", "second", "openai"]);
    expect(pendingRequest.signal.aborted).toBe(false);
    await act(async () => {
      pending.resolve({ trText: "Pending provider completed" });
      await pending.promise;
    });
    expect(container.textContent).toContain("Translated text");
    expect(container.textContent).toContain("Pending provider completed");
    expect(apiTranslate).toHaveBeenCalledTimes(3);
  });

  test("keeps a pending attempt on retry and replaces it only for edited input", async () => {
    const first = createDeferred();
    const retry = createDeferred();
    apiTranslate
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise);
    await renderPanel();
    const firstRequest = apiTranslate.mock.calls[0][0];
    act(() => firstRequest.onStreamChunk({ text: "First partial result" }));

    act(() => submitButton().click());
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(firstRequest.signal.aborted).toBe(false);

    updateDraft("Changed source text");
    act(() => submitButton().click());
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(2);
    const retryRequest = apiTranslate.mock.calls[1][0];
    expect(retryRequest.text).toBe("Changed source text");
    expect(firstRequest.signal.aborted).toBe(true);
    expect(retryRequest.signal.aborted).toBe(false);

    await act(async () => {
      retryRequest.onStreamChunk({ text: "Retry partial result" });
      firstRequest.onStreamChunk({ text: "Stale stream" });
      first.resolve({ trText: "Stale response" });
      await first.promise;
    });
    expect(container.textContent).toContain("Retry partial result");
    expect(container.textContent).not.toContain("Stale");

    await act(async () => {
      retry.resolve({ trText: "Retry completed" });
      await retry.promise;
    });
    expect(container.textContent).toContain("Retry completed");
  });

  test("keeps the active request while editing, blurring, or rerendering", async () => {
    apiTranslate.mockImplementation(() => new Promise(() => {}));
    await renderPanel();
    const request = apiTranslate.mock.calls[0][0];
    act(() => input().focus());
    updateDraft("Unsubmitted draft");
    act(() => input().blur());
    await renderPanel({ marker: "unrelated presentation update" });

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(request.signal.aborted).toBe(false);
  });

  test("does not retry for a repeated key or unfinished IME composition", async () => {
    await renderPanel();
    expect(pressEnter({ repeat: true }).defaultPrevented).toBe(true);
    expect(pressEnter({ isComposing: true }).defaultPrevented).toBe(false);
    await flushEffects();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
  });

  test("does not turn unchanged full-form blur commits into retries", async () => {
    await renderPanel({ popupStyle: false, isPlaygound: true, toLang2: "en" });
    act(() => input().focus());
    act(() => input().blur());
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(1);

    act(() => input().focus());
    updateDraft("Updated full-form source");
    act(() => input().blur());
    await flushEffects();
    expect(apiTranslate).toHaveBeenCalledTimes(2);
    expect(apiTranslate.mock.calls[1][0].text).toBe("Updated full-form source");
  });

  test("keeps a draft during fullscreen reparenting and commits only a later blur", async () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    shadowRoot.appendChild(container);
    const section = document.createElement("section");
    document.body.appendChild(section);
    section.moveBefore = undefined;
    let fullscreenElement = null;
    const originalFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement"
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const cleanupMount = mountShadowHost(host);
    let appendChildSpy;

    try {
      await renderPanel({ popupStyle: false, isPlaygound: true });
      act(() => input().focus());
      updateDraft("  Draft before fullscreen  ");
      const appendChild = section.appendChild;
      appendChildSpy = jest
        .spyOn(section, "appendChild")
        .mockImplementation((node) => {
          // jsdom does not emit the browser's synchronous reparenting blur.
          input().blur();
          return appendChild.call(section, node);
        });

      act(() => {
        fullscreenElement = section;
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      await flushEffects();

      expect(host.parentNode).toBe(section);
      expect(shadowRoot.activeElement).toBe(input());
      expect(input().value).toBe("  Draft before fullscreen  ");
      expect(apiTranslate).toHaveBeenCalledTimes(1);

      act(() => input().blur());
      await flushEffects();
      expect(apiTranslate).toHaveBeenCalledTimes(2);
      expect(apiTranslate.mock.calls[1][0].text).toBe(
        "Draft before fullscreen"
      );
    } finally {
      appendChildSpy?.mockRestore();
      cleanupMount();
      host.remove();
      section.remove();
      if (originalFullscreen) {
        Object.defineProperty(
          document,
          "fullscreenElement",
          originalFullscreen
        );
      } else {
        delete document.fullscreenElement;
      }
    }
  });
});
