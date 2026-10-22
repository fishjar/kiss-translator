import { AsrVideoSession } from "./videoSession";
import { remuxAac, cropAacSentence } from "./audioExport";
import { IDBFactory } from "fake-indexeddb";
import { serialize, deserialize } from "v8";
import { AsrCacheStore } from "./cacheStore";
import { AudioDownloadManager } from "./downloadManager";
import { webcrypto } from "crypto";
import { TextEncoder } from "util";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});
globalThis.TextEncoder = TextEncoder;

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
  download.readAudio = (index, options) =>
    overrides.cacheMode === "session"
      ? rows.get(index)
      : cache.getAudio(download.sessionId, index, options);
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

test("automatic language detection retries distinct blocks and backfills deferred blocks after detection", async () => {
  const test = setup({ language: "auto" });
  const normal = test.recognize.getMockImplementation();
  test.recognize
    .mockImplementationOnce(async () => ({ languagePending: true }))
    .mockImplementationOnce(async () => ({ languagePending: true }))
    .mockImplementationOnce(async (...args) => ({
      ...(await normal(...args)),
      language: "zh",
      languageConfidence: 0.97,
    }));
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  expect(
    test.recognize.mock.calls.slice(0, 3).map(([, chunk]) => chunk.startSample)
  ).toEqual([0, 16000, 32000]);
  expect(test.session.state).toMatchObject({
    effectiveLanguage: "zh",
    languageSource: "detected",
  });
  expect(
    test.recognize.mock.calls
      .slice(3)
      .every(([, , options]) => options.language === "zh")
  ).toBe(true);
  expect(
    [...test.session.blocks.values()].every(
      (block) => block.stage === "translated"
    )
  ).toBe(true);
});

test("translation target changes reuse recognition and segmentation without downloading audio", async () => {
  const test = setup({
    cached: {
      chunks: [cachedBlock()],
      recognition: { complete: true },
      translation: { complete: true },
    },
  });
  await test.session.start();
  const processor = {
    translate: jest.fn(async (cues) =>
      cues.map((cue) => ({ ...cue, translation: "日本語" }))
    ),
  };
  const nextSignatures = { ...signatures, translation: "d".repeat(64) };
  const changing = test.session.setTranslationTarget(
    { toLang: "ja" },
    processor,
    Promise.resolve(nextSignatures)
  );
  expect(test.session.subtitles()[0].translation).toBe("");
  await changing;
  await until(() => test.session.state.phase === "complete");
  expect(test.session.subtitles()[0]).toMatchObject({
    text: "hello",
    translation: "日本語",
  });
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.createDownload).not.toHaveBeenCalled();
  expect(test.textProcessor.segment).not.toHaveBeenCalled();
  expect(test.cache.putChunk).toHaveBeenLastCalledWith(
    test.session.textIdentity,
    nextSignatures,
    expect.objectContaining({ stage: "translated" }),
    expect.any(Object)
  );
});

test("rapid target changes discard old translation callbacks and apply only the final target", async () => {
  const test = setup({
    cached: {
      chunks: [cachedBlock("segmented")],
      recognition: { complete: true },
      translation: { complete: false },
    },
  });
  let finish;
  test.textProcessor.translate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await test.session.start();
  await until(() => !!finish);
  const oldCall = test.textProcessor.translate.mock.calls[0];
  const japanese = { translate: jest.fn() };
  const french = {
    translate: jest.fn(async (cues) =>
      cues.map((cue) => ({ ...cue, translation: "bonjour" }))
    ),
  };
  const first = test.session.setTranslationTarget(
    { toLang: "ja" },
    japanese,
    Promise.resolve(signatures)
  );
  const second = test.session.setTranslationTarget(
    { toLang: "fr" },
    french,
    Promise.resolve(signatures)
  );
  expect(oldCall[1].aborted).toBe(true);
  oldCall[2]([{ start: 0, end: 4000, text: "hello", translation: "stale" }]);
  expect(test.session.subtitles()[0].translation).toBe("");
  finish([{ start: 0, end: 4000, text: "hello", translation: "stale" }]);
  await Promise.all([first, second]);
  await until(() => test.session.state.phase === "complete");
  expect(japanese.translate).not.toHaveBeenCalled();
  expect(test.session.subtitles()[0].translation).toBe("bonjour");
  expect(test.session.signal.aborted).toBe(false);
  expect(test.recognize).not.toHaveBeenCalled();
});

test("three ambiguous speech blocks stop recognition and request a manual language", async () => {
  const test = setup({ language: "auto" });
  test.recognize.mockResolvedValue({ languagePending: true });
  await test.session.start();
  await until(() => test.session.recognitionPaused);
  expect(test.recognize).toHaveBeenCalledTimes(3);
  expect(test.session.state.recognitionError).toBe("LANGUAGE_UNCERTAIN");
  expect(test.session.subtitles()).toEqual([]);
});

