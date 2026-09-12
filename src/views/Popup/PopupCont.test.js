/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getVisibleServices } from "./services";
import { tryClearCaches } from "../../libs/cache";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_RULE_EDITOR,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_TRANS_TOGGLE,
  MSG_TRANSBOX_TOGGLE,
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
const mockSendBgMsg = jest.fn(async () => []);
const mockSendTabMsg = jest.fn(async () => undefined);
const mockSendTopFrameMsg = jest.fn(async () => undefined);
const mockCss = jest.fn(() => "mock-preview-class");
let mockIsExt = false;

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) => fallback || key,
}));

jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({
    setting: { blacklist: "" },
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
  getCurTab: jest.fn(async () => ({ url: "https://example.com/page" })),
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

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderPopupCont(props = {}, { statefulRule = false } = {}) {
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
    return (
      <PopupCont {...popupProps} rule={currentRule} setRule={setCurrentRule} />
    );
  }

  act(() => {
    root.render(
      statefulRule ? (
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
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("PopupCont capability parity", () => {
  beforeEach(() => {
    mockIsExt = false;
    tryClearCaches.mockReset();
    tryClearCaches.mockResolvedValue(true);
    mockSendBgMsg.mockReset();
    mockSendBgMsg.mockResolvedValue([]);
    mockSendTabMsg.mockReset();
    mockSendTabMsg.mockResolvedValue(undefined);
    mockSendTopFrameMsg.mockReset();
    mockSendTopFrameMsg.mockResolvedValue(undefined);
    mockUpdateSetting.mockClear();
    mockCss.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test("opens the rule editor from the content popup without closing the page", async () => {
    const processActions = jest.fn();
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont({ processActions, isContent: true });
    try {
      await flushEffects();
      const openEditor = Array.from(
        view.container.querySelectorAll("button")
      ).find((button) => button.textContent === "rule_editor_open");

      await act(async () => openEditor.click());

      expect(processActions).toHaveBeenCalledWith({ action: MSG_RULE_EDITOR });
      expect(mockSendTabMsg).not.toHaveBeenCalled();
      expect(closeWindow).not.toHaveBeenCalled();
    } finally {
      view.cleanup();
      closeWindow.mockRestore();
    }
  });

  test("waits for the rule editor message before closing the extension popup", async () => {
    mockIsExt = true;
    let resolveOpen;
    mockSendTabMsg.mockImplementation(
      () => new Promise((resolve) => (resolveOpen = resolve))
    );
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont();
    try {
      await flushEffects();
      const openEditor = Array.from(
        view.container.querySelectorAll("button")
      ).find((button) => button.textContent === "rule_editor_open");

      act(() => openEditor.click());

      expect(mockSendTabMsg).toHaveBeenCalledWith(MSG_RULE_EDITOR);
      expect(closeWindow).not.toHaveBeenCalled();

      await act(async () => {
        resolveOpen();
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
    const processActions = jest.fn();
    const view = renderPopupCont(
      { rule: { fromLang: "en", toLang: "fr" }, processActions },
      { statefulRule: true }
    );
    await flushEffects();
    const swap = view.container.querySelector(".kt-popup-swap");

    act(() => {
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

    act(() => view.container.querySelector(".kt-popup-service").click());
    expect(processActions).toHaveBeenCalledTimes(3);
    expect(processActions).toHaveBeenLastCalledWith({
      action: MSG_TRANS_PUTRULE,
      args: { apiSlug: "google" },
    });
    expect(mockSendTabMsg).not.toHaveBeenCalled();
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
    const processActions = jest.fn();
    const setRule = jest.fn();
    const view = renderPopupCont({ processActions, setRule });
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
    expect(setRule).toHaveBeenCalledTimes(1);
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
    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
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

    expect(mockSendTopFrameMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
    expect(mockSendTabMsg).toHaveBeenCalledWith(MSG_TRANS_GETRULE);
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

  test("dispatches one content action from a scene toggle", async () => {
    const processActions = jest.fn();
    const setSetting = jest.fn();
    const view = renderPopupCont({ processActions, setSetting });
    await flushEffects();

    const selectionScene = view.container.querySelector(
      '.kt-popup-scene[aria-pressed="true"]'
    );
    act(() => selectionScene.click());

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_TRANSBOX_TOGGLE,
      args: { enabled: false },
    });
    expect(setSetting).toHaveBeenCalledTimes(1);
    view.cleanup();
  });

  test("sends the desired scene state through the tab message channel", async () => {
    const setSetting = jest.fn();
    const view = renderPopupCont({ setSetting });
    await flushEffects();

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
