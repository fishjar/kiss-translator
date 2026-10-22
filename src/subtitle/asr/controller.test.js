import { webcrypto } from "crypto";
import { TextEncoder } from "util";
import { YoutubeAsrController } from "./controller";
import { downloadBlobFile } from "../../libs/utils";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
}
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

jest.mock("../../libs/utils", () => ({ downloadBlobFile: jest.fn() }));
jest.mock("./processing", () => ({
  resolvedAsrServices: (setting) => ({
    asrService: setting.asrApiSlug === "asr" ? { apiSlug: "asr" } : null,
  }),
  createAsrTextProcessor: jest.fn(() => ({})),
  effectiveAsrLimits: jest.fn(),
}));
const identity = {
  videoId: "kSQknoHMFtk",
  trackId: "en-US.4",
  mediaVersion: "140.123",
  durationMs: 4000,
  sourceLanguage: "en",
};
const flush = async () => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
function setup(overrides = {}) {
  const video = { videoId: identity.videoId, element: { currentTime: 1 } },
    setting = { asrApiSlug: "asr" };
  const bridge = {
    configure: jest.fn(),
    snapshot: jest.fn(async () => ({ identity })),
    clear: jest.fn(),
    dispose: jest.fn(),
  };
  const cache = {
    getVideo: jest.fn(async () => null),
    deleteVideo: jest.fn(async () => {}),
    close: jest.fn(),
  };
  const sessions = [],
    options = [];
  const createSession = jest.fn((input) => {
    options.push(input);
    const session = {
      identity: input.identity,
      start: jest.fn(async () => {}),
      resetAudio: jest.fn(async (remove) => {
        await remove?.();
      }),
      setTranslationTarget: jest.fn(async () => {}),
      dispose: jest.fn(async () => {}),
      beginSeek: jest.fn(),
      seek: jest.fn(),
      exportSentence: jest.fn(async () => ({ blob: new Blob(["wav"]) })),
      exportFull: jest.fn(async () => ({ blob: new Blob(["m4a"]) })),
    };
    sessions.push(session);
    return session;
  });
  const onState = jest.fn(),
    onSubtitles = jest.fn();
  const controller = new YoutubeAsrController({
    getSetting: () => setting,
    getVideo: () => video,
    bridge,
    cache,
    createSession,
    onState,
    onSubtitles,
    ...overrides,
  });
  return {
    controller,
    bridge,
    cache,
    sessions,
    options,
    onSubtitles,
    video,
    setting,
    createSession,
  };
}
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test("translation language overrides are scoped to ASR and do not restart recognition", async () => {
  require("./processing").createAsrTextProcessor.mockReturnValue({});
  let target;
  const test = setup({
    translationPreferences: {
      get: () => target,
      set: (_, value) => {
        target = value;
      },
    },
  });
  test.setting.toLang = "zh-CN";
  test.controller.start();
  await flush();
  expect(test.controller.state.translationLanguage).toBe("zh-CN");
  await test.controller.setTranslationLanguage("ja");
  expect(test.setting.toLang).toBe("zh-CN");
  expect(test.controller.state.translationLanguage).toBe("ja");
  expect(test.sessions[0].setTranslationTarget).toHaveBeenCalledWith(
    expect.objectContaining({ toLang: "ja" }),
    expect.any(Object),
    expect.any(Promise)
  );
  expect(test.sessions[0].dispose).not.toHaveBeenCalled();
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.setTranslationLanguage("ja");
  await test.controller.setTranslationLanguage("invalid-language");
  expect(test.sessions[0].setTranslationTarget).toHaveBeenCalledTimes(1);
  await test.controller.restart();
  await flush();
  expect(test.options[1].setting.toLang).toBe("ja");
  await test.controller.dispose();
});

test("language changes immediately clear captions, ignore old callbacks and resume with a separate text cache", async () => {
  const choices = new Map();
  const languagePreferences = {
    get: () => choices.get("language") || "auto",
    set: (_, value) => choices.set("language", value),
  };
  const test = setup({ languagePreferences });
  test.controller.start();
  await flush();
  test.controller.pause();
  const old = test.options[0];
  let finish;
  test.sessions[0].dispose.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const changing = test.controller.setLanguage("zh-hans");
  expect(test.onSubtitles.mock.calls.at(-1)[0]).toEqual([]);
  expect(test.controller.paused).toBe(false);
  expect(test.controller.state.selectedLanguage).toBe("zh-hans");
  old.onSubtitles([{ text: "stale English" }], {});
  old.onState({ recognitionError: "ASR_FAILED" });
  expect(test.onSubtitles.mock.calls.at(-1)[0]).toEqual([]);
  expect(test.controller.state.recognitionError).toBeUndefined();
  finish();
  await changing;
  await flush();
  expect(test.options[1].identity).toEqual(identity);
  expect(test.options[1].language).toBe("zh-hans");
  expect(test.options[1].textIdentity.recognitionLanguage).toBe("zh-hans");
  expect(test.options[1].restoreText).toBe(true);
  const count = test.options.length;
  await test.controller.setLanguage("zh-hans");
  expect(test.options).toHaveLength(count);
  await test.controller.dispose();
});

