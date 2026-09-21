jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
  fnPolyfill: jest.fn(),
}));

jest.mock("@streamparser/json", () => ({
  JSONParser: jest.fn(),
}));

jest.mock("../libs/browser", () => ({
  isBuiltinAIAvailable: true,
  isBg: () => false,
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({}),
}));

import { apiTranslate } from "./index";
import { fetchData, fetchStream } from "../libs/fetch";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";

const getOpenAiApiSetting = () => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_xml_test",
  key: "test-key",
  model: "deepseek-v4-flash",
  useBatchFetch: true,
  useStream: false,
  batchInterval: 0,
  batchSize: 10,
  batchLength: 10000,
  fetchInterval: 0,
  fetchLimit: 1,
  httpTimeout: 1000,
});

describe("apiTranslate OpenAI XML", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("returns trText for non-stream batched OpenAI-compatible XML response", async () => {
    fetchData.mockResolvedValueOnce({
      id: "a729d491-11e8-4a8c-bb6a-c780329e1f99",
      object: "chat.completion",
      created: 1782580528,
      model: "deepseek-v4-flash",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content:
              '<root>\n    <t id="0" sourceLanguage="en">敏捷的棕色狐狸跳过了懒惰的狗。</t>\n</root>',
          },
          logprobs: null,
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 544,
        completion_tokens: 30,
        total_tokens: 574,
      },
    });

    const result = await apiTranslate({
      text: "The quick brown fox jumps over the lazy dog.",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getOpenAiApiSetting(),
      useCache: false,
      usePool: false,
    });

    expect(fetchStream).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchData.mock.calls[0][1].body).stream).toBe(false);
    expect(result).toMatchObject({
      trText: "敏捷的棕色狐狸跳过了懒惰的狗。",
      srLang: "en",
    });
  });
});
