import { AsrTaskPanel } from "./AsrTaskPanel";
import { ASR_I18N } from "../../config/locales/asr";

const t = (key) => ASR_I18N[key]?.en || key;
const media = (index) => ({
  id: `media-${index}`,
  kind: "media",
  index,
  startMs: (index - 1) * 1000,
  endMs: index * 1000,
  bytes: 1024,
  download: "complete",
});
let panel;
beforeEach(() => {
  jest.useFakeTimers();
  document.body.replaceChildren();
  panel = new AsrTaskPanel(t, { exportSegment: jest.fn() });
  document.body.append(panel.summary, panel.element);
});
afterEach(() => {
  panel.destroy();
  jest.restoreAllMocks();
  delete URL.createObjectURL;
  delete URL.revokeObjectURL;
  jest.useRealTimers();
});
const flush = () => jest.advanceTimersByTime(100);
const flushPromises = () => Promise.resolve();

function previewSetup() {
  const audio = document.createElement("audio");
  const video = document.createElement("video");
  jest.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  jest.spyOn(audio, "play").mockResolvedValue();
  jest.spyOn(video, "play").mockResolvedValue();
  jest.spyOn(window, "Audio").mockReturnValue(audio);
  URL.createObjectURL = jest.fn(() => "blob:preview");
  URL.revokeObjectURL = jest.fn();
  panel.actions.getVideo = () => video;
  panel.actions.prepareSegmentAudio = jest.fn(async () => new Blob(["wav"]));
  panel.actions.setPlaybackError = jest.fn((segment, code) =>
    panel.updateTasks({ tasks: [{ id: segment.id, playbackError: code }] })
  );
  panel.updateState({ phase: "recognizing" });
  panel.updateTasks({ tasks: [media(1), media(2)] });
  flush();
  return { audio, video };
}

test("preview clips the parent range independently, pauses video and releases on end", async () => {
  const { audio, video } = previewSetup();
  video.currentTime = 42;
  await panel.playSegment(media(1));
  expect(panel.actions.prepareSegmentAudio).toHaveBeenCalledWith(media(1));
  expect(video.pause).toHaveBeenCalled();
  expect(video.currentTime).toBe(42);
  expect(audio.play).toHaveBeenCalledTimes(1);
  panel.updateState({ phase: "translating" });
  flush();
  expect(panel.rows.get("media-1").play.textContent).toBe(
    t("youtube_asr_stop_playback")
  );
  audio.onended();
  expect(panel.preview).toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  expect(video.play).not.toHaveBeenCalled();
});

test("switching segments ignores old preparation and stops when video plays or ASR stops", async () => {
  const { audio, video } = previewSetup();
  let resolve;
  panel.actions.prepareSegmentAudio.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const old = panel.playSegment(media(1));
  await panel.playSegment(media(2));
  resolve(new Blob(["old"]));
  await old;
  expect(audio.play).toHaveBeenCalledTimes(1);
  expect(panel.preview.id).toBe("media-2");
  video.dispatchEvent(new Event("play"));
  expect(panel.preview).toBeUndefined();
  await panel.playSegment(media(1));
  panel.updateState({ phase: "off", audio: { phase: "missing" } });
  flush();
  expect(panel.preview).toBeUndefined();
  expect(panel.rows.get("media-1").play.disabled).toBe(true);
});

test("cancelled or destroyed preparation cannot play; failures remain in the row and summary", async () => {
  const { audio } = previewSetup();
  panel.actions.prepareSegmentAudio.mockRejectedValueOnce(new Error("failed"));
  await panel.playSegment(media(1));
  flush();
  expect(panel.rows.get("media-1").playError.textContent).toBe(
    t("youtube_asr_playback_failed")
  );
  expect(panel.rows.get("media-1").play.disabled).toBe(false);
  let resolve;
  panel.actions.prepareSegmentAudio.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const pending = panel.playSegment(media(1));
  await panel.playSegment(media(1));
  panel.destroy();
  resolve(new Blob(["late"]));
  await pending;
  expect(audio.play).not.toHaveBeenCalled();
  expect(panel.actions.prepareSegmentAudio).toHaveBeenCalledTimes(2);
});

test("play rejection releases resources and retry clears the matching error", async () => {
  const { audio } = previewSetup();
  audio.play.mockRejectedValueOnce(new Error("autoplay rejected"));
  await panel.playSegment(media(1));
  expect(panel.preview).toBeUndefined();
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  await panel.playSegment(media(1));
  flush();
  expect(panel.rows.get("media-1").playError.textContent).toBe("");
});

test("waiting and errors keep coverage bars hidden without fake download progress", () => {
  panel.updateState({ phase: "waiting", waitReason: "NEED_PLAYBACK" });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(true);
  expect(panel.summary.textContent).not.toContain("0%");
  panel.updateState({ phase: "error", error: "AUDIO_CAPTURE_MISSING" });
  flush();
  jest.advanceTimersByTime(10000);
  expect(panel.coverage.get("audio").row.hidden).toBe(true);
});

