import { act } from "react";
import { createRoot } from "react-dom/client";
import { STOKEY_SETTING } from "../../config";
import { useSetting } from "../../hooks/Setting";
import { browser } from "../../libs/browser";
import { readClipboardTextIfAllowed } from "../../libs/clipboard";
import Popup, { Trantab } from ".";
import { sendTabMsg } from "../../libs/msg";

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
jest.mock("../../libs/msg", () => ({
  sendTabMsg: jest.fn(),
  sendBgMsg: jest.fn(),
}));
jest.mock("./PopupCont", () => {
  const React = require("react");
  return () => React.createElement("div", { "data-testid": "page-panel" });
});
jest.mock("./Header", () => {
  const React = require("react");
  return ({ toggleTab }) =>
    React.createElement("button", { onClick: toggleTab }, "toggle");
});
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
    browser.storage.onChanged.addListener.mockClear();
    browser.storage.onChanged.removeListener.mockClear();
    readClipboardTextIfAllowed.mockReset();
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

  test("reacts to the setting being enabled in another extension page", async () => {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false },
    });
    readClipboardTextIfAllowed.mockResolvedValue("new clipboard text");
    const { container, root } = renderTrantab({ isSeparate: true });
    await flushEffects();
    const storageListener =
      browser.storage.onChanged.addListener.mock.calls[0][0];

    await act(async () => {
      storageListener(
        {
          [STOKEY_SETTING]: {
            newValue: { autoTranslateClipboard: true },
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
  });
});

describe("Popup default view", () => {
  let container;
  let root;
  const updateSetting = jest.fn();

  beforeEach(() => {
    window.location.hash = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    updateSetting.mockClear();
    readClipboardTextIfAllowed.mockReset();
    sendTabMsg.mockReset();
    sendTabMsg.mockResolvedValue({ rule: {}, setting });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.location.hash = "";
  });

  async function renderPopup(popupDefaultView) {
    useSetting.mockReturnValue({
      setting: { ...setting, autoTranslateClipboard: false, popupDefaultView },
      updateSetting,
    });
    await act(async () => root.render(<Popup />));
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
    sendTabMsg.mockResolvedValue(undefined);
    await renderPopup("text");
    expect(container.querySelector('[data-testid="tran-form"]')).not.toBeNull();
    expect(readClipboardTextIfAllowed).not.toHaveBeenCalled();
  });

  test("temporary switching does not save or replace the configured default", async () => {
    await renderPopup("text");
    act(() => container.querySelector("button").click());
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
    expect(sendTabMsg).not.toHaveBeenCalled();
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
