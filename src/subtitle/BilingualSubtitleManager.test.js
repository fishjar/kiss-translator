import { BilingualSubtitleManager } from "./BilingualSubtitleManager";
import { apiTranslate } from "../apis/index.js";

jest.mock("../apis/index.js", () => ({
  apiTranslate: jest.fn(),
  apiMicrosoftDict: jest.fn(),
}));

jest.mock("../libs/log.js", () => ({
  LogLevel: {
    INFO: { value: "info" },
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

/**
 * 创建一个可由测试主动 resolve/reject 的 Promise。
 *
 * @returns {{promise: Promise<unknown>, resolve: Function, reject: Function}} 可控 Promise。
 */
function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * 构造 YouTube 播放器附近的最小 DOM 结构。
 *
 * @returns {HTMLVideoElement} 测试用 video 节点。
 */
function createVideoElement() {
  document.body.innerHTML = "";
  const outer = document.createElement("div");
  outer.className = "html5-video-player ytp-autohide";
  const inner = document.createElement("div");
  const video = document.createElement("video");

  Object.defineProperty(video, "currentTime", {
    value: 0,
    writable: true,
  });

  inner.appendChild(video);
  outer.appendChild(inner);
  document.body.appendChild(outer);
  return video;
}

const subtitle = {
  start: 0,
  end: 1000,
  text: "hello world",
  translation: "",
};

const setting = {
  fromLang: "en",
  toLang: "zh-CN",
  apiSetting: {
    apiSlug: "openai",
    apiType: "OpenAI",
    useStream: true,
  },
  docInfo: {},
  preTrans: 90,
  throttleTrans: 0,
  windowStyle: "",
  originStyle: "",
  translationStyle: "",
  isBilingual: true,
  blurTranslation: false,
  hoverLookupMode: "off",
  enhanceMode: "off",
};

describe("BilingualSubtitleManager", () => {
  beforeEach(() => {
    apiTranslate.mockReset();
  });

  test("updates current subtitle and list callback with streaming translation chunk", async () => {
    const deferred = createDeferred();
    apiTranslate.mockImplementation(({ onStreamChunk }) => {
      // 单句翻译流式 chunk 到达时，应立即刷新当前字幕和侧边栏更新事件。
      onStreamChunk({ text: "部分译文", isComplete: false });
      return deferred.promise;
    });

    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle }],
      setting,
    });
    manager.onSubtitleUpdate = jest.fn();

    manager.start();
    await Promise.resolve();

    expect(document.querySelector(".kiss-caption-window").textContent).toContain(
      "部分译文"
    );
    expect(manager.onSubtitleUpdate).toHaveBeenCalledWith({
      start: 0,
      end: 1000,
      text: "hello world",
      translation: "部分译文",
    });

    deferred.resolve({ trText: "最终译文" });
    await deferred.promise;
    await Promise.resolve();

    expect(document.querySelector(".kiss-caption-window").textContent).toContain(
      "最终译文"
    );

    manager.destroy();
  });
});
