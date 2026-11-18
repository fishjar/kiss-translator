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
import { getBuiltinServiceDefinition } from "../builtin-plugins/definitions";
import { clearAllBatchQueue } from "../libs/batchQueue";

const getOpenAiApiSetting = () => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_xml_test",
  key: "test-key",
  model: "deepseek-v4-flash",
  useBatchFetch: true,
  batchUserPrompt: "{{segments}}",
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
    jest.restoreAllMocks();
    clearAllBatchQueue();
  });

  test("splits queued paragraphs at the declared eight-item limit", async () => {
    const definition = getBuiltinServiceDefinition(OPT_TRANS_OPENAI);
    const apiSetting = {
      ...getOpenAiApiSetting(),
      apiSlug: "limited-batch-test",
      batchSize: 20,
      batchInterval: 20,
      batchConcurrency: 1,
      provider: {
        ...definition,
        apiVersion: 1,
        capabilities: {
          ...definition.capabilities,
          translate: {
            ...definition.capabilities.translate,
            batch: { supported: true, maxItems: 8 },
          },
        },
      },
    };
    const sizes = [];
    jest
      .spyOn(require("./trans"), "handleTranslate")
      .mockImplementation(async (texts) => {
        sizes.push(texts.length);
        return texts.map(() => "译文");
      });
    const results = await Promise.all(
      Array.from({ length: 17 }, (_, i) =>
        apiTranslate({
          text: `Source paragraph ${i}.`,
          fromLang: "en",
          toLang: "zh-CN",
          apiSetting,
          useCache: false,
          usePool: false,
        })
      )
    );
    expect(sizes).toEqual([8, 8, 1]);
    expect(results.every((r) => r.trText === "译文")).toBe(true);
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
