import {
  YouTubeSubtitleList,
  renderMarkdownToElement,
} from "./YouTubeSubtitleList";
import {
  apiMicrosoftDict,
  apiSummarizeVideo,
  getVideoSummarySignature,
} from "../apis/index.js";
import { getSettingWithDefault, saveEdit } from "../libs/storage.js";
import { openOptionsPage } from "../libs/navigation.js";
import { EVENT_FAVORITE_WORD_CHANGE } from "../config";

jest.mock("../libs/storage.js", () => ({
  getSettingWithDefault: jest.fn(() => Promise.resolve({ darkMode: "light" })),
  getWordsWithDefault: jest.fn(),
  saveEdit: jest.fn(),
}));

jest.mock("../apis/index.js", () => ({
  apiMicrosoftDict: jest.fn(),
  apiSummarizeVideo: jest.fn(),
  getVideoSummarySignature: jest.fn(
    async ({ videoId, apiSetting, to, transcript, prompt }) =>
      `${videoId}:${apiSetting?.apiSlug}:${to}:${prompt?.slug || "default"}:${transcript}`
  ),
}));

jest.mock("../libs/navigation.js", () => ({
  openOptionsPage: jest.fn(),
}));

function createVideoElement({ playerHeight = 360 } = {}) {
  document.body.innerHTML = '<div id="secondary-inner"></div>';
  let currentPlayerHeight = playerHeight;
  const player = document.createElement("div");
  player.className = "html5-video-player";
  player.getBoundingClientRect = () => ({ height: currentPlayerHeight });
  const video = document.createElement("video");

  Object.defineProperty(video, "paused", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(video, "currentTime", {
    value: 0,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, "play", {
    value: jest.fn(() => Promise.resolve()),
    configurable: true,
  });
  Object.defineProperty(video, "__setPlayerHeight", {
    value: (height) => {
      currentPlayerHeight = height;
    },
  });

  player.appendChild(video);
  document.body.appendChild(player);
  return video;
}

const subtitle = {
  start: 0,
  end: 1000,
  text: "hello world",
  translation: "你好世界",
};

let favoriteWords = {};

function renderVisibleSubtitleItems(manager) {
  manager.subtitleListEl.getClientRects = () => [{ width: 320, height: 300 }];
  Object.defineProperty(manager.subtitleScrollContainer, "clientHeight", {
    value: 300,
    configurable: true,
  });
  manager._renderVirtualSubtitles(true);
}

async function flushPromises() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

describe("YouTubeSubtitleList", () => {
  test("ASR controls stay mounted in Shorts, hide in fullscreen and return to the normal sidebar", () => {
    const video = createVideoElement(),
      list = new YouTubeSubtitleList(video, (key) => key, { asrActions: {} });
    window.history.replaceState({}, "", "/shorts/kSQknoHMFtk");
    list.initialize([subtitle]);
    expect(list.container.parentElement).toBe(document.body);
    expect(list.container.style.position).toBe("fixed");
    const tabHeader = list.container.querySelector(".kiss-youtube-tab-header");
    expect(tabHeader.style.overflowY).toBe("hidden");
    expect(
      document.getElementById("kiss-youtube-tab-header-styles")
    ).not.toBeNull();
    const player = video.closest(".html5-video-player");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: player,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(list.container.style.display).toBe("none");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    window.history.replaceState({}, "", "/watch?v=kSQknoHMFtk");
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(list.container.style.display).toBe("flex");
    expect(list.container.parentElement.id).toBe("secondary-inner");
    expect(list.container.style.position).toBe("");
    list.destroy();
  });
  test("Shorts panel width restores, drags, saves and clamps without replacing user preference", async () => {
    saveEdit.mockResolvedValue();
    getSettingWithDefault.mockResolvedValueOnce({
      subtitleSetting: { youtubeShortsSubtitlePanelWidth: 600 },
    });
    window.history.replaceState({}, "", "/shorts/kSQknoHMFtk");
    const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
      asrActions: {},
    });
    list.initialize([]);
    await flushPromises();
    expect(list.container.style.width).toBe("600px");
    const handle = list._shortsResizeHandle;
    handle.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
    );
    expect(list.container.style.width).toBe("616px");
    expect(
      saveEdit.mock.calls.at(-1)[1]({}).subtitleSetting
        .youtubeShortsSubtitlePanelWidth
    ).toBe(616);
    list.container.getBoundingClientRect = () => ({ width: 616 });
    handle.dispatchEvent(
      new MouseEvent("pointerdown", { button: 0, clientX: 500 })
    );
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 450 }));
    window.dispatchEvent(new MouseEvent("pointerup"));
    expect(list.container.style.width).toBe("666px");
    const oldWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 400,
    });
    window.dispatchEvent(new Event("resize"));
    expect(list.container.style.width).toBe("376px");
    expect(list._shortsPanelWidth).toBe(666);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: oldWidth,
    });
    list.destroy();
    window.history.replaceState({}, "", "/watch?v=kSQknoHMFtk");
  });

  test.each(["asr", "audio-chunk"])(
    "ASR %s download does not jump playback; full export has independent progress and cancel",
    async (timingSource) => {
      const video = createVideoElement(),
        exportSentence = jest.fn(async () => {}),
        exportFull = jest.fn(),
        cancelExport = jest.fn(),
        deleteAudio = jest.fn(),
        deleteCache = jest.fn();
      const list = new YouTubeSubtitleList(video, (key) => key, {
        asrActions: {
          exportSentence,
          exportFull,
          cancelExport,
          deleteAudio,
          deleteCache,
        },
      });
      const cue = { ...subtitle, timingSource };
      list.initialize([cue]);
      renderVisibleSubtitleItems(list);
      expect(
        list.subtitleScrollContainer.querySelector(
          '[aria-label^="youtube_asr_"]'
        )
      ).toBeNull();
      list.asrAudioButton.click();
      expect(exportFull).toHaveBeenCalledTimes(1);
      expect(list.asrClearAudioButton).toBeDefined();
      expect(list.asrClearSubtitlesButton).toBeDefined();
      expect(list.asrClearAudioButton.parentElement).toBe(
        list.asrPanel.toolbar
      );
      expect(list.asrClearSubtitlesButton.parentElement).toBe(
        list.asrPanel.toolbar
      );
      list.asrClearAudioButton.click();
      expect(deleteAudio).toHaveBeenCalledTimes(1);
      list.asrClearSubtitlesButton.click();
      expect(deleteCache).toHaveBeenCalledTimes(1);
      list.updateAsrState({
        phase: "recognizing",
        fullExport: "fetching",
        audio: { phase: "fetching", percent: 35, bytes: 1024 },
      });
      expect(list.asrAudioButton.disabled).toBe(true);
      expect(list.asrClearAudioButton.disabled).toBe(false);
      expect(list.asrAudioButton.textContent).toContain("35%");
      expect(list.asrStatus).toBeUndefined();
      expect(list.asrAudioButton.parentElement).toBe(list.asrPanel.toolbar);
      list.asrCancelButton.click();
      expect(cancelExport).toHaveBeenCalledTimes(1);

      // Clearing stays available during downloading so it can stop the session.
      list.updateAsrState({
        phase: "recognizing",
        fullExport: undefined,
        audio: { phase: "fetching", percent: 50, bytes: 2048 },
      });
      expect(list.asrClearAudioButton.disabled).toBe(false);

      // Once complete, clear button becomes enabled
      list.updateAsrState({
        phase: "recognizing",
        fullExport: undefined,
        audio: { phase: "complete", percent: 100, bytes: 4096 },
      });
      expect(list.asrClearAudioButton.disabled).toBe(false);
      list.destroy();
    }
  );
  beforeEach(() => {
    apiMicrosoftDict.mockReset();
    apiSummarizeVideo.mockReset();
    getVideoSummarySignature.mockReset();
    getVideoSummarySignature.mockImplementation(
      async ({ videoId, apiSetting, to, transcript, prompt } = {}) =>
        `${videoId}:${apiSetting?.apiSlug}:${to}:${prompt?.slug || "default"}:${transcript}`
    );
    const storage = require("../libs/storage.js");
    favoriteWords = {};
    storage.getWordsWithDefault.mockImplementation(() =>
      Promise.resolve(favoriteWords)
    );
    storage.saveEdit.mockImplementation(async (_key, update) => {
      const words = update(favoriteWords);
      const changed = words !== favoriteWords;
      favoriteWords = words;
      return { value: words, changed };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("renders panel controls with i18n text", async () => {
    const videoEl = createVideoElement();
    const i18n = jest.fn(
      (key) =>
        ({
          bilingual_subtitles: "Bilingual subtitles",
          vocabulary_book: "Vocabulary",
          download_subtitles_vtt: "Download subtitles (VTT)",
          download_raw_subtitle_events_json: "Download source data (JSON)",
          close: "Close panel",
        })[key] || ""
    );
    const manager = new YouTubeSubtitleList(videoEl, i18n);

    manager.initialize([subtitle], [], 75);

    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(
      expect.arrayContaining([
        "Bilingual subtitles [75%]",
        "Vocabulary",
        "Download subtitles (VTT)",
        "Download source data (JSON)",
      ])
    );
    expect(buttons.find((button) => button.textContent === "×").title).toBe(
      "Close panel"
    );

    await flushPromises();
    manager.destroy();
  });

  test("matches the subtitle panel height to the YouTube player", async () => {
    const videoEl = createVideoElement({ playerHeight: 420 });
    const manager = new YouTubeSubtitleList(videoEl);

    manager.initialize([subtitle], [], 100);

    const container = document.getElementById(
      "kiss-youtube-subtitle-list-container"
    );
    expect(container.style.height).toBe("420px");
    expect(container.style.maxHeight).toBe("420px");

    videoEl.__setPlayerHeight(360);
    window.dispatchEvent(new Event("resize"));

    expect(container.style.height).toBe("360px");
    expect(container.style.maxHeight).toBe("360px");

    await flushPromises();
    manager.destroy();
  });

  test("adds hover lookup spans to original text when enabled", async () => {
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl, () => "", {
      enableHoverLookup: true,
    });

    manager.initialize([subtitle], [], 100);
    renderVisibleSubtitleItems(manager);

    expect(
      Array.from(
        document.querySelectorAll(".kiss-youtube-original .kiss-subtitle-word")
      ).map((node) => node.textContent)
    ).toEqual(["hello", "world"]);

    await flushPromises();
    manager.destroy();
  });

  test("looks up hovered list words and records the subtitle start timestamp", async () => {
    jest.useFakeTimers();
    apiMicrosoftDict.mockResolvedValue({
      aus: [{ key: "美", phonetic: "/redi/" }],
      trs: [{ pos: "adj.", def: "准备好的" }],
      sentences: [{ eng: "ready to go", chs: "准备出发" }],
    });
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl, () => "", {
      enableHoverLookup: true,
    });
    const addWordHandler = jest.fn();
    document.addEventListener("kiss-add-word", addWordHandler);

    manager.initialize(
      [{ ...subtitle, start: 33000, text: "ready to go" }],
      [],
      100
    );
    renderVisibleSubtitleItems(manager);
    document
      .querySelector(".kiss-subtitle-word")
      .dispatchEvent(new Event("pointerenter"));
    jest.advanceTimersByTime(300);
    await apiMicrosoftDict.mock.results[0].value;
    await flushPromises();
    await Promise.resolve();

    expect(apiMicrosoftDict).toHaveBeenCalledWith("ready");
    expect(addWordHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          word: "ready",
          timestamp: 33000,
          definition: "adj. 准备好的",
        }),
      })
    );

    const storage = require("../libs/storage.js");
    const favoriteButton = document.querySelector(".kiss-favorite-word-button");
    expect(storage.saveEdit).not.toHaveBeenCalled();
    expect(favoriteButton.getAttribute("aria-pressed")).toBe("false");

    favoriteButton.click();
    await flushPromises();

    expect(favoriteWords).toEqual({
      ready: expect.objectContaining({
        phonetic: "/redi/",
        definition: "adj. 准备好的",
      }),
    });
    expect(favoriteWords.ready.timestamp).toBeUndefined();

    document.removeEventListener("kiss-add-word", addWordHandler);
    manager.destroy();
    jest.useRealTimers();
  });

  test("automatically favorites successful hovered word lookups when enabled", async () => {
    jest.useFakeTimers();
    apiMicrosoftDict.mockResolvedValue({
      aus: [{ key: "美", phonetic: "/redi/" }],
      trs: [{ pos: "adj.", def: "准备好的" }],
      sentences: [{ eng: "ready to go", chs: "准备出发" }],
    });
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl, () => "", {
      enableHoverLookup: true,
      autoFavWord: true,
    });

    manager.initialize(
      [{ ...subtitle, start: 33000, text: "ready to go" }],
      [],
      100
    );
    renderVisibleSubtitleItems(manager);
    document
      .querySelector(".kiss-subtitle-word")
      .dispatchEvent(new Event("pointerenter"));
    jest.advanceTimersByTime(300);
    await apiMicrosoftDict.mock.results[0].value;
    await flushPromises();

    expect(favoriteWords).toEqual({
      ready: expect.objectContaining({
        phonetic: "/redi/",
        definition: "adj. 准备好的",
        examples: [{ eng: "ready to go", chs: "准备出发" }],
      }),
    });
    expect(favoriteWords.ready.timestamp).toBeUndefined();

    manager.destroy();
    jest.useRealTimers();
  });

  test("toggles a vocabulary item's global favorite state", async () => {
    const handleFavoriteChange = jest.fn();
    document.addEventListener(EVENT_FAVORITE_WORD_CHANGE, handleFavoriteChange);
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl);
    const item = {
      word: "ready",
      timestamp: 33000,
      phonetic: "/redi/",
      definition: "adj. 准备好的",
      examples: [{ eng: "ready to go", chs: "准备出发" }],
    };

    manager.initialize([subtitle], [], 100);
    manager.addWord(
      item.word,
      item.phonetic,
      item.definition,
      item.examples,
      item.timestamp
    );
    manager._renderVocabulary();
    const button = document.querySelector(".kiss-favorite-word-button");

    await flushPromises();
    expect(button.style.marginLeft).toBe("auto");
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    await flushPromises();

    expect(favoriteWords).toEqual({
      ready: expect.objectContaining({
        phonetic: "/redi/",
        definition: "adj. 准备好的",
        examples: item.examples,
      }),
    });
    expect(favoriteWords.ready.timestamp).toBeUndefined();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(handleFavoriteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { word: "ready", isFavorite: true },
      })
    );

    manager.destroy();
    document.removeEventListener(
      EVENT_FAVORITE_WORD_CHANGE,
      handleFavoriteChange
    );
  });

  test("clears word tooltip when the subtitle list scrolls away from the hovered word", async () => {
    jest.useFakeTimers();
    apiMicrosoftDict.mockResolvedValue({
      trs: [{ pos: "adj.", def: "准备好的" }],
    });
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl, () => "", {
      enableHoverLookup: true,
    });

    manager.initialize([{ ...subtitle, text: "ready to go" }], [], 100);
    renderVisibleSubtitleItems(manager);
    const word = document.querySelector(".kiss-subtitle-word");

    word.dispatchEvent(new Event("pointerenter"));
    jest.advanceTimersByTime(300);
    await apiMicrosoftDict.mock.results[0].value;
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector(".kiss-word-tooltip")).not.toBeNull();
    expect(word.classList.contains("kiss-word-hover")).toBe(true);

    manager.subtitleScrollContainer.dispatchEvent(new Event("scroll"));

    expect(document.querySelector(".kiss-word-tooltip")).toBeNull();
    expect(word.classList.contains("kiss-word-hover")).toBe(false);

    manager.destroy();
  });

  test("jumps only when clicking the time label", async () => {
    const videoEl = createVideoElement();
    const manager = new YouTubeSubtitleList(videoEl);

    manager.initialize([{ ...subtitle, start: 33000 }], [], 100);
    renderVisibleSubtitleItems(manager);

    document.querySelector(".kiss-youtube-original").click();
    expect(videoEl.currentTime).toBe(0);

    document.querySelector(".kiss-youtube-item span").click();
    expect(videoEl.currentTime).toBe(33);

    await Promise.resolve();
    await Promise.resolve();
    manager.destroy();
  });

  describe("renderMarkdownToElement", () => {
    test("renders headings, lists, bold text, and paragraphs without innerHTML injection", () => {
      const container = document.createElement("div");
      const md = `### 核心概要
这是一段视频简介。

### 关键要点
- **要点一**: 详细说明
- **要点二**: 更多内容
1. 第一项
2. 第二项`;

      renderMarkdownToElement(md, container);

      const h4s = container.querySelectorAll("h4");
      expect(h4s.length).toBe(2);
      expect(h4s[0].textContent).toBe("核心概要");
      expect(h4s[1].textContent).toBe("关键要点");

      const uls = container.querySelectorAll("ul");
      expect(uls.length).toBe(1);
      const lis = uls[0].querySelectorAll("li");
      expect(lis.length).toBe(2);
      expect(lis[0].querySelector("strong").textContent).toBe("要点一");

      const ols = container.querySelectorAll("ol");
      expect(ols.length).toBe(1);
      expect(ols[0].querySelectorAll("li").length).toBe(2);

      const ps = container.querySelectorAll("p");
      expect(ps.length).toBe(1);
      expect(ps[0].textContent).toBe("这是一段视频简介。");
    });
  });

  describe("Video summary tab", () => {
    test("shows guide view and calls openOptionsPage when service is unconfigured", async () => {
      const videoEl = createVideoElement();
      const manager = new YouTubeSubtitleList(videoEl, (key) => key, {
        getSummaryConfig: () => ({ summaryApiSlug: "-" }),
      });
      manager.initialize([subtitle], [], 100);

      // Switch to summary tab
      manager.summaryTabEl.click();
      await flushPromises();

      expect(manager.activeTab).toBe("summary");
      expect(manager.summaryListEl.style.display).toBe("flex");
      expect(manager.subtitleListEl.style.display).toBe("none");

      // Verify guide text and setting button
      expect(manager.summaryScrollContainer.textContent).toContain(
        "summary_empty_guide"
      );
      const settingBtn = manager.summaryScrollContainer.querySelector("button");
      expect(settingBtn).not.toBeNull();
      expect(settingBtn.textContent).toBe("go_to_settings");

      settingBtn.click();
      expect(openOptionsPage).toHaveBeenCalledWith("/subtitle");

      manager.destroy();
    });

    test("fetches summary, renders markdown, supports regenerate and copy when configured", async () => {
      const videoEl = createVideoElement();
      apiSummarizeVideo.mockResolvedValue(
        `### 核心概要\n这是测试视频的总结内容。\n\n- **要点**: 详细解释`
      );

      const getSummaryConfig = jest.fn(() => ({
        summaryApiSlug: "openai_test",
        summaryPromptSlug: "default_video_summary",
        to: "zh-CN",
        transApis: [{ apiSlug: "openai_test", apiType: "OpenAI" }],
        prompts: [],
      }));

      const getVideoMetadata = jest.fn(() => ({
        videoId: "test_vid_123",
        title: "测试视频标题",
        description: "测试视频简介",
        transcript: "hello world transcript",
      }));

      const manager = new YouTubeSubtitleList(videoEl, (key) => key, {
        getSummaryConfig,
        getVideoMetadata,
      });
      manager.initialize([subtitle], [], 100);

      // Switch to summary tab
      manager.summaryTabEl.click();
      await flushPromises();

      expect(apiSummarizeVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoId: "test_vid_123",
          title: "测试视频标题",
          description: "测试视频简介",
          transcript: "hello world transcript",
          apiSetting: { apiSlug: "openai_test", apiType: "OpenAI" },
          to: "zh-CN",
          force: false,
        })
      );

      // Verify rendered summary
      expect(
        manager.summaryScrollContainer.querySelector("h4").textContent
      ).toBe("核心概要");
      expect(
        manager.summaryScrollContainer.querySelector("strong").textContent
      ).toBe("要点");

      // Switching away and back uses cache without re-requesting
      apiSummarizeVideo.mockClear();
      manager.subtitleTabEl.click();
      expect(manager.activeTab).toBe("subtitles");
      manager.summaryTabEl.click();
      await flushPromises();
      expect(apiSummarizeVideo).not.toHaveBeenCalled();

      // Click regenerate calls with force: true
      manager.summaryRegenBtn.click();
      await flushPromises();
      expect(apiSummarizeVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoId: "test_vid_123",
          force: true,
        })
      );

      // Test copy summary to clipboard
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn(() => Promise.resolve()),
        },
      });
      manager.summaryCopyBtn.click();
      await flushPromises();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("这是测试视频的总结内容")
      );

      manager.destroy();
    });

    test("re-fetches summary and invalidates panel cache when video transcript changes", async () => {
      const videoEl = createVideoElement();
      apiSummarizeVideo.mockResolvedValue("初始总结");

      let currentTranscript = "initial transcript text 12345";
      const getSummaryConfig = jest.fn(() => ({
        summaryApiSlug: "openai_test",
        summaryPromptSlug: "default_video_summary",
        to: "zh-CN",
        transApis: [{ apiSlug: "openai_test", apiType: "OpenAI" }],
        prompts: [],
      }));

      const getVideoMetadata = jest.fn(() => ({
        videoId: "test_vid_cache_inval",
        title: "测试视频标题",
        transcript: currentTranscript,
      }));

      const manager = new YouTubeSubtitleList(videoEl, (key) => key, {
        getSummaryConfig,
        getVideoMetadata,
      });
      manager.initialize([subtitle], [], 100);

      // 1. 首次打开，触发生成
      manager.summaryTabEl.click();
      await flushPromises();
      expect(apiSummarizeVideo).toHaveBeenCalledTimes(1);

      // 2. 切走再切回，输入未变，命中面板内存缓存
      apiSummarizeVideo.mockClear();
      manager.subtitleTabEl.click();
      manager.summaryTabEl.click();
      await flushPromises();
      expect(apiSummarizeVideo).not.toHaveBeenCalled();

      // 3. 字幕内容发生变化（如异步加载完成或补全）
      currentTranscript =
        "initial transcript text 12345 + newly appended lines";
      apiSummarizeVideo.mockResolvedValue("更新后的总结");

      manager.subtitleTabEl.click();
      manager.summaryTabEl.click();
      await flushPromises();

      // 缓存签名改变，面板内存缓存未命中，重新发起总结请求
      expect(apiSummarizeVideo).toHaveBeenCalledTimes(1);
      expect(apiSummarizeVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: currentTranscript,
        })
      );

      manager.destroy();
    });

    test("shows downloading card, updates progress, and allows switching to network AI", async () => {
      const videoEl = createVideoElement();
      apiSummarizeVideo.mockRejectedValueOnce(
        new Error(
          "Chrome 内置大模型正在下载中（体积约 1.5GB ~ 2GB）。您可在 chrome://components 查看..."
        )
      );

      const storage = require("../libs/storage.js");
      storage.getSettingWithDefault.mockResolvedValue({
        subtitleSetting: { summaryApiSlug: "BuiltinAI" },
        transApis: [
          {
            apiSlug: "openai_net",
            apiName: "OpenAI GPT-4o",
            apiType: "OpenAI",
            sourceType: "network",
            isDisabled: false,
            enabledCapabilities: ["translate", "summarize"],
          },
          {
            apiSlug: "azure_trans_only",
            apiName: "Azure Translation Only",
            apiType: "AzureAI",
            sourceType: "network",
            isDisabled: false,
            enabledCapabilities: ["translate"], // 未开启总结能力
          },
        ],
      });

      const getSummaryConfig = jest.fn(() => ({
        summaryApiSlug: "BuiltinAI",
        summaryPromptSlug: "default_video_summary",
        to: "zh-CN",
        transApis: [
          {
            apiSlug: "openai_net",
            apiName: "OpenAI GPT-4o",
            apiType: "OpenAI",
            sourceType: "network",
            isDisabled: false,
            enabledCapabilities: ["translate", "summarize"],
          },
        ],
      }));

      const getVideoMetadata = jest.fn(() => ({
        videoId: "vid_downloading_test",
        title: "下载测试视频",
        transcript: "transcript text",
      }));

      const manager = new YouTubeSubtitleList(videoEl, (key) => key, {
        getSummaryConfig,
        getVideoMetadata,
      });
      manager.initialize([subtitle], [], 100);

      manager.summaryTabEl.click();
      await flushPromises();

      // 验证下载卡片已渲染
      expect(manager.summaryScrollContainer.textContent).toContain(
        "model_downloading_title"
      );
      expect(manager.summaryScrollContainer.textContent).toContain(
        "switch_to_network_ai"
      );

      // 模拟接收后台推送的进度更新
      manager._handleBuiltinAiProgress({
        loaded: 524288000,
        total: 1572864000,
        percent: 33,
      });

      expect(manager._downloadProgressBar.style.width).toBe("33%");
      expect(manager._downloadProgressText.textContent).toContain("33%");

      // 测试切换网络 AI
      apiSummarizeVideo.mockResolvedValueOnce("网络AI成功生成的总结");
      const switchBtn = manager.summaryScrollContainer.querySelector("button");
      switchBtn.click();
      await flushPromises();

      // 弹出浮层
      expect(manager._modelSwitcherPopup).not.toBeNull();
      const optionItem = manager._modelSwitcherPopup.querySelector(
        "div[style*='cursor: pointer']"
      );
      expect(optionItem.textContent).toContain("OpenAI GPT-4o");
      expect(manager._modelSwitcherPopup.textContent).not.toContain(
        "Azure Translation Only"
      );

      optionItem.click();
      await flushPromises();

      // 验证已持久化保存设置并触发重新生成
      expect(storage.saveEdit).toHaveBeenCalled();
      expect(apiSummarizeVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoId: "vid_downloading_test",
          force: true,
        })
      );

      manager.destroy();
    });
  });
});