test("cross-segment blocks appear once and export uses the real parent range", () => {
  panel.updateState({
    phase: "recognizing",
    recognition: { percent: 25, totalSamples: 64000 },
  });
  panel.updateTasks({
    tasks: [
      media(1),
      media(2),
      {
        id: "b",
        kind: "block",
        startMs: 0,
        endMs: 2000,
        recognition: "recognizing",
        translation: "waiting",
        startedAt: Date.now(),
      },
    ],
  });
  flush();
  const row = panel.rows.get("media-1");
  expect(row.body.textContent).toContain(t("youtube_asr_cross_segment"));
  expect(row.children.size).toBe(1);
  row.download.click();
  expect(panel.actions.exportSegment).toHaveBeenCalledWith(
    expect.objectContaining({ startMs: 0, endMs: 1000 })
  );
  panel.updateState({ phase: "off" });
  flush();
  expect(row.download.disabled).toBe(true);
});

test("partial failures are visible in task rows and disappear when the tasks recover", () => {
  panel.updateState({ phase: "translating" });
  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "b",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "recognized",
        translation: "failed",
        translationError: "TRANSLATION_FAILED",
      },
      {
        id: "c",
        kind: "block",
        startMs: 1000,
        endMs: 2000,
        translationError: "TRANSLATION_FAILED",
      },
    ],
  });
  flush();
  const mediaRow = panel.rows.get("media-1");
  mediaRow.element.open = true;
  panel.schedule();
  flush();
  expect(mediaRow.body.textContent).toContain("[TRANSLATION_FAILED]");
  panel.updateTasks({
    tasks: [
      { id: "b", translation: "complete", translationError: undefined },
      { id: "c", translation: "complete", translationError: undefined },
    ],
  });
  flush();
  expect(mediaRow.body.textContent).not.toContain("[TRANSLATION_FAILED]");
});

test("long-video metadata is incremental and the initial DOM is bounded", async () => {
  panel.updateState({ phase: "waiting" });
  panel.updateTasks({
    tasks: Array.from({ length: 5000 }, (_, index) => media(index + 1)),
  });
  flush();
  expect(panel.list.querySelectorAll("details")).toHaveLength(100);
  const row = panel.rows.get("media-1").element;
  const observer = new MutationObserver(() => {});
  observer.observe(panel.list, { childList: true, subtree: true });
  panel.updateTasks({ tasks: [{ id: "media-5000", download: "saving" }] });
  flush();
  expect(panel.rows.get("media-1").element).toBe(row);
  expect(observer.takeRecords()).toHaveLength(0);
  observer.disconnect();
});

test("late earlier blocks are inserted chronologically without rebuilding existing rows", () => {
  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "later",
        kind: "block",
        startMs: 500,
        endMs: 1200,
        recognition: "failed",
      },
    ],
  });
  flush();
  const row = panel.rows.get("media-1");
  const laterNode = row.children.get("later");
  panel.updateTasks({
    tasks: [
      {
        id: "earlier",
        kind: "block",
        startMs: 0,
        endMs: 500,
        recognition: "failed",
      },
    ],
  });
  flush();
  expect(
    [...row.body.children].filter((node) =>
      [...row.children.values()].includes(node)
    )
  ).toEqual([row.children.get("earlier"), laterNode]);
  expect(row.children.get("later")).toBe(laterNode);
  panel.updateTasks({ tasks: [{ id: "later", recognition: "recognized" }] });
  flush();
  expect(row.children.get("earlier").nextElementSibling).toBe(laterNode);
});

test("failed blocks show the error code and diagnostic in the row", () => {
  panel.updateState({ phase: "partial" });
  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "failed",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "failed",
        errorCode: "MODEL_NOT_READY",
        errorDetail: "Model download incomplete",
      },
    ],
  });
  flush();
  expect(panel.rows.get("media-1").body.textContent).toContain("[MODEL_NOT_READY]");
  expect(panel.rows.get("media-1").body.textContent).toContain(
    "Model download incomplete"
  );
  panel.updateTasks({
    tasks: [
      {
        id: "failed",
        recognition: "recognized",
        errorCode: undefined,
        errorDetail: undefined,
      },
    ],
  });
  flush();
  expect(panel.rows.get("media-1").body.textContent).not.toContain("Model download incomplete");
});

