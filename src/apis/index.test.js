jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

jest.mock("../libs/fetch", () => ({
  fetchData: jest.fn(),
  fnPolyfill: jest.fn(),
}));

jest.mock("../libs/browser", () => ({
  isBuiltinAIAvailable: true,
}));

jest.mock("../libs/cache", () => ({
  getHttpCachePolyfill: jest.fn(),
  putHttpCachePolyfill: jest.fn(),
}));

jest.mock("../libs/docInfo", () => ({
  getDocInfo: () => ({ title: "Doc", description: "Desc", summary: "Summary" }),
}));

jest.mock("../libs/batchQueue", () => ({
  getBatchQueue: jest.fn(),
}));

jest.mock("../libs/pool", () => ({
  getFetchPool: jest.fn(() => ({
    push: (fn, args) => fn(args),
  })),
}));

jest.mock("../libs/storage", () => ({
  getSetting: jest.fn(),
}));

jest.mock("../libs/request", () => ({
  normalizeHttpTimeout: (timeout) => {
    const normalizedTimeout = timeout || 30;
    return normalizedTimeout > 600
      ? normalizedTimeout
      : normalizedTimeout * 1000;
  },
}));

const mockSha256 = jest.fn();
const mockGetCacheDigest = jest.fn();

jest.mock("../libs/utils", () => ({
  sha256: (...args) => mockSha256(...args),
  withTimeout: jest.fn((promise) => promise),
}));

jest.mock("../libs/cacheDigest", () => ({
  getCacheDigest: (...args) => mockGetCacheDigest(...args),
}));

jest.mock("./trans", () => ({
  handleTranslate: jest.fn(),
  handleDict: jest.fn(),
  handleSubtitle: jest.fn(),
  // 字幕缓存测试只关心最终提示词和稳定事件输入，不在这里重复测试提示词模板替换。
  buildSubtitleSystemPrompt: ({ subtitlePrompt, docInfo }) =>
    `${subtitlePrompt || ""}\n${docInfo?.title || ""}\n${docInfo?.summary || ""}`,
  formatIndexSubtitleEvents: (events) =>
    events.map((event, id) => {
      const item = { id, text: event.text };
      // 缓存测试使用 boundary-v3 输入，正间隔挂在停顿前的事件上。
      if (id < events.length - 1) {
        const pauseMs = Math.round(events[id + 1].start - event.end);
        if (pauseMs > 0) item.pauseMs = pauseMs;
      }
      return item;
    }),
  handleSummarize: jest.fn(),
}));

import {
  apiDict,
  apiSubtitle,
  apiTranslate,
  apiSummarizeVideo,
  getVideoSummarySignature,
} from "./index";
import {
  handleDict,
  handleSubtitle,
  handleTranslate,
  handleSummarize,
} from "./trans";
import { fetchData, fnPolyfill } from "../libs/fetch";
import { getSetting } from "../libs/storage";
import { withTimeout } from "../libs/utils";
import { getBatchQueue } from "../libs/batchQueue";
import { getFetchPool } from "../libs/pool";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_BAIDU,
  OPT_TRANS_DEEPL,
  OPT_TRANS_DEEPLX,
  OPT_TRANS_OPENAI,
  OPT_TRANS_QWENMT,
} from "../config";

const getOpenAiApiSetting = (systemPrompt) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_test",
  key: "test-key",
  model: "test-model",
  useBatchFetch: true,
  useStream: false,
  systemPrompt,
});

const getBuiltinAiApiSetting = (httpTimeout) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_BUILTINAI),
  apiSlug: `builtinai_${httpTimeout}`,
  fetchInterval: 100,
  fetchLimit: 1,
  httpTimeout,
});

test("text refresh replaces the default cache entry while off skips both reads and writes", async () => {
  jest.clearAllMocks();
  getFetchPool.mockReturnValue({ push: (fn, args) => fn(args) });
  withTimeout.mockImplementation((promise) => promise);
  mockGetCacheDigest.mockResolvedValue("a".repeat(64));
  const args = { text: "cache text", fromLang: "en", toLang: "zh-CN", apiSetting: getBuiltinAiApiSetting(30) };
  getHttpCachePolyfill.mockResolvedValue({ trText: "old" });
  expect((await apiTranslate(args)).trText).toBe("old");
  const key = getHttpCachePolyfill.mock.calls.at(-1)[0];
  fnPolyfill.mockResolvedValue(["new", "en", ""]);
  getHttpCachePolyfill.mockClear();
  expect((await apiTranslate({ ...args, cacheMode: "refresh" })).trText).toBe("new");
  expect(getHttpCachePolyfill).not.toHaveBeenCalled();
  expect(putHttpCachePolyfill).toHaveBeenCalledWith(key, null, expect.objectContaining({ trText: "new" }));
  putHttpCachePolyfill.mockClear();
  await apiTranslate({ ...args, cacheMode: "off" });
  expect(getHttpCachePolyfill).not.toHaveBeenCalled();
  expect(putHttpCachePolyfill).not.toHaveBeenCalled();
  getHttpCachePolyfill.mockReset();
});

