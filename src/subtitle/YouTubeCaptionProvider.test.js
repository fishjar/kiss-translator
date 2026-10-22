import { YouTubeSubtitleList } from "./YouTubeSubtitleList";
import { act } from "react";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { YouTubeCaptionProvider } from "./YouTubeCaptionProvider.js";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import { prepareTimedTextEvents } from "./youtubeSubtitleProcessing.js";
import { clearMsgHistory } from "../apis/history.js";
import {
  captionCacheRequest,
  captionSegmentationSignature,
  captionTranslationSignature,
} from "./captionCache";
import { captionTrackId } from "./youtubeCaptionSource";
jest.mock("./captionCache", () => ({
  captionCueKey: ({ start, end, text }) => JSON.stringify([start, end, text]),
  captionTranslationSignature: jest.fn(),
  captionCacheRequest: jest.fn(),
  captionSegmentationSignature: jest.fn(),
}));

const mockAcquire = jest.fn();
const mockUiOptions = [];
const mockProviders = [];
const mockCancel = jest.fn();
let mockCapture;
let mockIsAd = false;
let mockSnapshotReady = true;
const mockAsrControllers = [];
let mockDelayAsr = false;
let mockRealUi = false;
jest.mock("./asr/controller", () => ({
  youtubeAsrSupported: true,
  YoutubeAsrController: class {
    constructor(options) {
      this.options = options;
      this.active = false;
      mockAsrControllers.push(this);
    }
    service = () => ({ apiSlug: "asr" });
    start = jest.fn(() => {
      this.active = true;
      if (mockDelayAsr) {
        this.options.onState({ phase: "waiting" });
        this.options.onSubtitles([], {});
        return;
      }
      this.options.onState({
        phase: "cached",
        sourceLanguage: "en",
        recognition: { percent: 100 },
      });
      this.options.onSubtitles(
        [{ start: 0, end: 1000, text: "audio", translation: "语音" }],
        { recognition: { percent: 100 } }
      );
    });
    stop = jest.fn(async () => {
      this.active = false;
      this.options.onState({ phase: "off", active: false });
    });
    dispose = jest.fn(async () => {
      this.active = false;
    });
    tick = jest.fn();
    beginSeek = jest.fn();
    seek = jest.fn();
    restart = jest.fn();
  },
}));
let mockTrack = { languageCode: "en", vssId: "a.en", kind: "asr" };
const mockResult = (videoId) => ({
  videoId,
  track: mockTrack,
  events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "hello" }] }],
  source: "capture",
});
jest.mock("./youtubeAcquisition", () => ({
  YouTubeCaptionBridgeClient: class {
    constructor(onCapture) {
      mockCapture = onCapture;
    }
    request = jest.fn(async () => ({
      videoId: new URL(global.location.href).searchParams.get("v"),
      selectedTrack: mockTrack,
      captionTracks: [mockTrack],
      isAd: mockIsAd,
      ready: mockSnapshotReady,
    }));
    clear = jest.fn();
    dispose = jest.fn();
  },
  YouTubeCaptionAcquirer: class {
    constructor(bridge, onState) {
      this.onState = onState;
    }
    cancel() {
      mockCancel();
      this.inFlight = null;
    }
    acquire(videoId) {
      this.onState({ phase: "loading" });
      const promise = mockAcquire(videoId);
      this.inFlight = { videoId, promise };
      return promise.finally(() => {
        this.inFlight = null;
      });
    }
  },
}));
const mockIsSameLang = jest.fn(() => false);
const mockManagerSettings = [];
const mockManagers = [];

jest.mock("../config", () => ({
  MSG_XHR_DATA_YOUTUBE: "xhr-youtube",
  API_SPE_TYPES: { ai: new Set(["openai"]) },
  OPT_ENHANCE_ON: "on",
  OPT_ENHANCE_OFF: "off",
  OPT_ENHANCE_MOBILE_OFF: "mobile_off",
  newI18n: () => (key) => key,
}));

jest.mock("../apis/index.js", () => ({
  apiSubtitle: jest.fn(),
  apiSummarizeContext: jest.fn(),
}));

jest.mock("../apis/history.js", () => ({ clearMsgHistory: jest.fn() }));
jest.mock("../libs/docInfo.js", () => ({ getDocInfo: () => ({}) }));

jest.mock("./youtubePlayerUi.js", () => ({
  CONTROLS_SELECTOR: ".controls",
  VIDEO_SELECTOR: "video",
  YT_AD_SELECTOR: ".ad",
  YT_SUBTITLE_BUTTON_SELECTOR: ".ytp-subtitles-button",
  waitForElement: jest.fn(),
  YouTubePlayerUi: class {
    constructor(options) {
      mockUiOptions.push(options);
      if (mockRealUi) {
        const ui = new (jest.requireActual(
          "./youtubePlayerUi.js"
        ).YouTubePlayerUi)(options);
        ui.injectToggleButton = jest.fn();
        ui.updateMenuProps = jest.fn();
        return ui;
      }
    }
    injectToggleButton = jest.fn();
    removeToggleButton = jest.fn();
    updateMenuProps = jest.fn();
    showNotification = jest.fn();
    resetTaskFeedback = jest.fn();
    updateAsrFeedback = jest.fn();
    updateCaptionFeedback = jest.fn();
    notifyOnce = jest.fn();
    hideNotification = jest.fn();
    hideYtCaption = jest.fn();
    showYtCaption = jest.fn();
  },
}));

