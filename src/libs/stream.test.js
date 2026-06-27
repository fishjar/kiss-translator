jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

import {
  createSSEParser,
  createStreamingSubtitleParser,
  getStreamDelta,
  parseStreamingSegments,
} from "./stream";
import { OPT_TRANS_EPHONEAI } from "../config";

describe("createSSEParser", () => {
  test("parses data fields with or without a following space", () => {
    const parse = createSSEParser();

    expect([...parse("data: hello\n\n")]).toEqual(["hello"]);
    expect([...parse("data:world\n\n")]).toEqual(["world"]);
  });

  test("keeps incomplete frames until the blank-line boundary arrives", () => {
    const parse = createSSEParser();

    expect([...parse("data: partial")]).toEqual([]);
    expect([...parse("\n\n")]).toEqual(["partial"]);
  });

  test("supports CRLF and multi-line data frames", () => {
    const parse = createSSEParser();

    expect([...parse("data: one\r\ndata: two\r\n\r\n")]).toEqual(["one\ntwo"]);
  });

  test("filters DONE frames", () => {
    const parse = createSSEParser();

    expect([...parse("data: [DONE]\n\n")]).toEqual([]);
  });
});

describe("getStreamDelta", () => {
  test("extracts ePhoneAI as an OpenAI-compatible stream", () => {
    const chunk = {
      choices: [{ delta: { content: "hello" } }],
    };

    expect(getStreamDelta(chunk, OPT_TRANS_EPHONEAI)).toBe("hello");
  });
});

describe("parseStreamingSegments", () => {
  test("parses XML segments and skips processed ids", () => {
    const processedIds = new Set([0]);
    const result = [
      ...parseStreamingSegments(
        '<root><t id="0" sourceLanguage="en">你好</t><t id="1" sourceLanguage="en">世界</t></root>',
        processedIds
      ),
    ];

    expect(result).toEqual([{ id: 1, translation: ["世界", "en"] }]);
  });

  test("parses complete LINE segments only", () => {
    const result = [
      ...parseStreamingSegments("0 | 第一行<br>第二行\n1 | 未完成", new Set()),
    ];

    expect(result).toEqual([{ id: 0, translation: ["第一行\n第二行", ""] }]);
  });
});

describe("createStreamingSubtitleParser", () => {
  const events = [
    { start: 0, end: 1000, text: "hello" },
    { start: 1000, end: 2000, text: "world" },
    { start: 2000, end: 3000, text: "again" },
  ];

  test("maps completed subtitle objects to cue timestamps", () => {
    const parser = createStreamingSubtitleParser(events);

    expect(
      parser.write('[{"s":0,"e":1,"o":"hello world","t":"你好世界"}')
    ).toEqual([
      {
        start: 0,
        end: 2000,
        text: "hello world",
        translation: "你好世界",
        _si: 0,
        _ei: 1,
      },
    ]);
  });

  test("keeps incomplete subtitle object until it is closed", () => {
    const parser = createStreamingSubtitleParser(events);

    expect(parser.write('[{"s":0,"e":')).toEqual([]);
    expect(parser.write('0,"o":"hello","t":"你好"}')).toEqual([
      {
        start: 0,
        end: 1000,
        text: "hello",
        translation: "你好",
        _si: 0,
        _ei: 0,
      },
    ]);
  });

  test("skips markdown fence and parses multiple objects", () => {
    const parser = createStreamingSubtitleParser(events);

    expect(
      parser.write(
        '```json\n[{"s":0,"e":0,"o":"hello","t":"你好"},{"s":1,"e":2,"o":"world again","t":"世界又来了"}]'
      )
    ).toEqual([
      {
        start: 0,
        end: 1000,
        text: "hello",
        translation: "你好",
        _si: 0,
        _ei: 0,
      },
      {
        start: 1000,
        end: 3000,
        text: "world again",
        translation: "世界又来了",
        _si: 1,
        _ei: 2,
      },
    ]);
  });

  test("deduplicates repeated objects by source index range", () => {
    const parser = createStreamingSubtitleParser(events);

    expect(
      parser.write(
        '[{"s":0,"e":0,"o":"hello","t":"你好"},{"s":0,"e":0,"o":"hello","t":"你好"}]'
      )
    ).toHaveLength(1);
    expect(parser.end()).toEqual([]);
  });
});