test("rapid language changes create only the final language session", async () => {
  let selected = "auto";
  const test = setup({
    languagePreferences: {
      get: () => selected,
      set: (_, value) => {
        selected = value;
      },
    },
  });
  test.controller.start();
  await flush();
  let finish;
  test.sessions[0].dispose.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const first = test.controller.setLanguage("zh-hans");
  const second = test.controller.setLanguage("ja");
  finish();
  await Promise.all([first, second]);
  await flush();
  expect(test.options).toHaveLength(2);
  expect(test.options[1].language).toBe("ja");
  await test.controller.dispose();
});

test("waiting for an old ASR call does not consume the replacement startup timeout", async () => {
  jest.useFakeTimers();
  let selected = "auto";
  const test = setup({
    languagePreferences: {
      get: () => selected,
      set: (_, value) => {
        selected = value;
      },
    },
  });
  test.controller.start();
  await flush();
  let finish;
  test.sessions[0].dispose.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const changing = test.controller.setLanguage("zh-hans");
  jest.advanceTimersByTime(31000);
  expect(test.controller.state.phase).toBe("restoring");
  expect(test.controller.state.error).toBeUndefined();
  finish();
  await changing;
  await flush();
  expect(test.options).toHaveLength(2);
  expect(test.options[1].language).toBe("zh-hans");
  await test.controller.dispose();
});

test("restarting clears completed cutting progress before player or audio restoration resolves", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.options[0].onState({
    phase: "complete",
    cutting: { samples: 64000, totalSamples: 64000, complete: true },
  });
  expect(test.controller.state.cutting.complete).toBe(true);
  await test.controller.stop();
  let resume;
  test.bridge.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resume = resolve;
      })
  );
  test.controller.start();
  expect(test.controller.state.cutting).toBeUndefined();
  expect(test.controller.state.audio.phase).toBe("missing");
  await flush();
  resume({ identity });
  await flush();
  await test.controller.dispose();
});
test("session starts only with configured ASR; repeated snapshots keep the same session", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  await test.controller.tick();
  expect(test.createSession).toHaveBeenCalledTimes(1);
  expect(test.options[0].targetMs).toBe(1000);
  await test.controller.dispose();
  expect(test.cache.close).toHaveBeenCalledTimes(1);
  const disabled = setup();
  disabled.setting.asrApiSlug = "-";
  disabled.controller.start();
  await flush();
  expect(disabled.createSession).not.toHaveBeenCalled();
  await disabled.controller.dispose();
});
test("seek events debounce to final position and stop clears pending playback work", async () => {
  jest.useFakeTimers();
  const test = setup();
  test.controller.start();
  await flush();
  test.controller.beginSeek();
  test.controller.seek();
  jest.advanceTimersByTime(100);
  test.video.element.currentTime = 3;
  test.controller.seek();
  jest.advanceTimersByTime(199);
  expect(test.sessions[0].seek).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(test.sessions[0].seek).toHaveBeenCalledWith(3000);
  test.controller.seek();
  await test.controller.stop();
  jest.advanceTimersByTime(250);
  expect(test.sessions[0].seek).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});
test("audio-track changes dispose previous work; late callbacks cannot populate another video", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.bridge.snapshot.mockResolvedValue({
    identity: { ...identity, trackId: "ja.4" },
  });
  await test.controller.tick();
  expect(test.sessions[0].dispose).toHaveBeenCalled();
  expect(test.sessions).toHaveLength(2);
  await test.controller.stop();
  const count = test.onSubtitles.mock.calls.length;
  test.options[0].onSubtitles([{ text: "old" }], {});
  expect(test.onSubtitles).toHaveBeenCalledTimes(count);
  await test.controller.dispose();
});
test("audio exports use the cached session and stale exports do not download a file", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  await test.controller.exportFull();
  expect(downloadBlobFile).toHaveBeenCalledWith(
    expect.any(Blob),
    `youtube-${identity.videoId}.m4a`
  );
  let finish;
  test.sessions[0].exportSentence.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = test.controller.exportSentence({ start: 100, end: 200 });
  await flush();
  await test.controller.stop();
  finish({ blob: new Blob(["wav"]) });
  await pending;
  expect(downloadBlobFile).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});
test("waiting for player audio parameters expires visibly and manual restart gives a fresh attempt", async () => {
  const test = setup();
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "AUDIO_AUTH_PENDING" })
  );
  test.controller.start();
  await flush();
  expect(test.controller.state.phase).toBe("waiting");
  test.controller.deadline = Date.now() - 1;
  await test.controller.tick();
  expect(test.controller.state.phase).toBe("error");
  test.bridge.snapshot.mockResolvedValue({ identity });
  await test.controller.retryRecognition();
  await flush();
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("a known runtime audio-track mismatch immediately hides old captions and stops old work", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "AUDIO_IDENTITY_MISMATCH" })
  );
  await test.controller.tick();
  await flush();
  expect(test.controller.session).toBeUndefined();
  expect(test.sessions[0].dispose).toHaveBeenCalled();
  expect(test.onSubtitles).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({ phase: "waiting" })
  );
  await test.controller.stop();
  expect(test.controller.state).toMatchObject({ phase: "off" });
  await test.controller.dispose();
});

