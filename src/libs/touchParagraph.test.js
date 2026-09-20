import { TouchParagraph, isTouchExcluded } from "./touchParagraph";

const pointer = (
  node,
  type,
  x = 100,
  y = 100,
  id = 1,
  pointerType = "touch"
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    composed: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: pointerType },
  });
  node.dispatchEvent(event);
};

describe("touch paragraph gestures", () => {
  let controller, node, toggle, originalPointer;
  beforeEach(() => {
    jest.useFakeTimers();
    originalPointer = window.PointerEvent;
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 2,
    });
    window.PointerEvent = MouseEvent;
    document.body.innerHTML = '<p id="text">Paragraph</p>';
    node = document.querySelector("p");
    toggle = jest.fn(() => true);
    controller = new TouchParagraph({ resolve: () => node, toggle });
  });
  afterEach(() => {
    controller.destroy();
    window.PointerEvent = originalPointer;
    jest.useRealTimers();
  });

  test("ignores non-element candidates", () => {
    controller.setMode("swipe");
    for (const candidate of [
      null,
      node.firstChild,
      document.createDocumentFragment(),
    ]) {
      expect(() => controller.observe(candidate)).not.toThrow();
    }
  });

  test("form containers allow ordinary article text", () => {
    const form = document.createElement("form");
    document.body.appendChild(form);
    form.appendChild(node);
    expect(isTouchExcluded(node)).toBe(false);
  });

  test("Pointer Events alone do not enable touch mode", () => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 0,
    });
    controller.setMode("tap");
    expect(controller.mode).toBe("off");
  });

  test.each(["tap", "swipe"])(
    "accepts %s and suppresses only its compatible click",
    (mode) => {
      controller.setMode(mode);
      controller.observe(node);
      controller.flush?.();
      pointer(node, "pointerdown");
      const x = mode === "tap" ? 100 : 165;
      pointer(node, "pointerup", x);
      expect(toggle).toHaveBeenCalledTimes(1);
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: x,
        clientY: 100,
      });
      node.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      const next = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      node.dispatchEvent(next);
      expect(next.defaultPrevented).toBe(false);
    }
  );

  test("accepts the left preset and rejects wrong directions and edge starts", () => {
    controller.setMode("swipe", "left");
    controller.observe(node);
    controller.flush?.();
    pointer(node, "pointerdown", 200);
    pointer(node, "pointerup", 130);
    expect(toggle).toHaveBeenCalledTimes(1);
    pointer(node, "pointerdown", 200);
    pointer(node, "pointerup", 270);
    pointer(node, "pointerdown", 20);
    pointer(node, "pointerup", 100);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  test.each([
    "timeout",
    "movement",
    "scroll",
    "cancel",
    "multitouch",
    "removed",
    "mode",
    "mouse",
  ])("rejects %s", (reason) => {
    controller.setMode("tap");
    pointer(
      node,
      "pointerdown",
      100,
      100,
      1,
      reason === "mouse" ? "mouse" : "touch"
    );
    if (reason === "timeout") jest.advanceTimersByTime(301);
    if (reason === "movement") pointer(node, "pointermove", 130);
    if (reason === "scroll") document.dispatchEvent(new Event("scroll"));
    if (reason === "cancel") pointer(node, "pointercancel");
    if (reason === "multitouch") pointer(node, "pointerdown", 100, 100, 2);
    if (reason === "removed") node.remove();
    if (reason === "mode") controller.setMode("swipe");
    pointer(node, "pointerup");
    expect(toggle).not.toHaveBeenCalled();
  });

  test("ignores interactive ancestors, selection, horizontal scrollers and plugin UI", () => {
    controller.setMode("tap");
    for (const html of [
      "<a><span>Link</span></a>",
      "<button><span>Button</span></button>",
      '<div contenteditable="true"><span>Edit</span></div>',
      '<div class="notranslate"><span>UI</span></div>',
    ]) {
      node.innerHTML = html;
      pointer(node.querySelector("span"), "pointerdown");
      pointer(node.querySelector("span"), "pointerup");
    }
    node.style.overflowX = "auto";
    Object.defineProperty(node, "scrollWidth", { value: 300 });
    Object.defineProperty(node, "clientWidth", { value: 100 });
    expect(isTouchExcluded(node)).toBe(true);
    expect(toggle).not.toHaveBeenCalled();
  });

  test("leaves a text selection intact", () => {
    const range = document.createRange();
    range.selectNodeContents(node);
    window.getSelection().addRange(range);
    controller.setMode("tap");
    pointer(node, "pointerdown");
    pointer(node, "pointerup");
    expect(toggle).not.toHaveBeenCalled();
    expect(window.getSelection().toString()).toBe("Paragraph");
    window.getSelection().removeAllRanges();
  });

  test.each(["short", "vertical", "slow"])("rejects a %s swipe", (kind) => {
    controller.setMode("swipe");
    controller.observe(node);
    controller.flush?.();
    pointer(node, "pointerdown");
    if (kind === "slow") jest.advanceTimersByTime(701);
    pointer(
      node,
      "pointerup",
      kind === "short" ? 140 : 180,
      kind === "vertical" ? 130 : 100
    );
    expect(toggle).not.toHaveBeenCalled();
  });

  test("resolves the original composed target inside a shadow root", () => {
    node = document.createElement("div");
    document.body.appendChild(node);
    const shadow = node.attachShadow({ mode: "open" });
    shadow.innerHTML = "<span>Shadow paragraph</span>";
    controller.resolve = jest.fn(() => node);
    controller.setMode("tap");
    pointer(shadow.firstChild, "pointerdown");
    pointer(shadow.firstChild, "pointerup");
    expect(controller.resolve).toHaveBeenCalledWith(shadow.firstChild);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  test("restores existing touch-action and removes listeners on exit", () => {
    // jsdom 16 does not implement touch-action; model CSSOM storage for this property.
    let value = "manipulation",
      priority = "important";
    jest
      .spyOn(node.style, "setProperty")
      .mockImplementation((key, next, rank) => {
        value = next;
        priority = rank;
      });
    jest.spyOn(node.style, "getPropertyValue").mockImplementation(() => value);
    jest
      .spyOn(node.style, "getPropertyPriority")
      .mockImplementation(() => priority);
    controller.setMode("swipe");
    controller.observe(node);
    controller.flush?.();
    expect(node.style.getPropertyValue("touch-action")).toBe(
      "pan-y pinch-zoom"
    );
    controller.destroy();
    expect(node.style.getPropertyValue("touch-action")).toBe("manipulation");
    expect(node.style.getPropertyPriority("touch-action")).toBe("important");
    pointer(node, "pointerdown");
    pointer(node, "pointerup", 180);
    expect(toggle).not.toHaveBeenCalled();
  });

  test("batches geometry reads before all style writes", () => {
    const second = document.createElement("p");
    document.body.appendChild(second);
    const operations = [];
    for (const el of [node, second]) {
      Object.defineProperty(el, "scrollWidth", {
        configurable: true,
        get: () => {
          operations.push("read");
          return 0;
        },
      });
      jest
        .spyOn(el.style, "setProperty")
        .mockImplementation(() => operations.push("write"));
    }
    controller.setMode("swipe");
    controller.observe(node);
    controller.observe(second);
    expect(operations).toEqual([]);
    controller.flush();
    expect(operations).toEqual(["read", "read", "write", "write"]);
  });

  test("invalidates candidates when a horizontal scroller is appended", async () => {
    controller.setMode("swipe");
    controller.observe(node);
    controller.flush();
    expect(controller.styles.has(node)).toBe(true);
    const scroller = document.createElement("span");
    scroller.style.overflowX = "auto";
    Object.defineProperty(scroller, "scrollWidth", { value: 100 });
    Object.defineProperty(scroller, "clientWidth", { value: 10 });
    node.appendChild(scroller);
    await Promise.resolve();
    controller.flush();
    expect(controller.styles.has(node)).toBe(false);
    scroller.remove();
    await Promise.resolve();
    controller.flush();
    expect(controller.styles.has(node)).toBe(true);
  });

  test("does not intercept an unprepared candidate or apply a cancelled batch", () => {
    controller.setMode("swipe");
    controller.observe(node);
    pointer(node, "pointerdown");
    pointer(node, "pointerup", 180);
    expect(toggle).not.toHaveBeenCalled();
    controller.setMode("off");
    jest.runOnlyPendingTimers();
    expect(controller.styles.size).toBe(0);
  });

  test("appending a candidate does not remeasure unrelated paragraphs", async () => {
    controller.allowed = jest.fn(() => true);
    controller.setMode("swipe");
    controller.observe(node);
    controller.flush();
    await Promise.resolve();
    controller.allowed.mockClear();
    const added = document.createElement("p");
    added.textContent = "New text";
    document.body.appendChild(added);
    controller.observe(added);
    await Promise.resolve();
    controller.flush();
    expect(controller.allowed).toHaveBeenCalledTimes(1);
    expect(controller.allowed).toHaveBeenCalledWith(added);
  });

  test("unsupported environments stay off", () => {
    window.PointerEvent = undefined;
    controller.setMode("tap");
    expect(controller.mode).toBe("off");
  });
});
