import {
  FOCUS_SILENT_ATTR,
  installFocusModality,
  isKeyboardModality,
  markSilentFocus,
  noteKeyboardInteraction,
  notePointerInteraction,
  scriptFocus,
  uninstallFocusModality,
} from "./focusModality";

const key = (init) => new KeyboardEvent("keydown", init);

beforeEach(() => {
  notePointerInteraction(); // reset modality to pointer before each test
});

afterEach(() => {
  uninstallFocusModality();
  notePointerInteraction();
});

describe("focus modality store", () => {
  test("defaults to pointer so scripted focus is silent by default", () => {
    expect(isKeyboardModality()).toBe(false);
  });

  test("pointerdown capture clears keyboard modality", () => {
    installFocusModality(document);
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    document.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );
    expect(isKeyboardModality()).toBe(false);
  });

  test("listeners are installed once per document", () => {
    const add = jest.spyOn(document, "addEventListener");
    try {
      installFocusModality(document);
      installFocusModality(document);
      // 首次安装挂 pointerdown/keydown/focusin 三个捕获监听，重复安装幂等。
      expect(add).toHaveBeenCalledTimes(3);
    } finally {
      add.mockRestore();
    }
  });

  test("Tab counts even from editable targets; space in a field does not", () => {
    // Fact-Supremacy fix: `new KeyboardEvent()` cannot carry `target` via the
    // init dict (target is readonly and derived from dispatch). The function
    // only reads event.key and event.target, so a plain object exercises the
    // same branch semantics.
    const field = document.createElement("input");
    document.body.appendChild(field);
    noteKeyboardInteraction({ key: " ", target: field });
    expect(isKeyboardModality()).toBe(false);
    noteKeyboardInteraction({ key: "Tab", target: field });
    expect(isKeyboardModality()).toBe(true);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "q", target: document.body });
    expect(isKeyboardModality()).toBe(false);
    field.remove();
  });

  test("Escape closes via keyboard modality; Escape inside editable targets does not", () => {
    installFocusModality(document);
    document.dispatchEvent(key({ key: "Escape", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    notePointerInteraction();
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.dispatchEvent(key({ key: "Escape", bubbles: true }));
    expect(isKeyboardModality()).toBe(false);
    field.remove();
  });

  test("installs listeners independently per document", () => {
    const secondDoc = document.implementation.createHTMLDocument("second");
    installFocusModality(document);
    installFocusModality(secondDoc);
    // 第二个 document 安装不得静默摘掉第一个 document 的监听。
    secondDoc.dispatchEvent(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    document.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );
    expect(isKeyboardModality()).toBe(false);
    document.dispatchEvent(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    secondDoc.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );
    expect(isKeyboardModality()).toBe(false);
  });

  test("repeat install on any document stays idempotent", () => {
    const secondDoc = document.implementation.createHTMLDocument("second");
    const addMain = jest.spyOn(document, "addEventListener");
    const addSecond = jest.spyOn(secondDoc, "addEventListener");
    try {
      installFocusModality(document);
      installFocusModality(document);
      installFocusModality(secondDoc);
      installFocusModality(secondDoc);
      expect(addMain).toHaveBeenCalledTimes(3);
      expect(addSecond).toHaveBeenCalledTimes(3);
    } finally {
      addMain.mockRestore();
      addSecond.mockRestore();
    }
  });

  test("uninstallFocusModality() clears every document", () => {
    const secondDoc = document.implementation.createHTMLDocument("second");
    installFocusModality(document);
    installFocusModality(secondDoc);
    expect(uninstallFocusModality()).toBe(true);
    document.dispatchEvent(key({ key: "Tab", bubbles: true }));
    secondDoc.dispatchEvent(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(false);
  });

  test("uninstallFocusModality(doc) clears only that document", () => {
    const secondDoc = document.implementation.createHTMLDocument("second");
    installFocusModality(document);
    installFocusModality(secondDoc);
    expect(uninstallFocusModality(secondDoc)).toBe(true);
    secondDoc.dispatchEvent(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(false);
    document.dispatchEvent(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
  });
});

describe("shadow DOM composed-path resolution", () => {
  // shadow 组合事件冒泡出根后，文档级监听器的 event.target 被重定向为
  // shadow host；真实落点只能从 composedPath()[0] 取。这里用原型桩模拟
  // 重定向：composedPath 返回内部元素，而派发落点（target）为宿主。
  let rootBox;
  beforeEach(() => {
    // 1c 作用域契约：非扩展文档下仅 .kt-m3-root 下的扩展自有 UI 挂静默标记，
    // focusin 标记类用例的落点一律放进 kt-m3-root 容器。
    rootBox = document.createElement("div");
    rootBox.className = "kt-m3-root";
    document.body.appendChild(rootBox);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rootBox?.remove();
  });

  test("marks silent focus when the M3 root lives inside the shadow root", () => {
    installFocusModality(document);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const shadowBox = document.createElement("div");
    shadowBox.className = "kt-m3-root";
    shadowRoot.appendChild(shadowBox);
    const inner = document.createElement("button");
    shadowBox.appendChild(inner);
    const spy = jest
      .spyOn(Event.prototype, "composedPath")
      .mockReturnValue([inner, shadowBox, shadowRoot, host]);

    // At the document capture listener, a composed focusin is retargeted to host;
    // the real production node remains available through composedPath()[0].
    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(spy).toHaveBeenCalled();
    expect(inner.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    expect(host.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    host.remove();
  });

  test("does not mark a shadow target when its composed path has no M3 root", () => {
    installFocusModality(document);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadowRoot.appendChild(inner);
    jest
      .spyOn(Event.prototype, "composedPath")
      .mockReturnValue([inner, shadowRoot, host]);

    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(inner.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    host.remove();
  });

  test("marks silent focus on the real target inside a light-root shadow tree", () => {
    installFocusModality(document);
    const host = document.createElement("div");
    const inner = document.createElement("button");
    rootBox.appendChild(host);
    const spy = jest
      .spyOn(Event.prototype, "composedPath")
      .mockReturnValue([inner, host, rootBox]);
    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(spy).toHaveBeenCalled();
    expect(inner.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    expect(host.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    host.remove();
  });

  test("shadow-redirected focusin leaves no marker under keyboard modality", () => {
    installFocusModality(document);
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    const host = document.createElement("div");
    const inner = document.createElement("button");
    rootBox.appendChild(host);
    jest.spyOn(Event.prototype, "composedPath").mockReturnValue([inner]);
    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(inner.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    expect(host.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    host.remove();
  });

  test("falls back to event.target when composedPath is absent", () => {
    installFocusModality(document);
    const host = document.createElement("button");
    rootBox.appendChild(host);
    // composedPath 返回空数组时 [0] 为 undefined，须退化为 event.target。
    jest.spyOn(Event.prototype, "composedPath").mockReturnValue([]);
    host.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(host.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    host.remove();
  });

  test("keyboard nav inside a shadow-textarea host does not set keyboard modality", () => {
    const host = document.createElement("div");
    const textarea = document.createElement("textarea");
    // 可编辑判定必须看真实落点（composedPath[0]），而不是被重定向的 host。
    noteKeyboardInteraction({
      key: " ",
      target: host,
      composedPath: () => [textarea],
    });
    expect(isKeyboardModality()).toBe(false);
    noteKeyboardInteraction({
      key: "ArrowDown",
      target: host,
      composedPath: () => [textarea],
    });
    expect(isKeyboardModality()).toBe(false);
  });
});

describe("scriptFocus", () => {
  test("silences scripted focus under pointer modality and clears on focusout", () => {
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item)).toBe(true);
    expect(document.activeElement).toBe(item);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("leaves no marker under keyboard modality", () => {
    noteKeyboardInteraction(key({ key: "ArrowDown", bubbles: true }));
    const item = document.createElement("button");
    document.body.appendChild(item);
    scriptFocus(item);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("leaves no marker when focus() never lands (detached element)", () => {
    const button = document.createElement("button");
    // 游离元素：focus() 不落焦、focusin 不派发、focusout 永不发生，
    // 无条件标记会留下永不清理的 data-kt-focus-silent。
    expect(scriptFocus(button)).toBe(true);
    expect(button.getAttribute(FOCUS_SILENT_ATTR)).toBeNull();
  });

  test("tolerates missing elements and plain focus() targets", () => {
    expect(scriptFocus(null)).toBe(false);
    expect(scriptFocus(undefined)).toBe(false);
    expect(scriptFocus({})).toBe(false);
    expect(markSilentFocus(null)).toBe(false);
  });

  test("does not stack duplicate focusout listeners", () => {
    const item = document.createElement("button");
    document.body.appendChild(item);
    markSilentFocus(item);
    markSilentFocus(item);
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("drops a stale silent marker when silent:false focus lands", () => {
    // 契约：silent:false 是调用方对"本次聚焦必须出环"的显式声明，
    // 遗留标记必须当场失效，否则声明被无声吞掉。
    const item = document.createElement("button");
    document.body.appendChild(item);
    markSilentFocus(item);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    expect(scriptFocus(item, { silent: false })).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("keeps silent:true semantics for the same element", () => {
    // 不该触发域反例：显式 silent:true 仍按旧口径标记，不得被 :false 修复顺带翻负。
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item, { silent: true })).toBe(true);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.remove();
  });

  test("a silent:false focus on an unmarked element stays unmarked", () => {
    // 退化输入语义：无标记可移除时为空操作，不得抛错、不得反向标记。
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item, { silent: false })).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("never touches the marker when focus does not land", () => {
    // 不该触发域：landed 为假时既不标记也不清除（游离元素路径）。
    const detached = document.createElement("button");
    markSilentFocus(detached);
    expect(scriptFocus(detached, { silent: false })).toBe(true);
    expect(detached.hasAttribute(FOCUS_SILENT_ATTR)).toBe(true);
    expect(scriptFocus(detached, { silent: true })).toBe(true);
    expect(detached.hasAttribute(FOCUS_SILENT_ATTR)).toBe(true);
  });
});

describe("silent marker clearance on keyboard modality transition", () => {
  test("an arrow key after a pointer-silent focus removes the marker", () => {
    // 契约：模态进入键盘态后 :focus-visible 必须可绘，标记残留即违宪。
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item)).toBe(true);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    noteKeyboardInteraction(key({ key: "ArrowDown", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("Tab clears the marker on the element that currently holds focus", () => {
    const item = document.createElement("button");
    document.body.appendChild(item);
    scriptFocus(item);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("reaches through the shadow host to clear the real active element", () => {
    // 生产拓扑：真实落点在 shadowRoot 内，document.activeElement 只到宿主；
    // 不下钻就摘不到标记，键盘环永久缺席。
    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadowRoot.appendChild(inner);
    // jsdom 不保证实现 ShadowRoot.activeElement，按盘面事实定点桩。
    Object.defineProperty(shadowRoot, "activeElement", {
      value: inner,
      configurable: true,
    });
    const activeSpy = jest
      .spyOn(document, "activeElement", "get")
      .mockReturnValue(host);
    try {
      markSilentFocus(inner);
      expect(inner.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
      noteKeyboardInteraction(key({ key: "ArrowDown", bubbles: true }));
      expect(inner.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
      expect(host.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    } finally {
      activeSpy.mockRestore();
      host.remove();
    }
  });

  test("a non-navigation key keeps the marker and the pointer modality", () => {
    // 不该触发域：KEYBOARD_NAV_KEYS 之外的键不得触发跃迁，更不得摘标记。
    const item = document.createElement("button");
    document.body.appendChild(item);
    scriptFocus(item);
    noteKeyboardInteraction(key({ key: "a", bubbles: true }));
    expect(isKeyboardModality()).toBe(false);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    item.remove();
  });

  test("repeated nav keys do not override an explicit silent:true", () => {
    // 不该触发域：只在 false→true 的那一次跃迁上清除；已在键盘态时的显式
    // 抑制是调用方权利，不得被后续按键反复覆盖。
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item, { silent: true })).toBe(true);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    noteKeyboardInteraction(key({ key: "ArrowDown", bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("an event without a resolvable document still flips modality safely", () => {
    // 退化输入语义：ownerDocument 解析不出时只翻模态，不抛错。
    expect(() => noteKeyboardInteraction({ key: "ArrowDown" })).not.toThrow();
    expect(isKeyboardModality()).toBe(true);
  });
});

describe("document-level focusin handling", () => {
  let rootBox;
  beforeEach(() => {
    // 1c 作用域契约：标记类用例的落点放进 .kt-m3-root 容器（宿主页面仅限
    // 扩展自有 UI 挂静默标记）。
    rootBox = document.createElement("div");
    rootBox.className = "kt-m3-root";
    document.body.appendChild(rootBox);
  });
  afterEach(() => {
    rootBox?.remove();
  });

  test("marks silent focus on focusin under pointer modality", () => {
    installFocusModality(document);
    const item = document.createElement("button");
    rootBox.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.remove();
  });

  test("leaves no marker on focusin under keyboard modality", () => {
    installFocusModality(document);
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    const item = document.createElement("button");
    rootBox.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("removes the marker on focusout after focusin silence", () => {
    installFocusModality(document);
    const item = document.createElement("button");
    rootBox.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(true);
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("pointerdown after Tab clears modality so a later focusin stays silent", () => {
    installFocusModality(document);
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    document.dispatchEvent(
      new Event("pointerdown", { bubbles: true, cancelable: true })
    );
    const item = document.createElement("button");
    rootBox.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.remove();
  });

  test("focusin outside .kt-m3-root in a non-extension document stays unmarked", () => {
    installFocusModality(document);
    const outsider = document.createElement("button");
    document.body.appendChild(outsider);
    outsider.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(outsider.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    outsider.remove();
  });

  test("installing twice on the same document keeps one focusin handler", () => {
    const add = jest.spyOn(document, "addEventListener");
    try {
      installFocusModality(document);
      installFocusModality(document);
      const focusInAdds = add.mock.calls.filter(([type]) => type === "focusin");
      expect(focusInAdds).toHaveLength(1);
    } finally {
      add.mockRestore();
    }
  });

  test("marks silent focus inside .kt-focus-silent-scope (non-M3 self-themed domain)", () => {
    installFocusModality(document);
    const scope = document.createElement("div");
    scope.className = "kt-focus-silent-scope";
    document.body.appendChild(scope);
    const item = document.createElement("button");
    scope.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    scope.remove();
  });

  test("leaves no marker on .kt-focus-silent-scope targets under keyboard modality", () => {
    installFocusModality(document);
    noteKeyboardInteraction(key({ key: "Tab", bubbles: true }));
    const scope = document.createElement("div");
    scope.className = "kt-focus-silent-scope";
    document.body.appendChild(scope);
    const item = document.createElement("button");
    scope.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    scope.remove();
  });
});
