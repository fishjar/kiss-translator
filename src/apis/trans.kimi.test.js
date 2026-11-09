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
  OPT_ALL_TRANS_TYPES,
  OPT_TRANS_KIMI,
  resolveApiPromptSettings,
  THINKING_API_REGISTRY,
} from "../config";
import { fetchData } from "../libs/fetch";

const KIMI_URL = "https://api.moonshot.cn/v1/chat/completions";

const getApiSetting = (update = {}) =>
  resolveApiPromptSettings(
    normalizeApiThinkingSetting({
      ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_KIMI),
      isDisabled: false,
      useStream: false,
      useBatchFetch: true,
      key: "kimi-test-key",
      fetchInterval: 0,
      fetchLimit: 1,
      httpTimeout: 1000,
      ...update,
    })
  );

const mockOnce = () => {
  fetchData.mockResolvedValueOnce({
    id: "chatcmpl-kimi-test",
    object: "chat.completion",
    model: "kimi-k2.6",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          // 思考内容在独立字段中返回，不能混入译文。
          reasoning_content: "先分析句子结构。",
          content:
            '<root>\n    <t id="0" sourceLanguage="en">敏捷的棕色狐狸跳过了懒惰的狗。</t>\n</root>',
        },
        finish_reason: "stop",
      },
    ],
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

const sentBody = () => {
  const [, init] = fetchData.mock.calls[0];
  return typeof init.body === "string" ? JSON.parse(init.body) : init.body;
};

describe("Kimi interface", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("ships the official endpoint, model list URL and a default model that can turn thinking off", () => {
    const api = DEFAULT_API_LIST.find(
      (item) => item.apiType === OPT_TRANS_KIMI
    );

    expect(OPT_ALL_TRANS_TYPES).toContain(OPT_TRANS_KIMI);
    expect(api).toMatchObject({
      apiSlug: OPT_TRANS_KIMI,
      apiName: OPT_TRANS_KIMI,
      url: KIMI_URL,
      modelListUrl: "https://api.moonshot.cn/v1/models",
      model: "kimi-k2.6",
      useBatchFetch: true,
      useStream: true,
      thinkingMode: "disabled",
    });
  });

  test.each(["builtin", "ai", "mulkeys", "batch", "context", "stream"])(
    "is registered in the %s engine set",
    (group) => {
      expect(API_SPE_TYPES[group].has(OPT_TRANS_KIMI)).toBe(true);
    }
  );

  test("registers a thinking adapter", () => {
    expect(THINKING_API_REGISTRY[OPT_TRANS_KIMI]).toBeDefined();
  });

  test("sends a Bearer request and ignores reasoning_content in the result", async () => {
    mockOnce();

    const result = await translate(getApiSetting());

    expect(fetchData).toHaveBeenCalledTimes(1);
    const [url, init] = fetchData.mock.calls[0];
    expect(url).toBe(KIMI_URL);
    expect(init.headers.Authorization).toBe("Bearer kimi-test-key");
    expect(result).toEqual([
      expect.objectContaining({
        result: ["敏捷的棕色狐狸跳过了懒惰的狗。", "en"],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("先分析句子结构");
  });

  test.each([
    "kimi-for-coding",
    "kimi-for-coding-highspeed",
    "k3",
    "k3-256k",
    "kimi-k2.6",
  ])(
    "%s turns thinking off explicitly and omits fixed sampling parameters",
    async (model) => {
      mockOnce();

      await translate(getApiSetting({ model, temperature: 0 }));

      const body = sentBody();
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body).not.toHaveProperty("reasoning_effort");
      expect(body).not.toHaveProperty("temperature");
      expect(body).not.toHaveProperty("top_p");
      expect(body.max_completion_tokens).toBe(20480);
    }
  );

  test.each(["k3.1-pro", "k3.1-pro-highspeed"])(
    "%s falls back to the lowest effort because it rejects disabled thinking",
    async (model) => {
      mockOnce();

      await translate(getApiSetting({ model }));

      expect(sentBody().thinking).toEqual({ type: "enabled" });
      expect(sentBody().reasoning_effort).toBe("low");
      expect(sentBody()).not.toHaveProperty("temperature");
    }
  );

  test("kimi-k2.6 can enable thinking", async () => {
    mockOnce();

    await translate(
      getApiSetting({ model: "kimi-k2.6", thinkingMode: "enabled" })
    );

    expect(sentBody().thinking).toEqual({ type: "enabled" });
    expect(sentBody()).not.toHaveProperty("temperature");
  });

  test("kimi-for-coding can enable thinking with an explicit effort", async () => {
    mockOnce();

    await translate(
      getApiSetting({
        model: "kimi-for-coding",
        thinkingMode: "enabled",
        thinkingEffort: "low",
      })
    );

    expect(sentBody().thinking).toEqual({ type: "enabled" });
    expect(sentBody().reasoning_effort).toBe("low");
  });

  test.each(["kimi-k2.7-code", "kimi-k2.7-code-highspeed"])(
    "%s never receives thinking controls because disabling it is rejected",
    async (model) => {
      for (const thinkingMode of ["disabled", "enabled"]) {
        fetchData.mockClear();
        mockOnce();

        await translate(getApiSetting({ model, thinkingMode }));

        const body = sentBody();
        expect(body).not.toHaveProperty("thinking");
        expect(body).not.toHaveProperty("reasoning_effort");
        expect(body).not.toHaveProperty("temperature");
      }
    }
  );

  test.each(["kimi-k3", "kimi-k3.1-pro", "kimi-k3.1-pro-highspeed"])(
    "%s uses reasoning_effort and falls back to low when thinking is off",
    async (model) => {
      for (const [thinkingMode, extra, effort] of [
        ["disabled", {}, "low"],
        ["enabled", {}, undefined],
        ["enabled", { thinkingEffort: "high" }, "high"],
      ]) {
        fetchData.mockClear();
        mockOnce();

        await translate(getApiSetting({ model, thinkingMode, ...extra }));

        const body = sentBody();
        expect(body.reasoning_effort).toBe(effort);
        expect(body).not.toHaveProperty("thinking");
        expect(body).not.toHaveProperty("temperature");
      }
    }
  );

  test("keeps the user temperature for moonshot-v1 models", async () => {
    mockOnce();

    await translate(
      getApiSetting({ model: "moonshot-v1-8k", temperature: 0.3 })
    );

    const body = sentBody();
    expect(body.temperature).toBe(0.3);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("reasoning_effort");
  });
});
