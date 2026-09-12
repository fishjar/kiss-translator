const mockTranslatorInstances = [];
const mockTranslatorArgs = [];
const mockTransboxInstances = [];
const mockTransboxArgs = [];
const mockInputTranslatorInstances = [];
const mockPopupInstances = [];
const mockFabInstances = [];
const activeManagers = [];

jest.mock("./ruleEditorManager", () => ({
  RuleEditorManager: class {
    destroy = jest.fn();
    open = jest.fn();
  },
}));

jest.mock("../config", () => ({
  EVENT_KISS_INNER: "kiss-inner",
  EVENT_KISS_TRANSLATOR: "kiss-translator",
  MSG_HOVERNODE_TOGGLE: "hovernode-toggle",
  MSG_INPUT_TRANSLATE: "input-translate",
  MSG_TRANS_TOGGLE: "trans-toggle",
  MSG_TRANS_TOGGLE_ONLY: "trans-toggle-only",
  MSG_TRANS_TOGGLE_STYLE: "trans-toggle-style",
  MSG_TRANS_GETRULE: "trans-getrule",
  MSG_TRANS_PUTRULE: "trans-putrule",
  MSG_OPEN_TRANBOX: "open-tranbox",
  MSG_TRANSBOX_TOGGLE: "transbox-toggle",
  MSG_POPUP_TOGGLE: "popup-toggle",
  MSG_MOUSEHOVER_TOGGLE: "mousehover-toggle",
  MSG_TRANSINPUT_TOGGLE: "transinput-toggle",
  OPT_SHORTCUT_TRANSLATE: "translate",
  OPT_SHORTCUT_TRANSONLY: "transonly",
  OPT_SHORTCUT_STYLE: "style",
  OPT_SHORTCUT_POPUP: "popup",
  OPT_SHORTCUT_SETTING: "setting",
  newI18n: () => (key) => key,
}));

