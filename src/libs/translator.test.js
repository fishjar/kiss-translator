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
});
