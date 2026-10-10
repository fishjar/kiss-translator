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
  OPT_TRANS_ATLASCLOUD,
  THINKING_API_REGISTRY,
  getThinkingCapability,
  resolveApiPromptSettings,
} from "../config";
import { fetchData } from "../libs/fetch";

const getApiSetting = (update = {}) =>
  resolveApiPromptSettings({
    ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_ATLASCLOUD),
    useStream: false,
    useBatchFetch: true,
    key: "apikey-atlas-test-key",
    fetchInterval: 0,
    fetchLimit: 1,
    httpTimeout: 1000,
    ...update,
  });

const mockOnce = () => {
  fetchData.mockResolvedValueOnce({
    id: "chatcmpl-atlascloud-test",
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

describe("Atlas Cloud interface", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("ships a default endpoint, model list URL and model", () => {
    const api = DEFAULT_API_LIST.find(
      (item) => item.apiType === OPT_TRANS_ATLASCLOUD
    );

    expect(api).toMatchObject({
      apiSlug: OPT_TRANS_ATLASCLOUD,
      apiName: OPT_TRANS_ATLASCLOUD,
      url: "https://api.atlascloud.ai/v1/chat/completions",
      modelListUrl: "https://api.atlascloud.ai/v1/models",
      model: "deepseek-ai/deepseek-v4-flash",
    });
  });

  test("is registered as an AI engine with batch, context, stream and multi-key support", () => {
    expect(API_SPE_TYPES.builtin.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.ai.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.batch.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.context.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.stream.has(OPT_TRANS_ATLASCLOUD)).toBe(true);
    expect(API_SPE_TYPES.machine.has(OPT_TRANS_ATLASCLOUD)).toBe(false);
  });

  test("sends an OpenAI-compatible request with bearer auth", async () => {
    mockOnce();

    await translate(getApiSetting());

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe("https://api.atlascloud.ai/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer apikey-atlas-test-key",
      "Content-type": "application/json",
    });

    const body = JSON.parse(init.body);
    expect(body.model).toBe("deepseek-ai/deepseek-v4-flash");
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

  test("offers only the efforts every Atlas Cloud model accepts, whatever the model name", () => {
    expect(THINKING_API_REGISTRY[OPT_TRANS_ATLASCLOUD].adapter).toBe("openai");

    // Names that look like OpenAI models must not unlock OpenAI-only efforts:
    // Atlas Cloud answers 400 to reasoning_effort none/minimal for gpt-5.5.
    for (const model of [
      "deepseek-ai/deepseek-v4-flash",
      "openai/gpt-5.5",
      "qwen/qwen3.5-plus",
    ]) {
      const capability = getThinkingCapability({
        apiType: OPT_TRANS_ATLASCLOUD,
        model,
      });
      expect(capability.adapter).toBe("openai");
      expect(capability.efforts.map((effort) => effort.value)).toEqual([
        "xhigh",
        "high",
      ]);
    }
  });

  test("maps thinking settings to reasoning_effort with only high or xhigh", async () => {
    for (const [setting, expected] of [
      [{ thinkingMode: "enabled", thinkingEffort: "high" }, "high"],
      [{ thinkingMode: "enabled", thinkingEffort: "xhigh" }, "xhigh"],
      // Thinking cannot be switched off for every model, so "disabled"
      // degrades to the lowest accepted effort instead of sending "none".
      [{ thinkingMode: "disabled" }, "high"],
    ]) {
      fetchData.mockClear();
      mockOnce();
      await translate(
        normalizeApiThinkingSetting(
          getApiSetting({ model: "openai/gpt-5.5", ...setting })
        )
      );
      expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
        expected
      );
    }

    fetchData.mockClear();
    mockOnce();
    await translate(getApiSetting({ thinkingMode: "auto" }));
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).not.toHaveProperty(
      "reasoning_effort"
    );
  });

  test("does not send the OpenRouter-only reasoning object", async () => {
    mockOnce();

    await translate(
      normalizeApiThinkingSetting(
        getApiSetting({ thinkingMode: "enabled", thinkingEffort: "high" })
      )
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("reasoning");
    expect(body.reasoning_effort).toBe("high");
  });
});