describe("apiSubtitle cache identity", () => {
  const events = [{ start: 100, end: 900, text: "hello" }];

  beforeEach(() => {
    getHttpCachePolyfill.mockResolvedValue(null);
    handleSubtitle.mockResolvedValue([
      { start: 100, end: 900, text: "hello", translation: "你好" },
    ]);
    mockGetCacheDigest.mockImplementation(async (text, salt) =>
      `${salt}:${text}`.padEnd(64, "a")
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("includes chunk hash and rendered prompt signature without contextSig", async () => {
    await apiSubtitle({
      videoId: "video-1",
      chunkSign: "100 --> 900",
      fromLang: "en",
      toLang: "zh-CN",
      events,
      apiSetting: {
        ...getOpenAiApiSetting("translate"),
        subtitlePrompt: "subtitle {{title}} {{summary}}",
      },
      docInfo: { title: "Title A", summary: "Summary A" },
    });

    const cacheInput = getHttpCachePolyfill.mock.calls[0][0];
    expect(cacheInput).toContain("chunkHash=");
    expect(cacheInput).toContain("promptSig=");
    expect(cacheInput).toContain("segVer=4");
    expect(cacheInput).not.toContain("contextSig=");
    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      JSON.stringify([[0, "hello", 100, 900, 0]]),
      "subtitle-chunk-v4"
    );
    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      expect.stringContaining("Summary A"),
      "prompt-cache"
    );
  });

  test("changes cache identity when the internal timeline or rendered context changes", async () => {
    // 分别让时间轴和动态摘要产生不同摘要值，直接验证两部分缓存身份都会变化。
    mockGetCacheDigest.mockImplementation(async (text, salt) => {
      if (salt === "subtitle-chunk-v4") {
        return (text.includes("901") ? "b" : "a").repeat(64);
      }
      return (text.includes("Summary B") ? "d" : "c").repeat(64);
    });
    const apiSetting = {
      ...getOpenAiApiSetting("translate"),
      subtitlePrompt: "subtitle {{summary}}",
    };

    await apiSubtitle({
      videoId: "video-1",
      chunkSign: "100 --> 900",
      fromLang: "en",
      toLang: "zh-CN",
      events,
      apiSetting,
      docInfo: { summary: "Summary A" },
    });
    await apiSubtitle({
      videoId: "video-1",
      chunkSign: "100 --> 901",
      fromLang: "en",
      toLang: "zh-CN",
      events: [{ ...events[0], end: 901 }],
      apiSetting,
      docInfo: { summary: "Summary B" },
    });

    const [firstCacheInput, secondCacheInput] =
      getHttpCachePolyfill.mock.calls.map(([cacheInput]) => cacheInput);
    expect(firstCacheInput).not.toBe(secondCacheInput);
    expect(firstCacheInput).toContain(`chunkHash=${"a".repeat(16)}`);
    expect(secondCacheInput).toContain(`chunkHash=${"b".repeat(16)}`);
    expect(firstCacheInput).toContain(`promptSig=${"c".repeat(16)}`);
    expect(secondCacheInput).toContain(`promptSig=${"d".repeat(16)}`);
  });

  test("includes boundary-v3 pauseMs in the v4 chunk hash", async () => {
    const pauseEvents = [
      { start: 0, end: 400, text: "hello" },
      { start: 1250, end: 1800, text: "world" },
    ];

    await apiSubtitle({
      videoId: "video-pause",
      chunkSign: "0 --> 1800",
      fromLang: "en",
      toLang: "zh-CN",
      events: pauseEvents,
      apiSetting: {
        ...getOpenAiApiSetting("translate"),
        subtitlePrompt: "boundary-v3 prompt",
      },
    });

    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      JSON.stringify([
        [0, "hello", 0, 400, 850],
        [1, "world", 1250, 1800, 0],
      ]),
      "subtitle-chunk-v4"
    );
    expect(getHttpCachePolyfill.mock.calls[0][0]).toContain("segVer=4");
  });
});

