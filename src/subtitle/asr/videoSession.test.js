import { AsrVideoSession } from "./videoSession";
import { remuxAac, cropAacSentence } from "./audioExport";

jest.mock("mp4box", () =>
  jest.requireActual(require.resolve("mp4box").replace(/\.js$/, ".cjs"))
);

jest.mock("./audioExport", () => ({
  remuxAac: jest.fn(),
  cropAacSentence: jest.fn(),
}));
const identity = {
  videoId: "kSQknoHMFtk",
  trackId: "en-US.4",
  mediaVersion: "140.123",
  durationMs: 4000,
  sourceLanguage: "en",
};
const signatures = {
  recognition: "a".repeat(64),
  segmentation: "b".repeat(64),
  translation: "c".repeat(64),
};
const cachedBlock = (stage = "translated") => ({
  startSample: 0,
  endSample: 64000,
  silent: false,
  endOfMedia: true,
  stage,
  segments: [{ start: 0, end: 4, text: "hello" }],
  subtitles:
    stage === "recognized"
      ? []
      : [
          {
            start: 0,
            end: 4000,
            text: "hello",
            translation: stage === "translated" ? "你好" : "",
          },
        ],
});
const until = async (predicate) => {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error("session did not reach the expected state");
};
let sessions;
beforeEach(() => {
  sessions = [];
});
afterEach(async () => {
  await Promise.all(sessions.map((session) => session.dispose()));
});

function setup({
  cached = null,
  autoComplete = true,
  targetMs = 0,
  durationMs = 4000,
  ...overrides
} = {}) {
  let hooks;
  const rows = new Map();
  const download = {
    index: new Map(),
    sessionId: "media-session",
    state: { phase: "idle" },
    coverageMs: 0,
    expectedSegments: Math.ceil(durationMs / 2000),
    complete: () => download.index.has(download.expectedSegments),
    retry: jest.fn(() => true),
    dispose: jest.fn(async () => {}),
    add(index) {
      const part = {
        index,
        startMs: index ? (index - 1) * 2000 : 0,
        endMs: index * 2000,
        data: new Uint8Array([index]).buffer,
      };
      rows.set(index, part);
      download.index.set(index, part);
      download.coverageMs = index * 2000;
      download.state = { phase: download.complete() ? "complete" : "fetching" };
      hooks.onSegment(part);
      hooks.onState(download.state);
      if (download.complete()) download.resolve?.();
    },
    acquire: jest.fn(() => {
      const ready = new Promise((resolve) => {
        download.resolve = resolve;
        if (download.complete()) resolve();
      });
      Promise.resolve().then(() => {
        if (!download.index.has(0)) {
          download.add(0);
          download.add(1);
          if (autoComplete)
            for (let index = 2; index <= download.expectedSegments; index++)
              download.add(index);
        }
      });
      return { ready, release: jest.fn() };
    }),
    async *segmentsFor() {
      for (const row of rows.values()) yield row;
    },
  };
  const cache = {
    getVideo: jest.fn(async () => cached),
    putChunk: jest.fn(async () => {}),
    removeFailed: jest.fn(async () => {}),
    getAudio: jest.fn(async (_, index) => rows.get(index)),
  };
  const textProcessor = {
    segment: jest.fn(async (segments) =>
      segments.map((segment) => ({
        start: segment.start * 1000,
        end: segment.end * 1000,
        text: segment.text,
        translation: "",
      }))
    ),
    translate: jest.fn(async (cues) =>
      cues.map((cue) => ({ ...cue, translation: "译文" }))
    ),
  };
  const recognize = jest.fn(async (_, chunk) => ({
    silent: chunk.silent,
    segments: chunk.silent
      ? []
      : [
          {
            start: chunk.startSample / 16000,
            end: chunk.endSample / 16000,
            text: `speech ${chunk.startSample}`,
          },
        ],
  }));
  const createDecoder = jest.fn((onAudio) => ({
    async append(bytes) {
      const index = bytes[0];
      if (index)
        await onAudio({
          channels: [new Float32Array(32000).fill(0.1)],
          sampleRate: 16000,
          timestamp: (index - 1) * 2,
        });
    },
    finish: jest.fn(async () => {}),
    close: jest.fn(),
  }));
  const createDownload = jest.fn((options) => {
    hooks = options;
    return download;
  });
  const getLimits = jest.fn(async () => ({}));
  const onSubtitles = jest.fn(),
    onState = jest.fn();
  const session = new AsrVideoSession({
    identity: { ...identity, durationMs },
    asrService: { apiSlug: "asr", asrMaxDurationSeconds: 1 },
    setting: {},
    bridge: {},
    cache,
    textProcessor,
    signatures,
    recognize,
    createDecoder,
    createDownload,
    getLimits,
    targetMs,
    onSubtitles,
    onState,
    ...overrides,
  });
  sessions.push(session);
  return {
    session,
    download,
    cache,
    textProcessor,
    recognize,
    createDecoder,
    createDownload,
    getLimits,
    onSubtitles,
  };
}

