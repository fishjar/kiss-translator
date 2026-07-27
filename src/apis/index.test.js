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
  handleMicrosoftLangdetect: jest.fn(),
}));

import { apiDict, apiSubtitle, apiTranslate } from "./index";
import { handleDict, handleSubtitle, handleTranslate } from "./trans";
import { fnPolyfill } from "../libs/fetch";
import { withTimeout } from "../libs/utils";
import { getBatchQueue } from "../libs/batchQueue";
import { getFetchPool } from "../libs/pool";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import {
  DEFAULT_API_LIST,
  OPT_TRANS_BUILTINAI,
  OPT_TRANS_OPENAI,
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
