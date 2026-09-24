import {
  formatShortcutKey,
  normalizeShortcutKeys,
} from "../../libs/shortcutLabel";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ShortcutInput from "./ShortcutInput";
import { shortcutListener } from "../../libs/shortcut";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../libs/shortcut", () => ({
  shortcutListener: jest.fn(() => jest.fn()),
}));

jest.mock("../../hooks/I18n", () => ({
  useI18n: () => (key) => ({ edit: "Edit", save: "Save" })[key] || key,
}));

describe("formatShortcutKey", () => {
  test.each([
    ["ControlLeft", "Left Ctrl"],
    ["AltRight", "Right Alt"],
    ["KeyI", "I"],
    ["Digit3", "3"],
    [" ", "Space"],
  ])("formats %s as %s", (key, label) => {
    expect(formatShortcutKey(key)).toBe(label);
  });

  test("normalizes browser and stored shortcut formats", () => {
    expect(normalizeShortcutKeys("Alt+Q")).toEqual(["Alt", "Q"]);
    expect(normalizeShortcutKeys(["AltLeft", "KeyI"])).toEqual([
      "Left Alt",
      "I",
    ]);
  });
});

test("keeps compact shortcut controls specifically named", () => {
  shortcutListener.mockReturnValue(jest.fn());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      <ShortcutInput
        compact
        value={["AltLeft", "KeyI"]}
        onChange={jest.fn()}
        label="Selection shortcut"
      />
    )
  );

  const input = container.querySelector("input");
  let action = container.querySelector("button");
  expect(input.getAttribute("aria-label")).toBe("Selection shortcut");
  expect(action.getAttribute("aria-label")).toBe("Edit Selection shortcut");

  act(() => action.click());
  action = container.querySelector("button");
  expect(input.disabled).toBe(false);
  expect(action.getAttribute("aria-label")).toBe("Save Selection shortcut");

  act(() => root.unmount());
  container.remove();
});
