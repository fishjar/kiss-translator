/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getVisibleServices } from "./services";
import {
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TRANS_GETRULE,
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

function renderPopupCont(props = {}) {
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

  act(() => {
    root.render(
      <PopupCont
        rule={rule}
        setting={setting}
        setRule={jest.fn()}
        setSetting={jest.fn()}
        handleOpenSetting={jest.fn()}
        {...props}
      />
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
    document.body.innerHTML = "";
  });

  test("keeps the active style visible and expands to every style", async () => {
    const view = renderPopupCont();
    await flushEffects();

    const advancedButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_advanced_options"));
    act(() => advancedButton.click());
    expect(view.container.querySelectorAll("label label")).toHaveLength(0);

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
    act(() => allStylesButton.click());

    styleButtons = view.container.querySelectorAll(
      ".kt-popup-style-chip:not(.kt-popup-style-more)"
    );
    expect(styleButtons).toHaveLength(7);
    expect(allStylesButton.textContent).toContain("popup_collapse");
    expect(allStylesButton.getAttribute("aria-expanded")).toBe("true");
    expect(allStylesButton.previousElementSibling.textContent).toContain(
      "Style 3"
    );
    expect(allStylesButton.nextElementSibling.textContent).toContain("Style 4");
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

  test("leaves browser popup support actions to the header menu", async () => {
    const view = renderPopupCont();
    await flushEffects();

    const supportButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_support"));
    expect(supportButton).toBeUndefined();
    expect(view.container.querySelector(".kt-popup-support")).toBeNull();
    view.cleanup();
  });

  test("places the content popup support disclosure after its trigger", async () => {
    const view = renderPopupCont({
      isContent: true,
      processActions: jest.fn(),
    });
    await flushEffects();

    const footerButtons = view.container.querySelectorAll(
      ".kt-popup-footer button"
    );
    const supportButton = footerButtons[footerButtons.length - 1];
    expect(supportButton.textContent).toContain("popup_support");

    act(() => supportButton.click());

    const supportDisclosure = view.container.querySelector(".kt-popup-support");
    const firstSupportLink = supportDisclosure.querySelector("a");
    expect(supportButton.compareDocumentPosition(supportDisclosure)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(supportButton.closest("footer").nextElementSibling).toBe(
      supportDisclosure
    );
    expect(supportButton.getAttribute("aria-controls")).toBe(
      supportDisclosure.id
    );
    expect(document.activeElement).toBe(firstSupportLink);
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

  test("does not accept an iframe-only response as top-frame confirmation", async () => {
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
