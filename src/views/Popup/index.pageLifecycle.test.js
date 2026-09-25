/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act } from "react";
import { createRoot } from "react-dom/client";
import Popup from "./index";
import { MSG_TRANS_TOGGLE } from "../../config";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mockTab = {
  id: 17,
  windowId: 3,
  status: "complete",
  url: "https://example.com/page",
};
const mockRule = {
  transOpen: "false",
  apiSlug: "google",
  fromLang: "en",
  toLang: "zh-CN",
  textStyle: "",
  autoScan: "true",
  transOnly: "false",
  hasRichText: "true",
  scanAll: "false",
  isPlainText: false,
};
const mockSetting = {
  uiLang: "en",
  darkMode: "light",
  blacklist: "",
  autoTranslateClipboard: false,
  transApis: [{ apiSlug: "google", apiName: "Google", apiType: "Google" }],
  prompts: [],
  subtitleSetting: {},
  tranboxSetting: {
    transOpen: true,
    apiSlugs: ["google"],
    fromLang: "en",
    toLang: "zh-CN",
    toLang2: "-",
    enDict: "-",
    enSug: "-",
    aiDictApiSlug: "-",
  },
  mouseHoverSetting: { useMouseHover: false },
  inputRule: { transOpen: false },
  shortcuts: {},
};
const mockPayload = { rule: mockRule, setting: mockSetting, isTopFrame: true };
const mockSendTabMsg = jest.fn(async () => ({}));
const mockQueryPopupData = jest.fn();
const mockLoadPopupData = jest.fn(async () => mockPayload);
const mockSaveRule = jest.fn();