test("language switching transfers session-only audio without disposing or downloading it again", async () => {
  const old = setup({ cacheMode: "session" });
  await old.session.start();
  await until(() => old.session.state.phase === "complete");
  old.download.identity = old.session.identity;
  const retainedAudio = old.session.takeAudio();
  await old.session.dispose();
  expect(old.download.dispose).not.toHaveBeenCalled();
  const next = setup({
    cacheMode: "session",
    retainedAudio,
    language: "zh-hans",
  });
  await next.session.start();
  await until(() => next.session.state.phase === "complete");
  expect(next.session.download).toBe(old.download);
  expect(next.createDownload).not.toHaveBeenCalled();
  expect(
    next.recognize.mock.calls.every(
      ([, , options]) => options.language === "zh-hans"
    )
  ).toBe(true);
});

test("complete bilingual cache hits read cutting limits but invoke no audio or text services", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  expect(test.session.state.phase).toBe("cached");
  expect(test.session.state.cutting).toBeUndefined();
  expect(test.session.subtitles()[0].translation).toBe("你好");
  for (const mock of [
    test.createDownload,
    test.createDecoder,
    test.recognize,
    test.textProcessor.translate,
  ])
    expect(mock).not.toHaveBeenCalled();
});

test.each([false, true])(
  "reopened persistent database reuses audio and recognition; translation invalidated=%s",
  async (invalidateTranslation) => {
    const factory = new IDBFactory();
    const oldClone = globalThis.structuredClone;
    globalThis.structuredClone = (value) => deserialize(serialize(value));
    let db = new AsrCacheStore({ indexedDB: factory });
    let session;
    try {
      await db.putChunk(identity, signatures, cachedBlock());
      await db.beginAudio("old-audio-session", identity);
      for (const index of [0, 1, 2])
        await db.putAudio("old-audio-session", {
          index,
          startMs: index ? (index - 1) * 2000 : 0,
          endMs: index * 2000,
          data: new Uint8Array([index, 8]).buffer,
        });
      const name = db.name;
      await db.close();
      db = new AsrCacheStore({ name, indexedDB: factory });
      const bridge = { open: jest.fn(), next: jest.fn(), clear: jest.fn() };
      const test = setup({
        cache: db,
        bridge,
        signatures: invalidateTranslation
          ? { ...signatures, translation: "d".repeat(64) }
          : signatures,
        createDownload: (options) => new AudioDownloadManager(options),
      });
      session = test.session;
      await session.start();
      if (invalidateTranslation) await session.postWork;
      const lease = session.ensureDownload().acquire("restore-audio");
      await lease.ready;
      const bytes = [];
      for await (const part of session.download.segmentsFor())
        bytes.push([...new Uint8Array(part.data)]);
      expect(bytes).toEqual([
        [0, 8],
        [1, 8],
        [2, 8],
      ]);
      expect(session.download.sessionId).toBe("old-audio-session");
      for (const mock of [
        bridge.open,
        bridge.next,
        test.recognize,
        test.createDecoder,
        test.textProcessor.segment,
      ])
        expect(mock).not.toHaveBeenCalled();
      expect(test.textProcessor.translate).toHaveBeenCalledTimes(
        invalidateTranslation ? 1 : 0
      );
      lease.release();
    } finally {
      await session?.dispose();
      await db.close();
      globalThis.structuredClone = oldClone;
    }
  }
);

test("restored text survives unavailable persistent audio without rerunning text services", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
    audioLookup: false,
  });
  await test.session.start();
  await test.session.resumeAudio();
  expect(test.session.state.phase).toBe("cached");
  expect(test.createDownload).toHaveBeenCalledTimes(1);
  expect(test.createDownload.mock.calls[0][0].audioLookup).toBe(false);
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
  expect(test.getLimits).toHaveBeenCalledTimes(1);
});

test("failed caption read is attempted once and audio processing continues", async () => {
  const test = setup();
  test.cache.getVideo.mockRejectedValue(
    Object.assign(new Error(), { code: "CACHE_TIMEOUT" })
  );
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  expect(test.cache.getVideo).toHaveBeenCalledTimes(1);
  expect(test.createDownload).toHaveBeenCalledTimes(1);
  expect(test.recognize).toHaveBeenCalled();
  expect(test.session.audioCacheError).toBeUndefined();
});

