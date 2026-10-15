jest.mock("query-string", () => ({
  stringify: (object) => new URLSearchParams(object).toString(),
}));
jest.mock("@streamparser/json", () =>
  jest.requireActual("../../node_modules/@streamparser/json/dist/cjs/index.js")
);
jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
}));
jest.mock("../libs/docInfo", () => ({ getDocInfo: () => ({}) }));
jest.mock("../providers/workerFactory", () => ({
  createProviderWorker: jest.fn(() => {
    throw new Error("Native execution must not use a script Worker.");
  }),
}));
import { fetchData } from "../libs/fetch";
import { createProviderWorker } from "../providers/workerFactory";
import { handleTranslate, handleNativeTranslate } from "../apis/trans";
import { createBuiltinInstance } from "./index";
import { withBuiltinProvider } from "./index";
import { resolveApiPromptSettings } from "../config/prompt";
import fixtures from "./fixtures/native-response-fixtures.json";
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
beforeAll(() =>
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: require("crypto").webcrypto,
  })
);
afterAll(() => {
  if (originalCrypto)
    Object.defineProperty(globalThis, "crypto", originalCrypto);
  else delete globalThis.crypto;
});
import {
  OPT_TRANS_OPENAI,
  OPT_TRANS_BAIDU,
  DEFAULT_API_LIST,
  OPT_LANGS_TO_SPEC,
} from "../config/api";

test("native scene dispatch matches the compatibility request/result and never starts Sval", async () => {
  fetchData.mockResolvedValue({
    choices: [{ message: { content: "你好" }, finish_reason: "stop" }],
  });
  const api = {
    ...createBuiltinInstance(OPT_TRANS_OPENAI, "unchanged-id", "OpenAI"),
    useStream: false,
    useBatchFetch: false,
    useContext: false,
    nobatchPrompt: "Translate into {{to}}: {{text}}",
    nobatchUserPrompt: "{{text}}",
    key: "mock-key",
  };
  const langMap = OPT_LANGS_TO_SPEC[OPT_TRANS_OPENAI];
  const options = {
    apiSetting: api,
    fromLang: "en",
    toLang: "zh-CN",
    from: langMap.get("en"),
    to: langMap.get("zh-CN"),
    langMap,
    docInfo: {},
    signal: new AbortController().signal,
  };
  const original = [];
  for await (const item of handleNativeTranslate(["hello"], options))
    original.push(item);
  const request = fetchData.mock.calls[0].slice(0, 2);
  const routed = [];
  for await (const item of handleTranslate(["hello"], options))
    routed.push(item);
  // SDK callers normalize an absent source language to the established empty string.
  expect(routed).toEqual(
    original.map((item) => ({
      ...item,
      result: [item.result[0], item.result[1] || ""],
    }))
  );
  expect(fetchData.mock.calls[1].slice(0, 2)).toEqual(request);
  expect(createProviderWorker).not.toHaveBeenCalled();
  expect(api.apiSlug).toBe("unchanged-id");
});

test("legacy scene projection preserves saved overrides and routes through native without saving or restoring defaults", async () => {
  const legacy = {
    apiType: OPT_TRANS_OPENAI,
    apiSlug: "old-scene-id",
    url: "https://mock.invalid/custom/chat/completions",
    key: "mock-override",
    model: "mock-model",
    useBatchFetch: false,
    useStream: false,
    useContext: false,
    nobatchPrompt: "Translate {{text}}",
    nobatchUserPrompt: "{{text}}",
  };
  const before = JSON.stringify(legacy);
  const resolved = resolveApiPromptSettings(legacy);
  expect(resolved.provider.implementation).toEqual({
    kind: "native",
    entry: OPT_TRANS_OPENAI,
  });
  for (const [key, value] of Object.entries(legacy))
    expect(resolved[key]).toEqual(value);
  expect(JSON.stringify(legacy)).toBe(before);
  expect(withBuiltinProvider({ apiType: "unknown" })).toEqual({
    apiType: "unknown",
  });
  fetchData.mockClear();
  fetchData.mockResolvedValue({
    choices: [{ message: { content: "旧场景译文" }, finish_reason: "stop" }],
  });
  const langMap = OPT_LANGS_TO_SPEC[OPT_TRANS_OPENAI];
  const rows = [];
  for await (const row of handleTranslate(["hello"], {
    apiSetting: resolved,
    fromLang: "en",
    toLang: "zh-CN",
    from: langMap.get("en"),
    to: langMap.get("zh-CN"),
    langMap,
  }))
    rows.push(row);
  expect(rows).toEqual([{ id: 0, result: ["旧场景译文", ""] }]);
  expect(fetchData.mock.calls[0][0]).toBe(legacy.url);
  expect(createProviderWorker).not.toHaveBeenCalled();
});

