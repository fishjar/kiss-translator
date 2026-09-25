import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSetting } from "../../hooks/Setting";
import { readClipboardTextIfAllowed } from "../../libs/clipboard";
import Popup, { Trantab } from ".";
import { browser } from "../../libs/browser";
import { getCurTab, sendBgMsg } from "../../libs/msg";
import { MSG_FIT_SEPARATE_WINDOW, STOKEY_SETTING } from "../../config";
import { SEPARATE_WINDOW_CONTENT_WIDTH } from "../../config/app";
import { loadPopupData } from "./loadData";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let mockIsFirefox = false;

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
  get isFirefox() {
    return mockIsFirefox;
  },
}));
jest.mock("../../libs/clipboard", () => ({
  readClipboardTextIfAllowed: jest.fn(),
}));
jest.mock("../../libs/browser", () => ({
  browser: {
    windows: {
      getCurrent: jest.fn(),
    },
    tabs: {
      getCurrent: jest.fn(),
      getZoom: jest.fn(),
    },
    storage: {
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  },
}));
jest.mock("../../libs/msg", () => ({
  getCurTab: jest.fn(),
  sendBgMsg: jest.fn(),
}));
jest.mock("./loadData", () => ({ loadPopupData: jest.fn() }));
jest.mock("./PopupCont", () => {
  const React = require("react");
  return () => React.createElement("div", { "data-testid": "page-panel" });
});
jest.mock("./Header", () => () => null);
jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return ({
    text,
    autoFocusInput,
    syncExternalTextWhileEditing,
    simpleStyle,
    configActions,
  }) =>
    React.createElement(
      "div",
      {
        "data-testid": "tran-form",
        "data-auto-focus": String(autoFocusInput),
        "data-sync-external": String(syncExternalTextWhileEditing),
        "data-simple-style": String(Boolean(simpleStyle)),
      },
      configActions,
      React.createElement("span", { "data-testid": "source-text" }, text)
    );
});

const setting = {
  autoTranslateClipboard: true,
  tranboxSetting: {
    enDict: "-",
    enSug: "-",
    apiSlugs: [],
    fromLang: "auto",
    toLang: "zh-CN",
    toLang2: "en",
    aiDictApiSlug: "-",
    aiDictPromptSlug: "-",
  },
  transApis: [],
  langDetector: "-",
  prompts: [],
  subtitleSetting: {},
  translateVariants: true,
};

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function renderTrantab(props = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Trantab {...props} />));
  return { container, root };
}

