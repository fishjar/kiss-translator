jest.mock("../apis", () => ({
  apiTranslate: jest.fn(),
}));

jest.mock("./msg", () => ({
  sendBgMsg: jest.fn(),
}));

const { apiTranslate } = require("../apis");
const { OPT_HIGHLIGHT_WORDS_BEFORETRANS } = require("../config/rules");
const { Translator } = require("./translator");

const flushAsync = async () => {
  jest.runOnlyPendingTimers();
  await Promise.resolve();
  await Promise.resolve();
};

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

function createTranslator(rule = {}, setting = {}, favWords = []) {
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
    favWords,
  });
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

    originalChrome = globalThis.chrome;
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
    global.CSSStyleSheet = originalCSSStyleSheet;
    window.scrollBy = originalScrollBy;
    globalThis.chrome = originalChrome;
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
});
