jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
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
});