describe("Trantab clipboard translation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    readClipboardTextIfAllowed.mockReset();
    browser.storage.onChanged.addListener.mockClear();
    browser.storage.onChanged.removeListener.mockClear();
    useSetting.mockReturnValue({ setting });
  });

  test("loads clipboard text when the panel opens", async () => {
    readClipboardTextIfAllowed.mockResolvedValue("  clipboard text  ");
    const { container, root } = renderTrantab();
    await flushEffects();

    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="source-text"]').textContent
    ).toBe("clipboard text");
    expect(
      container.querySelector('[data-testid="tran-form"]').dataset.autoFocus
    ).toBe("false");
    expect(
      container.querySelector('[data-testid="tran-form"]').dataset.syncExternal
    ).toBe("true");
    act(() => root.unmount());
  });

  test.each([null, "   "])(
    "allows input focus when the initial clipboard result is %p",
    async (clipboardText) => {
      readClipboardTextIfAllowed.mockResolvedValue(clipboardText);
      const { container, root } = renderTrantab();
      await flushEffects();

      expect(
        container.querySelector('[data-testid="tran-form"]').dataset.autoFocus
      ).toBe("true");
      act(() => root.unmount());
    }
  );

  test("loads changed clipboard text when a separate window regains focus", async () => {
    readClipboardTextIfAllowed
      .mockResolvedValueOnce("first")
      .mockResolvedValue("second");
    const { container, root } = renderTrantab({ isSeparate: true });
    await flushEffects();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector('[data-testid="source-text"]').textContent
    ).toBe("second");
    act(() => root.unmount());
  });

  test("does not read when the setting is disabled", async () => {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false },
    });
    const { root } = renderTrantab();
    await flushEffects();

    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-testid="tran-form"]').dataset.autoFocus
    ).toBe("true");
    act(() => root.unmount());
  });

  test("reacts to JSON settings enabled in another extension page", async () => {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false },
    });
    readClipboardTextIfAllowed.mockResolvedValue("new clipboard text");
    const { container, root } = renderTrantab({ isSeparate: true });
    await flushEffects();
    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();

    const listener = browser.storage.onChanged.addListener.mock.calls[0][0];
    await act(async () => {
      listener(
        {
          [STOKEY_SETTING]: {
            newValue: JSON.stringify({
              ...setting,
              autoTranslateClipboard: true,
            }),
          },
        },
        "local"
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushEffects();

    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="source-text"]').textContent
    ).toBe("new clipboard text");
    act(() => root.unmount());
    expect(browser.storage.onChanged.removeListener).toHaveBeenCalledWith(
      listener
    );
  });

  test("stops reading on focus when another page disables clipboard translation", async () => {
    readClipboardTextIfAllowed.mockResolvedValue("initial clipboard text");
    const { root } = renderTrantab({ isSeparate: true });
    await flushEffects();
    readClipboardTextIfAllowed.mockClear();

    const listener = browser.storage.onChanged.addListener.mock.calls[0][0];
    await act(async () => {
      listener(
        {
          [STOKEY_SETTING]: {
            newValue: JSON.stringify({
              ...setting,
              autoTranslateClipboard: false,
            }),
          },
        },
        "local"
      );
    });
    await flushEffects();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushEffects();

    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("ignores unrelated storage changes and malformed settings", async () => {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false },
    });
    const { root } = renderTrantab({ isSeparate: true });
    await flushEffects();
    const listener = browser.storage.onChanged.addListener.mock.calls[0][0];
    const enabledSetting = JSON.stringify({ autoTranslateClipboard: true });

    await act(async () => {
      listener({ [STOKEY_SETTING]: { newValue: enabledSetting } }, "sync");
      listener({ unrelated: { newValue: enabledSetting } }, "local");
      listener({ [STOKEY_SETTING]: { newValue: "invalid JSON" } }, "local");
    });
    await flushEffects();

    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("stops reading on focus when stored settings are removed", async () => {
    readClipboardTextIfAllowed.mockResolvedValue("initial clipboard text");
    const { root } = renderTrantab({ isSeparate: true });
    await flushEffects();
    readClipboardTextIfAllowed.mockClear();
    const listener = browser.storage.onChanged.addListener.mock.calls[0][0];

    await act(async () => {
      listener(
        { [STOKEY_SETTING]: { oldValue: JSON.stringify(setting) } },
        "local"
      );
    });
    await flushEffects();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushEffects();

    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

// Language, browser zoom, and system font size determine the rendered height.
// Open at an initial size, then measure once and ask the background to fit it.
describe("shared translation panel hosts", () => {
  let view;

  beforeEach(() => {
    useSetting.mockReturnValue({ setting });
    readClipboardTextIfAllowed.mockReset();
    readClipboardTextIfAllowed.mockResolvedValue(null);
    browser.tabs.getCurrent.mockResolvedValue({ id: 7 });
    browser.windows.getCurrent.mockResolvedValue({
      id: 4,
      type: "popup",
      width: 760,
      height: 800,
    });
  });

  afterEach(() => {
    if (view) {
      act(() => view.root.unmount());
      view.container.remove();
    }
  });

  test("places compact actions inside the form without duplicate window chrome", async () => {
    view = renderTrantab({ isSeparate: true });
    await flushEffects();

    expect(
      view.container.querySelector(".kt-translation-panel--embedded")
    ).not.toBeNull();
    expect(view.container.querySelector(".kt-tranbox-content")).not.toBeNull();
    expect(view.container.querySelector(".KT-draggable")).toBeNull();
    expect(view.container.querySelector(".kt-tranbox-header__drag")).toBeNull();
    expect(
      view.container.querySelector(".kt-tranbox-header__brand")
    ).toBeNull();
    expect(view.container.querySelector('button[title="close"]')).toBeNull();
    expect(
      view.container
        .querySelector('[data-testid="tran-form"]')
        .querySelector('button[title="more"]')
    ).not.toBeNull();
    expect(
      [
        ...view.container.querySelectorAll(
          ".kt-tranbox-header__actions button"
        ),
      ].map((button) => button.title)
    ).toEqual(["more"]);

    act(() => view.container.querySelector('button[title="more"]').click());
    const menuItems = [
      ...view.container.querySelectorAll('[role^="menuitem"]'),
    ];
    expect(menuItems.map((button) => button.textContent)).toEqual([
      "btn_tip_simple_style",
      "btn_tip_dark_mode",
    ]);
    // Empty windows must keep their input available.
    expect(menuItems[0].disabled).toBe(true);
    expect(
      view.container.querySelector('[data-testid="tran-form"]').dataset
        .simpleStyle
    ).toBe("false");
  });

  test("embeds the same content without a second header in the popup tab", async () => {
    view = renderTrantab();
    await flushEffects();

    expect(
      view.container.querySelector(".kt-translation-panel--embedded")
    ).not.toBeNull();
    expect(view.container.querySelector(".kt-tranbox-content")).not.toBeNull();
    expect(view.container.querySelector(".kt-tranbox-header")).toBeNull();
    expect(
      view.container.querySelector('[data-testid="tran-form"]').dataset
        .simpleStyle
    ).toBe("false");
  });

  test("keeps clipboard text and available actions through minimal mode and back", async () => {
    readClipboardTextIfAllowed.mockResolvedValue("Clipboard source text");
    view = renderTrantab({ isSeparate: true });
    await flushEffects();
    act(() => view.container.querySelector('button[title="more"]').click());
    act(() =>
      view.container.querySelector('[role="menuitemcheckbox"]').click()
    );

    const form = view.container.querySelector('[data-testid="tran-form"]');
    expect(form.dataset.simpleStyle).toBe("true");
    expect(form.dataset.autoFocus).toBe("false");
    expect(form.dataset.syncExternal).toBe("true");
    expect(form.querySelector('[data-testid="source-text"]').textContent).toBe(
      "Clipboard source text"
    );
    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);

    act(() => form.querySelector('button[title="more"]').click());
    const restoreButton = form.querySelector('[role="menuitemcheckbox"]');
    expect(restoreButton.getAttribute("aria-checked")).toBe("true");
    expect(restoreButton.disabled).toBe(false);
    act(() => restoreButton.click());

    expect(form.dataset.simpleStyle).toBe("false");
    expect(form.querySelector('[data-testid="source-text"]').textContent).toBe(
      "Clipboard source text"
    );
    expect(form.querySelector('button[title="more"]')).not.toBeNull();
    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);
  });
});

describe("separate window auto-fit", () => {
  let container;
  let root;
  let rafCallbacks;
  let originalRaf;

  const setWindowMetric = (name, value) =>
    Object.defineProperty(window, name, {
      configurable: true,
      writable: true,
      value,
    });

  beforeEach(() => {
    sendBgMsg.mockClear();
    mockIsFirefox = false;
    browser.windows.getCurrent.mockResolvedValue({ width: 760, height: 800 });
    browser.tabs.getCurrent.mockResolvedValue({ id: 7 });
    browser.tabs.getZoom.mockResolvedValue(1);
    Object.defineProperty(window.screen, "availWidth", {
      configurable: true,
      value: 2560,
    });
    Object.defineProperty(window.screen, "availHeight", {
      configurable: true,
      value: 1440,
    });
    useSetting.mockReturnValue({ setting });
    readClipboardTextIfAllowed.mockResolvedValue(null);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // Queue rAF callbacks until the rendered panel has a mocked scrollHeight.
    rafCallbacks = [];
    originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    };

    setWindowMetric("outerHeight", 800);
    setWindowMetric("innerHeight", 760); // Title bar and borders total 40px.
    setWindowMetric("outerWidth", 760);
    setWindowMetric("innerWidth", 744); // Side borders total 16px.
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRaf;
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  const renderAndMeasure = async (panelHeight) => {
    await act(async () => {
      root.render(<Trantab isSeparate />);
      await Promise.resolve();
    });
    const panel = container.querySelector(".kt-popup-text-panel");
    if (panel && panelHeight !== undefined) {
      Object.defineProperty(panel, "scrollHeight", {
        configurable: true,
        value: panelHeight,
      });
    }
    act(() => rafCallbacks.forEach((callback) => callback()));
  };

  test("asks the background to fit the measured content height", async () => {
    await renderAndMeasure(612);

    expect(sendBgMsg).toHaveBeenCalledTimes(1);
    const [action, args] = sendBgMsg.mock.calls[0];
    expect(action).toBe(MSG_FIT_SEPARATE_WINDOW);
    // 612px of content plus 40px of window chrome.
    expect(args.height).toBe(652);
  });

  test("measures the complete form including its inline actions", async () => {
    await act(async () => root.render(<Trantab isSeparate />));
    const panel = container.querySelector(".kt-popup-text-panel");
    const form = container.querySelector(".kt-tranbox-content");
    Object.defineProperty(form, "scrollHeight", { value: 500 });
    Object.defineProperty(panel, "scrollHeight", { value: 528 });
    expect(form.querySelector(".kt-tranbox-header--compact")).not.toBeNull();
    expect(
      panel.querySelector(".kt-translation-panel > .kt-tranbox-header")
    ).toBeNull();
    act(() => rafCallbacks.forEach((callback) => callback()));

    expect(sendBgMsg).toHaveBeenCalledWith(
      MSG_FIT_SEPARATE_WINDOW,
      expect.objectContaining({ height: 568 })
    );
  });

  test("uses the preferred initial content width rather than measuring it", async () => {
    await renderAndMeasure(612);

    // Start at the preferred content width, then add native side borders.
    expect(sendBgMsg.mock.calls[0][1].width).toBe(
      SEPARATE_WINDOW_CONTENT_WIDTH + 16
    );
  });

  test.each([0.8, 1.5, 2])(
    "fits screen dimensions at tab zoom %s",
    async (zoom) => {
      browser.tabs.getZoom.mockResolvedValue(zoom);
      setWindowMetric("innerWidth", 744 / zoom);
      setWindowMetric("innerHeight", 760 / zoom);
      // DOM outer dimensions differ across browsers and must not affect fitting.
      setWindowMetric("outerWidth", 760 / zoom);
      setWindowMetric("outerHeight", 800 / zoom);

      await renderAndMeasure(612);

      expect(browser.tabs.getZoom).toHaveBeenCalledWith(7);
      expect(sendBgMsg).toHaveBeenCalledWith(
        MSG_FIT_SEPARATE_WINDOW,
        expect.objectContaining({
          width: Math.round(SEPARATE_WINDOW_CONTENT_WIDTH * zoom + 16),
          height: Math.ceil(612 * zoom + 40),
        })
      );
    }
  );

  test("converts Gecko screen limits from layout pixels", async () => {
    mockIsFirefox = true;
    browser.tabs.getZoom.mockResolvedValue(2);
    setWindowMetric("innerWidth", 372);
    setWindowMetric("innerHeight", 380);
    setWindowMetric("outerWidth", 380);
    setWindowMetric("outerHeight", 400);
    Object.defineProperty(window.screen, "availWidth", {
      configurable: true,
      value: 960,
    });
    Object.defineProperty(window.screen, "availHeight", {
      configurable: true,
      value: 600,
    });

    Object.defineProperty(window.screen, "availLeft", {
      configurable: true,
      value: -640,
    });
    Object.defineProperty(window.screen, "availTop", {
      configurable: true,
      value: -360,
    });
    await renderAndMeasure(430);

    expect(sendBgMsg).toHaveBeenCalledWith(
      MSG_FIT_SEPARATE_WINDOW,
      expect.objectContaining({
        width: 1456,
        height: 900,
        availWidth: 1920,
        availHeight: 1200,
        availLeft: -1280,
        availTop: -720,
      })
    );
  });

  test("does not apply Gecko text-only zoom twice", async () => {
    mockIsFirefox = true;
    browser.tabs.getZoom.mockResolvedValue(2);
    await renderAndMeasure(900);

    expect(sendBgMsg).toHaveBeenCalledWith(
      MSG_FIT_SEPARATE_WINDOW,
      expect.objectContaining({
        width: 736,
        height: 940,
        availWidth: 2560,
        availHeight: 1440,
      })
    );
  });
  test.each([
    ["760px", "important"],
    ["760px", ""],
    ["", ""],
  ])(
    "measures natural height at the final width and restores min-height %p with priority %p",
    async (minHeight, minHeightPriority) => {
      browser.tabs.getZoom.mockResolvedValue(2);
      setWindowMetric("innerWidth", 372);
      setWindowMetric("innerHeight", 380);
      Object.defineProperty(window.screen, "availWidth", {
        configurable: true,
        value: 1000,
      });
      await act(async () => root.render(<Trantab isSeparate />));
      const panel = container.querySelector(".kt-popup-text-panel");
      panel.style.setProperty("width", "300px", "important");
      if (minHeight) {
        panel.style.setProperty("min-height", minHeight, minHeightPriority);
      }
      Object.defineProperty(panel, "scrollHeight", {
        configurable: true,
        // A stretched canvas reports the old window height unless both
        // measurement overrides win over the existing inline styles.
        get: () =>
          panel.style.width === "472px" &&
          panel.style.getPropertyPriority("width") === "important" &&
          panel.style.getPropertyValue("min-height") === "0px" &&
          panel.style.getPropertyPriority("min-height") === "important"
            ? 500
            : 700,
      });

      act(() => rafCallbacks.forEach((callback) => callback()));

      expect(sendBgMsg).toHaveBeenCalledWith(
        MSG_FIT_SEPARATE_WINDOW,
        expect.objectContaining({ width: 960, height: 1040 })
      );
      expect(panel.style.width).toBe("300px");
      expect(panel.style.getPropertyPriority("width")).toBe("important");
      expect(panel.style.getPropertyValue("min-height")).toBe(minHeight);
      expect(panel.style.getPropertyPriority("min-height")).toBe(
        minHeightPriority
      );
    }
  );

  test("does not fit after unmounting while the zoom request is pending", async () => {
    let resolveZoom;
    browser.tabs.getZoom.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveZoom = resolve;
      })
    );
    await act(async () => root.render(<Trantab isSeparate />));
    act(() => root.render(null));
    await act(async () => resolveZoom(2));
    act(() => rafCallbacks.forEach((callback) => callback()));

    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test("preserves the default size when the zoom API fails", async () => {
    browser.tabs.getZoom.mockRejectedValueOnce(
      new Error("Zoom is unavailable")
    );
    await renderAndMeasure(612);

    expect(sendBgMsg).not.toHaveBeenCalled();
  });
  test("does not measure the ordinary popup", async () => {
    await act(async () => {
      root.render(<Trantab />);
      await Promise.resolve();
    });
    act(() => rafCallbacks.forEach((callback) => callback()));

    expect(sendBgMsg).not.toHaveBeenCalled();
  });

  test("waits for the settings before measuring", async () => {
    // Measuring the fixed-height loading state would shrink the window too far.
    useSetting.mockReturnValue({ setting: null });
    await act(async () => {
      root.render(<Trantab isSeparate />);
      await Promise.resolve();
    });
    act(() => rafCallbacks.forEach((callback) => callback()));

    expect(sendBgMsg).not.toHaveBeenCalled();
  });
});

describe("Popup default view", () => {
  let container;
  let root;
  let previousTitle;
  const updateSetting = jest.fn();

  beforeEach(() => {
    previousTitle = document.title;
    window.location.hash = "";
    getCurTab.mockResolvedValue({
      id: 1,
      windowId: 1,
      url: "https://example.com",
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    updateSetting.mockClear();
    readClipboardTextIfAllowed.mockReset();
    loadPopupData.mockReset();
    loadPopupData.mockResolvedValue({ rule: {}, setting });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.location.hash = "";
    document.title = previousTitle;
  });

  async function renderPopup(popupDefaultView) {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false, popupDefaultView },
      updateSetting,
    });
    await act(async () => {
      root.render(<Popup />);
      await Promise.resolve();
    });
  }

  test.each([undefined, "page", "invalid"])(
    "opens the webpage panel for preference %p",
    async (value) => {
      await renderPopup(value);
      expect(
        container.querySelector('[data-testid="page-panel"]')
      ).not.toBeNull();
      expect(container.querySelector('[data-testid="tran-form"]')).toBeNull();
    }
  );

  test("opens text translation without a content-script response", async () => {
    loadPopupData.mockResolvedValue(undefined);
    await renderPopup("text");
    expect(container.querySelector('[data-testid="tran-form"]')).not.toBeNull();
    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
  });

  test("temporary switching does not save or replace the configured default", async () => {
    await renderPopup("text");
    const pageTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === "popup_page_translation"
    );
    act(() => pageTab.click());
    expect(
      container.querySelector('[data-testid="page-panel"]')
    ).not.toBeNull();
    await renderPopup("text");
    expect(
      container.querySelector('[data-testid="page-panel"]')
    ).not.toBeNull();
    expect(updateSetting).not.toHaveBeenCalled();

    act(() => root.unmount());
    root = createRoot(container);
    await renderPopup("text");
    expect(container.querySelector('[data-testid="tran-form"]')).not.toBeNull();
  });

  test("separate windows always show text translation", async () => {
    window.location.hash = "tranbox";
    await renderPopup("page");
    expect(container.querySelector('[data-testid="tran-form"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="page-panel"]')).toBeNull();
    expect(loadPopupData).not.toHaveBeenCalled();
  });

  test("uses the native title for text translation and restores it on unmount", async () => {
    document.title = "Original extension title";
    window.location.hash = "tranbox";
    await renderPopup("page");

    expect(document.title).toBe(
      `popup_text_translation · ${process.env.REACT_APP_NAME}`
    );

    act(() => root.render(null));
    expect(document.title).toBe("Original extension title");
  });

  test("preserves the title when text translation is embedded in the popup", async () => {
    document.title = "Original extension title";
    await renderPopup("text");

    expect(document.title).toBe("Original extension title");
  });

  test("separate text windows read the clipboard only once on mount", async () => {
    window.location.hash = "tranbox";
    readClipboardTextIfAllowed.mockResolvedValue("clipboard text");
    useSetting.mockReturnValue({
      setting: {
        ...setting,
        autoTranslateClipboard: true,
        popupDefaultView: "text",
      },
      updateSetting,
    });

    await act(async () => root.render(<Popup />));
    await flushEffects();

    expect(readClipboardTextIfAllowed).toHaveBeenCalledTimes(1);
  });
});