test("list auto-scroll preserves the handoff delay and panel interaction", async () => {
  jest.useFakeTimers();
  require("../libs/storage.js").getWordsWithDefault.mockResolvedValue({});
  apiMicrosoftDict.mockResolvedValue({ trs: [{ def: "definition" }] });
  const videoEl = createVideoElement();
  const manager = new YouTubeSubtitleList(videoEl, () => "", {
    enableHoverLookup: true,
    hoverLookupCloseDelay: 5,
  });
  try {
    manager.initialize([{ ...subtitle }], [], 100);
    renderVisibleSubtitleItems(manager);
    const word = document.querySelector(".kiss-subtitle-word");
    word.dispatchEvent(new Event("pointerenter"));
    jest.advanceTimersByTime(300);
    await flushPromises();
    const panel = document.querySelector(".kiss-word-tooltip");
    expect(panel).not.toBeNull();
    word.dispatchEvent(new Event("pointerleave"));
    manager.handleSubtitleScroll();
    jest.advanceTimersByTime(4000);
    expect(panel.isConnected).toBe(true);
    panel.dispatchEvent(new Event("pointerenter"));
    manager.handleSubtitleScroll();
    jest.advanceTimersByTime(10000);
    expect(panel.isConnected).toBe(true);
    panel.dispatchEvent(new Event("pointerleave"));
    expect(panel.isConnected).toBe(false);
  } finally {
    manager.destroy();
    jest.useRealTimers();
  }
});

