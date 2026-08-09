jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

import {
  buildSubtitleSystemPrompt,
  detectSubtitleProtocol,
  formatIndexSubtitleEvents,
  handleSubtitle,
} from "./trans";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_GEMINI,
  OPT_TRANS_OPENAI,
  defaultSubtitlePrompt,
} from "../config";
import { fetchData } from "../libs/fetch";
import { fetchStream } from "../libs/fetch";

const getApiSetting = (apiType) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === apiType),
  useStream: true,
  key: "test-key",
  model: "test-model",
  fetchInterval: 0,
  fetchLimit: 1,
  httpTimeout: 1000,
});

const events = [
  { start: 0, end: 1000, text: "hello" },
  { start: 1000, end: 2000, text: "world" },
];

describe("handleSubtitle", () => {
  beforeEach(() => {
    fetchData.mockResolvedValue({
      choices: [
        {
          message: {
            // 默认响应使用 boundary-v3 `{e,o,t}`，通用请求测试同时覆盖默认解析路径。
            content: JSON.stringify([
              { e: 1, o: "hello world", t: "你好世界" },
            ]),
          },
        },
      ],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("forces non-stream request even when API setting enables stream", async () => {
    await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    const init = fetchData.mock.calls[0][1];
    expect(JSON.parse(init.body).stream).toBe(false);
  });

  test("sends subtitle events as a pure JSON array without context wrappers", async () => {
    await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
      docInfo: { title: "测试标题", description: "测试简介" },
    });

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    const userContent = body.messages.find(
      (message) => message.role === "user"
    ).content;
    // 用户消息只保留事件 JSON；标题等动态上下文已经写入系统提示词。
    expect(JSON.parse(userContent)).toEqual([
      { id: 0, text: "hello" },
      { id: 1, text: "world" },
    ]);
  });

  test("sends sparse pauseMs on the event before a positive timeline gap", async () => {
    const pauseEvents = [
      { start: 0, end: 400, text: "Hello" },
      { start: 400, end: 800, text: "world!" },
      { start: 1650, end: 2200, text: "Good" },
    ];

    await handleSubtitle({
      events: pauseEvents,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    const userContent = body.messages.find(
      (message) => message.role === "user"
    ).content;
    expect(JSON.parse(userContent)).toEqual([
      { id: 0, text: "Hello" },
      { id: 1, text: "world!", pauseMs: 850 },
      { id: 2, text: "Good" },
    ]);
  });

  test("omits pauseMs for zero, negative and final-event gaps", () => {
    expect(
      formatIndexSubtitleEvents([
        { start: 0, end: 500, text: "one" },
        { start: 500, end: 1000, text: "two" },
        { start: 900, end: 1300, text: "three" },
      ])
    ).toEqual([
      { id: 0, text: "one" },
      { id: 1, text: "two" },
      { id: 2, text: "three" },
    ]);
  });

  test("keeps legacy p levels for old prompts and detects every protocol", () => {
    const pauseEvents = [
      { start: 0, end: 400, text: "Hello" },
      { start: 1250, end: 1800, text: "world" },
    ];
    const legacyPrompt = 'Use the "p" pause level 1-3 as a hint.';

    expect(formatIndexSubtitleEvents(pauseEvents, legacyPrompt)).toEqual([
      { id: 0, text: "Hello" },
      { id: 1, text: "world", p: 2 },
    ]);
    expect(detectSubtitleProtocol(legacyPrompt)).toBe("boundary-v2");
    const indexPrompt = '{"s":0,"e":1,"t":"text"}';
    expect(detectSubtitleProtocol(indexPrompt)).toBe("index-v1");
    expect(formatIndexSubtitleEvents(pauseEvents, indexPrompt)).toEqual([
      { id: 0, text: "Hello" },
      { id: 1, text: "world", p: 2 },
    ]);
    expect(detectSubtitleProtocol("WEBVTT\n00:00.000 --> 00:01.000")).toBe(
      "vtt-legacy"
    );
    expect(detectSubtitleProtocol(defaultSubtitlePrompt)).toBe("boundary-v3");
  });

  test("keeps raw timed events for VTT legacy prompts", async () => {
    const apiSetting = {
      ...getApiSetting(OPT_TRANS_OPENAI),
      subtitlePrompt: "Return WEBVTT with MM:SS.mmm timestamps and --> cues.",
    };

    await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting,
    });

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    const userContent = body.messages.find(
      (message) => message.role === "user"
    ).content;
    expect(JSON.parse(userContent)).toEqual(events);
  });

  test("parses default boundary-v3 anchors but rebuilds source text and timestamps", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([
              // 即使模型返回错误原文锚点，程序也必须按 e 游标重建最终原文。
              { e: 0, o: "wrong source", t: "你好" },
              { e: 1, o: "also wrong", t: "世界" },
            ]),
          },
        },
      ],
    });

    const result = await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    expect(result).toEqual([
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
        end: 2000,
        text: "world",
        translation: "世界",
        _si: 1,
        _ei: 1,
      },
    ]);
  });

  test("keeps the complete boundary-v3 prefix from a truncated JSON array", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: '[{"e":0,"t":"你好"}' } }],
    });

    const result = await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    expect(result).toEqual([
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

  test("parses OpenAI-compatible subtitle providers", async () => {
    const result = await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_DEEPSEEK),
    });

    expect(result).toEqual([
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

  test("uses Gemini response_format and retries incomplete interactions at minimum thinking", async () => {
    fetchData
      .mockResolvedValueOnce({
        status: "incomplete",
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: '[{"e":0,"t":"你"}' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "text",
                text: '[{"e":1,"o":"hello world","t":"你好世界"}]',
              },
            ],
          },
        ],
      });

    const result = await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: {
        ...getApiSetting(OPT_TRANS_GEMINI),
        useStream: false,
        thinkingMode: "enabled",
        thinkingEffort: "high",
      },
    });

    const firstBody = JSON.parse(fetchData.mock.calls[0][1].body);
    const retryBody = JSON.parse(fetchData.mock.calls[1][1].body);
    expect(firstBody.response_format).toEqual({
      type: "text",
      mime_type: "application/json",
    });
    expect(firstBody.generation_config.thinking_level).toBe("high");
    expect(retryBody.generation_config.thinking_level).toBe("low");
    expect(result).toEqual([
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

  test("streams subtitle sentences when callback is provided", async () => {
    async function* streamChunks() {
      yield JSON.stringify({
        choices: [
          {
            delta: {
              content: '[{"s":0,"e":0,"o":"hello","t":"你好"}',
            },
          },
        ],
      });
      yield JSON.stringify({
        choices: [
          {
            delta: {
              content: ',{"s":1,"e":1,"o":"world","t":"世界"}]',
            },
          },
        ],
      });
    }
    fetchStream.mockReturnValueOnce(streamChunks());

    const onSubtitleChunk = jest.fn();
    const result = await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
      onSubtitleChunk,
    });

    const init = fetchStream.mock.calls[0][1];
    expect(JSON.parse(init.body).stream).toBe(true);
    expect(onSubtitleChunk).toHaveBeenCalledWith({
      subtitles: [
        {
          start: 0,
          end: 1000,
          text: "hello",
          translation: "你好",
          _si: 0,
          _ei: 0,
        },
      ],
      isFinal: false,
    });
    expect(onSubtitleChunk).toHaveBeenCalledWith({
      subtitles: [
        {
          start: 1000,
          end: 2000,
          text: "world",
          translation: "世界",
          _si: 1,
          _ei: 1,
        },
      ],
      isFinal: false,
    });
    expect(result).toEqual([
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
        end: 2000,
        text: "world",
        translation: "世界",
        _si: 1,
        _ei: 1,
      },
    ]);
    expect(fetchData).not.toHaveBeenCalled();
  });

  test("keeps non-stream request when stream callback is missing", async () => {
    await handleSubtitle({
      events,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    expect(fetchStream).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  test("realigns drifted indices on the non-stream path", async () => {
    const driftEvents = Array.from({ length: 10 }, (_, i) => ({
      start: i * 1000,
      end: i * 1000 + 1000,
      text: `w${i}`,
    }));
    fetchData.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify([{ s: 4, e: 6, o: "w1 w2 w3", t: "译文" }]),
          },
        },
      ],
    });

    const result = await handleSubtitle({
      events: driftEvents,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    expect(result).toEqual([
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
    ]);
  });
});