describe("apiTranslate BuiltinAI timeout", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockResolvedValue("a".repeat(64));
    getFetchPool.mockReturnValue({
      push: (fn, args) => fn(args),
    });
    withTimeout.mockImplementation((promise) => promise);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("converts second-based timeout before calling withTimeout", async () => {
    fnPolyfill.mockResolvedValueOnce(["translated text", "en", ""]);

    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getBuiltinAiApiSetting(30),
      useCache: false,
    });

    expect(withTimeout.mock.calls[0][1]).toBe(30000);
  });

  test("keeps legacy millisecond timeout before calling withTimeout", async () => {
    fnPolyfill.mockResolvedValueOnce(["translated text", "en", ""]);

    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getBuiltinAiApiSetting(30000),
      useCache: false,
    });

    expect(withTimeout.mock.calls[0][1]).toBe(30000);
  });

  test("includes BuiltinAI error reason in thrown message", async () => {
    fnPolyfill.mockResolvedValueOnce([
      "",
      "auto",
      "Automatic detection of source language failed: low confidence",
    ]);

    await expect(
      apiTranslate({
        text: "hello",
        fromLang: "auto",
        toLang: "zh-CN",
        apiSetting: getBuiltinAiApiSetting(30),
        useCache: false,
      })
    ).rejects.toThrow(
      "apiBuiltinAITranslate got error: Automatic detection of source language failed: low confidence"
    );
  });

  test("falls back to the configured detection service when the built-in detector is unavailable", async () => {
    getSetting.mockResolvedValue({ langDetector: OPT_TRANS_BAIDU });
    fetchData.mockResolvedValueOnce({ error: 0, lan: "en" });
    fnPolyfill
      .mockResolvedValueOnce([
        "",
        "auto",
        "Automatic detection of source language failed: LanguageDetector unavailable",
      ])
      .mockResolvedValueOnce(["translated text", "en", ""]);

    const translation = await apiTranslate({
      text: "hello",
      fromLang: "auto",
      toLang: "zh-CN",
      apiSetting: getBuiltinAiApiSetting(30),
      useCache: false,
    });

    expect(fetchData).toHaveBeenCalledWith(
      "https://fanyi.baidu.com/langdetect",
      expect.anything(),
      { useCache: true }
    );
    expect(fnPolyfill.mock.calls[1][0].from).toBe("en");
    expect(translation.trText).toBe("translated text");
    expect(translation.srLang).toBe("en");
    expect(fnPolyfill).toHaveBeenCalledTimes(2);
  });

  test("keeps the original error when no fallback detector resolves a language", async () => {
    getSetting.mockResolvedValue({ langDetector: OPT_TRANS_BAIDU });
    fnPolyfill.mockResolvedValueOnce([
      "",
      "auto",
      "Automatic detection of source language failed: LanguageDetector unavailable",
    ]);
    fetchData.mockResolvedValueOnce({ error: 1 });

    await expect(
      apiTranslate({
        text: "hello",
        fromLang: "auto",
        toLang: "zh-CN",
        apiSetting: getBuiltinAiApiSetting(30),
        useCache: false,
      })
    ).rejects.toThrow(
      "apiBuiltinAITranslate got error: Automatic detection of source language failed: LanguageDetector unavailable"
    );
    expect(fnPolyfill).toHaveBeenCalledTimes(1);
  });

  test("surfaces the concrete-language retry error", async () => {
    getSetting.mockResolvedValue({ langDetector: OPT_TRANS_BAIDU });
    fetchData.mockResolvedValueOnce({ error: 0, lan: "en" });
    fnPolyfill
      .mockResolvedValueOnce([
        "",
        "auto",
        "Automatic detection of source language failed: LanguageDetector unavailable",
      ])
      .mockResolvedValueOnce(["", "en", "Language pair unavailable"]);

    await expect(
      apiTranslate({
        text: "hello",
        fromLang: "auto",
        toLang: "zh-CN",
        apiSetting: getBuiltinAiApiSetting(30),
        useCache: false,
      })
    ).rejects.toThrow(
      "apiBuiltinAITranslate got error: Language pair unavailable"
    );
    expect(fnPolyfill).toHaveBeenCalledTimes(2);
  });

  test("reports a null concrete-language retry result", async () => {
    getSetting.mockResolvedValue({ langDetector: OPT_TRANS_BAIDU });
    fetchData.mockResolvedValueOnce({ error: 0, lan: "en" });
    fnPolyfill
      .mockResolvedValueOnce([
        "",
        "auto",
        "Automatic detection of source language failed: LanguageDetector unavailable",
      ])
      .mockResolvedValueOnce(null);

    await expect(
      apiTranslate({
        text: "hello",
        fromLang: "auto",
        toLang: "zh-CN",
        apiSetting: getBuiltinAiApiSetting(30),
        useCache: false,
      })
    ).rejects.toThrow("apiBuiltinAITranslate retry got null result");
  });
});

