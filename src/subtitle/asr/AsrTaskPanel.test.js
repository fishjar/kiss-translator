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

test("translation selector follows recognition language and reflects the per-video target", () => {
  panel.actions.setTranslationLanguage = jest.fn();
  panel.updateState({ phase: "complete", active: true, translationReady: true, translationLanguage: "zh-CN" });
  flush();
  expect(panel.languageControl.nextElementSibling).toBe(panel.translationControl);
  expect(panel.translationSelect.getAttribute("aria-label")).toBe("Translation language");
  expect(panel.translationSelect.value).toBe("zh-CN");
  expect(panel.translationSelect.disabled).toBe(false);
  panel.translationSelect.value = "ja";
  panel.translationSelect.dispatchEvent(new Event("change"));
  expect(panel.actions.setTranslationLanguage).toHaveBeenCalledWith("ja");
  panel.updateState({ active: true, clearing: true, translationReady: true, translationLanguage: "ja" });
  flush();
  expect(panel.translationSelect.disabled).toBe(true);
});

test("language selector is accessible, reflects the current choice and invokes the controller", () => {
  panel.actions.setLanguage = jest.fn();
  panel.updateState({ phase: "recognizing", active: true, selectedLanguage: "zh-hans",
    effectiveLanguage: "zh-hans", languageSource: "manual",
    languageOptions: [{ value: "zh-hans", label: "简体中文" }, { value: "en", label: "英文" }] });
  flush();
  expect(panel.languageSelect.getAttribute("aria-label")).toBe("Recognition language");
  expect(panel.languageSelect.value).toBe("zh-hans");
  expect(panel.languageStatus.textContent).toBe("简体中文 · Manual");
  panel.languageSelect.value = "en";
  panel.languageSelect.dispatchEvent(new Event("change"));
  expect(panel.actions.setLanguage).toHaveBeenCalledWith("en");
});
const flushPromises = () => Promise.resolve();

test("downloading and reconnecting never expose stale global errors or retry buttons", () => {
  panel.actions.retryIncomplete = jest.fn();
  panel.updateTasks({ tasks: [media(1)] });
  for (const reconnecting of [false, true]) {
    panel.updateState({ phase: "recognizing", stoppedByError: false,
      recognitionError: "AUDIO_NETWORK", audio: { phase: "fetching", percent: 26, bytes: 3500000, reconnecting } });
    flush();
    expect(panel.statusLabel.textContent).not.toContain(t("youtube_asr_network_error"));
    expect(panel.statusRetry.isConnected).toBe(false);
    expect(panel.summary.querySelectorAll("button")).toHaveLength(0);
    expect(panel.statusLabel.textContent).toBe(t(reconnecting ? "youtube_asr_reconnecting" : "youtube_asr_audio_fetching"));
  }
});

test("inline retry buttons pass the current block ID and never invoke global recovery", () => {
  panel.actions.retryRecognition = jest.fn();
  panel.actions.retryTranslation = jest.fn();
  panel.actions.retryIncomplete = jest.fn();
  panel.updateState({ phase: "partial", stoppedByError: true, recognitionError: "ASR_FAILED" });
  panel.updateTasks({ tasks: [media(1), { id: "block-0", kind: "block", startMs: 0, endMs: 500,
    recognition: "failed", errorCode: "ASR_FAILED", translation: "waiting" },
    { id: "block-8000", kind: "block", startMs: 500, endMs: 1000,
      recognition: "recognized", translation: "failed", translationError: "TRANSLATION_FAILED" }] });
  flush();
  const row = panel.rows.get("media-1");
  row.element.open = true;
  panel.render();
  row.children.get("block-0")._recRetry.click();
  row.children.get("block-8000")._trRetry.click();
  expect(panel.actions.retryRecognition).toHaveBeenCalledWith("block-0");
  expect(panel.actions.retryTranslation).toHaveBeenCalledWith("block-8000");
  expect(panel.actions.retryIncomplete).not.toHaveBeenCalled();
  expect(panel.summary.querySelectorAll("button")).toHaveLength(1);
});

test("cache save fallback is informational and never creates a retry button", () => {
  panel.updateState({ phase: "recognizing", cacheMode: "persistent", cacheWarning: "CACHE_WRITE_FAILED",
    audio: { phase: "fetching" } });
  flush();
  expect(panel.cacheNotice.hidden).toBe(false);
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_cache_session_fallback"));
  expect(panel.statusRetry.isConnected).toBe(false);
});

