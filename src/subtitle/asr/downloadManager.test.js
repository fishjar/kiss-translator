import { AudioDownloadManager, retryAfterDeadline } from "./downloadManager";
import { audioSessionId } from "./cacheRecovery";
import { mediaCacheKey } from "./cacheStore";
import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { AsrPauseGate } from "./pause";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});
globalThis.TextEncoder = TextEncoder;

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
    releaseAudio: jest.fn(async () => {}),
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

test("pause holds the next network request and resume reuses downloaded segments", async () => {
  const test = setup(),
    gate = new AsrPauseGate();
  let clock = 0;
  test.manager.now = () => clock;
  test.manager.waitUntilRunning = (signal) => gate.wait(signal);
  let finishFirst;
  test.bridge.next.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFirst = resolve;
      })
  );
  test.bridge.next.mockResolvedValueOnce(result([2]));
  const lease = test.manager.acquire("asr");
  while (!finishFirst) await new Promise((resolve) => setTimeout(resolve, 0));
  gate.pause();
  finishFirst(result([0, 1]));
  while (!test.manager.index.has(1))
    await new Promise((resolve) => setTimeout(resolve, 0));
  expect(test.bridge.next).toHaveBeenCalledTimes(1);
  expect(test.manager.coverageMs).toBe(1000);
  while (!gate.waiters.size)
    await new Promise((resolve) => setTimeout(resolve, 0));
  clock = 60000;
  gate.resume();
  await lease.ready;
  expect(test.bridge.next).toHaveBeenCalledTimes(2);
  expect(test.bridge.open).toHaveBeenCalledTimes(1);
  expect(test.manager.error).toBeUndefined();
  await test.manager.dispose();
});

test("disposing a paused download releases its pending lease and wait", async () => {
  const test = setup(),
    gate = new AsrPauseGate();
  gate.pause();
  test.manager.waitUntilRunning = (signal) => gate.wait(signal);
  const lease = test.manager.acquire("asr");
  const cancelled = expect(lease.ready).rejects.toHaveProperty(
    "name",
    "AbortError"
  );
  await test.manager.dispose();
  await cancelled;
  expect(test.bridge.open).not.toHaveBeenCalled();
  expect(gate.waiters.size).toBe(0);
});

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
  for (let i = 0; i < 100 && !release; i++)
    await new Promise((resolve) => setTimeout(resolve, 2));
  expect(release).toEqual(expect.any(Function));
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
  expect(
    a.states.some((state) => state.phase === "fetching" && state.reconnecting)
  ).toBe(true);
  expect(a.manager.state.reconnecting).toBe(false);
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

test("manual recovery resumes after existing audio and preserves successful segments", async () => {
  const failure = () =>
    Object.assign(new Error("network"), { code: "AUDIO_NETWORK" });
  const test = setup([
    result([0, 1]),
    failure(),
    failure(),
    failure(),
    result([2]),
  ]);
  const lease = test.manager.acquire("asr");
  await expect(lease.ready).rejects.toHaveProperty("code", "AUDIO_NETWORK");
  expect(test.manager.coverageMs).toBe(1000);
  expect(test.manager.state.phase).toBe("error");
  if (test.manager.running) await test.manager.running;
  expect(test.manager.retry()).toBe(true);
  await test.manager.running;
  expect(test.manager.state.phase).toBe("complete");
  expect(test.bridge.open.mock.calls.map((call) => call[2])).toEqual([0, 1000]);
  expect(test.cache.putAudio).toHaveBeenCalledTimes(3);
  expect(test.manager.index.size).toBe(3);
  await test.manager.dispose();
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
  await failed.manager.acquire("asr").ready;
  expect(failed.manager.complete()).toBe(true);
  expect(failed.manager.memoryOnly).toBe(false);
  expect(failed.manager.cacheWriteFailed).toBe(true);
  expect(
    failed.onTask.mock.calls.some(([task]) => task.download === "failed")
  ).toBe(false);
  await failed.manager.dispose();
});

test("session IDs are stable and distinguish tracks and media versions", async () => {
  const id = await audioSessionId(identity, mediaCacheKey(identity));
  expect(id).toMatch(/^audio-kSQknoHMFtk-[a-f0-9]{64}$/);
  expect(await audioSessionId(identity, mediaCacheKey(identity))).toBe(id);
  for (const changed of [
    { ...identity, trackId: "es-ES.2" },
    { ...identity, mediaVersion: "140.124" },
  ])
    expect(await audioSessionId(changed, mediaCacheKey(changed))).not.toBe(id);
});