test("waiting and terminal errors emit once per event, and restart advances feedback identity", async () => {
  const test = setup();
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "NEED_PLAYBACK" })
  );
  test.controller.start();
  await flush();
  const first = test.controller.state.feedbackSession;
  expect(test.controller.state.waitReason).toBe("NEED_PLAYBACK");
  const callback = jest.spyOn(test.controller, "emit");
  await test.controller.tick();
  await test.controller.tick();
  expect(callback).not.toHaveBeenCalled();
  test.controller.deadline = Date.now() - 1;
  await test.controller.tick();
  await test.controller.tick();
  expect(callback).toHaveBeenCalledTimes(1);
  await test.controller.restart();
  await flush();
  expect(test.controller.state.feedbackSession).toBeGreaterThan(first);
  await test.controller.dispose();
});

test("startup has its own deadline without player ticks and late snapshots cannot start a session", async () => {
  jest.useFakeTimers();
  const test = setup();
  let resolve;
  test.bridge.snapshot.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  test.controller.start();
  await flush();
  expect(test.bridge.snapshot.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  jest.advanceTimersByTime(30000);
  expect(test.controller.state).toMatchObject({
    phase: "error",
    error: "AUDIO_TIMEOUT",
  });
  resolve({ identity });
  await flush();
  expect(test.createSession).not.toHaveBeenCalled();
  await test.controller.tick();
  expect(test.bridge.snapshot).toHaveBeenCalledTimes(1);
  await test.controller.stop();
  jest.advanceTimersByTime(30000);
  expect(test.controller.state.phase).toBe("off");
  await test.controller.dispose();
});

test("a metadata cache miss proceeds to audio immediately without waiting for a timer", async () => {
  jest.useFakeTimers();
  const test = setup();
  const resumeAudio = jest.fn(async () => {});
  test.createSession.mockImplementation((input) => ({
    identity: input.identity,
    start: async () => {},
    resumeAudio,
    dispose: async () => {},
  }));
  test.controller.start();
  await flush();
  expect(test.cache.getVideo).toHaveBeenCalledWith(
    { videoId: identity.videoId },
    undefined,
    expect.objectContaining({ metadataOnly: true })
  );
  expect(test.bridge.snapshot).toHaveBeenCalledTimes(1);
  expect(resumeAudio).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("missing capture reasons survive to the independent timeout and stopping cancels that timeout", async () => {
  jest.useFakeTimers();
  const test = setup();
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "AUDIO_CAPTURE_MISSING" })
  );
  test.controller.start();
  await flush();
  jest.advanceTimersByTime(30000);
  expect(test.controller.state).toMatchObject({
    phase: "error",
    error: "AUDIO_CAPTURE_MISSING",
  });
  await test.controller.restart();
  await flush();
  await test.controller.stop();
  jest.advanceTimersByTime(30000);
  expect(test.controller.state.phase).toBe("off");
  await test.controller.dispose();
});

test.each(["media", "block"])(
  "%s export reuses range clipping, merges duplicate clicks, and never starts recognition",
  async (kind) => {
    const test = setup();
    test.controller.start();
    await flush();
    const session = test.sessions[0];
    test.controller.tasks.update({
      id: "media-1",
      kind,
      index: 1,
      startMs: 500,
      endMs: 1500,
      download: "complete",
    });
    const segment = test.controller.tasks.snapshot()[0];
    await Promise.all([
      test.controller.exportSegment(segment),
      test.controller.exportSegment(segment),
    ]);
    expect(session.exportSentence).toHaveBeenCalledTimes(1);
    expect(session.exportSentence).toHaveBeenCalledWith({
      start: 500,
      end: 1500,
    });
    expect(downloadBlobFile).toHaveBeenCalledTimes(1);
    expect(test.controller.tasks.snapshot()[0].exportState).toBe("complete");
    expect(test.createSession).toHaveBeenCalledTimes(1);
    await test.controller.dispose();
  }
);

test("late task events are ignored after stop and a new run resets only runtime metadata", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.options[0].onTask({
    id: "block-0",
    kind: "block",
    startMs: 0,
    endMs: 1000,
    recognition: "recognizing",
  });
  await test.controller.stop();
  expect(test.controller.tasks.snapshot()[0].recognition).toBe("stopped");
  test.options[0].onTask({ id: "block-0", recognition: "recognized" });
  expect(test.controller.tasks.snapshot()[0].recognition).toBe("stopped");
  test.controller.start();
  await flush();
  expect(test.controller.tasks.snapshot()).toEqual([]);
  expect(test.cache.deleteVideo).not.toHaveBeenCalled();
  await test.controller.dispose();
});

