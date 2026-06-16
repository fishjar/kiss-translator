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

function createTranslator(rule = {}, setting = {}) {
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
      ...setting,
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

  test("skips whitespace-only groups around block children in selected list items", async () => {
    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({
        trText: text.trim() ? `Translated ${text}` : " ",
        isSame: false,
      })
    );
    document.body.innerHTML = `
      <main id="root">
        <ul dir="auto">
          <li>
            <p dir="auto"><a href="https://website.ltx.video/blog/introducing-ltx-2" rel="nofollow">LTX-2: A New Chapter in Generative AI</a></p>
          </li>
          <li>
            <p dir="auto">ComfyUI official <a href="https://blog.comfy.org/p/ltx-2-open-source-audio-video-ai" rel="nofollow">blogpost</a></p>
          </li>
        </ul>
      </main>
    `;

    createTranslator(
      {
        autoScan: "false",
        selector: "li, p",
      },
      { minLength: 0 }
    );
    await flushAsync();

    const wrappers = document.querySelectorAll(
      `.${Translator.KISS_CLASS.warpper}`
    );
    const directListItemWrappers = Array.from(
      document.querySelectorAll("li")
    ).flatMap((li) =>
      Array.from(li.children).filter((child) =>
        child.classList.contains(Translator.KISS_CLASS.warpper)
      )
    );
    const requestedTexts = apiTranslate.mock.calls.map(([args]) => args.text);

    expect(wrappers.length).toBeGreaterThan(0);
    expect(directListItemWrappers).toHaveLength(0);
    expect(requestedTexts.every((text) => text.trim())).toBe(true);
  });

  test("still translates mixed inline text groups", async () => {
    apiTranslate.mockResolvedValue({
      trText: "Translated mixed inline content",
      isSame: false,
    });
    document.body.innerHTML =
      '<main id="root"><p id="target">Text <a href="#">link</a> tail</p></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
      },
      { minLength: 0 }
    );
    await flushAsync();

    const wrapper = document.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    const requestedTexts = apiTranslate.mock.calls.map(([args]) => args.text);
    const combinedRequestedText = requestedTexts.join(" ");

    expect(apiTranslate).toHaveBeenCalled();
    expect(combinedRequestedText).toContain("Text");
    expect(combinedRequestedText).toContain("tail");
    expect(wrapper).not.toBeNull();
    expect(wrapper.textContent).toBe("Translated mixed inline content");
  });
});
