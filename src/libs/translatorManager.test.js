const mockTranslatorInstances = [];
const mockTranslatorArgs = [];
const mockTransboxInstances = [];
const mockTransboxArgs = [];
const mockInputTranslatorInstances = [];
const mockPopupInstances = [];
const mockFabInstances = [];
const activeManagers = [];

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
    const instance = {
      enable: jest.fn(),
      disable: jest.fn(),
      toggle: jest.fn(),
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
    const instance = {
      enable: jest.fn(),
      disable: jest.fn(),
      toggle: jest.fn(),
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
