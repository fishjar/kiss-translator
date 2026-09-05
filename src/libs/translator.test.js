jest.mock("../apis", () => ({
  apiMicrosoftDict: jest.fn(),
  apiTranslate: jest.fn(),
  apiYoudaoDict: jest.fn(),
}));

jest.mock("./msg", () => ({
  sendBgMsg: jest.fn(),
}));

jest.mock("./detect", () => ({
  tryDetectLang: jest.fn(),
}));

const { apiMicrosoftDict, apiTranslate, apiYoudaoDict } = require("../apis");
const { tryDetectLang } = require("./detect");
const {
  DEFAULT_API_SETTING,
  EVENT_FAVORITE_WORD_CHANGE,
  OPT_DICT_BING,
  OPT_DICT_YOUDAO,
} = require("../config");
const {
  OPT_HIGHLIGHT_WORDS_AFTERTRANS,
  OPT_HIGHLIGHT_WORDS_BEFORETRANS,
} = require("../config/rules");
const { Translator } = require("./translator");

const flushAsync = async () => {
  jest.runOnlyPendingTimers();
  await Promise.resolve();
  await Promise.resolve();
};

const createdTranslators = [];

const hoverNode = async (node, x = 20, y = 20) => {
  node.dispatchEvent(
    new MouseEvent("mousemove", {
      bubbles: true,
      clientX: x,
      clientY: y,
    })
  );
  jest.advanceTimersByTime(100);
  await Promise.resolve();
  await Promise.resolve();
};

const createApiSetting = (apiSlug, isDisabled = false) => ({
  ...DEFAULT_API_SETTING,
  apiSlug,
  apiName: apiSlug,
  isDisabled,
});

function createTranslator(rule = {}, setting = {}, favWords = []) {
  const translator = new Translator({
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
    favWords,
  });
  createdTranslators.push(translator);
  return translator;
}

function createPlainTextTranslator(rule = {}, setting = {}) {
  const translator = createTranslator(
    {
      transOpen: "false",
      ...rule,
    },
    {
      preInit: false,
      ...setting,
    }
  );

  translator.updateRule({ isPlainText: true });
  translator.enable();

  return translator;
}

