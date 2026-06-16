let mockLatestPlayerUi;
let mockFlatEvents;
let mockWindowListeners;

jest.mock("../apis/index.js", () => ({
  apiSubtitle: jest.fn(),
  apiSummarizeContext: jest.fn(),
}));

jest.mock("../config", () => ({
  MSG_XHR_DATA_YOUTUBE: "xhr_data_youtube",
  API_SPE_TYPES: {
    ai: new Set(["OpenAI"]),
  },
  newI18n: () => (key) => key,
}));

jest.mock("../libs/docInfo.js", () => ({
  getDocInfo: jest.fn(() => ({
    title: "Fallback title",
    description: "Fallback description",
    summary: "Fallback summary",
  })),
}));

jest.mock("../libs/log.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock("../libs/utils.js", () => ({
  downloadBlobFile: jest.fn(),
}));

jest.mock("./BilingualSubtitleManager.js", () => ({
  BilingualSubtitleManager: jest.fn().mockImplementation(({ setting }) => ({
    setting,
    start: jest.fn(),
    destroy: jest.fn(),
    updateSetting: jest.fn(),
    appendSubtitles: jest.fn(),
    repairChunkTranslations: jest.fn(),
    setIsAdPlaying: jest.fn(),
  })),
}));

jest.mock("./YouTubeSubtitleList.js", () => ({
  YouTubeSubtitleList: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    setBilingualSubtitles: jest.fn(),
    updateSingleSubtitle: jest.fn(),
    turnOnAutoSub: jest.fn(),
    destroy: jest.fn(),
  })),
}));

jest.mock("./vtt.js", () => ({
  buildBilingualVtt: jest.fn(),
}));

jest.mock("./modes.js", () => ({
  isSubtitleModeEnabled: jest.fn(() => false),
}));

jest.mock("../apis/history.js", () => ({
  clearMsgHistory: jest.fn(),
}));

jest.mock("./youtubeCaptionTracks.js", () => ({
  buildTrackKey: jest.fn(() => "video-1|en|||"),
  findCaptionTrack: jest.fn(() => ({
    languageCode: "en",
    baseUrl: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
  })),
  getCaptionTracks: jest.fn(() =>
    Promise.resolve({
      captionTracks: [
        {
          languageCode: "en",
          baseUrl: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
        },
      ],
      fullDescription: "Full description",
    })
  ),
  getSubtitleEvents: jest.fn(() =>
    Promise.resolve([{ segs: [{ utf8: "hello" }], tStartMs: 0, dDurationMs: 1000 }])
  ),
  isSameLang: jest.fn(() => false),
}));

jest.mock("./youtubeAiSegmentation.js", () => ({
  eventsToSubtitles: jest.fn(() =>
    Promise.resolve([[{ text: "hello", start: 0, end: 1000, translation: "你好" }], 100])
  ),
}));

jest.mock("./youtubeSubtitleProcessing.js", () => ({
  builtinSegment: jest.fn(),
  formatSubtitles: jest.fn(),
  genFlatEvents: jest.fn(() => mockFlatEvents),
  getFromLang: jest.fn(() => "en"),
  normalizeTimedTextEvents: jest.fn((events) => events),
}));

