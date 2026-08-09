import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  DEFAULT_API_TYPE,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_INTERACTIONS_URL,
  getGeminiThinkingDisableStrategy,
  getGeminiThinkingEfforts,
  getGeminiThinkingStrategy,
  getThinkingCapability,
  resolveThinkingStrategy,
  normalizeApiModelListUrls,
  OPT_TRANS_CLOUDFLAREAI,
  OPT_TRANS_DEEPSEEK,
  OPT_TRANS_EPHONEAI,
  OPT_TRANS_CEREBRAS,
  OPT_TRANS_CLAUDE,
  OPT_TRANS_GEMINI,
  OPT_TRANS_GEMINI_2,
  OPT_TRANS_ALIYUNBAILIAN,
  OPT_TRANS_MICROSOFT,
  OPT_TRANS_SILICONFLOW,
  OPT_TRANS_TENCENT,
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_ZAI,
} from "./api";

test("uses Tencent as the fallback default API", () => {
  expect(DEFAULT_API_TYPE).toBe(OPT_TRANS_TENCENT);
});

test("includes Microsoft in the built-in API list", () => {
  expect(
    DEFAULT_API_LIST.some((api) => api.apiType === OPT_TRANS_MICROSOFT)
  ).toBe(true);
});

test("all AI APIs define a thinking mode by default", () => {
  for (const apiType of API_SPE_TYPES.ai) {
    const api = DEFAULT_API_LIST.find((item) => item.apiType === apiType);
    expect(api).toBeDefined();
    expect(["auto", "enabled", "disabled"]).toContain(api.thinkingMode);
  }
});

test("keeps disabled as the initial thinking mode", () => {
  for (const apiType of API_SPE_TYPES.ai) {
    const api = DEFAULT_API_LIST.find((item) => item.apiType === apiType);
    expect(api.thinkingMode).toBe("disabled");
  }
});

describe("unified thinking capabilities", () => {
  test.each([
    ["gpt-5.6-sol", "low", "none", false],
    ["gpt-5.4-pro", "medium", "none", false],
    ["gpt-5.3-codex", "low", "none", false],
    ["gpt-5.1", "low", "none", false],
    ["gpt-5", "minimal", "none", false],
    ["unknown-model", "high", "none", false],
  ])(
    "normalizes OpenAI model %s to lowest and disabled strategies",
    (model, defaultEffort, disabled, fallback) => {
      expect(
        resolveThinkingStrategy({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "enabled",
        }).effort
      ).toBe(defaultEffort);
      expect(
        resolveThinkingStrategy({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "disabled",
        })
      ).toMatchObject({ effort: disabled, fallback });
    }
  );

  test("uses the OpenAI-compatible high/none baseline for unknown gateways", () => {
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_EPHONEAI,
        model: "provider/unknown-model",
        thinkingMode: "enabled",
        thinkingEffort: "xhigh",
      })
    ).toMatchObject({ action: "effort", effort: "high" });
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_EPHONEAI,
        model: "provider/unknown-model",
        thinkingMode: "disabled",
      })
    ).toMatchObject({ action: "effort", effort: "none" });
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_EPHONEAI,
        model: "provider/unknown-model",
        thinkingMode: "auto",
      }).action
    ).toBe("none");
  });

  test.each([
    [OPT_TRANS_DEEPSEEK, "deepseek"],
    [OPT_TRANS_XIAOMIMIMO, "deepseek"],
    [OPT_TRANS_ZAI, "deepseek"],
    [OPT_TRANS_ALIYUNBAILIAN, "aliyunbailian"],
    [OPT_TRANS_SILICONFLOW, "siliconflow"],
  ])("uses explicit thinking switches for %s", (apiType, protocol) => {
    expect(
      resolveThinkingStrategy({ apiType, thinkingMode: "auto" })
    ).toMatchObject({ action: "none" });
    expect(
      resolveThinkingStrategy({ apiType, thinkingMode: "enabled" })
    ).toMatchObject({ action: "enabled", capability: { protocol } });
    expect(
      resolveThinkingStrategy({ apiType, thinkingMode: "disabled" })
    ).toMatchObject({ action: "disabled", capability: { protocol } });
  });

  test("falls back to the lowest effort for mandatory reasoning models", () => {
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_CEREBRAS,
        model: "gpt-oss-120b",
        thinkingMode: "disabled",
      })
    ).toMatchObject({ action: "effort", effort: "none", fallback: false });
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_OPENROUTER,
        model: "google/gemini-3.5-flash",
        thinkingMode: "disabled",
        thinkingCapabilities: {
          model: "google/gemini-3.5-flash",
          supportedEfforts: ["high", "medium", "low", "minimal"],
          mandatory: true,
        },
      })
    ).toMatchObject({ action: "effort", effort: "minimal", fallback: true });
  });

  test("keeps Claude native and hides unsupported legacy models", () => {
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_CLAUDE,
        model: "claude-3-haiku-20240307",
      })
    ).toBeNull();
    expect(
      resolveThinkingStrategy({
        apiType: OPT_TRANS_CLAUDE,
        model: "claude-mythos-5",
        thinkingMode: "disabled",
      })
    ).toMatchObject({ action: "effort", effort: "low", fallback: true });
  });
});

