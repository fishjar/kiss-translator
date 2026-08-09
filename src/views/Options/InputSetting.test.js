import { act } from "react";
import { createRoot } from "react-dom/client";
import InputSetting from "./InputSetting";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
      triggerTime: 300,
      transSign: "",
      showDot: "mobile",
      blacklist: "",
    },
    updateInputRule: jest.fn(),
  }),
}));
jest.mock("../../hooks/Api", () => ({
  useApiList: () => ({ enabledApis: [] }),
}));
jest.mock("./ShortcutInput", () => {
  const React = require("react");
  return () => React.createElement("div");
});

describe("InputSetting", () => {
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
});