jest.mock("../../libs/browser", () => {
  const createEvent = () => ({
    addListener: jest.fn(),
    removeListener: jest.fn(),
  });
  return {
    browser: {
      tabs: {
        onUpdated: createEvent(),
        onRemoved: createEvent(),
        onActivated: createEvent(),
        get: jest.fn(async () => mockTab),
      },
      storage: { onChanged: createEvent() },
    },
  };
});
jest.mock("../../libs/msg", () => ({
  getCurTab: jest.fn(async () => mockTab),
  sendTabMsg: (...args) => mockSendTabMsg(...args),
  sendTopFrameMsg: jest.fn(async () => ({})),
  sendBgMsg: jest.fn(async () => []),
}));
jest.mock("./loadData", () => ({
  loadPopupData: (...args) => mockLoadPopupData(...args),
  queryPopupData: (...args) => mockQueryPopupData(...args),
}));
jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/Setting", () => ({
  useSetting: () => ({ setting: mockSetting, updateSetting: jest.fn() }),
}));
jest.mock("../../hooks/Commands", () => ({
  useOverviewShortcuts: () => ({ page: [], selection: [] }),
}));
jest.mock("../../hooks/ColorMode", () => ({
  useDarkMode: () => ({ darkMode: "light", toggleDarkMode: jest.fn() }),
}));
jest.mock("../../hooks/CustomStyles", () => ({
  useAllTextStyles: () => ({ allTextStyles: [] }),
}));
jest.mock("../../libs/client", () => ({
  isExt: true,
  isFirefox: false,
  client: "chrome",
  isAutoTranslateClipboardSupported: false,
}));
jest.mock("../../libs/log", () => ({
  ...jest.requireActual("../../libs/log"),
  kissLog: jest.fn(),
}));
jest.mock("../../libs/rules", () => ({
  saveRule: (...args) => mockSaveRule(...args),
}));
jest.mock("../../libs/cache", () => ({
  tryClearCaches: jest.fn(async () => true),
}));
jest.mock("../../libs/clipboard", () => ({
  readClipboardTextIfAllowed: jest.fn(async () => null),
}));
jest.mock("../Selection/TranForm", () => ({
  __esModule: true,
  default: () =>
    require("react").createElement("div", { "data-testid": "text-form" }),
}));
jest.mock("../../components/Logo", () => ({
  __esModule: true,
  default: () => null,
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe("Page controls retained across text-tab navigation", () => {
  let container, root;
  beforeEach(() => {
    mockSendTabMsg.mockReset().mockResolvedValue({});
    mockSaveRule.mockClear();
    mockQueryPopupData.mockReset();
    mockLoadPopupData.mockReset().mockResolvedValue(mockPayload);
    require("../../libs/msg").getCurTab.mockResolvedValue(mockTab);
    window.history.replaceState(null, "", "/");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  test.each(["mismatch", "transport-error"])(
    "rolls back a failed %s translation toggle after visiting the text tab",
    async (failure) => {
      const pending = deferred();
      mockQueryPopupData.mockReturnValueOnce(pending.promise);
      act(() => root.render(<Popup />));
      await flush();
      const mainSwitch = () =>
        container.querySelector('input[aria-label="popup_translate_page"]');
      expect(mainSwitch().checked).toBe(false);
      act(() => mainSwitch().click());
      await flush();
      expect(mockSendTabMsg.mock.calls[0][0]).toBe(MSG_TRANS_TOGGLE);
      expect(mainSwitch().checked).toBe(true);
      expect(mockQueryPopupData).toHaveBeenCalledTimes(1);
      act(() => container.querySelector("#kt-popup-text-tab").click());
      await flush();
      expect(
        container.querySelector('[data-testid="text-form"]')
      ).not.toBeNull();
      expect(container.querySelector("#kt-popup-page-panel").hidden).toBe(true);
      await act(async () => {
        if (failure === "mismatch") pending.resolve(mockPayload);
        else pending.reject(new Error("Readback disconnected"));
        await Promise.resolve();
      });
      await flush();
      act(() => container.querySelector("#kt-popup-page-tab").click());
      await flush();
      expect(mainSwitch()).not.toBeNull();
      expect(mainSwitch().disabled).toBe(false);
      expect(mainSwitch().checked).toBe(false);
    }
  );

  test("keeps the pending gate and hidden success across text-tab round trips", async () => {
    const pending = deferred();
    mockQueryPopupData
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(mockPayload);
    act(() => root.render(<Popup />));
    await flush();
    const mainSwitch = () =>
      container.querySelector('input[aria-label="popup_translate_page"]');
    act(() => mainSwitch().click());
    await flush();
    act(() => container.querySelector("#kt-popup-text-tab").click());
    await flush();
    act(() => container.querySelector("#kt-popup-page-tab").click());
    await flush();
    expect(mainSwitch().checked).toBe(true);
    expect(mainSwitch().disabled).toBe(true);
    act(() => mainSwitch().click());
    await flush();
    expect(mockQueryPopupData).toHaveBeenCalledTimes(1);
    expect(mockSendTabMsg).toHaveBeenCalledTimes(1);
    act(() => container.querySelector("#kt-popup-text-tab").click());
    await flush();
    expect(container.querySelector("#kt-popup-page-panel").hidden).toBe(true);
    await act(async () => {
      pending.resolve({
        ...mockPayload,
        rule: { ...mockRule, transOpen: "true" },
      });
    });
    await flush();
    act(() => container.querySelector("#kt-popup-page-tab").click());
    await flush();
    expect(mainSwitch().checked).toBe(true);
    expect(mainSwitch().disabled).toBe(false);
    act(() => mainSwitch().click());
    await flush();
    expect(mockQueryPopupData).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".kt-popup-empty")).toBeNull();
    expect(mainSwitch()).not.toBeNull();
    expect(mainSwitch().checked).toBe(false);
  });

  test("links separate panels and does not mount text translation before it is selected", async () => {
    act(() => root.render(<Popup />));
    await flush();
    expect(container.querySelector('[data-testid="text-form"]')).toBeNull();
    const pageTab = container.querySelector("#kt-popup-page-tab");
    const textTab = container.querySelector("#kt-popup-text-tab");
    const pagePanel = container.querySelector("#kt-popup-page-panel");
    expect(pageTab.getAttribute("aria-controls")).toBe(pagePanel.id);
    expect(pagePanel.hidden).toBe(false);
    act(() => textTab.click());
    await flush();
    const textPanel = container.querySelector("#kt-popup-text-panel");
    expect(pagePanel.hidden).toBe(true);
    expect(textTab.getAttribute("aria-controls")).toBe(textPanel.id);
    expect(textPanel.getAttribute("aria-labelledby")).toBe(textTab.id);
    act(() => pageTab.click());
    await flush();
    expect(container.querySelector("#kt-popup-page-panel")).toBe(pagePanel);
    expect(pagePanel.hidden).toBe(false);
  });

  test("reconciles advanced rule confirmation and keeps expanded controls while the page is hidden", async () => {
    const pending = deferred();
    mockQueryPopupData.mockReturnValueOnce(pending.promise);
    act(() => root.render(<Popup />));
    await flush();
    act(() => container.querySelector(".kt-popup-disclosure").click());
    const richText = () =>
      container.querySelector('input[aria-label="richtext_alt"]');
    act(() => richText().click());
    await flush();
    expect(richText().checked).toBe(false);
    act(() => container.querySelector("#kt-popup-text-tab").click());
    await flush();
    await act(async () => {
      pending.resolve(mockPayload);
    });
    await flush();
    act(() => container.querySelector("#kt-popup-page-tab").click());
    await flush();
    expect(
      container
        .querySelector(".kt-popup-disclosure")
        .getAttribute("aria-expanded")
    ).toBe("true");
    expect(richText().checked).toBe(true);
  });

  test("reconciles rejected language edits while the page is hidden", async () => {
    const pending = deferred();
    mockQueryPopupData.mockReturnValueOnce(pending.promise);
    act(() => root.render(<Popup />));
    await flush();
    act(() => container.querySelector(".kt-popup-swap").click());
    await flush();
    act(() => container.querySelector("#kt-popup-text-tab").click());
    await flush();
    await act(async () => {
      pending.resolve(mockPayload);
    });
    await flush();
    act(() => container.querySelector("#kt-popup-page-tab").click());
    await flush();
    const languages = container.querySelectorAll(".kt-popup-language input");
    expect(languages[0].value).toBe("en");
    expect(languages[1].value).toBe("zh-CN");
  });

  test.each([false, true])(
    "only closes for an editor response while its page is visible (hidden: %s)",
    async (hidden) => {
      const pending = deferred();
      require("../../libs/msg").sendTopFrameMsg.mockReturnValueOnce(
        pending.promise
      );
      const close = jest.spyOn(window, "close").mockImplementation(() => {});
      try {
        act(() => root.render(<Popup />));
        await flush();
        act(() => container.querySelector(".kt-popup-disclosure").click());
        const editor = [...container.querySelectorAll("button")].find(
          (node) => node.textContent === "rule_editor_open"
        );
        act(() => editor.click());
        await flush();
        if (hidden) {
          act(() => container.querySelector("#kt-popup-text-tab").click());
          await flush();
        }
        await act(async () => {
          pending.resolve({ ruleEditorOpened: true });
        });
        await flush();
        expect(close).toHaveBeenCalledTimes(hidden ? 0 : 1);
      } finally {
        close.mockRestore();
      }
    }
  );
});