test("OpenRouter uses the shared disabled thinking default", () => {
  const openrouter = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_OPENROUTER
  );

  expect(openrouter).toMatchObject({
    model: "openai/gpt-4o",
    thinkingMode: "disabled",
    thinkingEffort: "_default",
  });
});

test("Gemini uses stable Interactions while the model list stays on v1beta", () => {
  const gemini = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_GEMINI
  );

  expect(gemini).toMatchObject({
    url: GEMINI_INTERACTIONS_URL,
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

test("maps Gemini disabled thinking by protocol and model capability", () => {
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
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-3-pro-preview",
    })
  ).toEqual({ field: "thinkingLevel", value: "low", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3.6-flash",
    })
  ).toEqual({ field: "thinking_level", value: "minimal", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-2.5-flash-lite",
    })
  ).toEqual({ field: null, value: null, fallback: false });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI_2,
      model: "custom-model",
    })
  ).toEqual({ field: "reasoning_effort", value: "minimal", fallback: true });
  expect(
    getGeminiThinkingDisableStrategy({
      apiType: OPT_TRANS_GEMINI_2,
      model: "gemini-3.1-pro-preview",
    })
  ).toEqual({ field: "reasoning_effort", value: "minimal", fallback: true });
});

test("maps enabled Gemini thinking and normalizes unsupported efforts", () => {
  expect(
    getGeminiThinkingStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-2.5-flash-lite",
      thinkingMode: "enabled",
      thinkingEffort: "_default",
    })
  ).toEqual({ field: "thinkingBudget", value: -1, fallback: false });
  expect(
    getGeminiThinkingStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-2.5-pro",
      thinkingMode: "enabled",
      thinkingEffort: "medium",
    })
  ).toEqual({ field: "thinkingBudget", value: 8192, fallback: false });
  expect(
    getGeminiThinkingStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3-pro-preview",
      thinkingMode: "enabled",
      thinkingEffort: "medium",
    })
  ).toEqual({ field: "thinking_level", value: "high", fallback: false });
  expect(
    getGeminiThinkingStrategy({
      apiType: OPT_TRANS_GEMINI_2,
      model: "gemini-3.6-flash",
      thinkingMode: "enabled",
      thinkingEffort: "_default",
    })
  ).toEqual({ field: "reasoning_effort", value: "high", fallback: false });
});

test("keeps interface-default Gemini thinking free of extra parameters", () => {
  expect(
    getGeminiThinkingStrategy({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3.6-flash",
      thinkingMode: "auto",
      thinkingEffort: "high",
    })
  ).toEqual({ field: null, value: null, fallback: false });
});

test("filters native Gemini thinking efforts by model capability", () => {
  expect(
    getGeminiThinkingEfforts({
      apiType: OPT_TRANS_GEMINI,
      model: "gemini-3.1-pro-preview",
    }).map((item) => item.value)
  ).toEqual(["high", "medium", "low"]);
  expect(
    getGeminiThinkingEfforts({
      apiType: OPT_TRANS_GEMINI,
      model: "gemini-3-pro-preview",
    }).map((item) => item.value)
  ).toEqual(["high", "low"]);
  expect(
    getGeminiThinkingEfforts({
      apiType: OPT_TRANS_GEMINI,
      model: "gemini-3.1-flash-lite-image",
    }).map((item) => item.value)
  ).toEqual(["high", "minimal"]);
  expect(
    getGeminiThinkingEfforts({
      apiType: OPT_TRANS_GEMINI,
      model: "gemini-3.6-flash",
    }).map((item) => item.value)
  ).toEqual(["high", "medium", "low", "minimal"]);
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