test("Shorts session processes audio and text without touching persistent cache", async () => {
  const test = setup({ cacheMode: "session" });
  for (const method of Object.values(test.cache)) {
    if (jest.isMockFunction(method))
      method.mockImplementation(() => {
        throw Error("persistent cache touched");
      });
  }
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  expect(test.session.subtitles().length).toBeGreaterThan(0);
  expect(test.session.state.cacheRestored).toBeFalsy();
  expect(test.session.state.cacheMode).toBe("session");
  for (const method of Object.values(test.cache))
    if (jest.isMockFunction(method)) expect(method).not.toHaveBeenCalled();
  expect(test.createDownload.mock.calls[0][0].cacheMode).toBe("session");
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

test("mid-block startup uses the same canonical boundaries and backfills after later blocks", async () => {
  const baseline = setup();
  await baseline.session.start();
  await until(() => baseline.session.state.phase === "complete");
  const onTask = jest.fn();
  const middle = setup({ targetMs: 1500, onTask });
  await middle.session.start();
  await until(() => middle.session.state.phase === "complete");
  expect([...middle.session.chunkIndex.values()]).toEqual([
    ...baseline.session.chunkIndex.values(),
  ]);
  expect(
    middle.recognize.mock.calls.map(([, chunk]) => chunk.startSample)
  ).toEqual([16000, 32000, 48000, 0]);
  expect(
    middle.textProcessor.translate.mock.calls.map(([cues]) => cues[0].start)
  ).toEqual([1000, 2000, 3000, 0]);
  for (const indexed of middle.session.chunkIndex.values())
    expect(indexed.audio).toBeUndefined();
  expect(middle.session.state.cutting.complete).toBe(true);
  expect(
    onTask.mock.calls.some(
      ([task]) => task.indexed && task.recognition === "waiting"
    )
  ).toBe(true);
});

test("streaming waits do not flush the canonical cutting state", async () => {
  const test = setup({
    autoComplete: false,
    targetMs: 2500,
    asrService: { asrMaxDurationSeconds: 3 },
  });
  await test.session.start();
  await until(
    () => test.session.indexWork && test.session.mediaWaiters.size > 0
  );
  expect(test.session.chunkIndex.size).toBe(0);
  expect(test.recognize).not.toHaveBeenCalled();
  test.session.beginSeek();
  test.session.seek(2300);
  test.download.add(2);
  await until(() => test.session.state.phase === "complete");
  const baseline = setup({ asrService: { asrMaxDurationSeconds: 3 } });
  await baseline.session.start();
  await until(() => baseline.session.state.phase === "complete");
  expect([...test.session.chunkIndex.values()]).toEqual([
    ...baseline.session.chunkIndex.values(),
  ]);
  expect(test.recognize.mock.calls[0][1].startSample).toBe(32000);
  expect(test.createDecoder.mock.calls.length).toBe(
    1 + test.recognize.mock.calls.length
  );
});

test("inline recognition retries only the selected failed block and preserves other failures", async () => {
  const test = setup();
  test.recognize
    .mockRejectedValueOnce(
      Object.assign(new Error("first"), { code: "ASR_FAILED" })
    )
    .mockRejectedValueOnce(
      Object.assign(new Error("second"), { code: "INVALID_RESPONSE" })
    );
  await test.session.start();
  await until(
    () =>
      test.session.blocks.size === 4 &&
      !test.session.work &&
      !test.session.postWork
  );
  expect(test.session.state.stoppedByError).toBe(true);
  const successful = test.session.blocks.get(32000);
  await Promise.all([
    test.session.retryRecognition("block-0"),
    test.session.retryRecognition("block-0"),
  ]);
  await until(
    () =>
      test.session.blocks.get(0)?.stage === "translated" &&
      !test.session.work &&
      !test.session.postWork
  );
  expect(test.recognize).toHaveBeenCalledTimes(5);
  expect(test.session.blocks.get(16000).stage).toBe("failed");
  expect(test.session.blocks.get(32000)).toBe(successful);
  expect(test.cache.removeFailed).not.toHaveBeenCalled();
  expect(test.download.retry).not.toHaveBeenCalled();
  expect(test.session.state.stoppedByError).toBe(true);
});

test("inline translation retries only the selected failure without invoking ASR", async () => {
  const test = setup();
  test.textProcessor.translate
    .mockRejectedValueOnce(
      Object.assign(new Error("first"), { code: "TRANSLATION_FAILED" })
    )
    .mockRejectedValueOnce(
      Object.assign(new Error("second"), { code: "TRANSLATION_FAILED" })
    );
  await test.session.start();
  await until(
    () =>
      test.session.blocks.size === 4 &&
      !test.session.work &&
      !test.session.postWork
  );
  const recognitionCalls = test.recognize.mock.calls.length;
  const translations = test.textProcessor.translate.mock.calls.length;
  test.session.retryTranslation("block-0");
  test.session.retryTranslation("block-0");
  await until(
    () =>
      test.session.blocks.get(0)?.stage === "translated" &&
      !test.session.postWork
  );
  expect(test.textProcessor.translate).toHaveBeenCalledTimes(translations + 1);
  expect(test.recognize).toHaveBeenCalledTimes(recognitionCalls);
  expect(test.session.postFailures.has(16000)).toBe(true);
  expect(test.session.state.stoppedByError).toBe(true);
});

test("global retry fills recognition and translation gaps without redoing successful blocks", async () => {
  const test = setup();
  test.recognize.mockRejectedValueOnce(
    Object.assign(new Error("asr"), { code: "ASR_FAILED" })
  );
  test.textProcessor.translate.mockRejectedValueOnce(
    Object.assign(new Error("translation"), { code: "TRANSLATION_FAILED" })
  );
  await test.session.start();
  await until(
    () =>
      test.session.blocks.size === 4 &&
      !test.session.work &&
      !test.session.postWork
  );
  const successful = [...test.session.blocks.values()].filter(
    (block) => block.stage === "translated"
  );
  expect(test.session.state.stoppedByError).toBe(true);
  await test.session.retryIncomplete();
  await until(
    () =>
      test.session.state.phase === "complete" &&
      !test.session.work &&
      !test.session.postWork
  );
  expect(test.recognize).toHaveBeenCalledTimes(5);
  expect(test.textProcessor.translate).toHaveBeenCalledTimes(5);
  for (const block of successful)
    expect(test.session.blocks.get(block.startSample)).toBe(block);
  expect(test.download.retry).toHaveBeenCalledTimes(1);
  expect(test.session.state.stoppedByError).toBe(false);
  expect(test.session.state.failures).toEqual([]);
});

test("recognition worker errors stop queued work until global retry", async () => {
  const test = setup();
  const run = jest
    .spyOn(test.session, "runRecognition")
    .mockRejectedValueOnce(
      Object.assign(new Error("decode failed"), { code: "AUDIO_DECODE_FAILED" })
    );
  await test.session.start();
  await until(
    () =>
      test.session.workError && !test.session.work && test.download.complete()
  );
  expect(test.session.state.stoppedByError).toBe(true);
  test.session.wake();
  expect(run).toHaveBeenCalledTimes(1);
  run.mockRestore();
  await test.session.retryIncomplete();
  await until(() => test.session.state.phase === "complete");
  expect(test.session.workError).toBeUndefined();
  expect(test.session.state.stoppedByError).toBe(false);
});

test("same-language cached results do not hide a stopped audio download", async () => {
  const test = setup({
    cached: {
      chunks: [cachedBlock("recognized")],
      recognition: { complete: true },
      translation: { complete: false },
    },
    setting: { toLang: "en" },
  });
  await test.session.start();
  expect(test.session.cacheHit).toBe(true);
  test.session.ensureDownload();
  test.download.error = Object.assign(new Error("network"), {
    code: "AUDIO_NETWORK",
  });
  test.download.state = { phase: "error", code: "AUDIO_NETWORK" };
  test.session.emit();
  expect(test.session.state.stoppedByError).toBe(true);
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
});

test("global cache recovery reacquires missing audio while preserving complete subtitles", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  const before = test.session.subtitles();
  test.session.emit({ recognitionError: "AUDIO_CACHE_MISSING" });
  expect(test.session.state.stoppedByError).toBe(true);
  await test.session.retryIncomplete();
  await until(() => test.download.complete());
  expect(test.createDownload).toHaveBeenCalledTimes(1);
  expect(test.session.subtitles()).toEqual(before);
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
  expect(test.session.state.stoppedByError).toBe(false);
});

test("active downloads, automatic reconnects and pauses suppress global failure state", async () => {
  const test = setup();
  test.recognize.mockRejectedValueOnce(
    Object.assign(new Error("asr"), { code: "ASR_FAILED" })
  );
  await test.session.start();
  await until(
    () =>
      test.session.blocks.size === 4 &&
      !test.session.work &&
      !test.session.postWork
  );
  for (const phase of ["fetching", "restoring", "cooldown"]) {
    test.download.state = { phase, reconnecting: true };
    test.session.emit();
    expect(test.session.state.stoppedByError).toBe(false);
  }
  test.download.state = { phase: "complete" };
  test.session.emit();
  expect(test.session.state.stoppedByError).toBe(true);
  test.session.pause();
  expect(test.session.state.stoppedByError).toBe(false);
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

test("returning to the same Shorts does not wait for an aborted service call or retain its text", async () => {
  const first = setup({ cacheMode: "session" });
  let finish;
  first.recognize.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await first.session.start();
  await until(() => !!finish);
  const disposing = first.session.dispose();
  const next = setup({ cacheMode: "session" });
  await next.session.start();
  await until(() => next.session.state.phase === "complete");
  expect(next.recognize).toHaveBeenCalled();
  expect(first.session.blocks.size).toBe(0);
  finish({ silent: false, segments: [{ start: 0, end: 1, text: "old" }] });
  await disposing;
  expect(first.cache.putChunk).not.toHaveBeenCalled();
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

test("timestamp downgrade retains results without changing canonical block boundaries", async () => {
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
  for (const chunk of calls) {
    expect(chunk.startSample).toBe(end);
    expect(chunk.audio.length).toBeLessThanOrEqual(30 * 16000);
    end = chunk.endSample;
  }
  expect(end).toBe(40 * 16000);
  expect(test.session.state.timestampDowngraded).toBe(true);
  expect(test.session.state.chunkDurationSeconds).toBe(30);
  expect(test.textProcessor.segment).not.toHaveBeenCalled();
  test.session.seek(35000);
  expect(test.session.timestampDowngraded).toBe(true);
});

test("session.start emits phase: 'restoring' before cache resolution", async () => {
  const states = [];
  let resolveGetVideo;
  const test = setup({
    onState: (s) => states.push(s.phase),
  });
  test.cache.getVideo = jest.fn(
    () =>
      new Promise((resolve) => {
        resolveGetVideo = resolve;
      })
  );

  const startPromise = test.session.start();
  expect(states).toContain("restoring");
  await until(() => !!resolveGetVideo);

  resolveGetVideo({
    identity: test.session.identity,
    chunks: [],
    recognition: { percent: 0 },
    translation: { percent: 0 },
  });
  await startPromise;
  await test.session.dispose();
});

test("exportFull disposes and clears download on AUDIO_CACHE_MISSING", async () => {
  const test = setup();
  remuxAac.mockImplementation(async (segments) => {
    for await (const _ of segments) {
    }
  });
  const disposeSpy = jest.fn(async () => {});
  const fakeDownload = {
    acquire: jest.fn(() => ({ ready: Promise.resolve(), release: jest.fn() })),
    segmentsFor: async function* () {
      throw Object.assign(new Error("missing"), {
        code: "AUDIO_CACHE_MISSING",
      });
    },
    dispose: disposeSpy,
  };
  test.session.download = fakeDownload;
  test.session.ensureDownload = jest.fn(() => fakeDownload);

  await expect(test.session.exportFull()).rejects.toMatchObject({
    code: "AUDIO_CACHE_MISSING",
  });
  expect(disposeSpy).toHaveBeenCalled();
  expect(test.session.download).toBeUndefined();

  await test.session.dispose();
});

test.each(["full", "sentence"])(
  "%s export drops stale metadata and the next click downloads reusable audio",
  async (kind) => {
    const parts = [0, 1, 2].map((index) => ({
      index,
      startMs: index ? (index - 1) * 2000 : 0,
      endMs: index * 2000,
      data: new Uint8Array([index, 8]).buffer,
    }));
    const index = parts.map(({ data, ...part }) => ({
      ...part,
      bytes: data.byteLength,
    }));
    const cache = {
      getVideo: jest.fn(async () => ({
        chunks: [cachedBlock()],
        translation: { complete: true },
      })),
      beginAudio: jest.fn(async () => {}),
      getAudio: jest.fn(async () => null),
      releaseAudio: jest.fn(async () => {}),
      putAudio: jest.fn(),
    };
    const bridge = {
      open: jest.fn(async () => ({ identity })),
      next: jest.fn(async () => ({
        segments: parts,
        expectedSegments: 2,
        expectedEndMs: 4000,
      })),
    };
    const test = setup({
      cached: null,
      cache,
      bridge,
      audioLookup: { sessionId: "old-audio-session", identity, index },
      audioSessionId: "old-audio-session",
      createDownload: (options) => new AudioDownloadManager(options),
    });
    const consume = async (segments) => {
      const output = [];
      for await (const part of segments)
        output.push([...new Uint8Array(part.data)]);
      return output;
    };
    remuxAac.mockImplementation(consume);
    cropAacSentence.mockImplementation(consume);
    await test.session.start();
    const before = test.session.subtitles();
    const run = () =>
      kind === "full"
        ? test.session.exportFull()
        : test.session.exportSentence({ start: 0, end: 4000 });
    await expect(run()).rejects.toHaveProperty("code", "AUDIO_CACHE_MISSING");
    expect(bridge.next).not.toHaveBeenCalled();
    expect(test.session.audioLookup).toBe(false);
    expect(test.session.audioSessionId).toBeUndefined();
    expect(test.session.download).toBeUndefined();
    const expected = [
      [0, 8],
      [1, 8],
      [2, 8],
    ];
    await expect(run()).resolves.toEqual(expected);
    const downloads = bridge.next.mock.calls.length;
    await expect(run()).resolves.toEqual(expected);
    expect(bridge.next).toHaveBeenCalledTimes(downloads);
    expect(cache.getAudio).toHaveBeenCalledTimes(1);
    expect(cache.putAudio).not.toHaveBeenCalled();
    expect(test.session.subtitles()).toEqual(before);
    expect(test.recognize).not.toHaveBeenCalled();
    expect(test.textProcessor.segment).not.toHaveBeenCalled();
    expect(test.textProcessor.translate).not.toHaveBeenCalled();
  }
);

test("late cleanup of missing audio preserves the replacement downloader and lease", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  let finish;
  const old = {
    dispose: jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    ),
  };
  test.session.download = old;
  const cleaning = test.session.discardMissingAudio(old);
  const replacement = { dispose: jest.fn(async () => {}) };
  const lease = { release: jest.fn() };
  test.session.download = replacement;
  test.session.asrLease = lease;
  finish();
  await cleaning;
  expect(test.session.download).toBe(replacement);
  expect(test.session.asrLease).toBe(lease);
  expect(lease.release).not.toHaveBeenCalled();
});

test("recognition retry discards the failed cached index without losing successful text", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  const before = test.session.subtitles();
  test.session.audioLookup = { sessionId: "old", index: [{ index: 0 }] };
  test.session.audioSessionId = "old";
  test.session.download = { dispose: jest.fn(async () => {}) };
  test.session.state.recognitionError = "AUDIO_CACHE_MISSING";
  await test.session.retryRecognition();
  expect(test.session.audioLookup).toBe(false);
  expect(test.session.audioSessionId).toBeUndefined();
  expect(test.session.subtitles()).toEqual(before);
  expect(test.recognize).not.toHaveBeenCalled();
});

test("cache matching and recognition wait for the frozen cutting limits", async () => {
  let resolve;
  const limits = new Promise((done) => {
    resolve = done;
  });
  const test = setup({
    getLimits: () => limits,
    audioSessionId: "legacy-audio",
  });
  const startup = test.session.start();
  await new Promise((done) => setTimeout(done, 10));
  expect(test.createDownload).not.toHaveBeenCalled();
  expect(test.recognize).not.toHaveBeenCalled();
  resolve({});
  await startup;
  expect(test.createDownload).toHaveBeenCalledWith(
    expect.objectContaining({ sessionId: "legacy-audio" })
  );
  await until(() => test.recognize.mock.calls.length > 0);
});

test("uncached audio publishes recognized and translated text to both task and subtitle consumers", async () => {
  const onTask = jest.fn();
  const test = setup({ onTask });
  await test.session.start();
  await until(() => test.session.state.phase === "complete");
  const completed = onTask.mock.calls
    .map(([task]) => task)
    .filter((task) => task.kind === "block" && task.translation === "complete");
  expect(completed.length).toBeGreaterThan(0);
  expect(completed[0]).toMatchObject({
    text: expect.stringContaining("speech"),
    translationText: "译文",
  });
  expect(test.onSubtitles).toHaveBeenLastCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        text: expect.stringContaining("speech"),
        translation: "译文",
      }),
    ]),
    expect.objectContaining({ phase: "complete" })
  );
});