test("empty ASR sidebar keeps its fixed status inside the ASR tab only", async () => {
  jest.useFakeTimers();
  const video = createVideoElement();
  const onClose = jest.fn();
  const list = new YouTubeSubtitleList(video, (key) => key, {
    asrActions: {},
    onClose,
  });
  try {
    list.initialize([], [], 0);
    expect(list.container).not.toBeNull();
    const header = list.container.firstElementChild;
    expect(
      [...header.querySelectorAll("button")]
        .slice(0, 4)
        .map((button) => button.textContent)
    ).toEqual([
      "bilingual_subtitles [0%]",
      "youtube_asr_tab",
      "vocabulary_book",
      "video_summary",
    ]);
    list.selectAsrTab();
    expect(list.activeTab).toBe("asr");
    list.updateAsrState({
      active: true,
      phase: "error",
      error: "AUDIO_CAPTURE_MISSING",
    });
    jest.advanceTimersByTime(100);
    const summary = list.asrPanel.summary;
    expect(summary.parentElement).toBe(list.asrPanel.element);
    expect(summary.previousElementSibling).toBe(list.asrPanel.toolbar);
    expect(summary.nextElementSibling).toBe(list.asrPanel.list);
    expect(summary.style.height).toBe("");
    expect(summary.style.overflow).not.toBe("auto");
    list.subtitleTabEl.click();
    expect(summary.isConnected).toBe(true);
    expect(list.asrPanel.element.style.display).toBe("none");
    header.querySelectorAll("button")[2].click();
    expect(list.asrPanel.element.style.display).toBe("none");
    header.querySelectorAll("button")[3].click();
    expect(list.asrPanel.element.style.display).toBe("none");
    list.subtitleTabEl.click();
    expect(list.activeTab).toBe("subtitles");
    list.updateAsrState({ phase: "waiting" });
    expect(list.activeTab).toBe("subtitles");
    header.querySelectorAll("button")[4].click();
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    list.destroy();
    jest.useRealTimers();
  }
});

