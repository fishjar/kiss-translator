import { handleTranslate } from "./trans";
import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  normalizeApiThinkingSetting,
  OPT_TRANS_API_ROUTE,
  THINKING_API_REGISTRY,
  resolveApiPromptSettings,
} from "../config";
import { fetchData } from "../libs/fetch";

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

const getApiSetting = (update = {}) =>
  resolveApiPromptSettings({
    ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_API_ROUTE),
    useStream: false,
    useBatchFetch: true,
    key: "api-route-test-key",
    fetchInterval: 0,
    fetchLimit: 1,
    httpTimeout: 1000,
    ...update,
  });

const mockOnce = () => {
  fetchData.mockResolvedValueOnce({
    id: "chatcmpl-api-route-test",
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

describe("API Route interface", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("ships a default endpoint, model list URL and model", () => {
    const api = DEFAULT_API_LIST.find(
      (item) => item.apiType === OPT_TRANS_API_ROUTE
    );

    expect(api).toMatchObject({
      apiSlug: OPT_TRANS_API_ROUTE,
      apiName: OPT_TRANS_API_ROUTE,
      url: "https://global.api-route.com/v1/chat/completions",
      modelListUrl: "https://global.api-route.com/v1/models",
      model: "deepseek-v4-flash",
    });
  });

  test("is registered as an AI engine with batch, context, stream and multi-key support", () => {
    expect(API_SPE_TYPES.builtin.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.ai.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.batch.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.context.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.stream.has(OPT_TRANS_API_ROUTE)).toBe(true);
    expect(API_SPE_TYPES.machine.has(OPT_TRANS_API_ROUTE)).toBe(false);
  });

  test("sends an OpenAI-compatible request with bearer authentication", async () => {
    mockOnce();

    await translate(getApiSetting());

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe("https://global.api-route.com/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer api-route-test-key",
      "Content-type": "application/json",
    });

    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages.at(-1).role).toBe("user");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body.max_completion_tokens).toBeGreaterThan(0);
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

  test("maps thinking settings to the reasoning_effort parameter", async () => {
    expect(THINKING_API_REGISTRY[OPT_TRANS_API_ROUTE].adapter).toBe("openai");
    const model = "gpt-5.5";

    mockOnce();
    await translate(
      getApiSetting({ model, thinkingMode: "enabled", thinkingEffort: "high" })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "high"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(
      normalizeApiThinkingSetting(
        getApiSetting({ model, thinkingMode: "disabled" })
      )
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "none"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(getApiSetting({ model, thinkingMode: "auto" }));
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
  });

  test("does not send reasoning parameters for the default model", async () => {
    mockOnce();

    await translate(
      normalizeApiThinkingSetting(
        getApiSetting({ thinkingMode: "enabled", thinkingEffort: "medium" })
      )
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  test("omits the generated temperature for Astra only", async () => {
    mockOnce();
    await translate(
      getApiSetting({
        model: "gpt-6-astra",
        temperature: 0.7,
        thinkingMode: "auto",
      })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "temperature"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(getApiSetting({ temperature: 0.7, thinkingMode: "auto" }));
    expect(JSON.parse(fetchData.mock.calls[0][1].body).temperature).toBe(0.7);
  });
});
