import { act } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_INPUT_RULE } from "../../config";
import InputSetting, { normalizeTriggerTime } from "./InputSetting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mockTriggerTime = 300;

jest.mock("../../hooks/I18n", () => ({ useI18n: () => (key) => key }));
jest.mock("../../hooks/InputRule", () => ({
  useInputRule: () => ({
    inputRule: {
      transOpen: true,
      apiSlug: "Microsoft",
      fromLang: "auto",
      toLang: "zh-CN",
      triggerShortcut: ["AltLeft", "KeyI"],
      triggerCount: 5,
      triggerTime: mockTriggerTime,
      transSign: "",
      showDot: "mobile",
      blacklist: "",
    },
    updateInputRule: jest.fn(),
  }),
}));
jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({
    enabledApis: [{ apiSlug: "Microsoft", apiName: "Microsoft" }],
  }),
}));
jest.mock("./ShortcutInput", () => {
  const React = require("react");
  return () => React.createElement("div");
});

describe("InputSetting", () => {
  beforeEach(() => {
    mockTriggerTime = 300;
  });

  test.each([
    ["255", 255],
    [5000, 1000],
    [-1, 10],
    ["abc", DEFAULT_INPUT_RULE.triggerTime],
    [undefined, DEFAULT_INPUT_RULE.triggerTime],
    [null, DEFAULT_INPUT_RULE.triggerTime],
    ["", DEFAULT_INPUT_RULE.triggerTime],
  ])("normalizes trigger time %p to %p", (value, expected) => {
    expect(normalizeTriggerTime(value)).toBe(expected);
  });

  test("renders one complete trigger-count control for values one through five", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<InputSetting />));

    const groups = container.querySelectorAll(
      '[role="radiogroup"][aria-label="shortcut_press_count"]'
    );
    expect(groups).toHaveLength(1);
    const radios = groups[0].querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(5);
    expect(radios[4].getAttribute("aria-checked")).toBe("true");

    act(() => root.unmount());
  });

  test("preserves one-millisecond timeout precision", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<InputSetting />));

    const advanced = container.querySelector(".MuiAccordionSummary-root");
    act(() => advanced.click());

    const timeout = container.querySelector(
      'input[type="range"][aria-label="combo_timeout"]'
    );
    expect(timeout).not.toBeNull();
    expect(timeout.step).toBe("1");

    act(() => root.unmount());
  });

  test("renders advanced settings as flat rows without a nested card", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<InputSetting />));

    const advanced = container.querySelector(".MuiAccordionSummary-root");
    act(() => advanced.click());

    const content = container.querySelector(".kt-settings-advanced__content");
    const rows = content.querySelector(".kt-settings-advanced__rows");
    expect(rows.tagName).toBe("UL");
    expect(rows.children).toHaveLength(3);
    expect(rows.querySelector(".kt-settings-card")).toBeNull();

    act(() => root.unmount());
  });

  test.each([
    ["255", "255"],
    [5000, "1000"],
    ["abc", String(DEFAULT_INPUT_RULE.triggerTime)],
  ])(
    "renders normalized trigger time %p as %p milliseconds",
    (value, expected) => {
      mockTriggerTime = value;
      const container = document.createElement("div");
      const root = createRoot(container);
      act(() => root.render(<InputSetting />));

      const advanced = container.querySelector(".MuiAccordionSummary-root");
      act(() => advanced.click());

      const timeout = container.querySelector(
        'input[type="range"][aria-label="combo_timeout"]'
      );
      expect(timeout.value).toBe(expected);
      expect(container.querySelector("output").textContent).toBe(
        `${expected} ms`
      );

      act(() => root.unmount());
    }
  );
});