describe("apiDict", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockImplementation(async (text) =>
      text.includes("dictionary prompt B") ||
      text.includes("dictionary user prompt B")
        ? "b".repeat(64)
        : "a".repeat(64)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("delegates to dictionary handler with prompt and context", async () => {
    handleDict.mockResolvedValueOnce("## dictionary");

    const apiSetting = {
      ...getOpenAiApiSetting("batch prompt"),
      dictPrompt: "dictionary prompt {{context}} {{text}}",
    };
    const result = await apiDict({
      text: "library",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting,
      context: "The library is open.",
    });

    expect(result).toBe("## dictionary");
    expect(handleDict).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "library",
        fromLang: "en",
        toLang: "zh-CN",
        apiSetting,
        context: "The library is open.",
      })
    );
    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      expect.stringContaining("The library is open."),
      "prompt-cache"
    );
    expect(getBatchQueue).not.toHaveBeenCalled();
  });

  test("returns cached dictionary markdown without calling handler", async () => {
    getHttpCachePolyfill.mockResolvedValueOnce({ markdown: "cached markdown" });

    const result = await apiDict({
      text: "library",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt"),
        dictPrompt: "dictionary prompt A",
      },
      context: "The library is open.",
    });

    expect(result).toBe("cached markdown");
    expect(handleDict).not.toHaveBeenCalled();
    expect(putHttpCachePolyfill).not.toHaveBeenCalled();
  });

  test("writes dictionary markdown cache using dictionary prompt signature", async () => {
    getHttpCachePolyfill.mockResolvedValue(null);
    handleDict.mockResolvedValueOnce("fresh markdown");

    await apiDict({
      text: "library",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt"),
        dictPrompt: "dictionary prompt B",
        dictUserPrompt: "dictionary user prompt A",
      },
      context: "The library is open.",
    });

    expect(putHttpCachePolyfill).toHaveBeenCalledWith(
      expect.stringContaining("promptSig=bbbbbbbbbbbbbbbb"),
      null,
      { markdown: "fresh markdown" }
    );
  });

  test("dictionary prompt signature includes dictionary user prompt", async () => {
    getHttpCachePolyfill.mockResolvedValue(null);
    handleDict.mockResolvedValueOnce("fresh markdown");

    await apiDict({
      text: "library",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt"),
        dictPrompt: "dictionary prompt A",
        dictUserPrompt: "dictionary user prompt B",
      },
      context: "The library is open.",
    });

    expect(putHttpCachePolyfill).toHaveBeenCalledWith(
      expect.stringContaining("promptSig=bbbbbbbbbbbbbbbb"),
      null,
      { markdown: "fresh markdown" }
    );
  });
});

