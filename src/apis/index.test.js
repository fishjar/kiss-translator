jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fnPolyfill: jest.fn(),
}));

jest.mock("../libs/cache", () => ({
  getHttpCachePolyfill: jest.fn(),
  putHttpCachePolyfill: jest.fn(),
}));

jest.mock("../libs/batchQueue", () => ({
  getBatchQueue: jest.fn(),
}));

const mockSha256 = jest.fn();

jest.mock("../libs/utils", () => ({
  sha256: (...args) => mockSha256(...args),
  withTimeout: jest.fn((promise) => promise),
}));

jest.mock("./trans", () => ({
  handleTranslate: jest.fn(),
  handleSubtitle: jest.fn(),
  handleSummarize: jest.fn(),
  handleMicrosoftLangdetect: jest.fn(),
}));

import { apiTranslate } from "./index";
import { getBatchQueue } from "../libs/batchQueue";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";

const getOpenAiApiSetting = (systemPrompt) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_test",
  key: "test-key",
  model: "test-model",
  useBatchFetch: true,
  useStream: false,
  systemPrompt,
});

describe("apiTranslate prompt queue isolation", () => {
  beforeEach(() => {
    mockSha256.mockImplementation(async (text) =>
      text.includes("batch prompt B") ? "b".repeat(64) : "a".repeat(64)
    );
    getBatchQueue.mockImplementation(() => ({
      addTask: jest.fn().mockResolvedValue(["translated text", ""]),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("uses prompt signature in batch queue key", async () => {
    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getOpenAiApiSetting("batch prompt A"),
      useCache: false,
    });
    await apiTranslate({
      text: "world",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getOpenAiApiSetting("batch prompt B"),
      useCache: false,
    });

    const queueKeys = getBatchQueue.mock.calls.map(([key]) => key);

    expect(queueKeys).toHaveLength(2);
    expect(queueKeys[0]).toContain("_aaaaaaaaaaaaaaaa");
    expect(queueKeys[1]).toContain("_bbbbbbbbbbbbbbbb");
    expect(queueKeys[0]).not.toBe(queueKeys[1]);
  });
});
