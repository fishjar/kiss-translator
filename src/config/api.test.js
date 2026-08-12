import {
  API_SPE_TYPES,
  DEFAULT_API_LIST,
  DEFAULT_API_TYPE,
  OPT_LANGS_FROM_SPEC,
  OPT_LANGS_TO_SPEC,
  GEMINI_GENERATE_CONTENT_URL,
  GEMINI_INTERACTIONS_URL,
  getGeminiThinkingEfforts,
  getOpenRouterThinkingCapability,
  getThinkingCapability,
  isThinkingMinimumFallback,
  normalizeThinkingSettings,
  normalizeApiThinkingSettings,
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
  OPT_TRANS_OPENAI,
  OPT_TRANS_OPENCODEGO,
  OPT_TRANS_OPENROUTER,
  OPT_TRANS_QWENMT,
  OPT_TRANS_XIAOMIMIMO,
  OPT_TRANS_YANDEX,
  OPT_TRANS_YANDEXFREE,
  OPT_TRANS_ZAI,
} from "./api";

test("uses Microsoft as the fallback default API", () => {
  expect(DEFAULT_API_TYPE).toBe(OPT_TRANS_MICROSOFT);
});

test("includes Microsoft in the built-in API list", () => {
  expect(
    DEFAULT_API_LIST.some((api) => api.apiType === OPT_TRANS_MICROSOFT)
  ).toBe(true);
});

test("configures the official and free Yandex translators", () => {
  const yandex = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_YANDEX
  );
  const yandexFree = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_YANDEXFREE
  );

  expect(yandex).toMatchObject({
    apiSlug: OPT_TRANS_YANDEX,
    url: "https://translate.api.cloud.yandex.net/translate/v2/translate",
    folderId: "",
    useBatchFetch: true,
  });
  expect(yandexFree).toMatchObject({
    apiSlug: OPT_TRANS_YANDEXFREE,
    useBatchFetch: false,
  });
  expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_YANDEX)).toBe(true);
  expect(API_SPE_TYPES.batch.has(OPT_TRANS_YANDEX)).toBe(true);
  expect(API_SPE_TYPES.machine.has(OPT_TRANS_YANDEXFREE)).toBe(true);
  expect(API_SPE_TYPES.batch.has(OPT_TRANS_YANDEXFREE)).toBe(false);
  expect(API_SPE_TYPES.darkIcon.has(OPT_TRANS_YANDEX)).toBe(false);
  expect(API_SPE_TYPES.darkIcon.has(OPT_TRANS_YANDEXFREE)).toBe(false);
  expect(OPT_LANGS_TO_SPEC[OPT_TRANS_YANDEX].get("zh-CN")).toBe("zh");
  expect(OPT_LANGS_TO_SPEC[OPT_TRANS_YANDEX].get("zh-TW")).toBe("zh");
  expect(OPT_LANGS_TO_SPEC[OPT_TRANS_YANDEX].get("nb")).toBe("no");
  expect(OPT_LANGS_FROM_SPEC[OPT_TRANS_YANDEXFREE].get("auto")).toBe("");
});