describe("apiTranslate prompt queue isolation", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockImplementation(async (text) =>
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

  test("includes translation style and glossary in the shared prompt signature", async () => {
    const glossary = { React: "React", component: "组件" };

    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      glossary,
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        tone: "technical",
        aiTerms: "API,接口",
      },
      useCache: false,
    });

    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      [
        "batch",
        "batch prompt A",
        "technical",
        "API,接口",
        JSON.stringify(Object.entries(glossary).sort()),
      ].join("\n"),
      "prompt-cache"
    );
  });

  test("isolates plain-text and HTML batch queues", async () => {
    const apiSetting = getOpenAiApiSetting("batch prompt A");
    await apiTranslate({
      text: "plain text",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting,
      textFormat: "text",
      useCache: false,
    });
    await apiTranslate({
      text: "<p>HTML</p>",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting,
      textFormat: "html",
      useCache: false,
    });

    const queueKeys = getBatchQueue.mock.calls.map(([key]) => key);
    expect(queueKeys[0]).toContain("_text_");
    expect(queueKeys[1]).toContain("_html_");
    expect(queueKeys[0]).not.toBe(queueKeys[1]);
  });

  test("does not include subtitle prompt in batch queue key", async () => {
    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        subtitlePrompt: "subtitle prompt A",
      },
      useCache: false,
    });
    await apiTranslate({
      text: "world",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        subtitlePrompt: "subtitle prompt B",
      },
      useCache: false,
    });

    const queueKeys = getBatchQueue.mock.calls.map(([key]) => key);
    const signedTexts = mockGetCacheDigest.mock.calls.map(([text]) => text);

    expect(queueKeys).toHaveLength(2);
    expect(queueKeys[0]).toBe(queueKeys[1]);
    expect(signedTexts[0]).not.toContain("subtitle prompt A");
    expect(signedTexts[1]).not.toContain("subtitle prompt B");
  });

  test("does not include prompt slug in batch queue key", async () => {
    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        batchPromptSlug: "prompt_a",
      },
      useCache: false,
    });
    await apiTranslate({
      text: "world",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        batchPromptSlug: "prompt_b",
      },
      useCache: false,
    });

    const queueKeys = getBatchQueue.mock.calls.map(([key]) => key);
    const signedTexts = mockGetCacheDigest.mock.calls.map(([text]) => text);

    expect(queueKeys).toHaveLength(2);
    expect(queueKeys[0]).toBe(queueKeys[1]);
    expect(signedTexts[0]).not.toContain("prompt_a");
    expect(signedTexts[1]).not.toContain("prompt_b");
  });

  test("passes configured batch concurrency and isolates its queue", async () => {
    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        batchConcurrency: 3,
        useContext: false,
      },
      useCache: false,
    });

    expect(getBatchQueue).toHaveBeenCalledWith(
      expect.stringMatching(/_3$/),
      handleTranslate,
      expect.objectContaining({ batchConcurrency: 3 })
    );
  });

  test("forces batch concurrency to one for context sessions", async () => {
    await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        batchConcurrency: 4,
        useContext: true,
      },
      useCache: false,
    });

    expect(getBatchQueue).toHaveBeenCalledWith(
      expect.stringMatching(/_1$/),
      handleTranslate,
      expect.objectContaining({ batchConcurrency: 1 })
    );
  });
});

