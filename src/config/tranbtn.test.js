import { normalizeTranbtnAppearance } from "./tranbtn";

test.each([
  undefined,
  null,
  {},
  { btnSize: "64", btnOpacity: "0.5" },
  { btnSize: NaN, btnOpacity: Infinity },
])("defaults invalid preferences: %p", (config) => {
  expect(normalizeTranbtnAppearance(config)).toEqual({
    btnSize: 32,
    btnOpacity: 1,
  });
});
test.each([
  [0, -1, 16, 0.1],
  [100, 2, 64, 1],
  [31.6, 0.35, 32, 0.35],
])("normalizes finite preferences", (btnSize, btnOpacity, size, opacity) => {
  expect(normalizeTranbtnAppearance({ btnSize, btnOpacity })).toEqual({
    btnSize: size,
    btnOpacity: opacity,
  });
});
