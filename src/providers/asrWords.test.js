import { alignedAsrWords } from "./asrWords";

const segment = {
  start: 1,
  end: 3,
  text: "Hello, world!",
  words: [
    { start: 1, end: 1.4, text: "Hello," },
    { start: 2, end: 3, text: " world!" },
  ],
};
test("preserves real word endpoints and punctuation without inventing missing text", () => {
  expect(alignedAsrWords(segment)).toEqual(segment.words);
  expect(
    alignedAsrWords({ ...segment, text: "Hello, missing world!" })
  ).toBeUndefined();
  expect(
    alignedAsrWords({ ...segment, wordsTimingSource: "estimated" })
  ).toBeUndefined();
});
test.each([
  [{ start: NaN, end: 3, text: "Hello, world!" }],
  [{ start: 0, end: 3, text: "Hello, world!" }],
  [{ start: 1, end: 4, text: "Hello, world!" }],
  [
    { start: 2, end: 3, text: "Hello," },
    { start: 1, end: 2, text: " world!" },
  ],
])(
  "invalid optional word timestamps fall back to the segment: %j",
  (...words) => {
    expect(alignedAsrWords({ ...segment, words })).toBeUndefined();
  }
);