describe("apiTranslate QwenMT cache identity", () => {
  beforeEach(() => {
    getHttpCachePolyfill.mockResolvedValue(null);
    mockGetCacheDigest.mockImplementation(async (text, salt) =>
      `${salt}:${text}`.padEnd(64, "a")
    );
    handleTranslate.mockImplementation(async function* () {
      yield { id: 0, result: ["translated"] };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("signs style, interface terms, and rule glossary", async () => {
    const apiSetting = {
      ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_QWENMT),
      apiSlug: "qwen_mt_test",
      key: "test-key",
      tone: "technical",
      aiTerms: "component,组件",
    };
    const glossary = { React: "React", component: "规则组件" };

    await apiTranslate({
      text: "hello",
      fromLang: "auto",
      toLang: "en",
      glossary,
      apiSetting,
      useCache: false,
    });

    expect(mockGetCacheDigest).toHaveBeenCalledWith(
      [
        "qwen-mt",
        "technical",
        "component,组件",
        JSON.stringify(Object.entries(glossary).sort()),
      ].join("\n"),
      "prompt-cache"
    );
    expect(getBatchQueue).not.toHaveBeenCalled();
    expect(handleTranslate).toHaveBeenCalledWith(
      ["hello"],
      expect.objectContaining({ glossary, apiSetting })
    );
  });
});

describe("apiTranslate DeepL language mappings", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockResolvedValue("a".repeat(64));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("uses a Traditional Chinese target variant and generic Chinese source for DeepL", async () => {
    const addTask = jest.fn().mockResolvedValue(["繁體譯文", "ZH"]);
    getBatchQueue.mockReturnValue({ addTask });

    const result = await apiTranslate({
      text: "hello",
      fromLang: "zh-TW",
      toLang: "zh-TW",
      apiSetting: {
        ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_DEEPL),
        apiSlug: "deepl_test",
      },
      useCache: false,
    });

    expect(addTask).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ from: "ZH", to: "ZH-HANT" })
    );
    expect(result.srCode).toBe("zh-CN");
  });

  test("uses the variant translation setting for normalized API source languages", async () => {
    const addTask = jest.fn().mockResolvedValue(["繁體譯文", "ZH"]);
    getBatchQueue.mockReturnValue({ addTask });
    const apiSetting = {
      ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_DEEPL),
      apiSlug: "deepl_variant_test",
    };

    const enabled = await apiTranslate({
      text: "简体原文",
      fromLang: "auto",
      toLang: "zh-TW",
      apiSetting,
      useCache: false,
    });
    const disabled = await apiTranslate({
      text: "简体原文",
      fromLang: "auto",
      toLang: "zh-TW",
      apiSetting,
      translateVariants: false,
      useCache: false,
    });

    expect(enabled.isSame).toBe(false);
    expect(disabled.isSame).toBe(true);
  });

  test("does not infer a specific Chinese variant from generic ZH", async () => {
    const addTask = jest.fn().mockResolvedValue(["简体译文", "ZH"]);
    getBatchQueue.mockReturnValue({ addTask });

    const result = await apiTranslate({
      text: "繁體原文",
      fromLang: "auto",
      toLang: "zh-CN",
      apiSetting: {
        ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_DEEPL),
        apiSlug: "deepl_generic_zh_test",
      },
      useCache: false,
    });

    expect(result.srCode).toBe("zh-CN");
    expect(result.isSame).toBe(false);
  });

  test("recomputes a cached generic Chinese language match", async () => {
    getHttpCachePolyfill.mockResolvedValueOnce({
      trText: "简体译文",
      srLang: "ZH",
      srCode: "zh-CN",
      isSame: true,
    });

    const result = await apiTranslate({
      text: "繁體原文",
      fromLang: "auto",
      toLang: "zh-CN",
      apiSetting: {
        ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_DEEPL),
        apiSlug: "deepl_cached_generic_zh_test",
      },
    });

    expect(result.isSame).toBe(false);
    expect(getBatchQueue).not.toHaveBeenCalled();
  });

  test("uses a Traditional Chinese target variant and generic Chinese source for DeepLX", async () => {
    async function* translate() {
      yield { id: 0, result: ["繁體譯文", "ZH"] };
    }
    handleTranslate.mockImplementationOnce(translate);

    const result = await apiTranslate({
      text: "hello",
      fromLang: "zh-TW",
      toLang: "zh-TW",
      apiSetting: {
        ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_DEEPLX),
        apiSlug: "deeplx_test",
      },
      useCache: false,
    });

    expect(handleTranslate).toHaveBeenCalledWith(
      ["hello"],
      expect.objectContaining({ from: "ZH", to: "ZH-HANT" })
    );
    expect(result.srCode).toBe("zh-CN");
  });
});

describe("apiTranslate non-batch stream", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockResolvedValue("a".repeat(64));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("consumes non-batch stream results without the batch queue", async () => {
    const onStreamChunk = jest.fn();
    async function* streamResult() {
      yield { id: 0, partialText: "阶段译文", isComplete: false };
      yield { id: 0, result: ["最终译文", ""] };
    }
    handleTranslate.mockImplementationOnce(streamResult);

    const result = await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        useBatchFetch: false,
        useStream: true,
        streamRenderMode: "realtime",
      },
      onStreamChunk,
      useCache: false,
    });

    expect(result.trText).toBe("最终译文");
    expect(getBatchQueue).not.toHaveBeenCalled();
    expect(handleTranslate).toHaveBeenCalledWith(
      ["hello"],
      expect.objectContaining({
        onStreamChunk,
        apiSetting: expect.objectContaining({
          useBatchFetch: false,
          useStream: true,
        }),
      })
    );
    expect(onStreamChunk).toHaveBeenCalledWith({
      id: 0,
      text: "阶段译文",
      isComplete: false,
    });
    expect(onStreamChunk).toHaveBeenCalledWith({
      id: 0,
      text: ["最终译文", ""],
      isComplete: true,
    });
  });
});