test("updateAsrState does not throw when asrAudioButton is not present", () => {
  const video = createVideoElement();
  const list = new YouTubeSubtitleList(video, (key) => key, {});
  try {
    list.initialize([], [], 0);
    expect(list.asrAudioButton).toBeUndefined();
    expect(() => {
      list.updateAsrState({ phase: "off", audio: { phase: "idle" } });
    }).not.toThrow();
  } finally {
    list.destroy();
  }
});

test("inactive ASR tab exposes only its enable button and switching tabs never starts recognition", () => {
  const start = jest.fn();
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: { start },
  });
  try {
    list.updateAsrState({ phase: "off", active: false, available: true });
    list.initialize([subtitle]);
    expect(list.asrTabEl).toBeDefined();
    list.selectAsrTab();
    expect(list.asrEnableView.style.display).toBe("flex");
    expect(
      list.asrEnableView.querySelectorAll("button:not([hidden])")
    ).toHaveLength(1);
    expect(list.asrStartButton.textContent).toBe("youtube_asr_enable");
    expect(list.asrStartButton.disabled).toBe(false);
    expect(list.asrPanel.element.style.display).toBe("none");
    expect(start).not.toHaveBeenCalled();
    list.asrStartButton.click();
    expect(start).toHaveBeenCalledTimes(1);
    list.updateAsrState({ phase: "waiting", active: true, available: true });
    expect(list.activeTab).toBe("asr");
    expect(list.asrEnableView.style.display).toBe("none");
    expect(list.asrPanel.element.style.display).toBe("flex");
    list.asrPanel.render();
    expect(list.asrPanel.summary.querySelectorAll("progress")).toHaveLength(4);
    expect([...list.asrPanel.coverage.keys()]).toEqual([
      "audio",
      "cutting",
      "recognition",
      "translation",
    ]);
    expect(list.asrPanel.coverage.get("cutting").row.hidden).toBe(true);
    list.updateAsrState({
      phase: "running",
      active: true,
      available: true,
      cutting: { samples: 16000, totalSamples: 32000, complete: false },
    });
    list.asrPanel.render();
    expect(list.asrPanel.coverage.get("cutting").row.hidden).toBe(false);
    expect(list.asrPanel.coverage.get("cutting").bar.value).toBe(50);
    list.updateAsrState({ phase: "off", active: false, available: true });
    expect(list.activeTab).toBe("asr");
    expect(list.asrEnableView.style.display).toBe("flex");
    expect(list.asrPanel.element.style.display).toBe("none");
    list.subtitleTabEl.click();
    expect(list.asrView.style.display).toBe("none");
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    list.destroy();
  }
});

