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
  useMouseHoverSetting: () => ({
    updateMouseHoverSetting: mockUpdateMouseHoverSetting,
  }),
}));
/* eslint-disable testing-library/no-container, testing-library/no-unnecessary-act */
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import PopupCont from "./PopupCont";
import { getVisibleServices } from "./services";
import { tryClearCaches } from "../../libs/cache";
import { saveRule } from "../../libs/rules";
import { isCurrentPopupDocument } from "../../libs/popupDocument";
import { getRulesWithDefault } from "../../libs/storage";
import {
  MSG_RULE_EDITOR,
  MSG_SAVE_RULE,
  MSG_TRANS_GETRULE,
  MSG_TRANS_PUTRULE,
  MSG_TRANS_TOGGLE,
  MSG_MOUSEHOVER_TOGGLE,
  MSG_TOUCH_TRANSLATE_MODE_SET,
  MSG_TOUCH_TRANSLATE_STATE,
  OPT_LANGS_FROM_REVERSED,
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
const mockUpdateMouseHoverSetting = jest.fn();
const mockGetCurTab = jest.fn();
const mockSendBgMsg = jest.fn(async () => []);
const mockSendTabMsg = jest.fn(async () => undefined);
const mockSendTopFrameMsg = jest.fn(async () => undefined);
const mockCss = jest.fn(() => "mock-preview-class");
let mockIsExt = false;
let mockContextSetting = { blacklist: "" };

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key, fallback) =>
    key === "popup_restore_scope_hint" ? "Restore {domain}" : fallback || key,
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
jest.mock("../../libs/storage", () => ({
  getRulesWithDefault: jest.fn(async () => []),
}));
jest.mock("../../libs/popupDocument", () => ({
  isCurrentPopupDocument: jest.fn(async () => true),
}));

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function styleChoices() {
  return [...document.body.querySelectorAll(".kt-popup-style-chip")];
}

function openStyleMenu(container) {
  act(() => container.querySelector(".kt-popup-style-select").click());
}

async function selectStyle(container, name) {
  openStyleMenu(container);
  const choice = styleChoices().find((item) => item.textContent.includes(name));
  await act(async () => choice.click());
}

function languageValues(container) {
  return [...container.querySelectorAll(".kt-popup-language-select")].map(
    (button) =>
      OPT_LANGS_FROM_REVERSED.find(([, name]) => name === button.title)?.[0] ||
      button.title
  );
}

