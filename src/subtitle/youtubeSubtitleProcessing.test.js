import {
  cleanTimedText,
  formatSubtitles,
  genFlatEvents,
  normalizeTimedTextEvents,
  replaceReanchoredRange,
  splitEventsIntoChunks,
} from "./youtubeSubtitleProcessing.js";

jest.mock("../config", () => ({
  OPT_LANGS_SPEC_DEFAULT: new Map(),
  OPT_LANGS_TO_CODE: {
    microsoft: new Map(),
  },
  OPT_TRANS_MICROSOFT: "microsoft",
}));

jest.mock("../libs/log.js", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

describe("youtubeSubtitleProcessing", () => {
  test("cleans timedtext html, U+200B and duplicate whitespace", () => {
    expect(cleanTimedText(" <b>Hello</b>\u200B   world ")).toBe("Hello world");
  });

  test("keeps YouTube line-break control events during normalization", () => {
    const lineBreak = {
      aAppend: 1,
      tStartMs: 1000,
      dDurationMs: 0,
      segs: [{ utf8: "\n" }],
    };

    expect(normalizeTimedTextEvents([lineBreak])).toEqual([lineBreak]);
  });

  test("deduplicates repeated visible timedtext events", () => {
    const event = {
      tStartMs: 1000,
      dDurationMs: 500,
      segs: [{ utf8: "hello" }],
    };

    expect(normalizeTimedTextEvents([event, { ...event }])).toHaveLength(1);
  });

  test("replaces stale cues inside a reanchored incoming range in place", () => {
    const cue = (start, end, extra = {}) => ({ start, end, ...extra });
    const list = [
      cue(0, 900),
      cue(1000, 1800),
      cue(2500, 3000),
      cue(5000, 5800),
    ];
    const incoming = [
      cue(1000, 2000, { _reanchored: true }),
      cue(2000, 5000),
    ];

    replaceReanchoredRange(list, incoming);

    // 半开区间：范围内的失准草稿被清掉，恰好落在 endMs 的下一分块首句保留。
    expect(list).toEqual([cue(0, 900), cue(5000, 5800)]);
  });

  test("keeps the list untouched when incoming has no reanchored cues", () => {
    const list = [{ start: 1000, end: 2000 }];

    replaceReanchoredRange(list, [{ start: 500, end: 3000 }]);

    expect(list).toEqual([{ start: 1000, end: 2000 }]);
  });

  test("generates flat events with start and end timestamps", () => {
    const events = [
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [
          { utf8: "hello", tOffsetMs: 0 },
          { utf8: "world", tOffsetMs: 500 },
        ],
      },
    ];

    expect(genFlatEvents(events)).toEqual([
      { text: "hello", start: 1000, end: 1500 },
      { text: "world", start: 1500, end: 2000 },
    ]);
  });

  test("splits chunks on sentence boundary after target length", () => {
    const chunks = splitEventsIntoChunks(
      [
        { text: "hello", start: 0, end: 100 },
        { text: "world.", start: 100, end: 200 },
        { text: "again", start: 200, end: 300 },
      ],
      10
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].map((item) => item.text)).toEqual(["hello", "world."]);
  });

  test("reprocesses overlong space-separated subtitles with pause rules", () => {
    const flatEvents = Array.from({ length: 18 }, (_, index) => ({
      text: index === 0 ? "First," : `word${index}`,
      start: index * 100,
      end: index * 100 + 80,
    }));

    const subtitles = formatSubtitles(flatEvents, "en", {
      longSentenceThreshold: 20,
    });

    expect(subtitles.length).toBeGreaterThan(1);
    expect(subtitles[0].text).toContain("First,");
  });
});