test("audio preview and download share range preparation without preview downloading a file", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const segment = {
    id: "media-1",
    kind: "media",
    index: 1,
    startMs: 1000,
    endMs: 2000,
    download: "complete",
  };
  test.controller.tasks.update(segment);
  const blob = await test.controller.prepareSegmentAudio(segment);
  expect(blob).toBeInstanceOf(Blob);
  expect(downloadBlobFile).not.toHaveBeenCalled();
  test.sessions[0].exportSentence.mockClear();
  await Promise.all([
    test.controller.prepareSegmentAudio(segment),
    test.controller.exportSegment(segment),
  ]);
  expect(test.sessions[0].exportSentence).toHaveBeenCalledTimes(1);
  expect(test.sessions[0].exportSentence).toHaveBeenCalledWith({
    start: 1000,
    end: 2000,
  });
  expect(downloadBlobFile).toHaveBeenCalledTimes(1);
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("late preview blobs are rejected after stopping and unavailable segments cannot prepare", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const segment = {
    id: "media-1",
    kind: "media",
    index: 1,
    startMs: 0,
    endMs: 1000,
    download: "saving",
  };
  test.controller.tasks.update(segment);
  await expect(
    test.controller.prepareSegmentAudio(segment)
  ).rejects.toHaveProperty("code", "AUDIO_UNAVAILABLE");
  test.controller.tasks.update({ id: segment.id, download: "complete" });
  let resolve;
  test.sessions[0].exportSentence.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = test.controller.prepareSegmentAudio(segment);
  const rejected = expect(pending).rejects.toHaveProperty("name", "AbortError");
  await flush();
  await test.controller.stop();
  resolve({ blob: new Blob(["old"]) });
  await rejected;
  expect(test.controller.rangePreparations.size).toBe(0);
  expect(downloadBlobFile).not.toHaveBeenCalled();
  await test.controller.dispose();
});

test("deleteAudio stops recognition and clears tasks while preserving caption cache", async () => {
  const test = setup();
  test.cache.deleteAudio = jest.fn(async () => {});
  test.controller.start();
  await flush();
  const session = test.sessions[0];
  session.download = { sessionId: "audio-session" };
  test.controller.tasks.update({
    id: "media-1",
    kind: "media",
    download: "complete",
  });
  test.controller.tasks.update({ id: "block-0", kind: "block", indexed: true });
  await test.controller.deleteAudio();
  expect(session.dispose).toHaveBeenCalledTimes(1);
  expect(test.controller.active).toBe(false);
  expect(test.controller.state.phase).toBe("off");
  expect(test.controller.tasks.snapshot()).toEqual([]);
  expect(test.cache.deleteVideo).not.toHaveBeenCalled();
  expect(test.cache.deleteAudio).toHaveBeenCalledWith(
    "audio-session",
    session.identity
  );
  await test.controller.dispose();
});

test("session start auto-acquires audio download to complete cache when audio is not cached", async () => {
  const test = setup();
  test.setting.audioCacheLimit = 100;
  const acquireSpy = jest.fn(() => ({
    ready: Promise.resolve(),
    release: jest.fn(),
  }));
  const downloadMock = {
    complete: jest.fn(() => false),
    acquire: acquireSpy,
  };
  test.createSession = jest.fn((input) => {
    const session = {
      identity: input.identity,
      start: jest.fn(async () => {}),
      dispose: jest.fn(async () => {}),
      ensureDownload: jest.fn(() => downloadMock),
      download: undefined,
      wake: jest.fn(),
    };
    test.sessions.push(session);
    return session;
  });
  test.controller.createSession = test.createSession;

  test.controller.start();
  await flush();

  expect(test.sessions[0].start).toHaveBeenCalledTimes(1);
  expect(test.sessions[0].ensureDownload).toHaveBeenCalledTimes(1);
  expect(acquireSpy).toHaveBeenCalledWith("asr");
  await test.controller.dispose();
});

test("deleteAudio does not reset new video tasks if video changes during deletion", async () => {
  const test = setup();
  let resolveDelete;
  const deletePromiseInvoked = new Promise((r) => {
    test.cache.deleteAudio = jest.fn(
      () =>
        new Promise((res) => {
          resolveDelete = res;
          r();
        })
    );
  });
  test.controller.start();
  await flush();

  const oldSession = test.sessions[0];
  const oldDownload = {
    sessionId: "old-audio",
    controller: { abort: jest.fn() },
    running: Promise.resolve(),
    index: new Map([[1, { index: 1 }]]),
    bytes: 100,
    coverageMs: 1000,
    state: { phase: "complete" },
    emit: jest.fn(),
  };
  oldSession.download = oldDownload;

  // Trigger deleteAudio on old video
  const deletePromise = test.controller.deleteAudio();
  await deletePromiseInvoked;

  // Video switches to new one while delete is pending
  test.controller.epoch++;
  const newSession = {
    identity: { videoId: "newVideo1234" },
    download: { sessionId: "new-audio" },
  };
  test.controller.session = newSession;
  test.controller.tasks.update({
    id: "media-1",
    kind: "media",
    download: "complete",
    downloadBytes: 500,
  });

  // Finish old deletion
  resolveDelete();
  await deletePromise;

  // Ensure new video's task was NOT reset to idle
  const task = test.controller.tasks.rows.get("media-1");
  expect(task.download).toBe("complete");
  expect(task.downloadBytes).toBe(500);

  await test.controller.dispose();
});

