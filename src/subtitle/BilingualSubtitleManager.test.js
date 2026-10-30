import { getWordsWithDefault } from "../libs/storage.js";
import { BilingualSubtitleManager } from "./BilingualSubtitleManager";
import { apiTranslate, apiMicrosoftDict } from "../apis/index.js";

jest.mock("../apis/index.js", () => ({
  apiTranslate: jest.fn(),
  apiMicrosoftDict: jest.fn(),
}));

jest.mock("../libs/storage.js", () => ({
  getWordsWithDefault: jest.fn().mockResolvedValue({}),
  saveEdit: jest.fn(async (_key, update) => ({
    value: update({}),
    changed: true,
  })),
}));

jest.mock("../libs/log.js", () =>
  jest.requireActual("../testUtils/scopedLogMock").withScopedLogMock(
    (() => ({
      LogLevel: {
        INFO: { value: "info" },
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
      },
    }))()
  )
);

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
function createVideoElement({ playerHeight = 400 } = {}) {
  document.body.innerHTML = "";
  const outer = document.createElement("div");
  outer.className = "html5-video-player ytp-autohide";
  const inner = document.createElement("div");
  const video = document.createElement("video");
  const controlBar = document.createElement("div");
  controlBar.className = "ytp-left-controls";
  controlBar.style.height = "40px";

  Object.defineProperty(video, "currentTime", {
    value: 0,
    writable: true,
  });
  Object.defineProperty(outer, "clientHeight", {
    value: playerHeight,
    configurable: true,
  });

  inner.appendChild(video);
  outer.appendChild(inner);
  outer.appendChild(controlBar);
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

function getCaptionLines() {
  return Array.from(document.querySelectorAll(".kiss-caption-window p")).map(
    (node) => node.textContent
  );
}

function getCaptionBottom() {
  return parseFloat(document.querySelector(".kiss-caption-paper").style.bottom);
}

function setControlBarVisible(videoEl, isVisible) {
  const player = videoEl.closest(".html5-video-player");
  player.classList.toggle("ytp-autohide", !isVisible);
}

async function waitForMutationObserver() {
  await Promise.resolve();
}

describe("BilingualSubtitleManager", () => {
  test("ASR-managed captions render originals and updates without invoking page translation", async () => {
    apiTranslate.mockClear();
    const videoEl = createVideoElement();
    const captions = [{ ...subtitle, translation: "" }];
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: captions,
      setting: { ...setting, managedTranslations: true },
    });
    manager.start();
    videoEl.dispatchEvent(new Event("timeupdate"));
    await Promise.resolve();
    expect(apiTranslate).not.toHaveBeenCalled();
    captions[0].translation = "识别后的译文";
    manager.appendSubtitles(captions);
    expect(getCaptionLines()).toContain("识别后的译文");
    manager.destroy();
  });
  beforeEach(() => {
    apiTranslate.mockReset();
  });

  test("renders original subtitle before translation by default", () => {
    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting,
    });

    manager.start();

    expect(getCaptionLines()).toEqual(["hello world", "你好世界"]);
    manager.destroy();
  });

  test("renders hover lookup word spans when enabled", () => {
    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: { ...setting, hoverLookupMode: "on" },
    });

    manager.start();

    expect(
      Array.from(document.querySelectorAll(".kiss-subtitle-word")).map(
        (node) => node.textContent
      )
    ).toEqual(["hello", "world"]);
    manager.destroy();
  });

  test("renders translation before original when display order is translation first", () => {
    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: { ...setting, displayOrder: "translation-first" },
    });

    manager.start();

    expect(getCaptionLines()).toEqual(["你好世界", "hello world"]);
    manager.destroy();
  });

  test("renders only translation when bilingual display is disabled", () => {
    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: {
        ...setting,
        isBilingual: false,
        displayOrder: "translation-first",
      },
    });

    manager.start();

    expect(getCaptionLines()).toEqual(["你好世界"]);
    manager.destroy();
  });

  test.each([
    [undefined, "\\(\\dot{x}_1\\) 是速度"],
    [false, "\\(\\dot{x}_1\\) 是速度"],
    [true, "ẋ₁ 是速度"],
  ])("renders LaTeX with parseLatex %p as %p", async (parseLatex, expected) => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValue(deferred.promise);

    const videoEl = createVideoElement();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle }],
      setting: parseLatex === undefined ? setting : { ...setting, parseLatex },
    });
    manager.onSubtitleUpdate = jest.fn();

    manager.start();
    await Promise.resolve();

    deferred.resolve({ trText: "\\(\\dot{x}_1\\) 是速度" });
    await deferred.promise;
    await Promise.resolve();

    expect(manager.onSubtitleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ translation: expected })
    );

    manager.destroy();
  });

  test.each(["success", "failure", "cancel"])(
    "only a successful final response publishes a persistable translation: %s",
    async (outcome) => {
      const deferred = createDeferred();
      const onTranslationComplete = jest.fn();
      apiTranslate.mockImplementation(({ onStreamChunk }) => {
        onStreamChunk({ text: "unfinished" });
        return deferred.promise;
      });
      const manager = new BilingualSubtitleManager({
        videoEl: createVideoElement(),
        formattedSubtitles: [{ ...subtitle }],
        setting: { ...setting, onTranslationComplete },
      });
      manager.start();
      await Promise.resolve();
      expect(onTranslationComplete).not.toHaveBeenCalled();
      if (outcome === "cancel") manager.destroy();
      if (outcome === "failure") deferred.reject(new Error("failed"));
      else deferred.resolve({ trText: "final result" });
      await deferred.promise.catch(() => {});
      await Promise.resolve();
      if (outcome === "success")
        expect(onTranslationComplete).toHaveBeenCalledWith({
          ...subtitle,
          translation: "final result",
        });
      else expect(onTranslationComplete).not.toHaveBeenCalled();
      manager.destroy();
    }
  );

  test("replaced source cues discard late stream and final responses", async () => {
    const deferred = createDeferred();
    let stream;
    apiTranslate.mockImplementation(({ onStreamChunk }) => {
      stream = onStreamChunk;
      return deferred.promise;
    });
    const onTranslationComplete = jest.fn();
    const cues = [{ ...subtitle }];
    const manager = new BilingualSubtitleManager({
      videoEl: createVideoElement(),
      formattedSubtitles: cues,
      setting: { ...setting, onTranslationComplete },
    });
    manager.onSubtitleUpdate = jest.fn();
    manager.start();
    cues.splice(0, 1, {
      ...subtitle,
      text: "different source",
      translation: "new translation",
    });
    stream({ text: "stale stream" });
    deferred.resolve({ trText: "stale final" });
    await deferred.promise;
    await Promise.resolve();
    expect(manager.onSubtitleUpdate).not.toHaveBeenCalled();
    expect(onTranslationComplete).not.toHaveBeenCalled();
    expect(cues[0].translation).toBe("new translation");
    manager.destroy();
  });

  test("missing translations wait for the runtime context before making a request", async () => {
    const context = createDeferred();
    const beforeTranslate = jest.fn(() => context.promise);
    apiTranslate.mockResolvedValue({ trText: "final result" });
    const manager = new BilingualSubtitleManager({
      videoEl: createVideoElement(),
      formattedSubtitles: [{ ...subtitle }],
      setting: { ...setting, beforeTranslate },
    });
    manager.start();
    expect(beforeTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate).not.toHaveBeenCalled();
    context.resolve();
    await context.promise;
    await Promise.resolve();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    manager.destroy();
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

    expect(
      document.querySelector(".kiss-caption-window").textContent
    ).toContain("部分译文");
    expect(manager.onSubtitleUpdate).toHaveBeenCalledWith({
      start: 0,
      end: 1000,
      text: "hello world",
      translation: "部分译文",
    });

    deferred.resolve({ trText: "最终译文" });
    await deferred.promise;
    await Promise.resolve();

    expect(
      document.querySelector(".kiss-caption-window").textContent
    ).toContain("最终译文");

    manager.destroy();
  });

  test("selected subtitle failure never invokes the leftover fallback service", async () => {
    const primary = { apiSlug: "primary", apiType: "Microsoft" };
    apiTranslate.mockRejectedValue(new Error("selected failed"));
    const failedSubtitle = { ...subtitle, translation: "[Translation failed]" };
    const manager = new BilingualSubtitleManager({
      videoEl: createVideoElement(),
      formattedSubtitles: [failedSubtitle],
      setting: {
        ...setting,
        apiSlug: "primary",
        apiSlugs: ["backup"],
        apiSetting: primary,
        transApis: [primary, { ...primary, apiSlug: "backup" }],
      },
    });
    manager.repairChunkTranslations([failedSubtitle]);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate.mock.calls[0][0].apiSetting.apiSlug).toBe("primary");
    manager.destroy();
  });

  test("repairs failed chunk translations immediately", async () => {
    const deferred = createDeferred();
    apiTranslate.mockReturnValue(deferred.promise);

    const videoEl = createVideoElement();
    const failedSubtitle = {
      ...subtitle,
      translation: "[Translation failed]",
    };
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [failedSubtitle],
      setting,
    });

    manager.repairChunkTranslations([failedSubtitle]);

    expect(apiTranslate).toHaveBeenCalledTimes(1);
    expect(apiTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "hello world",
        scene: expect.objectContaining({ fromLang: "en", toLang: "zh-CN" }),
        fromLang: "en",
        toLang: "zh-CN",
        apiSetting: expect.objectContaining(setting.apiSetting),
      })
    );

    deferred.resolve({ trText: "修复译文" });
    await deferred.promise;
    manager.destroy();
  });

  test("does not repair untranslated chunk subtitles immediately", () => {
    const videoEl = createVideoElement();
    const untranslatedSubtitle = {
      ...subtitle,
      translation: "",
    };
    const missingTranslationSubtitle = {
      start: 1000,
      end: 2000,
      text: "missing translation",
    };
    const draftSubtitle = {
      ...subtitle,
      start: 2000,
      end: 3000,
      translation: "draft translation",
      _isDraftTranslation: true,
    };
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [
        untranslatedSubtitle,
        missingTranslationSubtitle,
        draftSubtitle,
      ],
      setting,
    });

    manager.repairChunkTranslations([
      untranslatedSubtitle,
      missingTranslationSubtitle,
      draftSubtitle,
    ]);

    expect(apiTranslate).not.toHaveBeenCalled();
    manager.destroy();
  });

  test("streams repaired chunk translations to caption and list callback", async () => {
    const deferred = createDeferred();
    apiTranslate.mockImplementation(({ onStreamChunk }) => {
      onStreamChunk({ text: "补翻中", isComplete: false });
      return deferred.promise;
    });

    const videoEl = createVideoElement();
    const failedSubtitle = {
      ...subtitle,
      translation: "[Translation failed]",
    };
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [failedSubtitle],
      setting,
    });
    manager.onSubtitleUpdate = jest.fn();

    manager.start();
    manager.repairChunkTranslations([failedSubtitle]);
    await Promise.resolve();

    expect(
      document.querySelector(".kiss-caption-window").textContent
    ).toContain("补翻中");
    expect(manager.onSubtitleUpdate).toHaveBeenCalledWith({
      start: 0,
      end: 1000,
      text: "hello world",
      translation: "补翻中",
    });

    deferred.resolve({ trText: "补翻完成" });
    await deferred.promise;
    await Promise.resolve();

    expect(
      document.querySelector(".kiss-caption-window").textContent
    ).toContain("补翻完成");

    manager.destroy();
  });

  test("skips chunk subtitles that are already translating", () => {
    const videoEl = createVideoElement();
    const translatingSubtitle = {
      ...subtitle,
      translation: "[Translation failed]",
      isTranslating: true,
    };
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [translatingSubtitle],
      setting,
    });

    manager.repairChunkTranslations([translatingSubtitle]);

    expect(apiTranslate).not.toHaveBeenCalled();
    manager.destroy();
  });

  test("reports playback lookahead window for lazy AI segmentation", () => {
    const videoEl = createVideoElement();
    const onSubtitleTimeWindow = jest.fn();
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "浣犲ソ涓栫晫" }],
      setting: {
        ...setting,
        preTrans: 45,
        onSubtitleTimeWindow,
      },
    });

    manager.start();
    expect(onSubtitleTimeWindow).toHaveBeenCalledWith({
      currentTimeMs: 0,
      preTrans: 45,
    });

    videoEl.currentTime = 12;
    manager.onTimeUpdate();

    expect(onSubtitleTimeWindow).toHaveBeenLastCalledWith({
      currentTimeMs: 12000,
      preTrans: 45,
    });
    manager.destroy();
  });

  test("floats low captions above visible player controls and sinks back when hidden", async () => {
    const videoEl = createVideoElement({ playerHeight: 400 });
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting,
    });

    manager.start();
    expect(getCaptionBottom()).toBe(20);

    setControlBarVisible(videoEl, true);
    await waitForMutationObserver();
    expect(getCaptionBottom()).toBe(60);

    setControlBarVisible(videoEl, false);
    await waitForMutationObserver();
    expect(getCaptionBottom()).toBe(20);

    manager.destroy();
  });

  test("keeps high captions fixed when player controls toggle", async () => {
    const videoEl = createVideoElement({ playerHeight: 1600 });
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting,
    });

    manager.start();
    expect(getCaptionBottom()).toBe(80);

    setControlBarVisible(videoEl, true);
    await waitForMutationObserver();
    expect(getCaptionBottom()).toBe(80);

    setControlBarVisible(videoEl, false);
    await waitForMutationObserver();
    expect(getCaptionBottom()).toBe(80);

    manager.destroy();
  });

  test("restores a remembered relative position", () => {
    const videoEl = createVideoElement({ playerHeight: 400 });
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: {
        ...setting,
        rememberPosition: true,
        positionRatio: 0.3,
      },
    });

    manager.start();
    expect(getCaptionBottom()).toBe(120);

    manager.destroy();
  });

  test("falls back to the default position for an invalid saved ratio", () => {
    const videoEl = createVideoElement({ playerHeight: 400 });
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: {
        ...setting,
        rememberPosition: true,
        positionRatio: 2,
      },
    });

    manager.start();
    expect(getCaptionBottom()).toBe(20);

    manager.destroy();
  });

  test("reapplies a remembered ratio when the player is resized", () => {
    const originalResizeObserver = global.ResizeObserver;
    let resizeCallback;
    const disconnect = jest.fn();
    global.ResizeObserver = class {
      constructor(callback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    };

    const videoEl = createVideoElement({ playerHeight: 400 });
    const player = videoEl.closest(".html5-video-player");
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: {
        ...setting,
        rememberPosition: true,
        positionRatio: 0.25,
      },
    });

    try {
      manager.start();
      expect(getCaptionBottom()).toBe(100);

      Object.defineProperty(player, "clientHeight", {
        value: 800,
        configurable: true,
      });
      resizeCallback();
      expect(getCaptionBottom()).toBe(200);

      manager.destroy();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      global.ResizeObserver = originalResizeObserver;
    }
  });

  test("does not treat a click without movement as a drag position update", () => {
    const videoEl = createVideoElement({ playerHeight: 400 });
    setControlBarVisible(videoEl, true);
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting,
    });

    manager.start();
    const handle = document.querySelector(".kiss-caption-window");

    expect(getCaptionBottom()).toBe(60);

    handle.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientY: 100 })
    );
    document.dispatchEvent(new MouseEvent("mouseup", { clientY: 100 }));

    expect(getCaptionBottom()).toBe(60);

    manager.destroy();
  });

  test("treats dragged position as the hidden-controls bottom and floats after drag ends", async () => {
    const onSubtitlePositionChange = jest.fn();
    const videoEl = createVideoElement({ playerHeight: 400 });
    setControlBarVisible(videoEl, true);
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: { ...setting, onSubtitlePositionChange },
    });

    manager.start();
    const paper = document.querySelector(".kiss-caption-paper");
    const container = document.querySelector(".kiss-caption-container");
    const handle = document.querySelector(".kiss-caption-window");

    Object.defineProperty(container, "clientHeight", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(paper, "offsetHeight", {
      value: 40,
      configurable: true,
    });
    container.getBoundingClientRect = () => ({ bottom: 400 });
    paper.getBoundingClientRect = () => ({
      bottom: 400 - getCaptionBottom(),
    });

    expect(getCaptionBottom()).toBe(60);

    handle.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientY: 100 })
    );
    document.dispatchEvent(new MouseEvent("mousemove", { clientY: 130 }));

    expect(getCaptionBottom()).toBe(30);

    document.dispatchEvent(new MouseEvent("mouseup", { clientY: 130 }));

    expect(getCaptionBottom()).toBe(70);

    setControlBarVisible(videoEl, false);
    await waitForMutationObserver();
    expect(getCaptionBottom()).toBe(30);
    expect(onSubtitlePositionChange).not.toHaveBeenCalled();

    manager.destroy();
  });

  test("persists the dragged base ratio without the visible control offset", () => {
    const onSubtitlePositionChange = jest.fn();
    const videoEl = createVideoElement({ playerHeight: 400 });
    setControlBarVisible(videoEl, true);
    const manager = new BilingualSubtitleManager({
      videoEl,
      formattedSubtitles: [{ ...subtitle, translation: "你好世界" }],
      setting: {
        ...setting,
        rememberPosition: true,
        positionRatio: 0.05,
        onSubtitlePositionChange,
      },
    });

    manager.start();
    const paper = document.querySelector(".kiss-caption-paper");
    const container = document.querySelector(".kiss-caption-container");
    const handle = document.querySelector(".kiss-caption-window");

    Object.defineProperty(container, "clientHeight", {
      value: 400,
      configurable: true,
    });
    Object.defineProperty(paper, "offsetHeight", {
      value: 40,
      configurable: true,
    });
    container.getBoundingClientRect = () => ({ bottom: 400 });
    paper.getBoundingClientRect = () => ({
      bottom: 400 - getCaptionBottom(),
    });

    handle.dispatchEvent(
      new MouseEvent("mousedown", { button: 0, clientY: 100 })
    );
    document.dispatchEvent(new MouseEvent("mousemove", { clientY: 130 }));
    document.dispatchEvent(new MouseEvent("mouseup", { clientY: 130 }));

    expect(onSubtitlePositionChange).toHaveBeenCalledTimes(1);
    expect(onSubtitlePositionChange).toHaveBeenCalledWith(0.075);
    expect(getCaptionBottom()).toBe(70);

    manager.destroy();
  });
});