test("audio reset waits for old recognition and rejects its late result before resuming", async () => {
  const test = setup();
  let finish;
  test.recognize.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await test.session.start();
  await until(() => !!finish);
  const signal = test.recognize.mock.calls[0][2].signal;
  const resume = jest.spyOn(test.session, "resumeAudio");
  const reset = test.session.resetAudio();
  expect(signal.aborted).toBe(true);
  expect(test.download.dispose).toHaveBeenCalledTimes(1);
  expect(test.session.download).toBeUndefined();
  expect(resume).not.toHaveBeenCalled();
  finish({
    silent: false,
    timingSource: "asr",
    segments: [{ start: 0, end: 1, text: "stale audio" }],
  });
  await reset;
  await until(() => test.session.state.phase === "complete");
  expect(resume).toHaveBeenCalledTimes(1);
  expect(
    test.session.subtitles().some((cue) => cue.text === "stale audio")
  ).toBe(false);
  expect(test.session.cacheFailed).toBe(false);
});

test("repeated resets serialize deletion and stop prevents a delayed reset from recreating audio", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  let release;
  const first = test.session.resetAudio(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  await until(() => !!release);
  const second = test.session.resetAudio();
  const rejected = expect(second).rejects.toHaveProperty("name", "AbortError");
  const disposed = test.session.dispose();
  release();
  await Promise.allSettled([first, disposed]);
  await rejected;
  expect(test.createDownload).not.toHaveBeenCalled();
});