test("only stopped work exposes one global retry; pause and active work hide errors", () => {
  panel.actions.retryIncomplete = jest.fn();
  panel.updateTasks({ tasks: [media(1)] });
  panel.updateState({ phase: "partial", stoppedByError: true, recognitionError: "AUDIO_STALLED" });
  flush();
  expect(panel.statusLabel.textContent).toContain(t("youtube_asr_audio_timeout"));
  expect(panel.statusNotice.hidden).toBe(false);
  panel.statusRetry.click();
  expect(panel.actions.retryIncomplete).toHaveBeenCalledTimes(1);
  panel.updateState({ phase: "paused", paused: true, recognitionError: "AUDIO_STALLED" });
  flush();
  expect(panel.statusLabel.textContent).toBe(t("youtube_asr_paused"));
  expect(panel.statusRetry.isConnected).toBe(false);
  panel.updateState({ phase: "paused", paused: true });
  flush();
  expect(panel.statusLabel.textContent).toBe(t("youtube_asr_paused"));
  panel.updateState({ phase: "waiting", cuttingActive: true });
  flush();
  expect(panel.statusLabel.textContent).toBe(t("youtube_asr_cutting"));
});

test("cutting progress distinguishes unindexed audio from indexed blocks without inflating recognition", () => {
  panel.updateTasks({ tasks: [media(1), media(2), {
    id: "block-0", kind: "block", startMs: 0, endMs: 1000,
    indexed: true, recognition: "waiting", translation: "waiting",
  }] });
  panel.updateState({
    phase: "waiting", audio: { phase: "complete", expectedMs: 2000, percent: 100 },
    cutting: { samples: 16000, totalSamples: 32000, complete: false },
    recognition: { totalSamples: 32000, percent: 0 },
  });
  flush();
  expect(panel.coverage.get("cutting").bar.value).toBe(50);
  expect(panel.coverage.get("recognition").bar.value).toBe(0);
  expect(panel.rows.get("media-1").titleStatus.textContent).toBe(t("youtube_asr_indexed_pending"));
  expect(panel.rows.get("media-2").titleStatus.textContent).toBe(t("youtube_asr_pending_cutting"));
});

test("restored tasks never expose a cache retry control", () => {
  panel.updateTasks({ tasks: [media(1)] });
  panel.updateState({ phase: "cached", cacheRestored: true, audio: { phase: "fetching", cacheStatus: "miss" } });
  flush();
  expect(panel.cacheRetry).toBeUndefined();
  expect(panel.summary.querySelector("button")).toBeNull();
});

test.each(["checking", "hit", "partial", "miss"])("audio cache status %s is independent of restored text", (cacheStatus) => {
  panel.updateState({ phase: "cached", cacheRestored: true, audio: { phase: "restoring", cacheStatus } });
  flush();
  expect(panel.cacheNotice.hidden).toBe(false);
  expect(panel.cacheRetry).toBeUndefined();
  expect(panel.element.textContent).not.toContain(t("youtube_asr_acquiring_audio"));
});

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

test("waiting and errors keep all three coverage bars visible at zero", () => {
  panel.updateState({ phase: "waiting", waitReason: "NEED_PLAYBACK" });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(false);
  expect(panel.summary.textContent).toContain("0%");
  panel.updateState({ phase: "error", error: "AUDIO_CAPTURE_MISSING" });
  flush();
  jest.advanceTimersByTime(10000);
  expect(panel.coverage.get("audio").row.hidden).toBe(false);
});

test("export uses the real parent range and respects phase disabled state", () => {
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
  row.download.click();
  expect(panel.actions.exportSegment).toHaveBeenCalledWith(
    expect.objectContaining({ startMs: 0, endMs: 1000 })
  );
  panel.updateState({ phase: "off" });
  flush();
  expect(row.download.disabled).toBe(true);
});

