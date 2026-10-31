/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TranForm, { formatLanguageOptionName } from "./TranForm";
import { apiDict } from "../../apis";
import { tryDetectLang } from "../../libs/detect";
import { mountShadowHost } from "../../libs/shadowHost";
import { __resetSessionHeightMapForTests } from "../../hooks/useTextareaHeightLock";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../apis", () => ({
  apiDict: jest.fn(),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../libs/detect", () => ({
  tryDetectLang: jest.fn(async () => "en"),
}));

// 手柄样式：部分 mock（requireActual 保留真实默认导出与 __resetSessionHeightMapForTests
// 具名导出，整模块 mock 会击穿后者），只替换 useTextareaGripStyle 驱动模式。
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

jest.mock("react-markdown", () => {
  const React = require("react");

  return ({ children }) => React.createElement("div", null, children);
});

jest.mock("./TranCont", () => {
  const React = require("react");

  return ({
    apiSlug,
    text,
    toLang,
    translateVariants,
    detectedLang,
    sourceDetectionPending,
  }) =>
    React.createElement("div", {
      "data-testid": "tran-cont",
      "data-api-slug": apiSlug,
      "data-text": text,
      "data-to-lang": toLang,
      "data-translate-variants": String(translateVariants),
      "data-detected-lang": detectedLang,
      "data-source-detection-pending": String(sourceDetectionPending),
    });
});

jest.mock("./DictCont", () => {
  const React = require("react");

  return function MockDictionary({
    source,
    toLang,
    apiSetting,
    translateVariants,
  }) {
    return React.createElement("div", {
      "data-testid": "default-dict",
      "data-source-sentence": source?.sentence || "",
      "data-source-url": source?.url || "",
      "data-to-lang": toLang,
      "data-api-slug": apiSetting?.apiSlug || "",
      "data-translate-variants": String(translateVariants),
    });
  };
});

jest.mock("./Zdic", () => () => null);
jest.mock("./SugCont", () => {
  const React = require("react");

  return ({ text, enSug, toLang, apiSetting, translateVariants }) =>
    React.createElement("div", {
      "data-testid": "suggestions",
      "data-text": text,
      "data-en-sug": enSug,
      "data-to-lang": toLang,
      "data-api-slug": apiSetting?.apiSlug || "",
      "data-translate-variants": String(translateVariants),
    });
});

jest.mock("./AudioBtn", () => {
  const React = require("react");

  return {
    BrowserTtsBtn: () =>
      React.createElement("button", { type: "button" }, "speak"),
  };
});

jest.mock("./CopyBtn", () => {
  const React = require("react");

  return () => React.createElement("button", { type: "button" }, "copy");
});

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderTranForm(
  props = {},
  { shadow = false, component: Component = TranForm } = {}
) {
  const container = document.createElement("div");
  container.className = "kt-m3-root";
  const host = shadow ? document.createElement("div") : container;
  document.body.appendChild(host);
  if (shadow) host.attachShadow({ mode: "open" }).appendChild(container);
  const root = createRoot(container);
  const defaultProps = {
    text: "library",
    setText: jest.fn(),
    apiSlugs: [],
    fromLang: "en",
    toLang: "zh-CN",
    toLang2: "-",
    transApis: [
      {
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
        dictPrompt: "Dictionary prompt",
      },
    ],
    simpleStyle: true,
    langDetector: "-",
    enDict: "Bing",
    enSug: "-",
    aiDictApiSlug: "openai",
    selectionContext: "The library is open.",
  };
  const render = (nextProps = {}) => {
    root.render(<Component {...defaultProps} {...props} {...nextProps} />);
  };

  act(() => render());

  return {
    container,
    host,
    root,
    rerender(nextProps) {
      act(() => render(nextProps));
    },
  };
}

describe("TranForm startup settings", () => {
  const remoteDefaults = {
    fromLang: "fr",
    toLang: "de",
    toLang2: "it",
    langDetector: "Google",
    enDict: "Youdao",
    enSug: "Baidu",
  };
  const readDefaults = (container) =>
    Object.fromEntries(
      Object.keys(remoteDefaults).map((name) => [
        name,
        container.querySelector(`input[name="${name}"]`).value,
      ])
    );
  let view;

  const renderPendingForm = () =>
    renderTranForm({
      text: "",
      simpleStyle: false,
      isPlaygound: true,
      autoFocusInput: false,
      initialSettingsReady: false,
    });

  afterEach(() => {
    act(() => view.root.unmount());
    view.host.remove();
  });

  test("adopts synchronized defaults when startup finishes without remounting the form", () => {
    view = renderPendingForm();
    const textarea = view.container.querySelector("textarea");
    expect(readDefaults(view.container).toLang).toBe("zh-CN");
    view.rerender(remoteDefaults);
    expect(readDefaults(view.container).toLang).toBe("zh-CN");

    view.rerender({ ...remoteDefaults, initialSettingsReady: true });

    expect(readDefaults(view.container)).toEqual(remoteDefaults);
    expect(view.container.querySelector("textarea")).toBe(textarea);
  });

  test("preserves user choices and draft text after startup when defaults change again", () => {
    view = renderPendingForm();
    view.rerender({ ...remoteDefaults, initialSettingsReady: true });
    const textarea = view.container.querySelector("textarea");
    act(() => {
      Simulate.change(view.container.querySelector('input[name="toLang"]'), {
        target: { value: "ja" },
      });
      Simulate.focus(textarea);
      Simulate.change(textarea, { target: { value: "Unsubmitted draft" } });
    });
    expect(readDefaults(view.container).toLang).toBe("ja");

    view.rerender({
      ...remoteDefaults,
      initialSettingsReady: true,
      fromLang: "es",
      toLang: "ko",
      toLang2: "ru",
      langDetector: "Baidu",
      enDict: "Bing",
      enSug: "Youdao",
    });

    expect(readDefaults(view.container)).toEqual({
      ...remoteDefaults,
      toLang: "ja",
    });
    expect(textarea.value).toBe("Unsubmitted draft");
  });
});

function mountInFullscreen(host) {
  const originalFullscreen = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenElement"
  );
  const player = document.createElement("section");
  document.body.appendChild(player);
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: player,
  });
  const cleanupMount = mountShadowHost(host);
  return () => {
    cleanupMount();
    player.remove();
    if (originalFullscreen) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreen);
    } else {
      delete document.fullscreenElement;
    }
  };
}