test("audio reset cancels exports, preserves text and permits a new sentence export", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  let finish;
  cropAacSentence.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = test.session.exportSentence({ start: 0, end: 1000 });
  const cancelled = expect(pending).rejects.toHaveProperty(
    "name",
    "AbortError"
  );
  await until(() => !!finish);
  const reset = test.session.resetAudio();
  finish({ blob: new Blob(["old"]) });
  await cancelled;
  await reset;
  expect(test.session.subtitles()[0].translation).toBe("你好");
  cropAacSentence.mockResolvedValueOnce({ blob: new Blob(["new"]) });
  await expect(
    test.session.exportSentence({ start: 0, end: 1000 })
  ).resolves.toHaveProperty("blob");
});

test("Shorts audio reset never invokes persistent storage", async () => {
  const test = setup({ cacheMode: "session", deferAudio: true });
  await test.session.start();
  test.session.blocks.set(0, cachedBlock());
  await test.session.resetAudio();
  expect(test.cache.getVideo).not.toHaveBeenCalled();
  expect(test.cache.putChunk).not.toHaveBeenCalled();
  expect(test.session.audioLookup).toBeUndefined();
  expect(test.session.cacheMode).toBe("session");
});

test("download recovery releases the scanner error without reopening the real downloader session", async () => {
  const stalled = Object.assign(new Error("stalled"), {
    code: "AUDIO_STALLED",
  });
  const part = (index) => ({
    index,
    startMs: index ? (index - 1) * 2000 : 0,
    endMs: index * 2000,
    data: new Uint8Array([index]).buffer,
  });
  const bridge = {
    open: jest.fn(async () => ({ identity })),
    clear: jest.fn(),
    next: jest
      .fn()
      .mockRejectedValueOnce(stalled)
      .mockResolvedValue({
        segments: [part(0), part(1), part(2)],
        expectedSegments: 2,
        expectedEndMs: 4000,
      }),
  };
  const test = setup({
    cacheMode: "session",
    bridge,
    createDownload: (options) => new AudioDownloadManager(options),
  });
  await test.session.start();
  await until(
    () =>
      test.session.indexError &&
      !test.session.indexWork &&
      !test.session.download.running
  );
  expect(test.session.indexedUntil || 0).toBe(0);
  test.session.download.retry();
  await until(() => test.session.state.phase === "complete");
  expect(test.session.state.cutting.complete).toBe(true);
  expect(test.session.indexError).toBeUndefined();
  expect(test.session.state.recognitionError).toBeUndefined();
  expect(
    test.recognize.mock.calls.map(([, chunk]) => chunk.startSample)
  ).toEqual([0, 16000, 32000, 48000]);
});