test("unconfigured recognition keeps its tab with a disabled enable button and configuration hint", () => {
  const start = jest.fn();
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: { start },
  });
  try {
    list.updateAsrState({ phase: "off", active: false, available: false });
    list.initialize([]);
    list.selectAsrTab();
    expect(list.asrStartButton.disabled).toBe(true);
    expect(list.asrStartButton.style.opacity).toBe("0.45");
    expect(list.asrStartButton.style.cursor).toBe("not-allowed");
    expect(list.asrStartButton.title).toBe("youtube_asr_service_unavailable");
    expect(list.asrInactiveNotice.textContent).toBe("youtube_asr_setup_guide");
    expect(list.asrSettingsButton.hidden).toBe(false);
    list.asrSettingsButton.click();
    expect(openOptionsPage).toHaveBeenCalledWith("/subtitle");
    list.asrStartButton.click();
    expect(start).not.toHaveBeenCalled();
    list.updateAsrState({ phase: "off", active: false, available: true });
    expect(list.asrStartButton.disabled).toBe(false);
    expect(list.asrStartButton.style.opacity).toBe("1");
    expect(list.asrStartButton.style.cursor).toBe("pointer");
    expect(list.asrStartButton.title).toBe("");
    expect(list.asrInactiveNotice.textContent).toBe("");
    expect(list.asrSettingsButton.hidden).toBe(true);
  } finally {
    list.destroy();
  }
});