test("block download beside playback uses the cross-segment range and reflects export state", () => {
  const block = {
    id: "block-0",
    kind: "block",
    startMs: 500,
    endMs: 1500,
    recognition: "recognized",
    translation: "complete",
  };
  panel.updateState({ phase: "complete" });
  panel.updateTasks({ tasks: [media(1), media(2), block] });
  flush();
  const row = panel.rows.get("media-1");
  row.element.open = true;
  panel.render();
  const node = row.children.get(block.id);
  const button = node._downloadBtn;
  expect(node._playBtn.nextElementSibling).toBe(button);
  expect(button.getAttribute("aria-label")).toBe(t("youtube_asr_download_chunk"));
  expect(button.querySelector("svg")).not.toBeNull();
  button.click();
  expect(panel.actions.exportSegment).toHaveBeenCalledWith(
    expect.objectContaining({ id: block.id, startMs: 500, endMs: 1500, crossSegment: true })
  );
  expect(row.element.open).toBe(true);
  panel.updateTasks({ tasks: [{ id: block.id, exportState: "saving" }] });
  flush();
  expect(button.disabled).toBe(true);
  expect(node._exportStatus.textContent).toBe(t("youtube_asr_preparing"));
  button.click();
  expect(panel.actions.exportSegment).toHaveBeenCalledTimes(1);
  panel.updateTasks({ tasks: [{ id: block.id, exportState: "failed" }] });
  flush();
  expect(button.disabled).toBe(false);
  expect(node._exportStatus.textContent).toBe(t("youtube_asr_export_error"));
  button.click();
  expect(panel.actions.exportSegment).toHaveBeenCalledTimes(2);
  panel.updateTasks({ tasks: [{ id: block.id, exportState: "complete" }] });
  flush();
  expect(node._exportStatus.textContent).toBe("");
  expect(node._downloadBtn).toBe(button);
  panel.updateState({ phase: "complete", audio: { phase: "missing" } });
  flush();
  expect(button.disabled).toBe(true);
  panel.updateState({ phase: "off" });
  flush();
  expect(button.disabled).toBe(true);
});