test("Baidu legacy records have a native descriptor without reintroducing a removed default service", () => {
  expect(DEFAULT_API_LIST.some((api) => api.apiType === OPT_TRANS_BAIDU)).toBe(
    false
  );
  const old = {
    apiSlug: "old-baidu",
    apiType: OPT_TRANS_BAIDU,
    key: "mock-key",
  };
  const mapped = withBuiltinProvider(old);
  expect(Object.keys(mapped.provider.capabilities)).toEqual(
    expect.arrayContaining(["translate", "detectLanguage", "suggest"])
  );
  expect(mapped.key).toBe(old.key);
  expect(old.provider).toBeUndefined();
  expect(DEFAULT_API_LIST.some((api) => api.apiType === OPT_TRANS_BAIDU)).toBe(
    false
  );
});

test("an explicit multi-item native request uses batch encoding even when host aggregation is disabled", async () => {
  const api = {
    ...createBuiltinInstance(OPT_TRANS_OPENAI, "direct-multi", "Multi"),
    useBatchFetch: false,
    useStream: false,
    useContext: false,
    batchProtocol: "json",
  };
  fetchData.mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            translations: [
              { id: 0, text: "甲" },
              { id: 1, text: "乙" },
            ],
          }),
        },
        finish_reason: "stop",
      },
    ],
  });
  const { createNativeRegistry } = require("./runtime");
  await expect(
    createNativeRegistry(() => api).invoke(api.apiSlug, "translate", {
      items: [
        { id: "first", text: "A" },
        { id: "second", text: "B" },
      ],
      targetLanguage: "zh-CN",
    }).result
  ).resolves.toEqual({
    items: [
      { id: "first", text: "甲" },
      { id: "second", text: "乙" },
    ],
  });
  expect(api.useBatchFetch).toBe(false);
});

// All compiled network definitions must traverse the real request factory,
// scene projection, registry and response parser; a manifest alone is not proof.
test.each(
  [
    ...DEFAULT_API_LIST.filter(
      (api) => !["BuiltinAI", "SystemTTS", "LocalAI"].includes(api.apiType)
    ),
    { apiType: OPT_TRANS_BAIDU },
  ].map((api) => api.apiType)
)(
  "%s native scene preserves complete translation through its real protocol adapter",
  async (apiType) => {
    const api = {
      ...createBuiltinInstance(apiType, "fixture-" + apiType, apiType),
      url: "https://mock.invalid/v1/chat/completions",
      key: "mock-key",
      model: "mock-model",
      folderId: "mock-folder",
      region: "mock-region",
      useStream: false,
      useBatchFetch: false,
      useContext: false,
      reqHook: "",
      resHook: "",
      nobatchPrompt: "Translate {{text}}",
      nobatchUserPrompt: "{{text}}",
    };
    fetchData.mockClear();
    fetchData.mockResolvedValue(
      fixtures.responses[apiType] || fixtures.responses.openaiCompatible
    );
    const langMap = OPT_LANGS_TO_SPEC[apiType];
    const rows = [];
    for await (const row of handleTranslate([fixtures.input], {
      apiSetting: api,
      fromLang: "en",
      toLang: "zh-CN",
      from: langMap?.get("en"),
      to: langMap?.get("zh-CN"),
      langMap,
      signal: new AbortController().signal,
    }))
      rows.push(row);
    expect(rows).toHaveLength(1);
    expect(rows[0].result[0]).toBe(fixtures.expectedText);
    expect(fetchData).toHaveBeenCalled();
    expect(createProviderWorker).not.toHaveBeenCalled();
  }
);