describe("buildSubtitleSystemPrompt", () => {
  test("documents missing pauseMs as a zero-millisecond pause", () => {
    expect(defaultSubtitlePrompt).toContain(
      'If "pauseMs" is missing, treat it as 0 milliseconds'
    );
    expect(defaultSubtitlePrompt).not.toContain('the "p" (pause level 1-3)');
  });

  test("defines hard source-length limits and exact translation alignment", () => {
    // 默认提示词必须使用硬约束，避免模型把建议性的长度目标当作可忽略条件。
    expect(defaultSubtitlePrompt).toContain(
      "MUST contain no more than 15 words"
    );
    expect(defaultSubtitlePrompt).toContain(
      "MUST contain no more than 30 source characters"
    );
    expect(defaultSubtitlePrompt).toContain(
      'Build "o" first from the exact source span covered by the current "e"'
    );
    expect(defaultSubtitlePrompt).toContain(
      "Never merge two complete sentences into one subtitle segment"
    );
    expect(defaultSubtitlePrompt).toContain(
      '{"e":<last_word_id>, "o":"exact merged source text", "t":"translation"}'
    );
    expect(defaultSubtitlePrompt).toContain(
      'silently verify that every "e", "o", and "t" correspond one-to-one'
    );
    expect(defaultSubtitlePrompt).toContain(
      'Then translate only the current "o" into "t"'
    );
  });

  test("renders dynamic context before the cache signature is calculated", () => {
    expect(
      buildSubtitleSystemPrompt({
        subtitlePrompt:
          "{{title}}|{{description}}|{{summary}}|{{tone}}|{{glossary}}",
        tone: "formal",
        docInfo: {
          title: "Video title",
          description: "Video description",
          summary: "Video summary",
        },
        aiTerms: "Flow: 工作流",
      })
    ).toContain("Video title|Video description|Video summary|formal|-");
  });
});