test("partial failures keep row pending and resolve to complete when tasks recover", () => {
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
  expect(mediaRow.titleStatus.textContent).toBe(
    t("youtube_asr_media_downloaded_pending")
  );
  panel.updateTasks({
    tasks: [
      { id: "b", translation: "complete", translationError: undefined },
      { id: "c", translation: "complete", translationError: undefined },
    ],
  });
  flush();
  expect(mediaRow.titleStatus.textContent).toBe(t("youtube_asr_task_complete"));
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

test("media segments are inserted chronologically without rebuilding existing rows", () => {
  panel.updateTasks({
    tasks: [media(2)],
  });
  flush();
  const row2 = panel.rows.get("media-2").element;
  panel.updateTasks({
    tasks: [media(1)],
  });
  flush();
  expect(panel.rows.get("media-1").element.nextElementSibling).toBe(row2);
  expect(panel.rows.get("media-2").element).toBe(row2);
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

test("three coverage bars stay visible and reflect each stage independently", () => {
  panel.updateState({ phase: "waiting", audio: { phase: "missing" } });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(false);
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
  expect(panel.coverage.get("translation").row.hidden).toBe(false);
  panel.updateState({ phase: "recognizing", audio: { phase: "missing" } });
  flush();
  expect(panel.coverage.get("audio").row.hidden).toBe(false);
  expect(panel.coverage.get("recognition").bar.value).toBe(0);
});

test.each([
  ["recognizing", "waiting", undefined, "recognizing"],
  ["recognized", "waiting", "segmenting", "segmenting"],
  ["recognized", "translating", undefined, "translating"],
])("titles reflect active blocks across download segments: %s / %s / %s", (recognition, translation, processing, expected) => {
  panel.updateTasks({
    tasks: [
      media(1), media(2), media(3),
      {
        id: "active-block", kind: "block", startMs: 500, endMs: 1800,
        recognition, translation, processing, startedAt: Date.now(),
      },
    ],
  });
  flush();
  for (const id of ["media-1", "media-2"])
    expect(panel.rows.get(id).titleStatus.textContent).toBe(t(`youtube_asr_task_${expected}`));
  expect(panel.rows.get("media-3").titleStatus.textContent).toBe(t("youtube_asr_media_downloaded_pending"));
  panel.updateTasks({ tasks: [{ id: "active-block", recognition: "recognized", translation: "complete", processing: undefined }] });
  flush();
  for (const id of ["media-1", "media-2"])
    expect(panel.rows.get(id).titleStatus.textContent).toBe(t("youtube_asr_task_complete"));
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

test("media segment row is collapsed by default and contains segment audio controls", () => {
  panel.updateTasks({ tasks: [media(1)] });
  flush();
  const row = panel.rows.get("media-1");
  expect(row.element.open).toBe(false);
  expect(row.download).toBeDefined();
  expect(row.play).toBeDefined();
  expect(row.download.textContent).toBe(t("youtube_asr_download_chunk"));
  expect(row.play.textContent).toBe(t("youtube_asr_play_segment"));
});

test("empty placeholder dynamically reflects the active ASR stage", () => {
  panel.updateState({ phase: "waiting" });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_waiting_player"));

  panel.updateState({ phase: "restoring" });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_checking_cache"));

  panel.updateState({ phase: "cached" });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_restored_fetching_audio"));

  panel.updateState({ phase: "recognizing", audio: { phase: "fetching", cacheStatus: "miss", bytes: 100 } });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_acquiring_audio"));

  panel.updateState({ phase: "error", error: "ASR_FAILED", stoppedByError: true });
  flush();
  expect(panel.statusLabel.textContent).toContain(t("youtube_asr_error"));

  panel.updateTasks({ tasks: [media(1)] });
  flush();
  expect(panel.empty.isConnected).toBe(false);
});

test("checking, zero-byte preparation and a later cache hit never announce a global cache miss", () => {
  const states = [
    { phase: "restoring" },
    { phase: "waiting", audio: { phase: "fetching", cacheStatus: "miss", bytes: 0 } },
    { phase: "waiting", audio: { phase: "restoring", cacheStatus: "checking", bytes: 0 } },
    { phase: "cached", cacheRestored: true, audio: { phase: "complete", cacheStatus: "hit", bytes: 1024 } },
  ];
  const messages = [];
  for (const state of states) {
    panel.updateState(state);
    flush();
    messages.push(panel.cacheNoticeLabel.textContent);
    expect(panel.summary.textContent + panel.element.textContent).not.toMatch(/No local cache found|Audio not cached|downloading audio and recognizing/i);
  }
  expect(messages).toEqual([
    t("youtube_asr_checking_cache"),
    t("youtube_asr_acquiring_audio"),
    t("youtube_asr_checking_cache"),
    t("youtube_asr_audio_cache_hit"),
  ]);
});

test("audio preparation remains neutral alongside restored subtitle tasks", () => {
  panel.updateTasks({ tasks: [media(1)] });
  panel.updateState({ phase: "cached", cacheRestored: true, audio: { phase: "fetching", cacheStatus: "miss", bytes: 0 } });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_acquiring_audio"));
  expect(panel.empty?.isConnected).toBeFalsy();
});

test("empty placeholder displays NEED_PLAYBACK prompt and renders retry button on error", () => {
  panel.actions.retryIncomplete = jest.fn();

  panel.updateState({ phase: "waiting", waitReason: "NEED_PLAYBACK" });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_need_playback"));
  expect(panel.statusRetry.isConnected).toBe(false);

  panel.updateState({ phase: "error", error: "NEED_PLAYBACK", stoppedByError: true });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toBe(t("youtube_asr_need_playback"));
  expect(panel.statusRetry.isConnected).toBe(true);
  expect(panel.statusRetry.textContent).toBe(t("youtube_asr_retry_btn"));

  panel.statusRetry.click();
  expect(panel.actions.retryIncomplete).toHaveBeenCalledTimes(1);

  panel.updateState({ phase: "waiting" });
  flush();
  expect(panel.statusRetry.isConnected).toBe(false);
});

test("empty placeholder displays detailed error message and suppresses failure when 100% complete", () => {
  panel.updateState({ phase: "error", error: "AUDIO_TIMEOUT", stoppedByError: true });
  flush();
  expect(panel.cacheNoticeLabel.textContent).toContain(t("youtube_asr_task_failed"));
  expect(panel.cacheNoticeLabel.textContent).toContain(t("youtube_asr_audio_timeout"));

  panel.updateState({
    phase: "cached",
    cacheRestored: true,
    recognition: { percent: 100, samples: 1000, totalSamples: 1000 },
    translation: { percent: 100, samples: 1000, totalSamples: 1000 },
    error: "AUDIO_TIMEOUT",
  });
  flush();
  expect(panel.cacheNoticeLabel.textContent).not.toContain(t("youtube_asr_task_failed"));
  expect(panel.retryButton?.isConnected).toBeFalsy();
});

test("cached subtitles retain all three bars while audio errors remain visible and retryable", () => {
  panel.actions.retryIncomplete = jest.fn();
  panel.updateState({
    phase: "cached",
    stoppedByError: true,
    recognition: { percent: 100, samples: 1000, totalSamples: 1000 },
    translation: { percent: 100, samples: 1000, totalSamples: 1000 },
    audio: { phase: "error", code: "AUDIO_AUTH_EXPIRED" },
  });
  flush();
  expect(["audio", "recognition", "translation"].every((key) => !panel.coverage.get(key).row.hidden)).toBe(true);
  expect(panel.cacheNoticeLabel.textContent).toContain(t("youtube_asr_task_failed"));
  expect(panel.coverage.get("audio").label.textContent).not.toContain(t("youtube_asr_audio_error"));
  expect(panel.coverage.get("recognition").bar.value).toBe(100);
  expect(panel.coverage.get("translation").bar.value).toBe(100);
  panel.statusRetry.click();
  expect(panel.actions.retryIncomplete).toHaveBeenCalledTimes(1);
});


test("new recognition and translation remain visible in expanded segments across task updates", () => {
  panel.updateState({ phase: "recognizing" });
  panel.updateTasks({ tasks: [media(1)] });
  flush();
  const row = panel.rows.get("media-1");
  row.element.open = true;
  panel.render();
  expect(row.body.textContent).toContain(t("youtube_asr_no_blocks"));
  panel.updateTasks({
    tasks: [
      {
        id: "block-0",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "recognized",
        translation: "translating",
        text: "Fresh speech",
      },
    ],
  });
  flush();
  expect(row.body.textContent).toContain("Fresh speech");
  panel.updateTasks({
    tasks: [
      {
        id: "block-0",
        translation: "complete",
        translationText: "新识别译文",
      },
    ],
  });
  flush();
  expect(row.titleStatus.textContent).toBe(t("youtube_asr_task_complete"));
  expect(row.body.textContent).toContain("Fresh speech");
  expect(row.body.textContent).toContain("新识别译文");
  row.element.open = false;
  panel.updateTasks({ tasks: [{ id: "block-0", text: "Updated speech" }] });
  flush();
  row.element.open = true;
  panel.render();
  expect(row.body.textContent).toContain("Updated speech");
  expect(row.body.textContent).toContain("新识别译文");
});

test("cross-segment text is shown once and the following segment explains its coverage", () => {
  panel.updateTasks({
    tasks: [
      media(1),
      media(2),
      {
        id: "block-0",
        kind: "block",
        startMs: 0,
        endMs: 2000,
        recognition: "recognized",
        translation: "complete",
        text: "Cross segment speech",
        translationText: "跨段译文",
      },
    ],
  });
  flush();
  for (const row of panel.rows.values()) row.element.open = true;
  panel.render();
  expect(panel.rows.get("media-1").body.textContent).toContain("跨段译文");
  expect(panel.rows.get("media-2").body.textContent).toContain(
    t("youtube_asr_covered_elsewhere")
  );
  expect(panel.rows.get("media-2").body.textContent).not.toContain("跨段译文");
});


test("retry preparation replaces the previous error with visible processing feedback", () => {
  panel.updateTasks({
    tasks: [
      media(1),
      {
        id: "block-0",
        kind: "block",
        startMs: 0,
        endMs: 1000,
        recognition: "failed",
        translation: "waiting",
        errorCode: "INVALID_RESPONSE",
      },
    ],
  });
  flush();
  const row = panel.rows.get("media-1");
  row.element.open = true;
  panel.render();
  expect(row.body.textContent).toContain(t("youtube_asr_invalid_response"));
  panel.updateTasks({
    tasks: [{ id: "block-0", recognition: "queued", errorCode: undefined }],
  });
  panel.updateState({ retrying: true });
  flush();
  expect(row.body.textContent).toContain(t("youtube_asr_retrying"));
  expect(row.body.textContent).not.toContain("INVALID_RESPONSE");
  panel.updateTasks({
    tasks: [
      { id: "block-0", recognition: "failed", errorCode: "HOST_UNAVAILABLE" },
    ],
  });
  panel.updateState({ retrying: false });
  flush();
  expect(row.body.textContent).toContain("HOST_UNAVAILABLE");
});
