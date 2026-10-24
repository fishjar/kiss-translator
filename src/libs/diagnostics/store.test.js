import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { serialize, deserialize } from "v8";
import { TextEncoder } from "util";
import { createLogStore } from "./store";
import { LOG_LIMITS, normalizeRecord } from "./record";

let store, clock;
beforeEach(() => {
  global.IDBKeyRange = IDBKeyRange;
  global.TextEncoder = TextEncoder;
  global.structuredClone = (value) => deserialize(serialize(value));
  clock = Date.now();
  store = createLogStore({ indexedDB: new IDBFactory(), now: () => clock });
});
afterEach(async () => {
  await store.close();
});
const record = (event, extra = {}) =>
  normalizeRecord(
    { event, module: "translation", level: "debug", ...extra },
    {},
    clock
  );

test("concurrent senders are serialized and survive a fresh database connection", async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, n) => store.append([record(`event-${n}`)]))
  );
  await store.close();
  const first = await store.query({}, { limit: 7 });
  expect(first.stats.count).toBe(20);
  expect(first.records).toHaveLength(7);
  const second = await store.query(
    {},
    { before: first.next, snapshot: first.snapshot, limit: 200 }
  );
  expect(
    new Set([...first.records, ...second.records].map((r) => r.id)).size
  ).toBe(20);
  await store.append([record("later")]);
  const stable = await store.query(
    {},
    { snapshot: first.snapshot, limit: 200 }
  );
  expect(stable.records).toHaveLength(20);
});

test("time, task, level, module, environment and text filters compose", async () => {
  await store.append([
    record("task.failed", {
      level: "error",
      environment: "content",
      context: { taskId: "a", requestId: "r" },
    }),
    record("task.started"),
  ]);
  const result = await store.query({
    level: "error",
    module: "translation",
    environment: "content",
    taskId: "r",
    query: "failed",
    from: clock - 1,
    to: clock + 1,
  });
  expect(result.records).toHaveLength(1);
  expect((await store.query({ taskId: "other" })).records).toHaveLength(0);
});

test("retention removes old records even with no new writes", async () => {
  await store.append([record("old")]);
  clock += 8 * 86400000;
  expect((await store.query()).stats).toMatchObject({ count: 0, bytes: 0 });
});

test.each(["count", "bytes"])(
  "enforces the %s bound and counts queue drops",
  async (key) => {
    await store.close();
    const sample = record("bounded");
    store = createLogStore({
      indexedDB: new IDBFactory(),
      limits: { ...LOG_LIMITS, [key]: key === "count" ? 2 : sample.bytes * 2 },
      now: () => clock,
    });
    await store.append([sample, sample, sample], 5);
    const result = await store.query();
    expect(result.records).toHaveLength(2);
    expect(result.stats).toMatchObject({
      count: 2,
      bytes: sample.bytes * 2,
      dropped: 5,
    });
    await store.clear();
    expect((await store.query()).stats).toEqual({
      count: 0,
      bytes: 0,
      dropped: 0,
    });
  }
);

test("failed transactions reject and do not report an uncommitted batch", async () => {
  await expect(
    store.append([
      { ...record("bad"), id: 1 },
      { ...record("duplicate"), id: 1 },
    ])
  ).rejects.toBeDefined();
  expect((await store.query()).records).toHaveLength(0);
});
