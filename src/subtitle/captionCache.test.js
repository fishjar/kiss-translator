import {
  captionSegmentationSignature,
  captionTranslationSignature,
} from "./captionCache";
jest.mock("../libs/cacheDigest", () => ({
  getCacheDigest: async (text) => text,
}));

test("built-in segmentation survives translation service/language changes, but not segmentation changes", async () => {
  const setting = {
    segSlug: "-",
    toLang: "zh-CN",
    apiSlug: "google",
    longSentenceThreshold: 100,
  };
  const first = await captionSegmentationSignature(setting);
  expect(
    await captionSegmentationSignature({
      ...setting,
      apiSlug: "bing",
      toLang: "ja",
    })
  ).toBe(first);
  expect(
    await captionSegmentationSignature({
      ...setting,
      longSentenceThreshold: 80,
    })
  ).not.toBe(first);
  expect(
    await captionSegmentationSignature({
      ...setting,
      useAlgorithmBreaker: "statistical",
    })
  ).not.toBe(first);
});
test("AI segmentation and context include the actual service and prompt inputs", async () => {
  const setting = {
    segSlug: "ai",
    toLang: "zh-CN",
    transApis: [{ apiSlug: "ai", model: "model-a" }],
    prompts: [{ body: "first" }],
  };
  const first = await captionSegmentationSignature(setting);
  expect(
    await captionSegmentationSignature({ ...setting, toLang: "ja" })
  ).not.toBe(first);
  expect(
    await captionSegmentationSignature({
      ...setting,
      transApis: [
        { apiSlug: "ai", model: "model-a", subtitlePrompt: "second" },
      ],
    })
  ).not.toBe(first);
  expect(
    await captionSegmentationSignature({
      ...setting,
      transApis: [{ apiSlug: "ai", model: "model-b" }],
    })
  ).not.toBe(first);
});

test("translation identity changes with target language, service, model, prompts and context but not caption styling", async () => {
  const service = { apiSlug: "ai", apiType: "OpenAI", model: "model-a" };
  const setting = {
    apiSlug: "ai",
    apiSetting: service,
    toLang: "zh-CN",
    segSlug: "-",
  };
  const original = await captionTranslationSignature(setting);
  expect(
    await captionTranslationSignature({
      ...setting,
      originStyle: "color:red",
      translationStyle: "font-size:20px",
      displayOrder: "translation-first",
    })
  ).toBe(original);
  for (const patch of [
    { toLang: "ja" },
    { apiSlug: "other" },
    { apiSetting: { ...service, model: "model-b" } },
    { apiSetting: { ...service, systemPrompt: "different" } },
    {
      transApis: [{ apiSlug: "context", model: "context" }],
      aiContextSlug: "context",
    },
    { parseLatex: true },
    { forceSubtitleRetranslate: true },
  ])
    expect(
      await captionTranslationSignature({ ...setting, ...patch })
    ).not.toBe(original);
});

test("built-in segmentation is independent of the AI translation context", async () => {
  const setting = {
    segSlug: "-",
    transApis: [{ apiSlug: "context", model: "first" }],
    aiContextSlug: "context",
  };
  const original = await captionSegmentationSignature(setting);
  expect(
    await captionSegmentationSignature({
      ...setting,
      transApis: [{ apiSlug: "context", model: "second" }],
    })
  ).toBe(original);
});

test.each([
  "apiName",
  "httpTimeout",
  "fetchLimit",
  "fetchInterval",
  "batchInterval",
  "batchConcurrency",
  "requestTimes",
  "updatedAt",
])("%s does not invalidate content signatures", async (key) => {
  const service = { apiSlug: "ai", apiType: "OpenAI", model: "model-a" };
  const setting = {
    apiSlug: "ai",
    apiSetting: service,
    segSlug: "ai",
    transApis: [service],
    toLang: "zh-CN",
  };
  const changed = { ...service, [key]: key === "apiName" ? "renamed" : 123 };
  const next = { ...setting, apiSetting: changed, transApis: [changed] };
  expect(await captionTranslationSignature(next)).toBe(
    await captionTranslationSignature(setting)
  );
  expect(await captionSegmentationSignature(next)).toBe(
    await captionSegmentationSignature(setting)
  );
});

test("object order is stable but content configuration and credentials remain authoritative", async () => {
  const service = {
    apiSlug: "ai",
    apiType: "OpenAI",
    model: "a",
    key: "account-a",
    customBody: { a: 1, b: 2 },
  };
  const setting = (apiSetting) => ({
    apiSlug: "ai",
    apiSetting,
    toLang: "zh-CN",
  });
  const original = await captionTranslationSignature(setting(service));
  expect(
    await captionTranslationSignature(
      setting({ ...service, customBody: { b: 2, a: 1 } })
    )
  ).toBe(original);
  for (const patch of [
    { key: "account-b" },
    { model: "b" },
    { url: "https://other.example" },
    { customBody: { a: 2, b: 2 } },
    { customHeader: '{"X-Model":"other"}' },
    { reqHook: "changed" },
    { resHook: "changed" },
    {
      provider: {
        implementation: { kind: "script", code: "new" },
        settings: [],
      },
    },
  ])
    expect(
      await captionTranslationSignature(setting({ ...service, ...patch }))
    ).not.toBe(original);
});
