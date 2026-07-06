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

import { handleSubtitle } from "./trans";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_OPENAI,
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
            content: JSON.stringify([
              { s: 0, e: 1, o: "hello world", t: "你好世界" },
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
      },
    ]);
  });

  const runawayEvents = Array.from({ length: 200 }, (_, i) => ({
    start: i * 1000,
    end: i * 1000 + 1000,
    text: `w${i}`,
  }));
  // 持续压缩响应：每段 10 词只声称 7 个 id，模拟长枚举下的计数崩坏。
  const runawayBody = (count) =>
    Array.from({ length: count }, (_, k) => ({
      s: 7 * k,
      e: 7 * k + 6,
      o: Array.from({ length: 10 }, (_, j) => `w${k * 10 + j}`).join(" "),
      t: `译${k}`,
    }));

  test("reanchors a runaway response wholesale on the non-stream path", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(runawayBody(20)) } }],
    });

    const result = await handleSubtitle({
      events: runawayEvents,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
    });

    expect(result).toHaveLength(20);
    result.forEach((sub, k) => {
      expect(sub.start).toBe(k * 10 * 1000);
      expect(sub.end).toBe((k * 10 + 9) * 1000 + 1000);
      expect(sub._si).toBe(7 * k);
      expect(sub._reanchored).toBe(true);
    });
  });

  test("suppresses runaway streaming drafts and reanchors the final result", async () => {
    const body = runawayBody(16);
    async function* streamChunks() {
      for (let k = 0; k < body.length; k++) {
        const prefix = k === 0 ? "[" : ",";
        const suffix = k === body.length - 1 ? "]" : "";
        yield JSON.stringify({
          choices: [
            { delta: { content: prefix + JSON.stringify(body[k]) + suffix } },
          ],
        });
      }
    }
    fetchStream.mockReturnValueOnce(streamChunks());

    const onSubtitleChunk = jest.fn();
    const result = await handleSubtitle({
      events: runawayEvents,
      from: "en",
      to: "zh-CN",
      apiSetting: getApiSetting(OPT_TRANS_OPENAI),
      onSubtitleChunk,
    });

    // 第 10 段填满监测窗口即判失准，其后的草稿全部被抑制。
    expect(onSubtitleChunk).toHaveBeenCalledTimes(9);
    expect(result).toHaveLength(16);
    result.forEach((sub, k) => {
      expect(sub.start).toBe(k * 10 * 1000);
      expect(sub._reanchored).toBe(true);
    });
  });
});
