import {
  coverageProgress,
  mergeIntervals,
  missingIntervals,
  prioritizeIntervals,
} from "./coverage";

test("coverage merges duplicates and adjacency but never infers an unprocessed gap", () => {
  const ranges = [
    { start: 0, end: 10 },
    { start: 0, end: 10 },
    { start: 10, end: 15 },
    { start: 20, end: 30 },
  ];
  expect(mergeIntervals(ranges)).toEqual([
    { start: 0, end: 15 },
    { start: 20, end: 30 },
  ]);
  expect(coverageProgress(ranges, 30)).toMatchObject({
    samples: 25,
    complete: false,
  });
  expect(missingIntervals(ranges, 40)).toEqual([
    { start: 15, end: 20 },
    { start: 30, end: 40 },
  ]);
  expect(coverageProgress([{ start: 0, end: 50 }], 30).complete).toBe(true);
});

test("seek changes recognition priority without dropping earlier gaps", () => {
  expect(
    prioritizeIntervals(
      [
        { start: 0, end: 100 },
        { start: 120, end: 150 },
      ],
      50
    )
  ).toEqual([
    { start: 50, end: 100 },
    { start: 120, end: 150 },
    { start: 0, end: 50 },
  ]);
  expect(() => mergeIntervals([{ start: 1.5, end: 2 }])).toThrow();
});