test.each(["deleteAudio", "deleteCache"])(
  "%s closes and prevents reopening until deletion settles",
  async (action) => {
    const test = setup();
    let finish;
    const deleteMethod =
      action === "deleteAudio" ? "deleteAudio" : "deleteVideo";
    test.cache[deleteMethod] = jest.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    test.controller.start();
    await flush();
    const clearing = test.controller[action]();
    await flush();
    expect(test.controller.state).toMatchObject({
      phase: "off",
      active: false,
      clearing: true,
    });
    test.controller.start();
    await flush();
    expect(test.createSession).toHaveBeenCalledTimes(1);
    finish();
    await clearing;
    expect(test.controller.state).toMatchObject({
      phase: "off",
      clearing: false,
    });
    test.controller.start();
    await flush();
    expect(test.createSession).toHaveBeenCalledTimes(2);
    expect(test.controller.state.paused).toBe(false);
    await test.controller.dispose();
  }
);

test("failed deletion remains closed and reports the error", async () => {
  const test = setup();
  test.cache.deleteAudio = jest.fn(async () => {
    throw { code: "CACHE_UNAVAILABLE" };
  });
  test.controller.start();
  await flush();
  await test.controller.deleteAudio();
  expect(test.controller.state).toMatchObject({
    phase: "off",
    active: false,
    clearing: false,
    cacheDeleteError: "CACHE_UNAVAILABLE",
  });
  await test.controller.dispose();
});

test("pending deletion is scoped to its video and cannot disable the next video's session", async () => {
  const test = setup();
  let finish;
  test.cache.deleteAudio = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  test.controller.start();
  await flush();
  const clearing = test.controller.deleteAudio();
  await flush();
  test.video.videoId = "bs7WQKv4_ZU";
  test.bridge.snapshot.mockResolvedValue({
    identity: { ...identity, videoId: test.video.videoId },
  });
  await test.controller.stop();
  test.controller.start();
  await flush();
  expect(test.sessions).toHaveLength(2);
  expect(test.controller.state).toMatchObject({
    active: true,
    clearing: false,
  });
  finish();
  await clearing;
  expect(test.controller.session).toBe(test.sessions[1]);
  expect(test.controller.state).toMatchObject({
    active: true,
    clearing: false,
  });
  await test.controller.dispose();
});

test("closing again during deletion unlocks start on completion without restarting", async () => {
  const test = setup();
  let finish;
  test.cache.deleteAudio = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  test.controller.start();
  await flush();
  const clearing = test.controller.deleteAudio();
  await flush();
  await test.controller.stop();
  expect(test.controller.state.clearing).toBe(true);
  finish();
  await clearing;
  expect(test.controller.state).toMatchObject({
    active: false,
    clearing: false,
  });
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("pause during startup reaches the new session; stop prevents resume", async () => {
  const test = setup();
  let resolvePlayer;
  test.bridge.snapshot.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolvePlayer = resolve;
      })
  );
  test.controller.start();
  test.controller.pause();
  await flush();
  const pause = jest.fn(),
    resume = jest.fn();
  const createSession = test.controller.createSession;
  test.controller.createSession = (input) =>
    Object.assign(createSession(input), { pause, resume });
  resolvePlayer({ identity });
  await flush();
  expect(pause).toHaveBeenCalledTimes(1);
  expect(test.controller.state.paused).toBe(true);
  test.controller.resume();
  expect(resume).toHaveBeenCalledTimes(1);
  await test.controller.stop();
  test.controller.resume();
  expect(resume).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("cache clear delegates rebuilding to the session and resets media tasks", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.controller.tasks.update({
    id: "media-1",
    kind: "media",
    download: "complete",
  });
  test.cache.onAudioCacheCleared();
  await flush();
  expect(test.sessions[0].resetAudio).toHaveBeenCalledTimes(1);
  expect(test.controller.tasks.rows.get("media-1").download).toBe("idle");
  await test.controller.dispose();
});

test("stop discards aggregate results and starts each disposal immediately", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  let release;
  test.sessions[0].dispose.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const first = test.controller.stop();
  expect(test.sessions[0].dispose).toHaveBeenCalledTimes(1);
  const next = {
    dispose: jest.fn(async () => {
      throw Error("cleanup failed");
    }),
  };
  test.controller.session = next;
  const second = test.controller.stop();
  expect(next.dispose).toHaveBeenCalledTimes(1);
  release();
  expect(await first).toBeUndefined();
  expect(await second).toBeUndefined();
  for (let i = 0; i < 20; i++)
    expect(await test.controller.stop()).toBeUndefined();
  await test.controller.dispose();
});

