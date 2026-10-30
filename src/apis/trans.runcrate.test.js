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

import { handleTranslate } from "./trans";
import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  normalizeApiThinkingSetting,
  OPT_TRANS_RUNCRATE,
  THINKING_API_REGISTRY,
  resolveApiPromptSettings,
} from "../config";
import { fetchData } from "../libs/fetch";

const getApiSetting = (update = {}) =>
  resolveApiPromptSettings({
    ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_RUNCRATE),
    isDisabled: false,
    useStream: false,
    useBatchFetch: true,
    key: "runcrate-test-key",
    fetchInterval: 0,
    fetchLimit: 1,
    httpTimeout: 1000,
    ...update,
  });

const mockOnce = () => {
  fetchData.mockResolvedValueOnce({
    id: "chatcmpl-runcrate-test",
    object: "chat.completion",
    created: 1782580528,
    model: "deepseek-ai/DeepSeek-V4.1-Flash",
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
};

const translate = async (apiSetting) => {
  const result = [];
  for await (const item of handleTranslate(
    ["The quick brown fox jumps over the lazy dog."],
    {
      from: "en",
      to: "zh-CN",
      fromLang: "English",
      toLang: "Chinese",
      langMap: () => "",
      glossary: "",
      apiSetting,
      usePool: false,
    }
  )) {
    result.push(item);
  }
  return result;
};

describe("Runcrate interface", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("ships a default endpoint, model list URL and model", () => {
    const api = DEFAULT_API_LIST.find(
      (item) => item.apiType === OPT_TRANS_RUNCRATE
    );

    expect(api).toMatchObject({
      apiSlug: OPT_TRANS_RUNCRATE,
      apiName: OPT_TRANS_RUNCRATE,
      url: "https://api.runcrate.ai/v1/chat/completions",
      modelListUrl: "https://api.runcrate.ai/v1/models",
      model: "deepseek-ai/DeepSeek-V4.1-Flash",
    });
  });

  test("is registered as an AI engine with batch, context, stream and multi-key support", () => {
    expect(API_SPE_TYPES.builtin.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.ai.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.batch.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.context.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.stream.has(OPT_TRANS_RUNCRATE)).toBe(true);
    expect(API_SPE_TYPES.machine.has(OPT_TRANS_RUNCRATE)).toBe(false);
  });

  test("sends an OpenAI-compatible request with bearer auth", async () => {
    mockOnce();

    await translate(getApiSetting());

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe("https://api.runcrate.ai/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer runcrate-test-key",
      "Content-type": "application/json",
    });

    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-ai/DeepSeek-V4.1-Flash");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages.at(-1).role).toBe("user");
  });

  test("parses the OpenAI-compatible response body", async () => {
    mockOnce();

    const result = await translate(getApiSetting());

    expect(result).toEqual([
      {
        id: 0,
        result: ["敏捷的棕色狐狸跳过了懒惰的狗。", "en"],
      },
    ]);
  });

  test("maps DeepSeek V4.1 Flash thinking settings to reasoning_effort", async () => {
    expect(THINKING_API_REGISTRY[OPT_TRANS_RUNCRATE].adapter).toBe("openai");

    mockOnce();
    await translate(
      getApiSetting({ thinkingMode: "enabled", thinkingEffort: "high" })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "high"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(
      normalizeApiThinkingSetting(getApiSetting({ thinkingMode: "disabled" }))
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "none"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(getApiSetting({ thinkingMode: "auto" }));
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
  });

  test("does not send reasoning parameters for models without a known control", async () => {
    mockOnce();

    await translate(
      normalizeApiThinkingSetting(
        getApiSetting({
          model: "zai-org/GLM-5.3-Flash",
          thinkingMode: "enabled",
          thinkingEffort: "high",
        })
      )
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