test.each([false, true])(
  "missing restored audio rebuilds the scanner unless stopped; stop=%s",
  async (stop) => {
    const parts = [0, 1, 2].map((index) => ({
      index,
      startMs: index ? (index - 1) * 2000 : 0,
      endMs: index * 2000,
      data: new Uint8Array([index]).buffer,
    }));
    const index = parts.map(({ data, ...part }) => ({
      ...part,
      bytes: data.byteLength,
    }));
    const successful = {
      ...cachedBlock(),
      endSample: 16000,
      endOfMedia: false,
      segments: [{ start: 0, end: 1, text: "hello" }],
      subtitles: [{ start: 0, end: 1000, text: "hello", translation: "你好" }],
    };
    const cache = {
      getVideo: jest.fn(async () => ({
        chunks: [successful],
        translation: { complete: false },
      })),
      beginAudio: jest.fn(async () => {}),
      getAudio: jest.fn(async () => null),
      releaseAudio: jest.fn(async () => {}),
      putAudio: jest.fn(async () => {}),
      putChunk: jest.fn(async () => {}),
    };
    let finishDownload;
    const bridge = {
      open: jest.fn(async () => ({ identity })),
      clear: jest.fn(),
      next: jest.fn(
        () =>
          new Promise((resolve) => {
            finishDownload = resolve;
          })
      ),
    };
    const test = setup({
      cache,
      bridge,
      audioLookup: { sessionId: "stale-audio", identity, index },
      audioSessionId: "stale-audio",
      createDownload: (options) => new AudioDownloadManager(options),
    });
    await test.session.start();
    await until(
      () => test.session.indexError && !test.session.indexWork && finishDownload
    );
    expect(test.session.indexError).toHaveProperty("cacheReadError", true);
    const decoders = test.createDecoder.mock.calls.length;
    const stopping = stop ? test.session.dispose() : undefined;
    finishDownload({
      segments: parts,
      expectedSegments: 2,
      expectedEndMs: 4000,
    });
    if (stop) {
      await stopping;
      expect(test.createDecoder).toHaveBeenCalledTimes(decoders);
      expect(test.recognize).not.toHaveBeenCalled();
    } else {
      await until(() => test.session.state.phase === "complete");
      expect(test.session.state.cutting.complete).toBe(true);
      expect(test.session.indexError).toBeUndefined();
      expect(test.session.state.recognitionError).toBeUndefined();
      expect(
        test.recognize.mock.calls.map(([, chunk]) => chunk.startSample)
      ).toEqual([16000, 32000, 48000]);
      expect(test.session.blocks.get(0).subtitles).toEqual(
        successful.subtitles
      );
      expect(bridge.open).toHaveBeenCalledTimes(1);
    }
  }
);