test("manager dispose invokes cache.releaseAudio", async () => {
  const { manager, cache } = setup();
  await manager.acquire("asr").ready;
  await manager.dispose();
  expect(cache.releaseAudio).toHaveBeenCalledWith(manager.sessionId);
});

test("invalidate resets index, bytes, coverage and emits idle state", () => {
  const { manager } = setup();
  manager.index.set(1, { index: 1, bytes: 100, startMs: 0, endMs: 1000 });
  manager.bytes = 100;
  manager.coverageMs = 1000;
  manager.lastIndex = 1;

  manager.invalidate();

  expect(manager.index.size).toBe(0);
  expect(manager.bytes).toBe(0);
  expect(manager.coverageMs).toBe(0);
  expect(manager.lastIndex).toBe(0);
  expect(manager.state.phase).toBe("idle");
});

test("segmentsFor invalidates and throws AUDIO_CACHE_MISSING when segment is missing from cache", async () => {
  const { manager, cache } = setup();
  manager.index.set(1, { index: 1, bytes: 100, startMs: 0, endMs: 1000 });
  cache.getAudio = jest.fn(async () => null);

  const generator = manager.segmentsFor(0, 1000);
  await expect(generator.next()).rejects.toMatchObject({
    code: "AUDIO_CACHE_MISSING",
  });
  expect(manager.index.size).toBe(0);
  expect(manager.complete()).toBe(false);

  await manager.dispose();
});

test("full persistent cache restores all media tasks without opening SABR", async () => {
  const test = setup();
  test.cache.listAudio = jest.fn(async () =>
    [0, 1, 2].map((index) => ({ ...segment(index), bytes: 3, data: undefined }))
  );
  await test.manager.acquire("asr").ready;
  expect(test.bridge.open).not.toHaveBeenCalled();
  expect(test.bridge.next).not.toHaveBeenCalled();
  expect(test.manager.complete()).toBe(true);
  expect(test.onTask.mock.calls.map(([task]) => task.id)).toEqual([
    "media-1",
    "media-2",
  ]);
  await test.manager.dispose();
});

test("partial persistent cache emits tasks before paused download resumes from coverage", async () => {
  const test = setup([result([0, 1, 2])]);
  test.cache.listAudio = jest.fn(async () =>
    [0, 1].map((index) => ({ ...segment(index), bytes: 3, data: undefined }))
  );
  test.bridge.open.mockImplementation(async () => {
    expect(test.onTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "media-1", download: "complete" })
    );
    return { identity };
  });
  await test.manager.acquire("asr").ready;
  expect(test.bridge.open.mock.calls[0][2]).toBe(1000);
  await test.manager.dispose();
});

test.each([0, 1])(
  "resumed audio keeps reading persistent segments through index %i after new writes fail",
  async (lastIndex) => {
    const test = setup(lastIndex ? [result([2])] : [result([1]), result([2])]);
    const restored = Array.from({ length: lastIndex + 1 }, (_, index) => index);
    for (const index of restored) test.rows.set(index, segment(index));
    test.cache.listAudio = jest.fn(async () =>
      restored.map((index) => ({
        ...segment(index),
        bytes: 3,
        data: undefined,
      }))
    );
    test.cache.putAudio.mockRejectedValue(
      Object.assign(new Error(), { code: "AUDIO_QUOTA" })
    );
    await test.manager.acquire("asr").ready;
    expect(test.manager.complete()).toBe(true);
    expect((await test.manager.readAudio(0)).data).toEqual(segment(0).data);
    expect((await test.manager.readAudio(1)).data).toEqual(segment(1).data);
    expect((await test.manager.readAudio(2)).data).toEqual(segment(2).data);
    const parts = [];
    for await (const part of test.manager.segmentsFor()) parts.push(part.index);
    expect(parts).toEqual([0, 1, 2]);
    expect(test.cache.getAudio.mock.calls.map(([, index]) => index)).toEqual([
      ...restored,
      ...restored,
    ]);
    expect(test.cache.putAudio).toHaveBeenCalledTimes(1);
    expect(test.bridge.open).toHaveBeenCalledTimes(1);
    expect(test.bridge.open.mock.calls[0][2]).toBe(lastIndex * 1000);
    await test.manager.dispose();
    expect(test.cache.releaseAudio).toHaveBeenCalledTimes(1);
  }
);

