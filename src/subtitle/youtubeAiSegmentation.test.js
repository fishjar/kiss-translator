import {
  createAiChunkScheduler,
  eventsToSubtitles,
} from "./youtubeAiSegmentation";

jest.mock("../libs/log.js", () => ({
  LogLevel: {
    INFO: { value: "info" },
  },
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
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

const flatEvents = [
  { start: 0, end: 1000, text: "hello" },
  { start: 1000, end: 2000, text: "world" },
];

const subtitle = {
  start: 0,
  end: 2000,
  text: "hello world",
  translation: "你好世界",
  _si: 0,
  _ei: 1,
};

describe("eventsToSubtitles", () => {
  test("appends streamed first-chunk subtitles before full chunk resolves", async () => {
    const deferred = createDeferred();
    const apiSubtitle = jest.fn(({ onSubtitleChunk }) => {
      // 模拟字幕断句接口先按句输出，再等待完整 chunk 结束。
      onSubtitleChunk({ subtitles: [subtitle], isFinal: false });
      return deferred.promise;
    });
    const onAppendSubtitles = jest.fn();

    const resultPromise = eventsToSubtitles({
      videoId: "video-1",
      events: flatEvents,
      flatEvents,
      fromLang: "en",
      setting: {
        segSlug: "openai",
        apiSlug: "openai",
        transApis: [{ apiSlug: "openai" }],
        chunkLength: 1000,
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      showNotification: jest.fn(),
      i18n: (key) => key,
      apiSubtitle,
      docInfo: {},
      builtinSegment: jest.fn(),
      formatSubtitles: jest.fn(() => []),
      onAppendSubtitles,
      getCurrentVideoId: () => "video-1",
    });

    await Promise.resolve();

    expect(onAppendSubtitles).toHaveBeenCalledWith({
      subtitles: [subtitle],
      progressed: 100,
      chunkNum: 1,
    });

    deferred.resolve([subtitle]);
    await expect(resultPromise).resolves.toEqual([[subtitle], 100]);
  });

  test("keeps AI translations by default when segmentation and translation APIs differ", async () => {
    const apiSubtitle = jest.fn(() => Promise.resolve([subtitle]));

    const [subtitles] = await eventsToSubtitles({
      videoId: "video-1",
      events: flatEvents,
      flatEvents,
      fromLang: "en",
      setting: {
        segSlug: "openai",
        apiSlug: "google",
        transApis: [{ apiSlug: "openai" }],
        chunkLength: 1000,
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      showNotification: jest.fn(),
      i18n: (key) => key,
      apiSubtitle,
      docInfo: {},
      builtinSegment: jest.fn(),
      formatSubtitles: jest.fn(() => []),
      onAppendSubtitles: jest.fn(),
      getCurrentVideoId: () => "video-1",
    });

    expect(subtitles).toEqual([subtitle]);
    expect(subtitles[0]).not.toHaveProperty("_isDraftTranslation");
  });

  test("marks AI translations as draft when force re-translate is enabled", async () => {
    const apiSubtitle = jest.fn(() => Promise.resolve([subtitle]));

    const [subtitles] = await eventsToSubtitles({
      videoId: "video-1",
      events: flatEvents,
      flatEvents,
      fromLang: "en",
      setting: {
        segSlug: "openai",
        apiSlug: "google",
        forceSubtitleRetranslate: true,
        transApis: [{ apiSlug: "openai" }],
        chunkLength: 1000,
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      showNotification: jest.fn(),
      i18n: (key) => key,
      apiSubtitle,
      docInfo: {},
      builtinSegment: jest.fn(),
      formatSubtitles: jest.fn(() => []),
      onAppendSubtitles: jest.fn(),
      getCurrentVideoId: () => "video-1",
    });

    expect(subtitles).toEqual([{ ...subtitle, _isDraftTranslation: true }]);
  });

  test("leaves missing AI translations empty so the manager can fill them later", async () => {
    const subtitleWithoutTranslation = {
      start: 0,
      end: 2000,
      text: "hello world",
      _si: 0,
      _ei: 1,
    };
    const apiSubtitle = jest.fn(() =>
      Promise.resolve([subtitleWithoutTranslation])
    );

    const [subtitles] = await eventsToSubtitles({
      videoId: "video-1",
      events: flatEvents,
      flatEvents,
      fromLang: "en",
      setting: {
        segSlug: "openai",
        apiSlug: "google",
        transApis: [{ apiSlug: "openai" }],
        chunkLength: 1000,
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      showNotification: jest.fn(),
      i18n: (key) => key,
      apiSubtitle,
      docInfo: {},
      builtinSegment: jest.fn(),
      formatSubtitles: jest.fn(() => []),
      onAppendSubtitles: jest.fn(),
      getCurrentVideoId: () => "video-1",
    });

    expect(subtitles).toEqual([subtitleWithoutTranslation]);
    expect(subtitles[0]).not.toHaveProperty("translation");
    expect(subtitles[0]).not.toHaveProperty("_isDraftTranslation");
  });

  test("does not process remaining AI chunks until playback schedules them", async () => {
    const multiChunkEvents = [
      { start: 0, end: 1000, text: "first chunk." },
      { start: 1000, end: 2000, text: "second chunk." },
      { start: 120000, end: 121000, text: "third chunk." },
    ];
    const apiSubtitle = jest.fn(({ events }) =>
      Promise.resolve([
        {
          start: events[0].start,
          end: events[events.length - 1].end,
          text: events.map((event) => event.text).join(" "),
          translation: "translated",
        },
      ])
    );

    const [subtitles, progressed, scheduler] = await eventsToSubtitles({
      videoId: "video-1",
      events: multiChunkEvents,
      flatEvents: multiChunkEvents,
      fromLang: "en",
      setting: {
        segSlug: "openai",
        apiSlug: "openai",
        transApis: [{ apiSlug: "openai" }],
        chunkLength: 10,
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      showNotification: jest.fn(),
      i18n: (key) => key,
      apiSubtitle,
      docInfo: {},
      builtinSegment: jest.fn(),
      formatSubtitles: jest.fn(() => []),
      onAppendSubtitles: jest.fn(),
      getCurrentVideoId: () => "video-1",
    });

    expect(subtitles).toHaveLength(1);
    expect(progressed).toBeLessThan(100);
    expect(scheduler).toEqual(
      expect.objectContaining({
        scheduleUntil: expect.any(Function),
      })
    );
    expect(apiSubtitle).toHaveBeenCalledTimes(1);
  });
});

describe("createAiChunkScheduler", () => {
  const chunks = [
    [{ start: 0, end: 1000, text: "first chunk." }],
    [{ start: 10000, end: 11000, text: "second chunk." }],
    [{ start: 120000, end: 121000, text: "third chunk." }],
  ];

  const createScheduler = (overrides = {}) => {
    const apiSubtitle =
      overrides.apiSubtitle ||
      jest.fn(({ events }) =>
        Promise.resolve([
          {
            start: events[0].start,
            end: events[events.length - 1].end,
            text: events.map((event) => event.text).join(" "),
            translation: "translated",
          },
        ])
      );
    const onAppendSubtitles = jest.fn();
    const formatSubtitles =
      overrides.formatSubtitles ||
      jest.fn((events) => [
        {
          start: events[0].start,
          end: events[events.length - 1].end,
          text: events.map((event) => event.text).join(" "),
        },
      ]);
    const scheduler = createAiChunkScheduler({
      chunks,
      firstDoneIndex: 0,
      videoId: "video-1",
      fromLang: "en",
      toLang: "zh-CN",
      segApiSetting: { apiSlug: "openai" },
      setting: {
        apiSlug: "openai",
        toLang: "zh-CN",
      },
      processingVersion: 1,
      isStaleProcessing: () => false,
      apiSubtitle,
      docInfo: {},
      formatSubtitles,
      clearSegmentTranslation: false,
      onAppendSubtitles,
      getCurrentVideoId: () => "video-1",
    });

    return { scheduler, apiSubtitle, onAppendSubtitles, formatSubtitles };
  };

  test("processes only chunks inside the playback lookahead window", async () => {
    const { scheduler, apiSubtitle } = createScheduler();

    await scheduler.scheduleUntil(0, 5);
    expect(apiSubtitle).not.toHaveBeenCalled();

    await scheduler.scheduleUntil(0, 15);
    expect(apiSubtitle).toHaveBeenCalledTimes(1);
    expect(apiSubtitle.mock.calls[0][0].events).toEqual(chunks[1]);
  });

  test("prioritizes a seeked window without processing skipped chunks", async () => {
    const { scheduler, apiSubtitle } = createScheduler();

    await scheduler.scheduleUntil(120000, 5);

    expect(apiSubtitle).toHaveBeenCalledTimes(1);
    expect(apiSubtitle.mock.calls[0][0].events).toEqual(chunks[2]);
  });

  test("does not request the same chunk more than once", async () => {
    const { scheduler, apiSubtitle } = createScheduler();

    await scheduler.scheduleUntil(0, 15);
    await scheduler.scheduleUntil(0, 15);

    expect(apiSubtitle).toHaveBeenCalledTimes(1);
  });

  test("falls back to built-in segmentation when an AI chunk fails", async () => {
    const apiSubtitle = jest.fn(() => Promise.reject(new Error("failed")));
    const { scheduler, onAppendSubtitles, formatSubtitles } = createScheduler({
      apiSubtitle,
    });

    await scheduler.scheduleUntil(0, 15);

    expect(formatSubtitles).toHaveBeenCalledWith(chunks[1], "en");
    expect(onAppendSubtitles).toHaveBeenCalledWith({
      subtitles: [
        {
          start: 10000,
          end: 11000,
          text: "second chunk.",
        },
      ],
      progressed: 66,
      chunkNum: 2,
    });
  });
});