test("bilingual tab renders new ASR text and subsequent translations received while hidden", () => {
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: {},
  });
  list.initialize([]);
  list.updateAsrState({ active: true, available: true });
  list.selectAsrTab();
  list.setBilingualSubtitles(
    [{ start: 0, end: 1000, text: "Fresh speech", translation: "" }],
    50
  );
  list.setBilingualSubtitles(
    [{ start: 0, end: 1000, text: "Fresh speech", translation: "新识别译文" }],
    100
  );
  list.subtitleTabEl.click();
  renderVisibleSubtitleItems(list);
  expect(list.subtitleListUl.textContent).toContain("Fresh speech");
  expect(list.subtitleListUl.textContent).toContain("新识别译文");
  list.destroy();
});

test("ASR toolbar stop reuses the menu action and returns to the enable view", () => {
  const deleteAudio = jest.fn(),
    deleteCache = jest.fn();
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: {
      stop: () => {
        stop();
        list.updateAsrState({ active: false, available: true });
      },
      deleteAudio,
      deleteCache,
    },
  });
  const stop = jest.fn();
  list.initialize([]);
  list.selectAsrTab();
  list.updateAsrState({ active: true, available: true });
  expect(list.asrStopButton.parentElement).toBe(list.asrPanel.toolbar);
  expect(list.asrStopButton.textContent).toBe("youtube_asr_disable");
  list.asrStopButton.click();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(deleteAudio).not.toHaveBeenCalled();
  expect(deleteCache).not.toHaveBeenCalled();
  expect(list.activeTab).toBe("asr");
  expect(list.asrPanel.element.style.display).toBe("none");
  expect(list.asrEnableView.style.display).toBe("flex");
  list.destroy();
});

