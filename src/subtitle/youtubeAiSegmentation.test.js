import {
  aiSegment,
  createAiChunkScheduler,
  eventsToSubtitles,
} from "./youtubeAiSegmentation";
import { mapBoundaryItemToCue } from "./subtitleBoundaryProtocol";
import { prepareTimedTextEvents } from "./youtubeSubtitleProcessing";

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

describe("coarse timedtext normalization", () => {
  test("expands a coarse phrase for AI boundaries and reconstructs adjacent cue times", async () => {
    const rawEvents = [
      {
        tStartMs: 1200,
        dDurationMs: 3400,
        segs: [{ utf8: "The quick brown fox.", acAsrConf: 0 }],
      },
    ];
    const prepared = prepareTimedTextEvents(rawEvents);
    const apiSubtitle = jest.fn(({ events }) => {
      let nextIndex = 0;
      return Promise.resolve(
        [
          { e: 1, t: "敏捷的狐狸" },
          { e: 3, t: "棕色狐狸。" },
        ].map((item) => {
          const cue = mapBoundaryItemToCue(item, events, nextIndex, "en");
          nextIndex = item.e + 1;
          return cue;
        })
      );
    });

    const result = await aiSegment({
      videoId: "video-coarse-captions",
      fromLang: "en",
      toLang: "zh-CN",
      chunkEvents: prepared.flatEvents,
      segApiSetting: { apiSlug: "openai" },
      apiSubtitle,
      docInfo: {},
      formatSubtitles: jest.fn(() => []),
      clearSegmentTranslation: false,
      setting: {},
    });

    expect(prepared.events).toEqual(rawEvents);
    expect(apiSubtitle.mock.calls[0][0].events).toEqual([
      { text: "The", start: 1200, end: 1800 },
      { text: "quick", start: 1800, end: 2800 },
      { text: "brown", start: 2800, end: 3800 },
      { text: "fox.", start: 3800, end: 4600 },
    ]);
    expect(result).toEqual([
      {
        start: 1200,
        end: 2800,
        text: "The quick",
        translation: "敏捷的狐狸",
        _si: 0,
        _ei: 1,
      },
      {
        start: 2800,
        end: 4600,
        text: "brown fox.",
        translation: "棕色狐狸。",
        _si: 2,
        _ei: 3,
      },
    ]);
  });

  test("leaves manually authored sentence-level captions unchanged", () => {
    const rawEvents = [
      {
        tStartMs: 1200,
        dDurationMs: 3400,
        segs: [{ utf8: "The quick brown fox." }],
      },
    ];

    expect(prepareTimedTextEvents(rawEvents).flatEvents).toEqual([
      { text: "The quick brown fox.", start: 1200, end: 4600 },
    ]);
  });

  test("caps coarse ASR words at the next event without overlaps or lost text", () => {
    const rawEvents = [
      {
        tStartMs: 0,
        dDurationMs: 6000,
        segs: [{ utf8: "one two six", acAsrConf: 0 }],
      },
      {
        tStartMs: 3000,
        dDurationMs: 1000,
        segs: [{ utf8: "next", acAsrConf: 0 }],
      },
    ];

    const { flatEvents } = prepareTimedTextEvents(rawEvents);

    expect(flatEvents).toEqual([
      { text: "one", start: 0, end: 1000 },
      { text: "two", start: 1000, end: 2000 },
      { text: "six", start: 2000, end: 3000 },
      { text: "next", start: 3000, end: 4000 },
    ]);
    expect(flatEvents.map((event) => event.text).join(" ")).toBe(
      "one two six next"
    );
    expect(
      flatEvents.every(
        (event, index) =>
          index === flatEvents.length - 1 ||
          event.end <= flatEvents[index + 1].start
      )
    ).toBe(true);
  });

  test("leaves word-level offsets unchanged", () => {
    const rawEvents = [
      {
        tStartMs: 2000,
        dDurationMs: 1500,
        segs: [
          { utf8: "hello", tOffsetMs: 0 },
          { utf8: "world.", tOffsetMs: 600 },
        ],
      },
    ];

    expect(prepareTimedTextEvents(rawEvents)).toMatchObject({
      events: rawEvents,
      flatEvents: [
        { text: "hello", start: 2000, end: 2600 },
        { text: "world.", start: 2600, end: 3500 },
      ],
    });
  });

  test.each([
    ["empty", { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "" }] }, []],
    [
      "line break",
      {
        tStartMs: 0,
        dDurationMs: 0,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      [],
    ],
    [
      "non-space text",
      {
        tStartMs: 0,
        dDurationMs: 1000,
        segs: [{ utf8: "今天我们测试" }],
      },
      [{ text: "今天我们测试", start: 0, end: 1000 }],
    ],
  ])("does not synthetically split %s segments", (_name, event, expected) => {
    expect(prepareTimedTextEvents([event]).flatEvents).toEqual(expected);
  });
});

