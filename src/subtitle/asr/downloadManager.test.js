import { AudioDownloadManager, retryAfterDeadline } from "./downloadManager";

const identity = {
  videoId: "kSQknoHMFtk",
  trackId: "en-US.4",
  mediaVersion: "140.123",
  durationMs: 2000,
  sourceLanguage: "en",
};
const segment = (index) => ({
  index,
  startMs: index ? (index - 1) * 1000 : 0,
  endMs: index ? index * 1000 : 0,
  data: new Uint8Array([index, 2, 3]).buffer,
});
const result = (indices, extra = {}) => ({
  segments: indices.map(segment),
  expectedSegments: 2,
  expectedEndMs: 2000,
  protection: 1,
  backoffMs: 0,
  ...extra,
});
function setup(responses = [result([0, 1]), result([2])]) {
  const rows = new Map();
  const cache = {
    beginAudio: jest.fn(async () => {}),
    putAudio: jest.fn(async (id, part) => rows.set(part.index, part)),
    getAudio: jest.fn(async (id, index) => rows.get(index)),
    removeAudio: jest.fn(async () => rows.clear()),
  };
  let i = 0,
    clock = 0;
  const bridge = {
    open: jest.fn(async () => ({ identity })),
    clear: jest.fn(),
    next: jest.fn(async () => {
      const response = responses[i++] || result([]);
      if (response instanceof Error) throw response;
      return response;
    }),
  };
  const states = [],
    onSegment = jest.fn(),
    onTask = jest.fn();
  const wait = jest.fn(async (ms) => {
    clock += ms;
  });
  const manager = new AudioDownloadManager({
    bridge,
    cache,
    identity,
    onState: (state) => states.push(state),
    onSegment,
    onTask,
    now: () => clock,
    wait,
  });
  return { manager, bridge, cache, rows, states, onSegment, onTask, wait };
}

test("one sequential download serves ASR and exports; completed cached media require no extra requests", async () => {
  const { manager, bridge, cache } = setup();
  const asr = manager.acquire("asr"),
    sentence = manager.acquire("sentence", 1000);
  await sentence.ready;
  sentence.release();
  await asr.ready;
  expect(bridge.open).toHaveBeenCalledTimes(1);
  expect(bridge.open.mock.calls[0][2]).toBe(0);
  expect(bridge.next).toHaveBeenCalledTimes(2);
  expect(cache.putAudio).toHaveBeenCalledTimes(3);
  const full = manager.acquire("full");
  await full.ready;
  expect(bridge.next).toHaveBeenCalledTimes(2);
  const parts = [];
  for await (const part of manager.segmentsFor()) parts.push(part.index);
  expect(parts).toEqual([0, 1, 2]);
  asr.release();
  full.release();
  await manager.dispose();
});

test("releasing one consumer does not abort the other or start parallel media calls", async () => {
  const { manager, bridge } = setup();
  let release;
  bridge.next.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(result([0, 1]));
      })
  );
  const first = manager.acquire("asr"),
    second = manager.acquire("export");
  await new Promise((resolve) => setTimeout(resolve, 0));
  first.release();
  release();
  await second.ready;
  expect(bridge.open).toHaveBeenCalledTimes(1);
  expect(bridge.next).toHaveBeenCalledTimes(3); // The overridden response did not consume the base fixture iterator.
  second.release();
  await manager.dispose();
});

test("temporary failures retry only twice, while 403 refreshes page parameters once", async () => {
  const network = () =>
    Object.assign(new Error("network"), { code: "AUDIO_NETWORK" });
  const a = setup([network(), network(), result([0, 1]), result([2])]);
  const lease = a.manager.acquire("asr");
  await lease.ready;
  expect(a.wait.mock.calls.map((call) => call[0])).toEqual([1000, 3000]);
  await a.manager.dispose();
  const auth = () =>
    Object.assign(new Error("auth"), {
      code: "AUDIO_AUTH_EXPIRED",
      status: 403,
    });
  const b = setup([auth(), auth()]);
  const failed = b.manager.acquire("asr");
  await expect(failed.ready).rejects.toHaveProperty(
    "code",
    "AUDIO_AUTH_EXPIRED"
  );
  expect(b.bridge.open).toHaveBeenCalledTimes(2);
  expect(b.bridge.next).toHaveBeenCalledTimes(2);
  await b.manager.dispose();
});