test.each([false, true])(
  "cache cleanup failures do not block recognition retry; already unavailable=%s",
  async (unavailable) => {
    const test = setup({ audioLookup: unavailable ? false : undefined });
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
    const successful = [...test.session.blocks.values()].filter(
      (block) => block.stage !== "failed"
    );
    test.cache.removeFailed.mockRejectedValue(
      Object.assign(new Error("cache offline"), { code: "CACHE_DISCONNECTED" })
    );
    await test.session.retryRecognition();
    await until(() => test.session.state.phase === "complete");
    expect(test.cache.removeFailed).toHaveBeenCalledTimes(unavailable ? 0 : 1);
    expect(test.session.cacheFailed).toBe(true);
    expect(test.recognize).toHaveBeenCalledTimes(5);
    expect(test.recognize.mock.calls[4][1].startSample).toBe(0);
    for (const block of successful)
      expect(test.session.blocks.get(block.startSample)).toBe(block);
  }
);

test.each(["AbortError", "STALE_VIDEO", "AUDIO_IDENTITY_MISMATCH"])(
  "recognition retry preserves authoritative cleanup errors: %s",
  async (code) => {
    const test = setup({
      cached: { chunks: [cachedBlock()], translation: { complete: true } },
    });
    await test.session.start();
    const cause =
      code === "AbortError"
        ? new DOMException("Cancelled", code)
        : Object.assign(new Error(code), { code });
    test.cache.removeFailed.mockRejectedValue(cause);
    await expect(test.session.retryRecognition()).rejects.toBe(cause);
    expect(test.session.cacheFailed).toBe(false);
    expect(test.recognize).not.toHaveBeenCalled();
  }
);

