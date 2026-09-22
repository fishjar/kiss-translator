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
  OPT_TRANS_ORCAROUTER,
  THINKING_API_REGISTRY,
  resolveApiPromptSettings,
} from "../config";
import { fetchData } from "../libs/fetch";

const getApiSetting = (update = {}) =>
  resolveApiPromptSettings({
    ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_ORCAROUTER),
    useStream: false,
    useBatchFetch: true,
    key: "sk-orca-test-key",
    fetchInterval: 0,
    fetchLimit: 1,
    httpTimeout: 1000,
    ...update,
  });

const mockOnce = () => {
  fetchData.mockResolvedValueOnce({
    id: "chatcmpl-orcarouter-test",
    object: "chat.completion",
    created: 1782580528,
    model: "gpt-5.4-mini-2026-03-17",
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

describe("OrcaRouter interface", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("ships a default endpoint, model list URL and model", () => {
    const api = DEFAULT_API_LIST.find(
      (item) => item.apiType === OPT_TRANS_ORCAROUTER
    );

    expect(api).toMatchObject({
      apiSlug: OPT_TRANS_ORCAROUTER,
      apiName: OPT_TRANS_ORCAROUTER,
      url: "https://api.orcarouter.ai/v1/chat/completions",
      modelListUrl: "https://api.orcarouter.ai/v1/models",
      model: "openai/gpt-5.4-mini",
    });
  });

  test("is registered as an AI engine with batch, context, stream and multi-key support", () => {
    expect(API_SPE_TYPES.builtin.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.ai.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.batch.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.context.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.stream.has(OPT_TRANS_ORCAROUTER)).toBe(true);
    expect(API_SPE_TYPES.machine.has(OPT_TRANS_ORCAROUTER)).toBe(false);
  });

  test("sends an OpenAI-compatible request with bearer auth and referer headers", async () => {
    mockOnce();

    await translate(getApiSetting());

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe("https://api.orcarouter.ai/v1/chat/completions");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer sk-orca-test-key",
      "Content-type": "application/json",
      "HTTP-Referer": "https://fishjar.github.io/kiss-translator/",
      "X-Title": "KISS Translator",
    });

    const body = JSON.parse(init.body);
    expect(body.model).toBe("openai/gpt-5.4-mini");
    expect(body.stream).toBe(false);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages.at(-1).role).toBe("user");
    // 该网关按 OpenAI 规范使用 max_completion_tokens
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
    expect(THINKING_API_REGISTRY[OPT_TRANS_ORCAROUTER].adapter).toBe("openai");

    mockOnce();
    await translate(
      getApiSetting({ thinkingMode: "enabled", thinkingEffort: "high" })
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body).reasoning_effort).toBe(
      "high"
    );

    fetchData.mockClear();
    mockOnce();
    await translate(getApiSetting({ thinkingMode: "disabled" }));
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

  test("does not send the OpenRouter-only reasoning object", async () => {
    mockOnce();

    await translate(
      getApiSetting({ thinkingMode: "enabled", thinkingEffort: "medium" })
    );

    const body = JSON.parse(fetchData.mock.calls[0][1].body);
    expect(body).not.toHaveProperty("reasoning");
    expect(body.reasoning_effort).toBe("medium");
  });

  test.each([
    ["auto", "_default", undefined],
    ["enabled", "_default", undefined],
    ["disabled", "none", "low"],
    ...["low", "medium", "high", "xhigh", "max"].map((effort) => [
      "enabled",
      effort,
      effort,
    ]),
  ])(
    "omits Astra temperature for %s/%s",
    async (thinkingMode, thinkingEffort, expected) => {
      mockOnce();
      await translate(
        normalizeApiThinkingSetting(
          getApiSetting({
            model: "gpt-6-astra",
            temperature: 0.7,
            thinkingMode,
            thinkingEffort,
          })
        )
      );
      const body = JSON.parse(fetchData.mock.calls[0][1].body);
      expect(body).not.toHaveProperty("temperature");
      if (expected === undefined) {
        expect(body).not.toHaveProperty("reasoning_effort");
      } else {
        expect(body.reasoning_effort).toBe(expected);
      }
    }
  );

  test.each([
    ["openai/gpt-6-astra", undefined],
    [" OPENAI/GPT-6-ASTRA ", undefined],
    ["openai/gpt-5.4-mini", 0.7],
    ["gpt-6-astra-pro", 0.7],
    ["gpt-6-astra-2026-03-01", 0.7],
    ["unknown-model", 0.7],
  ])(
    "applies temperature compatibility only to Astra aliases: %s",
    async (model, expected) => {
      mockOnce();
      await translate(
        getApiSetting({ model, temperature: 0.7, thinkingMode: "auto" })
      );
      const body = JSON.parse(fetchData.mock.calls[0][1].body);
      if (expected === undefined) {
        expect(body).not.toHaveProperty("temperature");
      } else {
        expect(body.temperature).toBe(expected);
      }
    }
  );

  test("preserves custom body overrides for Astra", async () => {
    mockOnce();
    await translate(
      normalizeApiThinkingSetting(
        getApiSetting({
          model: "openai/gpt-6-astra",
          temperature: 0.7,
          thinkingMode: "disabled",
          customBody: '{"temperature":0.3,"reasoning_effort":"high"}',
        })
      )
    );
    expect(JSON.parse(fetchData.mock.calls[0][1].body)).toMatchObject({
      temperature: 0.3,
      reasoning_effort: "high",
    });
  });
});