describe.each([false, true, "fullscreen"])(
  "TranForm menu keyboard access (shadow: %s)",
  (shadow) => {
    let view;
    let focusRoot;
    let cleanupFullscreen;

    beforeEach(async () => {
      document.body.innerHTML = "";
      jest.spyOn(document, "hasFocus").mockReturnValue(true);
      view = renderTranForm(
        {
          simpleStyle: false,
          autoFocusInput: false,
          enDict: "-",
          aiDictApiSlug: "-",
          apiSlugs: ["alpha"],
          transApis: [
            { apiSlug: "alpha", apiName: "Alpha", apiType: "OpenAI" },
            { apiSlug: "beta", apiName: "Beta", apiType: "OpenAI" },
            { apiSlug: "bravo", apiName: "Bravo", apiType: "OpenAI" },
          ],
        },
        { shadow }
      );
      cleanupFullscreen =
        shadow === "fullscreen" ? mountInFullscreen(view.host) : null;
      focusRoot = view.container.getRootNode();
      await flushEffects();
    });

    afterEach(() => {
      act(() => view.root.unmount());
      cleanupFullscreen?.();
      view.host.remove();
      jest.restoreAllMocks();
    });

    const input = (name) =>
      view.container.querySelector(`input[name="${name}"]`);
    const trigger = (name) =>
      input(name).parentElement.querySelector('[role="combobox"]');
    const list = () => view.container.querySelector('[role="listbox"]');
    const options = () =>
      Array.from(list().querySelectorAll('[role="option"]'));
    const press = (key, extra = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
        ...extra,
      });
      act(() => focusRoot.activeElement.dispatchEvent(event));
      return event;
    };
    const open = async (name) => {
      act(() => {
        trigger(name).focus();
        trigger(name).dispatchEvent(
          new MouseEvent("mousedown", {
            button: 0,
            bubbles: true,
            composed: true,
            cancelable: true,
          })
        );
      });
      await flushEffects();
    };

    test.each(["fromLang", "toLang", "apiSlugs"])(
      "enters, navigates and dismisses %s",
      async (name) => {
        await open(name);
        const items = options();
        const selectedIndex = items.findIndex(
          (item) => item.getAttribute("aria-selected") === "true"
        );
        expect(focusRoot.activeElement).toBe(items[selectedIndex]);
        if (shadow) expect(document.activeElement).toBe(view.host);
        press("ArrowDown");
        expect(focusRoot.activeElement).toBe(
          items[Math.min(selectedIndex + 1, items.length - 1)]
        );
        press("ArrowUp");
        expect(focusRoot.activeElement).toBe(items[selectedIndex]);
        press("Home");
        expect(focusRoot.activeElement).toBe(items[0]);
        press("ArrowUp");
        expect(focusRoot.activeElement).toBe(items[0]);
        press("End");
        expect(focusRoot.activeElement).toBe(items[items.length - 1]);
        press("ArrowDown");
        expect(focusRoot.activeElement).toBe(items[items.length - 1]);
        press("Escape");
        await flushEffects();
        expect(trigger(name).getAttribute("aria-expanded")).toBe("false");
        expect(focusRoot.activeElement).toBe(trigger(name));
      }
    );

    test.each([false, true])(
      "closes on Tab and restores the select (shift: %s)",
      async (shiftKey) => {
        await open("fromLang");
        expect(press("Tab", { shiftKey }).defaultPrevented).toBe(true);
        await flushEffects();
        expect(trigger("fromLang").getAttribute("aria-expanded")).toBe("false");
        expect(focusRoot.activeElement).toBe(trigger("fromLang"));
      }
    );

    test("preserves service typeahead and multiple selection", async () => {
      await open("apiSlugs");
      const items = options();
      press("b");
      expect(focusRoot.activeElement).toBe(items[1]);
      press("b");
      expect(focusRoot.activeElement).toBe(items[2]);
      press("Enter");
      expect(input("apiSlugs").value).toBe("alpha,bravo");
      expect(trigger("apiSlugs").getAttribute("aria-expanded")).toBe("true");
      expect(focusRoot.activeElement).toBe(items[2]);
      press("Escape");
      expect(focusRoot.activeElement).toBe(trigger("apiSlugs"));
    });

    test("selects a language with Enter and restores focus", async () => {
      await open("fromLang");
      press("Home");
      press("Enter");
      await flushEffects();
      expect(input("fromLang").value).toBe("auto");
      expect(trigger("fromLang").getAttribute("aria-expanded")).toBe("false");
      expect(focusRoot.activeElement).toBe(trigger("fromLang"));
    });

    test("does not let document-based containment steal shadow focus", async () => {
      await open("fromLang");
      const items = options();
      act(() => items[0].focus());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      expect(focusRoot.activeElement).toBe(items[0]);
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      act(() => outside.focus());
      if (shadow) {
        expect(document.activeElement).toBe(outside);
      } else {
        expect(list().parentElement.contains(document.activeElement)).toBe(
          true
        );
      }
      outside.remove();
    });
  }
);