test("complete bilingual cache hits invoke zero download, decoder, ASR, translation or runtime-limit work", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  expect(test.session.state.phase).toBe("cached");
  expect(test.session.subtitles()[0].translation).toBe("你好");
  for (const mock of [
    test.createDownload,
    test.createDecoder,
    test.recognize,
    test.textProcessor.translate,
    test.getLimits,
  ])
    expect(mock).not.toHaveBeenCalled();
});

test("translation-only invalidation reuses ASR originals without downloading or decoding audio", async () => {
  const test = setup({
    cached: {
      chunks: [cachedBlock("segmented")],
      translation: { complete: false },
    },
  });
  await test.session.start();
  await until(() => test.session.state.translation.complete);
  expect(test.session.subtitles()[0].translation).toBe("译文");
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.createDownload).not.toHaveBeenCalled();
});

test("download/decode/ASR/translation submit incrementally; each interval is persisted and complete on EOF", async () => {
  const test = setup({ autoComplete: false });
  await test.session.start();
  await until(() => test.recognize.mock.calls.length > 0);
  expect(test.download.complete()).toBe(false);
  test.download.add(2);
  await until(() => test.session.state.phase === "complete");
  const calls = test.recognize.mock.calls.map((call) => [
    call[1].startSample,
    call[1].endSample,
  ]);
  expect(calls).toEqual([
    [0, 16000],
    [16000, 32000],
    [32000, 48000],
    [48000, 64000],
  ]);
  expect(test.cache.putChunk).toHaveBeenCalled();
  expect(test.session.state.recognition.complete).toBe(true);
});

test("current position waits for sequential download and is recognized before earlier missing intervals", async () => {
  const test = setup({ autoComplete: false, targetMs: 3000 });
  await test.session.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(test.recognize).not.toHaveBeenCalled();
  test.download.add(2);
  await until(() => test.session.state.phase === "complete");
  expect(test.recognize.mock.calls[0][1].startSample).toBe(48000);
  expect(test.createDownload).toHaveBeenCalledTimes(1);
});

test("failed ASR intervals do not spin; manual retry reuses compressed media and successful subtitles", async () => {
  const onTask = jest.fn();
  const test = setup({ onTask });
  test.recognize.mockRejectedValueOnce(
    Object.assign(new Error("failed"), { code: "ASR_FAILED" })
  );
  await test.session.start();
  await until(
    () =>
      test.session.blocks.size === 4 &&
      !test.session.work &&
      !test.session.postWork
  );
  expect(test.session.state.recognition.complete).toBe(false);
  expect(test.recognize).toHaveBeenCalledTimes(4);
  expect(onTask).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "block-0",
      errorCode: "ASR_FAILED",
      errorDetail: "failed",
    })
  );
  expect(test.session.blocks.get(0).errorDetail).toBeUndefined();
  await test.session.retryRecognition();
  await until(() => test.session.state.phase === "complete");
  expect(test.recognize).toHaveBeenCalledTimes(5);
  expect(test.createDownload).toHaveBeenCalledTimes(1);
});

