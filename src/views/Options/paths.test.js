import { normalizeOptionsPath } from "./paths";

test.each([
  ["", "/"],
  ["#/", "/"],
  ["#/?source=test", "/"],
  ["#/rules/?source=test", "/rules"],
  ["/apis/", "/apis"],
  ["/prompts///", "/prompts"],
  ["/playground/?source=test", "/playground"],
])("normalizes hash or router path %p to %p", (path, expected) => {
  expect(normalizeOptionsPath(path)).toBe(expected);
});