describe("TranForm Playground presentation", () => {
  beforeEach(() => {
    apiDict.mockReset();
    document.body.innerHTML = "";
  });

  test.each([
    ["English - English", "English"],
    ["AutoDetect - AutoDetect", "AutoDetect"],
    ["Résumé - Resume", "Résumé - Resume"],
    ["简体中文 - Simplified Chinese", "简体中文 - Simplified Chinese"],
  ])("formats language label %j as %j", (label, expected) => {
    expect(formatLanguageOptionName(label)).toBe(expected);
  });

  test("uses a responsive config grid and a read-only detection result", async () => {
    const { container, root } = renderTranForm({
      simpleStyle: false,
      isPlaygound: true,
      fromLang: "auto",
      toLang: "en",
      toLang2: "en",
      playgroundConfigHeader: <div data-testid="config-header" />,
    });
    await flushEffects();

    expect(
      container.querySelector(".kt-playground-config__grid")
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="config-header"]')
    ).not.toBeNull();
    expect(
      container.querySelector(".kt-playground-translator__source")
    ).not.toBeNull();
    expect(
      container.querySelector(".kt-playground-translator__empty").textContent
    ).toContain("请先选择至少一个");

    const detectionResult = container.querySelector('input[name="deLang"]');
    expect(detectionResult.readOnly).toBe(true);
    expect(detectionResult.disabled).toBe(false);

    act(() => root.unmount());
  });

  test("ignores stale language detection and keeps the newest request busy", async () => {
    const first = createDeferred();
    const second = createDeferred();
    tryDetectLang
      .mockReset()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = renderTranForm({
      text: "first",
      simpleStyle: false,
      isPlaygound: true,
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "en",
      toLang2: "fr",
      langDetector: "remote",
    });
    await flushEffects();

    view.rerender({ text: "second" });
    await flushEffects();
    const detectionResult = view.container.querySelector(
      'input[name="deLang"]'
    );
    expect(detectionResult.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      first.resolve("de");
      await first.promise;
    });
    expect(detectionResult.value).toBe("");
    expect(detectionResult.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      second.resolve("en");
      await second.promise;
    });
    expect(detectionResult.value).toBe("English");
    expect(detectionResult.getAttribute("aria-busy")).toBe("false");
    expect(
      view.container.querySelector('[data-testid="tran-cont"]').dataset.toLang
    ).toBe("fr");

    act(() => view.root.unmount());
    tryDetectLang.mockResolvedValue("en");
  });

  test("shows the service empty state when configured services are unavailable", async () => {
    const { container, root } = renderTranForm({
      simpleStyle: false,
      isPlaygound: true,
      apiSlugs: ["disabled"],
      transApis: [
        {
          apiSlug: "disabled",
          apiName: "Disabled",
          apiType: "Google",
          isDisabled: true,
        },
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
      ],
    });
    await flushEffects();

    expect(
      container.querySelector(".kt-playground-translator__empty").textContent
    ).toContain("请先选择至少一个");
    expect(container.querySelector('[data-testid="tran-cont"]')).toBeNull();

    act(() => root.unmount());
  });

  test.each([false, true])(
    "commits consecutive pointer submissions once each (shadow: %s)",
    async (shadow) => {
      // hook 的会话高度 Map 模块级存活，test.each 各变体间需隔离，
      // 否则上一变体的键盘锁定会让"清空 → 手柄不在场"断言落空。
      __resetSessionHeightMapForTests();
      const setText = jest.fn();
      function EditableTranForm(props) {
        const [text, updateText] = useState(props.text);
        return (
          <TranForm
            {...props}
            text={text}
            setText={(value) => {
              props.setText(value);
              updateText(value);
            }}
          />
        );
      }
      const { container, host, root } = renderTranForm(
        {
          text: "before",
          setText,
          simpleStyle: false,
          isPlaygound: true,
        },
        { shadow, component: EditableTranForm }
      );
      try {
        await flushEffects();
        const textarea = container.querySelector(
          ".kt-playground-translator__source textarea:not([aria-hidden='true'])"
        );
        const focusRoot = textarea.getRootNode();
        expect(textarea.classList).toContain("kt-resizable-textarea");
        expect(textarea.closest(".kt-resizable-text-field")).not.toBeNull();
        expect(
          getComputedStyle(textarea.closest(".MuiInputBase-root")).overflow
        ).toBe("visible");
        expect(getComputedStyle(textarea).resize).toBe("none");
        const fieldRoot = textarea.closest(".MuiInputBase-root");
        // 内容门控（有内容 → 在场）：初始文本 "before" 非空。
        const grip = fieldRoot.querySelector('[role="slider"]');
        expect(grip).not.toBeNull();
        expect(grip.getAttribute("aria-label")).toBe("field_resize_height");
        expect(grip.getAttribute("aria-orientation")).toBe("vertical");
        // 清空内容 → 手柄不在场；回填 → 重新在场（原生 value setter 先例：
        // TranForm.test.js 900-907）。
        const setTextareaValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set;
        act(() => {
          setTextareaValue.call(textarea, "");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(fieldRoot.querySelector('[role="slider"]')).toBeNull();
        act(() => {
          setTextareaValue.call(textarea, "before");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(fieldRoot.querySelector('[role="slider"]')).not.toBeNull();
        act(() => {
          fieldRoot
            .querySelector('[role="slider"]')
            .dispatchEvent(
              new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
            );
        });
        expect(fieldRoot.classList).toContain("kt-height-locked");
        expect(fieldRoot.style.height).toBe("64px");
        // 锁定后清空内容 → 彻底解锁：手柄消失、root 还原；回填 → 手柄
        // 重新在场且高度从默认重新开始（会话记忆已被清除）。
        act(() => {
          setTextareaValue.call(textarea, "");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(fieldRoot.querySelector('[role="slider"]')).toBeNull();
        expect(fieldRoot.classList).not.toContain("kt-height-locked");
        expect(fieldRoot.style.height).toBe("");
        act(() => {
          setTextareaValue.call(textarea, "before");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(fieldRoot.querySelector('[role="slider"]')).not.toBeNull();
        expect(fieldRoot.classList).not.toContain("kt-height-locked");

        for (const [index, draft] of ["  after  ", "  again  "].entries()) {
          // Use native focus: a still-focused input cannot emit another focus event.
          act(() => textarea.focus());
          expect(focusRoot.activeElement).toBe(textarea);
          if (shadow) expect(document.activeElement).toBe(host);
          act(() => Simulate.change(textarea, { target: { value: draft } }));

          const submitButton = container.querySelector(
            'button[title="submit"]'
          );
          expect(submitButton).not.toBeNull();
          const pointerDown = new MouseEvent("pointerdown", {
            bubbles: true,
            composed: true,
            cancelable: true,
          });
          act(() => submitButton.dispatchEvent(pointerDown));
          expect(pointerDown.defaultPrevented).toBe(true);
          expect(focusRoot.activeElement).toBe(textarea);
          expect(container.querySelector('button[title="submit"]')).toBe(
            submitButton
          );

          await act(async () => submitButton.click());
          expect(setText).toHaveBeenCalledTimes(index + 1);
          expect(setText).toHaveBeenNthCalledWith(index + 1, draft.trim());
          expect(focusRoot.activeElement).not.toBe(textarea);
          expect(textarea.value).toBe(draft.trim());
          expect(container.querySelector('button[title="submit"]')).toBeNull();
        }
      } finally {
        act(() => root.unmount());
        host.remove();
      }
    }
  );

  test("keeps multiple translation results together and spans auxiliary content", async () => {
    const { container, root } = renderTranForm({
      simpleStyle: false,
      isPlaygound: true,
      apiSlugs: ["google", "openai"],
      transApis: [
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ],
      enDict: "Bing",
    });
    await flushEffects();

    const results = container.querySelector(
      ".kt-playground-translator__results"
    );
    expect(results.querySelectorAll('[data-testid="tran-cont"]')).toHaveLength(
      2
    );
    expect(
      container
        .querySelector('[data-testid="default-dict"]')
        .closest(".kt-playground-translator__auxiliary")
    ).not.toBeNull();

    act(() => root.unmount());
  });
});

describe("TranForm AI dictionary tab", () => {
  beforeEach(() => {
    apiDict.mockReset();
    apiDict.mockResolvedValue("## library");
    document.body.innerHTML = "";
  });

  test.each([true, false])(
    "opens the AI dictionary tab once with selection context when simpleStyle is %s",
    async (simpleStyle) => {
      const { container, root } = renderTranForm({ simpleStyle });
      await flushEffects();

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(2);
      expect(
        container.querySelector('[role="tablist"]').getAttribute("aria-label")
      ).toBe("Dictionary");
      const defaultPanel = container.querySelector('[role="tabpanel"]');
      expect(tabs[0].getAttribute("aria-controls")).toBe(defaultPanel.id);
      expect(defaultPanel.getAttribute("aria-labelledby")).toBe(tabs[0].id);
      expect(apiDict).not.toHaveBeenCalled();

      await act(async () => {
        tabs[1].dispatchEvent(
          new MouseEvent("click", { bubbles: true, button: 0 })
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(apiDict).toHaveBeenCalledTimes(1);
      expect(apiDict).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "library",
          context: "The library is open.",
        })
      );
      const aiPanel = container.querySelector('[role="tabpanel"]');
      expect(tabs[1].getAttribute("aria-controls")).toBe(aiPanel.id);
      expect(aiPanel.getAttribute("aria-labelledby")).toBe(tabs[1].id);

      act(() => {
        root.unmount();
      });
    }
  );

  test("keeps the AI dictionary tab selected when text changes", async () => {
    const { container, root } = renderTranForm();
    await flushEffects();

    let tabs = container.querySelectorAll('[role="tab"]');
    await act(async () => {
      tabs[1].dispatchEvent(
        new MouseEvent("click", { bubbles: true, button: 0 })
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiDict).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <TranForm
          text="baseline"
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[
            {
              apiSlug: "openai",
              apiName: "OpenAI",
              apiType: "OpenAI",
              dictPrompt: "Dictionary prompt",
            },
          ]}
          simpleStyle
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="openai"
          selectionContext="If you create a baseline at this point."
        />
      );
    });
    await flushEffects();

    tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(apiDict).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "baseline",
        context: "If you create a baseline at this point.",
      })
    );

    act(() => {
      root.unmount();
    });
  });
});

// Stored slugs can outlive changes to API availability, API type, or prompt category.
// Recheck eligibility to avoid sending dictionary prompts to a non-AI endpoint.
describe("TranForm AI dictionary revalidates stale settings", () => {
  beforeEach(() => {
    apiDict.mockReset();
    apiDict.mockResolvedValue("## library");
    document.body.innerHTML = "";
  });

  // Unavailable AI dictionaries render no tabs; available ones render both dictionary tabs.
  // Count tabs so a localized label mismatch cannot make an absence assertion pass incorrectly.
  const tabCount = (container) =>
    container.querySelectorAll('[role="tab"]').length;

  test.each([
    [
      "the API was disabled after being chosen",
      {
        transApis: [
          {
            apiSlug: "openai",
            apiName: "OpenAI",
            apiType: "OpenAI",
            dictPrompt: "Dictionary prompt",
            isDisabled: true,
          },
        ],
      },
    ],
    [
      "the API was switched to a non-AI type",
      {
        transApis: [
          {
            apiSlug: "openai",
            apiName: "OpenAI",
            apiType: "Microsoft",
            dictPrompt: "Dictionary prompt",
          },
        ],
      },
    ],
    [
      "the API's own dictionary prompt is blank",
      {
        transApis: [
          {
            apiSlug: "openai",
            apiName: "OpenAI",
            apiType: "OpenAI",
            dictPrompt: "   ",
          },
        ],
      },
    ],
    [
      "the chosen prompt is not a dictionary prompt",
      {
        aiDictPromptSlug: "translate-en",
        prompts: [
          {
            slug: "translate-en",
            category: "translate prompt",
            systemPrompt: "Translate this",
          },
        ],
      },
    ],
    [
      "the chosen dictionary prompt is blank",
      {
        aiDictPromptSlug: "dict-en",
        prompts: [
          {
            slug: "dict-en",
            category: "dictionary prompt",
            systemPrompt: "  ",
          },
        ],
      },
    ],
  ])("hides the AI dictionary when %s", async (_case, props) => {
    const { container, root } = renderTranForm(props);
    await flushEffects();

    expect(tabCount(container)).toBe(0);
    expect(apiDict).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  test("still offers the AI dictionary when the stored settings are valid", async () => {
    const { container, root } = renderTranForm({
      aiDictPromptSlug: "dict-en",
      prompts: [
        {
          slug: "dict-en",
          category: "dictionary prompt",
          systemPrompt: "Define this word",
        },
      ],
    });
    await flushEffects();

    expect(tabCount(container)).toBe(2);

    act(() => {
      root.unmount();
    });
  });
});

describe("TranForm source input", () => {
  beforeEach(() => {
    apiDict.mockReset();
    document.body.innerHTML = "";
  });

  test("pastes clipboard text into an empty source input", async () => {
    const setText = jest.fn();
    const readText = jest.fn().mockResolvedValue("  clipboard text  ");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });
    const { container, root } = renderTranForm({
      text: "",
      setText,
      simpleStyle: false,
    });
    await flushEffects();

    const pasteButton = container.querySelector('button[title="paste"]');
    expect(pasteButton).not.toBeNull();

    await act(async () => {
      pasteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalledTimes(1);
    // Paste fills the visible draft without translating until submission.
    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    expect(sourceInput.value).toBe("clipboard text");
    expect(setText).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("keeps the paste action reachable when the draft is cleared while text exists", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "library",
      setText,
      simpleStyle: false,
    });
    await flushEffects();

    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    act(() => sourceInput.focus());
    await flushEffects();
    act(() =>
      Simulate.change(sourceInput, { target: { value: "" } })
    );

    // 草稿清空后必须回到 Paste，且绝不能出现可提交空文本的 Submit 按钮。
    expect(
      container.querySelector('button[title="paste"]')
    ).not.toBeNull();
    expect(container.querySelector('button[title="submit"]')).toBeNull();

    act(() => root.unmount());
  });

  test("shows copy while editing an unchanged draft", async () => {
    const setText = jest.fn();
    const { container, root } = renderTranForm({
      text: "library",
      setText,
      simpleStyle: false,
    });
    await flushEffects();

    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    act(() => sourceInput.focus());
    await flushEffects();

    // 未改动的草稿：不出现 Submit，保留 Copy 入口。
    // 本套件将 ./CopyBtn mock 为无 title、文本为 "copy" 的按钮（:114-118），
    // 故以按钮文本定位 Copy 入口，而非 title 属性。
    expect(container.querySelector('button[title="submit"]')).toBeNull();
    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "copy"
    );
    expect(copyButton).not.toBeUndefined();

    act(() => root.unmount());
  });

  test("invalidates a selection source after editing even when the word is restored", () => {
    const source = {
      text: "library",
      sentence: "The library is open.",
      url: "https://example.com/article",
    };
    const { container, root } = renderTranForm({
      text: "library",
      selectionSource: source,
      setText: jest.fn(),
      simpleStyle: false,
      aiDictApiSlug: "-",
    });
    const textarea = container.querySelector("textarea");
    const dictionary = () =>
      container.querySelector('[data-testid="default-dict"]');

    expect(dictionary().dataset.sourceSentence).toBe(source.sentence);
    expect(dictionary().dataset.sourceUrl).toBe(source.url);

    act(() => {
      Simulate.change(textarea, { target: { value: "other" } });
    });
    expect(dictionary().dataset.sourceSentence).toBe("");
    expect(dictionary().dataset.sourceUrl).toBe("");

    act(() => {
      Simulate.change(textarea, { target: { value: "library" } });
    });
    expect(dictionary().dataset.sourceSentence).toBe("");
    expect(dictionary().dataset.sourceUrl).toBe("");

    act(() => root.unmount());
  });

  test.each([
    { modifier: "ctrlKey", fullscreen: false },
    { modifier: "ctrlKey", fullscreen: true },
    { modifier: "metaKey", fullscreen: true },
  ])(
    "submits with $modifier+Enter (fullscreen: $fullscreen)",
    ({ modifier, fullscreen }) => {
      const setText = jest.fn();
      const { container, host, root } = renderTranForm(
        {
          text: "library",
          setText,
          simpleStyle: false,
        },
        { shadow: fullscreen }
      );
      const cleanupFullscreen = fullscreen ? mountInFullscreen(host) : null;
      const textarea = container.querySelector("textarea");
      expect(textarea.classList).toContain("kt-resizable-textarea");
      expect(textarea.closest(".kt-translation-source")).not.toBeNull();

      act(() => {
        const setTextareaValue = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value"
        ).set;
        setTextareaValue.call(textarea, "updated library");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        composed: true,
        cancelable: true,
        [modifier]: true,
        key: "Enter",
      });

      act(() => textarea.dispatchEvent(event));

      expect(event.defaultPrevented).toBe(true);
      expect(setText).toHaveBeenCalledWith("updated library");
      act(() => root.unmount());
      cleanupFullscreen?.();
    }
  );
});

