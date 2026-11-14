import { normalizeTranboxFontSize } from "./tranboxFont";

test.each([undefined, null, "20", NaN, Infinity, -Infinity, {}, true])(
  "defaults invalid font size %p",
  (value) => {
    expect(normalizeTranboxFontSize(value)).toBe(16);
  }
);
test.each([
  [0, 12],
  [12, 12],
  [24, 24],
  [100, 24],
  [18.6, 19],
])("normalizes %s to %s", (value, expected) => {
  expect(normalizeTranboxFontSize(value)).toBe(expected);
});
