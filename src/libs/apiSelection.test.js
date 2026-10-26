import {
  getEnabledApis,
  normalizeRuleApi,
  resolveApiSelection,
} from "./apiSelection";

describe("translation service selection", () => {
  const apis = [
    { apiType: "Google", apiSlug: "disabled", isDisabled: true, sortOrder: -1 },
    { apiType: "Google", apiSlug: "later", sortOrder: 2 },
    { apiType: "Google", apiSlug: "first", sortOrder: 0 },
    { apiType: "Google", apiSlug: "tied", sortOrder: 0 },
  ];

  test("uses the popup display order and keeps ties stable without mutation", () => {
    expect(getEnabledApis(apis).map((api) => api.apiSlug)).toEqual([
      "first",
      "tied",
      "later",
    ]);
    expect(apis.map((api) => api.apiSlug)).toEqual([
      "disabled",
      "later",
      "first",
      "tied",
    ]);
  });

  test("keeps an enabled selection even when it is not first", () => {
    expect(resolveApiSelection(apis, "later")).toBe(apis[1]);
  });

  test.each(["disabled", "removed", undefined])(
    "falls back to the first enabled service for %s",
    (apiSlug) => {
      expect(resolveApiSelection(apis, apiSlug)).toBe(apis[2]);
    }
  );

  test("uses zero for omitted sort order and honors a pinned service", () => {
    expect(
      getEnabledApis([
        { apiType: "Google", apiSlug: "unweighted" },
        { apiType: "Google", apiSlug: "pinned", sortOrder: -1 },
        { apiType: "Google", apiSlug: "zero", sortOrder: 0 },
      ]).map((api) => api.apiSlug)
    ).toEqual(["pinned", "unweighted", "zero"]);
  });

  test.each([
    [[]],
    [[{ apiType: "Google", apiSlug: "disabled", isDisabled: true }]],
  ])(
    "has no implicit default when all services are unavailable",
    (transApis) => {
      expect(resolveApiSelection(transApis, "disabled")).toBeUndefined();
    }
  );

  test("normalizes an effective rule without changing the saved preference", () => {
    const rule = { apiSlug: "disabled", toLang: "zh-CN" };
    expect(normalizeRuleApi(rule, apis)).toEqual({
      apiSlug: "first",
      toLang: "zh-CN",
    });
    expect(rule.apiSlug).toBe("disabled");
    expect(normalizeRuleApi(rule, [])).toBe(rule);
  });

  test("only offers services with enabled translation capability without changing their configuration", () => {
    const service = (apiSlug, capabilities, extra = {}) => ({
      apiSlug,
      provider: {
        apiVersion: "1",
        implementation: { kind: "native" },
        capabilities,
      },
      ...extra,
    });
    const services = [
      service("ocr", { recognizeText: {} }),
      service("layout", { analyzeLayout: {} }),
      service("asr", { transcribe: {} }),
      service("tts", { synthesizeSpeech: {}, speak: {} }),
      service("mixed", { translate: {}, recognizeText: {} }),
      service("disabled", { translate: {} }, { isDisabled: true }),
      service(
        "translate-off",
        { translate: {}, recognizeText: {} },
        { enabledCapabilities: ["recognizeText"] }
      ),
      service("all-off", { translate: {} }, { enabledCapabilities: [] }),
      { apiSlug: "google", apiType: "Google" },
      { apiSlug: "undeclared" },
    ];
    const before = JSON.stringify(services);
    expect(getEnabledApis(services).map((api) => api.apiSlug)).toEqual([
      "mixed",
      "google",
    ]);
    expect(resolveApiSelection(services, "ocr").apiSlug).toBe("mixed");
    expect(resolveApiSelection(services.slice(0, 4), "ocr")).toBeUndefined();
    expect(JSON.stringify(services)).toBe(before);
  });

  test("model changes preserve the service capability contract", () => {
    const api = {
      apiSlug: "model-service",
      provider: {
        apiVersion: "1",
        implementation: { kind: "native" },
        capabilities: { translate: {}, recognizeText: {} },
        models: [{ id: "ocr" }, { id: "translator" }],
      },
      pluginConfig: { model: "ocr" },
    };
    expect(getEnabledApis([api])).toEqual([api]);
    const translator = { ...api, pluginConfig: { model: "translator" } };
    expect(getEnabledApis([translator])).toEqual([translator]);
  });
});
