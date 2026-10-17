import { YoutubeAsrController } from "./controller";
import { downloadBlobFile } from "../../libs/utils";

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
function setup() {
  const video = { videoId: identity.videoId, element: { currentTime: 1 } },
    setting = { asrApiSlug: "asr" };
  const bridge = {
    configure: jest.fn(),
    snapshot: jest.fn(async () => ({ identity })),
    clear: jest.fn(),
    dispose: jest.fn(),
  };
  const cache = { deleteVideo: jest.fn(async () => {}), close: jest.fn() };
  const sessions = [],
    options = [];
  const createSession = jest.fn((input) => {
    options.push(input);
    const session = {
      identity: input.identity,
      start: jest.fn(async () => {}),
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

test("segment export reuses range clipping, merges duplicate clicks, and never starts recognition", async () => {
  const test = setup();
  test.controller.start();
  await flush();
  const session = test.sessions[0];
  test.controller.tasks.update({
    id: "media-1",
    kind: "media",
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
});

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
