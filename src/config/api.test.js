import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  DEFAULT_API_TYPE,
  GEMINI_GENERATE_CONTENT_URL,
  getGeminiThinkingDisableStrategy,
  normalizeApiModelListUrls,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
} from "./api";

test("uses Tencent as the fallback default API", () => {
  expect(DEFAULT_API_TYPE).toBe(OPT_TRANS_TENCENT);
});

test("temporarily excludes Microsoft from the built-in API list", () => {
  expect(
    DEFAULT_API_LIST.some((api) => api.apiType === OPT_TRANS_MICROSOFT)
  ).toBe(false);
});

test("all AI APIs define a thinking mode by default", () => {
  for (const apiType of API_SPE_TYPES.ai) {
    const api = DEFAULT_API_LIST.find((item) => item.apiType === apiType);
    expect(api).toBeDefined();
    expect(["auto", "enabled", "disabled"]).toContain(api.thinkingMode);
  }
});

test("Gemini uses the generateContent endpoint while the model list stays on v1beta", () => {
  const gemini = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_GEMINI
  );

  expect(gemini).toMatchObject({
    url: GEMINI_GENERATE_CONTENT_URL,
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    model: "gemini-3.6-flash",
    thinkingMode: "disabled",
  });
});

test("Gemini2 defaults to a model that can disable thinking", () => {
  const gemini2 = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_GEMINI_2
  );

  expect(gemini2).toMatchObject({
    model: "gemini-3.6-flash",
    thinkingMode: "disabled",
  });
});

test("maps Gemini disabled thinking by API URL and model capability", () => {
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: "https://proxy.example.com/v1/models/{{model}}:generateContent",
      model: "gemini-2.5-pro",
    })
  ).toEqual({ field: "thinkingBudget", value: 128, fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: "https://proxy.example.com/v1/models/{{model}}:generateContent",
      model: "gemini-2.5-flash",
    })
  ).toEqual({ field: "thinkingBudget", value: 0, fallback: false });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: "https://proxy.example.com/v1/models/{{model}}:generateContent",
      model: "gemini-3.5-flash",
    })
  ).toEqual({ field: "thinkingLevel", value: "low", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: "https://proxy.example.com/v1/models/{{model}}:generateContent",
      model: "custom-model",
    })
  ).toEqual({ field: "thinkingLevel", value: "low", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI_2,
      model: "custom-model",
    })
  ).toEqual({ field: "reasoning_effort", value: "low", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI_2,
      model: "gemini-3.5-flash",
    })
  ).toEqual({ field: "reasoning_effort", value: "low", fallback: true });
});

describe("normalizeApiModelListUrls", () => {
  test("旧数据缺少 modelListUrl 时按接口类型补充默认模型列表 URL", () => {
    const transApis = [
      {
        apiSlug: "DeepSeek",
        apiType: OPT_TRANS_DEEPSEEK,
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).not.toBe(transApis);
    expect(nextApis[0]).toEqual({
      apiSlug: "DeepSeek",
      apiType: OPT_TRANS_DEEPSEEK,
      modelListUrl: "https://api.deepseek.com/models",
    });
  });

  test("用户已明确保存为空字符串时不覆盖 modelListUrl", () => {
    const transApis = [
      {
        apiSlug: "OpenAI",
        apiType: OPT_TRANS_OPENAI,
        modelListUrl: "",
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).toBe(transApis);
    expect(nextApis[0].modelListUrl).toBe("");
  });

  test("没有官方默认模型列表接口的旧数据补为空字符串", () => {
    const transApis = [
      {
        apiSlug: "CloudflareAI",
        apiType: OPT_TRANS_CLOUDFLAREAI,
      },
    ];

    const nextApis = normalizeApiModelListUrls(transApis);

    expect(nextApis).not.toBe(transApis);
    expect(nextApis[0].modelListUrl).toBe("");
  });

  test("没有需要补充的字段时保持原数组引用", () => {
    const transApis = [
      {
        apiSlug: "DeepSeek",
        apiType: OPT_TRANS_DEEPSEEK,
        modelListUrl: "https://custom.example.com/models",
      },
    ];

    expect(normalizeApiModelListUrls(transApis)).toBe(transApis);
  });
});
