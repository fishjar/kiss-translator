import { OPT_TRANS_BUILTINAI } from "./api";
import {
  availableApisForScene,
  isApiAvailableFor,
  normalizeApiCapabilities,
  orderedApiSlugs,
} from "./serviceSelection";

test("legacy singular selection becomes an ordered one-item list", () => {
  expect(orderedApiSlugs({ apiSlug: "first" })).toEqual(["first"]);
  expect(orderedApiSlugs({ apiSlug: "first", apiSlugs: ["second", "first"] })).toEqual([
    "second",
    "first",
  ]);
});

test("built-in AI is classified separately from network adapters", () => {
  expect(normalizeApiCapabilities({ apiType: OPT_TRANS_BUILTINAI }).sourceType).toBe(
    "builtin"
  );
  expect(normalizeApiCapabilities({ apiType: "Microsoft" }).sourceType).toBe(
    "network"
  );
});

test("unimplemented capabilities and absent local models cannot be selected", () => {
  const apis = [
    { apiSlug: "local", sourceType: "local", modelRef: "m", capabilities: ["translation"] },
    { apiSlug: "ocr", sourceType: "network", capabilities: ["ocr"] },
    { apiSlug: "network", sourceType: "network", capabilities: ["translation"] },
  ];
  expect(
    availableApisForScene({ apiSlugs: ["local", "ocr", "network"] }, apis, "translation")
      .map((api) => api.apiSlug)
  ).toEqual(["network"]);
});

test("normalizes vlm capability and preserves it in capabilities list", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "OpenAI",
    capabilities: ["translation", "ocr", "vlm", "invalid_cap"],
  });
  expect(normalized.capabilities).toEqual(["translation", "ocr", "vlm"]);
});

test("supports ordered ocr capability selection and fallback with custom keys", () => {
  const apis = [
    { apiSlug: "primary-ocr", sourceType: "network", capabilities: ["ocr"] },
    { apiSlug: "fallback-ocr", sourceType: "network", capabilities: ["ocr"] },
    { apiSlug: "trans-only", sourceType: "network", capabilities: ["translation"] },
  ];
  const scene = {
    ocrApiSlug: "primary-ocr",
    ocrApiSlugs: ["primary-ocr", "fallback-ocr"],
  };

  const selected = availableApisForScene(
    scene,
    apis,
    "ocr",
    {},
    "ocrApiSlugs",
    "ocrApiSlug"
  );
  expect(selected.map((api) => api.apiSlug)).toEqual([
    "primary-ocr",
    "fallback-ocr",
  ]);
});

test("normalizes summarization capability and verifies availability across builtin, local, and network", () => {
  const normalized = normalizeApiCapabilities({
    apiType: "OpenAI",
    capabilities: ["translation", "summarization", "invalid_cap"],
  });
  expect(normalized.capabilities).toEqual(["translation", "summarization"]);

  const apis = [
    {
      apiSlug: "builtin",
      sourceType: "builtin",
      apiType: OPT_TRANS_BUILTINAI,
      capabilities: ["translation", "summarization"],
    },
    {
      apiSlug: "local-llm",
      sourceType: "local",
      apiType: "LocalAI",
      modelRef: "hy-mt2-1.8b",
      capabilities: ["summarization"],
    },
    {
      apiSlug: "gpt4",
      sourceType: "network",
      capabilities: ["translation", "summarization"],
    },
  ];

  // 1. 网络 AI 接口可用
  expect(isApiAvailableFor(apis[2], "summarization")).toBe(true);

  // 2. 本地 AI 模型安装时可用，未安装时不可用
  expect(isApiAvailableFor(apis[1], "summarization", { installedModels: new Set(["hy-mt2-1.8b"]) })).toBe(true);
  expect(isApiAvailableFor(apis[1], "summarization", { installedModels: new Set(["other-model"]) })).toBe(false);

  // 3. BuiltinAI: 依赖 globalThis.ai.summarizer
  const originalAi = globalThis.ai;
  try {
    globalThis.ai = { summarizer: {} };
    expect(isApiAvailableFor(apis[0], "summarization")).toBe(true);

    delete globalThis.ai;
    expect(isApiAvailableFor(apis[0], "summarization")).toBe(false);
  } finally {
    if (originalAi !== undefined) {
      globalThis.ai = originalAi;
    } else {
      delete globalThis.ai;
    }
  }
});