test("stopping during retry cache cleanup does not fall back or restart recognition", async () => {
  const test = setup({
    cached: { chunks: [cachedBlock()], translation: { complete: true } },
  });
  await test.session.start();
  let failCleanup;
  test.cache.removeFailed.mockImplementation(
    () =>
      new Promise((_, reject) => {
        failCleanup = reject;
      })
  );
  const retry = test.session.retryRecognition();
  const stopping = test.session.dispose();
  failCleanup(
    Object.assign(new Error("cache offline"), { code: "CACHE_DISCONNECTED" })
  );
  await expect(retry).rejects.toHaveProperty("name", "AbortError");
  await stopping;
  expect(test.session.cacheFailed).toBe(false);
  expect(test.createDownload).not.toHaveBeenCalled();
  expect(test.recognize).not.toHaveBeenCalled();
});

test("real decode errors stay stopped across media wakeups and user pause/resume", async () => {
  const createDecoder = jest.fn(() => {
    throw new Error("Invalid MP4 audio");
  });
  const test = setup({ createDecoder });
  await test.session.start();
  await until(() => test.session.indexError && !test.session.work);
  test.session.pause();
  test.download.add(2);
  test.session.resume();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(createDecoder).toHaveBeenCalledTimes(1);
  expect(test.session.state.recognitionError).toBe("AUDIO_DECODE_FAILED");
  expect(test.session.indexDownloadError).toBe(false);
});

test("pause before startup and seeks preserve the canonical pipeline until resume", async () => {
  const test = setup({ durationMs: 2000 });
  test.session.pause();
  await test.session.start();
  test.session.beginSeek();
  test.session.seek(1500);
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(test.session.state.phase).toBe("paused");
  expect(test.createDecoder).not.toHaveBeenCalled();
  expect(test.recognize).not.toHaveBeenCalled();
  test.session.resume();
  test.session.pause();
  test.session.resume();
  await until(() => test.session.state.phase === "complete");
  expect(test.createDownload).toHaveBeenCalledTimes(1);
  expect(
    [...test.session.chunkIndex.values()].map((c) => [
      c.startSample,
      c.endSample,
    ])
  ).toEqual([
    [0, 16000],
    [16000, 32000],
  ]);
});

test("pause lets the current recognition finish but holds the next recognition and translation", async () => {
  const test = setup({ durationMs: 2000 });
  let finish;
  test.recognize.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await test.session.start();
  await until(() => !!finish);
  test.session.pause();
  finish({
    silent: false,
    timingSource: "asr",
    segments: [{ start: 0, end: 1, text: "finished" }],
  });
  await until(() => test.session.blocks.size === 1);
  expect(test.recognize).toHaveBeenCalledTimes(1);
  expect(test.textProcessor.segment).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
  expect(test.cache.putChunk).toHaveBeenCalled();
  test.session.resume();
  await until(() => test.session.state.phase === "complete");
  expect(test.recognize).toHaveBeenCalledTimes(2);
});

test("pausing during cutting retains the scanner and its tail until resume", async () => {
  let paused = false;
  const test = setup({
    durationMs: 2000,
    onTask: (task) => {
      if (task.indexed && !paused) {
        paused = true;
        test.session.pause();
      }
    },
  });
  await test.session.start();
  await until(() => test.session.pauseGate.waiters.size > 0);
  expect(test.session.chunkIndex.size).toBe(1);
  expect(test.session.indexComplete).not.toBe(true);
  expect(test.createDecoder).toHaveBeenCalledTimes(1);
  expect(test.recognize).not.toHaveBeenCalled();
  test.session.resume();
  await until(() => test.session.state.phase === "complete");
  expect(
    [...test.session.chunkIndex.values()].map((c) => [
      c.startSample,
      c.endSample,
    ])
  ).toEqual([
    [0, 16000],
    [16000, 32000],
  ]);
  expect(test.createDecoder).toHaveBeenCalledTimes(3);
});

test("closing a paused scanner and text worker releases waits without late work", async () => {
  const test = setup();
  test.session.pause();
  await test.session.start();
  await test.session.dispose();
  test.session.resume();
  expect(test.session.pauseGate.waiters.size).toBe(0);
  expect(test.recognize).not.toHaveBeenCalled();
  expect(test.textProcessor.translate).not.toHaveBeenCalled();
});
