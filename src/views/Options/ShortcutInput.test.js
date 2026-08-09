import {
  formatShortcutKey,
  normalizeShortcutKeys,
} from "../../libs/shortcutLabel";

describe("formatShortcutKey", () => {
  test.each([
    ["ControlLeft", "Ctrl"],
    ["AltRight", "Alt"],
    ["KeyI", "I"],
    ["Digit3", "3"],
    [" ", "Space"],
  ])("formats %s as %s", (key, label) => {
    expect(formatShortcutKey(key)).toBe(label);
  });

  test("normalizes browser and stored shortcut formats", () => {
    expect(normalizeShortcutKeys("Alt+Q")).toEqual(["Alt", "Q"]);
    expect(normalizeShortcutKeys(["AltLeft", "KeyI"])).toEqual(["Alt", "I"]);
  });
});
