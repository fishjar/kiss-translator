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
    const viewAdd = jest.spyOn(document.defaultView, "addEventListener");
    try {
      installFocusModality(document);
      installFocusModality(document);
      // 首次安装挂 pointerdown/keydown/focusin 三个捕获监听加窗口 blur，
      // 重复安装幂等（blur 挂 window，与 document 侧分表计数）。
      expect(add).toHaveBeenCalledTimes(3);
      expect(viewAdd).toHaveBeenCalledTimes(1);
    } finally {
      add.mockRestore();
      viewAdd.mockRestore();
    }
  });

  test("pointer interaction silences focusin; browser re-entry keeps the ring", () => {
    installFocusModality(document);
    const box = document.createElement("div");
    box.className = "kt-m3-root";
    document.body.appendChild(box);
    const button = document.createElement("button");
    box.appendChild(button);
    try {
      // 焦点自浏览器界面重进：窗口失焦后无页面内指针交互，模态未知，
      // 不得静默焦点环。
      document.defaultView.dispatchEvent(new Event("blur"));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(button.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
      // 页面内真实指针交互之后：恢复静默。
      notePointerInteraction();
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(button.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    } finally {
      box.remove();
    }
  });

  test("window blur resets the pointer-interaction record", () => {
    installFocusModality(document);
    const box = document.createElement("div");
    box.className = "kt-m3-root";
    document.body.appendChild(box);
    const button = document.createElement("button");
    box.appendChild(button);
    try {
      notePointerInteraction();
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(button.hasAttribute(FOCUS_SILENT_ATTR)).toBe(true);
      button.removeAttribute(FOCUS_SILENT_ATTR);
      // 窗口失焦重置指针交互记录：回来第一跳保留焦点环。
      document.defaultView.dispatchEvent(new Event("blur"));
      button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      expect(button.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    } finally {
      box.remove();
    }
  });

  test("uninstall removes the window blur listener symmetrically", () => {
    const addDoc = jest.spyOn(document, "addEventListener");
    const addView = jest.spyOn(document.defaultView, "addEventListener");
    const removeDoc = jest.spyOn(document, "removeEventListener");
    const removeView = jest.spyOn(document.defaultView, "removeEventListener");
    try {
      installFocusModality(document);
      uninstallFocusModality(document);
      // document 侧三监听对称移除；window 侧 blur 以同 capture 标志与同
      // 函数引用配对移除。
      expect(removeDoc).toHaveBeenCalledTimes(3);
      expect(removeView).toHaveBeenCalledTimes(1);
      const blurAdd = addView.mock.calls.find(([type]) => type === "blur");
      const blurRemove = removeView.mock.calls.find(([type]) => type === "blur");
      expect(blurAdd).toBeDefined();
      expect(blurRemove).toBeDefined();
      expect(blurRemove[1]).toBe(blurAdd[1]);
      expect(blurRemove[2]).toBe(blurAdd[2]);
    } finally {
      addDoc.mockRestore();
      addView.mockRestore();
      removeDoc.mockRestore();
      removeView.mockRestore();
    }
  });

  test("Tab counts even from editable targets; space in a field does not", () => {
    // `new KeyboardEvent()` 无法经 init dict 携带 `target`（target 只读，
    // 由派发决定）。被测函数只读 event.key 与 event.target，故用普通对象
    // 即可驱动同样的分支语义。
    const field = document.createElement("input");
    document.body.appendChild(field);
    noteKeyboardInteraction({ key: " ", target: field });
    expect(isKeyboardModality()).toBe(false);
    noteKeyboardInteraction({ key: "Tab", target: field });
    expect(isKeyboardModality()).toBe(true);
    notePointerInteraction();
    // 非可编辑目标（body）上的可打印字符＝字符前缀导航键盘交互，翻入
    // 键盘态；普通打字的排除域仅限可编辑目标（见上方 space 断言与
    // typeahead 排除域用例）。非导航非打印键（F1 等）的旧契约由
    // "a non-navigation key keeps the marker" 用例承载。
    noteKeyboardInteraction({ key: "q", target: document.body });
    expect(isKeyboardModality()).toBe(true);
    field.remove();
  });

  test("missing or non-string event.key skips key classification without throwing", () => {
    // 非标准宿主可能派发缺失或非字符串 key 的事件：分类分支直接跳过，
    // 不得在读取 key.length 时抛错，也不得翻转模态。
    notePointerInteraction();
    expect(() =>
      noteKeyboardInteraction({ target: document.body })
    ).not.toThrow();
    expect(() =>
      noteKeyboardInteraction({ key: 13, target: document.body })
    ).not.toThrow();
    expect(isKeyboardModality()).toBe(false);
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

  // 非文本类型 INPUT 不得阻止 noteKeyboardInteraction 切换到键盘模态
  test("radio 接收 ArrowDown 时进入键盘模态，方向键驱动单选框焦点移动出环", () => {
    const radio = document.createElement("input");
    radio.type = "radio";
    document.body.appendChild(radio);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: radio });
    expect(isKeyboardModality()).toBe(true);
    radio.remove();
  });

  test("checkbox 接收 ArrowDown 时进入键盘模态", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: checkbox });
    expect(isKeyboardModality()).toBe(true);
    checkbox.remove();
  });

  test("range 接收 ArrowDown 时进入键盘模态", () => {
    const range = document.createElement("input");
    range.type = "range";
    document.body.appendChild(range);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: range });
    expect(isKeyboardModality()).toBe(true);
    range.remove();
  });

  test("文本类 INPUT 接收 ArrowDown 时不进入键盘模态（可编辑目标仍屏蔽导航键）", () => {
    const textInput = document.createElement("input");
    textInput.type = "text";
    document.body.appendChild(textInput);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: textInput });
    expect(isKeyboardModality()).toBe(false);
    textInput.remove();
  });

  test("TEXTAREA 接收 ArrowDown 时不进入键盘模态（可编辑目标仍屏蔽导航键）", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: textarea });
    expect(isKeyboardModality()).toBe(false);
    textarea.remove();
  });

  test("SELECT 接收 ArrowDown 时不进入键盘模态（可编辑目标仍屏蔽导航键）", () => {
    const select = document.createElement("select");
    document.body.appendChild(select);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: select });
    expect(isKeyboardModality()).toBe(false);
    select.remove();
  });

  test("未显式 type 的 INPUT 默认视为 text，接收 ArrowDown 时不进入键盘模态", () => {
    const defaultInput = document.createElement("input");
    document.body.appendChild(defaultInput);
    notePointerInteraction();
    noteKeyboardInteraction({ key: "ArrowDown", target: defaultInput });
    expect(isKeyboardModality()).toBe(false);
    defaultInput.remove();
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
    // 作用域契约：非扩展文档下仅 .kt-m3-root 下的扩展自有 UI 挂静默标记，
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
    // 显式 silent:true 仍挂标记，不得被 silent:false 用例顺带翻负。
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item, { silent: true })).toBe(true);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.remove();
  });

  test("does not silence scripted focus when pointer interaction is unknown", () => {
    // 契约：焦点自浏览器界面回到页面、模态未知时保留焦点环；
    // 只有页面内真实指针交互之后才允许静默（与 handleFocusIn 同判据）。
    installFocusModality(document);
    window.dispatchEvent(new Event("blur"));
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item)).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("element-level blur does not reset the pointer-interaction record", () => {
    // 契约：仅窗口自身失焦才算模态过期；文档内焦点移动的元素级 blur
    // 经 window 捕获路径同样可见，不得重置指针交互记录，否则指针打开
    // 的菜单会在聚焦选项前丢失静默标记。
    installFocusModality(document);
    notePointerInteraction();
    document.body.dispatchEvent(new FocusEvent("blur"));
    const item = document.createElement("button");
    document.body.appendChild(item);
    expect(scriptFocus(item)).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(true);
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
    // landed 为假时既不标记也不清除（游离元素路径）。
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
    // KEYBOARD_NAV_KEYS 之外且非可打印字符的键（如功能键）不得触发跃迁，
    // 更不得摘标记；可打印字符见下方 typeahead 契约用例。
    const item = document.createElement("button");
    document.body.appendChild(item);
    scriptFocus(item);
    noteKeyboardInteraction(key({ key: "F1", bubbles: true }));
    expect(isKeyboardModality()).toBe(false);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    item.remove();
  });

  test("a printable character (menu typeahead) lifts pointer silence", () => {
    // 字符前缀导航契约：menuFocus 的 typeahead 以裸 .focus() 移动焦点，
    // keydown 捕获段必须先行翻入键盘态并摘除指针静默标记，否则落点环
    // 被吞（指针打开菜单后按字母跳项即复现）。
    const item = document.createElement("button");
    document.body.appendChild(item);
    scriptFocus(item);
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    noteKeyboardInteraction(key({ key: "m", bubbles: true }));
    expect(isKeyboardModality()).toBe(true);
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    item.remove();
  });

  test("a printable character on an editable target keeps the pointer modality", () => {
    // 可编辑目标排除域：文本框内普通打字不得翻转模态（浏览器对其恒判
    // :focus-visible，翻转只会无谓扩大环的绘制面）。
    const input = document.createElement("input");
    document.body.appendChild(input);
    noteKeyboardInteraction({ key: "m", target: input });
    expect(isKeyboardModality()).toBe(false);
    input.remove();
  });

  test("repeated nav keys do not override an explicit silent:true", () => {
    // 只在 false→true 的那一次跃迁上清除；已在键盘态时的显式
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
    // 作用域契约：标记类用例的落点放进 .kt-m3-root 容器（宿主页面仅限
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

  test("leaves no marker on editable targets so text boxes keep their ring", () => {
    // 契约：可编辑目标不挂静默标记。浏览器对可编辑元素恒判 :focus-visible，
    // 通用抑制规则会吞掉其环；同容器命令类控件照常标记作正向对照。
    installFocusModality(document);
    const field = document.createElement("input");
    rootBox.appendChild(field);
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(field.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    const item = document.createElement("button");
    rootBox.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    field.remove();
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

  test("marks silent focus inside the subtitle menus mount on the host document", () => {
    // 契约：字幕菜单挂在宿主 YouTube 文档 #kiss-subtitle-menus（根 div 类
    // kt-subtitle-menus），M3Theme/State 的安装路径均不覆盖该文档；判据
    // 不含该挂载点时菜单内 focusin 全部跳过、静默标记缺失。
    installFocusModality(document);
    const menus = document.createElement("div");
    menus.className = "kt-subtitle-menus";
    document.body.appendChild(menus);
    const item = document.createElement("button");
    menus.appendChild(item);
    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(item.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");
    item.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);
    menus.remove();
  });

  test("unregistered root class name does not trigger silent modality", () => {
    // 防回归断言：清单外根类名（如 kt-unregistered-root）不触发
    // isExtensionUiEvent 返回 true，静默属性不落地。指针模态下验证（键盘模态
    // 会在更早的门上返回，断言会空转）；同用例以已登记根类名作正向对照。
    installFocusModality(document);
    const unregistered = document.createElement("div");
    unregistered.className = "kt-unregistered-root";
    const item = document.createElement("button");
    unregistered.appendChild(item);
    document.body.appendChild(unregistered);

    item.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    // 清单外根类名不触发静默：属性不应被设置。
    expect(item.hasAttribute(FOCUS_SILENT_ATTR)).toBe(false);

    const registered = document.createElement("div");
    registered.className = "kt-focus-silent-scope";
    const control = document.createElement("button");
    registered.appendChild(control);
    document.body.appendChild(registered);
    control.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(control.getAttribute(FOCUS_SILENT_ATTR)).toBe("true");

    unregistered.remove();
    registered.remove();
  });
});