jest.mock("./browser", () => ({
  browser: {
    runtime: {
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
  },
}));

jest.mock("./translator", () => ({
  Translator: jest.fn().mockImplementation((args) => {
    mockTranslatorArgs.push(args);
    const instance = {
      setting: args.setting,
      rule: args.rule,
      stop: jest.fn(function stop() {
        this.rule.transOpen = "false";
      }),
      rescan: jest.fn(),
      toggle: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      toggleTransOnly: jest.fn(),
      toggleStyle: jest.fn(),
      updateRule: jest.fn(),
      toggleTransbox: jest.fn(function toggleTransbox() {
        this.setting.tranboxSetting.transOpen =
          !this.setting.tranboxSetting.transOpen;
      }),
      toggleMouseHover: jest.fn(function toggleMouseHover() {
        this.setting.mouseHoverSetting.useMouseHover =
          !this.setting.mouseHoverSetting.useMouseHover;
      }),
      toggleInputTranslate: jest.fn(function toggleInputTranslate() {
        this.setting.inputRule.transOpen = !this.setting.inputRule.transOpen;
      }),
      toggleHoverNode: jest.fn(),
    };
    mockTranslatorInstances.push(instance);
    return instance;
  }),
}));

jest.mock("./tranbox", () => ({
  TransboxManager: jest.fn().mockImplementation((setting) => {
    mockTransboxArgs.push(setting);
    let enabled = Boolean(setting.tranboxSetting?.transOpen);
    const instance = {
      isEnabled: jest.fn(() => enabled),
      enable: jest.fn(() => {
        enabled = true;
      }),
      disable: jest.fn(() => {
        enabled = false;
      }),
      toggle: jest.fn(() => {
        enabled = !enabled;
      }),
    };
    mockTransboxInstances.push(instance);
    return instance;
  }),
}));

jest.mock("./inputTranslate", () => ({
  InputTranslator: jest.fn().mockImplementation(() => {
    const instance = {
      enable: jest.fn(),
      disable: jest.fn(),
      toggle: jest.fn(),
      handleTranslate: jest.fn(),
    };
    mockInputTranslatorInstances.push(instance);
    return instance;
  }),
}));

jest.mock("./popupManager", () => ({
  PopupManager: jest.fn().mockImplementation(() => {
    const instance = {
      destroy: jest.fn(),
      toggle: jest.fn(),
    };
    mockPopupInstances.push(instance);
    return instance;
  }),
}));

jest.mock("./fabManager", () => ({
  FabManager: jest.fn().mockImplementation(() => {
    const instance = {
      destroy: jest.fn(),
    };
    mockFabInstances.push(instance);
    return instance;
  }),
}));

jest.mock("./shortcut", () => ({
  shortcutRegister: jest.fn(() => jest.fn()),
}));

jest.mock("./touch", () => ({
  touchTapListener: jest.fn(() => jest.fn()),
}));

jest.mock("./iframe", () => ({
  sendIframeMsg: jest.fn(),
}));

jest.mock("./log", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

const { browser } = require("./browser");
const { Translator } = require("./translator");
const { TransboxManager } = require("./tranbox");
const { InputTranslator } = require("./inputTranslate");
const { PopupManager } = require("./popupManager");
const { FabManager } = require("./fabManager");
const TranslatorManager = require("./translatorManager").default;

function setupMockConstructors() {
  Translator.mockImplementation((args) => {
    mockTranslatorArgs.push(args);
    const instance = {
      setting: args.setting,
      rule: args.rule,
      stop: jest.fn(function stop() {
        this.rule.transOpen = "false";
      }),
      rescan: jest.fn(),
      toggle: jest.fn(),
      enable: jest.fn(),
      disable: jest.fn(),
      toggleTransOnly: jest.fn(),
      toggleStyle: jest.fn(),
      updateRule: jest.fn(),
      toggleTransbox: jest.fn(function toggleTransbox() {
        this.setting.tranboxSetting.transOpen =
          !this.setting.tranboxSetting.transOpen;
      }),
      toggleMouseHover: jest.fn(function toggleMouseHover() {
        this.setting.mouseHoverSetting.useMouseHover =
          !this.setting.mouseHoverSetting.useMouseHover;
      }),
      toggleInputTranslate: jest.fn(function toggleInputTranslate() {
        this.setting.inputRule.transOpen = !this.setting.inputRule.transOpen;
      }),
      toggleHoverNode: jest.fn(),
    };
    mockTranslatorInstances.push(instance);
    return instance;
  });

  TransboxManager.mockImplementation((setting) => {
    mockTransboxArgs.push(setting);
    let enabled = Boolean(setting.tranboxSetting?.transOpen);
    const instance = {
      isEnabled: jest.fn(() => enabled),
      enable: jest.fn(() => {
        enabled = true;
      }),
      disable: jest.fn(() => {
        enabled = false;
      }),
      toggle: jest.fn(() => {
        enabled = !enabled;
      }),
    };
    mockTransboxInstances.push(instance);
    return instance;
  });

  InputTranslator.mockImplementation(() => {
    const instance = {
      enable: jest.fn(),
      disable: jest.fn(),
      toggle: jest.fn(),
      handleTranslate: jest.fn(),
    };
    mockInputTranslatorInstances.push(instance);
    return instance;
  });

  PopupManager.mockImplementation(() => {
    const instance = {
      destroy: jest.fn(),
      toggle: jest.fn(),
    };
    mockPopupInstances.push(instance);
    return instance;
  });

  FabManager.mockImplementation(() => {
    const instance = {
      destroy: jest.fn(),
    };
    mockFabInstances.push(instance);
    return instance;
  });
}

function createManager({
  rule = { transOpen: "true" },
  setting = {},
  isUserscript = false,
  transboxOnly = false,
} = {}) {
  const manager = new TranslatorManager({
    setting: {
      touchModes: [],
      shortcuts: {},
      tranboxSetting: { transOpen: true },
      mouseHoverSetting: { useMouseHover: false },
      inputRule: { transOpen: true },
      contextMenuType: 0,
      ...setting,
    },
    rule,
    fabConfig: { isHide: false },
    favWords: [],
    isIframe: false,
    isUserscript,
    transboxOnly,
  });
  activeManagers.push(manager);
  return manager;
}

function replaceBody() {
  const newBody = document.createElement("body");
  document.body.replaceWith(newBody);
}

async function flushMutationObserver() {
  await Promise.resolve();
  await Promise.resolve();
}

function sendRuntimeMessage(message) {
  const runtimeHandler = browser.runtime.onMessage.addListener.mock.calls[0][0];
  const sendResponse = jest.fn();
  runtimeHandler(message, {}, sendResponse);
  expect(sendResponse).toHaveBeenCalledTimes(1);
  return sendResponse.mock.calls[0][0];
}

describe("TranslatorManager SPA lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = "<head></head><body></body>";
    jest.clearAllMocks();

    mockTranslatorInstances.length = 0;
    mockTranslatorArgs.length = 0;
    mockTransboxInstances.length = 0;
    mockTransboxArgs.length = 0;
    mockInputTranslatorInstances.length = 0;
    mockPopupInstances.length = 0;
    mockFabInstances.length = 0;
    activeManagers.length = 0;
    setupMockConstructors();
  });

  afterEach(() => {
    activeManagers.forEach((manager) => manager.stop());
    activeManagers.length = 0;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test("restarts runtime modules when body is replaced", async () => {
    const manager = createManager();
    manager.start();

    replaceBody();
    await flushMutationObserver();
    jest.runOnlyPendingTimers();

    expect(Translator).toHaveBeenCalledTimes(2);
    expect(mockTranslatorInstances[0].stop).toHaveBeenCalledTimes(1);
    expect(mockPopupInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(mockFabInstances[0].destroy).toHaveBeenCalledTimes(1);
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  test("does not restart after stop", async () => {
    const manager = createManager();
    manager.start();
    manager.stop();

    replaceBody();
    await flushMutationObserver();
    jest.runOnlyPendingTimers();

    expect(Translator).toHaveBeenCalledTimes(1);
  });

  test("preserves disabled translation and UI settings across restart", async () => {
    const manager = createManager({
      rule: { transOpen: "false" },
      setting: {
        tranboxSetting: { transOpen: false },
        inputRule: { transOpen: false },
      },
    });
    manager.start();

    replaceBody();
    await flushMutationObserver();
    jest.runOnlyPendingTimers();

    expect(mockTranslatorArgs[1].rule.transOpen).toBe("false");
    expect(mockTransboxArgs[1].tranboxSetting.transOpen).toBe(false);
    expect(mockTranslatorArgs[1].setting.inputRule.transOpen).toBe(false);
  });

  test.each([true, false])(
    "restores pre-editor translation state %s and explicit feature settings on restart",
    (enabled) => {
      const manager = createManager();
      manager.start();
      sendRuntimeMessage({
        action: "transbox-toggle",
        args: { enabled: false },
      });
      sendRuntimeMessage({
        action: "transinput-toggle",
        args: { enabled: false },
      });

      const translator = mockTranslatorInstances[0];
      const editor = manager._ruleEditorManager;
      editor.session = { runtimeState: { enabled, mouseHover: enabled } };
      translator.rule = {
        transOpen: enabled ? "false" : "true",
        selector: ".article",
      };
      translator.setting.mouseHoverSetting.useMouseHover = !enabled;

      manager.restart("rule-editor-state-test");

      expect(editor.destroy).toHaveBeenCalledTimes(1);
      expect(mockTranslatorArgs[1].rule).toEqual({
        transOpen: enabled ? "true" : "false",
        selector: ".article",
      });
      expect(
        mockTranslatorArgs[1].setting.mouseHoverSetting.useMouseHover
      ).toBe(enabled);
      expect(mockTransboxArgs[1].tranboxSetting.transOpen).toBe(false);
      expect(mockTranslatorArgs[1].setting.inputRule.transOpen).toBe(false);
      expect(translator.setting.mouseHoverSetting.useMouseHover).toBe(!enabled);
    }
  );

  test("coalesces navigation rescan and body replacement into one restart", async () => {
    const manager = createManager();
    manager.start();

    document.documentElement.dispatchEvent(new Event("turbo:load"));
    replaceBody();
    await flushMutationObserver();
    jest.runOnlyPendingTimers();

    expect(Translator).toHaveBeenCalledTimes(2);
    expect(mockTranslatorInstances[0].rescan).not.toHaveBeenCalled();
  });

  test("rescans on bfcache pageshow when the document container is unchanged", () => {
    const manager = createManager();
    manager.start();

    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true })
    );
    jest.runOnlyPendingTimers();

    expect(mockTranslatorInstances[0].rescan).toHaveBeenCalledTimes(1);
    expect(Translator).toHaveBeenCalledTimes(1);
  });

  test("starts only the transbox and message listener in transbox-only mode", () => {
    const manager = createManager({ transboxOnly: true });
    manager.start();

    expect(TransboxManager).toHaveBeenCalledTimes(1);
    expect(Translator).not.toHaveBeenCalled();
    expect(InputTranslator).not.toHaveBeenCalled();
    expect(PopupManager).not.toHaveBeenCalled();
    expect(FabManager).not.toHaveBeenCalled();
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });

  test("passes open-tranbox args through the inner event", () => {
    const manager = createManager({ transboxOnly: true });
    const eventHandler = jest.fn();
    manager.start();
    document.addEventListener("kiss-inner", eventHandler);

    const runtimeHandler =
      browser.runtime.onMessage.addListener.mock.calls[0][0];
    const sendResponse = jest.fn();
    runtimeHandler(
      { action: "open-tranbox", args: { text: "hello" } },
      {},
      sendResponse
    );

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(eventHandler.mock.calls[0][0].detail).toEqual({
      action: "open-tranbox",
      args: { text: "hello" },
    });

    document.removeEventListener("kiss-inner", eventHandler);
  });

  test.each([true, false])(
    "keeps reopened Popup toggles in sync in transbox-only mode from %s",
    (initialEnabled) => {
      const manager = createManager({
        transboxOnly: true,
        setting: { tranboxSetting: { transOpen: initialEnabled } },
      });
      manager.start();

      for (const expected of [
        !initialEnabled,
        initialEnabled,
        !initialEnabled,
      ]) {
        const reopened = sendRuntimeMessage({ action: "trans-getrule" });
        const message = {
          action: "transbox-toggle",
          args: { enabled: !reopened.setting.tranboxSetting.transOpen },
        };
        const response = sendRuntimeMessage(message);
        expect(response.setting.tranboxSetting.transOpen).toBe(expected);
        expect(mockTransboxInstances[0].isEnabled()).toBe(expected);

        const replayed = sendRuntimeMessage(message);
        expect(replayed.setting.tranboxSetting.transOpen).toBe(expected);
        expect(mockTransboxInstances[0].isEnabled()).toBe(expected);
      }

      for (const expected of [initialEnabled, !initialEnabled]) {
        const response = sendRuntimeMessage({ action: "transbox-toggle" });
        expect(response.setting.tranboxSetting.transOpen).toBe(expected);
        expect(mockTransboxInstances[0].isEnabled()).toBe(expected);
        const reopened = sendRuntimeMessage({ action: "trans-getrule" });
        expect(reopened.setting.tranboxSetting.transOpen).toBe(expected);
      }
    }
  );

  test.each([true, false])(
    "preserves the live transbox-only state across restart from %s",
    (initialEnabled) => {
      const tranboxSetting = {
        transOpen: initialEnabled,
        tranboxShortcut: "Alt+S",
      };
      const manager = createManager({
        transboxOnly: true,
        setting: { tranboxSetting, uiLang: "en" },
      });
      manager.start();
      sendRuntimeMessage({ action: "transbox-toggle" });

      manager.restart("pdf-selection-state-test");

      const response = sendRuntimeMessage({ action: "trans-getrule" });
      expect(response.setting.tranboxSetting).toEqual({
        ...tranboxSetting,
        transOpen: !initialEnabled,
      });
      expect(response.setting.uiLang).toBe("en");
      expect(mockTransboxInstances[1].isEnabled()).toBe(!initialEnabled);
      expect(mockTransboxArgs[1].tranboxSetting.transOpen).toBe(
        !initialEnabled
      );
      expect(tranboxSetting.transOpen).toBe(initialEnabled);
      expect(Translator).not.toHaveBeenCalled();
    }
  );

  test("returns current translator settings and rules in normal mode", () => {
    const manager = createManager();
    manager.start();
    const translator = mockTranslatorInstances[0];
    translator.setting.uiLang = "en";
    translator.rule = { transOpen: "false", toLang: "en" };

    sendRuntimeMessage({
      action: "transbox-toggle",
      args: { enabled: false },
    });
    const response = sendRuntimeMessage({ action: "trans-getrule" });

    expect(response).toEqual({
      rule: translator.rule,
      setting: translator.setting,
    });
    expect(response.setting.uiLang).toBe("en");
    expect(response.setting.tranboxSetting.transOpen).toBe(false);
    expect(mockTransboxInstances[0].isEnabled()).toBe(false);
  });

  test("applies an explicit page translation state without double toggling", () => {
    const manager = createManager();
    manager.start();

    const runtimeHandler =
      browser.runtime.onMessage.addListener.mock.calls[0][0];
    runtimeHandler(
      { action: "trans-toggle", args: { enabled: false } },
      {},
      jest.fn()
    );
    runtimeHandler(
      { action: "trans-toggle", args: { enabled: true } },
      {},
      jest.fn()
    );

    expect(mockTranslatorInstances[0].disable).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].enable).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].toggle).not.toHaveBeenCalled();
  });

  test("keeps the legacy page translation toggle when no state is supplied", () => {
    const manager = createManager();
    manager.start();

    const runtimeHandler =
      browser.runtime.onMessage.addListener.mock.calls[0][0];
    runtimeHandler({ action: "trans-toggle" }, {}, jest.fn());

    expect(mockTranslatorInstances[0].toggle).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].enable).not.toHaveBeenCalled();
    expect(mockTranslatorInstances[0].disable).not.toHaveBeenCalled();
  });

  test("applies explicit feature states without flipping them on replay", () => {
    const manager = createManager();
    manager.start();

    const runtimeHandler =
      browser.runtime.onMessage.addListener.mock.calls[0][0];
    const send = (action, enabled) =>
      runtimeHandler({ action, args: { enabled } }, {}, jest.fn());

    send("transbox-toggle", false);
    send("transbox-toggle", false);
    send("mousehover-toggle", true);
    send("mousehover-toggle", true);
    send("transinput-toggle", false);
    send("transinput-toggle", false);

    expect(mockTransboxInstances[0].disable).toHaveBeenCalledTimes(2);
    expect(mockTranslatorInstances[0].toggleTransbox).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].setting.tranboxSetting.transOpen).toBe(
      false
    );
    expect(mockTranslatorInstances[0].toggleMouseHover).toHaveBeenCalledTimes(
      1
    );
    expect(
      mockTranslatorInstances[0].setting.mouseHoverSetting.useMouseHover
    ).toBe(true);
    expect(mockInputTranslatorInstances[0].disable).toHaveBeenCalledTimes(2);
    expect(
      mockTranslatorInstances[0].toggleInputTranslate
    ).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].setting.inputRule.transOpen).toBe(false);
  });

  test("keeps legacy feature toggles when no desired state is supplied", () => {
    const manager = createManager();
    manager.start();

    const runtimeHandler =
      browser.runtime.onMessage.addListener.mock.calls[0][0];
    ["transbox-toggle", "mousehover-toggle", "transinput-toggle"].forEach(
      (action) => runtimeHandler({ action }, {}, jest.fn())
    );

    expect(mockTransboxInstances[0].toggle).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].toggleTransbox).toHaveBeenCalledTimes(1);
    expect(mockTranslatorInstances[0].toggleMouseHover).toHaveBeenCalledTimes(
      1
    );
    expect(mockInputTranslatorInstances[0].toggle).toHaveBeenCalledTimes(1);
    expect(
      mockTranslatorInstances[0].toggleInputTranslate
    ).toHaveBeenCalledTimes(1);
  });

  test("reports live selection availability to the FAB after toggles and restart", () => {
    const manager = createManager({
      setting: { tranboxSetting: { transOpen: false } },
    });
    manager.start();
    const { getSelectionEnabled } = FabManager.mock.calls[0][0];
    const { processActions } = PopupManager.mock.calls[0][0];
    const snapshots = [];
    const onSelectionChange = (event) => {
      if (event.detail.action === "transbox-toggle") {
        snapshots.push(getSelectionEnabled());
      }
    };
    document.addEventListener("kiss-inner", onSelectionChange);

    try {
      expect(getSelectionEnabled()).toBe(false);
      for (const enabled of [true, true, false]) {
        processActions({ action: "transbox-toggle", args: { enabled } });
      }
      processActions({ action: "transbox-toggle" });
      processActions({ action: "transbox-toggle" });

      expect(snapshots).toEqual([true, true, false, true, false]);
      expect(getSelectionEnabled()).toBe(false);

      manager.restart("selection-state-test");
      expect(FabManager.mock.calls[1][0].getSelectionEnabled()).toBe(false);
      expect(mockTransboxArgs[1].tranboxSetting.transOpen).toBe(false);
    } finally {
      document.removeEventListener("kiss-inner", onSelectionChange);
    }
  });

  test("cleans up transbox-only runtime on stop", () => {
    const manager = createManager({ transboxOnly: true });
    manager.start();
    manager.stop();

    expect(browser.runtime.onMessage.removeListener).toHaveBeenCalledWith(
      browser.runtime.onMessage.addListener.mock.calls[0][0]
    );
    expect(mockTransboxInstances[0].disable).toHaveBeenCalledTimes(1);
  });
});
