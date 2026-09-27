jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fetchStream: jest.fn(),
  fnPolyfill: jest.fn(),
}));

jest.mock("../libs/browser", () => ({
  isBuiltinAIAvailable: false,
  isBg: () => false,
}));

jest.mock("../libs/storage", () => ({ getSetting: jest.fn() }));
jest.mock("../libs/cache", () => ({
  getHttpCachePolyfill: jest.fn(),
  putHttpCachePolyfill: jest.fn(),
}));
jest.mock("../libs/docInfo", () => ({ getDocInfo: () => ({}) }));
jest.mock("../libs/stream", () => ({
  parseStreamingSegments: jest.fn(),
  createStreamingJsonParser: jest.fn(),
  createStreamingSubtitleParser: jest.fn(),
  createRealtimeStreamParser: jest.fn(),
  detectStreamFormat: jest.fn(),
  getStreamDelta: jest.fn(),
}));

import { apiDict } from "./index";
import { fetchData } from "../libs/fetch";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_OPENAI,
  defaultDictUserPrompt,
} from "../config";

const baseApi = {
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "dictionary_terms_cache",
  key: "test-key",
  model: "test-model",
  url: "https://example.com/chat/completions",
  dictPrompt: "Define the target text using the supplied terminology.",
  dictUserPrompt: defaultDictUserPrompt,
  useStream: false,
};

const dictionaryArgs = (overrides = {}) => ({
  text: "library",
  fromLang: "en",
  toLang: "en",
  docInfo: { title: "Reference", description: "", summary: "" },
  context: "This library stores reusable functions.",
  apiSetting: { ...baseApi, ...overrides },
});

const getRequestUserPrompt = (callIndex) =>
  JSON.parse(fetchData.mock.calls[callIndex][1].body).messages.find(
    (message) => message.role === "user"
  ).content;

describe("apiDict terminology cache", () => {
  beforeEach(() => {
    const cache = new Map();
    getHttpCachePolyfill.mockImplementation(async (key) => cache.get(key));
    putHttpCachePolyfill.mockImplementation(async (key, init, value) => {
      cache.set(key, value);
    });
    fetchData.mockResolvedValue({
      choices: [{ message: { content: "## library\nDefault definition." } }],
    });
  });

  test("refreshes changed terminology and reuses unchanged terminology", async () => {
    fetchData
      .mockResolvedValueOnce({
        choices: [{ message: { content: "## library\nUse archive." } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "## library\nUse repository." } }],
      });

    const original = await apiDict(
      dictionaryArgs({ aiTerms: "library,archive" })
    );
    const changed = await apiDict(
      dictionaryArgs({ aiTerms: "library,repository" })
    );
    const repeated = await apiDict(
      dictionaryArgs({ aiTerms: "library,repository" })
    );

    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(putHttpCachePolyfill).toHaveBeenCalledTimes(2);
    expect(getRequestUserPrompt(0)).toContain("library translates to archive");
    expect(getRequestUserPrompt(1)).toContain(
      "library translates to repository"
    );
    expect(original).toBe("## library\nUse archive.");
    expect(changed).toBe("## library\nUse repository.");
    expect(repeated).toBe(changed);
  });

  test("clearing terminology refreshes the result and matches omitted terminology", async () => {
    fetchData.mockResolvedValueOnce({
      choices: [{ message: { content: "## library\nUse archive." } }],
    });
    const original = await apiDict(
      dictionaryArgs({ aiTerms: "library,archive" })
    );
    const cleared = await apiDict(dictionaryArgs({ aiTerms: "" }));
    const legacyArgs = dictionaryArgs();
    delete legacyArgs.apiSetting.aiTerms;
    const omitted = await apiDict(legacyArgs);
    const undefinedTerms = await apiDict(
      dictionaryArgs({ aiTerms: undefined })
    );

    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(putHttpCachePolyfill).toHaveBeenCalledTimes(2);
    expect(getRequestUserPrompt(0)).toContain("library translates to archive");
    expect(getRequestUserPrompt(1)).not.toContain("Reference the following");
    expect(original).toBe("## library\nUse archive.");
    expect(cleared).toBe("## library\nDefault definition.");
    expect(omitted).toBe(cleared);
    expect(undefinedTerms).toBe(cleared);
  });

  test("translation tone does not alter the dictionary request or cache identity", async () => {
    const formal = await apiDict(dictionaryArgs({ tone: "formal" }));
    const casual = await apiDict(dictionaryArgs({ tone: "casual" }));

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(formal).toBe(casual);
    expect(getRequestUserPrompt(0)).not.toContain("translation style");

    await apiDict({
      ...dictionaryArgs({ tone: "casual" }),
      useCache: false,
    });
    expect(fetchData).toHaveBeenCalledTimes(2);
    expect(getRequestUserPrompt(1)).toBe(getRequestUserPrompt(0));
  });
});
