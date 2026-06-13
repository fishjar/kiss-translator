jest.mock("../apis", () => ({
  apiTranslate: jest.fn(),
}));

jest.mock("./msg", () => ({
  sendBgMsg: jest.fn(),
}));

const { apiTranslate } = require("../apis");
const { Translator } = require("./translator");

const flushAsync = async () => {
  jest.runOnlyPendingTimers();
  await Promise.resolve();
  await Promise.resolve();
};

function createTranslator(rule = {}) {
  return new Translator({
    rule: {
      transOpen: "true",
      rootsSelector: "#root",
      fromLang: "en",
      toLang: "zh-CN",
      autoScan: "true",
      hasShadowroot: "false",
      scanAll: "false",
      transTitle: "false",
      ...rule,
    },
    setting: {
      transInterval: 0,
      rootMargin: 0,
      mouseHoverSetting: {},
      customStyles: [],
      transApis: [],
    },
  });
}

describe("Translator rule styles", () => {
  let originalIntersectionObserver;
  let originalCSSStyleSheet;
  let originalScrollBy;

  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = "<head></head><body></body>";
    apiTranslate.mockResolvedValue({ trText: "Translated", isSame: false });

    originalIntersectionObserver = global.IntersectionObserver;
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

    originalCSSStyleSheet = global.CSSStyleSheet;
    global.CSSStyleSheet = class {
      replaceSync() {}
    };

    originalScrollBy = window.scrollBy;
    window.scrollBy = jest.fn();
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
    global.CSSStyleSheet = originalCSSStyleSheet;
    window.scrollBy = originalScrollBy;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("keeps translated text when host style is not a CSSStyleDeclaration", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello world</p></main>';
    const target = document.getElementById("target");
    Object.defineProperty(target, "style", {
      configurable: true,
      get: () => Symbol("Ch"),
    });

    createTranslator({ selectStyle: "color: red;" });
    await flushAsync();

    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    expect(apiTranslate).toHaveBeenCalled();
    expect(inner).not.toBeNull();
    expect(inner.textContent).toBe("Translated");
    expect(inner.querySelector(`.${Translator.KISS_CLASS.retry}`)).toBeNull();
  });

  test("still appends selectStyle for normal host elements", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello world</p></main>';
    const target = document.getElementById("target");

    createTranslator({ selectStyle: "color: red;" });
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalled();
    expect(target.style.cssText).toContain("color: red");
  });
});
