// Jest 27 resolves the package's ESM entry for imports; requireActual selects
// its equivalent CommonJS export so these tests exercise the real parser.
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);

const { TextDecoder, TextEncoder } = require("util");
global.TextEncoder = global.TextEncoder || TextEncoder;
global.TextDecoder = global.TextDecoder || TextDecoder;

import {
  createRealtimeStreamParser,
  createSSEParser,
  createStreamingSubtitleParser,
  getStreamDelta,
  parseStreamingSegments,
} from "./stream";
import {
  OPT_TRANS_CLAUDE,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_GEMINI,
  OPT_TRANS_ORCAROUTER,
} from "../config";

describe("createRealtimeStreamParser", () => {
  test("streams partial text from wrapped JSON objects without duplicates", () => {
    const parser = createRealtimeStreamParser();

    expect(parser.write('{"translations":[{"id":0,"text":"你')).toEqual([
      { id: 0, partialText: "你", isComplete: false },
    ]);
    expect(parser.write("")).toEqual([]);
    expect(parser.write('好","sourceLanguage":"zh"}]}')).toEqual([
      { id: 0, partialText: "你好", isComplete: false },
    ]);
  });

  test("supports root arrays and keeps segment ids independent", () => {
    const parser = createRealtimeStreamParser();

    expect(parser.write('[{"id":0,"text":"One')).toEqual([
      { id: 0, partialText: "One", isComplete: false },
    ]);
    expect(parser.write('"},{"id":1,"text":"Two')).toEqual([
      { id: 1, partialText: "Two", isComplete: false },
    ]);
    expect(parser.write('"}]')).toEqual([]);
  });

  test("decodes escaped JSON text across chunks", () => {
    const parser = createRealtimeStreamParser();

    expect(
      parser.write('{"translations":[{"id":0,"text":"Quote: \\\"x')
    ).toEqual([{ id: 0, partialText: 'Quote: "x', isComplete: false }]);
    expect(parser.write('\\\"\\nPath C:\\\\Temp \\u4F60')).toEqual([
      {
        id: 0,
        partialText: 'Quote: "x"\nPath C:\\Temp 你',
        isComplete: false,
      },
    ]);
    expect(parser.write('\\u597D"}]}')).toEqual([
      {
        id: 0,
        partialText: 'Quote: "x"\nPath C:\\Temp 你好',
        isComplete: false,
      },
    ]);
  });

  test("waits for an explicit id before streaming JSON text", () => {
    const parser = createRealtimeStreamParser();

    expect(parser.write('{"translations":[{"text":"orphan')).toEqual([]);
    expect(parser.write('","id":0}]}')).toEqual([]);
  });
});

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

  test("extracts OrcaRouter as an OpenAI-compatible stream", () => {
    const chunk = {
      choices: [{ delta: { content: "敏" }, finish_reason: null, index: 0 }],
      object: "chat.completion.chunk",
    };

    expect(getStreamDelta(chunk, OPT_TRANS_ORCAROUTER)).toBe("敏");
    expect(getStreamDelta({ choices: [] }, OPT_TRANS_ORCAROUTER)).toBe("");
  });

  test("extracts only text step deltas from Gemini interactions", () => {
    expect(
      getStreamDelta(
        {
          event_type: "step.delta",
          delta: { type: "text", text: "你好" },
        },
        OPT_TRANS_GEMINI
      )
    ).toBe("你好");
    expect(
      getStreamDelta(
        {
          event_type: "step.delta",
          delta: { type: "thought_summary", text: "reasoning" },
        },
        OPT_TRANS_GEMINI
      )
    ).toBe("");
    expect(
      getStreamDelta(
        {
          type: "step.delta",
          delta: { type: "text", text: "你好" },
        },
        OPT_TRANS_GEMINI
      )
    ).toBe("你好");
    expect(
      getStreamDelta(
        { event_type: "interaction.completed", interaction: {} },
        OPT_TRANS_GEMINI
      )
    ).toBe("");
  });

  test("turns Gemini terminal stream events into fallback errors", () => {
    expect(() =>
      getStreamDelta(
        {
          event_type: "interaction.status_update",
          status: "incomplete",
        },
        OPT_TRANS_GEMINI
      )
    ).toThrow("incomplete");
    expect(() =>
      getStreamDelta(
        { event_type: "error", error: { message: "bad request" } },
        OPT_TRANS_GEMINI
      )
    ).toThrow("bad request");
  });

  test("extracts only text deltas from Claude content_block_delta events", () => {
    expect(
      getStreamDelta(
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "你好" },
        },
        OPT_TRANS_CLAUDE
      )
    ).toBe("你好");
    // thinking_delta 无 .text 字段，自然排除
    expect(
      getStreamDelta(
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "推理过程" },
        },
        OPT_TRANS_CLAUDE
      )
    ).toBe("");
    expect(getStreamDelta({ type: "message_start" }, OPT_TRANS_CLAUDE)).toBe(
      ""
    );
    expect(getStreamDelta({ type: "message_stop" }, OPT_TRANS_CLAUDE)).toBe("");
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

  test("keeps boundary-v3 without anchors compatible with one shared boundary cursor", () => {
    const parser = createStreamingSubtitleParser(events, { fromLang: "en" });

    expect(
      parser.write('[{"e":0,"t":"你好"},{"e":2,"t":"世界又来了"}]')
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

  test("streams default boundary-v3 anchors with one shared boundary cursor", () => {
    const parser = createStreamingSubtitleParser(events, { fromLang: "en" });

    expect(
      // `o` 仅供模型自检；流式结果的原文仍按 e 游标从输入事件重建。
      parser.write(
        '[{"e":0,"o":"wrong source","t":"你好"},{"e":2,"o":"also wrong","t":"世界又来了"}]'
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

  describe("index realignment", () => {
    const driftEvents = Array.from({ length: 10 }, (_, i) => ({
      start: i * 1000,
      end: i * 1000 + 1000,
      text: `w${i}`,
    }));

    test("corrects drifted s/e times while _si/_ei keep raw values", () => {
      const parser = createStreamingSubtitleParser(driftEvents);

      expect(parser.write('[{"s":4,"e":6,"o":"w1 w2 w3","t":"译文"}]')).toEqual(
        [
          {
            start: 1000,
            end: 4000,
            text: "w1 w2 w3",
            translation: "译文",
            _si: 4,
            _ei: 6,
            _alignedSi: 1,
            _alignedEi: 3,
          },
        ]
      );
    });

    test("still deduplicates by raw s/e after realignment", () => {
      const parser = createStreamingSubtitleParser(driftEvents);

      expect(
        parser.write(
          '[{"s":4,"e":6,"o":"w1 w2 w3","t":"译文"},{"s":4,"e":6,"o":"w1 w2 w3","t":"译文"}]'
        )
      ).toHaveLength(1);
    });
  });
});