jest.mock("./youtubePlayerUi.js", () => ({
  CONTROLS_SELECTOR: ".ytp-right-controls",
  VIDEO_SELECTOR: "#container video",
  YT_AD_SELECTOR: ".video-ads",
  YT_SUBTITLE_BUTTON_SELECTOR: "button.ytp-subtitles-button",
  waitForElement: jest.fn(),
  YouTubePlayerUi: jest.fn().mockImplementation((deps) => {
    mockLatestPlayerUi = {
      ...deps,
      showNotification: jest.fn(),
      updateMenuProps: jest.fn(),
      injectToggleButton: jest.fn(),
      hideYtCaption: jest.fn(),
      showYtCaption: jest.fn(),
    };
    return mockLatestPlayerUi;
  }),
  __getLatestPlayerUi: () => mockLatestPlayerUi,
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const createSetting = (overrides = {}) => ({
  apiSlug: "Microsoft",
  toLang: "zh-CN",
  aiContextSlug: "context-api",
  transApis: [{ apiSlug: "context-api", apiType: "OpenAI" }],
  showOrigin: false,
  showList: false,
  enhanceMode: "dual",
  ...overrides,
});

const dispatchTimedTextMessage = () => {
  mockWindowListeners.message({
    data: {
      type: "xhr_data_youtube",
      url: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
      response: "{}",
    },
  });
};

describe("YouTubeCaptionProvider AI context enrichment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestPlayerUi = undefined;
    mockFlatEvents = Array.from({ length: 30 }, (_, index) => ({
      text: `transcript-word-${index}`,
      start: index * 1000,
      end: index * 1000 + 500,
    }));
    require("./youtubePlayerUi.js").YouTubePlayerUi.mockImplementation((deps) => {
      mockLatestPlayerUi = {
        ...deps,
        showNotification: jest.fn(),
        updateMenuProps: jest.fn(),
        injectToggleButton: jest.fn(),
        hideYtCaption: jest.fn(),
        showYtCaption: jest.fn(),
      };
      return mockLatestPlayerUi;
    });
    require("./youtubePlayerUi.js").waitForElement.mockImplementation(() => {});
    require("./youtubeCaptionTracks.js").buildTrackKey.mockReturnValue(
      "video-1|en|||"
    );
    require("./youtubeCaptionTracks.js").findCaptionTrack.mockReturnValue({
      languageCode: "en",
      baseUrl: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
    });
    require("./youtubeCaptionTracks.js").getCaptionTracks.mockResolvedValue({
      captionTracks: [
        {
          languageCode: "en",
          baseUrl: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
        },
      ],
      fullDescription: "Full description",
    });
    require("./youtubeCaptionTracks.js").getSubtitleEvents.mockResolvedValue([
      { segs: [{ utf8: "hello" }], tStartMs: 0, dDurationMs: 1000 },
    ]);
    require("./youtubeCaptionTracks.js").isSameLang.mockReturnValue(false);
    require("./youtubeAiSegmentation.js").eventsToSubtitles.mockResolvedValue([
      [{ text: "hello", start: 0, end: 1000, translation: "你好" }],
      100,
    ]);
    require("./youtubeSubtitleProcessing.js").genFlatEvents.mockImplementation(
      () => mockFlatEvents
    );
    require("./youtubeSubtitleProcessing.js").getFromLang.mockReturnValue("en");
    require(
      "./youtubeSubtitleProcessing.js"
    ).normalizeTimedTextEvents.mockImplementation((events) => events);
    require("./BilingualSubtitleManager.js").BilingualSubtitleManager.mockImplementation(
      ({ setting }) => ({
        setting,
        start: jest.fn(),
        destroy: jest.fn(),
        updateSetting: jest.fn(),
        appendSubtitles: jest.fn(),
        repairChunkTranslations: jest.fn(),
        setIsAdPlaying: jest.fn(),
      })
    );
    require("./YouTubeSubtitleList.js").YouTubeSubtitleList.mockImplementation(
      () => ({
        initialize: jest.fn(),
        setBilingualSubtitles: jest.fn(),
        updateSingleSubtitle: jest.fn(),
        turnOnAutoSub: jest.fn(),
        destroy: jest.fn(),
      })
    );
    require("../libs/docInfo.js").getDocInfo.mockReturnValue({
      title: "Fallback title",
      description: "Fallback description",
      summary: "Fallback summary",
    });
    mockWindowListeners = {};
    jest.spyOn(window, "addEventListener").mockImplementation((type, listener) => {
      mockWindowListeners[type] = listener;
    });
    window.history.pushState({}, "", "/watch?v=video-1");
  });

  afterEach(() => {
    window.addEventListener.mockRestore();
  });

  test("starts subtitle processing before AI summary resolves", async () => {
    const { apiSummarizeContext } = require("../apis/index.js");
    const { eventsToSubtitles } = require("./youtubeAiSegmentation.js");
    const { YouTubeCaptionProvider } = require("./YouTubeCaptionProvider.js");
    let resolveSummary;
    apiSummarizeContext.mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      })
    );

    const provider = new YouTubeCaptionProvider(createSetting());
    provider.initialize();
    dispatchTimedTextMessage();

    await flushPromises();

    expect(apiSummarizeContext).toHaveBeenCalled();
    expect(eventsToSubtitles).toHaveBeenCalled();
    expect(eventsToSubtitles.mock.calls[0][0].docInfo.summary).toBe(
      "Fallback summary"
    );

    resolveSummary("AI summary");
  });

  test("updates the same docInfo object when background summary succeeds", async () => {
    const { apiSummarizeContext } = require("../apis/index.js");
    const { eventsToSubtitles } = require("./youtubeAiSegmentation.js");
    const { YouTubeCaptionProvider } = require("./YouTubeCaptionProvider.js");
    let resolveSummary;
    apiSummarizeContext.mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      })
    );

    const provider = new YouTubeCaptionProvider(createSetting());
    provider.initialize();
    dispatchTimedTextMessage();
    await flushPromises();

    const docInfo = eventsToSubtitles.mock.calls[0][0].docInfo;
    expect(docInfo.summary).toBe("Fallback summary");

    resolveSummary("AI summary");
    await flushPromises();

    expect(docInfo.summary).toBe("AI summary");
  });

  test("does not apply stale background summary after video changes", async () => {
    const { apiSummarizeContext } = require("../apis/index.js");
    const { eventsToSubtitles } = require("./youtubeAiSegmentation.js");
    const { YouTubeCaptionProvider } = require("./YouTubeCaptionProvider.js");
    let resolveSummary;
    apiSummarizeContext.mockReturnValue(
      new Promise((resolve) => {
        resolveSummary = resolve;
      })
    );

    const provider = new YouTubeCaptionProvider(createSetting());
    provider.initialize();
    dispatchTimedTextMessage();
    await flushPromises();

    const docInfo = eventsToSubtitles.mock.calls[0][0].docInfo;
    window.history.pushState({}, "", "/watch?v=video-2");
    mockWindowListeners["yt-navigate-finish"](new Event("yt-navigate-finish"));

    resolveSummary("Stale AI summary");
    await flushPromises();

    expect(docInfo.summary).toBe("Fallback summary");
  });

  test("reprocesses immediately when user changes context setting", async () => {
    const { apiSummarizeContext } = require("../apis/index.js");
    const { eventsToSubtitles } = require("./youtubeAiSegmentation.js");
    const { __getLatestPlayerUi } = require("./youtubePlayerUi.js");
    const { YouTubeCaptionProvider } = require("./YouTubeCaptionProvider.js");
    let resolveSummary;
    apiSummarizeContext.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve;
        })
    );

    const provider = new YouTubeCaptionProvider(
      createSetting({ aiContextSlug: "-" })
    );
    provider.initialize();
    dispatchTimedTextMessage();
    await flushPromises();
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);

    eventsToSubtitles.mockClear();
    __getLatestPlayerUi().getMenuProps().updateSetting({
      name: "aiContextSlug",
      value: "context-api",
    });
    await flushPromises();

    expect(apiSummarizeContext).toHaveBeenCalled();
    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    const docInfo = eventsToSubtitles.mock.calls[0][0].docInfo;
    expect(docInfo.summary).toBe("Fallback summary");

    resolveSummary("AI summary");
    await flushPromises();

    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    expect(docInfo.summary).toBe("AI summary");
  });
});