test("cache hit loads subtitles before player validation, even when playback is unavailable", async () => {
  const test = setup();
  test.bridge.snapshot = jest.fn(() => {
    throw Object.assign(new Error("NEED_PLAYBACK"), { code: "NEED_PLAYBACK" });
  });
  test.cache.getVideo = jest.fn(async (idInput, sig) => {
    return {
      identity,
      chunks: [],
      translation: { complete: true },
    };
  });
  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await flush();
  expect(test.createSession).toHaveBeenCalledTimes(1);
  expect(test.options[0].identity).toEqual(identity);
  expect(test.bridge.snapshot).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("video play event triggers retry when waiting for playback or errored", async () => {
  const listeners = {};
  const element = {
    currentTime: 0,
    addEventListener: jest.fn((evt, cb) => {
      listeners[evt] = cb;
    }),
    removeEventListener: jest.fn((evt) => {
      delete listeners[evt];
    }),
  };
  const test = setup();
  test.video.element = element;
  test.bridge.snapshot = jest
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error("NEED_PLAYBACK"), { code: "NEED_PLAYBACK" })
    )
    .mockResolvedValueOnce({ identity });

  test.controller.start();
  await flush();

  expect(test.controller.state.phase).toBe("waiting");
  expect(test.controller.state.waitReason).toBe("NEED_PLAYBACK");
  expect(listeners.play).toBeDefined();

  // 触发播放事件，自动重试并成功恢复
  listeners.play();
  await flush();

  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("retryRecognition re-runs startup tick when in error phase", async () => {
  const test = setup();
  test.bridge.snapshot = jest
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error("NEED_PLAYBACK"), { code: "NEED_PLAYBACK" })
    )
    .mockResolvedValueOnce({ identity });

  test.controller.start();
  await flush();

  test.controller.emit({ phase: "error", error: "NEED_PLAYBACK" });
  expect(test.controller.state.phase).toBe("error");

  await test.controller.retryRecognition();
  await flush();

  expect(test.controller.state.phase).not.toBe("error");
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("paused video with subtitle cache restores audio independently and preserves completed subtitles", async () => {
  const test = setup();
  test.video.element = { paused: true, currentTime: 0 };
  const acquire = jest.fn(() => ({
    ready: Promise.resolve(),
    release: jest.fn(),
  }));
  const ensureDownloadSpy = jest.fn(() => ({ complete: () => false, acquire }));
  test.createSession.mockImplementationOnce((input) => {
    const session = {
      identity: input.identity,
      cacheHit: true,
      state: { phase: "cached" },
      start: jest.fn(async () => {
        input.onState?.({
          phase: "cached",
          recognition: { complete: true, percent: 100 },
          translation: { complete: true, percent: 100 },
        });
      }),
      ensureDownload: ensureDownloadSpy,
      dispose: jest.fn(async () => {}),
    };
    test.sessions.push(session);
    return session;
  });
  test.cache.getVideo = jest.fn(async () => ({
    identity,
    chunks: [],
    translation: { complete: true },
  }));

  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await flush();

  expect(test.createSession).toHaveBeenCalledTimes(1);
  expect(ensureDownloadSpy).toHaveBeenCalledTimes(1);
  expect(acquire).toHaveBeenCalledWith("asr");
  expect(test.controller.state.phase).toBe("cached");

  // Subsequent ticks should not mark the complete session as errored
  test.bridge.listener?.();
  await flush();
  expect(test.controller.state.phase).toBe("cached");

  await test.controller.dispose();
});

test("paused audio-only cache starts a session with its original audio session ID", async () => {
  const test = setup();
  test.video.element.paused = true;
  test.cache.findAudioSession = jest.fn(async () => ({
    sessionId: "legacy-audio",
    identity,
  }));
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "NEED_PLAYBACK" })
  );
  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await flush();
  expect(test.options[0].audioSessionId).toBe("legacy-audio");
  expect(test.sessions[0].start).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("known current media identity rejects another audio track's cache", async () => {
  const test = setup();
  test.cache.findAudioSession = jest.fn(async () => ({
    sessionId: "wrong-track",
    identity: { ...identity, trackId: "ja.10" },
  }));
  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  await flush();
  expect(test.options[0].identity).toEqual(identity);
  expect(test.options[0].audioSessionId).toBeUndefined();
  await test.controller.dispose();
});

test("new playback capture revalidates a completed session when the audio track changes", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.sessions[0].cacheHit = true;
  test.controller.emit({ phase: "cached" });
  test.bridge.snapshot.mockResolvedValue({
    identity: { ...identity, trackId: "ja.10" },
  });
  await test.controller.tick(true);
  expect(test.createSession).toHaveBeenCalledTimes(2);
  expect(test.options[1].identity.trackId).toBe("ja.10");
  expect(test.sessions[0].dispose).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("current track lookup finds older matching audio behind a newer other-track cache", async () => {
  const test = setup();
  test.cache.findAudioSession = jest.fn(async (input) =>
    input.trackId
      ? { sessionId: "older-matching", identity }
      : {
          sessionId: "newer-other",
          identity: { ...identity, trackId: "ja.10" },
        }
  );
  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(test.options[0].audioSessionId).toBe("older-matching");
  expect(test.cache.findAudioSession).toHaveBeenCalledWith(
    identity,
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  await test.controller.dispose();
});

test("one failed audio lookup starts network acquisition without cache retry", async () => {
  const test = setup();
  test.cache.lookupCache = jest
    .fn()
    .mockRejectedValue(Object.assign(new Error(), { code: "CACHE_TIMEOUT" }));
  test.controller.start();
  await flush();
  expect(test.cache.lookupCache).toHaveBeenCalledTimes(1);
  expect(test.createSession).toHaveBeenCalledTimes(1);
  expect(test.options[0].audioLookup).toBe(false);
  expect(test.controller.state.audio.cacheStatus).not.toBe("error");
  await test.controller.dispose();
});

test("Shorts skips every cache call and starts while the previous session is still disposing", async () => {
  const test = setup();
  test.video.cacheMode = "session";
  test.cache.lookupCache = jest.fn(() => {
    throw Error("persistent cache touched");
  });
  test.cache.disconnect = jest.fn(() => {
    throw Error("persistent cache touched");
  });
  test.cache.close.mockImplementation(() => {
    throw Error("persistent cache touched");
  });
  test.controller.start();
  await flush();
  expect(test.options[0].cacheMode).toBe("session");
  expect(test.cache.getVideo).not.toHaveBeenCalled();
  expect(test.cache.lookupCache).not.toHaveBeenCalled();
  let finish;
  test.sessions[0].dispose.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await test.controller.restart();
  await flush();
  expect(test.sessions).toHaveLength(2);
  finish();
  await test.controller.dispose();
  expect(test.cache.disconnect).not.toHaveBeenCalled();
  expect(test.cache.close).not.toHaveBeenCalled();
});

test("entering Shorts does not inherit a pending persistent cache lookup", async () => {
  const test = setup();
  let finish;
  test.cache.lookupCache = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  test.controller.start();
  await flush();
  expect(test.controller.pending).toBe(true);
  void test.controller.stop();
  test.video.cacheMode = "session";
  test.controller.start();
  await flush();
  expect(test.sessions).toHaveLength(1);
  expect(test.options[0].cacheMode).toBe("session");
  finish({ subtitle: null, audio: null });
  await flush();
  expect(test.sessions).toHaveLength(1);
  await test.controller.dispose();
});

test("waiting for player parameters does not repeat the same persistent lookup", async () => {
  const test = setup();
  test.cache.lookupCache = jest.fn(async () => ({
    subtitle: null,
    audio: null,
  }));
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error(), { code: "NEED_PLAYBACK" })
  );
  test.controller.start();
  await flush();
  await test.controller.tick();
  await test.controller.tick();
  expect(test.cache.lookupCache).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("current player identity selects its matching cache before audio acquisition", async () => {
  const test = setup();
  const current = { ...identity, mediaVersion: "140.456" };
  test.cache.getVideo.mockResolvedValue({
    identity,
    chunks: [],
    translation: { complete: true },
  });
  test.cache.findAudioSession = jest.fn(async (input) => ({
    identity: input.mediaVersion === current.mediaVersion ? current : identity,
    sessionId:
      input.mediaVersion === current.mediaVersion
        ? "new-version"
        : "old-version",
  }));
  const resumeAudio = [jest.fn(async () => {}), jest.fn(async () => {})];
  test.createSession.mockImplementation((input) => {
    const index = test.sessions.length;
    test.options.push(input);
    const session = {
      identity: input.identity,
      start: jest.fn(async () => input.onState({ phase: "cached" })),
      resumeAudio: resumeAudio[index],
      dispose: jest.fn(async () => {}),
    };
    test.sessions.push(session);
    return session;
  });
  test.bridge.snapshot.mockImplementation(async () => {
    return { identity: current };
  });
  test.controller.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(test.sessions).toHaveLength(1);
  expect(resumeAudio[0]).toHaveBeenCalledTimes(1);
  expect(test.options[0].audioSessionId).toBe("new-version");
  await test.controller.dispose();
});

test("targeted recognition forwards the block ID without queueing other failures", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.sessions[0].retryRecognition = jest.fn(async () => {});
  test.controller.tasks.update({ id: "block-0", recognition: "failed" });
  test.controller.tasks.update({ id: "block-16000", recognition: "failed" });
  await test.controller.retryRecognition("block-0");
  expect(test.sessions[0].retryRecognition).toHaveBeenCalledWith("block-0");
  expect(test.controller.tasks.rows.get("block-16000").recognition).toBe(
    "failed"
  );
  await test.controller.dispose();
});

test("different inline retries can queue together while duplicate clicks are ignored", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const finish = [];
  test.sessions[0].retryRecognition = jest.fn(
    () => new Promise((resolve) => finish.push(resolve))
  );
  test.controller.tasks.update({ id: "block-0", recognition: "failed" });
  test.controller.tasks.update({ id: "block-16000", recognition: "failed" });
  const first = test.controller.retryRecognition("block-0");
  const duplicate = test.controller.retryRecognition("block-0");
  const second = test.controller.retryRecognition("block-16000");
  expect(test.sessions[0].retryRecognition.mock.calls).toEqual([
    ["block-0"],
    ["block-16000"],
  ]);
  finish.forEach((resolve) => resolve());
  await Promise.all([first, duplicate, second]);
  await test.controller.dispose();
});

test("player refresh errors cannot expose global retry while the session is working", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.sessions[0].state = { working: true };
  test.bridge.snapshot.mockRejectedValue(
    Object.assign(new Error("network"), { code: "AUDIO_NETWORK" })
  );
  await test.controller.tick(true);
  expect(test.controller.state.error).toBe("AUDIO_NETWORK");
  expect(test.controller.state.stoppedByError).toBe(false);
  await test.controller.dispose();
});