describe("Translator rule styles", () => {
  let originalIntersectionObserver;
  let originalCSSStyleSheet;
  let originalScrollBy;
  let originalChrome;
  let originalMatchMedia;

  beforeEach(() => {
    jest.useFakeTimers();
    document.documentElement.innerHTML = "<head></head><body></body>";
    apiTranslate.mockResolvedValue({ trText: "Translated", isSame: false });
    apiMicrosoftDict.mockResolvedValue(null);
    apiYoudaoDict.mockResolvedValue(null);
    tryDetectLang.mockResolvedValue("en");

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

    originalChrome = globalThis.chrome;

    // 默认模拟可悬停设备，保证按住触发测试正常运行；
    // 个别用例按查询串覆写（如纯触屏设备场景）。
    originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  });

  afterEach(() => {
    createdTranslators.forEach((translator) => translator.stop());
    createdTranslators.length = 0;
    delete document.elementFromPoint;
    global.IntersectionObserver = originalIntersectionObserver;
    global.CSSStyleSheet = originalCSSStyleSheet;
    window.scrollBy = originalScrollBy;
    globalThis.chrome = originalChrome;
    window.matchMedia = originalMatchMedia;
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test("translates between detected Chinese variants when enabled", async () => {
    document.body.innerHTML = '<main id="root"><p>繁體中文內容</p></main>';
    tryDetectLang.mockResolvedValue("zh-TW");
    apiTranslate.mockClear();

    createTranslator(
      { fromLang: "auto", toLang: "zh-CN" },
      { minLength: 0, translateVariants: true }
    );
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        fromLang: "zh-TW",
        toLang: "zh-CN",
        translateVariants: true,
      })
    );
  });

  test("uses the same Chinese variant rule for hover bubbles", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">繁體中文內容</p></main>';
    const target = document.getElementById("target");
    tryDetectLang.mockResolvedValue("zh-TW");
    apiTranslate.mockClear();

    createTranslator(
      { transOpen: "false", fromLang: "auto", toLang: "zh-CN" },
      {
        minLength: 0,
        translateVariants: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await hoverNode(target);
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        fromLang: "zh-TW",
        toLang: "zh-CN",
        translateVariants: true,
      })
    );
  });

  test("skips detected Chinese variants when variant translation is disabled", async () => {
    document.body.innerHTML = '<main id="root"><p>繁體中文內容</p></main>';
    tryDetectLang.mockResolvedValue("zh-TW");
    apiTranslate.mockClear();

    createTranslator(
      { fromLang: "auto", toLang: "zh-CN" },
      { minLength: 0, translateVariants: false }
    );
    await flushAsync();

    expect(apiTranslate).not.toHaveBeenCalled();
  });

  test("refreshes an auto-skipped node after switching to a fixed source language", async () => {
    document.body.innerHTML = '<main id="root"><p>简体中文内容</p></main>';
    tryDetectLang.mockResolvedValue("zh-CN");
    apiTranslate.mockClear();
    const translator = createTranslator(
      { fromLang: "auto", toLang: "zh-CN" },
      { minLength: 0 }
    );
    await flushAsync();
    expect(apiTranslate).not.toHaveBeenCalled();

    translator.updateRule({ fromLang: "zh-CN" });
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({ fromLang: "zh-CN", toLang: "zh-CN" })
    );
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

  test("trims source indentation before creating whitespace placeholders", async () => {
    document.body.innerHTML =
      '<main id="root"><span id="target">\n\t\t1. Overall Structure\n\t</span></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
      },
      { minLength: 0 }
    );
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate.mock.calls[0][0].text).toBe("1. Overall Structure");
  });

  test("protects and restores internal newlines and tabs", async () => {
    const sourceText = "First\tcolumn\nSecond line";
    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({ trText: text, isSame: false })
    );
    document.body.innerHTML =
      '<main id="root"><span id="target"></span></main>';
    document.getElementById("target").textContent = sourceText;

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
      },
      { minLength: 0 }
    );
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);

    expect(requestedText).toBe("First{1}column{2}Second line");
    expect(requestedText).not.toContain("\t");
    expect(requestedText).not.toContain("\n");
    expect(inner.textContent).toBe(sourceText);
  });

  test("keeps literal backslash-t text unchanged", async () => {
    const sourceText = "Show \\t literally";
    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({ trText: text, isSame: false })
    );
    document.body.innerHTML =
      '<main id="root"><span id="target"></span></main>';
    document.getElementById("target").textContent = sourceText;

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
      },
      { minLength: 0 }
    );
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);

    expect(requestedText).toBe(sourceText);
    expect(inner.textContent).toBe(sourceText);
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
    expect(
      requestedTexts.some(
        (text) => text.startsWith("Text ") && text.endsWith(" tail")
      )
    ).toBe(true);
    expect(wrapper).not.toBeNull();
    expect(wrapper.textContent).toBe("Translated mixed inline content");
  });

  test("keeps pre-translation highlights out of the translation request", async () => {
    const sourceText = "A model evaluation security incident report";
    document.body.innerHTML = '<main id="root"><p id="target"></p></main>';
    document.getElementById("target").textContent = sourceText;

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        hasRichText: "true",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      { minLength: 0 },
      ["incident"]
    );
    await flushAsync();

    const highlight = document.querySelector(
      `#target > .${Translator.KISS_CLASS.highlight}`
    );

    expect(highlight).not.toBeNull();
    expect(highlight.textContent).toBe("incident");
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate.mock.calls[0][0].text).toBe(sourceText);
  });

  test("filters only extension highlights from rich text requests", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p id="target">Review the <strong>incident response</strong> details</p>
      </main>
    `;

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        hasRichText: "true",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      { minLength: 0 },
      ["incident"]
    );
    await flushAsync();

    const requestedText = apiTranslate.mock.calls[0][0].text;
    const highlight = document.querySelector(
      `#target strong > .${Translator.KISS_CLASS.highlight}`
    );

    expect(highlight).not.toBeNull();
    expect(requestedText).toBe("Review the <i1>incident response</i1> details");
  });

  test("updates current-page highlights without retranslating", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p id="target">Library tools improve library research</p>
        <p id="outside">library outside</p>
      </main>
    `;

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      { minLength: 0 }
    );
    await flushAsync();
    const wrapper = document.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    const translateCalls = apiTranslate.mock.calls.length;

    document.dispatchEvent(
      new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
        detail: { word: "library", isFavorite: true },
      })
    );

    const highlights = document.querySelectorAll(
      `#target > .${Translator.KISS_CLASS.highlight}`
    );
    expect(highlights).toHaveLength(2);
    expect(highlights[0].textContent).toBe("Library");
    expect(highlights[0].dataset.kissFavoriteWord).toBe("library");
    expect(
      document.querySelector(`#outside .${Translator.KISS_CLASS.highlight}`)
    ).toBeNull();
    expect(apiTranslate).toHaveBeenCalledTimes(translateCalls);
    expect(document.querySelector(`.${Translator.KISS_CLASS.warpper}`)).toBe(
      wrapper
    );

    document.dispatchEvent(
      new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
        detail: { word: "LIBRARY", isFavorite: false },
      })
    );

    expect(
      document.querySelector(`#target .${Translator.KISS_CLASS.highlight}`)
    ).toBeNull();
    expect(document.getElementById("target").textContent).toContain(
      "Library tools improve library research"
    );
    await flushAsync();
    expect(apiTranslate).toHaveBeenCalledTimes(translateCalls);
    expect(document.querySelector(`.${Translator.KISS_CLASS.warpper}`)).toBe(
      wrapper
    );
  });

  test("applies updated favorites to post-translation and dynamic scopes", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p class="target">Existing library</p>
      </main>
    `;

    createTranslator(
      {
        autoScan: "false",
        selector: ".target",
        highlightWords: OPT_HIGHLIGHT_WORDS_AFTERTRANS,
      },
      { minLength: 0 }
    );
    await flushAsync();

    document.dispatchEvent(
      new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
        detail: { word: "library", isFavorite: true },
      })
    );
    expect(
      document.querySelector(`.target .${Translator.KISS_CLASS.highlight}`)
    ).not.toBeNull();

    const dynamic = document.createElement("p");
    dynamic.className = "target";
    dynamic.textContent = "Dynamic library";
    document.getElementById("root").appendChild(dynamic);
    await Promise.resolve();
    jest.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
    await flushAsync();

    expect(
      dynamic.querySelector(`.${Translator.KISS_CLASS.highlight}`)
    ).not.toBeNull();
  });

  test("stops reacting to favorite changes after Translator stops", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">library</p></main>';
    const translator = createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      { minLength: 0 }
    );
    await flushAsync();

    translator.stop();
    document.dispatchEvent(
      new CustomEvent(EVENT_FAVORITE_WORD_CHANGE, {
        detail: { word: "library", isFavorite: true },
      })
    );

    expect(
      document.querySelector(`#target .${Translator.KISS_CLASS.highlight}`)
    ).toBeNull();
  });

  test("uses the selected dictionary and shows every definition on hover", async () => {
    apiMicrosoftDict.mockResolvedValue({
      word: "library",
      aus: [{ key: "美", phonetic: "laɪbreri" }],
      trs: [
        { pos: "n.", def: "图书馆" },
        { pos: "n.", def: "藏书" },
        { pos: "n.", def: "文库" },
        { pos: "n.", def: "程序库" },
      ],
    });
    document.body.innerHTML =
      '<main id="root"><p id="target">library</p></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      {
        minLength: 0,
        tranboxSetting: { enDict: OPT_DICT_BING },
      },
      ["library"]
    );
    await flushAsync();
    const highlight = document.querySelector(
      `.${Translator.KISS_CLASS.highlight}`
    );

    highlight.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true, clientX: 30, clientY: 40 })
    );
    jest.advanceTimersByTime(300);
    await apiMicrosoftDict.mock.results[0].value;
    await Promise.resolve();
    await Promise.resolve();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(apiMicrosoftDict).toHaveBeenCalledWith("library");
    expect(apiYoudaoDict).not.toHaveBeenCalled();
    expect(bubble.textContent).toContain("[n.] 图书馆");
    expect(bubble.textContent).toContain("[n.] 程序库");
    expect(bubble.style.maxHeight).toBe("60vh");
    expect(bubble.style.overflowY).toBe("auto");
  });

  test("uses Youdao when it is the selected favorite-word dictionary", async () => {
    apiYoudaoDict.mockResolvedValue({
      ec: {
        word: {
          "return-phrase": "library",
          ukphone: "ˈlaɪbrəri",
          trs: [{ pos: "n.", tran: "图书馆" }],
        },
      },
    });
    document.body.innerHTML =
      '<main id="root"><p id="target">library</p></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      {
        minLength: 0,
        tranboxSetting: { enDict: OPT_DICT_YOUDAO },
      },
      ["library"]
    );
    await flushAsync();

    document
      .querySelector(`.${Translator.KISS_CLASS.highlight}`)
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    jest.advanceTimersByTime(300);
    await apiYoudaoDict.mock.results[0].value;
    await Promise.resolve();
    await Promise.resolve();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(apiYoudaoDict).toHaveBeenCalledWith("library");
    expect(apiMicrosoftDict).not.toHaveBeenCalled();
    expect(bubble.textContent).toContain("英 [ˈlaɪbrəri]");
    expect(bubble.textContent).toContain("[n.] 图书馆");
  });

  test("does not fall back when favorite-word dictionary lookup is disabled", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">library</p></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      {
        minLength: 0,
        tranboxSetting: { enDict: "-" },
      },
      ["library"]
    );
    await flushAsync();

    document
      .querySelector(`.${Translator.KISS_CLASS.highlight}`)
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    jest.advanceTimersByTime(300);

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(apiMicrosoftDict).not.toHaveBeenCalled();
    expect(apiYoudaoDict).not.toHaveBeenCalled();
    expect(bubble.dataset.state).toBe("unavailable");
  });

  test("does not show a stale definition after leaving the highlighted word", async () => {
    let resolveLookup;
    apiMicrosoftDict.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      })
    );
    document.body.innerHTML =
      '<main id="root"><p id="target">library</p></main>';

    createTranslator(
      {
        autoScan: "false",
        selector: "#target",
        highlightWords: OPT_HIGHLIGHT_WORDS_BEFORETRANS,
      },
      {
        minLength: 0,
        tranboxSetting: { enDict: OPT_DICT_BING },
      },
      ["library"]
    );
    await flushAsync();
    const highlight = document.querySelector(
      `.${Translator.KISS_CLASS.highlight}`
    );

    highlight.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    jest.advanceTimersByTime(300);
    highlight.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    resolveLookup({
      word: "library",
      trs: [{ pos: "n.", def: "图书馆" }],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();
  });

  test("continues scanning block children after processing mixed parent nodes", async () => {
    apiTranslate.mockImplementation(({ text }) =>
      Promise.resolve({
        trText: `Translated ${text}`,
        isSame: false,
      })
    );
    document.body.innerHTML = `
      <main id="root">
        <section id="mixed">
          Intro text
          <p>Nested paragraph</p>
        </section>
      </main>
    `;

    createTranslator({}, { minLength: 0 });
    await flushAsync();

    const requestedTexts = apiTranslate.mock.calls.map(([args]) => args.text);

    expect(requestedTexts.some((text) => text.includes("Intro text"))).toBe(
      true
    );
    expect(requestedTexts).toContain("Nested paragraph");
  });

  test("adopts restored translation wrappers without retranslating", async () => {
    document.body.innerHTML = `
      <main id="root">
        <h3>
          <a href="/discussion/1">How to fix playback buttons?</a>
          <kiss-translator class="kiss-translator-wrapper notranslate">
            <font lang="zh-CN" class="kiss-translator-inner">Existing translation</font>
          </kiss-translator>
        </h3>
      </main>
    `;

    createTranslator(
      {
        autoScan: "false",
        selector: "h3",
      },
      { minLength: 0 }
    );
    await flushAsync();

    const wrappers = document.querySelectorAll(
      `.${Translator.KISS_CLASS.warpper}`
    );
    const requestedTexts = apiTranslate.mock.calls.map(([args]) => args.text);
    const inner = wrappers[0].querySelector(`.${Translator.KISS_CLASS.inner}`);

    expect(wrappers).toHaveLength(1);
    expect(inner.textContent).toContain("Existing translation");
    expect(
      document.querySelector(`h3 a .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
    expect(requestedTexts).toEqual([]);
  });

  test("syncs translation-only mode after adopting restored wrappers", async () => {
    document.body.innerHTML = `
      <main id="root">
        <h3>
          <a href="/discussion/1">How to fix playback buttons?</a>
          <kiss-translator class="kiss-translator-wrapper notranslate">
            <br>
            <font lang="zh-CN" class="kiss-translator-inner">Existing translation</font>
          </kiss-translator>
        </h3>
      </main>
    `;

    const translator = createTranslator(
      {
        autoScan: "false",
        selector: "h3",
      },
      { minLength: 0 }
    );
    await flushAsync();

    translator.updateRule({ transOnly: "true" });
    await flushAsync();

    expect(document.querySelector("h3 a")).toBeNull();
    expect(document.querySelector("h3").textContent).toContain(
      "Existing translation"
    );

    translator.updateRule({ transOnly: "false" });
    await flushAsync();

    expect(document.querySelector("h3 a")?.textContent).toBe(
      "How to fix playback buttons?"
    );
    expect(apiTranslate).not.toHaveBeenCalled();
  });

  test("restores original nodes from template backup after transOnly turbo restore", async () => {
    document.body.innerHTML = `
      <main id="root">
        <h3>
          <kiss-translator class="kiss-translator-wrapper notranslate">
            <br hidden>
            <font lang="zh-CN" class="kiss-translator-inner">Existing translation</font>
            <template class="kiss-translator-backup">
              <a href="/discussion/1">How to fix playback buttons?</a>
            </template>
          </kiss-translator>
        </h3>
      </main>
    `;

    const translator = createTranslator(
      {
        autoScan: "false",
        selector: "h3",
        transOnly: "true",
      },
      { minLength: 0 }
    );
    await flushAsync();

    expect(document.querySelector("h3 a")).toBeNull();
    expect(apiTranslate).not.toHaveBeenCalled();

    translator.updateRule({ transOnly: "false" });
    await flushAsync();

    expect(document.querySelector("h3 a")?.textContent).toBe(
      "How to fix playback buttons?"
    );
    expect(apiTranslate).not.toHaveBeenCalled();
  });

  test("does not query shadow roots inside KISS translator elements when scanAll is enabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <div id="page-host">Page content</div>
        <div id="kiss-translator-fab">
          <div id="plugin-child">Plugin content</div>
        </div>
      </main>
    `;
    const pageHost = document.getElementById("page-host");
    const pluginChild = document.getElementById("plugin-child");
    const openOrClosedShadowRoot = jest.fn((element) =>
      element === pageHost ? null : undefined
    );
    globalThis.chrome = {
      dom: {
        openOrClosedShadowRoot,
      },
    };

    createTranslator({ scanAll: "true" });
    await flushAsync();

    expect(openOrClosedShadowRoot).toHaveBeenCalledWith(pageHost);
    expect(openOrClosedShadowRoot).not.toHaveBeenCalledWith(pluginChild);
  });

  test("still discovers shadow roots on regular HTML elements when scanAll is enabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="host">Page content</section>
      </main>
    `;
    const host = document.getElementById("host");
    const shadowRoot = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
      configurable: true,
      writable: true,
      value: [],
    });
    shadowRoot.innerHTML = "<p>Shadow content</p>";
    const observe = jest.spyOn(MutationObserver.prototype, "observe");

    createTranslator({ scanAll: "true" });
    await flushAsync();

    expect(observe).toHaveBeenCalledWith(
      shadowRoot,
      expect.objectContaining({ subtree: true })
    );
  });

  test("does not pass SVG elements to the Chrome closed shadow root API", async () => {
    document.body.innerHTML = `
      <main id="root">
        <svg id="icon"><path d="M0 0h1v1z"></path></svg>
        <div id="host">Page content</div>
      </main>
    `;
    const svg = document.getElementById("icon");
    const host = document.getElementById("host");
    const openOrClosedShadowRoot = jest.fn((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new TypeError("HTMLElement element expected");
      }
      return null;
    });
    globalThis.chrome = {
      dom: {
        openOrClosedShadowRoot,
      },
    };

    createTranslator({ scanAll: "true" });
    await flushAsync();

    expect(openOrClosedShadowRoot).toHaveBeenCalledWith(host);
    expect(openOrClosedShadowRoot).not.toHaveBeenCalledWith(svg);
  });

  test("honors persisted plain text rules during initialization", async () => {
    global.IntersectionObserver = class {
      observe() {}

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre>First line</pre></main>';

    createTranslator({ transOpen: "false", isPlainText: "true" });
    await flushAsync();

    expect(document.querySelector("pre > span")?.textContent).toBe(
      "First line"
    );
  });

  test("splits plain text pre content into bounded block chunks", async () => {
    global.IntersectionObserver = class {
      constructor() {}

      observe() {}

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre></pre></main>';
    const pre = document.querySelector("pre");
    pre.textContent = [
      "First line with indentation",
      "  second line with leading spaces",
      "",
      "A very long plain text line that needs to be split into smaller chunks without changing the global max length filter.",
      "Literal <tag> should stay text.",
    ].join("\n");

    createPlainTextTranslator({}, { maxLength: 45, minLength: 0 });
    await flushAsync();

    const chunks = Array.from(pre.querySelectorAll(":scope > span"));
    const blankLines = Array.from(pre.children).filter(
      (child) => child.tagName === "BR"
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(blankLines).toHaveLength(1);
    expect(chunks.every((chunk) => chunk.textContent.length < 45)).toBe(true);
    expect(chunks[0].style.display).toBe("block");
    expect(chunks[0].style.whiteSpace).toBe("pre-wrap");
    expect(pre.querySelector("tag")).toBeNull();
    expect(pre.textContent).toContain("  second line");
    expect(pre.textContent).toContain("Literal <tag> should stay text.");
    expect(apiTranslate).not.toHaveBeenCalled();
  });

  test("splits plain text pre content at single line breaks", async () => {
    global.IntersectionObserver = class {
      constructor() {}

      observe() {}

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre></pre></main>';
    const pre = document.querySelector("pre");
    pre.textContent = "First line\nSecond line\nThird line";

    createPlainTextTranslator({}, { minLength: 0 });
    await flushAsync();

    const chunks = Array.from(pre.querySelectorAll(":scope > span")).map(
      (chunk) => chunk.textContent
    );

    expect(chunks).toEqual(["First line", "Second line", "Third line"]);
  });

  test("streams very long plain text pre preprocessing in idle batches", async () => {
    const observed = [];
    global.IntersectionObserver = class {
      constructor() {}

      observe(target) {
        observed.push(target);
      }

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre></pre></main>';
    const pre = document.querySelector("pre");
    pre.textContent = Array.from(
      { length: 150 },
      (_, index) => `Line ${index + 1}`
    ).join("\n");

    createPlainTextTranslator({}, { minLength: 0 });

    expect(pre.querySelectorAll(":scope > span")).toHaveLength(20);
    expect(apiTranslate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    const chunksAfterIdle = Array.from(pre.querySelectorAll(":scope > span"));
    expect(chunksAfterIdle.length).toBeGreaterThan(20);
    expect(chunksAfterIdle.length).toBeLessThanOrEqual(120);
    expect(observed).toEqual(expect.arrayContaining(chunksAfterIdle));

    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(pre.querySelectorAll(":scope > span")).toHaveLength(150);
  });

  test("stops stale plain text pre preprocessing when run changes", async () => {
    global.IntersectionObserver = class {
      constructor() {}

      observe() {}

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre></pre></main>';
    const pre = document.querySelector("pre");
    pre.textContent = Array.from(
      { length: 150 },
      (_, index) => `Line ${index + 1}`
    ).join("\n");

    const translator = createPlainTextTranslator({}, { minLength: 0 });
    const initialChunkCount = pre.querySelectorAll(":scope > span").length;

    translator.disable();
    jest.runOnlyPendingTimers();
    await Promise.resolve();

    expect(pre.querySelectorAll(":scope > span")).toHaveLength(
      initialChunkCount
    );
  });

  test("only translates visible plain text chunks", async () => {
    const observed = [];
    let intersectionCallback;
    global.IntersectionObserver = class {
      constructor(callback) {
        intersectionCallback = callback;
      }

      observe(target) {
        observed.push(target);
      }

      unobserve() {}

      disconnect() {}
    };
    document.body.innerHTML = '<main id="root"><pre></pre></main>';
    document.querySelector("pre").textContent =
      "First visible chunk.\n\nSecond chunk waits for scrolling.";

    createPlainTextTranslator({}, { minLength: 0 });
    await flushAsync();

    const chunks = Array.from(document.querySelectorAll("pre > span"));
    expect(chunks).toHaveLength(2);
    expect(observed).toEqual(expect.arrayContaining(chunks));
    expect(apiTranslate).not.toHaveBeenCalled();

    intersectionCallback([{ target: chunks[0], isIntersecting: true }]);
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate.mock.calls[0][0].text).toContain("First visible chunk");
  });

  test("keeps default mouse hover mode as inline bilingual translation", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
        },
      }
    );
    await hoverNode(target);
    await flushAsync();

    const wrapper = document.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    expect(wrapper).not.toBeNull();
    const inner = wrapper.querySelector(`.${Translator.KISS_CLASS.inner}`);
    expect(inner.textContent).toBe("Translated");
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();
  });

  test("keeps a pending translation-only hover request visible when retriggered", async () => {
    let resolveTranslation;
    apiTranslate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTranslation = resolve;
        })
    );
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      {
        transOpen: "false",
        transOnly: "true",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
        },
      }
    );

    await hoverNode(target);
    await hoverNode(target);
    resolveTranslation({ trText: "Delayed translation", isSame: false });
    await Promise.resolve();
    await Promise.resolve();

    const wrapper = document.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    expect(wrapper).not.toBeNull();
    expect(wrapper.isConnected).toBe(true);
    expect(
      wrapper.querySelector(`.${Translator.KISS_CLASS.inner}`).textContent
    ).toBe("Delayed translation");
    expect(target.contains(wrapper)).toBe(true);
  });

  test("shows mouse hover bubble without inserting translation wrappers", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
          bubbleStyle: "background: rgb(1, 2, 3); font-size: 18px;",
        },
      }
    );
    await hoverNode(target, 30, 40);
    await flushAsync();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello hover" })
    );
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
    expect(bubble).not.toBeNull();
    expect(bubble.textContent).toBe("Translated");
    expect(bubble.getAttribute("style")).toContain("font-size: 18px");
    expect(bubble.style.position).toBe("fixed");
    expect(bubble.style.zIndex).toBe("2147483647");
  });

  test("uses the configured translation service only for hover bubbles", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Independent bubble API</p></main>';
    const target = document.getElementById("target");
    const pageApi = createApiSetting("page-api");
    const bubbleApi = createApiSetting("bubble-api");

    createTranslator(
      { transOpen: "false", apiSlug: pageApi.apiSlug },
      {
        preInit: true,
        transApis: [pageApi, bubbleApi],
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
          apiSlug: bubbleApi.apiSlug,
        },
      }
    );
    await hoverNode(target);
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({ apiSlug: bubbleApi.apiSlug }),
      })
    );
  });

  test("follows the page rule when legacy bubble settings omit apiSlug", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Legacy bubble settings</p></main>';
    const target = document.getElementById("target");
    const pageApi = createApiSetting("page-api");

    createTranslator(
      { transOpen: "false", apiSlug: pageApi.apiSlug },
      {
        preInit: true,
        transApis: [pageApi],
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await hoverNode(target);
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({ apiSlug: pageApi.apiSlug }),
      })
    );
  });

  test.each([
    ["missing", "missing-api", []],
    ["disabled", "disabled-api", [createApiSetting("disabled-api", true)]],
  ])(
    "falls back to the page rule for a %s bubble API",
    async (_, apiSlug, extraApis) => {
      document.body.innerHTML =
        '<main id="root"><p id="target">Unavailable bubble API</p></main>';
      const target = document.getElementById("target");
      const pageApi = createApiSetting("page-api");

      createTranslator(
        { transOpen: "false", apiSlug: pageApi.apiSlug },
        {
          preInit: true,
          transApis: [pageApi, ...extraApis],
          mouseHoverSetting: {
            useMouseHover: true,
            mouseHoverKey: [],
            mouseHoverKey2: [],
            displayMode: "bubble",
            apiSlug,
          },
        }
      );
      await hoverNode(target);
      await flushAsync();

      expect(apiTranslate).toHaveBeenCalledWith(
        expect.objectContaining({
          apiSetting: expect.objectContaining({ apiSlug: pageApi.apiSlug }),
        })
      );
    }
  );

  test("ignores the bubble API in inline bilingual mode", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Inline translation</p></main>';
    const target = document.getElementById("target");
    const pageApi = createApiSetting("page-api");
    const bubbleApi = createApiSetting("bubble-api");

    createTranslator(
      { transOpen: "false", apiSlug: pageApi.apiSlug },
      {
        preInit: true,
        transApis: [pageApi, bubbleApi],
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bilingual",
          apiSlug: bubbleApi.apiSlug,
        },
      }
    );
    await hoverNode(target);
    await flushAsync();

    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        apiSetting: expect.objectContaining({ apiSlug: pageApi.apiSlug }),
      })
    );
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("shows the hidden original in a bubble after the configured hover delay", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hidden original</p></main>';

    const translator = createTranslator(
      {
        transOnly: "true",
        transOnlyRevert: "false",
        transOnlyRevertDelay: "0.3",
      },
      {
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await flushAsync();

    const wrapper = document.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    const inner = wrapper.querySelector(`.${Translator.KISS_CLASS.inner}`);
    const translateCallCount = apiTranslate.mock.calls.length;

    await hoverNode(inner);
    jest.advanceTimersByTime(299);
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();

    jest.advanceTimersByTime(1);
    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(bubble.textContent).toBe("Hello hidden original");
    expect(apiTranslate).toHaveBeenCalledTimes(translateCallCount);
    expect(document.getElementById("target").textContent).not.toContain(
      "Hello hidden original"
    );

    translator.updateRule({ transOnly: "false" });
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();
  });

  test("shows the hidden original immediately when the hover shortcut is used", async () => {
    document.body.innerHTML =
      '<main id="root"><p>Hello shortcut original</p></main>';

    createTranslator(
      {
        transOnly: "true",
        transOnlyRevert: "true",
        transOnlyRevertDelay: "10",
      },
      {
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: ["ControlLeft"],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await flushAsync();

    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    const translateCallCount = apiTranslate.mock.calls.length;
    await hoverNode(inner);

    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "ControlLeft", bubbles: true })
    );
    window.dispatchEvent(
      new KeyboardEvent("keyup", { code: "ControlLeft", bubbles: true })
    );

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(bubble.textContent).toBe("Hello shortcut original");
    expect(apiTranslate).toHaveBeenCalledTimes(translateCallCount);
  });

  test("shows the original after translation-only mode is enabled dynamically", async () => {
    document.body.innerHTML =
      '<main id="root"><p>Original hidden after control panel toggle</p></main>';

    const translator = createTranslator(
      {
        transOnly: "false",
        transOnlyRevert: "false",
        transOnlyRevertDelay: "0",
      },
      {
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await flushAsync();

    translator.updateRule({ transOnly: "true" });
    await flushAsync();

    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    const translateCallCount = apiTranslate.mock.calls.length;
    await hoverNode(inner);
    jest.advanceTimersByTime(1);

    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
        .textContent
    ).toBe("Original hidden after control panel toggle");
    expect(apiTranslate).toHaveBeenCalledTimes(translateCallCount);
  });

  test("cancels a pending original bubble after leaving the translation", async () => {
    document.body.innerHTML =
      '<main id="root"><p>Original bubble should be cancelled</p></main>';

    createTranslator(
      {
        transOnly: "true",
        transOnlyRevert: "true",
        transOnlyRevertDelay: "0.5",
      },
      {
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await flushAsync();

    const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
    await hoverNode(inner);
    await hoverNode(document.body);
    jest.advanceTimersByTime(1000);

    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();
  });

  test("shows rich original text only for the latest hovered translation", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p>First <strong>rich</strong> original</p>
        <p>Second <em>latest</em> original</p>
      </main>
    `;

    createTranslator(
      {
        transOnly: "true",
        transOnlyRevert: "true",
        transOnlyRevertDelay: "0.5",
      },
      {
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await flushAsync();

    const inners = document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`);
    expect(inners).toHaveLength(2);

    await hoverNode(inners[0]);
    jest.advanceTimersByTime(200);
    await hoverNode(inners[1]);
    jest.advanceTimersByTime(499);
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();

    jest.advanceTimersByTime(1);
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
        .textContent
    ).toBe("Second latest original");
  });

  test("keeps forced bubble positioning when custom CSS misses trailing semicolon", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
          bubbleStyle: "background: red",
        },
      }
    );
    await hoverNode(document.getElementById("target"));
    await flushAsync();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(bubble.style.background).toBe("red");
    expect(bubble.style.position).toBe("fixed");
    expect(bubble.style.zIndex).toBe("2147483647");
  });

  test("repositions an existing mouse hover bubble on raw mousemove", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await hoverNode(target, 10, 20);
    await flushAsync();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    const initialLeft = bubble.style.left;
    const initialTop = bubble.style.top;

    target.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: 80,
        clientY: 90,
      })
    );

    expect(bubble.style.left).not.toBe(initialLeft);
    expect(bubble.style.top).not.toBe(initialTop);
  });

  test("uses the shared loading icon and default blue style for mouse hover bubble", async () => {
    apiTranslate.mockImplementationOnce(() => new Promise(() => {}));
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );
    await hoverNode(document.getElementById("target"));

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(bubble.dataset.state).toBe("loading");
    expect(bubble.querySelector("svg")).not.toBeNull();
    expect(bubble.getAttribute("style")).toContain(
      "background: rgb(25, 118, 210)"
    );
  });

  test("ignores stale mouse hover bubble translation results", async () => {
    let resolveFirst;
    apiTranslate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ trText: "Second translation", isSame: false });
    document.body.innerHTML = `
      <main id="root">
        <p id="first">First hover</p>
        <p id="second">Second hover</p>
      </main>
    `;

    createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );

    await hoverNode(document.getElementById("first"));
    await hoverNode(document.getElementById("second"));
    await flushAsync();
    resolveFirst({ trText: "First translation", isSame: false });
    await Promise.resolve();
    await Promise.resolve();

    const bubble = document.querySelector(
      `.${Translator.KISS_CLASS.hoverBubble}`
    );
    expect(bubble.textContent).toBe("Second translation");
  });

  test("injects inline <style> when CSSStyleSheet constructor is unavailable", async () => {
    global.CSSStyleSheet = class {
      constructor() {
        throw new Error("CSSStyleSheet not available");
      }
    };

    document.body.innerHTML =
      '<main id="root"><section id="host">Content</section></main>';
    const host = document.getElementById("host");
    const shadowRoot = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
      configurable: true,
      writable: true,
      value: [],
    });
    shadowRoot.innerHTML = "<p>Shadow content</p>";

    createTranslator({ scanAll: "true" });
    await flushAsync();

    const style = shadowRoot.querySelector("style");
    expect(style).not.toBeNull();
    expect(style.id).toBe("kiss-translator-fallback-style");
    expect(style.textContent.length).toBeGreaterThan(0);
    expect(shadowRoot.querySelectorAll("style")).toHaveLength(1);
  });

  test("falls back to inline <style> when adoptedStyleSheets setter throws", async () => {
    document.body.innerHTML =
      '<main id="root"><section id="host">Content</section></main>';
    const host = document.getElementById("host");
    const shadowRoot = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
      configurable: true,
      get: () => [],
      set: () => {
        throw new Error("adoptedStyleSheets not allowed");
      },
    });
    shadowRoot.innerHTML = "<p>Shadow content</p>";

    createTranslator({ scanAll: "true" });
    await flushAsync();

    const style = shadowRoot.querySelector("style");
    expect(style).not.toBeNull();
    expect(style.id).toBe("kiss-translator-fallback-style");
    expect(style.textContent.length).toBeGreaterThan(0);
    expect(shadowRoot.querySelectorAll("style")).toHaveLength(1);
  });

  test("removes mouse hover bubble when mouse hover is disabled", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello hover</p></main>';
    const target = document.getElementById("target");
    const translator = createTranslator(
      {
        transOpen: "false",
      },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          displayMode: "bubble",
        },
      }
    );

    await hoverNode(target);
    await flushAsync();
    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).not.toBeNull();

    translator.toggleMouseHover();

    expect(
      document.querySelector(`.${Translator.KISS_CLASS.hoverBubble}`)
    ).toBeNull();
  });

  test("wraps original nodes with a reusable text style and unwraps on disable", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p id="target">Text <a id="link" href="#">link</a> tail</p>
      </main>
    `;
    const target = document.getElementById("target");
    const link = document.getElementById("link");
    const translator = createTranslator(
      {
        wrapOriginal: "true",
        originalTextStyle: "original_custom",
        autoScan: "false",
        selector: "#target",
      },
      {
        minLength: 0,
        customStyles: [
          {
            styleSlug: "original_custom",
            styleName: "Original Custom",
            styleCode: "background: yellow;",
          },
        ],
      }
    );
    await flushAsync();

    const original = target.querySelector(
      `:scope > .${Translator.KISS_CLASS.original}`
    );
    expect(original).not.toBeNull();
    expect(original.classList.length).toBeGreaterThan(1);
    expect(original.querySelector("#link")).toBe(link);
    expect(
      target.querySelectorAll(`.${Translator.KISS_CLASS.original}`)
    ).toHaveLength(1);

    translator.disable();

    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();
    expect(target.querySelector("#link")).toBe(link);
    expect(target.textContent).toContain("Text link tail");
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
  });

  test("updates original wrapping and style without translating again", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hello original</p></main>';
    const target = document.getElementById("target");
    const translator = createTranslator(
      { wrapOriginal: "false" },
      {
        minLength: 0,
        customStyles: [
          {
            styleSlug: "original_one",
            styleName: "Original One",
            styleCode: "color: red;",
          },
          {
            styleSlug: "original_two",
            styleName: "Original Two",
            styleCode: "color: blue;",
          },
        ],
      }
    );
    await flushAsync();
    const requestCount = apiTranslate.mock.calls.length;

    translator.updateRule({
      wrapOriginal: "true",
      originalTextStyle: "original_one",
    });
    await flushAsync();

    let original = target.querySelector(
      `:scope > .${Translator.KISS_CLASS.original}`
    );
    expect(original).not.toBeNull();
    const firstStyleClass = Array.from(original.classList).find(
      (className) => className !== Translator.KISS_CLASS.original
    );
    expect(apiTranslate).toHaveBeenCalledTimes(requestCount);

    translator.updateRule({ originalTextStyle: "original_two" });
    await flushAsync();

    original = target.querySelector(
      `:scope > .${Translator.KISS_CLASS.original}`
    );
    expect(original.classList.contains(firstStyleClass)).toBe(false);
    expect(apiTranslate).toHaveBeenCalledTimes(requestCount);

    translator.updateRule({ transOrder: "translation-first" });
    await flushAsync();
    expect(target.firstElementChild.classList).toContain(
      Translator.KISS_CLASS.warpper
    );
    expect(target.lastElementChild).toBe(original);

    translator.updateRule({ wrapOriginal: "false" });
    await flushAsync();
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();
    expect(apiTranslate).toHaveBeenCalledTimes(requestCount);
  });

  test("moves a wrapped original through translation-only mode and cleans it up", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hidden original</p></main>';
    const target = document.getElementById("target");
    const translator = createTranslator({
      wrapOriginal: "true",
      originalTextStyle: "style_none",
      transOnly: "true",
      transOrder: "translation-first",
    });
    await flushAsync();

    const translation = target.querySelector(
      `.${Translator.KISS_CLASS.warpper}`
    );
    const backup = translation.querySelector(
      `template.${Translator.KISS_CLASS.backup}`
    );
    expect(
      backup.content.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).not.toBeNull();
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();

    const requestCount = apiTranslate.mock.calls.length;
    translator.updateRule({ wrapOriginal: "false" });
    await flushAsync();
    expect(
      backup.content.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();
    expect(apiTranslate).toHaveBeenCalledTimes(requestCount);

    translator.updateRule({
      wrapOriginal: "true",
      originalTextStyle: "blockquote",
    });
    await flushAsync();
    expect(
      backup.content.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).not.toBeNull();
    expect(apiTranslate).toHaveBeenCalledTimes(requestCount);

    translator.updateRule({ transOnly: "false" });
    await flushAsync();
    expect(target.lastElementChild.classList).toContain(
      Translator.KISS_CLASS.original
    );

    translator.updateRule({ transOnly: "true" });
    await flushAsync();
    expect(
      backup.content.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).not.toBeNull();

    translator.disable();
    expect(target.textContent).toBe("Hidden original");
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();
  });

  test("does not wrap original nodes when translation produces no result", async () => {
    apiTranslate.mockResolvedValueOnce({ trText: "", isSame: false });
    document.body.innerHTML =
      '<main id="root"><p id="target">Untranslated original</p></main>';

    createTranslator({ wrapOriginal: "true" });
    await flushAsync();

    const target = document.getElementById("target");
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`)
    ).toBeNull();
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
    expect(target.textContent).toBe("Untranslated original");
  });

  test("rescans changed wrapped content without nesting original wrappers", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Initial original</p></main>';
    const translator = createTranslator(
      { wrapOriginal: "true" },
      { minLength: 0 }
    );
    await flushAsync();

    const target = document.getElementById("target");
    const original = target.querySelector(`.${Translator.KISS_CLASS.original}`);
    const requestCount = apiTranslate.mock.calls.length;
    original.firstChild.nodeValue = "Changed original";

    translator.rescan();
    await flushAsync();

    expect(apiTranslate.mock.calls.length).toBeGreaterThan(requestCount);
    expect(
      target.querySelectorAll(`.${Translator.KISS_CLASS.original}`)
    ).toHaveLength(1);
    expect(
      target.querySelector(`.${Translator.KISS_CLASS.original}`).textContent
    ).toBe("Changed original");
  });

  test("holds the left mouse button to translate the whole text block and restore on second hold", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);
    expect(document.getElementById("first").textContent).toContain(
      "First paragraph"
    );
    expect(document.getElementById("second").textContent).toContain(
      "Second paragraph"
    );

    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    // 再次按住左键：整块区域一起还原
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("drops stale whole-area results after a second hold restores pending translations", async () => {
    const resolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false", wrapOriginal: "true" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    // 两个段落的请求仍在途：loading 容器已插入
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);
    expect(resolvers).toHaveLength(2);

    // 第二次按住：整块还原，loading 容器被移除，但请求尚未完成
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 在途请求此刻才完成：过期结果必须被丢弃，
    // 不得再把已还原的原文包裹进 .original 容器或插入译文
    resolvers.forEach((resolve) =>
      resolve({ trText: "Translated", isSame: false })
    );
    await Promise.resolve();
    await Promise.resolve();
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.original}`)
    ).toHaveLength(0);
    expect(document.getElementById("first").textContent).toBe(
      "First paragraph"
    );
    expect(document.getElementById("second").textContent).toBe(
      "Second paragraph"
    );
  });

  test("keeps restored original text visible when a pending transOnly whole-area request finishes", async () => {
    const resolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false", transOnly: "true" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);

    // 第二次按住还原后，在途的仅译文请求完成：
    // 不得把已还原的原文搬走（#removeOriginal 会移动原文节点导致原文消失）
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
    expect(document.getElementById("first").textContent).toBe(
      "First paragraph"
    );

    resolvers.forEach((resolve) =>
      resolve({ trText: "Translated", isSame: false })
    );
    await Promise.resolve();
    await Promise.resolve();
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
    expect(document.getElementById("first").isConnected).toBe(true);
    expect(document.getElementById("first").textContent).toBe(
      "First paragraph"
    );
    expect(document.getElementById("second").textContent).toBe(
      "Second paragraph"
    );
  });

  test("ignores stale failed whole-area requests after restore without touching a new translation", async () => {
    const resolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          resolvers.push({ resolve, reject });
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);
    expect(resolvers).toHaveLength(2);

    // 第二次按住：还原，移除两个 loading 容器
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 第三次按住：发起新一轮翻译
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);
    expect(resolvers).toHaveLength(4);

    // 旧请求此刻才失败：过期失败结果必须被丢弃，
    // 不得在宿主的新译文容器里渲染重试按钮或清空其内容
    resolvers[0].reject(new Error("network error"));
    resolvers[1].reject(new Error("network error"));
    await Promise.resolve();
    await Promise.resolve();
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.retry}`)
    ).toHaveLength(0);

    // 新一轮请求正常完成，译文与原文都完好
    resolvers[2].resolve({ trText: "Translated", isSame: false });
    resolvers[3].resolve({ trText: "Translated", isSame: false });
    await Promise.resolve();
    await Promise.resolve();
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(2);
    expect(document.getElementById("first").textContent).toContain(
      "First paragraph"
    );
    expect(document.getElementById("second").textContent).toContain(
      "Second paragraph"
    );
  });

  test("expands hold translation to the whole area when paragraphs are nested in wrappers", async () => {
    document.body.innerHTML = `
      <main id="root">
        <div id="area">
          <div class="para"><p id="first">Alpha paragraph</p></div>
          <div class="para"><p id="second">Beta paragraph</p></div>
          <div class="para"><p id="third">Gamma paragraph</p></div>
        </div>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const translated = [
      ...document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`),
    ].map((node) => node.textContent);
    expect(translated).toHaveLength(3);
    expect(translated).toEqual(["Translated", "Translated", "Translated"]);
  });

  test("cancels hold translation when the mouse moves to select text", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Selectable text</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
        },
      }
    );

    await hoverNode(target, 20, 20);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 25,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("falls back to the default hold delay when mouseHoverHoldDelay is 0", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hold target</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 0,
        },
      }
    );

    await hoverNode(target, 20, 20);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );

    // 0 应回退到默认 800ms：未到 800ms 前不触发
    // 注意不能在此处调用 flushAsync（其 runOnlyPendingTimers 会无视剩余时间
    // 提前执行挂起的定时器），直接用真实时钟推进断言。
    jest.advanceTimersByTime(700);
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 达到默认 800ms 时触发
    jest.advanceTimersByTime(100);
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(1);

    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
  });

  test("cancels pending hold translation on pointercancel and contextmenu", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hold target</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(target, 20, 20);

    // pointercancel（触摸手势被浏览器接管）取消按住
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    document.dispatchEvent(new Event("pointercancel", { bubbles: true }));
    jest.advanceTimersByTime(400);
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // contextmenu（右键/移动端长按菜单）取消按住
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    document.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true })
    );
    jest.advanceTimersByTime(400);
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("does not register hold handlers on touch-only devices", async () => {
    window.matchMedia.mockImplementation((query) => ({
      matches: query !== "(any-hover: hover)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    document.body.innerHTML =
      '<main id="root"><p id="target">Hold target</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(target, 20, 20);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(500);
    await flushAsync();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("registers hold handlers on hybrid touch devices with a hover-capable secondary input", async () => {
    window.matchMedia.mockImplementation((query) => ({
      matches: query !== "(hover: hover)",
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    document.body.innerHTML =
      '<main id="root"><p id="target">Hold target</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(target, 20, 20);
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#target .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("uses the element under the cursor instead of a stale hovered node", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="old">Old paragraph</p></main>';
    const oldNode = document.getElementById("old");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(oldNode, 20, 20);

    // 光标下的 DOM 被动态替换，新元素尚未被扫描登记
    const newP = document.createElement("p");
    newP.id = "new";
    newP.textContent = "New paragraph";
    document.getElementById("root").appendChild(newP);
    document.elementFromPoint = () => newP;

    newP.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#new .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#old .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
  });

  test("falls back to the mousedown target when no hover coordinates exist", async () => {
    document.body.innerHTML =
      '<main id="root"><p id="target">Hold target</p></main>';
    const target = document.getElementById("target");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    // 页面加载后光标未移动，直接长按：没有 hover 坐标可供定位
    target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#target .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("does not suppress click when the held link is excluded by rules", async () => {
    document.body.innerHTML =
      '<main id="root"><a id="link" href="#">darkwalker1212:feat/MouseHold</a></main>';
    const link = document.getElementById("link");
    document.elementFromPoint = () => link;

    createTranslator(
      { transOpen: "false", rootsSelector: "body", ignoreSelector: "#link" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
          mouseHoverPreventClick: true,
        },
      }
    );

    await hoverNode(link, 20, 20);
    link.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(click);

    // 被规则排除的目标没有被翻译，也不应吞掉点击
    expect(click.defaultPrevented).toBe(false);
    expect(
      document.querySelector(`#link .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
  });

  test("does not send queued whole-area requests after the container is restored", async () => {
    const resolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const drain = async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          ${[1, 2, 3, 4, 5, 6]
            .map((i) => `<p id="p${i}">Paragraph ${i}</p>`)
            .join("")}
        </section>
      </main>
    `;
    const first = document.getElementById("p1");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await drain();
    expect(resolvers).toHaveLength(5); // 并发上限 5，第 6 个单元在排队

    // 第二次按住：还原，移除所有 loading 容器（包括排队中单元的容器）
    hold();
    await drain();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 完成全部在途请求：排队任务被唤醒后必须放弃，不得再调用翻译接口
    for (let i = 0; i < 5; i++) {
      resolvers[i]({ trText: "Translated", isSame: false });
    }
    await drain();
    await drain();

    expect(resolvers).toHaveLength(5);
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("does not send requests when the area is restored during language detection", async () => {
    const detectResolvers = [];
    tryDetectLang.mockImplementation(
      () =>
        new Promise((resolve) => {
          detectResolvers.push(resolve);
        })
    );
    const apiResolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          apiResolvers.push(resolve);
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="p1">First paragraph</p>
          <p id="p2">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("p1");

    createTranslator(
      { transOpen: "false", fromLang: "auto" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await flushAsync();
    expect(detectResolvers).toHaveLength(2); // 两个单元都停在语言检测
    expect(apiResolvers).toHaveLength(0);

    // 语言检测完成前第二次按住：还原区域
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 检测此刻才完成：过期任务必须被废弃，不得创建容器或发起请求
    detectResolvers.forEach((resolve) => resolve("en"));
    await flushAsync();
    await flushAsync();

    expect(apiResolvers).toHaveLength(0);
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);
  });

  test("clears a stale paragraph hold state after restore during language detection", async () => {
    const detectResolvers = [];
    tryDetectLang.mockImplementation(
      () =>
        new Promise((resolve) => {
          detectResolvers.push(resolve);
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <p id="p1">First paragraph</p>
      </main>
    `;
    const first = document.getElementById("p1");

    createTranslator(
      { transOpen: "false", fromLang: "auto" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await flushAsync();
    expect(detectResolvers).toHaveLength(1);

    // 语言检测完成前第二次按住：还原当前段
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    detectResolvers[0]("en");
    await flushAsync();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 过期任务必须回滚 processed 标记，后续按住仍可再次翻译当前段
    tryDetectLang.mockResolvedValue("en");
    hold();
    await flushAsync();
    await flushAsync();
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("applies a tightened target selector to cached whole-area units", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="p1">Paragraph 1</p>
          <p id="p2">Paragraph 2</p>
        </section>
      </main>
    `;
    const second = document.getElementById("p2");

    const translator = createTranslator(
      { transOpen: "false", autoScan: "false", selector: "#p1, #p2" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      second.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(second, 20, 20);
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 收紧目标选择器：缓存中的 p1 必须在用时被完整规则校验剔除
    translator.updateRule({ selector: "#p2" });
    await flushAsync();

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(1);
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
    expect(
      document.querySelector(`#p2 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("holds to translate a paragraph inside an open shadow root", async () => {
    document.body.innerHTML =
      '<main id="root"><section id="host"></section></main>';
    const host = document.getElementById("host");
    const shadowRoot = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadowRoot, "adoptedStyleSheets", {
      configurable: true,
      writable: true,
      value: [],
    });
    shadowRoot.innerHTML = '<p id="sp">Shadow paragraph</p>';
    const sp = shadowRoot.getElementById("sp");
    // Shadow DOM 命中时 elementFromPoint 只返回宿主元素
    document.elementFromPoint = () => host;

    createTranslator(
      { transOpen: "false", scanAll: "true" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await flushAsync();

    sp.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        composed: true,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(100);
    await flushAsync();

    sp.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        composed: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      sp.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("caps concurrent hold-triggered whole-area requests and drains the queue", async () => {
    const resolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const drain = async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          ${[1, 2, 3, 4, 5, 6, 7]
            .map((i) => `<p id="p${i}">Paragraph ${i}</p>`)
            .join("")}
        </section>
      </main>
    `;
    const first = document.getElementById("p1");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(300);
    await drain();

    // 所有单元的 loading 容器都已插入，但在途请求被限制在 5 个并发名额内
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(7);
    expect(resolvers).toHaveLength(5);

    // 完成一个请求 → 释放一个名额 → 队列中第 6 个请求发出
    resolvers[0]({ trText: "Translated", isSame: false });
    await drain();
    expect(resolvers).toHaveLength(6);

    // 再完成一个 → 第 7 个请求发出
    resolvers[1]({ trText: "Translated", isSame: false });
    await drain();
    expect(resolvers).toHaveLength(7);

    // 完成其余请求 → 全部段落翻译完成，原文完好
    for (let i = 2; i < 7; i++) {
      resolvers[i]({ trText: "Translated", isSame: false });
    }
    await drain();

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(7);
    expect(document.getElementById("p7").textContent).toContain(
      "Paragraph 7"
    );

    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
  });

  test("picks up newly added content in the whole area after DOM changes", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="p1">Paragraph 1</p>
          <p id="p2">Paragraph 2</p>
        </section>
      </main>
    `;
    const first = document.getElementById("p1");
    const area = document.getElementById("area");

    const translator = createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 区域新增段落：生产环境中 MutationObserver 驱动的重扫描会使单元缓存失效。
    // 测试环境 MO→空闲定时器链在假定时器下不可靠，这里与仓库既有重扫描测试
    // 一致，显式调用 rescan() 触发同样的失效路径（rescan -> #init 清空缓存）。
    const p3 = document.createElement("p");
    p3.id = "p3";
    p3.textContent = "Paragraph 3";
    area.appendChild(p3);
    translator.rescan();
    await flushAsync();

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(3);
  });

  test("applies a changed ignore selector to cached whole-area units", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="p1">Paragraph 1</p>
          <p id="p2">Paragraph 2</p>
        </section>
      </main>
    `;
    const second = document.getElementById("p2");

    const translator = createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
        },
      }
    );

    const hold = () => {
      second.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(second, 20, 20);
    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(2);

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(0);

    // 动态变更忽略规则：只重挂 IO、不触发重扫描，缓存单元需在用时重新过滤
    translator.updateRule({ ignoreSelector: "#p1" });
    await flushAsync();

    hold();
    await flushAsync();
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(1);
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
    expect(
      document.querySelector(`#p2 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("translates only the current paragraph in paragraph scope mode", async () => {
    document.body.innerHTML = `
      <main id="root">
        <section id="area">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </section>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
    ).toHaveLength(1);
    expect(
      document.querySelector(`#first .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#second .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("translates the whole mail body when holding on any paragraph", async () => {
    document.body.innerHTML = `
      <div id="email">
        <div id="first">First line of the mail</div>
        <div id="second">Second line of the mail</div>
        <div id="third">Third line of the mail</div>
      </div>
    `;
    const second = document.getElementById("second");

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(second, 20, 20);
    second.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(3);
    expect(
      document.querySelector(`#first .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#second .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#third .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    const wrapper = document.querySelector(
      `#first .${Translator.KISS_CLASS.warpper}`
    );
    expect(wrapper.style.display).toBe("block");
    expect(wrapper.style.margin).toBe("8px 0px");
  });

  test("renders hold translation inline when inline display mode is selected", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p id="first">First paragraph</p>
        <p id="second">Second paragraph</p>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
          mouseHoverTransDisplay: "inline",
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const wrapper = document.querySelector(
      `#first .${Translator.KISS_CLASS.warpper}`
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.display).toBe("");
    expect(wrapper.style.margin).toBe("");
  });

  test("translates the whole flat article area and leaves the sidebar untouched", async () => {
    document.body.innerHTML = `
      <main id="root">
        <article id="post">
          <p id="first">First paragraph</p>
          <p id="second">Second paragraph</p>
        </article>
        <aside id="sidebar">Sidebar should stay untouched</aside>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(2);
    expect(
      document.querySelector(`#sidebar .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("translates the nearest nested region in region scope mode", async () => {
    document.body.innerHTML = `
      <main id="root">
        <article id="post">
          <p id="intro">Intro paragraph</p>
          <section id="group">
            <p id="first">First paragraph</p>
            <p id="second">Second paragraph</p>
          </section>
          <p id="outro">Outro paragraph</p>
        </article>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "region",
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    // 只翻译最近的嵌套区域（section#group），不扩到整篇文章
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(2);
    expect(
      document.querySelector(`#group #first .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#group #second .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#intro .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
    expect(
      document.querySelector(`#outro .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("translates the whole article in area scope mode when paragraphs are nested in a section", async () => {
    document.body.innerHTML = `
      <main id="root">
        <article id="post">
          <p id="intro">Intro paragraph</p>
          <section id="group">
            <p id="first">First paragraph</p>
            <p id="second">Second paragraph</p>
          </section>
          <p id="outro">Outro paragraph</p>
        </article>
      </main>
    `;
    const first = document.getElementById("first");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(first, 20, 20);
    first.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    // 区域模式优先整篇文章：嵌套结构下的段落也全部翻译
    expect(
      document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`)
    ).toHaveLength(4);
    expect(
      document.querySelector(`#intro .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#first .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#second .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    expect(
      document.querySelector(`#outro .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
  });

  test("translates direct text and block children of a mixed mail body container", async () => {
    document.body.innerHTML = `
      <div id="email">
        <div id="mixed">First line text
          <div id="line1">Second line text</div>
          <div id="line2">Third line text</div>
        </div>
      </div>
    `;
    const line1 = document.getElementById("line1");

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(line1, 20, 20);
    line1.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const inners = [
      ...document.querySelectorAll(`.${Translator.KISS_CLASS.inner}`),
    ].map((node) => node.textContent);
    expect(inners).toHaveLength(3);
    expect(document.querySelector(`#mixed .${Translator.KISS_CLASS.inner}`))
      .not.toBeNull();
    expect(document.querySelector(`#line1 .${Translator.KISS_CLASS.inner}`))
      .not.toBeNull();
    expect(document.querySelector(`#line2 .${Translator.KISS_CLASS.inner}`))
      .not.toBeNull();
  });

  test("excludes the mail title bar from the whole-area scope", async () => {
    document.body.innerHTML = `
      <div id="email">
        <div id="title">Subject: Outlook test mail</div>
        <div id="body">
          First body line
          <div dir="auto">Second body line</div>
          <div dir="auto">Third body line</div>
        </div>
      </div>
    `;
    const secondLine = document.querySelector("#body [dir='auto']");

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(secondLine, 20, 20);
    secondLine.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelectorAll(`#body .${Translator.KISS_CLASS.inner}`)
        .length
    ).toBeGreaterThanOrEqual(3);
    expect(
      document.querySelector(`#title .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("holds to translate a link inside a widget container", async () => {
    document.body.innerHTML = `
      <div id="widget">
        <svg id="icon" width="16" height="16"><path d="M0 0"/></svg>
        <a id="link" href="#">darkwalker1212:feat/MouseHold</a>
        had recent pushes 25 minutes ago
      </div>
    `;
    const link = document.getElementById("link");
    document.elementFromPoint = () => link;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(link, 20, 20);
    link.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#link .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
  });

  test("holds to translate widget text next to a link", async () => {
    document.body.innerHTML = `
      <div id="widget">
        <svg id="icon" width="16" height="16"><path d="M0 0"/></svg>
        <a id="link" href="#">darkwalker1212:feat/MouseHold</a>
        had recent pushes 25 minutes ago
      </div>
    `;
    const widget = document.getElementById("widget");
    document.elementFromPoint = () => widget;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(widget, 20, 20);
    widget.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#widget .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
  });

  test("skips a button when the ignore selector includes button", async () => {
    document.body.innerHTML =
      '<main id="root"><button id="btn">New branch</button></main>';
    const btn = document.getElementById("btn");
    document.elementFromPoint = () => btn;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(btn, 20, 20);
    btn.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#btn .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("translates a button when it is removed from the ignore selector", async () => {
    document.body.innerHTML =
      '<main id="root"><button id="btn">New branch</button></main>';
    const btn = document.getElementById("btn");
    document.elementFromPoint = () => btn;

    createTranslator(
      { transOpen: "false", rootsSelector: "body", ignoreSelector: "" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "area",
        },
      }
    );

    await hoverNode(btn, 20, 20);
    btn.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#btn .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
    const wrapper = document.querySelector(
      `#btn .${Translator.KISS_CLASS.warpper}`
    );
    expect(wrapper.style.display).toBe("");
  });

  test("holds to translate a headline wrapped by a link when autoScan is enabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <article>
          <section>
            <div data-testid="card-text-wrapper">
              <div data-testid="anchor-inner-wrapper">
                <a href="/news/articles/x" data-testid="internal-link">
                  <div>
                    <div>
                      <h2 data-testid="card-headline">Israel rejects Trump plan for Gaza</h2>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </section>
        </article>
      </main>
    `;
    const h2 = document.querySelector("h2");
    document.elementFromPoint = () => h2;

    createTranslator(
      { transOpen: "false", autoScan: "true", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(h2, 20, 20);
    h2.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    await flushAsync();

    expect(
      document.querySelector(
        `h2 .${Translator.KISS_CLASS.warpper} .${Translator.KISS_CLASS.inner}`
      )
    ).not.toBeNull();
  });

  test("holds to translate a Yahoo-style news title inside a wrapped link", async () => {
    document.body.innerHTML = `
      <main id="root">
        <ul>
          <li>
            <article>
              <a href="https://news.yahoo.co.jp/pickup/6591226">
                <div>
                  <div>
                    <h1>
                      <span class="news-title">韓国サッカー性接待疑惑 捜査検討</span>
                    </h1>
                  </div>
                </div>
              </a>
            </article>
          </li>
        </ul>
      </main>
    `;
    const span = document.querySelector(".news-title");
    document.elementFromPoint = () => span;

    createTranslator(
      { transOpen: "false", autoScan: "true", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(span, 20, 20);
    span.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    await flushAsync();

    expect(
      span.querySelector(
        `.${Translator.KISS_CLASS.warpper} .${Translator.KISS_CLASS.inner}`
      )
    ).not.toBeNull();
    // 解除行数截断的 selectStyle 应写回到标题 span 自身
    expect(span.getAttribute("style") || "").toContain("height: auto");
  });

  test("holds to translate a link that directly wraps a text span and restores on second hold", async () => {
    document.body.innerHTML = `
      <main id="root">
        <a href="/news/1"><span class="news-title">韓国サッカー性接待疑惑 捜査検討</span></a>
      </main>
    `;
    const span = document.querySelector(".news-title");
    document.elementFromPoint = () => span;

    createTranslator(
      { transOpen: "false", autoScan: "true", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    const hold = async () => {
      await hoverNode(span, 20, 20);
      span.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(200);
      await flushAsync();
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
      await flushAsync();
    };

    await hold();

    expect(
      span.querySelector(
        `.${Translator.KISS_CLASS.warpper} .${Translator.KISS_CLASS.inner}`
      )
    ).not.toBeNull();
    expect(span.getAttribute("style") || "").toContain("height: auto");

    // 再次按住：应还原译文
    const wrapper = span.querySelector(`.${Translator.KISS_CLASS.warpper}`);
    document.elementFromPoint = () => wrapper;
    await hold();

    expect(
      span.querySelector(`.${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();
  });

  test("descends into the title span when the hold lands on the heading wrapper", async () => {
    document.body.innerHTML = `
      <main id="root">
        <ul>
          <li>
            <article>
              <a href="https://news.yahoo.co.jp/pickup/6591212">
                <div>
                  <div>
                    <h1>
                      <span class="news-title">沖縄尚学・末吉と横浜・織田 抱擁</span>
                    </h1>
                    <span class="comment"><span>252</span></span>
                  </div>
                </div>
              </a>
            </article>
          </li>
        </ul>
      </main>
    `;
    const h1 = document.querySelector("h1");
    const span = document.querySelector(".news-title");
    document.elementFromPoint = () => h1;

    createTranslator(
      { transOpen: "false", autoScan: "true", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(h1, 20, 20);
    h1.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    await flushAsync();

    expect(
      span.querySelector(
        `.${Translator.KISS_CLASS.warpper} .${Translator.KISS_CLASS.inner}`
      )
    ).not.toBeNull();
    expect(span.getAttribute("style") || "").toContain("height: auto");
  });

  test("respects the target element selector when autoScan is disabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <p id="allowed">Allowed text</p>
        <p id="blocked">Blocked text</p>
      </main>
    `;
    const allowed = document.getElementById("allowed");
    const blocked = document.getElementById("blocked");

    createTranslator(
      { transOpen: "false", autoScan: "false", selector: "#allowed" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    document.elementFromPoint = () => blocked;
    await hoverNode(blocked, 20, 20);
    blocked.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#blocked .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();

    document.elementFromPoint = () => allowed;
    await hoverNode(allowed, 20, 20);
    allowed.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#allowed .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
  });

  test("skips targets outside rule roots", async () => {
    document.body.innerHTML = `
      <main id="root"><p id="inside">Inside text</p></main>
      <div id="outside">Outside text</div>
    `;
    const outside = document.getElementById("outside");
    document.elementFromPoint = () => outside;

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(outside, 20, 20);
    outside.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    expect(
      document.querySelector(`#outside .${Translator.KISS_CLASS.inner}`)
    ).toBeNull();
  });

  test("suppresses click after hold-to-translate on a link when enabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <a id="link" href="#">darkwalker1212:feat/MouseHold</a>
      </main>
    `;
    const link = document.getElementById("link");
    document.elementFromPoint = () => link;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
          mouseHoverPreventClick: true,
        },
      }
    );

    await hoverNode(link, 20, 20);
    link.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(
      document.querySelector(`#link .${Translator.KISS_CLASS.inner}`)
    ).not.toBeNull();
  });

  test("does not suppress click after hold-to-translate on a link by default", async () => {
    document.body.innerHTML = `
      <main id="root">
        <a id="link" href="#">darkwalker1212:feat/MouseHold</a>
      </main>
    `;
    const link = document.getElementById("link");
    document.elementFromPoint = () => link;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    await hoverNode(link, 20, 20);
    link.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
  });

  test("does not suppress a quick click when the hold option is enabled", async () => {
    document.body.innerHTML = `
      <main id="root">
        <a id="link" href="#">darkwalker1212:feat/MouseHold</a>
      </main>
    `;
    const link = document.getElementById("link");
    document.elementFromPoint = () => link;

    createTranslator(
      { transOpen: "false", rootsSelector: "body" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverHoldDelay: 200,
          mouseHoverTransMode: "paragraph",
          mouseHoverPreventClick: true,
        },
      }
    );

    await hoverNode(link, 20, 20);
    link.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      })
    );
    // 快速松开，未达到按住延迟
    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, button: 0 })
    );
    jest.advanceTimersByTime(200);
    await flushAsync();

    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
  });

  test("discards pending hold tasks when Translator is disabled, stopped, or rescanned during language detection", async () => {
    for (const lifecycle of ["disable", "stop", "rescan"]) {
      const detectResolvers = [];
      tryDetectLang.mockImplementation(
        () =>
          new Promise((resolve) => {
            detectResolvers.push(resolve);
          })
      );
      apiTranslate.mockClear();
      document.body.innerHTML = `
        <main id="root">
          <p id="p1">Pending hold target</p>
        </main>
      `;
      const first = document.getElementById("p1");

      const translator = createTranslator(
        { transOpen: "false", fromLang: "auto" },
        {
          preInit: true,
          transInterval: 10000,
          mouseHoverSetting: {
            useMouseHover: true,
            mouseHoverKey: [],
            mouseHoverKey2: [],
            mouseHoverKeyHold: true,
            mouseHoverKey2Hold: false,
            mouseHoverHoldDelay: 300,
            mouseHoverTransMode: "paragraph",
          },
        }
      );
      translator.enable();

      const hold = () => {
        first.dispatchEvent(
          new MouseEvent("mousedown", {
            bubbles: true,
            button: 0,
            clientX: 20,
            clientY: 20,
          })
        );
        jest.advanceTimersByTime(300);
        document.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, button: 0 })
        );
      };

      await hoverNode(first, 20, 20);
      hold();
      await flushAsync();
      expect(detectResolvers).toHaveLength(1);

      if (lifecycle === "rescan") {
        translator.rescan();
      } else {
        translator[lifecycle]();
      }

      detectResolvers[0]("en");
      await flushAsync();
      await flushAsync();

      expect(apiTranslate).not.toHaveBeenCalled();
      expect(
        document.querySelectorAll(`.${Translator.KISS_CLASS.warpper}`)
      ).toHaveLength(0);
    }
  });

  test("does not cancel a pending hold translation when a later hold is rejected by rules", async () => {
    const detectResolvers = [];
    tryDetectLang.mockImplementation(
      () =>
        new Promise((resolve) => {
          detectResolvers.push(resolve);
        })
    );
    document.body.innerHTML = `
      <main id="root">
        <p id="good">Valid paragraph</p>
      </main>
      <a id="bad" href="#">Outside roots</a>
    `;
    const good = document.getElementById("good");
    const bad = document.getElementById("bad");

    createTranslator(
      { transOpen: "false", fromLang: "auto", rootsSelector: "#root" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    const holdOn = (node) => {
      document.elementFromPoint = () => node;
      node.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(good, 20, 20);
    holdOn(good);
    await flushAsync();
    expect(detectResolvers).toHaveLength(1);

    // 第二个目标在 rootsSelector 之外，不应推进 hold generation
    await hoverNode(bad, 20, 20);
    holdOn(bad);
    await flushAsync();
    expect(detectResolvers).toHaveLength(1);

    detectResolvers[0]("en");
    await flushAsync();
    await flushAsync();
    expect(apiTranslate).toHaveBeenCalled();
    expect(
      document.querySelector(`#good .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("restores a pending paragraph translation on the second hold", async () => {
    const apiResolvers = [];
    apiTranslate.mockImplementation(
      () =>
        new Promise((resolve) => {
          apiResolvers.push(resolve);
        })
    );
    document.body.innerHTML =
      '<main id="root"><p id="p1">Pending paragraph</p></main>';
    const first = document.getElementById("p1");

    createTranslator(
      { transOpen: "false" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    const hold = () => {
      first.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(first, 20, 20);
    hold();
    await flushAsync();
    expect(apiResolvers).toHaveLength(1);
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();

    // 网络请求仍在途时第二次按住：应移除 loading wrapper 并允许后续结果被丢弃
    hold();
    await flushAsync();
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();

    apiResolvers[0]({ trText: "Translated", isSame: false });
    await flushAsync();
    await flushAsync();
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();

    // 还原后再次按住应能重新翻译
    hold();
    await flushAsync();
    await flushAsync();
    expect(apiResolvers).toHaveLength(2);
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  test("rebuilds observed roots and invalidates old roots when rootsSelector changes", async () => {
    document.body.innerHTML = `
      <div id="root1"><p id="p1">Root one paragraph</p></div>
      <div id="root2"><p id="p2">Root two paragraph</p></div>
    `;
    const p1 = document.getElementById("p1");
    const p2 = document.getElementById("p2");

    const translator = createTranslator(
      { transOpen: "false", rootsSelector: "#root1" },
      {
        preInit: true,
        mouseHoverSetting: {
          useMouseHover: true,
          mouseHoverKey: [],
          mouseHoverKey2: [],
          mouseHoverKeyHold: true,
          mouseHoverKey2Hold: false,
          mouseHoverHoldDelay: 300,
          mouseHoverTransMode: "paragraph",
        },
      }
    );

    const holdOn = (node) => {
      document.elementFromPoint = () => node;
      node.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 20,
          clientY: 20,
        })
      );
      jest.advanceTimersByTime(300);
      document.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, button: 0 })
      );
    };

    await hoverNode(p2, 20, 20);
    holdOn(p2);
    await flushAsync();
    expect(
      document.querySelector(`#p2 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();

    translator.updateRule({ rootsSelector: "#root2" });
    await flushAsync();
    await flushAsync();

    await hoverNode(p1, 20, 20);
    holdOn(p1);
    await flushAsync();
    expect(
      document.querySelector(`#p1 .${Translator.KISS_CLASS.warpper}`)
    ).toBeNull();

    await hoverNode(p2, 20, 20);
    holdOn(p2);
    await flushAsync();
    await flushAsync();
    expect(
      document.querySelector(`#p2 .${Translator.KISS_CLASS.warpper}`)
    ).not.toBeNull();
  });

  describe("Translator terms wiring", () => {
    test("长词不被短词切割（API/APIKey 接线）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "APIKey and API";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "API,接口;APIKey",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const requestedText = apiTranslate.mock.calls[0][0].text;
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(requestedText).toBe("[[1]] and [[2]]");
      expect(inner.textContent).toBe("APIKey and 接口");
      expect(inner.textContent).not.toContain("接口Key");
    });

    test("长词触发而短词不抢占（GPT/GPTs 接线）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "GPTs and GPT";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "GPT;GPTs,智能体集合",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const requestedText = apiTranslate.mock.calls[0][0].text;
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(requestedText).toBe("[[1]] and [[2]]");
      expect(inner.textContent).toBe("智能体集合 and GPT");
    });

    test("Dr.whob,神经病; 真实链路：请求前保护 + 返回后恢复", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent =
        "The Dr.whob feature will ship in the next release.";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Dr.whob,神经病;",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 1. 发送到翻译提供商前，原始术语已被替换为受保护占位符
      const requestedText = apiTranslate.mock.calls[0][0].text;
      expect(requestedText).toBe(
        "The [[1]] feature will ship in the next release."
      );
      expect(requestedText).not.toContain("Dr.whob");

      // 2. 提供商返回后，目标术语被正确恢复到最终输出
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toContain("神经病");
      expect(inner.textContent).not.toContain("Dr.whob");
      expect(inner.textContent).toContain("feature will ship");
    });

    test("provider 返回错误自然语言译文时，术语仍由占位符恢复（不依赖 provider 质量）", async () => {
      apiTranslate.mockImplementation(() =>
        Promise.resolve({
          trText: "[[1]] translated by a totally different provider",
          isSame: false,
        })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent =
        "The Dr.whob feature will ship in the next release.";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Dr.whob,神经病;",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      // 本地术语机制独立于 provider 自行翻译：即使 provider 翻错，目标术语仍然恢复
      expect(inner.textContent).toContain("神经病");
      expect(inner.textContent).toContain(
        "translated by a totally different provider"
      );
    });

    test("provider 失败后重试：两次请求收到一致的受保护输入，术语仍恢复", async () => {
      apiTranslate
        .mockRejectedValueOnce(new Error("provider A down"))
        .mockImplementation(({ text }) =>
          Promise.resolve({ trText: text, isSame: false })
        );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "GPTs and GPT";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "GPT;GPTs,智能体集合",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 首次请求失败 → 出现重试按钮
      const retry = document.querySelector(`.${Translator.KISS_CLASS.retry}`);
      expect(retry).not.toBeNull();

      // 用户点击重试（回退路径）→ 第二次请求收到完全一致的受保护输入
      retry.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushAsync();
      expect(apiTranslate.mock.calls).toHaveLength(2);
      expect(apiTranslate.mock.calls[0][0].text).toBe("[[1]] and [[2]]");
      expect(apiTranslate.mock.calls[1][0].text).toBe(
        apiTranslate.mock.calls[0][0].text
      );
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("智能体集合 and GPT");
    });

    test("占位符序号跨运行隔离：每次请求都从 1 开始编号", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="targetA"></span><span id="targetB"></span></main>';
      document.getElementById("targetA").textContent = "APIKey and API";
      document.getElementById("targetB").textContent = "GPTs and GPT";

      createTranslator(
        {
          autoScan: "false",
          selector: "#targetA",
          apiSlug: "terms-test",
          terms: "API,接口;APIKey;GPT;GPTs,智能体集合",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 目标 B（第二条并发请求）也独立从 1 开始编号
      document.getElementById("targetB").textContent = "GPTs and GPT";
      createTranslator(
        {
          autoScan: "false",
          selector: "#targetB",
          apiSlug: "terms-test",
          terms: "GPT;GPTs,智能体集合",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      expect(apiTranslate.mock.calls).toHaveLength(2);
      expect(apiTranslate.mock.calls[1][0].text).toBe("[[1]] and [[2]]");
      // 两次请求的占位符编号互不污染
      expect(apiTranslate.mock.calls[0][0].text).toBe("[[1]] and [[2]]");
    });

    test("哨兵术语由本地占位符恢复：provider 未收到原文、无法代为翻译", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent =
        "Xyzzy drives the pipeline.";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Xyzzy,比特哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const requestedText = apiTranslate.mock.calls[0][0].text;
      expect(requestedText).toBe("[[1]] drives the pipeline.");
      expect(requestedText).not.toContain("Xyzzy");
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      // 最终结果来自本地术语 chain（占位符还原），与 provider 是否认识该词无关
      expect(inner.textContent).toBe("比特哨兵 drives the pipeline.");
    });

    test("本地 terms 与 provider aiTerms 并存：两套机制互不替代、互不掩盖", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Xyzzy,本地哨兵",
          aiTerms: "Xyzzy,服务端哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const args = apiTranslate.mock.calls[0][0];
      // 本地 terms：原文 Xyzzy 已被替换为占位符，provider 收不到原文
      expect(args.text).toBe("[[1]]");
      expect(args.text).not.toContain("Xyzzy");
      // provider aiTerms：作为 glossary 注入 prompt（机制独立，同时存在）
      expect(args.glossary).toEqual({ Xyzzy: "服务端哨兵" });
      // 最终输出由本地占位符还原，不被服务端术语遮蔽
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("本地哨兵");
    });

    test("整页路径 #translateFetch 携带规则级 aiTerms 生成的 glossary", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy usage";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          aiTerms: "Xyzzy,整页哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 整页翻译：glossary 来自规则级 rule.aiTerms，随 #translateFetch 注入 apiTranslate
      expect(apiTranslate.mock.calls[0][0].glossary).toEqual({
        Xyzzy: "整页哨兵",
      });
    });

    test("标题翻译同样携带规则级 aiTerms 的 glossary（整页+标题+泡泡范围）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.title = "Xyzzy Title";
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy usage";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          transTitle: "true",
          aiTerms: "Xyzzy,标题哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 标题翻译走同一个 #translateFetch，同样携带规则级 glossary
      const titleCall = apiTranslate.mock.calls.find(
        ([args]) => args.text === document.title
      );
      expect(titleCall).toBeDefined();
      expect(titleCall[0].glossary).toEqual({ Xyzzy: "标题哨兵" });
    });

    test("provider 返回完全不同的自然语言译文时，哨兵术语仍稳定恢复", async () => {
      apiTranslate.mockImplementation(() =>
        Promise.resolve({
          trText: "[[1]]（完全错误的 provider 译文）",
          isSame: false,
        })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy term here";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Xyzzy,比特哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("比特哨兵（完全错误的 provider 译文）");
    });

    test("合法术语与非法段共存：非法段只产生诊断，合法术语仍生效（API,接口;([,坏规则）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "API and the rest";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          // `([` 无法作为正则解析 → hasErrors=true；`API,接口` 是合法术语，必须继续生效
          terms: "API,接口;([,坏规则",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 合法术语进入占位符替换链路：provider 收到占位符，不再收到原文 API
      const requestedText = apiTranslate.mock.calls[0][0].text;
      expect(requestedText).toBe("[[1]] and the rest");
      expect(requestedText).not.toContain("API");
      // 翻译返回后，目标译文恢复；非法段不参与替换，也不产生切割残留
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("接口 and the rest");
      expect(inner.textContent).not.toContain("坏规则");
    });

    test("所有条目均非法：不构造无效正则、不抛异常，原文仍正常翻译", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "API and the rest";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "([,坏规则;bad[re",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 无合法术语 → 无占位符替换，原文原样送译（无空匹配正则、无异常）
      expect(apiTranslate.mock.calls[0][0].text).toBe("API and the rest");
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("API and the rest");
    });

    test("P1 真实生产链路：嵌套捕获组 + lookbehind 规则在整页翻译中正常替换并不吞正文", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "xy";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "((ABCDEFG)),long;(?<=x)y,look",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 占位符正确替换：x 保留，y 被替换为 [[1]]
      expect(apiTranslate.mock.calls[0][0].text).toBe("x[[1]]");
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("xlook");
    });

    test("updateRule 推送新 terms 后立即重解析，不会停留构造时旧值", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "API and Xyzzy";

      const translator = createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "API,接口",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 初始术语 API 生效
      expect(apiTranslate.mock.calls[0][0].text).toBe("[[1]] and Xyzzy");

      // 运行期推送新术语：Xyzzy 应立即生效，API 移除
      document.getElementById("target").textContent = "API and Xyzzy";
      translator.updateRule({ terms: "Xyzzy,哨兵" });
      translator.rescan();
      await flushAsync();

      const lastCall = apiTranslate.mock.calls.at(-1)[0];
      expect(lastCall.text).toBe("API and [[1]]");
      expect(lastCall.text).not.toContain("Xyzzy");
    });

    test("updateRule 修改 aiTerms 后 #glossary 立即刷新，不停留构造时旧值", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy usage";

      const translator = createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          aiTerms: "Xyzzy,构造旧值",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 初始 #glossary 反映构造时的 aiTerms，作为 glossary 注入 provider
      expect(apiTranslate.mock.calls[0][0].glossary).toEqual({
        Xyzzy: "构造旧值",
      });

      // 运行期推送新 aiTerms：#glossary 必须同步刷新，不得停留构造时旧值
      document.getElementById("target").textContent = "Xyzzy usage";
      translator.updateRule({ aiTerms: "Xyzzy,运行新值" });
      translator.rescan();
      await flushAsync();

      const lastCall = apiTranslate.mock.calls.at(-1)[0];
      expect(lastCall.glossary).toEqual({ Xyzzy: "运行新值" });
    });

    test("updateRule 显式传 terms/aiTerms: undefined 时解析状态与 #rule 保持一致（不留旧值）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      document.getElementById("target").textContent = "Xyzzy usage";

      const translator = createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "Xyzzy,本地哨兵",
          aiTerms: "Xyzzy,服务端哨兵",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 初始：本地术语替换为占位符、AI glossary 生效
      expect(apiTranslate.mock.calls[0][0].glossary).toEqual({
        Xyzzy: "服务端哨兵",
      });

      // 显式传 terms/aiTerms: undefined（如展开一个缺该 key 的 rule 对象）：
      // delta 循环会把 #rule.terms/#rule.aiTerms 置为 undefined，解析状态必须同步清空，
      // 不得停留在构造时旧值（历史缺陷：守卫用 !== undefined 会跳过重解析，导致解析状态残留）。
      document.getElementById("target").textContent = "Xyzzy usage";
      translator.updateRule({ terms: undefined, aiTerms: undefined });
      translator.rescan();
      await flushAsync();

      const lastCall = apiTranslate.mock.calls.at(-1)[0];
      // glossary 与 #rule.aiTerms 一致（已清空），不留旧值
      expect(lastCall.glossary).toEqual({});
      // 本地术语不再替换原文（#rule.terms 为空 → 无占位符）
      expect(lastCall.text).toContain("Xyzzy");
    });

    test("零宽臂术语真实链路：只有零宽分支可命中时，序列化产物无凭空占位符（统一计划 20260829 Task 6）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      // 文本含 x（满足 (?=x) 前瞻）但不含 a（a 臂无命中）：
      // 修复前零宽分支会逐位置注入译文并产生凭空占位符；修复后运行期守卫跳过零宽命中。
      document.getElementById("target").textContent = "xX finish line";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          // 混合臂 a|(?=x) 合法保留（含可消费原子 a）；纯零宽模式在静态层即被排除
          terms: "a|(?=x),Y",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 占位符只能对应真实消费的命中：零命中 → 零占位符，原文原样送译
      const requestedText = apiTranslate.mock.calls[0][0].text;
      expect(requestedText).toBe("xX finish line");
      expect(requestedText).not.toMatch(/\[\[\d+\]\]/);
      // 最终输出无零宽注入的译文 Y
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("xX finish line");
    });

    test("零宽臂术语真实链路：消费臂命中时占位符与真实命中一一对应（统一计划 20260829 Task 6）", async () => {
      apiTranslate.mockImplementation(({ text }) =>
        Promise.resolve({ trText: text, isSame: false })
      );
      document.body.innerHTML =
        '<main id="root"><span id="target"></span></main>';
      // 文本恰含一个 a（消费臂命中 1 次）与多处 x（零宽分支命中点，必须零产出）
      document.getElementById("target").textContent = "aX finish line x";

      createTranslator(
        {
          autoScan: "false",
          selector: "#target",
          apiSlug: "terms-test",
          terms: "a|(?=x),Y",
        },
        {
          minLength: 0,
          transApis: [
            { ...createApiSetting("terms-test"), placeholder: "[[ ]]" },
          ],
        }
      );
      await flushAsync();

      // 消费臂恰命中 1 次 → 恰 1 个占位符；零宽命中点不产生占位符
      const requestedText = apiTranslate.mock.calls[0][0].text;
      const placeholders = requestedText.match(/\[\[\d+\]\]/g) || [];
      expect(placeholders).toEqual(["[[1]]"]);
      expect(requestedText).toBe("[[1]]X finish line x");
      // 恢复后：真实命中被替换为译文，其余文本原样
      const inner = document.querySelector(`.${Translator.KISS_CLASS.inner}`);
      expect(inner.textContent).toBe("YX finish line x");
    });
  });
});
