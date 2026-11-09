import {
  DEFAULT_ICON_STYLE,
  getIconStyleSnapshot,
  resolveIconStyle,
  setIconStyleSnapshot,
  subscribeIconStyle,
} from "./iconStyleStore";

describe("iconStyleStore", () => {
  afterEach(() => setIconStyleSnapshot(DEFAULT_ICON_STYLE));

  test.each([
    ["mui", "mui"],
    ["lucide", "lucide"],
    ["md3", "lucide"],
    [undefined, "lucide"],
    ["", "lucide"],
    ["MUI", "lucide"],
  ])("normalizes %p to %p", (input, expected) => {
    expect(resolveIconStyle(input)).toBe(expected);
  });

  test("notifies once only when the normalized value changes", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeIconStyle(listener);
    setIconStyleSnapshot("mui");
    setIconStyleSnapshot("mui");
    setIconStyleSnapshot("invalid");
    expect(listener.mock.calls.map(([value]) => value)).toEqual([
      "mui",
      "lucide",
    ]);
    expect(getIconStyleSnapshot()).toBe("lucide");
    unsubscribe();
  });
});
