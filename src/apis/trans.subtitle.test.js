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
});
