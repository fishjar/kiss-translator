import { act } from "react";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { YouTubeCaptionProvider } from "./YouTubeCaptionProvider.js";
import { getCaptionTracks, getSubtitleEvents } from "./youtubeCaptionTracks.js";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import { prepareTimedTextEvents } from "./youtubeSubtitleProcessing.js";
import { clearMsgHistory } from "../apis/history.js";

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
  YT_SUBTITLE_BUTTON_SELECTOR: ".captions",
  waitForElement: jest.fn(),
  YouTubePlayerUi: class {
    injectToggleButton = jest.fn();
    removeToggleButton = jest.fn();
    updateMenuProps = jest.fn();
    showNotification = jest.fn();
    hideNotification = jest.fn();
    hideYtCaption = jest.fn();
    showYtCaption = jest.fn();
  },
}));

jest.mock("./youtubeCaptionTracks.js", () => ({
  buildTrackKey: () => "track-1",
  findCaptionTrack: (tracks) => tracks[0],
  getCaptionTracks: jest.fn(),
  getSubtitleEvents: jest.fn(),
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
  YouTubeSubtitleList: jest.fn(),
}));

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("YouTubeCaptionProvider manual translation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManagerSettings.length = 0;
    mockManagers.length = 0;
    window.history.replaceState({}, "", "/watch?v=video-1");
    document.body.innerHTML =
      '<video></video><button class="captions" aria-pressed="true"></button>';
    getCaptionTracks.mockResolvedValue({
      captionTracks: [{ baseUrl: "https://www.youtube.com/timedtext" }],
      fullDescription: "",
    });
    getSubtitleEvents.mockResolvedValue([{ text: "hello" }]);
    // 新准备接口一次返回规范化事件和展平事件，避免测试继续依赖已删除的两段处理。
    prepareTimedTextEvents.mockReturnValue({
      events: [{ text: "hello" }],
      flatEvents: [{ start: 0, end: 1000, text: "hello" }],
    });
    eventsToSubtitles.mockResolvedValue([
      [{ start: 0, end: 1000, text: "hello", translation: "你好" }],
      100,
      null,
    ]);
    apiSummarizeContext.mockResolvedValue("");
  });

  test("switches the current page translation service and reprocesses safely", async () => {
    const onSubtitlePositionChange = jest.fn();
    const apiA = {
      apiSlug: "api-a",
      apiName: "API A",
      apiType: "builtin",
    };
    const apiB = {
      apiSlug: "api-b",
      apiName: "API B",
      apiType: "builtin",
    };
    const disabledApi = {
      apiSlug: "api-disabled",
      apiName: "Disabled API",
      apiType: "builtin",
      isDisabled: true,
    };
    const segmentationApi = {
      apiSlug: "seg-api",
      apiName: "Segmentation API",
      apiType: "openai",
    };
    const provider = new YouTubeCaptionProvider({
      autoTranslate: false,
      aiContextSlug: "-",
      apiSlug: apiA.apiSlug,
      apiSetting: apiA,
      transApis: [apiA, apiB, disabledApi, segmentationApi],
      segSlug: segmentationApi.apiSlug,
      forceSubtitleRetranslate: false,
      toLang: "zh-CN",
      showList: "off",
      rememberPosition: true,
      positionRatio: 0.05,
      onSubtitlePositionChange,
    });
    provider.initialize();

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "xhr-youtube",
          url: "https://www.youtube.com/api/timedtext?v=video-1&lang=en",
          response: "{}",
        },
      })
    );
    await act(async () => flushPromises());

    expect(getSubtitleEvents).toHaveBeenCalledTimes(1);
    expect(prepareTimedTextEvents).toHaveBeenCalledTimes(1);
    expect(mockIsSameLang).toHaveBeenCalledWith("en", "zh-CN", true);
    expect(apiSubtitle).not.toHaveBeenCalled();
    expect(eventsToSubtitles).not.toHaveBeenCalled();

    provider.updateSetting({ name: "apiSlug", value: apiB.apiSlug });
    expect(eventsToSubtitles).not.toHaveBeenCalled();

    eventsToSubtitles.mockResolvedValueOnce([
      [{ start: 0, end: 1000, text: "hello", translation: "AI 译文" }],
      100,
      null,
    ]);
    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());

    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
    expect(eventsToSubtitles.mock.calls[0][0].setting).toMatchObject({
      apiSlug: apiB.apiSlug,
      apiSetting: apiB,
      forceSubtitleRetranslate: true,
    });
    expect(mockManagerSettings).toHaveLength(1);
    expect(mockManagerSettings[0].apiSetting).toBe(apiB);

    mockManagerSettings[0].onSubtitlePositionChange(0.3);
    expect(onSubtitlePositionChange).toHaveBeenCalledWith(0.3);

    const segmentationSignal = eventsToSubtitles.mock.calls[0][0].signal;
    provider.updateSetting({ name: "apiSlug", value: apiA.apiSlug });
    await act(async () => flushPromises());

    expect(segmentationSignal.aborted).toBe(true);
    expect(eventsToSubtitles).toHaveBeenCalledTimes(2);
    expect(eventsToSubtitles.mock.calls[1][0].setting).toMatchObject({
      apiSlug: apiA.apiSlug,
      apiSetting: apiA,
      forceSubtitleRetranslate: true,
    });
    expect(mockManagers[0].destroy).toHaveBeenCalledTimes(1);
    expect(mockManagerSettings).toHaveLength(2);
    expect(mockManagerSettings[1]).toMatchObject({
      apiSlug: apiA.apiSlug,
      apiSetting: apiA,
      forceSubtitleRetranslate: false,
    });
    expect(clearMsgHistory).toHaveBeenCalledWith(apiA.apiSlug);
    expect(clearMsgHistory).toHaveBeenCalledWith(apiB.apiSlug);

    provider.updateSetting({ name: "apiSlug", value: disabledApi.apiSlug });
    provider.updateSetting({ name: "apiSlug", value: "missing-api" });
    expect(eventsToSubtitles).toHaveBeenCalledTimes(2);
    expect(mockManagerSettings).toHaveLength(2);

    window.dispatchEvent(new Event("yt-navigate-finish"));
    window.history.replaceState({}, "", "/watch?v=video-2");
    provider.updateSetting({ name: "autoTranslate", value: true });
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "xhr-youtube",
          url: "https://www.youtube.com/api/timedtext?v=video-2&lang=en",
          response: "{}",
        },
      })
    );
    await act(async () => flushPromises());

    expect(eventsToSubtitles).toHaveBeenCalledTimes(3);
    expect(mockManagerSettings).toHaveLength(3);
    expect(mockManagerSettings[2]).toMatchObject({
      apiSlug: apiA.apiSlug,
      apiSetting: apiA,
      positionRatio: 0.3,
    });
    expect(eventsToSubtitles.mock.calls[2][0].setting).toMatchObject({
      apiSlug: apiA.apiSlug,
      forceSubtitleRetranslate: true,
    });
  });
});
