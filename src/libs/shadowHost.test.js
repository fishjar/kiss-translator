import {
  isolateShadowHost,
  isShadowHostMoving,
  disposeShadowHost,
  mountShadowHost,
  setShadowHostVisible,
  SHADOW_HOST_ATTRIBUTE,
} from "./shadowHost";

describe("Shadow host isolation", () => {
  test("uses author-inline important resets and preserves visibility control", () => {
    const host = document.createElement("div");

    expect(isolateShadowHost(host)).toBe(host);
    expect(host.hasAttribute(SHADOW_HOST_ATTRIBUTE)).toBe(true);
    expect(host.style.getPropertyValue("all")).toBe("initial");
    expect(host.style.getPropertyPriority("all")).toBe("important");
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
    expect(host.style.getPropertyValue("position")).toBe("absolute");
    expect(host.style.getPropertyPriority("position")).toBe("important");
    for (const property of ["top", "left", "width", "height"]) {
      expect(host.style.getPropertyValue(property)).toBe("0px");
      expect(host.style.getPropertyPriority(property)).toBe("important");
    }
    expect(host.style.getPropertyValue("z-index")).toBe("");
    expect(host.style.getPropertyValue("transform")).toBe("");
    expect(host.style.getPropertyValue("direction")).toBe("ltr");
    expect(host.style.getPropertyPriority("direction")).toBe("important");
    expect(host.style.getPropertyValue("unicode-bidi")).toBe("normal");
    expect(host.style.getPropertyPriority("unicode-bidi")).toBe("important");

    setShadowHostVisible(host, false);
    expect(host.style.getPropertyValue("display")).toBe("none");
    expect(host.style.getPropertyPriority("display")).toBe("important");

    setShadowHostVisible(host, true);
    expect(host.style.getPropertyValue("display")).toBe("block");
    expect(host.style.getPropertyPriority("display")).toBe("important");
  });
});

