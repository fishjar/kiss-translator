// Exercise the real Manager -> Translator -> Sval boundary without UI or network.
jest.mock("./tranbox", () => ({
  TransboxManager: class {
    isEnabled() {
      return false;
    }
    update() {}
    disable() {}
  },
}));
jest.mock("./inputTranslate", () => ({
  InputTranslator: class {
    disable() {}
  },
}));
jest.mock("./popupManager", () => ({
  PopupManager: class {
    destroy() {}
  },
}));
jest.mock("./fabManager", () => ({
  FabManager: class {
    destroy() {}
  },
}));
jest.mock("./ruleEditorManager", () => ({
  RuleEditorManager: class {
    destroy() {}
  },
}));
jest.mock("./imageTranslate/imageTranslateManager", () => ({
  ImageTranslateManager: class {
    destroy() {}
    updateRule() {}
  },
}));
jest.mock("../apis", () => ({
  apiTranslate: jest.fn(),
  apiMicrosoftDict: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));
jest.mock("./detect", () => ({ tryDetectLang: jest.fn(async () => "en") }));
jest.mock("@streamparser/json", () => ({ JSONParser: jest.fn() }));
jest.mock("./terminologyStorage", () => ({
  loadTerminologySnapshot: jest.fn(async () => []),
}));
jest.mock("./sync", () => ({ trySyncRules: jest.fn() }));
jest.mock("./subRules", () => ({ loadOrFetchSubRules: jest.fn() }));

import TranslatorManager from "./translatorManager";
import { apiTranslate } from "../apis";
import {
  DEFAULT_SETTING,
  DEFAULT_API_SETTING,
  EVENT_KISS_TRANSLATOR,
  MSG_TRANS_PUTRULE,
  MSG_TRANS_TOGGLE,
} from "../config";

let manager;
let originalObserver;
let originalSheet;
const flush = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
    jest.advanceTimersByTime(16);
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  document.documentElement.innerHTML =
    '<head></head><body><main id="root"><p>Security regression sample text</p></main></body>';
  originalObserver = global.IntersectionObserver;
  global.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.callback([{ target, isIntersecting: true }]);
    }
    unobserve() {}
    disconnect() {}
  };
  originalSheet = global.CSSStyleSheet;
  global.CSSStyleSheet = class {
    replaceSync() {}
  };
  apiTranslate.mockResolvedValue({ trText: "Translated", isSame: false });
});

afterEach(() => {
  manager?.stop();
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  global.IntersectionObserver = originalObserver;
  global.CSSStyleSheet = originalSheet;
  jest.clearAllMocks();
});

test.each([false, true])(
  "untrusted script patches cannot run, including in frames (%s)",
  async (isIframe) => {
    manager = new TranslatorManager({
      isUserscript: true,
      isIframe,
      fabConfig: { isHide: false },
      favWords: [],
      setting: {
        ...DEFAULT_SETTING,
        preInit: false,
        touchModes: [],
        shortcuts: {},
        mouseHoverSetting: { useMouseHover: false },
        transApis: [{ ...DEFAULT_API_SETTING, key: "FAKE_SERVICE_KEY" }],
        transInterval: 0,
        rootMargin: 0,
      },
      rule: {
        transOpen: "false",
        rootsSelector: "#root",
        autoScan: "true",
        fromLang: "en",
        toLang: "fr",
      },
    });
    manager.start();
    const hook =
      "args => { document.documentElement.setAttribute('data-stolen-key', args.apiSetting.key); return args; }";
    for (const args of [
      { transStartHook: hook },
      {
        toLang: "fr",
        transEndHook:
          "() => document.documentElement.setAttribute('data-stolen-key', 'executed')",
      },
      {
        injectJs:
          "document.documentElement.setAttribute('data-stolen-key', KT.apiSetting.key)",
      },
    ]) {
      window.dispatchEvent(
        new CustomEvent(EVENT_KISS_TRANSLATOR, {
          detail: { action: MSG_TRANS_PUTRULE, args },
        })
      );
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://attacker.invalid",
          data: { action: MSG_TRANS_PUTRULE, args },
        })
      );
    }
    let actionReads = 0;
    window.dispatchEvent(
      new CustomEvent(EVENT_KISS_TRANSLATOR, {
        detail: {
          get action() {
            return ++actionReads === 1 ? MSG_TRANS_TOGGLE : MSG_TRANS_PUTRULE;
          },
          args: { enabled: true, transStartHook: hook },
        },
      })
    );
    await flush();
    expect(actionReads).toBe(1);
    expect(apiTranslate).toHaveBeenCalled();
    expect(document.documentElement.hasAttribute("data-stolen-key")).toBe(
      false
    );
  }
);
