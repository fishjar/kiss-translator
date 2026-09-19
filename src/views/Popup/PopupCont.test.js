let mockRealTouchControl = false;
jest.mock(
  "../../components/TouchTranslateControl",
  () => (props) =>
    mockRealTouchControl
      ? require("react").createElement(
          jest.requireActual("../../components/TouchTranslateControl").default,
          props
        )
      : null
);
jest.mock("../../hooks/MouseHover", () => ({
  useMouseHoverSetting: () => ({ updateMouseHoverSetting: jest.fn() }),
}));
/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getVisibleServices } from "./services";
import { tryClearCaches } from "../../libs/cache";
import { saveRule } from "../../libs/rules";
import { isCurrentPopupDocument } from "../../libs/popupDocument";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_RULE_EDITOR,
  MSG_SAVE_RULE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_TRANS_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
  MSG_TRANSINPUT_TOGGLE,
} from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DANGEROUS_STYLE_CODE = "position: fixed; inset: 0; z-index: 2147483647;";
const mockStyles = Array.from({ length: 7 }, (_, index) => {
  const isBuiltin = index < 5;
  return {
    styleSlug: `style_${index}`,
    styleName: `Style ${index}`,
    styleCode:
      index === 6 ? DANGEROUS_STYLE_CODE : `color: rgb(${index}, 0, 0);`,
    source: isBuiltin ? "builtin" : "custom",
    isBuiltin,
  };
});
const mockUpdateSetting = jest.fn();
const mockGetCurTab = jest.fn();
const mockSendBgMsg = jest.fn(async () => []);
const mockSendTabMsg = jest.fn(async () => undefined);
const mockSendTopFrameMsg = jest.fn(async () => undefined);
const mockCss = jest.fn(() => "mock-preview-class");
let mockIsExt = false;
let mockContextSetting = { blacklist: "" };

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: mockContextSetting,
    updateSetting: mockUpdateSetting,
  }),
}));

jest.mock("../../hooks/CustomStyles", () => ({
  ...jest.requireActual("../../hooks/CustomStyles"),
  useAllTextStyles: () => ({ allTextStyles: mockStyles }),
}));

jest.mock("@emotion/react", () => ({
  ...jest.requireActual("@emotion/react"),
  ClassNames: ({ children }) => children({ css: mockCss }),
}));

jest.mock("../../libs/msg", () => ({
  getCurTab: (...args) => mockGetCurTab(...args),
  sendBgMsg: (...args) => mockSendBgMsg(...args),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
  sendTopFrameMsg: (...args) => mockSendTopFrameMsg(...args),
}));

jest.mock("../../libs/client", () => ({
  get isExt() {
    return mockIsExt;
  },
}));
jest.mock("../../libs/cache", () => ({ tryClearCaches: jest.fn() }));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("../../libs/rules", () => ({ saveRule: jest.fn() }));
jest.mock("../../libs/popupDocument", () => ({
  isCurrentPopupDocument: jest.fn(async () => true),
}));

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openAdvancedOptions(container) {
  act(() => container.querySelector(".kt-popup-disclosure").click());
}

