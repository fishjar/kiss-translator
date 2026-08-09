import fs from "fs";
import path from "path";
import {
  cleanTimedText,
  formatSubtitles,
  prepareTimedTextEvents,
  runBuiltinSegmentation,
  splitEventsIntoChunks,
} from "./youtubeSubtitleProcessing.js";
import { isNonSpeechSegment } from "./subtitleTextClassification.js";

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
  test.each([
    ["[Music]", true],
    ["[music]", true],
    ["[Laughter]", true],
    ["[Music] [Applause]", true],
    [">> [music]", true],
    ["Use [React] in this project", false],
    ["normal dialogue", false],
  ])("classifies non-speech segment %s", (text, expected) => {
    expect(isNonSpeechSegment(text)).toBe(expected);
  });

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

    expect(prepareTimedTextEvents([lineBreak]).events).toEqual([lineBreak]);
  });

  test("deduplicates repeated visible timedtext events", () => {
    const event = {
      tStartMs: 1000,
      dDurationMs: 500,
      segs: [{ utf8: "hello" }],
    };

    expect(prepareTimedTextEvents([event, { ...event }]).events).toHaveLength(
      1
    );
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

    expect(prepareTimedTextEvents(events).flatEvents).toEqual([
      { text: "hello", start: 1000, end: 1500 },
      { text: "world", start: 1500, end: 2000 },
    ]);
  });

  test("filters a non-speech segment inside a mixed event and keeps its time gap", () => {
    const prepared = prepareTimedTextEvents([
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [
          { utf8: "hello" },
          { utf8: " [Music]", tOffsetMs: 300 },
          { utf8: " world", tOffsetMs: 500 },
        ],
      },
    ]);

    expect(prepared.events[0].segs).toHaveLength(3);
    expect(prepared.flatEvents).toEqual([
      { text: "hello", start: 1000, end: 1300 },
      { text: "world", start: 1500, end: 2000 },
    ]);
    expect(prepared.filteredNonSpeechCount).toBe(1);
  });

  test("filters non-speech without dropping following speech when a newline timestamp moves backwards", () => {
    const rawEvents = [
      {
        tStartMs: 1000,
        dDurationMs: 1000,
        segs: [{ utf8: "[Music]", tOffsetMs: 500 }],
      },
      {
        tStartMs: 1490,
        dDurationMs: 100,
        aAppend: 1,
        segs: [{ utf8: "\n" }],
      },
      {
        tStartMs: 1600,
        dDurationMs: 400,
        segs: [{ utf8: "hello" }],
      },
    ];

    expect(prepareTimedTextEvents(rawEvents).flatEvents).toEqual([
      { text: "hello", start: 1600, end: 2000 },
    ]);
  });

  test.each(["rule", "statistical"])(
    "%s segmentation excludes non-speech cues",
    (mode) => {
      const prepared = prepareTimedTextEvents([
        {
          tStartMs: 0,
          dDurationMs: 500,
          segs: [{ utf8: "Hello" }],
        },
        {
          tStartMs: 500,
          dDurationMs: 400,
          segs: [{ utf8: "[Music]" }],
        },
        {
          tStartMs: 900,
          dDurationMs: 600,
          segs: [{ utf8: "world." }],
        },
      ]);
      const cues = runBuiltinSegmentation({
        ...prepared,
        fromLang: "en",
        mode,
      });

      expect(cues).not.toHaveLength(0);
      expect(cues.every((cue) => !isNonSpeechSegment(cue.text))).toBe(true);
      expect(cues.map((cue) => cue.text).join(" ")).toContain("Hello world.");
    }
  );

  test("restores complete rule-segmented sentences around music markers in the real sample", () => {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "testdata/subtitle-samples/english-asr-zero-pause.json"
        ),
        "utf8"
      )
    );
    const prepared = prepareTimedTextEvents(source.events || source);
    const cues = runBuiltinSegmentation({
      ...prepared,
      fromLang: "en",
      mode: "rule",
      // 本断言只验证音乐标记不再制造边界，避免被独立的超长句二次切分规则干扰。
      longSentenceThreshold: 1000,
    });

    expect(prepared.filteredNonSpeechCount).toBe(13);
    expect(cues).toEqual(
      expect.arrayContaining([
        {
          start: 24840,
          end: 33800,
          text: "You have characters, locations, shots, dialogue, and somehow all of those pieces need to stay organized while you're building the story.",
          translation: "",
        },
        {
          start: 33800,
          end: 36360,
          text: "This is where Storyboard Studio comes in.",
          translation: "",
        },
      ])
    );
    expect(cues.every((cue) => !/\[music\]/i.test(cue.text))).toBe(true);
  });

  test("splits chunks on sentence boundary after target length", () => {
    const chunks = splitEventsIntoChunks(
      [
        { text: "hello", start: 0, end: 100 },
        { text: "world.", start: 100, end: 200 },
        { text: "again", start: 200, end: 300 },
      ],
      12
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0].map((item) => item.text)).toEqual(["hello", "world."]);
  });

  test("treats chunkLength as a hard limit except for one oversized event", () => {
    const chunks = splitEventsIntoChunks(
      [
        { text: "1234", start: 0, end: 100 },
        { text: "5678", start: 100, end: 200 },
        { text: "oversized", start: 200, end: 300 },
      ],
      5
    );

    expect(chunks.map((chunk) => chunk.map((event) => event.text))).toEqual([
      ["1234"],
      ["5678"],
      ["oversized"],
    ]);
  });

  test("splits the zero-pause ASR sample into five chunks at the new default", () => {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "testdata/subtitle-samples/english-asr-zero-pause.json"
        ),
        "utf8"
      )
    );
    const prepared = prepareTimedTextEvents(source.events || source);

    const chunks = splitEventsIntoChunks(prepared.flatEvents, 1000);

    expect(chunks).toHaveLength(5);
    // 除单个超限事件外，分块器必须继续遵守 1000 字符硬上限。
    expect(
      chunks.every(
        (chunk) =>
          chunk.reduce(
            (length, event) => length + String(event.text || "").length,
            0
          ) <= 1000
      )
    ).toBe(true);
  });

  test("falls back to rule segmentation when statistical output is empty", () => {
    const flatEvents = [{ text: "hello.", start: 0, end: 1000 }];

    expect(
      runBuiltinSegmentation({
        events: [],
        flatEvents,
        fromLang: "en",
        mode: "statistical",
      })
    ).toEqual([{ text: "hello.", start: 0, end: 1000, translation: "" }]);
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

  test.each([
    [
      "zh-CN",
      "chinese-asr.json",
      ["今天我们测试中文字幕断句。", "这里不应该插入多余空格。"],
    ],
    [
      "ja",
      "japanese-asr.json",
      ["今日は字幕の区切りを確認します。", "自然な表示になるでしょうか。"],
    ],
  ])(
    "splits %s rule subtitles at native sentence punctuation",
    (lang, file, texts) => {
      const source = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "testdata/subtitle-samples", file),
          "utf8"
        )
      );
      const prepared = prepareTimedTextEvents(source.events || source);

      expect(
        runBuiltinSegmentation({
          ...prepared,
          fromLang: lang,
          mode: "rule",
        }).map((cue) => cue.text)
      ).toEqual(texts);
    }
  );

  test("splits no-space-language subtitles at a long pause without punctuation", () => {
    // 对无标点的自动字幕，超过一秒的静音仍应形成明确边界。
    expect(
      formatSubtitles(
        [
          { text: "第一段字幕", start: 0, end: 1000 },
          { text: "第二段字幕", start: 2200, end: 3200 },
        ],
        "zh-CN"
      )
    ).toEqual([
      { text: "第一段字幕", start: 0, end: 1000 },
      { text: "第二段字幕", start: 2200, end: 3200 },
    ]);
  });
});
