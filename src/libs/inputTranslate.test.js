const mockUnregisterShortcut = jest.fn();

jest.mock("../config", () => ({
  DEFAULT_INPUT_RULE: {
    transOpen: true,
    triggerShortcut: ["AltLeft", "KeyI"],
    triggerCount: 1,
    triggerTime: 200,
    showDot: "always",
  },
  DEFAULT_INPUT_SHORTCUT: ["AltLeft", "KeyI"],
  OPT_LANGS_LIST: [],
  DEFAULT_API_SETTING: {},
  OPT_INPUT_DOT_DISABLE: "-",
  OPT_INPUT_DOT_MOBILE: "mobile",
}));

jest.mock("../config/prompt", () => ({
  resolveApiPromptSettings: jest.fn(),
}));

jest.mock("./mobile", () => ({ isMobile: false }));

jest.mock("./utils", () => ({
  genEventName: jest.fn(() => "event"),
  removeEndchar: jest.fn((text) => text),
  matchInputStr: jest.fn(),
  sleep: jest.fn(() => Promise.resolve()),
}));

jest.mock("./shortcut", () => ({
  stepShortcutRegister: jest.fn(() => mockUnregisterShortcut),
}));

jest.mock("../apis", () => ({ apiTranslate: jest.fn() }));
jest.mock("./svg", () => ({ createLoadingSVG: jest.fn() }));
jest.mock("./log", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { InputTranslator } = require("./inputTranslate");
const { stepShortcutRegister } = require("./shortcut");

function makeRect({ top = 100, right = 200, width = 100, height = 30 } = {}) {
  return {
    top,
    right,
    bottom: top + height,
    left: right - width,
    width,
    height,
    x: right - width,
    y: top,
    toJSON: () => {},
  };
}

function focusTarget(translator, target, rect = makeRect()) {
  target.getBoundingClientRect = jest.fn(() => rect);
  document.body.appendChild(target);
  target.focus();
  translator.handleFocusIn();
}

function getFloatButton(target) {
  return Array.from(document.body.children).find(
    (node) => node !== target && node.style.position === "fixed"
  );
}

describe("InputTranslator input button", () => {
  let originalResizeObserver;
  let translator;

  beforeAll(() => {
    originalResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
  });

  afterAll(() => {
    window.ResizeObserver = originalResizeObserver;
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    mockUnregisterShortcut.mockClear();
    stepShortcutRegister.mockReturnValue(mockUnregisterShortcut);
    translator = new InputTranslator({
      inputRule: {
        transOpen: true,
        triggerShortcut: ["AltLeft", "KeyI"],
        triggerCount: 1,
        triggerTime: 200,
        showDot: "always",
      },
    });
  });

  afterEach(() => {
    translator.disable();
    document.body.innerHTML = "";
  });

  test.each([
    ["input without an explicit type", () => document.createElement("input")],
    [
      "search input",
      () => Object.assign(document.createElement("input"), { type: "search" }),
    ],
    ["textarea", () => document.createElement("textarea")],
    [
      "contenteditable",
      () => {
        const node = document.createElement("div");
        node.tabIndex = 0;
        node.setAttribute("contenteditable", "true");
        return node;
      },
    ],
  ])("shows the button for %s", (_label, createTarget) => {
    const target = createTarget();
    focusTarget(translator, target);

    expect(getFloatButton(target)).toBeTruthy();
  });

  test.each([
    "checkbox",
    "radio",
    "submit",
    "button",
    "image",
    "file",
    "password",
  ])("does not show the button for %s input", (type) => {
    const target = document.createElement("input");
    target.type = type;
    focusTarget(translator, target);

    expect(getFloatButton(target)).toBeUndefined();
  });

  test.each([
    [
      "disabled",
      (target) => {
        target.disabled = true;
      },
    ],
    [
      "read-only",
      (target) => {
        target.readOnly = true;
      },
    ],
  ])("does not show the button for a %s text input", (_label, configure) => {
    const target = document.createElement("input");
    configure(target);
    focusTarget(translator, target);

    expect(getFloatButton(target)).toBeUndefined();
  });

  test("places a short input button above when space is available", () => {
    const target = document.createElement("input");
    focusTarget(translator, target, makeRect({ top: 100, height: 30 }));

    expect(getFloatButton(target).style.top).toBe("68px");
  });

  test("places a short input button below when the top edge has no room", () => {
    const target = document.createElement("input");
    focusTarget(translator, target, makeRect({ top: 10, height: 30 }));

    expect(getFloatButton(target).style.top).toBe("42px");
  });

  test("keeps the button above an input near the bottom edge", () => {
    const target = document.createElement("input");
    focusTarget(translator, target, makeRect({ top: 560, height: 30 }));

    expect(getFloatButton(target).style.top).toBe("528px");
  });

  test("keeps a tall input button inside its bottom-right corner", () => {
    const target = document.createElement("textarea");
    focusTarget(translator, target, makeRect({ top: 100, height: 100 }));

    expect(getFloatButton(target).style.top).toBe("165px");
  });

  test.each([
    [20, "0px"],
    [900, "768px"],
  ])("clamps horizontal position for right edge %i", (right, expectedLeft) => {
    const target = document.createElement("input");
    focusTarget(translator, target, makeRect({ top: 100, right }));

    expect(getFloatButton(target).style.left).toBe(expectedLeft);
  });

  test("removes the button and shortcut when disabled", () => {
    const target = document.createElement("input");
    focusTarget(translator, target);

    translator.disable();

    expect(getFloatButton(target)).toBeUndefined();
    expect(mockUnregisterShortcut).toHaveBeenCalledTimes(1);
  });
});