describe("apiTranslate capture 透传", () => {
  // 诊断通路：Playground 的术语测试依赖 apiTranslate 把 capture 原样交给翻译执行体，
  // 删掉 index.js 非批量分支或批量分支的 capture 透传行，对应用例必须变红。
  beforeEach(() => {
    mockGetCacheDigest.mockResolvedValue("a".repeat(64));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("非批量路径把 capture 原样交给 handleTranslate 并触发两端回调", async () => {
    const capture = { onRequest: jest.fn(), onResponse: jest.fn() };
    const rawResponse = { choices: [{ message: { content: "最终译文" } }] };
    handleTranslate.mockImplementationOnce(async function* (texts, options) {
      // 以真实 handleTranslate 的调用位置为准：先请求、后响应。
      options.capture?.onRequest?.(
        "https://api.test/v1/chat/completions",
        { method: "POST", body: "{}" },
        { role: "user", content: texts[0] }
      );
      options.capture?.onResponse?.(rawResponse);
      yield { id: 0, result: ["最终译文", ""] };
    });

    const result = await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: {
        ...getOpenAiApiSetting("batch prompt A"),
        useBatchFetch: false,
      },
      useCache: false,
      capture,
    });

    expect(result.trText).toBe("最终译文");
    expect(getBatchQueue).not.toHaveBeenCalled();
    expect(handleTranslate).toHaveBeenCalledWith(
      ["hello"],
      expect.objectContaining({ capture })
    );
    expect(handleTranslate.mock.calls[0][1].capture).toBe(capture);
    expect(capture.onRequest).toHaveBeenCalledTimes(1);
    expect(capture.onRequest).toHaveBeenCalledWith(
      "https://api.test/v1/chat/completions",
      { method: "POST", body: "{}" },
      { role: "user", content: "hello" }
    );
    expect(capture.onResponse).toHaveBeenCalledTimes(1);
    expect(capture.onResponse.mock.calls[0][0]).toBe(rawResponse);
  });

  test("批量路径把 capture 原样交给批量队列任务并触发两端回调", async () => {
    // 限制说明：libs/batchQueue 在本套件被整体 mock（真实实现是按 key 复用的单例 +
    // 时间窗口合并，直连会引入跨用例耦合与时序抖动），因此这里以白盒方式断言
    // capture 抵达 addTask 的任务参数，再由任务体转交给 handleTranslate 的回调位置。
    const capture = { onRequest: jest.fn(), onResponse: jest.fn() };
    const rawResponse = { choices: [{ message: { content: "batched text" } }] };
    const addTask = jest.fn(async (text, options) => {
      options.capture?.onRequest?.(
        "https://api.test/v1/chat/completions",
        { method: "POST", body: "{}" },
        { role: "user", content: text }
      );
      options.capture?.onResponse?.(rawResponse);
      return ["batched text", ""];
    });
    getBatchQueue.mockImplementation(() => ({ addTask }));

    const result = await apiTranslate({
      text: "hello",
      fromLang: "en",
      toLang: "zh-CN",
      apiSetting: getOpenAiApiSetting("batch prompt A"),
      useCache: false,
      capture,
    });

    expect(result.trText).toBe("batched text");
    expect(getBatchQueue).toHaveBeenCalledTimes(1);
    expect(getBatchQueue.mock.calls[0][1]).toBe(handleTranslate);
    expect(addTask).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ capture })
    );
    expect(addTask.mock.calls[0][1].capture).toBe(capture);
    expect(capture.onRequest).toHaveBeenCalledTimes(1);
    expect(capture.onResponse).toHaveBeenCalledTimes(1);
    expect(capture.onResponse.mock.calls[0][0]).toBe(rawResponse);
  });
});

