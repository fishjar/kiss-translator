import {
  YouTubeSubtitleList,
  renderMarkdownToElement,
} from "./YouTubeSubtitleList";
import {
  apiMicrosoftDict,
  apiSummarizeVideo,
  getVideoSummarySignature,
} from "../apis/index.js";
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
  test.each(["asr", "audio-chunk"])(
    "ASR %s download does not jump playback; full export has independent progress and cancel",
    async (timingSource) => {
      const video = createVideoElement(),
        exportSentence = jest.fn(async () => {}),
        exportFull = jest.fn(),
        cancelExport = jest.fn();
      const list = new YouTubeSubtitleList(video, (key) => key, {
        asrActions: { exportSentence, exportFull, cancelExport },
      });
      const cue = { ...subtitle, timingSource };
      list.initialize([cue]);
      renderVisibleSubtitleItems(list);
      expect(
        list.container.querySelector('[aria-label^="youtube_asr_"]')
      ).toBeNull();
      list.asrAudioButton.click();
      expect(exportFull).toHaveBeenCalledTimes(1);
      list.updateAsrState({
        phase: "recognizing",
        fullExport: "fetching",
        audio: { phase: "fetching", percent: 35, bytes: 1024 },
      });
      expect(list.asrAudioButton.disabled).toBe(true);
      expect(list.asrAudioButton.textContent).toContain("35%");
      expect(list.asrStatus).toBeUndefined();
      expect(list.asrAudioButton.parentElement).toBe(list.asrPanel.toolbar);
      list.asrCancelButton.click();
      expect(cancelExport).toHaveBeenCalledTimes(1);
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
    list.updateAsrState({ phase: "error", error: "AUDIO_CAPTURE_MISSING" });
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