test("resume may fall back to the beginning once; replayed segments never write twice", async () => {
  const { manager, bridge, cache } = setup([
    result([0, 1]),
    result([], { protection: 2 }),
    result([], { protection: 2 }),
    result([0, 1]),
    result([2]),
  ]);
  const lease = manager.acquire("asr");
  await lease.ready;
  expect(bridge.open.mock.calls.map((call) => call[2])).toEqual([0, 1000, 0]);
  expect(cache.putAudio).toHaveBeenCalledTimes(3);
  await manager.dispose();
});

test("long Retry-After reports a real cooldown and refuses new work until it expires", async () => {
  const limited = Object.assign(new Error("limited"), {
    code: "AUDIO_RATE_LIMITED",
    retryAfter: "60",
    status: 429,
  });
  const { manager, bridge } = setup([limited]);
  const lease = manager.acquire("asr");
  await expect(lease.ready).rejects.toMatchObject({
    code: "AUDIO_RATE_LIMITED",
    cooldownUntil: 60000,
  });
  expect(manager.state.cooldownUntil).toBe(60000);
  expect(manager.retry()).toBe(false);
  expect(() => manager.acquire("export")).toThrow();
  expect(bridge.next).toHaveBeenCalledTimes(1);
  expect(retryAfterDeadline("Thu, 01 Jan 1970 00:00:10 GMT", 0)).toBe(10000);
  await manager.dispose();
  const reopened = setup();
  const resumed = reopened.manager.acquire("asr");
  await resumed.ready;
  expect(reopened.wait).toHaveBeenCalledWith(60000, expect.any(AbortSignal));
  expect(
    reopened.states.some(
      (state) => state.phase === "cooldown" && state.cooldownUntil === 60000
    )
  ).toBe(true);
  await reopened.manager.dispose();
});

test("gaps and audio-identity changes fail instead of manufacturing complete files", async () => {
  const { manager, bridge } = setup([
    result([0, 2]),
    result([]),
    result([]),
    result([]),
    result([]),
    result([]),
    result([]),
  ]);
  bridge.open.mockResolvedValueOnce({
    identity: { ...identity, trackId: "ja.10" },
  });
  const lease = manager.acquire("asr");
  await expect(lease.ready).rejects.toHaveProperty(
    "code",
    "AUDIO_IDENTITY_MISMATCH"
  );
  expect(manager.complete()).toBe(false);
  await manager.dispose();
});

test("download task events describe real segments and persistence failures without retaining audio", async () => {
  const test = setup();
  const lease = test.manager.acquire("asr");
  await lease.ready;
  const rows = test.onTask.mock.calls.map(([task]) => task);
  expect(rows.map((row) => [row.index, row.download])).toEqual([
    [1, "saving"],
    [1, "complete"],
    [2, "saving"],
    [2, "complete"],
  ]);
  expect(
    rows.every(
      (row) => !row.data && row.startMs >= 0 && row.endMs > row.startMs
    )
  ).toBe(true);
  await test.manager.dispose();
  const failed = setup();
  failed.cache.putAudio.mockImplementation(async (_, segment) => {
    if (segment.index === 1)
      throw Object.assign(new Error(), { code: "AUDIO_QUOTA" });
  });
  await expect(failed.manager.acquire("asr").ready).rejects.toHaveProperty(
    "code",
    "AUDIO_QUOTA"
  );
  expect(failed.onTask).toHaveBeenLastCalledWith(
    expect.objectContaining({
      index: 1,
      download: "failed",
      errorCode: "AUDIO_QUOTA",
    })
  );
  await failed.manager.dispose();
});