describe("apiSummarizeVideo and getVideoSummarySignature cache identity", () => {
  beforeEach(() => {
    mockGetCacheDigest.mockReset();
    mockGetCacheDigest.mockImplementation(async (text, salt = "") => {
      let hash = 0;
      const combined = `${text}#${salt}`;
      for (let i = 0; i < combined.length; i++) {
        hash = (hash * 31 + combined.charCodeAt(i)) >>> 0;
      }
      return hash.toString(16).padStart(16, "0").repeat(4);
    });
    handleSummarize.mockReset();
    getHttpCachePolyfill.mockReset();
    putHttpCachePolyfill.mockReset();
  });

  test("getVideoSummarySignature differentiates transcript, title, prompt, and language changes", async () => {
    const baseParams = {
      videoId: "vid_123",
      title: "Video Title",
      description: "Video Description",
      transcript: "This is the transcript content",
      apiSetting: { apiSlug: "openai_chat" },
      prompt: {
        slug: "summary_default",
        systemPrompt: "System instruction {{to}}",
        userPrompt: "Summarize: {{transcript}}",
      },
      to: "zh-CN",
    };

    const baseSig = await getVideoSummarySignature(baseParams);
    const sameSig = await getVideoSummarySignature({ ...baseParams });
    expect(sameSig).toBe(baseSig);

    // 修改字幕内容（如流式字幕补全）
    const changedTranscriptSig = await getVideoSummarySignature({
      ...baseParams,
      transcript: "This is the transcript content with more appended lines",
    });
    expect(changedTranscriptSig).not.toBe(baseSig);

    // 修改标题
    const changedTitleSig = await getVideoSummarySignature({
      ...baseParams,
      title: "Updated Title",
    });
    expect(changedTitleSig).not.toBe(baseSig);

    // 修改简介
    const changedDescSig = await getVideoSummarySignature({
      ...baseParams,
      description: "Updated Description",
    });
    expect(changedDescSig).not.toBe(baseSig);

    // 修改同一 slug 下的 userPrompt 自定义模板
    const changedUserPromptSig = await getVideoSummarySignature({
      ...baseParams,
      prompt: {
        ...baseParams.prompt,
        userPrompt: "Generate bullet points: {{transcript}}",
      },
    });
    expect(changedUserPromptSig).not.toBe(baseSig);

    // 修改同一 slug 下的 systemPrompt
    const changedSysPromptSig = await getVideoSummarySignature({
      ...baseParams,
      prompt: {
        ...baseParams.prompt,
        systemPrompt: "You are an expert summarizer in {{to}}",
      },
    });
    expect(changedSysPromptSig).not.toBe(baseSig);

    // 切换目标语言
    const changedLangSig = await getVideoSummarySignature({
      ...baseParams,
      to: "ja",
    });
    expect(changedLangSig).not.toBe(baseSig);
  });

  test("先生成、再修改输入 回归测试：修改字幕、提示词或语言后能够穿透旧缓存", async () => {
    const cacheMap = new Map();
    getHttpCachePolyfill.mockImplementation(async (key) => cacheMap.get(key));
    putHttpCachePolyfill.mockImplementation(async (key, _meta, val) =>
      cacheMap.set(key, val)
    );

    handleSummarize.mockImplementation(
      async ({ transcript, to }) => `Summary for [${transcript}] in ${to}`
    );

    const baseParams = {
      videoId: "vid_test",
      title: "Test Title",
      description: "Test Desc",
      transcript: "Initial subtitles",
      apiSetting: { apiSlug: "openai", apiType: "OpenAI" },
      prompt: {
        slug: "default_slug",
        systemPrompt: "System",
        userPrompt: "User: {{transcript}}",
      },
      to: "zh-CN",
    };

    // 1. 首次生成
    const res1 = await apiSummarizeVideo(baseParams);
    expect(res1).toBe("Summary for [Initial subtitles] in zh-CN");
    expect(handleSummarize).toHaveBeenCalledTimes(1);

    // 2. 相同输入再次打开总结，命中持久缓存
    const res2 = await apiSummarizeVideo(baseParams);
    expect(res2).toBe("Summary for [Initial subtitles] in zh-CN");
    expect(handleSummarize).toHaveBeenCalledTimes(1);

    // 3. 字幕补全更新后再次请求，缓存失效并重新生成
    const res3 = await apiSummarizeVideo({
      ...baseParams,
      transcript: "Initial subtitles + completed subtitles",
    });
    expect(res3).toBe(
      "Summary for [Initial subtitles + completed subtitles] in zh-CN"
    );
    expect(handleSummarize).toHaveBeenCalledTimes(2);

    // 4. 修改同一 slug 的提示词模板后再次请求，缓存失效并重新生成
    const res4 = await apiSummarizeVideo({
      ...baseParams,
      prompt: {
        ...baseParams.prompt,
        userPrompt: "Custom prompt: {{transcript}}",
      },
    });
    expect(handleSummarize).toHaveBeenCalledTimes(3);

    // 5. 切换目标语言后再次请求，缓存失效并重新生成
    const res5 = await apiSummarizeVideo({
      ...baseParams,
      to: "en",
    });
    expect(res5).toBe("Summary for [Initial subtitles] in en");
    expect(handleSummarize).toHaveBeenCalledTimes(4);

    // 6. force: true 强制重新生成，即使用户输入未变也绕过缓存
    const res6 = await apiSummarizeVideo({
      ...baseParams,
      force: true,
    });
    expect(res6).toBe("Summary for [Initial subtitles] in zh-CN");
    expect(handleSummarize).toHaveBeenCalledTimes(5);
  });
});