jest.mock("./youtubeCaptionTracks.js", () => ({
  isSameLang: (...args) => mockIsSameLang(...args),
}));

jest.mock("./youtubeSubtitleProcessing.js", () => ({
  builtinSegment: jest.fn(),
  formatSubtitles: jest.fn(),
  getFromLang: () => "en",
  prepareTimedTextEvents: jest.fn(),
}));

jest.mock("./youtubeAiSegmentation.js", () => ({
  eventsToSubtitles: jest.fn(),
}));

jest.mock("./BilingualSubtitleManager.js", () => ({
  BilingualSubtitleManager: class {
    constructor({ formattedSubtitles, setting }) {
      this.formattedSubtitles = formattedSubtitles;
      this.setting = setting;
      mockManagerSettings.push(setting);
      mockManagers.push(this);
    }
    start = jest.fn();
    destroy = jest.fn();
    appendSubtitles = jest.fn();
    repairChunkTranslations = jest.fn();
  },
}));

jest.mock("./YouTubeSubtitleList.js", () => ({
  YouTubeSubtitleList: jest.fn().mockImplementation((video, i18n, options) => ({
    asrActions: options.asrActions,
    initialize: jest.fn(),
    updateAsrState: jest.fn(),
    updateCaptionState: jest.fn(),
    updateAsrTasks: jest.fn(),
    selectAsrTab: jest.fn(),
    setBilingualSubtitles: jest.fn(),
    updateSingleSubtitle: jest.fn(),
    turnOnAutoSub: jest.fn(),
    destroy: jest.fn(),
  })),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("YouTubeCaptionProvider acquisition lifecycle", () => {
  let provider;
  const apiA = { apiSlug: "api-a", apiName: "A", apiType: "builtin" };
  const apiB = { apiSlug: "api-b", apiName: "B", apiType: "openai" };
  const create = (patch = {}) => {
    provider = new YouTubeCaptionProvider({
      autoTranslate: true,
      apiSlug: apiA.apiSlug,
      apiSetting: apiA,
      transApis: [apiA, apiB],
      segSlug: "-",
      aiContextSlug: "-",
      toLang: "zh-CN",
      showList: "off",
      ...patch,
    });
    mockProviders.push(provider);
    provider.initialize();
    return provider;
  };
  const props = () => mockUiOptions[mockUiOptions.length - 1].getMenuProps();
  beforeEach(() => {
    jest.clearAllMocks();
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup" ? { entry: null, generation: 0 } : true
    );
    captionSegmentationSignature.mockResolvedValue("signature");
    captionTranslationSignature.mockResolvedValue("translation-signature");
    YouTubeSubtitleList.mockImplementation((video, i18n, options) => ({
      asrActions: options.asrActions,
      initialize: jest.fn(),
      updateAsrState: jest.fn(),
      updateCaptionState: jest.fn(),
      updateAsrTasks: jest.fn(),
      selectAsrTab: jest.fn(),
      setBilingualSubtitles: jest.fn(),
      updateSingleSubtitle: jest.fn(),
      turnOnAutoSub: jest.fn(),
      destroy: jest.fn(),
    }));
    mockManagerSettings.length = 0;
    mockManagers.length = 0;
    mockUiOptions.length = 0;
    mockIsAd = false;
    mockSnapshotReady = true;
    mockAsrControllers.length = 0;
    mockDelayAsr = false;
    mockRealUi = false;
    mockTrack = { languageCode: "en", vssId: "a.en", kind: "asr" };
    window.history.replaceState({}, "", "/watch?v=video-1");
    document.body.innerHTML =
      '<div id="movie_player"><video></video><div class="ytp-right-controls"><button class="ytp-subtitles-button" aria-pressed="true"></button></div></div>';
    mockAcquire.mockImplementation(async (videoId) => mockResult(videoId));
    prepareTimedTextEvents.mockReturnValue({
      events: [{ text: "hello" }],
      flatEvents: [{ start: 0, end: 1000, text: "hello" }],
    });
    eventsToSubtitles.mockResolvedValue([
      [{ start: 0, end: 1000, text: "hello", translation: "你好" }],
      100,
      null,
    ]);
  });
  afterEach(() => {
    mockProviders.splice(0).forEach((p) => p.destroy());
    document.body.innerHTML = "";
  });

  test("cached raw captions and matching bilingual results restore without acquisition or another segmentation call", async () => {
    const entry = {
      ...mockResult("video-1"),
      trackKey: captionTrackId(mockTrack),
      bilingual: {
        segmentationSignature: "signature",
        translationSignature: "translation-signature",
        complete: true,
        cues: [
          { start: 0, end: 1000, text: "cached", translation: "缓存译文" },
        ],
      },
    };
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup" ? { entry, generation: 0 } : true
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(eventsToSubtitles).not.toHaveBeenCalled();
    expect(mockManagers[0].appendSubtitles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: "cached", translation: "缓存译文" }),
      ])
    );
  });

  test("Shorts bypasses native subtitle lookup and persistence", async () => {
    window.history.replaceState({}, "", "/shorts/kSQknoHMFtk");
    document.getElementById("movie_player").setAttribute("id", "shorts-player");
    document.getElementById("shorts-player").className = "html5-video-player";
    document.getElementById("shorts-player").getVideoData = () => ({
      video_id: "kSQknoHMFtk",
    });
    captionCacheRequest.mockImplementation(() => {
      throw Error("persistent cache touched");
    });
    create();
    await flushPromises();
    await flushPromises();
    expect(mockAcquire).toHaveBeenCalledWith("kSQknoHMFtk");
    expect(captionCacheRequest).not.toHaveBeenCalled();
    provider.destroy();
    expect(captionCacheRequest).not.toHaveBeenCalled();
  });

  test("same video switches storage policy between watch and Shorts without navigation-start", async () => {
    const id = "kSQknoHMFtk";
    window.history.replaceState({}, "", `/watch?v=${id}`);
    const player = document.getElementById("movie_player");
    player.className = "html5-video-player";
    player.getVideoData = () => ({ video_id: id });
    create({ asrApiSlug: "asr" });
    await flushPromises();
    expect(captionCacheRequest).toHaveBeenCalled();
    captionCacheRequest.mockClear();
    window.history.replaceState({}, "", `/shorts/${id}`);
    window.dispatchEvent(new Event("popstate"));
    await flushPromises();
    await flushPromises();
    expect(captionCacheRequest).not.toHaveBeenCalled();
    props().asrActions.start();
    expect(mockAsrControllers.at(-1).options.getVideo().cacheMode).toBe(
      "session"
    );
    window.history.replaceState({}, "", `/watch?v=${id}`);
    window.dispatchEvent(new Event("popstate"));
    await flushPromises();
    expect(captionCacheRequest).toHaveBeenCalledWith("lookup", { videoId: id });
  });

  test("disabled storage and cache read failures still acquire captions normally", async () => {
    create({ captionCacheLimit: 0 });
    await flushPromises();
    expect(captionCacheRequest).not.toHaveBeenCalled();
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    provider.destroy();
    captionCacheRequest.mockRejectedValue(new Error("cache unavailable"));
    create();
    await flushPromises();
    expect(mockAcquire).toHaveBeenCalledTimes(2);
  });

  test("a slow cache lookup cannot restore the previous video after navigation", async () => {
    let resolveOld;
    captionCacheRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    create();
    window.dispatchEvent(new Event("yt-navigate-start"));
    window.history.replaceState({}, "", "/watch?v=video-2");
    window.dispatchEvent(new Event("yt-navigate-finish"));
    resolveOld({
      entry: { ...mockResult("video-1"), trackKey: captionTrackId(mockTrack) },
      generation: 0,
    });
    await flushPromises();
    await flushPromises();
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    expect(eventsToSubtitles.mock.calls[0][0].videoId).toBe("video-2");
  });

  test("changed segmentation settings reuse raw captions but run segmentation again", async () => {
    const entry = {
      ...mockResult("video-1"),
      trackKey: captionTrackId(mockTrack),
      bilingual: {
        segmentationSignature: "old",
        cues: [{ start: 0, end: 1000, text: "old" }],
      },
    };
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup" ? { entry, generation: 0 } : true
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    expect(captionCacheRequest).toHaveBeenCalledWith(
      "put",
      expect.objectContaining({
        generation: 0,
        entry: expect.objectContaining({
          bilingual: expect.objectContaining({
            segmentationSignature: "signature",
          }),
        }),
      })
    );
  });

  test("translation changes preserve the complete source structure but clear old translations", async () => {
    const entry = {
      ...mockResult("video-1"),
      trackKey: captionTrackId(mockTrack),
      bilingual: {
        segmentationSignature: "signature",
        translationSignature: "old-language",
        complete: true,
        cues: [
          {
            start: 0,
            end: 1000,
            text: "cached",
            translation: "old translation",
          },
        ],
      },
    };
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup" ? { entry, generation: 0 } : true
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(eventsToSubtitles).not.toHaveBeenCalled();
    expect(mockManagers[0].formattedSubtitles).toEqual([
      expect.objectContaining({ text: "cached", translation: "" }),
    ]);
    expect(apiSummarizeContext).not.toHaveBeenCalled();
  });

  test("partial results restore immediately, rebuild chunks and persist only final source and translation results", async () => {
    const hello = {
      start: 0,
      end: 1000,
      text: "hello",
      translation: "cached translation",
    };
    const future = {
      start: 5000,
      end: 6000,
      text: "future",
      translation: "future translation",
    };
    const entry = {
      ...mockResult("video-1"),
      trackKey: captionTrackId(mockTrack),
      bilingual: {
        segmentationSignature: "signature",
        translationSignature: "translation-signature",
        complete: false,
        cues: [
          hello,
          { start: 1000, end: 2000, text: "outdated", translation: "old" },
          future,
        ],
      },
    };
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup" ? { entry, generation: 0 } : true
    );
    let completeChunk, restoredBeforeRebuild;
    eventsToSubtitles.mockImplementation(
      async ({ onAppendSubtitles, onChunkComplete }) => {
        restoredBeforeRebuild = [...mockManagers[0].formattedSubtitles];
        onAppendSubtitles({
          subtitles: [
            {
              start: 0,
              end: 3000,
              text: "stream draft",
              translation: "unfinished",
            },
          ],
          progressed: 100,
        });
        completeChunk = onChunkComplete;
        onChunkComplete({
          subtitles: [{ ...hello, translation: "" }],
          progressed: 33,
          start: 0,
          end: 3000,
        });
        return [
          [{ ...hello, translation: "" }],
          33,
          { scheduleUntil: jest.fn() },
        ];
      }
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(restoredBeforeRebuild).toEqual(
      expect.arrayContaining([
        expect.objectContaining(hello),
        expect.objectContaining(future),
      ])
    );
    expect(mockManagers[0].formattedSubtitles).toMatchObject([hello, future]);
    mockManagerSettings[0].onTranslationComplete({
      ...hello,
      translation: "final translation",
    });
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const writes = captionCacheRequest.mock.calls.filter(
      ([action]) => action === "put"
    );
    const saved = writes.at(-1)[1].entry;
    expect(saved.summary).toBeUndefined();
    expect(saved.bilingual).toMatchObject({
      complete: false,
      cues: [{ ...hello, translation: "final translation" }, future],
    });
    completeChunk({
      subtitles: [future],
      progressed: 100,
      start: 5000,
      end: 6000,
    });
    provider.destroy();
    expect(
      captionCacheRequest.mock.calls
        .filter(([action]) => action === "put")
        .at(-1)[1].entry.bilingual.complete
    ).toBe(true);
  });

  test("an AI streaming translation is not persisted when the final chunk has no translation", async () => {
    eventsToSubtitles.mockImplementation(
      async ({ onAppendSubtitles, onChunkComplete }) => {
        const cue = { start: 0, end: 1000, text: "hello", translation: "" };
        onAppendSubtitles({
          subtitles: [{ ...cue, translation: "unfinished AI translation" }],
          progressed: 100,
        });
        onChunkComplete({
          subtitles: [cue],
          progressed: 100,
          start: 0,
          end: 1000,
        });
        return [[cue], 100, null];
      }
    );
    create();
    await flushPromises();
    await flushPromises();
    provider.destroy();
    const saved = captionCacheRequest.mock.calls
      .filter(([action]) => action === "put")
      .at(-1)[1].entry;
    expect(saved.bilingual.cues).toEqual([
      { start: 0, end: 1000, text: "hello", translation: "" },
    ]);
  });

  test("stream updates and final chunks retain identical objects while translating", async () => {
    let original, afterStream, afterFinal;
    eventsToSubtitles.mockImplementation(
      async ({ onAppendSubtitles, onChunkComplete }) => {
        const cue = { start: 0, end: 1000, text: "hello", translation: "" };
        onAppendSubtitles({ subtitles: [cue], progressed: 0 });
        original = mockManagers[0].formattedSubtitles[0];
        original.isTranslating = true;
        onAppendSubtitles({ subtitles: [{ ...cue }], progressed: 0 });
        afterStream = mockManagers[0].formattedSubtitles[0];
        onChunkComplete({
          subtitles: [{ ...cue }],
          progressed: 100,
          start: 0,
          end: 1000,
        });
        afterFinal = mockManagers[0].formattedSubtitles[0];
        return [[{ ...cue }], 100, null];
      }
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(original).toBeDefined();
    expect(afterStream).toBe(original);
    expect(afterFinal).toBe(original);
    expect(mockManagers[0].formattedSubtitles[0]).toBe(original);
  });

  test("translation callbacks from a destroyed manager cannot change cached results", async () => {
    create();
    await flushPromises();
    await flushPromises();
    const complete = mockManagerSettings[0].onTranslationComplete;
    provider.destroy();
    const writes = captionCacheRequest.mock.calls.length;
    complete({ start: 0, end: 1000, text: "hello", translation: "stale" });
    expect(captionCacheRequest.mock.calls).toHaveLength(writes);
  });

  test("a cached different track is ignored", async () => {
    captionCacheRequest.mockImplementation(async (action) =>
      action === "lookup"
        ? {
            entry: { ...mockResult("video-1"), trackKey: "different" },
            generation: 0,
          }
        : true
    );
    create();
    await flushPromises();
    await flushPromises();
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });

  test("manual ASR waiting keeps the event loop responsive with real UI and DOM observers", async () => {
    const NativeObserver = global.MutationObserver;
    let callbacks = 0,
      stoppedByGuard = false;
    const observers = [];
    global.MutationObserver = class extends NativeObserver {
      constructor(callback) {
        super((records, observer) => {
          if (++callbacks > 80) {
            stoppedByGuard = true;
            observer.disconnect();
            return;
          }
          callback(records, observer);
        });
        observers.push(this);
      }
    };
    mockRealUi = true;
    mockDelayAsr = true;
    mockTrack = { languageCode: "en", vssId: ".en" };
    try {
      create({ asrApiSlug: "asr" });
      await flushPromises();
      const managersBefore = mockManagers.length;
      props().asrActions.start();
      document
        .querySelector("#movie_player")
        .appendChild(document.createElement("span"));
      let timerRan = false;
      await new Promise((resolve) =>
        setTimeout(() => {
          timerRan = true;
          resolve();
        }, 0)
      );
      expect(timerRan).toBe(true);
      expect(stoppedByGuard).toBe(false);
      expect(
        document.querySelector(".kiss-notification")?.textContent
      ).not.toBe("waitting_for_subtitle");
      expect(mockManagers).toHaveLength(managersBefore);
      const controller = mockAsrControllers[0];
      controller.options.onSubtitles(
        [{ start: 0, end: 1000, text: "audio", translation: "语音" }],
        { recognition: { percent: 1 } }
      );
      await flushPromises();
      expect(mockManagers).toHaveLength(managersBefore + 1);
      props().asrActions.stop();
      await flushPromises();
      const count = mockManagers.length;
      controller.options.onSubtitles(
        [{ start: 0, end: 1000, text: "late" }],
        {}
      );
      expect(mockManagers).toHaveLength(count);
    } finally {
      provider?.destroy();
      observers.forEach((observer) => observer.disconnect());
      global.MutationObserver = NativeObserver;
    }
  });
  test("ASR opens the empty sidebar immediately, preserves the chosen tab, and respects manual close", async () => {
    mockDelayAsr = true;
    create({ asrApiSlug: "asr", showList: "off" });
    await act(async () => flushPromises());
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(1);
    const first = YouTubeSubtitleList.mock.results[0].value;
    expect(first.initialize.mock.calls[0][0]).toEqual([]);
    expect(first.selectAsrTab).toHaveBeenCalledTimes(1);
    const asr = mockAsrControllers[0];
    asr.options.onSubtitles([{ start: 0, end: 1000, text: "audio" }], {
      recognition: { percent: 10 },
    });
    expect(first.destroy).not.toHaveBeenCalled();
    expect(first.selectAsrTab).toHaveBeenCalledTimes(1);
    YouTubeSubtitleList.mock.calls[0][2].onClose();
    asr.options.onSubtitles([{ start: 0, end: 1000, text: "audio" }], {
      recognition: { percent: 20 },
    });
    await act(async () => flushPromises());
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(1);
    props().asrActions.stop();
    await act(async () => flushPromises());
    props().asrActions.start();
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(2);
    expect(
      YouTubeSubtitleList.mock.results[1].value.selectAsrTab
    ).toHaveBeenCalledTimes(1);
  });

  test("ASR clears native captions immediately and streams originals, translations and empty progress", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    const list = YouTubeSubtitleList.mock.results.at(-1).value;
    const nativeManager = mockManagers.at(-1);
    expect(nativeManager.formattedSubtitles[0].text).toBe("hello");
    mockDelayAsr = true;
    props().asrActions.start();
    expect(nativeManager.destroy).toHaveBeenCalled();
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith([], 0);
    expect(props().progressed).toBe(0);
    const controller = mockAsrControllers[0];
    controller.options.onSubtitles([], { recognition: { percent: 5 } });
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith([], 5);
    expect(props().progressed).toBe(5);
    const original = [
      { start: 0, end: 1000, text: "Fresh speech", translation: "" },
    ];
    controller.options.onSubtitles(original, { recognition: { percent: 10 } });
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(original, 10);
    expect(mockManagers.at(-1).formattedSubtitles).toEqual(original);
    const translated = [{ ...original[0], translation: "新译文" }];
    controller.options.onSubtitles(translated, {
      recognition: { percent: 10 },
    });
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(translated, 10);
    expect(mockManagers.at(-1).formattedSubtitles).toEqual(translated);
    props().asrActions.stop();
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: "hello", translation: "你好" }),
      ]),
      100
    );
  });

  test("partial native captions rebuild scheduling after ASR and reject old callbacks", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    const firstScheduler = { scheduleUntil: jest.fn() };
    const nextScheduler = { scheduleUntil: jest.fn() };
    const cue = { start: 0, end: 1000, text: "hello", translation: "你好" };
    eventsToSubtitles.mockResolvedValueOnce([[cue], 25, firstScheduler]);
    eventsToSubtitles.mockResolvedValueOnce([[cue], 25, nextScheduler]);
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    const originalCall = eventsToSubtitles.mock.calls[0][0];
    props().asrActions.start();
    expect(originalCall.signal.aborted).toBe(true);
    originalCall.onAppendSubtitles({
      subtitles: [{ ...cue, text: "stale" }],
      progressed: 100,
    });
    expect(mockManagers.at(-1).formattedSubtitles[0].text).toBe("audio");
    document.querySelector("video").currentTime = 120;
    props().asrActions.stop();
    expect(mockManagers.at(-1).formattedSubtitles[0].text).toBe("hello");
    await act(async () => flushPromises());
    expect(eventsToSubtitles).toHaveBeenCalledTimes(2);
    const resumed = eventsToSubtitles.mock.calls[1][0];
    expect(resumed.signal).not.toBe(originalCall.signal);
    expect(resumed.signal.aborted).toBe(false);
    expect(nextScheduler.scheduleUntil).toHaveBeenCalledWith(120000, 90);
    mockManagers
      .at(-1)
      .setting.onSubtitleTimeWindow({ currentTimeMs: 240000, preTrans: 30 });
    expect(nextScheduler.scheduleUntil).toHaveBeenLastCalledWith(240000, 30);
  });

  test("stopping ASR immediately restores native bilingual captions without reacquisition", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    const list = YouTubeSubtitleList.mock.results.at(-1).value;
    const native = mockManagers
      .at(-1)
      .formattedSubtitles.map((cue) => ({ ...cue }));
    expect(native[0].text).toBe("hello");
    const calls = mockAcquire.mock.calls.length;
    props().asrActions.start();
    expect(mockManagers.at(-1).formattedSubtitles[0].text).toBe("audio");
    props().asrActions.stop();
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(native, 100);
    expect(mockManagers.at(-1).formattedSubtitles).toEqual(native);
    expect(mockManagers.at(-1).setting.managedTranslations).toBe(false);
    expect(mockAcquire).toHaveBeenCalledTimes(calls);
    props().asrActions.start();
    props().asrActions.stop();
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(native, 100);
    expect(mockAcquire).toHaveBeenCalledTimes(calls);
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
  });

  test("native snapshot is invalidated when translation service changes during ASR", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    props().asrActions.start();
    provider.updateSetting({ name: "apiSlug", value: apiB.apiSlug });
    const calls = mockAcquire.mock.calls.length;
    props().asrActions.stop();
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(calls + 1);
  });

  test("video changes cannot restore the previous video's native caption snapshot", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    props().asrActions.start();
    mockAcquire.mockReturnValue(new Promise(() => {}));
    window.dispatchEvent(new Event("yt-navigate-start"));
    window.history.replaceState({}, "", "/watch?v=video-2");
    window.dispatchEvent(new Event("yt-navigate-finish"));
    await act(async () => flushPromises());
    props().asrActions.start();
    props().asrActions.stop();
    const list = YouTubeSubtitleList.mock.results.at(-1).value;
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith([], 0);
  });

  test("stopping ASR without a native snapshot can retry failed caption acquisition", async () => {
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    mockAcquire.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), { code: "TIMEOUT" })
    );
    props().asrActions.stop();
    await act(async () => flushPromises());
    const list = YouTubeSubtitleList.mock.results.at(-1).value;
    expect(list.updateCaptionState).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "error" })
    );
    await YouTubeSubtitleList.mock.calls.at(-1)[2].retryCaptions();
    await act(async () => flushPromises());
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: "hello", translation: "你好" }),
      ]),
      100
    );
    expect(props().acquisition.phase).toBe("ready");
  });

  test("fresh ASR originals and translations replace the bilingual list incrementally", async () => {
    mockDelayAsr = true;
    create({ asrApiSlug: "asr", showList: "on" });
    await act(async () => flushPromises());
    const controller = mockAsrControllers[0];
    const list = YouTubeSubtitleList.mock.results.at(-1).value;
    const original = [
      { start: 0, end: 1000, text: "Fresh speech", translation: "" },
    ];
    controller.options.onSubtitles(original, { recognition: { percent: 50 } });
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(original, 50);
    const manager = mockManagers.at(-1);
    const translated = [
      { ...original[0], translation: "新识别译文" },
      { start: 1000, end: 2000, text: "Next speech", translation: "下一句" },
    ];
    controller.options.onSubtitles(translated, {
      recognition: { percent: 100 },
    });
    expect(list.setBilingualSubtitles).toHaveBeenLastCalledWith(
      translated,
      100
    );
    expect(manager.formattedSubtitles).toEqual(translated);
    expect(manager.appendSubtitles).toHaveBeenLastCalledWith(translated);
    expect(manager.setting.managedTranslations).toBe(true);
    expect(mockAcquire).not.toHaveBeenCalled();
  });

  test("configured ASR automatically replaces auto captions and ignores native CC off", async () => {
    document
      .querySelector(".ytp-subtitles-button")
      .setAttribute("aria-pressed", "false");
    create({ asrApiSlug: "asr" });
    await act(async () => flushPromises());
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockAsrControllers[0].start).toHaveBeenCalledTimes(1);
    expect(mockManagerSettings[0].managedTranslations).toBe(true);
    expect(props().asr.active).toBe(true);
    document.querySelector(".ytp-subtitles-button").click();
    await act(async () => flushPromises());
    expect(mockAsrControllers[0].active).toBe(true);
  });

  test("sidebar offers ASR while inactive without creating an unconfigured controller", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    mockAcquire.mockReturnValue(new Promise(() => {}));
    create({ showList: "on" });
    await flushPromises();
    expect(mockAsrControllers).toHaveLength(0);
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(1);
    const list = YouTubeSubtitleList.mock.results[0].value;
    expect(list.asrActions.start).toEqual(expect.any(Function));
    expect(list.updateAsrState).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, available: false })
    );
    expect(list.selectAsrTab).not.toHaveBeenCalled();
    provider.updateSetting({ name: "autoTranslate", value: false });
    expect(list.destroy).toHaveBeenCalledTimes(1);
  });

  test("sidebar survives ASR start and stop and remains closed after an explicit user close", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    mockAcquire.mockReturnValue(new Promise(() => {}));
    mockDelayAsr = true;
    create({ showList: "on", asrApiSlug: "asr" });
    await flushPromises();
    const list = YouTubeSubtitleList.mock.results[0].value;
    expect(list.updateAsrState).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, available: true })
    );
    list.asrActions.start();
    expect(list.selectAsrTab).toHaveBeenCalledTimes(1);
    expect(list.updateAsrState).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: true })
    );
    list.asrActions.stop();
    expect(list.updateAsrState).toHaveBeenLastCalledWith(
      expect.objectContaining({ active: false })
    );
    expect(list.destroy).not.toHaveBeenCalled();
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(1);
    expect(list.setBilingualSubtitles).toHaveBeenCalledWith([], 0);
    YouTubeSubtitleList.mock.calls[0][2].onClose();
    document
      .querySelector("#movie_player")
      .append(document.createElement("span"));
    await flushPromises();
    expect(YouTubeSubtitleList).toHaveBeenCalledTimes(1);
  });
  test("the ASR menu entry is exposed even when no ASR service is configured", async () => {
    create();
    await act(async () => flushPromises());
    expect(props().asr).toMatchObject({ available: false, active: false });
    expect(props().asrActions).toBeNull();
    expect(mockAsrControllers).toHaveLength(0);
  });

  test("human captions retain priority and unknown metadata is not treated as no captions", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr" });
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAsrControllers[0].start).not.toHaveBeenCalled();
    provider.destroy();
    mockAcquire.mockClear();
    mockTrack.kind = "asr";
    mockSnapshotReady = false;
    create({ asrApiSlug: "asr" });
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAsrControllers[1].start).not.toHaveBeenCalled();
  });

  test("manual ASR stop disables automatic ASR until the video changes", async () => {
    create({ asrApiSlug: "asr" });
    await act(async () => flushPromises());
    props().asrActions.stop();
    await act(async () => flushPromises());
    expect(mockAsrControllers[0].active).toBe(false);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("yt-navigate-start"));
    window.history.replaceState({}, "", "/watch?v=video-2");
    window.dispatchEvent(new Event("yt-navigate-finish"));
    await act(async () => flushPromises());
    expect(mockAsrControllers[0].start).toHaveBeenCalledTimes(2);
  });

  test("translation reopening remembers ASR intent until ASR is explicitly disabled", async () => {
    mockTrack = { languageCode: "en", vssId: ".en" };
    create({ asrApiSlug: "asr" });
    await act(async () => flushPromises());
    props().asrActions.start();
    const asr = mockAsrControllers[0];
    expect(asr.start).toHaveBeenCalledTimes(1);
    provider.updateSetting({ name: "autoTranslate", value: false });
    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());
    expect(asr.start).toHaveBeenCalledTimes(2);
    props().asrActions.stop();
    await act(async () => flushPromises());
    provider.updateSetting({ name: "autoTranslate", value: false });
    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());
    expect(asr.start).toHaveBeenCalledTimes(2);
    expect(asr.active).toBe(false);
  });

  test("native translation reopening fetches the current track and respects known cooldown", async () => {
    create();
    await act(async () => flushPromises());
    provider.updateSetting({ name: "autoTranslate", value: false });
    mockTrack = { languageCode: "ja", vssId: ".ja" };
    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
    expect(props().acquisition.track.languageCode).toBe("ja");
    mockAcquire.mockRejectedValueOnce(
      Object.assign(new Error(), {
        code: "RATE_LIMITED",
        cooldownUntil: Date.now() + 60000,
      })
    );
    await props().retryAcquisition();
    provider.updateSetting({ name: "autoTranslate", value: false });
    provider.updateSetting({ name: "autoTranslate", value: true });
    const cc = document.querySelector(".ytp-subtitles-button");
    cc.dispatchEvent(new Event("pointerdown"));
    cc.setAttribute("aria-pressed", "false");
    await act(async () => flushPromises());
    cc.setAttribute("aria-pressed", "true");
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(3);
    expect(props().acquisition.phase).toBe("cooldown");
  });

  test("does not fetch when disabled and uses the selected page service when enabled", async () => {
    const onSubtitlePositionChange = jest.fn();
    create({ autoTranslate: false, onSubtitlePositionChange });
    await act(async () => flushPromises());
    expect(mockAcquire).not.toHaveBeenCalled();
    provider.updateSetting({ name: "apiSlug", value: "api-b" });
    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(eventsToSubtitles.mock.calls[0][0].setting).toMatchObject({
      apiSlug: "api-b",
      forceSubtitleRetranslate: true,
    });
    expect(props().acquisition.phase).toBe("ready");
    expect(mockManagerSettings).toHaveLength(1);
    mockManagerSettings[0].onSubtitlePositionChange(0.3);
    expect(onSubtitlePositionChange).toHaveBeenCalledWith(0.3);
    const signal = eventsToSubtitles.mock.calls[0][0].signal;
    provider.updateSetting({ name: "apiSlug", value: "api-a" });
    await act(async () => flushPromises());
    expect(signal.aborted).toBe(true);
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    expect(mockManagerSettings.at(-1).apiSlug).toBe("api-a");
  });

  test("manual CC off cancels the session and is not reopened by DOM updates", async () => {
    create();
    await act(async () => flushPromises());
    const cc = document.querySelector(".ytp-subtitles-button");
    const click = jest.spyOn(cc, "click");
    cc.dispatchEvent(new Event("pointerdown"));
    cc.setAttribute("aria-pressed", "false");
    await act(async () => flushPromises());
    expect(props().acquisition.phase).toBe("cc_off");
    document.body.appendChild(document.createElement("span"));
    await act(async () => flushPromises());
    mockCapture({
      videoId: "video-1",
      url: "https://www.youtube.com/api/timedtext?v=video-1&lang=en&kind=asr",
      response: JSON.stringify({ events: mockResult("video-1").events }),
    });
    expect(click).not.toHaveBeenCalled();
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockManagers[0].destroy).toHaveBeenCalled();
    cc.setAttribute("aria-pressed", "true");
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
  });

  test("YouTube changing CC during track initialization is not treated as a user stop", async () => {
    create();
    await act(async () => flushPromises());
    document
      .querySelector(".ytp-subtitles-button")
      .setAttribute("aria-pressed", "false");
    await act(async () => flushPromises());
    expect(props().acquisition.phase).toBe("ready");
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });

  test("fetch retry failure preserves same-track subtitles and translation retry does not fetch", async () => {
    create();
    await act(async () => flushPromises());
    mockAcquire.mockRejectedValueOnce(
      Object.assign(new Error(), { code: "NETWORK" })
    );
    await props().retryAcquisition();
    expect(props().acquisition.code).toBe("NETWORK");
    expect(props().canDownload).toBe(true);
    expect(mockManagers[0].destroy).not.toHaveBeenCalled();
    const count = mockAcquire.mock.calls.length;
    props().retryTranslation();
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(count);
  });

  test("old-video results cannot reach the renderer after navigation", async () => {
    let resolveOld;
    mockAcquire.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    create();
    await act(async () => flushPromises());
    window.dispatchEvent(new Event("yt-navigate-start"));
    window.history.replaceState({}, "", "/watch?v=video-2");
    window.dispatchEvent(new Event("yt-navigate-finish"));
    resolveOld(mockResult("video-1"));
    await act(async () => flushPromises());
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    expect(eventsToSubtitles.mock.calls[0][0].videoId).toBe("video-2");
  });

  test("a usable captured source body recovers a timed out attempt without toggling CC", async () => {
    mockAcquire.mockRejectedValueOnce(
      Object.assign(new Error(), { code: "TIMEOUT" })
    );
    create();
    await act(async () => flushPromises());
    expect(props().acquisition.phase).toBe("error");
    const cc = document.querySelector(".ytp-subtitles-button");
    const click = jest.spyOn(cc, "click");
    const capture = {
      videoId: "video-1",
      url: "https://www.youtube.com/api/timedtext?v=video-1&lang=en&kind=asr",
      response: JSON.stringify({ events: mockResult("video-1").events }),
    };
    mockCapture({ ...capture, response: undefined });
    mockCapture({ ...capture, response: "" });
    mockCapture({ ...capture, url: capture.url + "&tlang=zh" });
    mockCapture({ ...capture, videoId: "old-video" });
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    mockCapture(capture);
    mockCapture(capture);
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
    expect(props().acquisition.phase).toBe("ready");
    expect(click).not.toHaveBeenCalled();
    mockCapture(capture);
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
  });

  test("an attempt that expired during an ad resumes once when content starts", async () => {
    mockIsAd = true;
    mockAcquire.mockRejectedValueOnce(
      Object.assign(new Error(), { code: "TIMEOUT" })
    );
    create();
    await act(async () => flushPromises());
    expect(props().acquisition.phase).toBe("error");
    mockIsAd = false;
    document.body.appendChild(document.createElement("span"));
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
    expect(props().acquisition.phase).toBe("ready");
    document.body.appendChild(document.createElement("span"));
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
  });

  test("content gets a fresh acquisition budget when an ad ends before the old round expires", async () => {
    mockIsAd = true;
    let resolveAd;
    mockAcquire.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAd = resolve;
        })
    );
    create();
    await act(async () => flushPromises());
    mockIsAd = false;
    document.body.appendChild(document.createElement("span"));
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(2);
    expect(props().acquisition.phase).toBe("ready");
    resolveAd(mockResult("video-1"));
    await act(async () => flushPromises());
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
  });

  test("closing translation restores native rendering and stops new acquisition", async () => {
    create();
    await act(async () => flushPromises());
    provider.updateSetting({ name: "autoTranslate", value: false });
    expect(props().acquisition.phase).toBe("off");
    expect(eventsToSubtitles.mock.calls[0][0].signal.aborted).toBe(true);
    document.body.appendChild(document.createElement("span"));
    await act(async () => flushPromises());
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });
});