function renderPopupCont(
  props = {},
  { statefulRule = false, statefulSetting = false } = {}
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const setting = {
    transApis: [
      {
        apiSlug: "google",
        apiName: "Google",
        apiType: "Google",
      },
    ],
    tranboxSetting: { transOpen: true },
    mouseHoverSetting: { useMouseHover: false },
    inputRule: { transOpen: true },
    shortcuts: { toggleTranslate: ["AltLeft", "KeyQ"] },
  };
  const rule = {
    transOpen: "true",
    apiSlug: "google",
    fromLang: "auto",
    toLang: "zh-CN",
    textStyle: "style_6",
    autoScan: "true",
    transOnly: "false",
    hasRichText: "true",
    scanAll: "false",
    isPlainText: false,
  };

  const popupProps = {
    rule,
    setting,
    setRule: jest.fn(),
    setSetting: jest.fn(),
    handleOpenSetting: jest.fn(),
    ...props,
  };

  function StatefulPopup() {
    const [currentRule, setCurrentRule] = useState({ ...rule, ...props.rule });
    const [currentSetting, setCurrentSetting] = useState({
      ...setting,
      ...props.setting,
    });
    return (
      <PopupCont
        {...popupProps}
        rule={currentRule}
        setRule={setCurrentRule}
        setting={currentSetting}
        setSetting={setCurrentSetting}
      />
    );
  }

  act(() => {
    root.render(
      statefulRule || statefulSetting ? (
        <StrictMode>
          <StatefulPopup />
        </StrictMode>
      ) : (
        <PopupCont {...popupProps} />
      )
    );
  });

  return {
    container,
    rerender(nextProps) {
      act(() => root.render(<PopupCont {...popupProps} {...nextProps} />));
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("PopupCont capability parity", () => {
  beforeEach(() => {
    mockRealTouchControl = false;
    mockIsExt = false;
    mockGetCurTab.mockReset();
    mockGetCurTab.mockResolvedValue({ url: "https://example.com/page" });
    tryClearCaches.mockReset();
    tryClearCaches.mockResolvedValue(true);
    mockSendBgMsg.mockReset();
    mockSendBgMsg.mockResolvedValue([]);
    mockSendTabMsg.mockReset();
    mockSendTabMsg.mockResolvedValue(undefined);
    mockSendTopFrameMsg.mockReset();
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    isCurrentPopupDocument.mockResolvedValue(true);
    mockUpdateSetting.mockReset();
    mockUpdateSetting.mockResolvedValue({ changed: true });
    mockContextSetting = { blacklist: "" };
    saveRule.mockReset();
    saveRule.mockResolvedValue({ changed: true });
    mockCss.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test("real touch controls appear below the hero and use the page receiver", async () => {
    mockRealTouchControl = true;
    window.PointerEvent = MouseEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    const processActions = jest.fn(({ args }) => ({
      touchTranslate: {
        mode: args?.mode || "off",
        supported: true,
        direction: "right",
      },
    }));
    const view = renderPopupCont({ processActions, isContent: true });
    try {
      await flushEffects();
      const control = view.container.querySelector("[data-kiss-touch-ui]");
      const hero = view.container.querySelector(".kt-popup-hero");
      expect(
        hero.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      act(() =>
        control
          .querySelector('[role="combobox"]')
          .dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, button: 0 })
          )
      );
      await act(async () =>
        document.querySelector('[data-value="tap"]').click()
      );
      expect(control.querySelector('[role="combobox"]').textContent).toBe(
        "touch_tap"
      );
    } finally {
      view.cleanup();
    }
  }, 15000);

  test("real touch controls remain silent without an injected receiver", async () => {
    mockRealTouchControl = true;
    window.PointerEvent = MouseEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    const view = renderPopupCont();
    try {
      await flushEffects();
      expect(view.container.querySelector("[data-kiss-touch-ui]")).toBeNull();
      expect(view.container.textContent).not.toContain("touch_failed");
      expect(view.container.querySelector(".kt-popup-hero")).not.toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("keeps site actions available while scene controls and tools are collapsed", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      const disclosure = view.container.querySelector(".kt-popup-disclosure");
      const advancedPanel = document.getElementById(
        disclosure.getAttribute("aria-controls")
      );
      const site = view.container.querySelector(".kt-popup-site");

      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(advancedPanel.hidden).toBe(true);
      expect(advancedPanel.querySelector("button")).toBeNull();
      expect(
        Array.from(site.querySelectorAll("button")).map(
          (button) => button.textContent
        )
      ).toEqual(["save_rule", "add_to_blacklist"]);
      expect(site.querySelector("select").title).toBe(
        site.querySelector("select").value
      );

      openAdvancedOptions(view.container);

      expect(disclosure.getAttribute("aria-expanded")).toBe("true");
      expect(advancedPanel.hidden).toBe(false);
      expect(advancedPanel.querySelectorAll(".kt-popup-scene")).toHaveLength(3);
      expect(
        Array.from(
          advancedPanel.querySelectorAll(".kt-popup-advanced-tools button")
        ).map((button) => button.textContent)
      ).toEqual(["rule_editor_open", "clear_cache"]);

      disclosure.focus();
      act(() => disclosure.click());

      expect(disclosure.getAttribute("aria-expanded")).toBe("false");
      expect(advancedPanel.hidden).toBe(true);
      expect(advancedPanel.querySelector("button")).toBeNull();
      expect(document.activeElement).toBe(disclosure);
    } finally {
      view.cleanup();
    }
  });

  test("keeps cache clearing available without a site domain", async () => {
    getCurTab.mockResolvedValueOnce({ url: "" });
    const view = renderPopupCont();
    try {
      await flushEffects();
      const siteButtons = view.container.querySelectorAll(
        ".kt-popup-site__actions button"
      );
      expect(siteButtons).toHaveLength(2);
      siteButtons.forEach((button) => expect(button.disabled).toBe(true));

      openAdvancedOptions(view.container);
      const clearCache = view.container.querySelector(
        'button[aria-label="clear_cache"]'
      );
      expect(clearCache.disabled).toBe(false);

      await act(async () => clearCache.click());

      expect(tryClearCaches).toHaveBeenCalledTimes(1);
      expect(
        view.container.querySelector('[role="alert"]').textContent
      ).toContain("clear_success");
    } finally {
      view.cleanup();
    }
  });

  test("opens the rule editor from the content popup without closing the page", async () => {
    const processActions = jest.fn(() => ({ ruleEditorOpened: true }));
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont({ processActions, isContent: true });
    try {
      await flushEffects();
      openAdvancedOptions(view.container);
      const openEditor = Array.from(
        view.container.querySelectorAll("button")
      ).find((button) => button.textContent === "rule_editor_open");

      await act(async () => openEditor.click());

      expect(processActions).toHaveBeenCalledWith({ action: MSG_RULE_EDITOR });
      expect(mockSendTabMsg).not.toHaveBeenCalled();
      expect(closeWindow).not.toHaveBeenCalled();
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      view.cleanup();
      closeWindow.mockRestore();
    }
  });

  test("waits for the rule editor message before closing the extension popup", async () => {
    mockIsExt = true;
    let resolveOpen;
    mockSendTopFrameMsg.mockImplementation(
      () => new Promise((resolve) => (resolveOpen = resolve))
    );
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont();
    try {
      await flushEffects();
      openAdvancedOptions(view.container);
      const openEditor = Array.from(
        view.container.querySelectorAll("button")
      ).find((button) => button.textContent === "rule_editor_open");

      act(() => openEditor.click());

      expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_RULE_EDITOR);
      expect(closeWindow).not.toHaveBeenCalled();

      await act(async () => {
        resolveOpen({ ruleEditorOpened: true });
        await Promise.resolve();
      });
      expect(closeWindow).toHaveBeenCalledTimes(1);
    } finally {
      view.cleanup();
      closeWindow.mockRestore();
    }
  });

  test("swaps both languages atomically while earlier tab messages are pending", async () => {
    const pendingReplies = [];
    mockSendTopFrameMsg.mockResolvedValue({
      rule: { fromLang: "en", toLang: "fr" },
      setting: {},
    });
    mockSendTabMsg.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingReplies.push(resolve);
        })
    );
    const view = renderPopupCont(
      { rule: { fromLang: "en", toLang: "fr" } },
      { statefulRule: true }
    );
    await flushEffects();
    const swap = view.container.querySelector(".kt-popup-swap");
    const languages = () =>
      Array.from(
        view.container.querySelectorAll(".kt-popup-language-select input")
      ).map((input) => input.value);

    expect(languages()).toEqual(["en", "fr"]);
    act(() => swap.click());
    expect(languages()).toEqual(["fr", "en"]);
    expect(mockSendTabMsg).toHaveBeenCalledTimes(1);
    expect(mockSendTabMsg).toHaveBeenNthCalledWith(1, MSG_TRANS_PUTRULE, {
      fromLang: "fr",
      toLang: "en",
    });

    act(() => swap.click());
    expect(languages()).toEqual(["en", "fr"]);
    expect(mockSendTabMsg).toHaveBeenCalledTimes(2);
    expect(mockSendTabMsg).toHaveBeenNthCalledWith(2, MSG_TRANS_PUTRULE, {
      fromLang: "en",
      toLang: "fr",
    });

    await act(async () => {
      pendingReplies[1]({ rule: { fromLang: "en", toLang: "fr" } });
      await Promise.resolve();
      pendingReplies[0]({ rule: { fromLang: "fr", toLang: "en" } });
      await Promise.resolve();
    });
    expect(languages()).toEqual(["en", "fr"]);
    expect(mockSendTabMsg).toHaveBeenCalledTimes(2);
    view.cleanup();
  });

  test("keeps consecutive content swaps current and preserves single-field actions", async () => {
    let rule = { fromLang: "en", toLang: "fr" };
    const processActions = jest.fn(({ args }) => {
      rule = { ...rule, ...args };
      return { rule };
    });
    const view = renderPopupCont(
      { rule: { fromLang: "en", toLang: "fr" }, processActions },
      { statefulRule: true }
    );
    await flushEffects();
    const swap = view.container.querySelector(".kt-popup-swap");

    await act(async () => {
      swap.click();
      swap.click();
    });

    expect(processActions).toHaveBeenCalledTimes(2);
    expect(processActions).toHaveBeenNthCalledWith(1, {
      action: MSG_TRANS_PUTRULE,
      args: { fromLang: "fr", toLang: "en" },
    });
    expect(processActions).toHaveBeenNthCalledWith(2, {
      action: MSG_TRANS_PUTRULE,
      args: { fromLang: "en", toLang: "fr" },
    });
    expect(
      Array.from(
        view.container.querySelectorAll(".kt-popup-language-select input")
      ).map((input) => input.value)
    ).toEqual(["en", "fr"]);

    await act(async () =>
      view.container.querySelector(".kt-popup-service").click()
    );
    expect(processActions).toHaveBeenCalledTimes(3);
    expect(processActions).toHaveBeenLastCalledWith({
      action: MSG_TRANS_PUTRULE,
      args: { apiSlug: "google" },
    });
    expect(mockSendTabMsg).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.cleanup();
  });

  test("keeps the active style visible and the disclosure after all visible styles", async () => {
    const view = renderPopupCont({}, { statefulRule: true });
    await flushEffects();

    const advancedButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_advanced_options"));
    act(() => advancedButton.click());
    expect(view.container.querySelectorAll("label label")).toHaveLength(0);
    expect(
      view.container.querySelector('input[aria-label="show_only_translations"]')
    ).not.toBeNull();

    let styleButtons = view.container.querySelectorAll(
      ".kt-popup-style-chip:not(.kt-popup-style-more)"
    );
    expect(styleButtons).toHaveLength(5);
    expect(
      view.container.querySelector(
        '.kt-popup-style-chip[aria-pressed="true"] small'
      ).textContent
    ).toBe("Style 6");

    const allStylesButton = view.container.querySelector(
      ".kt-popup-style-more"
    );
    expect(
      allStylesButton.parentElement.classList.contains("kt-popup-style-chips")
    ).toBe(true);
    expect(allStylesButton.textContent).toContain("+2");
    expect(allStylesButton.getAttribute("aria-label")).toBe(
      "popup_all_styles (2)"
    );
    expect(allStylesButton.getAttribute("aria-expanded")).toBe("false");
    expect(allStylesButton.nextElementSibling).toBeNull();
    allStylesButton.focus();
    act(() => allStylesButton.click());

    styleButtons = view.container.querySelectorAll(
      ".kt-popup-style-chip:not(.kt-popup-style-more)"
    );
    expect(styleButtons).toHaveLength(7);
    expect(allStylesButton.textContent).toContain("popup_collapse");
    expect(allStylesButton.getAttribute("aria-expanded")).toBe("true");
    expect(allStylesButton.previousElementSibling.textContent).toContain(
      "Style 6"
    );
    expect(allStylesButton.nextElementSibling).toBeNull();
    expect(document.activeElement).toBe(allStylesButton);

    const newlyVisibleStyle = Array.from(styleButtons).find((button) =>
      button.textContent.includes("Style 5")
    );
    newlyVisibleStyle.focus();
    act(() => newlyVisibleStyle.click());
    expect(document.activeElement).toBe(newlyVisibleStyle);
    allStylesButton.focus();
    act(() => allStylesButton.click());

    expect(
      view.container.querySelectorAll(
        ".kt-popup-style-chip:not(.kt-popup-style-more)"
      )
    ).toHaveLength(5);
    expect(
      view.container.querySelector(
        '.kt-popup-style-chip[aria-pressed="true"] small'
      ).textContent
    ).toBe("Style 5");
    expect(allStylesButton.getAttribute("aria-expanded")).toBe("false");
    expect(allStylesButton.textContent).toContain("+2");
    expect(allStylesButton.nextElementSibling).toBeNull();
    expect(document.activeElement).toBe(allStylesButton);
    view.cleanup();
  });

  test("previews built-in styles without compiling custom style code", async () => {
    const view = renderPopupCont();
    await flushEffects();

    const advancedButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_advanced_options"));
    act(() => advancedButton.click());

    const compiledStyleCode = JSON.stringify(mockCss.mock.calls);
    expect(compiledStyleCode).toContain(mockStyles[0].styleCode);
    expect(compiledStyleCode).not.toContain(DANGEROUS_STYLE_CODE);

    const customStyleButton = Array.from(
      view.container.querySelectorAll(".kt-popup-style-chip")
    ).find((button) => button.textContent.includes("Style 6"));
    expect(customStyleButton.querySelector("span").className).toBe("");
    view.cleanup();
  });

  test("waits for cache clearing before showing success", async () => {
    let resolveClear;
    tryClearCaches.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveClear = resolve;
        })
    );
    const view = renderPopupCont();
    await flushEffects();
    openAdvancedOptions(view.container);
    const clearCache = view.container.querySelector(
      'button[aria-label="clear_cache"]'
    );

    act(() => clearCache.click());
    expect(tryClearCaches).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain("clear_success");
    expect(view.container.textContent).not.toContain("clear_failed");

    await act(async () => resolveClear(true));
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("clear_success");
    view.cleanup();
  });

  test("reports cache clearing failure without a success message", async () => {
    tryClearCaches.mockResolvedValueOnce(false);
    const view = renderPopupCont();
    await flushEffects();
    openAdvancedOptions(view.container);
    const clearCache = view.container.querySelector(
      'button[aria-label="clear_cache"]'
    );

    await act(async () => clearCache.click());
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("clear_failed");
    expect(view.container.textContent).not.toContain("clear_success");
    view.cleanup();
  });

  test("restarts Snackbar timing for consecutive messages", async () => {
    const view = renderPopupCont();
    await flushEffects();
    openAdvancedOptions(view.container);
    const clearCache = view.container.querySelector(
      'button[aria-label="clear_cache"]'
    );

    await act(async () => clearCache.click());
    const firstSnackbar = document.body.querySelector(".MuiSnackbar-root");
    expect(firstSnackbar.textContent).toContain("clear_success");

    await act(async () => clearCache.click());
    const secondSnackbar = document.body.querySelector(".MuiSnackbar-root");
    expect(secondSnackbar).not.toBe(firstSnackbar);
    expect(secondSnackbar.textContent).toContain("clear_success");
    view.cleanup();
  });

  test("leaves browser popup support actions in the header menu", async () => {
    const view = renderPopupCont();
    await flushEffects();

    const supportButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_support"));

    expect(supportButton).toBeUndefined();
    expect(view.container.querySelector(".kt-popup-support")).toBeNull();
    view.cleanup();
  });

  test("preserves upstream review and support links in the content popup", async () => {
    const view = renderPopupCont({
      isContent: true,
      processActions: jest.fn(),
    });
    await flushEffects();

    const supportLinks = view.container.querySelectorAll(".kt-popup-support a");
    expect(supportLinks).toHaveLength(2);
    expect(supportLinks[0].textContent).toContain("comment_support");
    expect(supportLinks[0].href).toBe(
      "https://chromewebstore.google.com/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof/reviews"
    );
    expect(supportLinks[1].textContent).toContain("appreciate_support");
    expect(supportLinks[1].href).toBe(
      "https://github.com/fishjar/kiss-translator#%E8%B5%9E%E8%B5%8F"
    );
    view.cleanup();
  });

  test("formats stored physical shortcut codes for display", async () => {
    const view = renderPopupCont();
    await flushEffects();

    expect(
      view.container.querySelector(".kt-popup-hero__subtitle").textContent
    ).toContain("Alt+Q");
    expect(
      view.container.querySelector(".kt-popup-hero__subtitle").textContent
    ).not.toContain("AltLeft+KeyQ");
    view.cleanup();
  });

  test("keeps runtime-dependent subtitle control outside the Popup-only scope", async () => {
    const view = renderPopupCont();
    await flushEffects();
    openAdvancedOptions(view.container);

    const featureLabelNodes = Array.from(
      view.container.querySelectorAll(".kt-popup-scene__label")
    );
    const featureLabels = featureLabelNodes.map((node) => node.textContent);
    expect(featureLabels).toEqual([
      "selection_translate",
      "mousehover_translate",
      "input_translate",
    ]);
    expect(featureLabels).not.toContain("subtitle_translate");
    featureLabelNodes.forEach((node) => {
      expect(node.title).toBe(node.textContent);
    });
    view.cleanup();
  });

  test("dispatches one explicit page translation state from the main switch", async () => {
    const processActions = jest.fn(({ args }) => ({
      rule: { transOpen: args.enabled ? "true" : "false" },
    }));
    const view = renderPopupCont({ processActions }, { statefulRule: true });
    await flushEffects();

    const mainSwitch = view.container.querySelector(
      'input[aria-label="popup_translate_page"]'
    );
    await act(async () => {
      mainSwitch.click();
      await Promise.resolve();
    });

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_TRANS_TOGGLE,
      args: { enabled: false },
    });
    expect(mainSwitch.checked).toBe(false);
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.cleanup();
  });

  test("merges only a confirmed translation state from an async action", async () => {
    jest.useFakeTimers();
    let resolveAction;
    const processActions = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        })
    );
    let liveRule = {
      transOpen: "true",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    const view = renderPopupCont({ processActions, setRule });
    await flushEffects();

    const mainSwitch = view.container.querySelector(
      'input[aria-label="popup_translate_page"]'
    );
    act(() => mainSwitch.click());
    expect(liveRule.transOpen).toBe("false");
    expect(mainSwitch.disabled).toBe(true);
    expect(mainSwitch.getAttribute("aria-busy")).toBe("true");
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("true");

    act(() => view.container.querySelector(".kt-popup-hero").click());
    expect(processActions).toHaveBeenCalledTimes(1);

    liveRule = { ...liveRule, apiSlug: "deepl", toLang: "fr" };
    await act(async () => {
      resolveAction({
        rule: {
          transOpen: "false",
          apiSlug: "stale-service",
          toLang: "stale-language",
        },
      });
      await Promise.resolve();
    });

    expect(mainSwitch.disabled).toBe(false);
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("true");
    act(() => jest.runOnlyPendingTimers());
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("false");

    expect(liveRule).toMatchObject({
      transOpen: "false",
      apiSlug: "deepl",
      toLang: "fr",
    });
    expect(
      setRule.mock.calls.every(([update]) => typeof update === "function")
    ).toBe(true);
    view.cleanup();
  });

  test("uses top-frame confirmation and ignores unrelated rule fields", async () => {
    let liveRule = {
      transOpen: "true",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    mockSendTabMsg.mockResolvedValueOnce({
      rule: {
        transOpen: "false",
        apiSlug: "iframe-service",
        fromLang: "iframe-source",
        toLang: "iframe-target",
      },
    });
    mockSendTopFrameMsg.mockResolvedValueOnce({
      rule: {
        transOpen: "false",
        apiSlug: "top-frame-stale-service",
        fromLang: "top-frame-stale-source",
        toLang: "top-frame-stale-target",
      },
    });
    const view = renderPopupCont({ setRule });
    await flushEffects();

    const mainSwitch = view.container.querySelector(
      'input[aria-label="popup_translate_page"]'
    );
    await act(async () => {
      mainSwitch.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(liveRule).toMatchObject({
      transOpen: "false",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    });
    expect(
      setRule.mock.calls.every(([update]) => typeof update === "function")
    ).toBe(true);
    expect(mockSendTabMsg).toHaveBeenCalledWith(MSG_TRANS_TOGGLE, {
      enabled: false,
    });
    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      undefined
    );
    view.cleanup();
  });

  test("does not accept a command response without a confirming state query", async () => {
    let liveRule = {
      transOpen: "true",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    mockSendTabMsg.mockResolvedValueOnce({ rule: { transOpen: "false" } });
    const view = renderPopupCont({ setRule });
    await flushEffects();

    const mainSwitch = view.container.querySelector(
      'input[aria-label="popup_translate_page"]'
    );
    await act(async () => {
      mainSwitch.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(liveRule.transOpen).toBe("true");
    expect(setRule).toHaveBeenCalledTimes(2);
    const alert = view.container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain("rule_toggle_failed");
    expect(alert.className).toContain("MuiAlert-filledError");
    view.cleanup();
  });

  test("confirms an enabled child frame when the top frame has no receiver", async () => {
    let liveRule = { transOpen: "true", apiSlug: "google" };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    mockSendTabMsg.mockImplementation(async (action) =>
      action === MSG_TRANS_GETRULE
        ? { rule: { transOpen: "false" }, setting: {} }
        : undefined
    );
    const view = renderPopupCont({ setRule });
    await flushEffects();

    await act(async () => {
      view.container
        .querySelector('input[aria-label="popup_translate_page"]')
        .click();
    });
    await flushEffects();

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      undefined
    );
    expect(mockSendTabMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      undefined,
      undefined
    );
    expect(liveRule.transOpen).toBe("false");
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.cleanup();
  });

  test("rolls back when the top frame confirms the opposite state", async () => {
    let liveRule = {
      transOpen: "true",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    mockSendTopFrameMsg.mockResolvedValueOnce({
      rule: { transOpen: "true" },
    });
    const view = renderPopupCont({ setRule });
    await flushEffects();

    const mainSwitch = view.container.querySelector(
      'input[aria-label="popup_translate_page"]'
    );
    await act(async () => {
      mainSwitch.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(liveRule.transOpen).toBe("true");
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("rule_toggle_failed");
    view.cleanup();
  });

  test("labels and exposes the service disclosure state", async () => {
    const setting = {
      transApis: ["google", "deepl", "microsoft", "openai"].map((apiSlug) => ({
        apiSlug,
        apiName: apiSlug,
        apiType: apiSlug,
      })),
      tranboxSetting: { transOpen: true },
      mouseHoverSetting: { useMouseHover: false },
      inputRule: { transOpen: true },
      shortcuts: { toggleTranslate: ["AltLeft", "KeyQ"] },
    };
    const view = renderPopupCont({ setting });
    await flushEffects();

    const moreServices = view.container.querySelector(".kt-popup-more-service");
    expect(moreServices.getAttribute("aria-label")).toBe(
      "popup_more_services (2)"
    );
    expect(moreServices.getAttribute("aria-expanded")).toBe("false");

    act(() => moreServices.click());

    expect(moreServices.getAttribute("aria-label")).toBe(
      "popup_collapse: popup_more_services"
    );
    expect(moreServices.getAttribute("aria-expanded")).toBe("true");
    expect(moreServices.className).toContain("kt-popup-more-service--open");
    view.cleanup();
  });

  test("describes a site outside the blacklist without implying translation is active", async () => {
    const view = renderPopupCont();
    await flushEffects();

    expect(
      view.container.querySelector(".kt-popup-site__badge").textContent
    ).toBe("popup_domain_allowed");
    view.cleanup();
  });

  test.each(["add", "remove"])(
    "rebases a blacklist %s and waits for persistence before reporting success",
    async (operation) => {
      const actionLabel =
        operation === "add" ? "add_to_blacklist" : "remove_from_blacklist";
      mockContextSetting = {
        blacklist: operation === "remove" ? "example.com" : "",
      };
      let completeSave;
      mockUpdateSetting.mockReturnValueOnce(
        new Promise((resolve) => (completeSave = resolve))
      );
      const view = renderPopupCont();
      try {
        await flushEffects();
        const action = Array.from(
          view.container.querySelectorAll("button")
        ).find((button) => button.textContent === actionLabel);
        act(() => action.click());

        const reduce = mockUpdateSetting.mock.calls[0][0];
        const current = {
          blacklist: "example.com,other.example",
          retained: true,
        };
        const value = reduce(current);
        expect(value).toEqual(
          operation === "add"
            ? current
            : { blacklist: "other.example", retained: true }
        );
        if (operation === "add") {
          expect(reduce({ blacklist: "other.example" }).blacklist).toBe(
            "other.example\nexample.com"
          );
        }
        expect(view.container.querySelector('[role="alert"]')).toBeNull();

        await act(async () => completeSave({ value, changed: true }));

        expect(view.container.querySelector('[role="alert"]').textContent).toBe(
          `${actionLabel}: example.com`
        );
      } finally {
        view.cleanup();
      }
    }
  );

  test("reports a blacklist write failure without a success message", async () => {
    mockUpdateSetting.mockRejectedValueOnce(new Error("Storage unavailable"));
    const view = renderPopupCont();
    try {
      await flushEffects();
      const action = Array.from(view.container.querySelectorAll("button")).find(
        (button) => button.textContent === "add_to_blacklist"
      );
      await act(async () => action.click());

      expect(view.container.querySelector('[role="alert"]').textContent).toBe(
        "error_got_some_wrong"
      );
    } finally {
      view.cleanup();
    }
  });

  test.each([false, true])(
    "waits for a saved rule before reporting success (extension content: %s)",
    async (extensionContent) => {
      mockIsExt = extensionContent;
      const persist = extensionContent ? mockSendBgMsg : saveRule;
      let completeSave;
      const pending = new Promise((resolve) => (completeSave = resolve));
      persist.mockImplementation((action) =>
        !extensionContent || action === MSG_SAVE_RULE
          ? pending
          : Promise.resolve([])
      );
      const view = renderPopupCont({ isContent: extensionContent });
      try {
        await flushEffects();
        const action = Array.from(
          view.container.querySelectorAll("button")
        ).find((button) => button.textContent === "save_rule");
        act(() => action.click());

        const domain = view.container.querySelector(
          ".kt-popup-site__select"
        ).value;
        expect(persist).toHaveBeenCalledWith(
          ...(extensionContent ? [MSG_SAVE_RULE] : []),
          expect.objectContaining({ pattern: domain })
        );
        expect(view.container.querySelector('[role="alert"]')).toBeNull();

        await act(async () => completeSave({ changed: true }));

        expect(view.container.querySelector('[role="alert"]').textContent).toBe(
          `save_rule: ${domain}`
        );
      } finally {
        view.cleanup();
      }
    }
  );

  test.each([false, true])(
    "reports a rejected rule save without success (extension content: %s)",
    async (extensionContent) => {
      mockIsExt = extensionContent;
      const persist = extensionContent ? mockSendBgMsg : saveRule;
      persist.mockImplementation((action) =>
        !extensionContent || action === MSG_SAVE_RULE
          ? Promise.reject(new Error("Rule persistence failed"))
          : Promise.resolve([])
      );
      const view = renderPopupCont({ isContent: extensionContent });
      try {
        await flushEffects();
        const action = Array.from(
          view.container.querySelectorAll("button")
        ).find((button) => button.textContent === "save_rule");
        await act(async () => action.click());

        expect(view.container.querySelector('[role="alert"]').textContent).toBe(
          "error_got_some_wrong"
        );
      } finally {
        view.cleanup();
      }
    }
  );

  test("dispatches one content action from a scene toggle", async () => {
    const processActions = jest.fn(({ args }) => ({
      setting: { tranboxSetting: { transOpen: args.enabled } },
    }));
    const view = renderPopupCont({ processActions }, { statefulSetting: true });
    await flushEffects();
    openAdvancedOptions(view.container);

    const selectionScene = view.container.querySelector(
      '.kt-popup-scene[aria-pressed="true"]'
    );
    await act(async () => selectionScene.click());

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_TRANSBOX_TOGGLE,
      args: { enabled: false },
    });
    expect(selectionScene.getAttribute("aria-pressed")).toBe("false");
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.cleanup();
  });

  test("sends the desired scene state through the tab message channel", async () => {
    mockSendTopFrameMsg.mockResolvedValue({
      rule: {},
      setting: { mouseHoverSetting: { useMouseHover: true } },
    });
    const setSetting = jest.fn();
    const view = renderPopupCont({ setSetting });
    await flushEffects();
    openAdvancedOptions(view.container);

    const hoverScene = Array.from(
      view.container.querySelectorAll(".kt-popup-scene")
    ).find((scene) => scene.textContent.includes("mousehover_translate"));
    await act(async () => {
      hoverScene.click();
      await Promise.resolve();
    });

    expect(mockSendTabMsg).toHaveBeenCalledWith(MSG_MOUSEHOVER_TOGGLE, {
      enabled: true,
    });
    expect(setSetting).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  test("uses one captured tab for the site label, command, and state confirmation", async () => {
    mockSendTopFrameMsg.mockResolvedValue({ rule: { transOpen: "false" } });
    const view = renderPopupCont({
      targetTab: { id: 42, url: "https://captured.example/article" },
    });
    await flushEffects();

    expect(mockGetCurTab).not.toHaveBeenCalled();
    expect(view.container.querySelector(".kt-popup-site__select").value).toBe(
      "captured.example"
    );
    await act(async () => {
      view.container
        .querySelector('input[aria-label="popup_translate_page"]')
        .click();
    });
    expect(mockSendTabMsg).toHaveBeenCalledWith(
      MSG_TRANS_TOGGLE,
      { enabled: false },
      undefined,
      42
    );
    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANS_GETRULE,
      undefined,
      42
    );
    view.cleanup();
  });

  test("reports a routed execution error even if the runtime flag was changed", async () => {
    const documentInfo = { token: "captured-document", frameId: 0 };
    mockSendTabMsg.mockImplementation(async (action) =>
      action === MSG_TRANS_GETRULE
        ? {
            rule: { transOpen: "true" },
            setting: {},
            document: documentInfo,
          }
        : { error: "Translation initialization failed" }
    );
    const view = renderPopupCont(
      {
        rule: { transOpen: "false" },
        targetTab: { id: 42, url: "https://example.com/page" },
        documentInfo,
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      await act(async () =>
        view.container.querySelector(".kt-popup-hero").click()
      );
      expect(mockSendTabMsg).toHaveBeenCalledTimes(1);
      expect(mockSendTabMsg).toHaveBeenCalledWith(
        MSG_TRANS_TOGGLE,
        { enabled: true },
        undefined,
        42,
        undefined,
        documentInfo.token
      );
      expect(
        view.container.querySelector('input[aria-label="popup_translate_page"]')
          .checked
      ).toBe(false);
      expect(
        view.container.querySelector('[role="alert"]').textContent
      ).toContain("rule_toggle_failed");
    } finally {
      view.cleanup();
    }
  });

  test("confirms a routed broadcast through the same captured document", async () => {
    const documentInfo = { token: "captured-document", frameId: 7 };
    mockSendTabMsg.mockResolvedValue({
      rule: { transOpen: "true" },
      setting: {},
      document: documentInfo,
    });
    const view = renderPopupCont(
      {
        rule: { transOpen: "false" },
        targetTab: { id: 42, url: "https://example.com/page" },
        documentInfo,
        isTopFrame: false,
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      await act(async () =>
        view.container.querySelector(".kt-popup-hero").click()
      );
      expect(mockSendTabMsg).toHaveBeenNthCalledWith(
        1,
        MSG_TRANS_TOGGLE,
        { enabled: true },
        undefined,
        42,
        undefined,
        documentInfo.token
      );
      expect(mockSendTabMsg).toHaveBeenNthCalledWith(
        2,
        MSG_TRANS_GETRULE,
        undefined,
        { frameId: 7 },
        42,
        documentInfo.token
      );
      expect(
        view.container.querySelector('input[aria-label="popup_translate_page"]')
          .checked
      ).toBe(true);
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test.each([false, true])(
    "checks receiver availability after a closed reply channel without confirming the action: %s",
    async (receiverAvailable) => {
      const documentInfo = { token: "captured-document", frameId: 7 };
      const onPageUnavailable = jest.fn();
      mockSendTabMsg
        .mockRejectedValueOnce(new Error("The message channel closed"))
        .mockResolvedValue(
          receiverAvailable
            ? {
                rule: { transOpen: "true" },
                setting: {},
                document: documentInfo,
              }
            : undefined
        );
      const view = renderPopupCont(
        {
          rule: { transOpen: "false" },
          targetTab: { id: 42, url: "https://example.com/page" },
          documentInfo,
          onPageUnavailable,
        },
        { statefulRule: true }
      );
      try {
        await flushEffects();
        await act(async () =>
          view.container.querySelector(".kt-popup-hero").click()
        );
        expect(mockSendTabMsg).toHaveBeenCalledTimes(2);
        expect(onPageUnavailable).toHaveBeenCalledTimes(
          receiverAvailable ? 0 : 1
        );
        expect(
          view.container.querySelector(
            'input[aria-label="popup_translate_page"]'
          ).checked
        ).toBe(false);
        expect(
          view.container.querySelector('[role="alert"]').textContent
        ).toContain("rule_toggle_failed");
      } finally {
        view.cleanup();
      }
    }
  );

  test.each(["save", "blacklist"])(
    "preserves the selected scope for %s after the same page finishes loading",
    async (action) => {
      const targetTab = {
        id: 42,
        url: "https://example.com/page",
        status: "loading",
      };
      const view = renderPopupCont({ targetTab });
      try {
        await flushEffects();
        const select = view.container.querySelector(".kt-popup-site__select");
        act(() => {
          select.value = "*.example.com";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        view.rerender({ targetTab: { ...targetTab, status: "complete" } });
        await flushEffects();
        expect(select.value).toBe("*.example.com");
        const label = action === "save" ? "save_rule" : "add_to_blacklist";
        await act(async () =>
          [...view.container.querySelectorAll("button")]
            .find((button) => button.textContent === label)
            .click()
        );
        if (action === "save") {
          expect(saveRule).toHaveBeenCalledWith(
            expect.objectContaining({ pattern: "*.example.com" })
          );
        } else {
          const update = mockUpdateSetting.mock.calls[0][0];
          expect(update({ blacklist: "" }).blacklist).toBe("*.example.com");
        }
      } finally {
        view.cleanup();
      }
    }
  );

  test("keeps child-frame translation controls without top-frame tools", async () => {
    const view = renderPopupCont({
      isTopFrame: false,
      capabilities: {
        pageTranslation: true,
        selectionTranslation: true,
        hoverTranslation: true,
        inputTranslation: false,
        ruleEditor: false,
      },
    });
    await flushEffects();
    openAdvancedOptions(view.container);

    expect(
      view.container.querySelector('input[aria-label="popup_translate_page"]')
        .disabled
    ).toBe(false);
    expect(
      [...view.container.querySelectorAll(".kt-popup-scene")].map(
        (node) => node.querySelector(".kt-popup-scene__label").textContent
      )
    ).toEqual(["selection_translate", "mousehover_translate"]);
    expect(view.container.textContent).not.toContain("rule_editor_open");
    view.cleanup();
  });

  test("offers only selection translation without an empty advanced panel in a PDF receiver", async () => {
    const view = renderPopupCont({
      capabilities: {
        pageTranslation: false,
        selectionTranslation: true,
        hoverTranslation: false,
        inputTranslation: false,
        ruleEditor: false,
      },
    });
    try {
      await flushEffects();
      const mainSwitch = view.container.querySelector(
        'input[aria-label="popup_translate_page"]'
      );
      expect(mainSwitch.disabled).toBe(true);
      expect(mainSwitch.checked).toBe(false);
      expect(view.container.querySelector(".kt-popup-language-row")).toBeNull();
      expect(view.container.querySelector(".kt-popup-style-chips")).toBeNull();
      expect(view.container.querySelectorAll(".kt-popup-scene")).toHaveLength(
        1
      );
      expect(
        view.container.querySelector(".kt-popup-scene").textContent
      ).toContain("selection_translate");
      act(() => view.container.querySelector(".kt-popup-hero").click());
      expect(mockSendTabMsg).not.toHaveBeenCalled();
      const disclosure = view.container.querySelector(".kt-popup-disclosure");

      if (disclosure) {
        if (disclosure.getAttribute("aria-expanded") !== "true") {
          act(() => disclosure.click());
        }
        const panelId = disclosure.getAttribute("aria-controls");
        expect(panelId).toBeTruthy();
        const panel = document.getElementById(panelId);
        expect(panel).not.toBeNull();
        expect(panel.hidden).toBe(false);
        expect(disclosure.getAttribute("aria-expanded")).toBe("true");
        const availableControls = [
          ...panel.querySelectorAll(
            "button:not([disabled]), input:not([disabled]), select:not([disabled])"
          ),
        ].filter(
          (control) =>
            !control.closest("[hidden]") &&
            control.getAttribute("aria-disabled") !== "true"
        );
        expect(availableControls.length).toBeGreaterThan(0);
      } else {
        expect(view.container.querySelector(".kt-popup-advanced")).toBeNull();
      }
    } finally {
      view.cleanup();
    }
  });

  test.each(["service", "style", "languages"])(
    "restores the previous %s when the page has no receiver",
    async (control) => {
      const view = renderPopupCont(
        {
          rule: { apiSlug: "deepl", fromLang: "en", toLang: "fr" },
        },
        { statefulRule: true }
      );
      await flushEffects();
      openAdvancedOptions(view.container);
      const clickTarget =
        control === "service"
          ? view.container.querySelector(".kt-popup-service")
          : control === "style"
            ? view.container.querySelectorAll(".kt-popup-style-chip")[1]
            : view.container.querySelector(".kt-popup-swap");

      await act(async () => clickTarget.click());
      await flushEffects();

      expect(
        view.container.querySelector('.kt-popup-service[aria-pressed="true"]')
      ).toBeNull();
      expect(
        view.container.querySelector(
          '.kt-popup-style-chip[aria-pressed="true"] small'
        ).textContent
      ).toBe("Style 6");
      expect(
        [
          ...view.container.querySelectorAll(".kt-popup-language-select input"),
        ].map((node) => node.value)
      ).toEqual(["en", "fr"]);
      expect(
        view.container.querySelector('[role="alert"]').textContent
      ).toContain("popup_action_failed");
      view.cleanup();
    }
  );

  test.each([
    ["selection_translate", MSG_TRANSBOX_TOGGLE],
    ["mousehover_translate", MSG_MOUSEHOVER_TOGGLE],
    ["input_translate", MSG_TRANSINPUT_TOGGLE],
  ])("rolls back %s after a rejected action", async (label, action) => {
    const processActions = jest
      .fn()
      .mockResolvedValue({ error: "Unavailable" });
    const view = renderPopupCont({ processActions }, { statefulSetting: true });
    await flushEffects();
    openAdvancedOptions(view.container);
    const scene = [...view.container.querySelectorAll(".kt-popup-scene")].find(
      (node) => node.textContent.includes(label)
    );
    const previous = scene.getAttribute("aria-pressed");

    await act(async () => scene.click());

    expect(processActions).toHaveBeenCalledWith({
      action,
      args: { enabled: previous !== "true" },
    });
    expect(scene.getAttribute("aria-pressed")).toBe(previous);
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("popup_action_failed");
    view.cleanup();
  });

  test("requires an authoritative feature state after a successful message", async () => {
    mockSendTabMsg.mockResolvedValue({
      setting: { mouseHoverSetting: { useMouseHover: true } },
    });
    mockSendTopFrameMsg.mockResolvedValue({
      rule: {},
      setting: { mouseHoverSetting: { useMouseHover: false } },
    });
    const view = renderPopupCont({}, { statefulSetting: true });
    await flushEffects();
    openAdvancedOptions(view.container);
    const scene = [...view.container.querySelectorAll(".kt-popup-scene")].find(
      (node) => node.textContent.includes("mousehover_translate")
    );

    await act(async () => scene.click());

    expect(scene.getAttribute("aria-pressed")).toBe("false");
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("popup_action_failed");
    view.cleanup();
  });

  test("targets input translation at the captured top frame", async () => {
    mockSendTopFrameMsg.mockResolvedValue({
      rule: {},
      setting: { inputRule: { transOpen: false } },
    });
    const view = renderPopupCont({
      targetTab: { id: 42, url: "https://example.com" },
    });
    await flushEffects();
    openAdvancedOptions(view.container);
    await act(async () => {
      [...view.container.querySelectorAll(".kt-popup-scene")]
        .find((node) => node.textContent.includes("input_translate"))
        .click();
    });

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
      MSG_TRANSINPUT_TOGGLE,
      { enabled: false },
      42
    );
    expect(mockSendTabMsg).not.toHaveBeenCalled();
    view.cleanup();
  });

  test("keeps the popup open when the rule editor has no receiver", async () => {
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont();
    try {
      await flushEffects();
      openAdvancedOptions(view.container);
      await act(async () => {
        [...view.container.querySelectorAll("button")]
          .find((node) => node.textContent === "rule_editor_open")
          .click();
      });
      expect(closeWindow).not.toHaveBeenCalled();
      expect(
        view.container.querySelector('[role="alert"]').textContent
      ).toContain("popup_action_failed");
    } finally {
      view.cleanup();
      closeWindow.mockRestore();
    }
  });

  test("ignores an old missing receiver after a newer language change succeeds", async () => {
    let finishOldAction;
    mockSendTabMsg.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOldAction = resolve;
      })
    );
    mockSendTopFrameMsg
      .mockResolvedValueOnce({
        rule: { fromLang: "en", toLang: "fr" },
        setting: {},
      })
      .mockResolvedValue(undefined);
    const onPageUnavailable = jest.fn();
    const view = renderPopupCont(
      {
        rule: { fromLang: "en", toLang: "fr" },
        onPageUnavailable,
      },
      { statefulRule: true }
    );
    await flushEffects();

    act(() => view.container.querySelector(".kt-popup-swap").click());
    await act(async () =>
      view.container.querySelector(".kt-popup-swap").click()
    );
    await act(async () => finishOldAction());
    await flushEffects();

    expect(
      [
        ...view.container.querySelectorAll(".kt-popup-language-select input"),
      ].map((node) => node.value)
    ).toEqual(["en", "fr"]);
    expect(onPageUnavailable).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.cleanup();
  });

  test("restores only the failed service while preserving a concurrent style change", async () => {
    let failService;
    mockSendTabMsg.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failService = reject;
      })
    );
    mockSendTopFrameMsg.mockResolvedValue({
      rule: { apiSlug: "google", textStyle: "style_0" },
      setting: {},
    });
    const view = renderPopupCont(
      {
        setting: {
          transApis: ["google", "deepl"].map((apiSlug) => ({
            apiSlug,
            apiName: apiSlug,
          })),
        },
      },
      { statefulRule: true }
    );
    await flushEffects();
    openAdvancedOptions(view.container);

    act(() => view.container.querySelectorAll(".kt-popup-service")[1].click());
    await act(async () =>
      view.container.querySelectorAll(".kt-popup-style-chip")[1].click()
    );
    await act(async () => failService(new Error("Page action rejected")));

    expect(
      view.container.querySelector('.kt-popup-service[aria-pressed="true"]')
        .textContent
    ).toContain("google");
    expect(
      view.container.querySelector(
        '.kt-popup-style-chip[aria-pressed="true"] small'
      ).textContent
    ).toBe("Style 0");
    expect(
      view.container.querySelector('[role="alert"]').textContent
    ).toContain("popup_action_failed");
    view.cleanup();
  });

  test("adopts an older confirmed change after a newer request was rejected", async () => {
    let finishFirstAction;
    const processActions = jest
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirstAction = resolve;
        })
      )
      .mockRejectedValueOnce(new Error("Newer request rejected"));
    const view = renderPopupCont(
      {
        rule: { fromLang: "en", toLang: "fr" },
        processActions,
      },
      { statefulRule: true }
    );
    await flushEffects();
    act(() => view.container.querySelector(".kt-popup-swap").click());
    await act(async () =>
      view.container.querySelector(".kt-popup-swap").click()
    );
    await act(async () =>
      finishFirstAction({
        rule: { fromLang: "fr", toLang: "en" },
      })
    );

    expect(
      [
        ...view.container.querySelectorAll(".kt-popup-language-select input"),
      ].map((node) => node.value)
    ).toEqual(["fr", "en"]);
    view.cleanup();
  });
});

describe("getVisibleServices", () => {
  const services = [
    { key: "builtin", name: "BuiltinAI" },
    { key: "google", name: "Google" },
    { key: "microsoft", name: "Microsoft" },
    { key: "deepl", name: "DeepL" },
  ];

  test("shows two services while preserving an active service outside the first two", () => {
    expect(getVisibleServices(services, "microsoft", false)).toEqual([
      services[0],
      services[2],
    ]);
  });

  test("shows every service after expanding more", () => {
    expect(getVisibleServices(services, "microsoft", true)).toEqual(services);
  });

  test("falls back to the first two services when the active key is stale", () => {
    expect(getVisibleServices(services, "missing", false)).toEqual(
      services.slice(0, 2)
    );
  });
});
