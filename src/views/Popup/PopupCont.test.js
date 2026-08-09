/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getVisibleServices } from "./services";
import {
  MSG_MOUSEHOVER_TOGGLE,
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
}));

jest.mock("../../libs/client", () => ({
  get isExt() {
    return mockIsExt;
  },
}));
jest.mock("../../libs/cache", () => ({ tryClearCaches: jest.fn() }));
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

    let styleButtons = view.container.querySelectorAll(".kt-popup-style-chip");
    expect(styleButtons).toHaveLength(5);
    expect(
      view.container.querySelector(
        '.kt-popup-style-chip[aria-pressed="true"] small'
      ).textContent
    ).toBe("Style 6");

    const allStylesButton = Array.from(
      view.container.querySelectorAll("button")
    ).find((button) => button.textContent.includes("popup_all_styles"));
    act(() => allStylesButton.click());

    styleButtons = view.container.querySelectorAll(".kt-popup-style-chip");
    expect(styleButtons).toHaveLength(7);
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

    const featureLabels = Array.from(
      view.container.querySelectorAll(".kt-popup-scene__label")
    ).map((node) => node.textContent);
    expect(featureLabels).toEqual([
      "selection_translate",
      "mousehover_translate",
      "input_translate",
    ]);
    expect(featureLabels).not.toContain("subtitle_translate");
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
    act(() => mainSwitch.click());

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_TRANS_TOGGLE,
      args: { enabled: false },
    });
    expect(setRule).toHaveBeenCalledTimes(1);
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