async function selectScope(container, pattern) {
  act(() => container.querySelector(".kt-popup-pattern-button").click());
  const choice = [...document.body.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent.includes(pattern)
  );
  await act(async () => choice.click());
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
    handleOpenSetting: jest.fn(),
    ...props,
  };
  const currentSetting = { ...setting, ...props.setting };
  let updateLiveSetting;

  function StatefulPopup() {
    const [currentRule, setCurrentRule] = useState({ ...rule, ...props.rule });
    const [liveSetting, setLiveSetting] = useState(currentSetting);
    updateLiveSetting = setLiveSetting;
    return (
      <PopupCont
        {...popupProps}
        rule={currentRule}
        setRule={setCurrentRule}
        setting={liveSetting}
      />
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
    updateRuntimeSetting(nextSetting) {
      act(() => updateLiveSetting(nextSetting));
    },
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
    mockUpdateMouseHoverSetting.mockReset();
    mockUpdateSetting.mockResolvedValue({ changed: true });
    mockContextSetting = { blacklist: "" };
    saveRule.mockReset();
    saveRule.mockResolvedValue({ changed: true });
    getRulesWithDefault.mockReset();
    getRulesWithDefault.mockResolvedValue([]);
    mockCss.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test.each(["disabled", "removed"])(
    "automatically selects the first enabled service for %s without saving a site rule",
    async (apiSlug) => {
      const transApis = [
        {
          apiSlug: "disabled",
          apiName: "Disabled",
          isDisabled: true,
          sortOrder: -2,
        },
        { apiSlug: "later", apiName: "Later", sortOrder: 3 },
        { apiSlug: "pinned", apiName: "Pinned", sortOrder: -1 },
      ];
      const processActions = jest.fn(({ args }) => ({ rule: args }));
      const view = renderPopupCont(
        { rule: { apiSlug }, setting: { transApis }, processActions },
        { statefulRule: true }
      );
      try {
        await flushEffects();
        expect(processActions).toHaveBeenCalledTimes(1);
        expect(processActions).toHaveBeenCalledWith({
          action: MSG_TRANS_PUTRULE,
          args: { apiSlug: "pinned" },
        });
        expect(
          view.container.querySelector('.kt-popup-service[aria-checked="true"]')
            .textContent
        ).toBe("Pinned");
        expect(
          view.container.querySelectorAll(".kt-popup-service")
        ).toHaveLength(2);
        expect(
          view.container.querySelector(".kt-popup-more-service")
        ).toBeNull();
        expect(saveRule).not.toHaveBeenCalled();
        expect(mockUpdateSetting).not.toHaveBeenCalled();
      } finally {
        view.cleanup();
      }
    }
  );

  test("uses current stored services when the page snapshot still contains a disabled choice", async () => {
    const oldApis = [
      { apiSlug: "google", apiName: "Google", sortOrder: 0 },
      { apiSlug: "next", apiName: "Next", sortOrder: 1 },
    ];
    const processActions = jest.fn(({ args }) => ({ rule: args }));
    const view = renderPopupCont(
      { setting: { transApis: oldApis }, processActions },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      expect(processActions).not.toHaveBeenCalled();
      mockContextSetting = {
        blacklist: "",
        transApis: [{ ...oldApis[0], isDisabled: true }, oldApis[1]],
      };
      view.updateRuntimeSetting({ transApis: oldApis });
      await flushEffects();
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_TRANS_PUTRULE,
        args: { apiSlug: "next" },
      });
      expect(view.container.querySelectorAll(".kt-popup-service")).toHaveLength(
        1
      );
      expect(
        view.container.querySelector('.kt-popup-service[aria-checked="true"]')
          .textContent
      ).toBe("Next");
      expect(saveRule).not.toHaveBeenCalled();
    } finally {
      view.cleanup();
    }
  });

  test("does not repeatedly retry a rejected automatic fallback", async () => {
    const processActions = jest.fn(() => {
      throw new Error("Receiver rejected fallback");
    });
    const view = renderPopupCont(
      { rule: { apiSlug: "removed" }, processActions },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      await flushEffects();
      expect(processActions).toHaveBeenCalledTimes(1);
      expect(
        view.container.querySelector(".kt-popup-action-error")
      ).not.toBeNull();
      expect(saveRule).not.toHaveBeenCalled();
    } finally {
      view.cleanup();
    }
  });

  test.each([false, true])(
    "waits for the receiver's API snapshot before settling fallback (needs retry: %s)",
    async (needsRetry) => {
      jest.useFakeTimers();
      const oldApis = [
        { apiSlug: "old" },
        { apiSlug: "next", isDisabled: true },
      ];
      const newApis = [
        { apiSlug: "old", isDisabled: true },
        { apiSlug: "next", apiName: "Next" },
      ];
      let writes = 0;
      const processActions = jest.fn(({ action }) => {
        if (action === MSG_TRANS_GETRULE)
          return {
            rule: { apiSlug: needsRetry ? "old" : "next" },
            setting: { transApis: newApis },
          };
        writes += 1;
        return writes === 1
          ? { rule: { apiSlug: "old" }, setting: { transApis: oldApis } }
          : { rule: { apiSlug: "next" }, setting: { transApis: newApis } };
      });
      const view = renderPopupCont(
        {
          rule: { apiSlug: "old" },
          setting: { transApis: newApis },
          processActions,
        },
        { statefulRule: true }
      );
      try {
        await flushEffects();
        expect(
          view.container.querySelector('.kt-popup-service[aria-checked="true"]')
            .textContent
        ).toBe("Next");
        for (
          let step = 0;
          step < 3 && processActions.mock.calls.length < 2;
          step += 1
        ) {
          await act(async () => jest.advanceTimersByTime(75));
          await flushEffects();
        }
        expect(processActions).toHaveBeenCalledWith({
          action: MSG_TRANS_GETRULE,
          args: undefined,
        });
        expect(writes).toBe(needsRetry ? 2 : 1);
        expect(
          view.container.querySelector('.kt-popup-service[aria-checked="true"]')
            .textContent
        ).toBe("Next");
        expect(
          view.container.querySelector(".kt-popup-action-error")
        ).toBeNull();
        expect(saveRule).not.toHaveBeenCalled();
      } finally {
        view.cleanup();
      }
    }
  );

  test("does not resend an old fallback after the user selects another available service", async () => {
    jest.useFakeTimers();
    const oldApis = [{ apiSlug: "old" }];
    const newApis = [
      { apiSlug: "next", apiName: "Next", sortOrder: 0 },
      { apiSlug: "manual", apiName: "Manual", sortOrder: 1 },
    ];
    const processActions = jest.fn(({ args }) =>
      args?.apiSlug === "manual"
        ? { rule: { apiSlug: "manual" }, setting: { transApis: newApis } }
        : { rule: { apiSlug: "old" }, setting: { transApis: oldApis } }
    );
    const view = renderPopupCont(
      {
        rule: { apiSlug: "old" },
        setting: { transApis: newApis },
        processActions,
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      await act(async () =>
        Array.from(view.container.querySelectorAll(".kt-popup-service"))
          .find((button) => button.textContent === "Manual")
          .click()
      );
      await act(async () => jest.advanceTimersByTime(75));
      await flushEffects();
      expect(processActions).toHaveBeenCalledTimes(2);
      expect(
        view.container.querySelector('.kt-popup-service[aria-checked="true"]')
          .textContent
      ).toBe("Manual");
      expect(view.container.querySelector(".kt-popup-action-error")).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("adopts a newer valid receiver choice instead of overriding it with automatic fallback", async () => {
    jest.useFakeTimers();
    const oldApis = [{ apiSlug: "old" }];
    const newApis = [
      { apiSlug: "next", apiName: "Next" },
      { apiSlug: "manual", apiName: "Manual" },
    ];
    const processActions = jest.fn(({ action }) =>
      action === MSG_TRANS_GETRULE
        ? { rule: { apiSlug: "manual" }, setting: { transApis: newApis } }
        : { rule: { apiSlug: "old" }, setting: { transApis: oldApis } }
    );
    const view = renderPopupCont(
      {
        rule: { apiSlug: "old" },
        setting: { transApis: newApis },
        processActions,
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      await act(async () => jest.advanceTimersByTime(150));
      await flushEffects();
      expect(
        processActions.mock.calls.filter(
          ([message]) => message.action === MSG_TRANS_PUTRULE
        )
      ).toHaveLength(1);
      expect(
        view.container.querySelector('.kt-popup-service[aria-checked="true"]')
          .textContent
      ).toBe("Manual");
    } finally {
      view.cleanup();
    }
  });

  test.each([
    ["disabled", "true", [{ apiSlug: "google", isDisabled: true }]],
    ["disabled", "false", [{ apiSlug: "google", isDisabled: true }]],
    ["empty", "true", []],
    ["empty", "false", []],
  ])(
    "disables translation for %s services with transOpen=%s",
    async (_name, transOpen, transApis) => {
      const processActions = jest.fn();
      const view = renderPopupCont(
        {
          rule: { apiSlug: "google", transOpen },
          setting: { transApis },
          processActions,
        },
        { statefulRule: true }
      );
      try {
        await flushEffects();
        expect(
          view.container.querySelectorAll(".kt-popup-service")
        ).toHaveLength(0);
        const emptyState = view.container.querySelector(
          ".kt-popup-services-empty"
        );
        expect(emptyState.textContent).toBe("popup_no_services");
        expect(emptyState.getAttribute("role")).toBe("status");
        expect(view.container.querySelector(".kt-popup-services")).toBeNull();
        expect(emptyState.querySelector("button")).toBeNull();
        const translate = view.container.querySelector(
          ".kt-popup-translate-button"
        );
        expect(translate.disabled).toBe(true);
        expect(translate.getAttribute("aria-pressed")).toBe("false");
        expect(translate.getAttribute("aria-busy")).toBe("false");
        expect(
          view.container.querySelector(".kt-popup-translate-check")
        ).toBeNull();
        await act(async () => translate.click());
        expect(processActions).not.toHaveBeenCalled();
        expect(saveRule).not.toHaveBeenCalled();
      } finally {
        view.cleanup();
      }
    }
  );

  test("recovers the translation action when a service becomes available again", async () => {
    const api = { apiSlug: "google", apiName: "Google" };
    const processActions = jest.fn(({ args }) => ({
      rule:
        args && "enabled" in args ? { transOpen: String(args.enabled) } : args,
    }));
    const view = renderPopupCont(
      {
        rule: { transOpen: "false" },
        setting: { transApis: [api] },
        processActions,
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      view.updateRuntimeSetting({ transApis: [{ ...api, isDisabled: true }] });
      await flushEffects();
      expect(
        view.container.querySelector(".kt-popup-services-empty")
      ).not.toBeNull();
      expect(
        view.container.querySelector(".kt-popup-translate-button").disabled
      ).toBe(true);
      view.updateRuntimeSetting({ transApis: [api] });
      await flushEffects();
      expect(
        view.container.querySelector(".kt-popup-services-empty")
      ).toBeNull();
      const translate = view.container.querySelector(
        ".kt-popup-translate-button"
      );
      expect(translate.disabled).toBe(false);
      await act(async () => translate.click());
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_TRANS_TOGGLE,
        args: { enabled: true },
      });
      expect(translate.getAttribute("aria-pressed")).toBe("true");
    } finally {
      view.cleanup();
    }
  });

  test("closes an open service menu when the last available service is disabled", async () => {
    const transApis = ["google", "second", "third", "fourth"].map(
      (apiSlug) => ({ apiSlug })
    );
    const view = renderPopupCont(
      { setting: { transApis } },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      act(() => view.container.querySelector(".kt-popup-more-service").click());
      expect(
        document.body.querySelectorAll(".kt-popup-service-option")
      ).toHaveLength(4);
      view.updateRuntimeSetting({
        transApis: transApis.map((api) => ({ ...api, isDisabled: true })),
      });
      await flushEffects();
      expect(document.body.querySelector(".kt-popup-service-menu")).toBeNull();
      view.updateRuntimeSetting({ transApis });
      await flushEffects();
      expect(document.body.querySelector(".kt-popup-service-menu")).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("keeps blacklist recovery available without enabled services", async () => {
    mockContextSetting = { blacklist: "example.com" };
    const view = renderPopupCont({
      setting: { transApis: [] },
      isDisabledPage: true,
      capabilities: { pageTranslation: false },
    });
    try {
      await flushEffects();
      const restore = view.container.querySelector(
        ".kt-popup-translate-button"
      );
      expect(restore.disabled).toBe(false);
      expect(restore.getAttribute("aria-label")).toBe("popup_restore_site");
      await act(async () => restore.click());
      expect(mockUpdateSetting).toHaveBeenCalled();
    } finally {
      view.cleanup();
    }
  });

  test("rediscovers a disabled page after its blacklist changes in another extension page", async () => {
    mockContextSetting = { blacklist: "example.com" };
    const onPageUnavailable = jest.fn();
    const view = renderPopupCont({
      isDisabledPage: true,
      targetTab: { id: 42, url: "https://example.com/page" },
      capabilities: { pageTranslation: false },
      onPageUnavailable,
    });
    try {
      await flushEffects();
      expect(onPageUnavailable).not.toHaveBeenCalled();
      mockSendTopFrameMsg.mockResolvedValue({
        rule: { transOpen: "false" },
        setting: {},
        document: { token: "resumed", frameId: 0 },
      });
      mockContextSetting = { blacklist: "" };
      view.rerender({});
      await flushEffects();
      expect(mockSendTopFrameMsg).toHaveBeenCalledWith(
        MSG_TRANS_GETRULE,
        undefined,
        42
      );
      expect(onPageUnavailable).toHaveBeenCalledTimes(1);
    } finally {
      view.cleanup();
    }
  });

  test("ignores disabled-page recovery when the popup is retired before the receiver replies", async () => {
    let reply;
    mockSendTopFrameMsg.mockReturnValue(
      new Promise((resolve) => {
        reply = resolve;
      })
    );
    const onPageUnavailable = jest.fn();
    const view = renderPopupCont({
      isDisabledPage: true,
      targetTab: { id: 42, url: "https://example.com/page" },
      capabilities: { pageTranslation: false },
      onPageUnavailable,
    });
    await flushEffects();
    view.cleanup();
    await act(async () => reply({ rule: { transOpen: "false" }, setting: {} }));
    expect(onPageUnavailable).not.toHaveBeenCalled();
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

  test.each([0, 7])(
    "binds touch state and mode changes to captured frame %s without querying the active tab",
    async (frameId) => {
      mockRealTouchControl = true;
      window.PointerEvent = MouseEvent;
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: 2,
      });
      const documentInfo = { frameId, token: "captured-touch-document" };
      mockGetCurTab.mockResolvedValue({ id: 99, url: "https://other.example" });
      mockSendTabMsg.mockImplementation(async (action, args) =>
        action === MSG_TRANS_GETRULE
          ? { rule: {}, setting: {}, document: documentInfo }
          : {
              touchTranslate: {
                mode: args?.mode || "off",
                supported: true,
                direction: "right",
              },
            }
      );
      const view = renderPopupCont({
        targetTab: { id: 42, url: "https://captured.example" },
        documentInfo,
      });
      try {
        await flushEffects();
        expect(mockSendTabMsg).toHaveBeenCalledWith(
          MSG_TOUCH_TRANSLATE_STATE,
          undefined,
          { frameId },
          42,
          documentInfo.token
        );
        const control = view.container.querySelector("[data-kiss-touch-ui]");
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
        expect(mockSendTabMsg).toHaveBeenCalledWith(
          MSG_TOUCH_TRANSLATE_MODE_SET,
          { mode: "tap" },
          { frameId },
          42,
          documentInfo.token
        );
        expect(mockGetCurTab).not.toHaveBeenCalled();
        expect(mockUpdateMouseHoverSetting).toHaveBeenCalledWith({
          touchMode: "tap",
        });
      } finally {
        view.cleanup();
      }
    }
  );

  test("loads touch state when the initially hidden page tab becomes visible", async () => {
    mockRealTouchControl = true;
    window.PointerEvent = MouseEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    const documentInfo = { frameId: 0, token: "captured-touch-document" };
    mockSendTabMsg.mockImplementation(async (action) =>
      action === MSG_TRANS_GETRULE
        ? { rule: {}, setting: {}, document: documentInfo }
        : {
            touchTranslate: {
              mode: "tap",
              supported: true,
              direction: "right",
            },
          }
    );
    const view = renderPopupCont({
      targetTab: { id: 42, url: "https://captured.example" },
      documentInfo,
      isVisible: false,
    });
    try {
      await flushEffects();
      expect(mockSendTabMsg).not.toHaveBeenCalled();
      expect(view.container.querySelector("[data-kiss-touch-ui]")).toBeNull();
      view.rerender({ isVisible: true });
      await flushEffects();
      expect(
        view.container.querySelector('[data-kiss-touch-ui] [role="combobox"]')
          .textContent
      ).toBe("touch_tap");
      expect(mockUpdateMouseHoverSetting).not.toHaveBeenCalled();
    } finally {
      view.cleanup();
    }
  });

  test.each(["navigation", "hidden", "reshown", "unmounted"])(
    "does not persist a late touch mode response after the popup is %s",
    async (transition) => {
      mockRealTouchControl = true;
      window.PointerEvent = MouseEvent;
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: 2,
      });
      const documentInfo = { frameId: 0, token: "captured-touch-document" };
      let finishModeChange;
      mockSendTabMsg.mockImplementation(async (action) => {
        if (action === MSG_TRANS_GETRULE)
          return { rule: {}, setting: {}, document: documentInfo };
        if (action === MSG_TOUCH_TRANSLATE_MODE_SET)
          return new Promise((resolve) => {
            finishModeChange = resolve;
          });
        return {
          touchTranslate: { mode: "off", supported: true, direction: "right" },
        };
      });
      const onPageUnavailable = jest.fn();
      const view = renderPopupCont({
        targetTab: { id: 42, url: "https://captured.example" },
        documentInfo,
        onPageUnavailable,
      });
      let unmounted = false;
      try {
        await flushEffects();
        act(() =>
          view.container
            .querySelector('[data-kiss-touch-ui] [role="combobox"]')
            .dispatchEvent(
              new MouseEvent("mousedown", { bubbles: true, button: 0 })
            )
        );
        act(() => document.querySelector('[data-value="swipe"]').click());
        if (transition === "navigation") {
          isCurrentPopupDocument.mockResolvedValue(false);
        } else if (transition === "hidden" || transition === "reshown") {
          view.rerender({ isVisible: false });
          if (transition === "reshown") view.rerender({ isVisible: true });
        } else {
          view.cleanup();
          unmounted = true;
        }
        await act(async () =>
          finishModeChange({
            touchTranslate: {
              mode: "swipe",
              supported: true,
              direction: "right",
            },
          })
        );
        expect(mockUpdateMouseHoverSetting).not.toHaveBeenCalled();
        if (transition === "navigation")
          expect(onPageUnavailable).toHaveBeenCalledTimes(1);
      } finally {
        if (!unmounted) view.cleanup();
      }
    }
  );

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

  test("keeps page options and site tools available without an advanced disclosure", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      expect(view.container.querySelector(".kt-popup-disclosure")).toBeNull();
      expect(
        [
          ...view.container.querySelectorAll(
            '.kt-popup-option-row[role="switch"]'
          ),
        ].map((row) => row.getAttribute("aria-label"))
      ).toEqual([
        "autoscan_alt",
        "scan_all_nodes",
        "richtext_alt",
        "plain_text_translate",
      ]);
      expect(
        view.container.querySelector(".kt-popup-editor-button")
      ).not.toBeNull();
      expect(
        view.container.querySelector(".kt-popup-save-button")
      ).not.toBeNull();
      expect(
        view.container.querySelector(".kt-popup-cache-button")
      ).not.toBeNull();
      expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("keeps cache clearing available without a site domain", async () => {
    mockGetCurTab.mockResolvedValueOnce({ url: "" });
    const view = renderPopupCont();
    try {
      await flushEffects();
      const siteButtons = view.container.querySelectorAll(
        ".kt-popup-save-button, .kt-popup-disable-button"
      );
      expect(siteButtons).toHaveLength(2);
      siteButtons.forEach((button) => expect(button.disabled).toBe(true));

      const clearCache = view.container.querySelector(".kt-popup-cache-button");
      expect(clearCache.disabled).toBe(false);

      await act(async () => clearCache.click());

      expect(tryClearCaches).toHaveBeenCalledTimes(1);
      expect(view.container.textContent).toContain("popup_cache_cleared");
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
      const openEditor = view.container.querySelector(
        ".kt-popup-editor-button"
      );

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
      const openEditor = view.container.querySelector(
        ".kt-popup-editor-button"
      );

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
    const languages = () => languageValues(view.container);

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
    expect(languageValues(view.container)).toEqual(["en", "fr"]);

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

  test("shows all style choices in a portal menu and keeps the selected custom style", async () => {
    const processActions = jest.fn(({ args }) => ({ rule: args }));
    const view = renderPopupCont({ processActions }, { statefulRule: true });
    try {
      await flushEffects();
      const trigger = view.container.querySelector(".kt-popup-style-select");
      expect(trigger.textContent).toContain("Style 6");
      expect(styleChoices()).toHaveLength(0);
      openStyleMenu(view.container);
      const choices = styleChoices();
      expect(choices).toHaveLength(7);
      expect(
        choices.find((item) => item.getAttribute("aria-pressed") === "true")
          .textContent
      ).toContain("Style 6");
      expect(view.container.querySelector(".kt-popup-style-chip")).toBeNull();
      expect(JSON.stringify(mockCss.mock.calls)).toContain(
        mockStyles[0].styleCode
      );
      expect(JSON.stringify(mockCss.mock.calls)).not.toContain(
        DANGEROUS_STYLE_CODE
      );
      const nextStyle = choices.find((item) =>
        item.textContent.includes("Style 5")
      );
      await act(async () => nextStyle.click());
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_TRANS_PUTRULE,
        args: { textStyle: "style_5" },
      });
      expect(trigger.textContent).toContain("Style 5");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
    } finally {
      view.cleanup();
    }
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
    const clearCache = view.container.querySelector(".kt-popup-cache-button");

    act(() => clearCache.click());
    expect(tryClearCaches).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).not.toContain("popup_cache_cleared");
    expect(view.container.textContent).not.toContain("popup_cache_failed");

    await act(async () => resolveClear(true));
    expect(view.container.textContent).toContain("popup_cache_cleared");
    view.cleanup();
  });

  test("reports cache clearing failure without a success message", async () => {
    tryClearCaches.mockResolvedValueOnce(false);
    const view = renderPopupCont();
    await flushEffects();
    const clearCache = view.container.querySelector(".kt-popup-cache-button");

    await act(async () => clearCache.click());
    expect(view.container.textContent).toContain("popup_cache_failed");
    expect(view.container.textContent).not.toContain("popup_cache_cleared");
    view.cleanup();
  });

  test("restores the cache action after its inline result timeout", async () => {
    jest.useFakeTimers();
    const view = renderPopupCont();
    try {
      await flushEffects();
      const clearCache = view.container.querySelector(".kt-popup-cache-button");
      await act(async () => clearCache.click());
      expect(clearCache.textContent).not.toContain("clear_cache");
      expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
      act(() => jest.advanceTimersByTime(2000));
      expect(clearCache.textContent).toContain("clear_cache");
    } finally {
      view.cleanup();
    }
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
      view.container.querySelector(".kt-popup-translate-button").title
    ).toContain("Alt+Q");
    expect(
      view.container.querySelector(".kt-popup-translate-button").title
    ).not.toContain("AltLeft+KeyQ");
    view.cleanup();
  });

  test("shows persistent global segments without changing preferences until clicked", async () => {
    const processActions = jest.fn();
    const setting = {
      tranboxSetting: { transOpen: true },
      mouseHoverSetting: { useMouseHover: true },
      inputRule: { transOpen: true },
    };
    const view = renderPopupCont({ processActions, setting });
    await flushEffects();

    [
      "selection_translate",
      "popup_hover_translation",
      "input_translate",
    ].forEach((label) => {
      expect(view.container.textContent).toContain(label);
    });
    expect(processActions).not.toHaveBeenCalled();
    expect(mockUpdateSetting).not.toHaveBeenCalled();
    const group = view.container.querySelector(".kt-popup-global-features");
    expect(group.previousElementSibling.className).toBe(
      "kt-popup-settings-grid"
    );
    expect(group.nextElementSibling.className).toBe("kt-popup-bottom-actions");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.closest('[aria-disabled="true"]')).toBeNull();
    expect(setting).toEqual({
      tranboxSetting: { transOpen: true },
      mouseHoverSetting: { useMouseHover: true },
      inputRule: { transOpen: true },
    });
    view.cleanup();
  });

  test("confirms and persists a global toggle without dirtying or saving it in a site rule", async () => {
    mockContextSetting = {
      blacklist: "",
      mouseHoverSetting: { useMouseHover: false, retained: true },
    };
    mockUpdateSetting.mockImplementation(async (reduce) => {
      mockContextSetting = reduce(mockContextSetting);
      return { value: mockContextSetting, changed: true };
    });
    const processActions = jest.fn(({ action, args }) =>
      action === MSG_MOUSEHOVER_TOGGLE
        ? { setting: { mouseHoverSetting: { useMouseHover: args.enabled } } }
        : undefined
    );
    const view = renderPopupCont({ processActions });
    try {
      await flushEffects();
      await act(async () =>
        view.container
          .querySelector('.kt-popup-global-feature[data-feature="hover"]')
          .click()
      );
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_MOUSEHOVER_TOGGLE,
        args: { enabled: true },
      });
      expect(mockContextSetting.mouseHoverSetting).toEqual({
        useMouseHover: true,
        retained: true,
      });
      expect(
        view.container
          .querySelector(".kt-popup-save-button")
          .getAttribute("data-dirty-count")
      ).toBe("0");
      await act(async () =>
        view.container.querySelector(".kt-popup-save-button").click()
      );
      expect(saveRule.mock.calls[0][0].pattern).toBe("example.com");
      for (const name of ["tranboxSetting", "mouseHoverSetting", "inputRule"])
        expect(saveRule.mock.calls[0][0]).not.toHaveProperty(name);
    } finally {
      view.cleanup();
    }
  });

  test("keeps permitted global preferences available in the disabled-site snapshot", async () => {
    mockContextSetting = {
      blacklist: "example.com",
      mouseHoverSetting: { useMouseHover: false },
    };
    mockUpdateSetting.mockImplementation(async (reduce) => {
      mockContextSetting = reduce(mockContextSetting);
      return { value: mockContextSetting, changed: true };
    });
    const processActions = jest.fn();
    const view = renderPopupCont({
      isDisabledPage: true,
      processActions,
      capabilities: {
        pageTranslation: false,
        selectionTranslation: false,
        hoverTranslation: true,
        inputTranslation: true,
      },
    });
    try {
      await flushEffects();
      expect(
        view.container.querySelectorAll(".kt-popup-global-feature")
      ).toHaveLength(2);
      expect(
        view.container
          .querySelector(".kt-popup-global-features")
          .closest('[aria-disabled="true"]')
      ).toBeNull();
      const hover = view.container.querySelector(
        '.kt-popup-global-feature[data-feature="hover"]'
      );
      expect(hover.disabled).toBe(false);
      await act(async () => hover.click());
      expect(mockContextSetting.mouseHoverSetting.useMouseHover).toBe(true);
      expect(processActions).not.toHaveBeenCalled();
      expect(
        view.container
          .querySelector(".kt-popup-settings-grid")
          .getAttribute("aria-disabled")
      ).toBe("true");
      expect(
        view.container
          .querySelector(".kt-popup-save-button")
          .getAttribute("data-dirty-count")
      ).toBe("0");
    } finally {
      view.cleanup();
    }
  });

  test("dispatches one explicit page translation state from the main action", async () => {
    const processActions = jest.fn(({ args }) => ({
      rule: { transOpen: args.enabled ? "true" : "false" },
    }));
    const view = renderPopupCont({ processActions }, { statefulRule: true });
    await flushEffects();

    const mainAction = view.container.querySelector(
      ".kt-popup-translate-button"
    );
    await act(async () => {
      mainAction.click();
      await Promise.resolve();
    });

    expect(processActions).toHaveBeenCalledTimes(1);
    expect(processActions).toHaveBeenCalledWith({
      action: MSG_TRANS_TOGGLE,
      args: { enabled: false },
    });
    expect(mainAction.getAttribute("aria-pressed")).toBe("false");
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
      transOpen: "false",
      apiSlug: "google",
      fromLang: "auto",
      toLang: "zh-CN",
    };
    const setRule = jest.fn((update) => {
      liveRule = typeof update === "function" ? update(liveRule) : update;
    });
    const view = renderPopupCont({ processActions, setRule, rule: liveRule });
    await flushEffects();

    const mainAction = view.container.querySelector(
      ".kt-popup-translate-button"
    );
    act(() => mainAction.click());
    expect(liveRule.transOpen).toBe("true");
    expect(mainAction.disabled).toBe(true);
    expect(mainAction.getAttribute("aria-busy")).toBe("true");
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("true");

    act(() =>
      view.container.querySelector(".kt-popup-translate-button").click()
    );
    expect(processActions).toHaveBeenCalledTimes(1);

    liveRule = { ...liveRule, apiSlug: "deepl", toLang: "fr" };
    await act(async () => {
      resolveAction({
        rule: {
          transOpen: "true",
          apiSlug: "stale-service",
          toLang: "stale-language",
        },
      });
      await Promise.resolve();
    });

    expect(mainAction.disabled).toBe(false);
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("true");
    act(() => jest.runOnlyPendingTimers());
    expect(
      view.container.querySelector(".kt-popup-hero").getAttribute("aria-busy")
    ).toBe("false");

    expect(liveRule).toMatchObject({
      transOpen: "true",
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

    const mainAction = view.container.querySelector(
      ".kt-popup-translate-button"
    );
    await act(async () => {
      mainAction.click();
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

    const mainAction = view.container.querySelector(
      ".kt-popup-translate-button"
    );
    await act(async () => {
      mainAction.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(liveRule.transOpen).toBe("true");
    expect(setRule).toHaveBeenCalledTimes(2);
    const alert = view.container.querySelector(
      ".kt-popup-translate-label--error"
    );
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain("rule_toggle_failed");
    expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
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
      view.container.querySelector(".kt-popup-translate-button").click();
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

    const mainAction = view.container.querySelector(
      ".kt-popup-translate-button"
    );
    await act(async () => {
      mainAction.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(liveRule.transOpen).toBe("true");
    expect(view.container.textContent).toContain("rule_toggle_failed");
    view.cleanup();
  });

  test("selects an overflow service from a portal menu without growing the service row", async () => {
    const setting = {
      transApis: ["google", "deepl", "microsoft", "openai", "claude"].map(
        (apiSlug) => ({
          apiSlug,
          apiName: apiSlug,
          apiType: apiSlug,
        })
      ),
    };
    const processActions = jest.fn(({ args }) => ({ rule: args }));
    const view = renderPopupCont(
      { setting, processActions },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      const visibleServices = () => [
        ...view.container.querySelectorAll(".kt-popup-service"),
      ];
      expect(visibleServices()).toHaveLength(3);
      const moreServices = view.container.querySelector(
        ".kt-popup-more-service"
      );
      expect(moreServices.getAttribute("aria-expanded")).toBe("false");
      act(() => moreServices.click());
      expect(moreServices.getAttribute("aria-expanded")).toBe("true");
      const choices = [...document.body.querySelectorAll('[role="menuitem"]')];
      const overflowService = choices.find((choice) =>
        choice.textContent.includes("openai")
      );
      expect(overflowService).toBeDefined();
      expect(view.container.contains(overflowService)).toBe(false);
      await act(async () => overflowService.click());
      expect(processActions).toHaveBeenCalledWith({
        action: MSG_TRANS_PUTRULE,
        args: { apiSlug: "openai" },
      });
      expect(visibleServices()).toHaveLength(3);
      expect(visibleServices().map((service) => service.textContent)).toEqual([
        "google",
        "deepl",
        "openai",
      ]);
      expect(moreServices.getAttribute("aria-expanded")).toBe("false");
    } finally {
      view.cleanup();
    }
  });

  test("shows the normal translation action without a disabled-site badge", async () => {
    const view = renderPopupCont();
    try {
      await flushEffects();
      expect(
        view.container.querySelector(".kt-popup-hero--blocked")
      ).toBeNull();
      expect(
        view.container.querySelector(".kt-popup-translate-button").disabled
      ).toBe(false);
      expect(
        view.container.querySelector(".kt-popup-blocked-badge")
      ).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test.each(["add", "remove"])(
    "rebases a blacklist %s and waits for persistence before showing its result",
    async (operation) => {
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
        const action =
          operation === "remove"
            ? view.container.querySelector(".kt-popup-translate-button")
            : [...view.container.querySelectorAll("button")].find((button) =>
                button.textContent.includes("popup_disable_site")
              );
        act(() => action.click());
        const reduce = mockUpdateSetting.mock.calls[0][0];
        const current = {
          blacklist: "example.com,other.example",
          retained: true,
        };
        const value = reduce(current);
        expect(value).toEqual(
          operation === "add"
            ? { blacklist: "example.com\nother.example", retained: true }
            : { blacklist: "other.example", retained: true }
        );
        if (operation === "add") {
          expect(reduce({ blacklist: "other.example" }).blacklist).toBe(
            "other.example\nexample.com"
          );
        }
        expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
        await act(async () => completeSave({ value, changed: true }));
        expect(view.container.querySelector('[role="alert"]')).toBeNull();
      } finally {
        view.cleanup();
      }
    }
  );

  test("reports a blacklist write failure inline and keeps page controls enabled", async () => {
    mockUpdateSetting.mockRejectedValueOnce(new Error("Storage unavailable"));
    const view = renderPopupCont();
    try {
      await flushEffects();
      const action = [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent.includes("popup_disable_site")
      );
      await act(async () => action.click());
      expect(
        view.container.querySelector(".kt-popup-action-error")
      ).not.toBeNull();
      expect(
        view.container.querySelector(".kt-popup-translate-button").disabled
      ).toBe(false);
      expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
    } finally {
      view.cleanup();
    }
  });

  test("restores only the selected blacklist scope and preserves overlapping broad entries", async () => {
    mockContextSetting = {
      blacklist: "docs.example.com\n*.example.com\nother.example\n*",
      retained: true,
    };
    mockUpdateSetting.mockImplementation(async (reduce) => {
      const value = reduce(mockContextSetting);
      mockContextSetting = value;
      return { value, changed: true };
    });
    const view = renderPopupCont({
      targetTab: { id: 42, url: "https://docs.example.com/page" },
    });
    try {
      await flushEffects();
      const restore = view.container.querySelector(
        ".kt-popup-translate-button"
      );
      expect(restore.getAttribute("aria-label")).toBe("popup_restore_site");
      expect(
        [
          ...view.container.querySelectorAll(
            '.kt-popup-option-row[role="switch"]'
          ),
        ].every((row) => row.disabled)
      ).toBe(true);
      expect(
        view.container.querySelector(".kt-popup-style-select").disabled
      ).toBe(true);
      expect(restore.title).toContain("docs.example.com");
      await act(async () => restore.click());
      expect(mockContextSetting).toEqual({
        blacklist: "*.example.com\nother.example\n*",
        retained: true,
      });
      expect(restore.getAttribute("aria-label")).toBe("popup_restore_site");
      await selectScope(view.container, "*.example.com");
      expect(restore.title).toContain("*.example.com");
      await act(async () => restore.click());
      expect(mockContextSetting).toEqual({
        blacklist: "other.example\n*",
        retained: true,
      });
      expect(restore.getAttribute("aria-label")).toBe("popup_restore_site");
      expect(
        view.container.querySelector(".kt-popup-style-select").disabled
      ).toBe(true);
      expect(mockSendTabMsg).not.toHaveBeenCalledWith(
        MSG_TRANS_TOGGLE,
        expect.anything()
      );
    } finally {
      view.cleanup();
    }
  });

  test.each([false, true])(
    "waits for a rule save and includes the live translation flag (extension content: %s)",
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
        const action = view.container.querySelector(".kt-popup-save-button");
        act(() => action.click());
        expect(action.getAttribute("data-save-status")).toBe("saving");
        const domain = extensionContent
          ? new URL(window.location.href).hostname
          : "example.com";
        expect(persist).toHaveBeenCalledWith(
          ...(extensionContent ? [MSG_SAVE_RULE] : []),
          expect.objectContaining({ pattern: domain, transOpen: "true" })
        );
        expect(action.disabled).toBe(true);
        await act(async () => completeSave({ changed: true }));
        expect(action.getAttribute("data-save-status")).toBe("saved");
        expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
      } finally {
        view.cleanup();
      }
    }
  );

  test.each([false, true])(
    "keeps a rejected rule save retryable (extension content: %s)",
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
        const action = view.container.querySelector(".kt-popup-save-button");
        await act(async () => action.click());
        expect(action.getAttribute("data-save-status")).toBe("error");
        expect(action.disabled).toBe(false);
        expect(view.container.querySelector(".MuiSnackbar-root")).toBeNull();
      } finally {
        view.cleanup();
      }
    }
  );

  test("recognizes an existing rule for the initially selected site", async () => {
    getRulesWithDefault.mockResolvedValue([
      { pattern: "*" },
      { pattern: "example.com", apiSlug: "google" },
    ]);
    const view = renderPopupCont();
    try {
      await flushEffects();
      const action = view.container.querySelector(".kt-popup-save-button");
      expect(action.getAttribute("data-dirty-count")).toBe("0");
      expect(action.textContent).toContain("popup_saved");
      expect(saveRule).not.toHaveBeenCalled();
    } finally {
      view.cleanup();
    }
  });

  test("keeps a completed save marked saved when the initial rule read resolves later", async () => {
    let completeInitialRead;
    getRulesWithDefault.mockReturnValueOnce(
      new Promise((resolve) => {
        completeInitialRead = resolve;
      })
    );
    const view = renderPopupCont();
    try {
      await flushEffects();
      const save = view.container.querySelector(".kt-popup-save-button");
      await act(async () => save.click());
      expect(save.getAttribute("data-save-status")).toBe("saved");
      await act(async () => completeInitialRead([{ pattern: "*" }]));
      expect(save.textContent).toContain("popup_saved");
      expect(save.disabled).toBe(true);
      expect(save.getAttribute("data-dirty-count")).toBe("0");
    } finally {
      view.cleanup();
    }
  });

  test("operates service and display radios and the style grid with arrow keys", async () => {
    const processActions = jest.fn(({ args }) => ({ rule: args }));
    const view = renderPopupCont(
      {
        processActions,
        setting: {
          transApis: ["google", "deepl", "microsoft"].map((apiSlug) => ({
            apiSlug,
            apiName: apiSlug,
          })),
        },
      },
      { statefulRule: true }
    );
    try {
      await flushEffects();
      const service = view.container.querySelector(
        '.kt-popup-service[aria-checked="true"]'
      );
      service.focus();
      await act(async () =>
        service.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            bubbles: true,
            cancelable: true,
          })
        )
      );
      expect(document.activeElement.textContent).toBe("deepl");
      expect(
        view.container.querySelector('.kt-popup-service[aria-checked="true"]')
          .textContent
      ).toBe("deepl");
      const bilingual = view.container.querySelector(
        '.kt-popup-display-mode [aria-checked="true"]'
      );
      bilingual.focus();
      await act(async () =>
        bilingual.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "End",
            bubbles: true,
            cancelable: true,
          })
        )
      );
      expect(
        view.container.querySelector(
          '.kt-popup-display-mode [aria-checked="true"]'
        ).textContent
      ).toBe("popup_translation_only");
      openStyleMenu(view.container);
      const choices = styleChoices();
      choices[0].focus();
      act(() =>
        choices[0].dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "ArrowDown",
            bubbles: true,
            cancelable: true,
          })
        )
      );
      expect(document.activeElement).toBe(choices[3]);
      expect(processActions).toHaveBeenCalledTimes(2);
      await act(async () => document.activeElement.click());
      expect(processActions).toHaveBeenLastCalledWith({
        action: MSG_TRANS_PUTRULE,
        args: { textStyle: "style_3" },
      });
    } finally {
      view.cleanup();
    }
  });

  test("counts only the nine site fields and excludes translation and global settings", async () => {
    const rule = {
      fromLang: "en",
      toLang: "fr",
      apiSlug: "google",
      textStyle: "style_6",
      transOnly: "false",
      hasRichText: "true",
      scanAll: "false",
      isPlainText: false,
      autoScan: "true",
      transOpen: "false",
    };
    const view = renderPopupCont({ rule });
    try {
      await flushEffects();
      const save = view.container.querySelector(".kt-popup-save-button");
      view.rerender({
        rule: { ...rule, transOpen: "true" },
        setting: { blacklist: "other.example" },
      });
      expect(save.getAttribute("data-dirty-count")).toBe("0");
      view.rerender({
        rule: {
          ...rule,
          fromLang: "fr",
          toLang: "en",
          apiSlug: "deepl",
          textStyle: "style_0",
          transOnly: "true",
          hasRichText: "false",
          scanAll: "true",
          isPlainText: true,
          autoScan: "false",
          transOpen: "true",
        },
      });
      expect(save.getAttribute("data-dirty-count")).toBe("9");
    } finally {
      view.cleanup();
    }
  });

  test("preserves a newer edit when an earlier save completes", async () => {
    let completeSave;
    saveRule.mockReturnValueOnce(
      new Promise((resolve) => (completeSave = resolve))
    );
    const processActions = jest.fn(({ args }) => ({ rule: args }));
    const view = renderPopupCont({ processActions }, { statefulRule: true });
    try {
      await flushEffects();
      const save = view.container.querySelector(".kt-popup-save-button");
      await act(async () =>
        view.container
          .querySelector('.kt-popup-option-row[aria-label="autoscan_alt"]')
          .click()
      );
      expect(save.getAttribute("data-dirty-count")).toBe("1");
      act(() => save.click());
      expect(saveRule.mock.calls[0][0].autoScan).toBe("false");
      await act(async () =>
        view.container
          .querySelector('.kt-popup-option-row[aria-label="scan_all_nodes"]')
          .click()
      );
      await act(async () => completeSave());
      expect(save.getAttribute("data-dirty-count")).toBe("1");
      expect(
        view.container
          .querySelector('.kt-popup-option-row[aria-label="scan_all_nodes"]')
          .getAttribute("aria-checked")
      ).toBe("true");
      expect(save.disabled).toBe(false);
    } finally {
      view.cleanup();
    }
  });

  test("uses one captured tab for the site label, command, and state confirmation", async () => {
    mockSendTopFrameMsg.mockResolvedValue({ rule: { transOpen: "false" } });
    const view = renderPopupCont({
      targetTab: { id: 42, url: "https://captured.example/article" },
    });
    await flushEffects();

    expect(mockGetCurTab).not.toHaveBeenCalled();
    expect(
      view.container.querySelector(".kt-popup-pattern-button").textContent
    ).toContain("captured.example");
    await act(async () => {
      view.container.querySelector(".kt-popup-translate-button").click();
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
        view.container.querySelector(".kt-popup-translate-button").click()
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
        view.container
          .querySelector(".kt-popup-translate-button")
          .getAttribute("aria-pressed")
      ).toBe("false");
      expect(view.container.textContent).toContain("rule_toggle_failed");
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
        view.container.querySelector(".kt-popup-translate-button").click()
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
        view.container
          .querySelector(".kt-popup-translate-button")
          .getAttribute("aria-pressed")
      ).toBe("true");
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
          view.container.querySelector(".kt-popup-translate-button").click()
        );
        expect(mockSendTabMsg).toHaveBeenCalledTimes(2);
        expect(onPageUnavailable).toHaveBeenCalledTimes(
          receiverAvailable ? 0 : 1
        );
        expect(
          view.container
            .querySelector(".kt-popup-translate-button")
            .getAttribute("aria-pressed")
        ).toBe("false");
        expect(view.container.textContent).toContain("rule_toggle_failed");
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
        await selectScope(view.container, "*.example.com");
        view.rerender({ targetTab: { ...targetTab, status: "complete" } });
        await flushEffects();
        expect(
          view.container.querySelector(".kt-popup-pattern-button").textContent
        ).toContain("*.example.com");
        const button =
          action === "save"
            ? view.container.querySelector(".kt-popup-save-button")
            : [...view.container.querySelectorAll("button")].find((candidate) =>
                candidate.textContent.includes("popup_disable_site")
              );
        await act(async () => button.click());
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

    expect(
      view.container.querySelector(".kt-popup-translate-button").disabled
    ).toBe(false);
    expect(
      view.container.querySelector(".kt-popup-settings-grid")
    ).not.toBeNull();
    expect(view.container.textContent).not.toContain("rule_editor_open");
    view.cleanup();
  });

  test("keeps cache clearing available when a PDF receiver cannot translate the page", async () => {
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
      const mainAction = view.container.querySelector(
        ".kt-popup-translate-button"
      );
      expect(mainAction.disabled).toBe(true);
      expect(mainAction.getAttribute("aria-pressed")).toBe("false");
      expect(
        view.container
          .querySelector(".kt-popup-language-row")
          .getAttribute("aria-disabled")
      ).toBe("true");
      expect(
        view.container.querySelector(".kt-popup-style-select").disabled
      ).toBe(true);
      expect(
        view.container.querySelector(".kt-popup-editor-button")
      ).toBeNull();
      expect(
        view.container.querySelector(".kt-popup-cache-button").disabled
      ).toBe(false);
      act(() => mainAction.click());
      expect(mockSendTabMsg).not.toHaveBeenCalled();
      expect(view.container.querySelector(".kt-popup-disclosure")).toBeNull();
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
      if (control === "style") openStyleMenu(view.container);
      const clickTarget =
        control === "service"
          ? view.container.querySelector(".kt-popup-service")
          : control === "style"
            ? styleChoices().find((choice) =>
                choice.textContent.includes("Style 0")
              )
            : view.container.querySelector(".kt-popup-swap");

      await act(async () => clickTarget.click());
      await flushEffects();

      expect(
        view.container.querySelector('.kt-popup-service[aria-checked="true"]')
      ).toBeNull();
      expect(
        view.container.querySelector(".kt-popup-style-select").textContent
      ).toContain("Style 6");
      expect(languageValues(view.container)).toEqual(["en", "fr"]);
      expect(view.container.textContent).toContain("popup_action_failed");
      view.cleanup();
    }
  );

  test("keeps the popup open when the rule editor has no receiver", async () => {
    const closeWindow = jest
      .spyOn(window, "close")
      .mockImplementation(() => {});
    const view = renderPopupCont();
    try {
      await flushEffects();
      await act(async () =>
        view.container.querySelector(".kt-popup-editor-button").click()
      );
      expect(closeWindow).not.toHaveBeenCalled();
      expect(
        view.container
          .querySelector(".kt-popup-editor-button")
          .getAttribute("data-error")
      ).toBe("true");
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

    expect(languageValues(view.container)).toEqual(["en", "fr"]);
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

    act(() => view.container.querySelectorAll(".kt-popup-service")[1].click());
    await selectStyle(view.container, "Style 0");
    await act(async () => failService(new Error("Page action rejected")));

    expect(
      view.container.querySelector('.kt-popup-service[aria-checked="true"]')
        .textContent
    ).toContain("google");
    expect(
      view.container.querySelector(".kt-popup-style-select").textContent
    ).toContain("Style 0");
    expect(view.container.textContent).toContain("popup_action_failed");
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

    expect(languageValues(view.container)).toEqual(["fr", "en"]);
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

  test("shows three services while preserving an active service outside the first three", () => {
    expect(getVisibleServices(services, "deepl", false)).toEqual([
      services[0],
      services[1],
      services[3],
    ]);
  });

  test("shows every service after expanding more", () => {
    expect(getVisibleServices(services, "microsoft", true)).toEqual(services);
  });

  test("falls back to the first three services when the active key is stale", () => {
    expect(getVisibleServices(services, "missing", false)).toEqual(
      services.slice(0, 3)
    );
  });
});