test("global recovery keeps an errored runtime session and its successful results", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const session = test.sessions[0];
  session.retryIncomplete = jest.fn(async () => {});
  test.options[0].onState({
    phase: "error",
    stoppedByError: true,
    recognitionError: "HOST_UNAVAILABLE",
  });
  await test.controller.retryIncomplete();
  expect(session.retryIncomplete).toHaveBeenCalledTimes(1);
  expect(session.dispose).not.toHaveBeenCalled();
  expect(test.createSession).toHaveBeenCalledTimes(1);
  await test.controller.dispose();
});

test("global recovery requires stopped work and ignores duplicate or late completions", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  let reject;
  test.sessions[0].retryIncomplete = jest.fn(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  await test.controller.retryIncomplete();
  expect(test.sessions[0].retryIncomplete).not.toHaveBeenCalled();
  test.options[0].onState({ phase: "partial", stoppedByError: true });
  const pending = test.controller.retryIncomplete();
  expect(test.controller.state.retrying).toBe(true);
  expect(test.controller.state.stoppedByError).toBe(false);
  await test.controller.retryIncomplete();
  expect(test.sessions[0].retryIncomplete).toHaveBeenCalledTimes(1);
  await test.controller.stop();
  test.controller.start();
  await flush();
  reject(Object.assign(new Error("old failure"), { code: "AUDIO_NETWORK" }));
  await pending;
  expect(test.controller.state.recognitionError).toBeUndefined();
  expect(test.controller.state.retrying).toBe(false);
  await test.controller.dispose();
});