test("real DOM observers cannot produce a feedback loop from identical task updates", async () => {
  const state = { phase: "waiting" };
  let count = 0;
  const observer = new MutationObserver(() => {
    if (++count > 20) {
      observer.disconnect();
      return;
    }
    panel.updateState(state);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  panel.updateState(state);
  panel.updateTasks({ tasks: [media(1)] });
  for (let i = 0; i < 8; i++) {
    flush();
    await Promise.resolve();
  }
  expect(count).toBeLessThan(5);
  expect(panel.list.querySelector("button").disabled).toBe(false);
  observer.disconnect();
  panel.destroy();
  expect(panel.disposed).toBe(true);
});

test("cooldown countdown ends rather than retaining its last second", () => {
  panel.updateState({
    phase: "waiting",
    audio: { cooldownUntil: Date.now() + 2100 },
  });
  flush();
  expect(panel.cooldownVisible).toBe(true);
  jest.advanceTimersByTime(3000);
  panel.schedule();
  flush();
  expect(panel.cooldownVisible).toBe(false);
});

test("separate coverage bars require genuine task progress and never appear before download", () => {
  panel.updateState({ phase: "waiting", audio: { phase: "missing" } });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(true);
  panel.updateState({
    phase: "recognizing",
    audio: { phase: "fetching", percent: 70, expectedMs: 10000, bytes: 1024 },
    recognition: { percent: 30, totalSamples: 160000, samples: 48000 },
  });
  flush();
  expect(panel.coverage.get("audio").bar.value).toBe(70);
  expect(panel.coverage.get("audio").label.textContent).toContain(
    t("youtube_asr_audio_label")
  );
  expect(panel.coverage.get("recognition").bar.value).toBe(30);
  expect(panel.coverage.get("translation").row.hidden).toBe(true);
  panel.updateState({ phase: "recognizing", audio: { phase: "missing" } });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(true);
  expect(panel.coverage.get("recognition").bar.hasAttribute("value")).toBe(
    false
  );
});

test("audio segment title reflects downloaded_pending vs complete based on children", () => {
  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "child-1",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "recognized",
        translation: "waiting",
      },
    ],
  });
  flush();
  expect(panel.rows.get("media-1").title.textContent).toContain(
    t("youtube_asr_media_downloaded_pending")
  );
  expect(panel.rows.get("media-1").titleStatus.textContent).toBe(
    t("youtube_asr_media_downloaded_pending")
  );

  panel.updateTasks({
    tasks: [
      {
        id: "child-1",
        translation: "complete",
      },
    ],
  });
  flush();
  expect(panel.rows.get("media-1").title.textContent).toContain(
    t("youtube_asr_task_complete")
  );
  expect(panel.rows.get("media-1").titleStatus.textContent).toBe(
    t("youtube_asr_task_complete")
  );
});

test("audio segment covered by cross-segment block completes when covering block completes", () => {
  panel.updateTasks({
    tasks: [
      media(1),
      media(2),
      {
        id: "block-1",
        kind: "block",
        startMs: 0,
        endMs: 2000,
        recognition: "recognized",
        translation: "waiting",
      },
    ],
  });
  flush();
  const row2 = panel.rows.get("media-2");
  expect(row2.titleStatus.textContent).toBe(
    t("youtube_asr_media_downloaded_pending")
  );

  panel.updateTasks({
    tasks: [
      {
        id: "block-1",
        translation: "complete",
      },
    ],
  });
  flush();
  expect(row2.titleStatus.textContent).toBe(
    t("youtube_asr_task_complete")
  );
});

test("recognition and translation display full text and retry buttons trigger actions", () => {
  panel.actions.retryRecognition = jest.fn();
  panel.actions.retryTranslation = jest.fn();

  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "child-1",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "failed",
        errorCode: "ASR_ERROR",
        translation: "failed",
        translationError: "TR_ERROR",
      },
    ],
  });
  flush();

  const childNode = panel.rows.get("media-1").children.get("child-1");
  expect(childNode._recText.textContent).toContain("[ASR_ERROR]");
  expect(childNode._recRetry.style.display).toBe("inline-flex");
  expect(childNode._trText.textContent).toContain("[TR_ERROR]");
  expect(childNode._trRetry.style.display).toBe("inline-flex");

  childNode._recRetry.click();
  expect(panel.actions.retryRecognition).toHaveBeenCalledTimes(1);

  childNode._trRetry.click();
  expect(panel.actions.retryTranslation).toHaveBeenCalledTimes(1);

  // When complete, displays full text
  panel.updateTasks({
    tasks: [
      {
        id: "child-1",
        recognition: "recognized",
        errorCode: undefined,
        text: "Hello world",
        translation: "complete",
        translationError: undefined,
        translationText: "你好世界",
      },
    ],
  });
  flush();

  expect(childNode._recText.textContent).toContain("Hello world");
  expect(childNode._recRetry.style.display).toBe("none");
  expect(childNode._trText.textContent).toContain("你好世界");
  expect(childNode._trRetry.style.display).toBe("none");
});

test("child block play icon plays segment audio independently", async () => {
  const { audio } = previewSetup();
  const childBlock = {
    id: "child-1",
    kind: "block",
    startMs: 0,
    endMs: 500,
    recognition: "recognized",
    translation: "complete",
  };
  panel.updateTasks({ tasks: [media(1), childBlock] });
  flush();

  const childNode = panel.rows.get("media-1").children.get("child-1");
  expect(childNode._playBtn.textContent).toBe("▶");

  childNode._playBtn.click();
  await flushPromises();
  expect(panel.actions.prepareSegmentAudio).toHaveBeenCalledWith(
    expect.objectContaining({ id: "child-1" })
  );
  expect(audio.play).toHaveBeenCalled();
});