test("a runtime host failure pauses recognition across downloads and seeks until manual retry", async () => {
  const test = setup();
  test.recognize.mockRejectedValueOnce(
    Object.assign(new Error("Offscreen startup failed"), {
      code: "HOST_STARTUP_FAILED",
    })
  );
  await test.session.start();
  await until(() => test.session.state.phase === "error" && !test.session.work);
  expect(test.recognize).toHaveBeenCalledTimes(1);
  test.session.wake();
  test.session.seek(3000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(test.recognize).toHaveBeenCalledTimes(1);
  expect(test.session.state.recognitionError).toBe("HOST_STARTUP_FAILED");
  await test.session.retryRecognition();
  await until(() => test.session.state.phase === "complete");
  expect(test.createDownload).toHaveBeenCalledTimes(1);
});

test("only-captions cache audio export acquires audio but never calls ASR or translation", async () => {
  remuxAac.mockImplementation(async (parts) => {
    const indices = [];
    for await (const part of parts) indices.push(part.index);
    return { blob: new Blob([String(indices)]) };
  });
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  await test.session.exportFull();
  expect(remuxAac).toHaveBeenCalledTimes(1);
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
  expect(test.createDecoder).not.toHaveBeenCalled();
});

test("sentence export coalesces repeated clicks and keeps ASR out of cached-audio reacquisition", async () => {
  let resolve;
  cropAacSentence.mockImplementation(
    () =>
      new Promise((yes) => {
        resolve = yes;
      })
  );
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  const cue = { start: 0, end: 1000 },
    first = test.session.exportSentence(cue),
    second = test.session.exportSentence(cue);
  await until(() => !!resolve);
  resolve({ blob: new Blob(["wav"]) });
  await Promise.all([first, second]);
  expect(cropAacSentence).toHaveBeenCalledTimes(1);
  expect(test.recognize).not.toHaveBeenCalled();
});

test("rapid seeks finish the current ASR call, then process the final target without another download", async () => {
  const test = setup();
  let finish;
  const normal = test.recognize.getMockImplementation();
  test.recognize.mockImplementationOnce(
    (...args) =>
      new Promise((resolve) => {
        finish = () => resolve(normal(...args));
      })
  );
  await test.session.start();
  await until(() => !!finish);
  test.session.beginSeek();
  test.session.seek(2000);
  test.session.beginSeek();
  test.session.seek(3000);
  expect(test.recognize).toHaveBeenCalledTimes(1);
  finish();
  await until(() => test.session.state.phase === "complete");
  expect(test.recognize.mock.calls[1][1].startSample).toBe(48000);
  expect(test.createDownload).toHaveBeenCalledTimes(1);
});

test("late ASR results after disposal cannot save subtitles; a new session waits for the old service slot", async () => {
  const first = setup();
  let finish;
  first.recognize.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await first.session.start();
  await until(() => !!finish);
  const disposed = first.session.dispose();
  const next = setup();
  await next.session.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(next.recognize).not.toHaveBeenCalled();
  finish({ silent: false, segments: [{ start: 0, end: 1, text: "old" }] });
  await disposed;
  await until(() => next.session.state.phase === "complete");
  expect(first.cache.putChunk).not.toHaveBeenCalled();
  expect(first.session.blocks.size).toBe(0);
});

test("translation failure retry reuses originals and never starts an additional ASR call", async () => {
  const test = setup({
    cached: {
      chunks: [cachedBlock("segmented")],
      translation: { complete: false },
    },
  });
  test.textProcessor.translate.mockRejectedValueOnce(
    Object.assign(new Error(), { code: "NETWORK" })
  );
  await test.session.start();
  await until(() => test.session.postFailures.size === 1);
  test.session.retryTranslation();
  await until(() => test.session.state.translation.complete);
  expect(test.textProcessor.translate).toHaveBeenCalledTimes(2);
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.createDownload).not.toHaveBeenCalled();
});

test("cache write failure keeps visible subtitles and explicit retry persists them without services", async () => {
  const test = setup();
  test.cache.putChunk.mockRejectedValueOnce(
    Object.assign(new Error(), { code: "SUBTITLE_QUOTA" })
  );
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  expect(test.session.subtitles().length).toBeGreaterThan(0);
  expect(test.session.state.cacheSaved).toBe(false);
  const calls = test.recognize.mock.calls.length;
  await test.session.retrySave();
  expect(test.session.state.cacheSaved).toBe(true);
  expect(test.recognize).toHaveBeenCalledTimes(calls);
});