describe("TranForm translation service selection", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  const openServices = async (container) => {
    const trigger = container
      .querySelector('input[name="apiSlugs"]')
      .closest(".MuiInputBase-root")
      .querySelector('[role="combobox"]');
    act(() => {
      trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await flushEffects();
    return [...container.querySelectorAll('[role="option"]')];
  };

  test("uses translationText for every translation service", async () => {
    const { container, root } = renderTranForm({
      text: "First line\nSecond line",
      translationText: "First line Second line",
      apiSlugs: ["google", "openai"],
      transApis: [
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ],
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (element) => element.dataset.text
      )
    ).toEqual(["First line Second line", "First line Second line"]);

    act(() => root.unmount());
  });

  test.each([
    ["normal", {}],
    ["popup", { popupStyle: true }],
    ["playground", { isPlaygound: true }],
  ])(
    "passes the effective target and active service to the dictionary and suggestions in the %s layout",
    async (_layout, layoutProps) => {
      const { container, root } = renderTranForm({
        text: "library",
        enSug: "Youdao",
        apiSlugs: ["microsoft"],
        toLang: "ar",
        transApis: [
          {
            apiSlug: "microsoft",
            apiName: "Microsoft",
            apiType: "Microsoft",
          },
        ],
        ...layoutProps,
      });
      await flushEffects();

      const dictionary = container.querySelector(
        '[data-testid="default-dict"]'
      );
      expect(dictionary.dataset.toLang).toBe("ar");
      expect(dictionary.dataset.apiSlug).toBe("microsoft");
      expect(dictionary.dataset.translateVariants).toBe("true");

      const suggestions = container.querySelector(
        '[data-testid="suggestions"]'
      );
      expect(suggestions.dataset.text).toBe("library");
      expect(suggestions.dataset.enSug).toBe("Youdao");
      expect(suggestions.dataset.toLang).toBe("ar");
      expect(suggestions.dataset.apiSlug).toBe("microsoft");
      expect(suggestions.dataset.translateVariants).toBe("true");

      act(() => root.unmount());
    }
  );

  test("updates the dictionary and suggestions when the target language changes", async () => {
    const { container, root } = renderTranForm({
      text: "library",
      enSug: "Youdao",
      apiSlugs: ["microsoft"],
      transApis: [
        {
          apiSlug: "microsoft",
          apiName: "Microsoft",
          apiType: "Microsoft",
        },
      ],
      simpleStyle: false,
    });
    await flushEffects();

    act(() => {
      Simulate.change(container.querySelector('input[name="toLang"]'), {
        target: { value: "ar" },
      });
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="tran-cont"]').dataset.toLang
    ).toBe("ar");
    expect(
      container.querySelector('[data-testid="default-dict"]').dataset.toLang
    ).toBe("ar");
    expect(
      container.querySelector('[data-testid="suggestions"]').dataset.toLang
    ).toBe("ar");

    act(() => root.unmount());
  });

  test("uses the secondary target for the dictionary and suggestions", async () => {
    tryDetectLang.mockResolvedValue("zh-CN");
    const { container, root } = renderTranForm({
      text: "library",
      enSug: "Youdao",
      apiSlugs: ["microsoft"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "ar",
      translateVariants: false,
      transApis: [
        {
          apiSlug: "microsoft",
          apiName: "Microsoft",
          apiType: "Microsoft",
        },
      ],
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="default-dict"]').dataset.toLang
    ).toBe("ar");
    const suggestions = container.querySelector('[data-testid="suggestions"]');
    expect(suggestions.dataset.toLang).toBe("ar");
    expect(suggestions.dataset.translateVariants).toBe("false");

    act(() => root.unmount());
  });

  test.each([false, true])(
    "switches to the secondary target when Chinese variants are disabled and simpleStyle is %s",
    async (simpleStyle) => {
      tryDetectLang.mockResolvedValue("zh-TW");
      const { container, root } = renderTranForm({
        text: "繁體中文",
        apiSlugs: ["openai"],
        fromLang: "auto",
        toLang: "zh-CN",
        toLang2: "en",
        translateVariants: false,
        simpleStyle,
      });
      await flushEffects();

      const translation = container.querySelector('[data-testid="tran-cont"]');
      expect(translation.dataset.toLang).toBe("en");
      expect(translation.dataset.translateVariants).toBe("false");

      act(() => root.unmount());
    }
  );

  test("keeps the primary target when Chinese variants are enabled", async () => {
    tryDetectLang.mockResolvedValue("zh-TW");
    const { container, root } = renderTranForm({
      text: "繁體中文",
      apiSlugs: ["openai"],
      fromLang: "auto",
      toLang: "zh-CN",
      toLang2: "en",
      translateVariants: true,
    });
    await flushEffects();

    expect(
      container.querySelector('[data-testid="tran-cont"]').dataset.toLang
    ).toBe("zh-CN");

    act(() => root.unmount());
  });

  test.each([true, false])(
    "does not translate with explicitly empty service slugs when simpleStyle is %s",
    async (simpleStyle) => {
      const { container, root } = renderTranForm({
        apiSlugs: [],
        simpleStyle,
      });
      await flushEffects();

      expect(container.querySelector('[data-testid="tran-cont"]')).toBeNull();

      act(() => root.unmount());
    }
  );

  test.each([undefined, null])(
    "uses the first enabled service when the selection is %s",
    async (apiSlugs) => {
      const { container, root } = renderTranForm({ apiSlugs });
      await flushEffects();

      expect(
        [...container.querySelectorAll('[data-testid="tran-cont"]')].map(
          (result) => result.dataset.apiSlug
        )
      ).toEqual(["openai"]);

      act(() => root.unmount());
    }
  );

  test.each([
    ["stale", ["removed", "disabled"], []],
    ["missing", undefined, ["google"]],
    ["explicitly empty", [], []],
  ])(
    "adds a service to the displayed selection when saved slugs are %s",
    async (_label, apiSlugs, initialSlugs) => {
      const { container, root } = renderTranForm({
        apiSlugs,
        transApis: [
          {
            apiSlug: "disabled",
            apiName: "Disabled",
            apiType: "Google",
            isDisabled: true,
          },
          { apiSlug: "google", apiName: "Google", apiType: "Google" },
          { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
        ],
        simpleStyle: false,
      });
      await flushEffects();

      const resultSlugs = () =>
        [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
          el.getAttribute("data-api-slug")
        );
      expect(resultSlugs()).toEqual(initialSlugs);

      const services = await openServices(container);
      const openAiOption = services.find(
        (option) => option.getAttribute("data-value") === "openai"
      );
      act(() => openAiOption.click());

      expect(resultSlugs()).toEqual([...initialSlugs, "openai"]);
      expect(openAiOption.getAttribute("aria-selected")).toBe("true");
      if (initialSlugs.length > 0) {
        expect(
          services
            .find((option) => option.getAttribute("data-value") === "google")
            .getAttribute("aria-selected")
        ).toBe("true");
      }

      act(() => root.unmount());
    }
  );

  test("removes stale services and allows changing or clearing valid selections", async () => {
    const { container, root } = renderTranForm({
      apiSlugs: ["removed", "disabled", "google"],
      enSug: "Youdao",
      transApis: [
        {
          apiSlug: "disabled",
          apiName: "Disabled",
          apiType: "Google",
          isDisabled: true,
        },
        { apiSlug: "google", apiName: "Google", apiType: "Google" },
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ],
      simpleStyle: false,
    });
    await flushEffects();

    const resultSlugs = () =>
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      );
    expect(resultSlugs()).toEqual(["google"]);
    expect(
      container.querySelector('[data-testid="suggestions"]').dataset.apiSlug
    ).toBe("google");
    const services = await openServices(container);
    expect(services.map((option) => option.getAttribute("data-value"))).toEqual(
      ["google", "openai"]
    );
    const googleOption = services.find(
      (option) => option.getAttribute("data-value") === "google"
    );
    const openAiOption = services.find(
      (option) => option.getAttribute("data-value") === "openai"
    );

    act(() => openAiOption.click());
    expect(resultSlugs()).toEqual(["google", "openai"]);

    act(() => googleOption.click());
    expect(resultSlugs()).toEqual(["openai"]);
    expect(
      container.querySelector('[data-testid="suggestions"]').dataset.apiSlug
    ).toBe("openai");

    act(() => openAiOption.click());
    expect(resultSlugs()).toEqual([]);

    act(() => root.unmount());
  });

  test.each([false, true])(
    "passes only the current complete-input detection result when simpleStyle is %s",
    async (simpleStyle) => {
      const firstDetection = createDeferred();
      const secondDetection = createDeferred();
      tryDetectLang.mockImplementation((value) =>
        value === "first" ? firstDetection.promise : secondDetection.promise
      );
      const transApis = [
        { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
      ];
      const baseProps = {
        setText: jest.fn(),
        apiSlugs: ["openai"],
        fromLang: "auto",
        toLang: "zh-CN",
        toLang2: "-",
        transApis,
        simpleStyle,
        langDetector: "Baidu",
        enDict: "-",
        enSug: "-",
        aiDictApiSlug: "-",
      };
      const { container, root } = renderTranForm({
        ...baseProps,
        text: "first",
      });
      await flushEffects();

      act(() => {
        root.render(<TranForm {...baseProps} text="second" />);
      });
      await flushEffects();
      let translation = container.querySelector('[data-testid="tran-cont"]');
      expect(translation.dataset.detectedLang).toBe("");
      expect(translation.dataset.sourceDetectionPending).toBe("true");

      await act(async () => {
        firstDetection.resolve("fr");
        await firstDetection.promise;
      });
      translation = container.querySelector('[data-testid="tran-cont"]');
      expect(translation.dataset.detectedLang).toBe("");
      expect(translation.dataset.sourceDetectionPending).toBe("true");

      await act(async () => {
        secondDetection.resolve("de");
        await secondDetection.promise;
      });
      translation = container.querySelector('[data-testid="tran-cont"]');
      expect(translation.dataset.detectedLang).toBe("de");
      expect(translation.dataset.sourceDetectionPending).toBe("false");

      act(() => root.unmount());
    }
  );

  test("keeps user-selected services when text changes", async () => {
    const setText = jest.fn();
    const transApis = [
      {
        apiSlug: "google",
        apiName: "Google",
        apiType: "Google",
      },
      {
        apiSlug: "openai",
        apiName: "OpenAI",
        apiType: "OpenAI",
      },
    ];
    const { container, root } = renderTranForm({
      text: "hello",
      setText,
      apiSlugs: ["google"],
      transApis,
      simpleStyle: false,
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    const apiSlugsInput = container.querySelector('input[name="apiSlugs"]');
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector(
        '[role="combobox"], [role="button"], [aria-haspopup="listbox"]'
      );
    await act(async () => {
      apiSlugsButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      await Promise.resolve();
    });
    expect(document.body.style.overflow).toBe("");
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(
      getComputedStyle(container.querySelector(".MuiPopover-root")).zIndex
    ).toBe("2147483647");

    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.render(
        <TranForm
          text="hello world"
          setText={setText}
          apiSlugs={["google"]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
        />
      );
    });
    await flushEffects();

    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google", "openai"]);

    act(() => {
      root.unmount();
    });
  });
});

describe("TranForm input focus and external text synchronization", () => {
  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
  });

  test("focuses the original text input when auto focus is enabled", async () => {
    const { container, root } = renderTranForm({
      text: "",
      simpleStyle: false,
      autoFocusInput: true,
    });
    await flushEffects();

    expect(document.activeElement).toBe(container.querySelector("textarea"));
    act(() => root.unmount());
  });

  test("does not focus the original text input when auto focus is disabled", async () => {
    const { container, root } = renderTranForm({
      text: "bug",
      simpleStyle: false,
      autoFocusInput: false,
    });
    await flushEffects();

    expect(document.activeElement).not.toBe(
      container.querySelector("textarea")
    );
    act(() => root.unmount());
  });

  test("focuses the source when expanding simple mode with auto focus disabled", async () => {
    const view = renderTranForm({
      text: "Clipboard source text",
      simpleStyle: true,
      autoFocusInput: false,
      enDict: "-",
      aiDictApiSlug: "-",
    });
    await flushEffects();
    expect(view.container.querySelector("textarea")).toBeNull();

    view.rerender({ simpleStyle: false });
    await flushEffects();

    const input = view.container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Clipboard source text");
    expect(input.selectionStart).toBe(input.value.length);
    expect(input.selectionEnd).toBe(input.value.length);

    act(() => view.root.unmount());
  });

  test("focuses after asynchronous initialization allows auto focus", async () => {
    const props = {
      text: "",
      simpleStyle: false,
      autoFocusInput: false,
    };
    const { container, root } = renderTranForm(props);
    await flushEffects();
    const input = container.querySelector("textarea");
    expect(document.activeElement).not.toBe(input);

    act(() => {
      root.render(
        <TranForm
          text=""
          setText={jest.fn()}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={[]}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput
        />
      );
    });
    await flushEffects();

    expect(document.activeElement).toBe(input);
    act(() => root.unmount());
  });

  test("keeps clipboard text visible and submits it after blur while editing", async () => {
    const setText = jest.fn();
    const transApis = [];
    const { container, root } = renderTranForm({
      text: "",
      setText,
      transApis,
      simpleStyle: false,
      autoFocusInput: true,
      syncExternalTextWhileEditing: true,
    });
    await flushEffects();

    act(() => {
      root.render(
        <TranForm
          text="bug"
          setText={setText}
          apiSlugs={[]}
          fromLang="en"
          toLang="zh-CN"
          toLang2="-"
          transApis={transApis}
          simpleStyle={false}
          langDetector="-"
          enDict="Bing"
          enSug="-"
          aiDictApiSlug="-"
          autoFocusInput={false}
          syncExternalTextWhileEditing
        />
      );
    });
    await flushEffects();

    const input = container.querySelector("textarea");
    expect(input.value).toBe("bug");

    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    expect(setText).toHaveBeenLastCalledWith("bug");
    act(() => root.unmount());
  });

  test("keeps a pasted draft when entering edit mode while text is unchanged", async () => {
    const setText = jest.fn();
    const readText = jest.fn().mockResolvedValue("Pasted draft text");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });
    const { container, root } = renderTranForm({
      text: "",
      setText,
      transApis: [],
      simpleStyle: false,
      autoFocusInput: false,
      syncExternalTextWhileEditing: true,
    });
    await flushEffects();

    const pasteButton = container.querySelector('button[title="paste"]');
    expect(pasteButton).not.toBeNull();
    await act(async () => {
      pasteButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    expect(sourceInput.value).toBe("Pasted draft text");
    expect(setText).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("still overwrites an editing draft when external text actually changes", async () => {
    const setText = jest.fn();
    const transApis = [];
    const { container, rerender, root } = renderTranForm({
      text: "first selection",
      setText,
      transApis,
      simpleStyle: false,
      autoFocusInput: false,
      syncExternalTextWhileEditing: true,
    });
    await flushEffects();

    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    act(() => sourceInput.focus());
    await flushEffects();

    // 键入未提交草稿并先断言该草稿在输入框显示
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setValue.call(sourceInput, "Uncommitted draft");
      sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushEffects();
    expect(sourceInput.value).toBe("Uncommitted draft");

    // 随后重渲染并断言输入框内容被外部文本覆盖为 "next selection"
    rerender({ text: "next selection" });
    await flushEffects();

    expect(sourceInput.value).toBe("next selection");
    act(() => root.unmount());
  });

  test("overwrites an editing draft with host text when the sync flag flips on while text is unchanged", async () => {
    const setText = jest.fn();
    const transApis = [];
    const { container, rerender, root } = renderTranForm({
      text: "current selection",
      setText,
      transApis,
      simpleStyle: false,
      autoFocusInput: false,
      syncExternalTextWhileEditing: false,
    });
    await flushEffects();

    const sourceInput = container.querySelector(
      '.kt-translation-source textarea:not([aria-hidden="true"])'
    );
    act(() => sourceInput.focus());
    // 用户键入未提交草稿，随后宿主把 syncExternalTextWhileEditing 打开；
    // text 未变，但选项 false→true 迁移应被视为一次同步触发，把宿主文本
    // 覆盖到输入框（覆盖草稿）。
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setValue.call(sourceInput, "Unsubmitted draft");
      sourceInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushEffects();
    expect(sourceInput.value).toBe("Unsubmitted draft");
    rerender({ syncExternalTextWhileEditing: true });
    await flushEffects();

    expect(sourceInput.value).toBe("current selection");
    expect(setText).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("TranForm API selection persistence (apiSlugsStorageKey)", () => {
  const TEST_STORAGE_KEY = "kt-test-tranform-api-slugs";
  const mockApis = [
    { apiSlug: "google", apiName: "Google", apiType: "Google" },
    { apiSlug: "openai", apiName: "OpenAI", apiType: "OpenAI" },
    { apiSlug: "deepl", apiName: "DeepL", apiType: "DeepL", isDisabled: true },
  ];

  beforeEach(() => {
    apiDict.mockReset();
    tryDetectLang.mockResolvedValue("en");
    document.body.innerHTML = "";
    window.localStorage.removeItem(TEST_STORAGE_KEY);
  });

  test("P4 Red: 用户多选接口后写入 storageKey，并在重新挂载后恢复选择", async () => {
    // 第一次挂载：无持久化值，从 prop initApiSlugs=[] 启动
    const view = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 初始没有 TranCont
    expect(
      view.container.querySelectorAll('[data-testid="tran-cont"]')
    ).toHaveLength(0);

    // 用户在下拉菜单勾选 openai
    const apiSlugsInput = view.container.querySelector(
      'input[name="apiSlugs"]'
    );
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector(
        '[role="combobox"], [role="button"], [aria-haspopup="listbox"]'
      );
    await act(async () => {
      apiSlugsButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      await Promise.resolve();
    });
    await act(async () => {
      [...document.body.querySelectorAll('[role="option"]')]
        .find((option) => option.getAttribute("data-value") === "openai")
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    // 第一次已出现 openai
    expect(
      [...view.container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    // 卸载组件（模拟页签切换 / 路由跳转）
    act(() => view.root.unmount());
    document.body.innerHTML = "";

    // localStorage 中已写入
    expect(window.localStorage.getItem(TEST_STORAGE_KEY)).toBe(
      JSON.stringify(["openai"])
    );

    // 第二次挂载（即使 prop apiSlugs 仍传空数组，也从 storageKey 恢复）
    const utils = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 重新挂载后恢复了用户选择的 openai
    expect(
      [...utils.container.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    act(() => utils.root.unmount());
  });

  test("P4: 存储中存在非法 JSON、非数组或脏值时异常降级，回落既有默认行为", async () => {
    // 损坏值
    window.localStorage.setItem(TEST_STORAGE_KEY, "invalid-json{{");
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 无崩溃，保持 prop 默认的 google
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    act(() => root.unmount());
  });

  test("P4: 存储中的已删除或已禁用接口被自动过滤", async () => {
    // 存储中含：已禁用的 deepl 与已删除的 ghost
    window.localStorage.setItem(
      TEST_STORAGE_KEY,
      JSON.stringify(["openai", "deepl", "ghost"])
    );
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: [],
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 只恢复有效的 openai，已禁用的 deepl 与不存在的 ghost 被过滤
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["openai"]);

    act(() => root.unmount());
  });

  test("P4: 有效存储空数组 [] 表示用户显式未选择，不被 prop 默认值覆盖", async () => {
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify([]));
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"], // prop 默认传 google
      transApis: mockApis,
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    });
    await flushEffects();

    // 用户显式选空 → 不展示任何翻译引擎
    expect(
      container.querySelectorAll('[data-testid="tran-cont"]')
    ).toHaveLength(0);

    act(() => root.unmount());
  });

  test("P4: 未传 apiSlugsStorageKey 时不读写 localStorage，保持既有行为", async () => {
    // 即使 localStorage 中有该键，未传 prop 也绝不读取
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(["openai"]));
    const { container, root } = renderTranForm({
      simpleStyle: false,
      apiSlugs: ["google"],
      transApis: mockApis,
      // 无 apiSlugsStorageKey
    });
    await flushEffects();

    // 仍使用 prop 的 google，不使用存储的 openai
    expect(
      [...container.querySelectorAll('[data-testid="tran-cont"]')].map((el) =>
        el.getAttribute("data-api-slug")
      )
    ).toEqual(["google"]);

    act(() => root.unmount());
  });

  test("Fix3 Red：恢复 pending 恰好读取一次 storage 且不回退用户窗口期内选择", async () => {
    // 前置（防假绿 Red）：必须预置有效可恢复选择——旧实现的确定性重读依赖
    // 恢复分支实际执行 setApiSlugs 触发重渲染；无预置时置 null 无 setState，
    // 计数恒 1，断言在坏代码上也绿。
    window.localStorage.setItem(TEST_STORAGE_KEY, JSON.stringify(["alpha"]));
    const getItemSpy = jest.spyOn(Storage.prototype, "getItem");
    const keyReads = () =>
      getItemSpy.mock.calls.filter(([key]) => key === TEST_STORAGE_KEY).length;

    const firstGenApis = [
      { apiSlug: "alpha", apiName: "Alpha", apiType: "OpenAI" },
      { apiSlug: "beta", apiName: "Beta", apiType: "OpenAI" },
    ];
    const baseProps = {
      text: "library",
      setText: jest.fn(),
      apiSlugs: [],
      fromLang: "en",
      toLang: "zh-CN",
      toLang2: "-",
      transApis: firstGenApis,
      simpleStyle: false,
      langDetector: "-",
      enDict: "Bing",
      enSug: "-",
      aiDictApiSlug: "-",
      apiSlugsStorageKey: TEST_STORAGE_KEY,
    };
    // 不解构 container：DOM 查询走 document.body（eslint-plugin-testing-library
    // 对 renderTranForm——名称含 "render" 子串——返回的 container 变量查询
    // 会被 no-container 误报，body 级查询为既有豁免先例）。
    const { root } = renderTranForm(baseProps);
    await flushEffects();

    // 断言 1：挂载完成恢复恰好读取一次 storage（旧实现渲染期条件被终态
    // 重新武装 → 确定性重读 → 计数 2 → Red）。
    expect(keyReads()).toBe(1);
    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["alpha"]);

    // 用户经真实 Select 改选为恰好 ["beta"]（恢复后 alpha 已选中：
    // 先加选 beta，再取消 alpha）。
    const apiSlugsInput = document.body.querySelector('input[name="apiSlugs"]');
    const apiSlugsButton = apiSlugsInput
      .closest(".MuiInputBase-root")
      .querySelector(
        '[role="combobox"], [role="button"], [aria-haspopup="listbox"]'
      );
    await act(async () => {
      apiSlugsButton.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
      await Promise.resolve();
    });
    const clickOption = async (slug) => {
      await act(async () => {
        [...document.body.querySelectorAll('[role="option"]')]
          .find((option) => option.getAttribute("data-value") === slug)
          .dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
      });
    };
    await clickOption("beta");
    await clickOption("alpha");

    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["beta"]);

    // 断言 2（双断言缺一不可）：二代 transApis（新数组引用，仍含 alpha 与
    // beta）重渲染后，恢复既不得重读 storage，也不得把用户选择回退为
    // 渲染期陈旧快照。
    const secondGenApis = [
      { apiSlug: "alpha", apiName: "Alpha", apiType: "OpenAI" },
      { apiSlug: "beta", apiName: "Beta", apiType: "OpenAI" },
    ];
    // act 回调内以具名中转函数重渲染（同 no-unnecessary-act 子串匹配规避）。
    const mountWithApis = (apis) => {
      root.render(<TranForm {...baseProps} transApis={apis} />);
    };
    act(() => {
      mountWithApis(secondGenApis);
    });
    await flushEffects();

    expect(keyReads()).toBe(1);
    expect(
      [...document.body.querySelectorAll('[data-testid="tran-cont"]')].map(
        (el) => el.getAttribute("data-api-slug")
      )
    ).toEqual(["beta"]);

    act(() => root.unmount());
  });
});

describe("TranForm textarea grip style", () => {
  afterEach(() => {
    mockUseTextareaGripStyle.mockReset();
    mockUseTextareaGripStyle.mockReturnValue("concentric-smooth");
    document.body.innerHTML = "";
  });

  test("corner-pill renders the grip with the selected variant and locks resize", () => {
    mockUseTextareaGripStyle.mockReturnValue("corner-pill");
    const { container, root } = renderTranForm({
      text: "library",
      simpleStyle: false,
    });
    const textarea = container.querySelector("textarea");
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
  test("hidden variant renders no grip and restores native resize", () => {
    mockUseTextareaGripStyle.mockReturnValue("hidden");
    const { container, root } = renderTranForm({
      text: "library",
      simpleStyle: false,
    });
    const textarea = container.querySelector("textarea");
    expect(textarea.style.resize).toBe("vertical");
    expect(
      textarea.closest(".MuiInputBase-root").querySelector('[role="slider"]')
    ).toBeNull();
    act(() => root.unmount());
  });

  // 意见 A：grip 样式切到 hidden 时自动释放会话高度锁（红：现实现残留
  // kt-height-locked 与内联高度，字段被永久钉死）。
  test("switching to hidden releases the session height lock", () => {
    mockUseTextareaGripStyle.mockReturnValue("concentric-smooth");
    const { container, root, rerender } = renderTranForm({
      text: "library",
      simpleStyle: false,
    });
    const textarea = container.querySelector("textarea");
    const fieldRoot = textarea.closest(".MuiInputBase-root");
    const grip = fieldRoot.querySelector('[role="slider"]');
    expect(grip).not.toBeNull();
    act(() => {
      grip.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" })
      );
    });
    expect(fieldRoot.classList).toContain("kt-height-locked");

    mockUseTextareaGripStyle.mockReturnValue("hidden");
    rerender({});
    expect(fieldRoot.classList).not.toContain("kt-height-locked");
    expect(fieldRoot.style.height).toBe("");
    act(() => root.unmount());
  });
});

test("collapsing Playground configuration preserves source, settings, and result instances", () => {
  jest.useFakeTimers();
  const view = renderTranForm({
    isPlaygound: true,
    simpleStyle: false,
    apiSlugs: ["openai"],
    enDict: "-",
    aiDictApiSlug: "-",
    playgroundConfigHeader: <div data-testid="persistent-header">Header</div>,
    playgroundConfigExtra: (
      <input data-testid="extra-setting" defaultValue="temporary terms" />
    ),
  });
  const extra = view.container.querySelector('[data-testid="extra-setting"]');
  const result = view.container.querySelector('[data-testid="tran-cont"]');
  const source = view.container.querySelector("textarea");
  const service = view.container.querySelector('input[name="apiSlugs"]');
  view.rerender({ playgroundConfigExpanded: false });
  act(() => jest.advanceTimersByTime(1000));
  expect(
    getComputedStyle(
      view.container.querySelector("#kt-playground-config-content")
    ).visibility
  ).toBe("hidden");
  expect(
    view.container.querySelector('[data-testid="persistent-header"]')
  ).not.toBeNull();
  expect(view.container.querySelector('[data-testid="extra-setting"]')).toBe(
    extra
  );
  expect(view.container.querySelector('[data-testid="tran-cont"]')).toBe(
    result
  );
  expect(view.container.querySelector("textarea")).toBe(source);
  expect(view.container.querySelector('input[name="apiSlugs"]')).toBe(service);
  view.rerender({ playgroundConfigExpanded: true });
  act(() => jest.advanceTimersByTime(1000));
  expect(extra.value).toBe("temporary terms");
  act(() => view.root.unmount());
  view.host.remove();
  jest.useRealTimers();
});
