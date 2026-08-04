import { act } from "react";
import { apiSubtitle, apiSummarizeContext } from "../apis/index.js";
import { YouTubeCaptionProvider } from "./YouTubeCaptionProvider.js";
import { getCaptionTracks, getSubtitleEvents } from "./youtubeCaptionTracks.js";
import { eventsToSubtitles } from "./youtubeAiSegmentation.js";
import { prepareTimedTextEvents } from "./youtubeSubtitleProcessing.js";

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
  isSameLang: () => false,
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
    start = jest.fn();
    destroy = jest.fn();
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

  test("prepares source subtitles and waits for the menu before translating", async () => {
    const provider = new YouTubeCaptionProvider({
      autoTranslate: false,
      aiContextSlug: "-",
      apiSlug: "mock-api",
      showList: "off",
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
    expect(apiSubtitle).not.toHaveBeenCalled();
    expect(eventsToSubtitles).not.toHaveBeenCalled();

    provider.updateSetting({ name: "autoTranslate", value: true });
    await act(async () => flushPromises());

    expect(eventsToSubtitles).toHaveBeenCalledTimes(1);
  });
});