test("retry immediately queues failed tasks, blocks duplicate preparation and reports a new failure", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  let reject;
  const retry = jest.fn(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  );
  test.sessions[0].retryRecognition = retry;
  test.controller.tasks.update({
    id: "block-0",
    kind: "block",
    recognition: "failed",
    errorCode: "INVALID_RESPONSE",
    errorDetail: "old error",
  });
  const pending = test.controller.retryRecognition();
  expect(test.controller.state.retrying).toBe(true);
  expect(test.controller.tasks.rows.get("block-0")).toMatchObject({
    recognition: "queued",
    errorCode: undefined,
    errorDetail: undefined,
  });
  await test.controller.retryRecognition();
  expect(retry).toHaveBeenCalledTimes(1);
  reject(Object.assign(new Error("new failure"), { code: "HOST_UNAVAILABLE" }));
  await pending;
  expect(test.controller.state.retrying).toBe(false);
  expect(test.controller.tasks.rows.get("block-0")).toMatchObject({
    recognition: "failed",
    errorCode: "HOST_UNAVAILABLE",
    errorDetail: "new failure",
  });
  await test.controller.dispose();
});

test("stopping during retry prevents late errors from replacing a new session's tasks", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  let reject;
  test.sessions[0].retryRecognition = () =>
    new Promise((_, fail) => {
      reject = fail;
    });
  test.controller.tasks.update({ id: "block-0", recognition: "failed" });
  const pending = test.controller.retryRecognition();
  await test.controller.stop();
  test.controller.start();
  await flush();
  test.controller.tasks.update({
    id: "block-0",
    recognition: "recognized",
    text: "new session",
  });
  reject(new Error("late failure"));
  await pending;
  expect(test.controller.state.retrying).toBe(false);
  expect(test.controller.tasks.rows.get("block-0").text).toBe("new session");
  expect(test.controller.tasks.rows.get("block-0").recognition).toBe(
    "recognized"
  );
  await test.controller.dispose();
});

test("reopening clears completed progress before the initial empty subtitle update", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  test.controller.emit({
    recognition: { percent: 100 },
    translation: { percent: 100 },
  });
  await test.controller.stop();
  test.controller.start();
  expect(test.onSubtitles).toHaveBeenLastCalledWith(
    [],
    expect.objectContaining({ recognition: undefined, translation: undefined })
  );
  await test.controller.dispose();
});