describe("Shadow host fullscreen roots", () => {
  let fullscreenElement;
  let originalFullscreen;
  let hosts;
  let cleanupMounts;
  let pageElements;

  beforeEach(() => {
    fullscreenElement = null;
    originalFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement"
    );
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    hosts = [];
    cleanupMounts = [];
    pageElements = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    cleanupMounts.forEach((cleanup) => cleanup());
    hosts.forEach((host) => host.remove());
    pageElements.forEach((element) => element.remove());
    if (originalFullscreen) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreen);
    } else {
      delete document.fullscreenElement;
    }
  });

  function addPageElement(tagName = "section") {
    const element = document.createElement(tagName);
    document.body.appendChild(element);
    pageElements.push(element);
    return element;
  }

  function mount(rootElement, options) {
    const host = isolateShadowHost(document.createElement("div"));
    hosts.push(host);
    cleanupMounts.push(mountShadowHost(host, rootElement, options));
    return host;
  }

  function enterFullscreen(element) {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  }

  test.each(["input", "textarea", "select"])(
    "protects nested shadow %s editing from fullscreen player hotkeys",
    (tagName) => {
      const player = addPageElement();
      const host = mount();
      const nestedHost = document.createElement("div");
      host.attachShadow({ mode: "open" }).appendChild(nestedHost);
      const input = document.createElement(tagName);
      nestedHost.attachShadow({ mode: "open" }).appendChild(input);
      enterFullscreen(player);
      input.focus();
      expect(document.activeElement).toBe(host);

      const playerHotkey = jest.fn((event) => {
        // Players cannot recognize an input from the retargeted active element.
        if (!document.activeElement.matches("input, textarea, select")) {
          event.preventDefault();
        }
      });
      const inputHandler = jest.fn();
      const captureShortcut = jest.fn();
      const eventTypes = ["keydown", "keypress", "keyup"];
      eventTypes.forEach((type) => {
        player.addEventListener(type, playerHotkey);
        input.addEventListener(type, inputHandler);
        window.addEventListener(type, captureShortcut, true);
      });

      try {
        for (const type of eventTypes) {
          for (const key of [" ", "k", "m", "f"]) {
            const event = new KeyboardEvent(type, {
              key,
              bubbles: true,
              composed: true,
              cancelable: true,
            });
            input.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
          }
        }
        expect(inputHandler).toHaveBeenCalledTimes(12);
        expect(captureShortcut).toHaveBeenCalledTimes(12);
        expect(playerHotkey).not.toHaveBeenCalled();

        // Ordinary player controls and non-editing extension content keep their
        // existing keyboard behavior instead of losing all page shortcuts.
        for (const parent of [player, host.shadowRoot]) {
          const button = document.createElement("button");
          parent.appendChild(button);
          button.focus();
          const event = new KeyboardEvent("keydown", {
            key: "f",
            bubbles: true,
            composed: true,
            cancelable: true,
          });
          button.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
        }
        expect(playerHotkey).toHaveBeenCalledTimes(2);
      } finally {
        eventTypes.forEach((type) => {
          window.removeEventListener(type, captureShortcut, true);
        });
      }
    }
  );

  test.each(["keydown", "keypress", "keyup"])(
    "%s isolation ends on fullscreen exit and host disposal",
    (type) => {
      const player = addPageElement();
      const host = mount();
      const input = document.createElement("textarea");
      host.attachShadow({ mode: "open" }).appendChild(input);
      const pageShortcut = jest.fn();
      document.addEventListener(type, pageShortcut);
      const press = () => {
        input.dispatchEvent(
          new KeyboardEvent(type, {
            key: "m",
            bubbles: true,
            composed: true,
          })
        );
      };

      try {
        press();
        expect(pageShortcut).toHaveBeenCalledTimes(1);
        enterFullscreen(player);
        press();
        expect(pageShortcut).toHaveBeenCalledTimes(1);
        enterFullscreen(null);
        press();
        expect(pageShortcut).toHaveBeenCalledTimes(2);
        enterFullscreen(player);
        disposeShadowHost(host);
        press();
        expect(pageShortcut).toHaveBeenCalledTimes(3);
      } finally {
        document.removeEventListener(type, pageShortcut);
      }
    }
  );

  function addDynamicStyle(root, rules) {
    const element = document.createElement("style");
    root.appendChild(element);
    let sheet;
    const reset = (nextRules) => {
      sheet = new CSSStyleSheet();
      nextRules.forEach((rule, index) => sheet.insertRule(rule, index));
    };
    reset(rules);
    // jsdom does not recreate shadow stylesheets when their host moves.
    Object.defineProperty(element, "sheet", { get: () => sheet });
    return {
      element,
      reset,
      read: () => Array.from(sheet.cssRules, (rule) => rule.cssText),
    };
  }

  test.each(["unavailable", "rejected"])(
    "preserves nested editing state when a native fullscreen exit move is %s",
    (nativeMove) => {
      const host = mount();
      const shadowRoot = host.attachShadow({ mode: "open" });
      const scroller = document.createElement("div");
      shadowRoot.appendChild(scroller);
      const nestedRoot = scroller.attachShadow({ mode: "open" });
      const input = document.createElement("textarea");
      input.value = "unsubmitted draft";
      nestedRoot.appendChild(input);
      enterFullscreen(document.body);
      input.focus();
      input.setSelectionRange(2, 8, "backward");
      input.scrollTop = 27;
      input.scrollLeft = 11;
      scroller.scrollTop = 71;

      const commit = jest.fn();
      input.addEventListener("blur", () => {
        if (!isShadowHostMoving(input)) commit(input.value);
      });
      const focus = jest.spyOn(input, "focus");
      const target = document.documentElement;
      const originalMove = Object.getOwnPropertyDescriptor(
        target,
        "moveBefore"
      );
      const moveBefore =
        nativeMove === "rejected"
          ? jest.fn(() => {
              throw new DOMException("Unsupported root transition");
            })
          : undefined;
      Object.defineProperty(target, "moveBefore", {
        configurable: true,
        value: moveBefore,
      });
      const appendChild = target.appendChild;
      jest.spyOn(target, "appendChild").mockImplementation((node) => {
        expect(isShadowHostMoving(input)).toBe(true);
        expect(isShadowHostMoving(document.body)).toBe(false);
        // jsdom removes focus without emitting the browser's synchronous blur.
        input.blur();
        input.setSelectionRange(0, 0);
        input.scrollTop = 0;
        input.scrollLeft = 0;
        scroller.scrollTop = 0;
        return appendChild.call(target, node);
      });

      try {
        enterFullscreen(null);

        expect(host.parentNode).toBe(target);
        expect(document.activeElement).toBe(host);
        expect(nestedRoot.activeElement).toBe(input);
        expect(input.value).toBe("unsubmitted draft");
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(8);
        expect(input.selectionDirection).toBe("backward");
        expect(input.scrollTop).toBe(27);
        expect(input.scrollLeft).toBe(11);
        expect(scroller.scrollTop).toBe(71);
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
        expect(commit).not.toHaveBeenCalled();
        expect(isShadowHostMoving(input)).toBe(false);
        if (moveBefore) expect(moveBefore).toHaveBeenCalledWith(host, null);

        input.blur();
        expect(commit).toHaveBeenCalledWith("unsubmitted draft");
      } finally {
        if (originalMove) {
          Object.defineProperty(target, "moveBefore", originalMove);
        } else {
          delete target.moveBefore;
        }
      }
    }
  );

  test("does not restore focus from outside the moving host", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("textarea");
    shadowRoot.appendChild(input);
    const outside = addPageElement("button");
    outside.focus();
    const focus = jest.spyOn(input, "focus");
    const section = addPageElement();
    section.moveBefore = undefined;

    enterFullscreen(section);

    expect(document.activeElement).toBe(outside);
    expect(focus).not.toHaveBeenCalled();
    expect(isShadowHostMoving(input)).toBe(false);
  });

  test("restores CSSOM rules on the same style nodes after fallback reparenting", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = addDynamicStyle(shadowRoot, [
      ".panel { position: fixed; }",
      ".panel { color: red; }",
    ]);
    const nestedHost = document.createElement("div");
    shadowRoot.appendChild(nestedHost);
    const nestedRoot = nestedHost.attachShadow({ mode: "open" });
    const globalStyle = addDynamicStyle(nestedRoot, [
      "@keyframes progress { from { opacity: 0; } to { opacity: 1; } }",
    ]);
    const input = document.createElement("input");
    input.value = "keep component state";
    shadowRoot.appendChild(input);
    const originalRules = style.read();
    const originalGlobalRules = globalStyle.read();
    const section = addPageElement();
    section.moveBefore = undefined;
    const appendChild = section.appendChild;
    jest.spyOn(section, "appendChild").mockImplementation((node) => {
      const result = appendChild.call(section, node);
      style.reset([]);
      globalStyle.reset([]);
      return result;
    });

    enterFullscreen(section);

    expect(host.parentNode).toBe(section);
    expect(style.read()).toEqual(originalRules);
    expect(globalStyle.read()).toEqual(originalGlobalRules);
    expect(shadowRoot.querySelector("style")).toBe(style.element);
    expect(nestedRoot.querySelector("style")).toBe(globalStyle.element);
    expect(style.element.textContent).toBe("");
    expect(input.value).toBe("keep component state");

    enterFullscreen(null);
    expect(host.parentNode).toBe(document.documentElement);
    expect(style.read()).toEqual(originalRules);
    expect(globalStyle.read()).toEqual(originalGlobalRules);
  });

  test("merges surviving and new CSSOM rules without losing duplicate order", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = addDynamicStyle(shadowRoot, [
      ".repeat { color: red; }",
      ".middle { color: green; }",
      ".repeat { color: red; }",
    ]);
    const originalRules = style.read();
    const section = addPageElement();
    section.moveBefore = undefined;
    const appendChild = section.appendChild;
    let insertedRule;
    jest.spyOn(section, "appendChild").mockImplementation((node) => {
      const result = appendChild.call(section, node);
      style.reset([originalRules[1], ".new { color: blue; }"]);
      insertedRule = style.read()[1];
      return result;
    });

    enterFullscreen(section);

    expect(style.read()).toEqual([...originalRules, insertedRule]);
    const currentSheet = style.element.sheet;
    const insertRule = jest.spyOn(currentSheet, "insertRule");
    enterFullscreen(null);
    expect(style.element.sheet).toBe(currentSheet);
    expect(insertRule).not.toHaveBeenCalled();
    expect(style.read()).toEqual([...originalRules, insertedRule]);
  });

  test("does not restore styles moved outside the host during reconnection", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = addDynamicStyle(shadowRoot, [".private { color: red; }"]);
    const section = addPageElement();
    section.moveBefore = undefined;
    const appendChild = section.appendChild;
    jest.spyOn(section, "appendChild").mockImplementation((node) => {
      const result = appendChild.call(section, node);
      document.head.appendChild(style.element);
      pageElements.push(style.element);
      style.reset([]);
      return result;
    });

    enterFullscreen(section);

    expect(style.element.parentNode).toBe(document.head);
    expect(style.read()).toEqual([]);
  });

  test("preserves CSSOM rules when the target supports a native move", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = addDynamicStyle(shadowRoot, [".panel { color: red; }"]);
    const originalRules = style.read();
    const input = document.createElement("textarea");
    shadowRoot.appendChild(input);
    input.focus();
    const focus = jest.spyOn(input, "focus");
    const section = addPageElement();
    section.moveBefore = jest.fn((node, reference) => {
      expect(reference).toBeNull();
      expect(isShadowHostMoving(input)).toBe(false);
      Element.prototype.appendChild.call(section, node);
      style.reset([]);
    });
    const appendChild = jest.spyOn(section, "appendChild");

    enterFullscreen(section);

    expect(section.moveBefore).toHaveBeenCalledWith(host, null);
    expect(appendChild).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(host.parentNode).toBe(section);
    expect(style.read()).toEqual(originalRules);
  });

  test("restores CSSOM rules when a native move rejects the root transition", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const style = addDynamicStyle(shadowRoot, [".panel { color: red; }"]);
    const originalRules = style.read();
    const section = addPageElement();
    section.moveBefore = jest.fn(() => {
      throw new DOMException(
        "Unsupported root transition",
        "HierarchyRequestError"
      );
    });
    const appendChild = section.appendChild;
    jest.spyOn(section, "appendChild").mockImplementation((node) => {
      const result = appendChild.call(section, node);
      style.reset([]);
      return result;
    });

    enterFullscreen(section);

    expect(section.moveBefore).toHaveBeenCalledWith(host, null);
    expect(host.parentNode).toBe(section);
    expect(style.read()).toEqual(originalRules);
  });

  test("moves the same isolated host through body and element fullscreen", () => {
    const host = mount();
    const shadowRoot = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    shadowRoot.appendChild(input);
    input.value = "keep this value";
    const section = addPageElement();

    expect(host.parentElement).toBe(document.documentElement);
    for (const target of [
      document.body,
      section,
      document.documentElement,
      null,
    ]) {
      enterFullscreen(target);
      expect(host.parentElement).toBe(target || document.documentElement);
      expect(host.shadowRoot.firstChild).toBe(input);
      expect(input.value).toBe("keep this value");
      expect(host.style.getPropertyValue("all")).toBe("initial");
      expect(host.style.getPropertyPriority("all")).toBe("important");
    }
  });

  test("uses an existing fullscreen root and follows nested shadow fullscreen", () => {
    const outer = addPageElement("div");
    const shadowRoot = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("section");
    shadowRoot.appendChild(inner);
    Object.defineProperty(shadowRoot, "fullscreenElement", {
      configurable: true,
      value: inner,
    });
    fullscreenElement = outer;

    const host = mount();
    expect(host.parentNode).toBe(inner);
    expect(host.isConnected).toBe(true);

    enterFullscreen(null);
    expect(host.parentElement).toBe(document.documentElement);
  });

  test("mounts in the rendered shadow tree when its host enters fullscreen", () => {
    const fullscreenHost = addPageElement("div");
    const shadowRoot = fullscreenHost.attachShadow({ mode: "open" });
    const content = document.createElement("p");
    content.textContent = "Fullscreen content without a slot";
    shadowRoot.appendChild(content);
    enterFullscreen(fullscreenHost);

    const host = mount();
    expect(host.parentNode).toBe(shadowRoot);
    expect(host.isConnected).toBe(true);
    expect(fullscreenHost.childNodes.length).toBe(0);

    enterFullscreen(null);
    expect(host.parentElement).toBe(document.documentElement);
    expect(shadowRoot.firstChild).toBe(content);
  });

  test("reconciles prefixed fullscreen transitions and removes their listeners", () => {
    const originalWebkitFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "webkitFullscreenElement"
    );
    let webkitFullscreenElement = document.body;
    Object.defineProperty(document, "webkitFullscreenElement", {
      configurable: true,
      get: () => webkitFullscreenElement,
    });

    try {
      const host = mount();
      expect(host.parentElement).toBe(document.body);
      webkitFullscreenElement = null;
      document.dispatchEvent(new Event("webkitfullscreenchange"));
      expect(host.parentElement).toBe(document.documentElement);

      cleanupMounts[0]();
      webkitFullscreenElement = document.body;
      document.dispatchEvent(new Event("webkitfullscreenchange"));
      expect(host.parentElement).toBe(document.documentElement);
    } finally {
      if (originalWebkitFullscreen) {
        Object.defineProperty(
          document,
          "webkitFullscreenElement",
          originalWebkitFullscreen
        );
      } else {
        delete document.webkitFullscreenElement;
      }
    }
  });

  test.each(["video", "iframe", "canvas", "img", "input", "object"])(
    "does not inject children into a fullscreen %s element",
    (tagName) => {
      const host = mount();
      const target = addPageElement(tagName);
      enterFullscreen(target);

      expect(host.parentElement).toBe(document.documentElement);
      expect(target.childNodes.length).toBe(0);
    }
  );

  test("keeps explicit roots fixed, including an explicit document root", () => {
    const customRoot = addPageElement();
    const customHost = mount(customRoot);
    const documentHost = mount(document.documentElement);

    enterFullscreen(document.body);
    expect(customHost.parentElement).toBe(customRoot);
    expect(documentHost.parentElement).toBe(document.documentElement);
  });

  test("restores an active host removed by fullscreen content replacement", () => {
    const section = addPageElement();
    enterFullscreen(section);
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    expect(onReconnect).not.toHaveBeenCalled();
    section.replaceChildren(document.createElement("p"));

    enterFullscreen(null);
    expect(host.parentNode).toBe(document.documentElement);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    enterFullscreen(section);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("retiring a host prevents recovery and releases its event listeners", () => {
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    disposeShadowHost(host);
    host.remove();

    enterFullscreen(document.body);
    expect(host.isConnected).toBe(false);
    expect(onReconnect).not.toHaveBeenCalled();
    expect(host.getAttribute(SHADOW_HOST_ATTRIBUTE)).toBe("disposed");

    // Even an already queued event callback must stay inactive after disposal.
    document.documentElement.appendChild(host);
    enterFullscreen(document.body);
    expect(host.parentNode).toBe(document.documentElement);
  });

  test("recovers fullscreen content removed and reinserted within one task", async () => {
    const section = addPageElement();
    enterFullscreen(section);
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    section.remove();
    document.body.appendChild(section);

    await Promise.resolve();

    expect(host.parentNode).toBe(section);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("restores fullscreen content immediately without waiting for exit", async () => {
    const section = addPageElement();
    enterFullscreen(section);
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    section.replaceChildren();

    await Promise.resolve();

    expect(host.parentNode).toBe(section);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    enterFullscreen(null);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("cleanup cancels recovery queued by a fullscreen content removal", async () => {
    const section = addPageElement();
    enterFullscreen(section);
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    section.replaceChildren();
    disposeShadowHost(host);

    await Promise.resolve();

    expect(host.isConnected).toBe(false);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  test("stops root reconciliation after cleanup", () => {
    const host = mount();
    cleanupMounts[0]();
    host.remove();

    enterFullscreen(document.body);
    expect(host.isConnected).toBe(false);
  });

  test("restores hosts when their fullscreen ancestor is removed", () => {
    const section = addPageElement();
    enterFullscreen(section);
    const onReconnect = jest.fn();
    const host = mount(undefined, { onReconnect });
    section.remove();

    enterFullscreen(null);
    expect(host.isConnected).toBe(true);
    expect(host.parentElement).toBe(document.documentElement);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
