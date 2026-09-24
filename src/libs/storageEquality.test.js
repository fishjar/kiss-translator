import { cloneStorageValue, isSameStorageValue } from "./storageEquality";

test("ignores object key insertion order at every nesting level", () => {
  expect(
    isSameStorageValue(
      { first: { alpha: 1, beta: 2 }, second: [{ x: 1, y: 2 }] },
      { second: [{ y: 2, x: 1 }], first: { beta: 2, alpha: 1 } }
    )
  ).toBe(true);
});

test("retains array order and distinguishes missing properties", () => {
  expect(isSameStorageValue(["first", "second"], ["second", "first"])).toBe(
    false
  );
  expect(isSameStorageValue({ first: null }, {})).toBe(false);
  expect(isSameStorageValue({ first: 1 }, { second: 1 })).toBe(false);
  expect(isSameStorageValue([], {})).toBe(false);
  expect(isSameStorageValue(null, {})).toBe(false);
});

test("clones nested values without sharing mutable references", () => {
  const original = { words: [{ word: "first" }] };
  const cloned = cloneStorageValue(original);
  cloned.words[0].word = "second";
  expect(original).toEqual({ words: [{ word: "first" }] });
  expect(cloneStorageValue(undefined)).toBeUndefined();
  expect(cloneStorageValue(null)).toBeNull();
});
