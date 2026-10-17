import { YouTubeSubtitleList } from "./YouTubeSubtitleList";
import { act } from "react";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { YouTubeCaptionProvider } from "./YouTubeCaptionProvider.js";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import { prepareTimedTextEvents } from "./youtubeSubtitleProcessing.js";
import { clearMsgHistory } from "../apis/history.js";

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
    YouTubeSubtitleList.mockImplementation((video, i18n, options) => ({
      asrActions: options.asrActions,
      initialize: jest.fn(),
      updateAsrState: jest.fn(),
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
    expect(eventsToSubtitles).toHaveBeenCalledTimes(2);
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
