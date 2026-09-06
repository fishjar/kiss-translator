import { act } from "react";
import { createRoot } from "react-dom/client";
import { useSetting } from "../../hooks/Setting";
import { readClipboardTextIfAllowed } from "../../libs/clipboard";
import { browser } from "../../libs/browser";
import { sendBgMsg } from "../../libs/msg";
import { MSG_FIT_SEPARATE_WINDOW, STOKEY_SETTING } from "../../config";
import { SEPARATE_WINDOW_CONTENT_WIDTH } from "../../config/app";
import { Trantab } from ".";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../hooks/Setting", () => ({ useSetting: jest.fn() }));
jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => key,
}));
jest.mock("../../libs/client", () => ({
  isAutoTranslateClipboardSupported: true,
}));
jest.mock("../../libs/clipboard", () => ({
  readClipboardTextIfAllowed: jest.fn(),
}));
jest.mock("../../libs/browser", () => ({
  browser: {
    storage: {
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  },
}));
jest.mock("../../libs/msg", () => ({ sendBgMsg: jest.fn() }));
jest.mock("./PopupCont", () => () => null);
jest.mock("./Header", () => () => null);
jest.mock("../Selection/TranForm", () => {
  const React = require("react");
  return ({ text, autoFocusInput, syncExternalTextWhileEditing }) =>
    React.createElement(
      "div",
      {
        "data-testid": "tran-form",
        "data-auto-focus": String(autoFocusInput),
        "data-sync-external": String(syncExternalTextWhileEditing),
      },
      text
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
      container.querySelector('[data-testid="tran-form"]').textContent
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
      container.querySelector('[data-testid="tran-form"]').textContent
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
      container.querySelector('[data-testid="tran-form"]').textContent
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

  test("keeps width at the design cap rather than measuring it", async () => {
    await renderAndMeasure(612);

    // Cap content width for readable lines, then add the side borders.
    expect(sendBgMsg.mock.calls[0][1].width).toBe(
      SEPARATE_WINDOW_CONTENT_WIDTH + 16
    );
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