describe("aiSegment recovery", () => {
  test("sends only speech events after timedtext preparation", async () => {
    const prepared = prepareTimedTextEvents([
      {
        tStartMs: 0,
        dDurationMs: 1500,
        segs: [
          { utf8: "Hello" },
          { utf8: " [Music]", tOffsetMs: 500 },
          { utf8: " world.", tOffsetMs: 900 },
        ],
      },
    ]);
    const apiSubtitle = jest.fn(({ events }) =>
      Promise.resolve([
        {
          start: events[0].start,
          end: events[events.length - 1].end,
          text: events.map((event) => event.text).join(" "),
          translation: "你好，世界。",
          _si: 0,
          _ei: events.length - 1,
        },
      ])
    );

    const result = await aiSegment({
      videoId: "video-non-speech",
      fromLang: "en",
      toLang: "zh-CN",
      chunkEvents: prepared.flatEvents,
      segApiSetting: { apiSlug: "openai" },
      apiSubtitle,
      docInfo: {},
      formatSubtitles: jest.fn(() => []),
      clearSegmentTranslation: false,
      setting: {},
    });

    expect(
      apiSubtitle.mock.calls[0][0].events.map((event) => event.text)
    ).toEqual(["Hello", "world."]);
    expect(result[0].text).toBe("Hello world.");
  });

  test("retries an uncovered tail once and falls back only for the remaining events", async () => {
    const events = Array.from({ length: 4 }, (_, index) => ({
      start: index * 1000,
      end: (index + 1) * 1000,
      text: `word-${index}`,
    }));
    const apiSubtitle = jest
      .fn()
      // 首次响应只覆盖 0，遗漏尾部超过整个 chunk 的一半。
      .mockResolvedValueOnce([
        { ...events[0], translation: "译文-0", _si: 0, _ei: 0 },
      ])
      // 尾部重试只再覆盖局部事件 0，剩余局部事件必须精确降级。
      .mockResolvedValueOnce([
        { ...events[1], translation: "译文-1", _si: 0, _ei: 0 },
      ]);
    const formatSubtitles = jest.fn((tailEvents) => [
      {
        start: tailEvents[0].start,
        end: tailEvents[tailEvents.length - 1].end,
        text: tailEvents.map((event) => event.text).join(" "),
        translation: "",
      },
    ]);

    const result = await aiSegment({
      videoId: "video-recovery",
      fromLang: "en",
      toLang: "zh-CN",
      chunkEvents: events,
      segApiSetting: { apiSlug: "openai" },
      apiSubtitle,
      docInfo: {},
      formatSubtitles,
      clearSegmentTranslation: false,
      setting: {},
    });

    expect(apiSubtitle).toHaveBeenCalledTimes(2);
    expect(apiSubtitle.mock.calls[1][0].events).toEqual(events.slice(1));
    expect(formatSubtitles).toHaveBeenCalledWith(events.slice(2), "en");
    expect(result.map(({ start, end }) => [start, end])).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 4000],
    ]);
    expect(result[1]).toMatchObject({ _si: 1, _ei: 1 });
  });
});

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
