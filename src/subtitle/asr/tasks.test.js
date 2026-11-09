import { AsrTaskStore, blockTask, groupAsrTasks } from "./tasks";

const media = (index, startMs, endMs) => ({
  id: `media-${index}`,
  kind: "media",
  index,
  startMs,
  endMs,
});
const block = (id, startMs, endMs) => ({ id, kind: "block", startMs, endMs });

test("ownership uses the starting timestamp, including boundaries and unordered arrival", () => {
  const groups = groupAsrTasks([
    block("b", 1000, 3500),
    media(3, 2000, 3000),
    block("a", 0, 1500),
    media(1, 0, 1000),
    media(2, 1000, 2000),
  ]);
  expect(groups.map((row) => row.children.map((child) => child.id))).toEqual([
    ["a"],
    ["b"],
    [],
  ]);
  expect(groups[0].children[0].crossSegment).toBe(true);
  expect(groups[2].coveredElsewhere).toBe(true);
});

test("cached blocks do not fabricate media segments and regroup when an index arrives", () => {
  const cached = { ...block("cached", 0, 3000), cached: true };
  expect(groupAsrTasks([cached])).toEqual([]);
  expect(
    groupAsrTasks([cached, media(0, 0, 0), media(1, 0, 1000)])
  ).toMatchObject([{ id: "media-1", children: [{ id: "cached" }] }]);
});

test("metadata updates deduplicate, retain errors until resolved, and stop running tasks", () => {
  const changed = jest.fn(),
    store = new AsrTaskStore(changed);
  store.update({
    ...block("b", 0, 1000),
    recognition: "recognizing",
    translation: "waiting",
  });
  store.update({ id: "b", recognition: "recognizing" });
  expect(changed).toHaveBeenCalledTimes(1);
  store.stop();
  expect(store.snapshot()[0].recognition).toBe("stopped");
  store.reset();
  expect(store.snapshot()).toEqual([]);
  expect(changed.mock.calls.at(-1)[0].reset).toBe(true);
});

test("silence and empty text are skipped without retaining subtitle or audio bodies", () => {
  const row = blockTask({
    startSample: 0,
    endSample: 16000,
    stage: "translated",
    segments: [],
    subtitles: [],
    silent: true,
  });
  expect(row).toMatchObject({
    startMs: 0,
    endMs: 1000,
    recognition: "skipped",
    translation: "skipped",
  });
  expect(row.segments).toBeUndefined();
  expect(row.subtitles).toBeUndefined();
});