test("cancelling full export releases only its lease while the ASR lease remains", async () => {
  const test = setup({ autoComplete: false });
  await test.session.start();
  const task = test.session.exportFull();
  test.session.cancelFullExport();
  // The download test double resolves a pending owner when the final media part arrives.
  test.download.add(2);
  await expect(task).rejects.toHaveProperty("name", "AbortError");
  await until(() => test.session.state.phase === "complete");
  expect(test.session.signal.aborted).toBe(false);
  expect(test.session.asrLease).toBeDefined();
});

test("mixed response timing skips segmentation only for text-only blocks", async () => {
  const test = setup();
  test.recognize.mockImplementation(async (_, chunk) => ({
    silent: false,
    timingSource: chunk.startSample === 0 ? "audio-chunk" : "asr",
    segments: [
      {
        start: chunk.startSample / 16000,
        end: chunk.endSample / 16000,
        text: "One. Two!",
      },
    ],
  }));
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  const cues = test.session.subtitles();
  expect(cues[0]).toMatchObject({
    start: 0,
    end: 1000,
    text: "One. Two!",
    timingSource: "audio-chunk",
    translation: "译文",
  });
  expect(test.textProcessor.segment).toHaveBeenCalledTimes(
    test.recognize.mock.calls.length - 1
  );
  expect(test.session.state.timingSource).toBe("audio-chunk");
  expect(test.cache.putChunk).toHaveBeenCalled();
});

test("complete audio-block cache restores without download, decode, recognition or translation", async () => {
  const block = cachedBlock();
  block.timingSource = "audio-chunk";
  block.subtitles[0].timingSource = "audio-chunk";
  const test = setup({
    cached: { chunks: [block], translation: { complete: true } },
  });
  await test.session.start();
  expect(test.session.state.phase).toBe("cached");
  expect(test.session.subtitles()[0].timingSource).toBe("audio-chunk");
  for (const mock of [
    test.createDownload,
    test.createDecoder,
    test.recognize,
    test.textProcessor.segment,
    test.textProcessor.translate,
  ])
    expect(mock).not.toHaveBeenCalled();
});

test("recognized audio-block cache translates directly without resegmentation", async () => {
  const block = { ...cachedBlock("recognized"), timingSource: "audio-chunk" };
  const test = setup({
    cached: { chunks: [block], translation: { complete: false } },
  });
  await test.session.start();
  await until(
    () =>
      test.session.state.phase === "cached" ||
      test.session.state.phase === "complete"
  );
  expect(test.textProcessor.segment).not.toHaveBeenCalled();
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).toHaveBeenCalledTimes(1);
  expect(test.session.subtitles()[0]).toMatchObject({
    start: 0,
    end: 4000,
    timingSource: "audio-chunk",
  });
});

test("a long text-only response is retained once and later chunks and seeks stay short", async () => {
  const test = setup({
    durationMs: 40000,
    asrService: { asrTimestampSupport: "supported", asrMaxDurationSeconds: 30 },
  });
  const recognize = test.recognize.getMockImplementation();
  test.recognize.mockImplementation(async (...args) => ({
    ...(await recognize(...args)),
    timingSource: "audio-chunk",
  }));
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  const calls = test.recognize.mock.calls.map((call) => call[1]);
  expect(calls[0].audio.length).toBeGreaterThan(5 * 16000);
  let end = 0;
  for (const [index, chunk] of calls.entries()) {
    expect(chunk.startSample).toBe(end);
    if (index) expect(chunk.audio.length).toBeLessThanOrEqual(5 * 16000);
    end = chunk.endSample;
  }
  expect(end).toBe(40 * 16000);
  expect(test.session.state.timestampDowngraded).toBe(true);
  expect(test.session.state.chunkDurationSeconds).toBe(5);
  expect(test.textProcessor.segment).not.toHaveBeenCalled();
  test.session.seek(35000);
  expect(test.session.timestampDowngraded).toBe(true);
});