test("configures QwenMT as a single-request machine translation API", () => {
  const qwenMt = DEFAULT_API_LIST.find(
    (api) => api.apiType === OPT_TRANS_QWENMT
  );

  expect(qwenMt).toMatchObject({
    apiSlug: OPT_TRANS_QWENMT,
    apiType: OPT_TRANS_QWENMT,
    url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-mt-flash",
    useBatchFetch: false,
    useStream: false,
  });
  expect(API_SPE_TYPES.machine.has(OPT_TRANS_QWENMT)).toBe(true);
  expect(API_SPE_TYPES.mulkeys.has(OPT_TRANS_QWENMT)).toBe(true);
  expect(API_SPE_TYPES.ai.has(OPT_TRANS_QWENMT)).toBe(false);
  expect(API_SPE_TYPES.batch.has(OPT_TRANS_QWENMT)).toBe(false);
  expect(API_SPE_TYPES.context.has(OPT_TRANS_QWENMT)).toBe(false);
  expect(API_SPE_TYPES.stream.has(OPT_TRANS_QWENMT)).toBe(false);
  expect(OPT_LANGS_FROM_SPEC[OPT_TRANS_QWENMT].get("auto")).toBe("auto");
  expect(OPT_LANGS_TO_SPEC[OPT_TRANS_QWENMT].get("zh-TW")).toBe(
    "Traditional Chinese"
  );
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
  test.each(["gpt-5.6-sol", "gpt-5.4-pro", "gpt-5.3-codex", "gpt-5"])(
    "keeps the OpenAI interface default for model %s",
    (model) => {
      expect(
        normalizeThinkingSettings({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "enabled",
        }).thinkingEffort
      ).toBeNull();
      expect(
        normalizeThinkingSettings({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "disabled",
        })
      ).toEqual({ thinkingMode: "disabled", thinkingEffort: "none" });
    }
  );

  test.each(["gpt-5.1", "gpt-5.1-2025-11-13"])(
    "enables GPT-5.1 with its lowest non-disabled effort for model %s",
    (model) => {
      expect(
        normalizeThinkingSettings({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "enabled",
        })
      ).toEqual({ thinkingMode: "enabled", thinkingEffort: "low" });
      expect(
        normalizeThinkingSettings({
          apiType: OPT_TRANS_OPENAI,
          model,
          thinkingMode: "disabled",
        })
      ).toEqual({ thinkingMode: "disabled", thinkingEffort: "none" });
    }
  );

  test("does not guess thinking parameters for unknown models", () => {
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_EPHONEAI,
        model: "provider/unknown-model",
      })
    ).toBeNull();
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_OPENAI,
        model: "unknown-model",
      })
    ).toBeNull();
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/unknown-model",
      })
    ).toBeNull();
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_GEMINI,
        model: "custom-model",
      })
    ).toBeNull();
    expect(
      normalizeThinkingSettings({
        apiType: OPT_TRANS_OPENAI,
        model: "unknown-model",
        thinkingMode: "enabled",
      })
    ).toEqual({ thinkingMode: "enabled", thinkingEffort: "_default" });
  });

  test.each([
    [OPT_TRANS_DEEPSEEK, "deepseek"],
    [OPT_TRANS_XIAOMIMIMO, "deepseek"],
    [OPT_TRANS_ZAI, "deepseek"],
    [OPT_TRANS_ALIYUNBAILIAN, "boolean"],
    [OPT_TRANS_SILICONFLOW, "siliconflow"],
  ])("uses explicit thinking modes for %s", (apiType, adapter) => {
    const capability = getThinkingCapability({ apiType });
    expect(capability).toMatchObject({ adapter });
    expect(
      normalizeThinkingSettings({ apiType, thinkingMode: "auto" })
    ).toEqual({ thinkingMode: "auto", thinkingEffort: "_default" });
    expect(
      normalizeThinkingSettings({ apiType, thinkingMode: "enabled" })
    ).toEqual({ thinkingMode: "enabled", thinkingEffort: null });
    expect(
      normalizeThinkingSettings({ apiType, thinkingMode: "disabled" })
    ).toEqual({ thinkingMode: "disabled", thinkingEffort: null });
  });

  test("uses the lowest effort for mandatory reasoning models", () => {
    const capability = getOpenRouterThinkingCapability(
      "google/gemini-3.5-flash",
      {
        model: "google/gemini-3.5-flash",
        supportedEfforts: ["high", "medium", "low", "minimal"],
        mandatory: true,
      }
    );
    expect(
      normalizeThinkingSettings({
        apiType: OPT_TRANS_OPENROUTER,
        model: "google/gemini-3.5-flash",
        openRouterMetadata: {
          model: "google/gemini-3.5-flash",
          supportedEfforts: ["high", "medium", "low", "minimal"],
          defaultEffort: "medium",
          defaultEnabled: true,
          mandatory: true,
        },
        thinkingMode: "enabled",
      })
    ).toEqual({ thinkingMode: "enabled", thinkingEffort: "medium" });
    expect(
      normalizeThinkingSettings({
        apiType: OPT_TRANS_OPENROUTER,
        model: "google/gemini-3.5-flash",
        openRouterMetadata: {
          model: "google/gemini-3.5-flash",
          supportedEfforts: ["high", "medium", "low", "minimal"],
          defaultEffort: "medium",
          defaultEnabled: true,
          mandatory: true,
        },
        thinkingMode: "disabled",
      })
    ).toEqual({ thinkingMode: "disabled", thinkingEffort: "minimal" });
    expect(
      isThinkingMinimumFallback({ capability, thinkingMode: "disabled" })
    ).toBe(true);
  });

  test("keeps Claude native and hides unsupported legacy models", () => {
    expect(
      getThinkingCapability({
        apiType: OPT_TRANS_CLAUDE,
        model: "claude-3-haiku-20240307",
      })
    ).toBeNull();
    expect(
      normalizeThinkingSettings({
        apiType: OPT_TRANS_CLAUDE,
        model: "claude-mythos-5",
        thinkingMode: "disabled",
      })
    ).toEqual({ thinkingMode: "disabled", thinkingEffort: "low" });
  });

  test("keeps confirmed OpenRouter effort when the catalog is not in memory", () => {
    expect(
      normalizeThinkingSettings({
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/reasoning-model",
        thinkingMode: "enabled",
        thinkingEffort: "high",
      })
    ).toEqual({ thinkingMode: "enabled", thinkingEffort: "high" });
  });

  test("uses OpenRouter default effort and lowest effort for default-off models", () => {
    const baseMetadata = {
      model: "provider/reasoning-model",
      supportedEfforts: ["high", "medium", "low"],
      mandatory: false,
    };
    const normalize = (metadata) =>
      normalizeThinkingSettings({
        apiType: OPT_TRANS_OPENROUTER,
        model: baseMetadata.model,
        openRouterMetadata: { ...baseMetadata, ...metadata },
        thinkingMode: "enabled",
      });

    expect(
      normalize({ defaultEffort: "medium", defaultEnabled: true })
    ).toEqual({ thinkingMode: "enabled", thinkingEffort: "medium" });
    expect(normalize({ defaultEffort: "none", defaultEnabled: false })).toEqual(
      { thinkingMode: "enabled", thinkingEffort: "low" }
    );
    expect(normalize({ defaultEnabled: true })).toEqual({
      thinkingMode: "enabled",
      thinkingEffort: null,
    });
  });

  test("normalizes loaded static settings once and preserves stable references", () => {
    const transApis = [
      {
        apiType: OPT_TRANS_OPENAI,
        model: "gpt-5.6-sol",
        thinkingMode: "enabled",
        thinkingEffort: "_default",
      },
      {
        apiType: OPT_TRANS_OPENROUTER,
        model: "provider/unknown-model",
        thinkingMode: "enabled",
        thinkingEffort: "_default",
      },
    ];

    const normalized = normalizeApiThinkingSettings(transApis);
    expect(normalized).not.toBe(transApis);
    expect(normalized[0]).toMatchObject({ thinkingEffort: null });
    expect(normalized[1]).toBe(transApis[1]);
    expect(normalizeApiThinkingSettings(normalized)).toBe(normalized);
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

test("resolves Gemini modes with only thinkingMode and thinkingEffort", () => {
  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-2.5-flash",
      thinkingMode: "disabled",
    })
  ).toEqual({ thinkingMode: "disabled", thinkingEffort: 0 });

  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3.6-flash",
      thinkingMode: "enabled",
    })
  ).toEqual({ thinkingMode: "enabled", thinkingEffort: "medium" });
  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-2.5-flash",
      thinkingMode: "enabled",
    })
  ).toEqual({ thinkingMode: "enabled", thinkingEffort: -1 });
  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-2.5-flash",
      thinkingMode: "enabled",
    })
  ).toEqual({ thinkingMode: "enabled", thinkingEffort: null });
  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_GENERATE_CONTENT_URL,
      model: "gemini-2.5-flash-lite",
      thinkingMode: "enabled",
    })
  ).toEqual({ thinkingMode: "enabled", thinkingEffort: "low" });

  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3-pro-preview",
      thinkingMode: "enabled",
      thinkingEffort: "medium",
    })
  ).toEqual({ thinkingMode: "enabled", thinkingEffort: "high" });
  expect(
    normalizeThinkingSettings({
      apiType: OPT_TRANS_GEMINI,
      url: GEMINI_INTERACTIONS_URL,
      model: "gemini-3-pro-preview",
      thinkingMode: "auto",
      thinkingEffort: "high",
    })
  ).toEqual({ thinkingMode: "auto", thinkingEffort: "_default" });

  expect(
    getThinkingCapability({
      apiType: OPT_TRANS_GEMINI_2,
      model: "custom-model",
    })
  ).toBeNull();
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