test("ASR pause toggles to resume and clearing keeps recognition closed with a disabled start", () => {
  const pause = jest.fn(),
    resume = jest.fn();
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: { pause, resume },
  });
  list.initialize([]);
  list.selectAsrTab();
  list.updateAsrState({ active: true, available: true });
  expect(list.asrPauseButton.textContent).toBe("youtube_asr_pause_btn");
  list.asrPauseButton.click();
  expect(pause).toHaveBeenCalledTimes(1);
  list.updateAsrState({ active: true, available: true, paused: true });
  expect(list.asrPauseButton.textContent).toBe("youtube_asr_resume_btn");
  list.asrPauseButton.click();
  expect(resume).toHaveBeenCalledTimes(1);
  list.updateAsrState({ active: false, available: true, clearing: true });
  expect(list.asrStartButton.disabled).toBe(true);
  expect(list.asrPauseButton.disabled).toBe(true);
  expect(list.asrClearAudioButton.disabled).toBe(true);
  expect(list.asrClearSubtitlesButton.disabled).toBe(true);
  list.updateAsrState({
    active: false,
    available: true,
    cacheDeleteError: "CACHE_UNAVAILABLE",
  });
  expect(list.asrInactiveNotice.textContent).toBe(
    "youtube_asr_cache_delete_failed"
  );
  expect(list.asrStartButton.disabled).toBe(false);
  list.destroy();
});

test("empty native subtitle failures expose a retry and hide it after recovery", () => {
  const retryCaptions = jest.fn();
  const list = new YouTubeSubtitleList(createVideoElement(), (key) => key, {
    asrActions: {},
    retryCaptions,
  });
  list.initialize([]);
  list.updateCaptionState({ phase: "error", code: "TIMEOUT" });
  expect(list.captionRetryButton.hidden).toBe(false);
  list.captionRetryButton.click();
  expect(retryCaptions).toHaveBeenCalledTimes(1);
  list.updateCaptionState({ phase: "loading" });
  expect(list.captionRetryButton.hidden).toBe(true);
  list.updateCaptionState({ phase: "error" });
  list.setBilingualSubtitles([subtitle], 100);
  expect(list.captionRetryButton.hidden).toBe(true);
  list.destroy();
});

test("watch sidebar waits for its host and remounts after the host is replaced", async () => {
  const video = createVideoElement();
  window.history.replaceState({}, "", "/watch?v=video-1");
  document.getElementById("secondary-inner").remove();
  const list = new YouTubeSubtitleList(video, (key) => key, { asrActions: {} });
  list.initialize([]);
  expect(list.container.style.display).toBe("none");
  expect(list.container.parentElement).not.toBe(document.body);
  const host = document.createElement("div");
  host.id = "secondary-inner";
  document.body.append(host);
  await flushPromises();
  expect(list.container.parentElement).toBe(host);
  expect(list.container.style.position).toBe("");
  expect(list.container.style.display).toBe("flex");
  const replacement = document.createElement("div");
  replacement.id = "secondary-inner";
  host.replaceWith(replacement);
  await flushPromises();
  expect(list.container.parentElement).toBe(replacement);
  const observer = list._sidebarMountObserver;
  const disconnect = jest.spyOn(observer, "disconnect");
  list.destroy();
  expect(disconnect).toHaveBeenCalled();
  await flushPromises();
  expect(replacement.children).toHaveLength(0);
});