test("failed index lookup is not retried and network bytes remain available in memory", async () => {
  const test = setup();
  test.cache.listAudio = jest
    .fn()
    .mockRejectedValue(Object.assign(new Error(), { code: "CACHE_TIMEOUT" }));
  await test.manager.acquire("asr").ready;
  expect(test.cache.listAudio).toHaveBeenCalledTimes(1);
  expect(test.bridge.open).toHaveBeenCalledTimes(1);
  expect(test.cache.putAudio).not.toHaveBeenCalled();
  expect(new Uint8Array((await test.manager.readAudio(1)).data)).toEqual(
    new Uint8Array([1, 2, 3])
  );
  await test.manager.dispose();
  expect(test.manager.memory.bytes).toBe(0);
});

test("a missing restored segment still redownloads after persistent writes fail", async () => {
  const test = setup([result([2]), result([0, 1, 2])]);
  for (const index of [0, 1]) test.rows.set(index, segment(index));
  test.cache.listAudio = jest.fn(async () =>
    [0, 1].map((index) => ({
      ...segment(index),
      bytes: 3,
      data: undefined,
    }))
  );
  test.cache.putAudio.mockRejectedValue(
    Object.assign(new Error(), { code: "AUDIO_QUOTA" })
  );
  await test.manager.acquire("asr").ready;
  await test.manager.running;
  test.rows.delete(0);
  await expect(test.manager.readAudio(0)).rejects.toMatchObject({
    code: "AUDIO_CACHE_MISSING",
    cacheReadError: true,
  });
  await test.manager.running;
  expect(test.manager.complete()).toBe(true);
  expect(test.manager.memoryOnly).toBe(true);
  expect(test.bridge.open.mock.calls.map(([, , position]) => position)).toEqual(
    [1000, 0]
  );
  const parts = [];
  for await (const part of test.manager.segmentsFor()) parts.push(part.index);
  expect(parts).toEqual([0, 1, 2]);
  await test.manager.dispose();
});

test("Shorts audio never calls persistent storage and shares downloaded segments with exports", async () => {
  const test = setup();
  test.manager.cacheMode = "session";
  test.manager.memoryOnly = true;
  for (const method of Object.values(test.cache))
    method.mockImplementation(() => {
      throw Error("persistent cache touched");
    });
  await test.manager.acquire("asr").ready;
  await test.manager.acquire("export").ready;
  const parts = [];
  for await (const part of test.manager.segmentsFor())
    parts.push(new Uint8Array(part.data));
  expect(parts).toEqual(
    [0, 1, 2].map((index) => new Uint8Array([index, 2, 3]))
  );
  expect(test.bridge.open).toHaveBeenCalledTimes(1);
  expect(test.manager.state.cacheStatus).toBeUndefined();
  await test.manager.dispose();
  for (const method of Object.values(test.cache))
    expect(method).not.toHaveBeenCalled();
  expect(test.manager.memory.bytes).toBe(0);
});

test("cancelling cache restoration neither retries nor starts a download", async () => {
  const test = setup();
  let releaseRead;
  test.cache.listAudio = jest.fn(
    () =>
      new Promise((resolve) => {
        releaseRead = resolve;
      })
  );
  const lease = test.manager.acquire("asr");
  while (!releaseRead) await new Promise((resolve) => setTimeout(resolve, 0));
  lease.release();
  releaseRead([]);
  await expect(lease.ready).rejects.toHaveProperty("name", "AbortError");
  await test.manager.running;
  expect(test.cache.listAudio).toHaveBeenCalledTimes(1);
  expect(test.bridge.open).not.toHaveBeenCalled();
  await test.manager.dispose();
});

test("downloaded bytes remain available when persistent reads subsequently fail", async () => {
  const test = setup();
  await test.manager.acquire("asr").ready;
  test.cache.getAudio.mockRejectedValueOnce(
    Object.assign(new Error(), { code: "AUDIO_SESSION_MISSING" })
  );
  const parts = [];
  for await (const part of test.manager.segmentsFor()) parts.push(part.index);
  expect(parts).toEqual([0, 1, 2]);
  expect(test.cache.beginAudio).toHaveBeenCalledTimes(1);
  expect(test.bridge.open).toHaveBeenCalledTimes(1);
  await test.manager.dispose();
});
