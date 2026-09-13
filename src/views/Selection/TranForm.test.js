/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import TranForm, { formatLanguageOptionName } from "./TranForm";
import { apiDict } from "../../apis";
import { tryDetectLang } from "../../libs/detect";
import { mountShadowHost } from "../../libs/shadowHost";

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

  return () => React.createElement("div", { "data-testid": "default-dict" });
});

jest.mock("./Zdic", () => () => null);
jest.mock("./SugCont", () => () => null);

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
        expect(getComputedStyle(textarea).resize).toBe("vertical");

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
    expect(setText).toHaveBeenCalledWith("clipboard text");

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
});