describe("lookup panel playback ownership", () => {
  let manager, video, caption, word, paused;
  const point = (node, type, relatedTarget = null) =>
    node.dispatchEvent(new MouseEvent(type, { relatedTarget }));
  const tick = async (ms) => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const setup = (initiallyPaused = false, closeDelay = 2) => {
    video = createVideoElement();
    paused = initiallyPaused;
    Object.defineProperty(video, "paused", {
      get: () => paused,
      configurable: true,
    });
    video.pause = jest.fn(() => {
      paused = true;
    });
    video.play = jest.fn(() => {
      paused = false;
      video.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    manager = new BilingualSubtitleManager({
      videoEl: video,
      formattedSubtitles: [{ ...subtitle, translation: "你好" }],
      setting: {
        ...setting,
        hoverLookupMode: "on",
        hoverLookupCloseDelay: closeDelay,
      },
    });
    manager.start();
    caption = document.querySelector(".kiss-caption-window");
    word = caption.querySelector(".kiss-subtitle-word");
  };
  const open = async () => {
    point(caption, "pointerenter");
    point(word, "pointerenter");
    await tick(300);
  };
  const leaveCaption = () => {
    point(word, "pointerleave");
    point(caption, "pointerleave");
  };
  beforeEach(() => {
    jest.useFakeTimers();
    getWordsWithDefault.mockResolvedValue({});
    apiMicrosoftDict.mockResolvedValue({ trs: [{ def: "definition" }] });
    apiTranslate.mockResolvedValue([]);
  });
  afterEach(() => {
    manager?.destroy();
    manager = null;
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test("keeps the hover pause through the delay and panel interaction, then resumes", async () => {
    setup();
    await open();
    expect(video.pause).toHaveBeenCalledTimes(1);
    leaveCaption();
    await tick(1000);
    expect(video.play).not.toHaveBeenCalled();
    const panel = document.querySelector(".kiss-word-tooltip");
    point(panel, "pointerenter");
    await tick(5000);
    expect(video.play).not.toHaveBeenCalled();
    point(panel, "pointerleave");
    expect(video.play).toHaveBeenCalledTimes(1);
  });
  test("restores playback when the word delay expires", async () => {
    setup(false, 5);
    await open();
    leaveCaption();
    await tick(4999);
    expect(video.play).not.toHaveBeenCalled();
    await tick(1);
    expect(video.play).toHaveBeenCalledTimes(1);
  });
  test("does not auto-play a video that was already manually paused", async () => {
    setup(true);
    await open();
    leaveCaption();
    await tick(2000);
    expect(video.play).not.toHaveBeenCalled();
  });
  test("returning from the panel to the caption does not briefly resume playback", async () => {
    setup();
    await open();
    leaveCaption();
    const panel = document.querySelector(".kiss-word-tooltip");
    point(panel, "pointerenter");
    point(panel, "pointerleave", word);
    point(caption, "pointerenter");
    point(word, "pointerenter");
    await tick(300);
    expect(video.play).not.toHaveBeenCalled();
    leaveCaption();
    await tick(2000);
    expect(video.play).toHaveBeenCalledTimes(1);
  });
  test("destroy while hover-paused clears dismissal without playing the old video", async () => {
    setup();
    await open();
    leaveCaption();
    manager.destroy();
    manager = null;
    await tick(10000);
    expect(video.play).not.toHaveBeenCalled();
    expect(document.querySelector(".kiss-word-tooltip")).toBeNull();
  });
  test("a manual play then pause clears ownership, and destroy cannot resume an old video", async () => {
    setup();
    await open();
    leaveCaption();
    await video.play();
    paused = true;
    video.play.mockClear();
    await tick(2000);
    expect(video.play).not.toHaveBeenCalled();
    point(caption, "pointerenter");
    point(word, "pointerenter");
    await tick(300);
    manager.destroy();
    manager = null;
    await tick(10000);
    expect(video.play).not.toHaveBeenCalled();
  });
});