test("disables export buttons when subtitles or raw events are not ready and enables them on arrival", async () => {
  const video = createVideoElement();
  const list = new YouTubeSubtitleList(video, (key) => key, { asrActions: {} });
  list.initialize([], [], 0);

  // 初始化时字幕与源数据为空，全部禁用
  expect(list.downloadBtn).toBeDefined();
  expect(list.downloadBtn.disabled).toBe(true);
  expect(list.downloadBtn.style.opacity).toBe("0.45");
  expect(list.downloadBtn.style.cursor).toBe("not-allowed");

  expect(list.downloadTranslationBtn).toBeDefined();
  expect(list.downloadTranslationBtn.disabled).toBe(true);
  expect(list.downloadTranslationBtn.style.opacity).toBe("0.45");

  expect(list.downloadRawBtn).toBeDefined();
  expect(list.downloadRawBtn.disabled).toBe(true);
  expect(list.downloadRawBtn.style.opacity).toBe("0.45");

  // 导出按钮被禁用不应影响 ASR 按钮的独立样式
  expect(list.asrAudioButton.disabled).toBe(false);
  expect(list.asrAudioButton.style.opacity).toBe("1");
  expect(list.asrAudioButton.style.cursor).toBe("pointer");
  expect(list.asrClearAudioButton.disabled).toBe(false);
  expect(list.asrClearAudioButton.style.opacity).toBe("1");
  expect(list.asrClearAudioButton.style.cursor).toBe("pointer");
  expect(list.asrClearSubtitlesButton.style.opacity).toBe("1");
  expect(list.asrClearSubtitlesButton.style.cursor).toBe("pointer");
  expect(list.asrStopButton.style.opacity).toBe("1");
  expect(list.asrStopButton.style.cursor).toBe("pointer");

  // ASR 自身忙碌时独立同步禁用样式
  list.updateAsrState({
    fullExport: "generating",
    audio: { phase: "fetching" },
  });
  expect(list.asrAudioButton.disabled).toBe(true);
  expect(list.asrAudioButton.style.opacity).toBe("0.45");
  expect(list.asrAudioButton.style.cursor).toBe("not-allowed");
  expect(list.asrClearAudioButton.disabled).toBe(false);
  expect(list.asrClearAudioButton.style.opacity).toBe("1");
  expect(list.asrClearAudioButton.style.cursor).toBe("pointer");
  list.updateAsrState({ fullExport: "idle", audio: { phase: "idle" } });
  expect(list.asrAudioButton.disabled).toBe(false);
  expect(list.asrAudioButton.style.opacity).toBe("1");
  expect(list.asrAudioButton.style.cursor).toBe("pointer");
  expect(list.asrClearAudioButton.disabled).toBe(false);
  expect(list.asrClearAudioButton.style.opacity).toBe("1");
  expect(list.asrClearAudioButton.style.cursor).toBe("pointer");

  // 悬停不触发位移
  list.downloadBtn.dispatchEvent(new Event("mouseenter"));
  expect(list.downloadBtn.style.transform).toBe("translateY(0)");

  // 仅有原文无译文时：启用下载字幕 (VTT) 与源数据 (JSON)
  list.setBilingualSubtitles([
    { start: 0, end: 1000, text: "Hello", translation: "" },
  ]);
  expect(list.downloadBtn.disabled).toBe(false);
  expect(list.downloadBtn.style.opacity).toBe("1");
  expect(list.downloadBtn.style.cursor).toBe("pointer");
  expect(list.downloadTranslationBtn.disabled).toBe(true);
  expect(list.downloadRawBtn.disabled).toBe(false);
  expect(list.downloadRawBtn.style.opacity).toBe("1");
  expect(list.downloadRawBtn.style.cursor).toBe("pointer");

  // 悬停可用按钮触发位移
  list.downloadBtn.dispatchEvent(new Event("mouseenter"));
  expect(list.downloadBtn.style.transform).toBe("translateY(-1px)");

  // 单条译文到达时：启用下载译文字幕 (VTT)
  list.updateSingleSubtitle({ start: 0, translation: "你好" });
  expect(list.downloadTranslationBtn.disabled).toBe(false);
  expect(list.downloadTranslationBtn.style.opacity).toBe("1");
  expect(list.downloadTranslationBtn.style.cursor).toBe("pointer");

  // 初始化传入原始事件时：启用下载源数据 (JSON)
  list.initialize(
    [{ start: 0, end: 1000, text: "Hello", translation: "你好" }],
    [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Hello" }] }]
  );
  expect(list.downloadBtn.disabled).toBe(false);
  expect(list.downloadTranslationBtn.disabled).toBe(false);
  expect(list.downloadRawBtn.disabled).toBe(false);
  expect(list.downloadRawBtn.style.opacity).toBe("1");
  expect(list.downloadRawBtn.style.cursor).toBe("pointer");

  // ASR 模式下自动通过双语字幕组装 JSON 源数据
  list.updateAsrState({ active: true, available: true });
  list.setBilingualSubtitles([
    { start: 100, end: 500, text: "ASR Text", translation: "ASR 译文" },
  ]);
  expect(list.downloadRawBtn.disabled).toBe(false);
  expect(list._getExportableRawSubtitleEvents()).toEqual([
    {
      tStartMs: 100,
      dDurationMs: 400,
      segs: [{ utf8: "ASR Text" }],
      translation: "ASR 译文",
    },
  ]);

  // 原生事件异步到达时，退出 ASR 模式可优先导出原生事件
  list.updateRawSubtitleEvents([
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Native" }] },
  ]);
  list.updateAsrState({ active: false, available: true });
  expect(list._getExportableRawSubtitleEvents()).toEqual([
    { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Native" }] },
  ]);

  // 清空字幕与原生数据时：再次全部禁用
  list.initialize([], [], 0);
  expect(list.downloadBtn.disabled).toBe(true);
  expect(list.downloadTranslationBtn.disabled).toBe(true);
  expect(list.downloadRawBtn.disabled).toBe(true);
  expect(list.downloadRawBtn.style.opacity).toBe("0.45");
  expect(list.downloadRawBtn.style.cursor).toBe("not-allowed");

  list.destroy();
});
