/**
 * AIFW 隐私脱敏（mask/restore）在 apiTranslate 请求链路上的集成测试。
 *
 * 关注的不变量：
 * 1. 脱敏只在缓存未命中之后、分发请求之前发生，请求体里是 maskedText；
 * 2. 缓存 key 始终基于原始 text，避免脱敏改变既有缓存身份；
 * 3. 最终返回给调用方、以及写入缓存的 trText 都是 restore 之后的文本；
 * 4. 脱敏期间不透传流式增量（增量里可能仍是占位符），restore 后补发一次完整译文；
 * 5. redaction 为 null 时完全走接入前的逻辑（零回归）。
 */

jest.mock("query-string", () => ({
  stringify: (obj) => new URLSearchParams(obj).toString(),
}));

// 本套件只验证请求链路的接入契约，AIFW 客户端本身由 src/libs/aifw 的用例覆盖。
jest.mock("../libs/aifw", () => ({ createRedaction: jest.fn() }));

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
  parseAITerms: (...args) =>
    jest.requireActual("../libs/utils").parseAITerms(...args),
  sha256: (...args) => mockSha256(...args),
  withTimeout: jest.fn((promise) => promise),
}));

jest.mock("../libs/cacheDigest", () => ({
  getCacheDigest: (...args) => mockGetCacheDigest(...args),
}));

const mockLoggerWarn = jest.fn();

// 只替换 logger，保留 LogLevel 等真实导出（src/config/setting.js 依赖 LogLevel）。
jest.mock("../libs/log", () => {
  const actual = jest.requireActual("../libs/log");
  return {
    ...actual,
    logger: {
      child: () => ({ warn: (...args) => mockLoggerWarn(...args) }),
    },
  };
});

// 这些用例只覆盖翻译链路，字幕/词典/摘要入口保持空实现即可。
jest.mock("./trans", () => ({
  handleTranslate: jest.fn(),
  handleDict: jest.fn(),
  handleSubtitle: jest.fn(),
  buildSubtitleSystemPrompt: jest.fn(),
  formatIndexSubtitleEvents: jest.fn(),
  handleSummarize: jest.fn(),
}));

import { apiTranslate } from "./index";
import { handleTranslate } from "./trans";
import { createRedaction } from "../libs/aifw";
import { getHttpCachePolyfill, putHttpCachePolyfill } from "../libs/cache";
import { getBatchQueue } from "../libs/batchQueue";
import { withTimeout } from "../libs/utils";
import { getFetchPool } from "../libs/pool";
import { DEFAULT_API_LIST, OPT_TRANS_OPENAI } from "../config";

// 原文里包含邮箱，脱敏后请求体用占位符代替。
const PII_TEXT = "请联系 alice@example.com 处理";
const MASKED_TEXT = "请联系 [[EMAIL_1]] 处理";
const MASKED_RESULT = "Please contact [[EMAIL_1]] for this";
const RESTORED_RESULT = "Please contact alice@example.com for this";

const getOpenAiApiSetting = (overrides = {}) => ({
  ...DEFAULT_API_LIST.find((api) => api.apiType === OPT_TRANS_OPENAI),
  apiSlug: "openai_privacy_test",
  key: "test-key",
  model: "test-model",
  useBatchFetch: true,
  useStream: false,
  ...overrides,
});

const makeRedaction = (restore = (translated) => translated) => ({
  maskedText: MASKED_TEXT,
  restore: jest.fn(async (translated) => restore(translated)),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCacheDigest.mockResolvedValue("a".repeat(64));
  getFetchPool.mockReturnValue({ push: (fn, args) => fn(args) });
  withTimeout.mockImplementation((promise) => promise);
  getHttpCachePolyfill.mockResolvedValue(null);
  createRedaction.mockResolvedValue(null);
});

test("批量分支：请求体使用 maskedText，restore 后返回并补发唯一一次完成回调", async () => {
  const redaction = makeRedaction((translated) =>
    translated.replace("[[EMAIL_1]]", "alice@example.com")
  );
  createRedaction.mockResolvedValue(redaction);
  const addTask = jest.fn(async () => [MASKED_RESULT, ""]);
  getBatchQueue.mockImplementation(() => ({ addTask }));
  const onStreamChunk = jest.fn();
  const apiSetting = getOpenAiApiSetting();

  const result = await apiTranslate({
    text: PII_TEXT,
    fromLang: "zh-CN",
    toLang: "en",
    apiSetting,
    useCache: false,
    onStreamChunk,
  });

  // 脱敏门控拿到原始参数与配置。
  expect(createRedaction).toHaveBeenCalledWith(
    expect.objectContaining({
      text: PII_TEXT,
      fromLang: "zh-CN",
      toLang: "en",
    })
  );
  expect(createRedaction.mock.calls[0][0].apiSetting).toBe(apiSetting);
  // 批量队列拿到的是 masked 文本，且脱敏时禁止流式增量透传。
  expect(addTask).toHaveBeenCalledTimes(1);
  expect(addTask.mock.calls[0][0]).toBe(MASKED_TEXT);
  expect(addTask.mock.calls[0][1].onStreamChunk).toBeUndefined();
  // 模型输出的占位符被还原，最终返回值是原文内容。
  expect(redaction.restore).toHaveBeenCalledWith(MASKED_RESULT);
  expect(result.trText).toBe(RESTORED_RESULT);
  // 补发一次完整译文，且没有 partial 增量。
  expect(onStreamChunk).toHaveBeenCalledTimes(1);
  expect(onStreamChunk).toHaveBeenCalledWith({
    id: 0,
    text: RESTORED_RESULT,
    isComplete: true,
  });
});

test("单段分支：handleTranslate 收到 maskedText，partial/complete 均不透传，restore 后补发一次", async () => {
  const redaction = makeRedaction((translated) =>
    translated.replace("[[EMAIL_1]]", "alice@example.com")
  );
  createRedaction.mockResolvedValue(redaction);
  async function* streamResult() {
    yield { id: 0, partialText: "Please [[EMAIL_1]]", isComplete: false };
    yield { id: 0, result: [MASKED_RESULT, ""] };
  }
  handleTranslate.mockImplementationOnce(streamResult);
  const onStreamChunk = jest.fn();

  const result = await apiTranslate({
    text: PII_TEXT,
    fromLang: "zh-CN",
    toLang: "en",
    apiSetting: getOpenAiApiSetting({
      useBatchFetch: false,
      useStream: true,
      streamRenderMode: "realtime",
    }),
    useCache: false,
    onStreamChunk,
  });

  expect(getBatchQueue).not.toHaveBeenCalled();
  expect(handleTranslate).toHaveBeenCalledTimes(1);
  expect(handleTranslate.mock.calls[0][0]).toEqual([MASKED_TEXT]);
  expect(handleTranslate.mock.calls[0][1].onStreamChunk).toBeUndefined();
  expect(result.trText).toBe(RESTORED_RESULT);
  // 只有 restore 之后的一次完整回调，partial 与模型原始 complete 都被抑制。
  expect(onStreamChunk).toHaveBeenCalledTimes(1);
  expect(onStreamChunk).toHaveBeenCalledWith({
    id: 0,
    text: RESTORED_RESULT,
    isComplete: true,
  });
});

test("缓存身份：cache key 使用原始 text，写入缓存的是 restore 之后的 trText", async () => {
  const redaction = makeRedaction((translated) =>
    translated.replace("[[EMAIL_1]]", "alice@example.com")
  );
  createRedaction.mockResolvedValue(redaction);
  getBatchQueue.mockImplementation(() => ({
    addTask: jest.fn(async () => [MASKED_RESULT, ""]),
  }));

  const result = await apiTranslate({
    text: PII_TEXT,
    fromLang: "zh-CN",
    toLang: "en",
    apiSetting: getOpenAiApiSetting(),
    useCache: true,
  });

  const cacheKey = getHttpCachePolyfill.mock.calls[0][0];
  const cachedKey = putHttpCachePolyfill.mock.calls[0][0];
  expect(new URL(cacheKey).searchParams.get("text")).toBe(PII_TEXT);
  expect(cachedKey).toBe(cacheKey);
  expect(new URL(cachedKey).searchParams.get("text")).toBe(PII_TEXT);
  // 缓存里存的必须是还原后的文本，不能是占位符。
  expect(putHttpCachePolyfill).toHaveBeenCalledWith(
    cacheKey,
    null,
    expect.objectContaining({ trText: RESTORED_RESULT })
  );
  expect(result.trText).toBe(RESTORED_RESULT);
});

test("缓存命中时不做脱敏，直接返回缓存结果", async () => {
  const cached = { trText: "cached translation", srLang: "en", srCode: "en" };
  getHttpCachePolyfill.mockResolvedValue(cached);

  const result = await apiTranslate({
    text: PII_TEXT,
    fromLang: "zh-CN",
    toLang: "en",
    apiSetting: getOpenAiApiSetting(),
    useCache: true,
  });

  expect(result.trText).toBe("cached translation");
  expect(createRedaction).not.toHaveBeenCalled();
  expect(handleTranslate).not.toHaveBeenCalled();
  expect(getBatchQueue).not.toHaveBeenCalled();
  expect(putHttpCachePolyfill).not.toHaveBeenCalled();
});

test("redaction 为 null 时零回归：原文下发、流式增量照旧、缓存写入模型译文", async () => {
  createRedaction.mockResolvedValue(null);
  async function* streamResult() {
    yield { id: 0, partialText: "增量译文", isComplete: false };
    yield { id: 0, result: ["最终译文", "en"] };
  }
  handleTranslate.mockImplementationOnce(streamResult);
  const onStreamChunk = jest.fn();

  const result = await apiTranslate({
    text: "hello",
    fromLang: "en",
    toLang: "zh-CN",
    apiSetting: getOpenAiApiSetting({
      useBatchFetch: false,
      useStream: true,
    }),
    useCache: true,
    onStreamChunk,
  });

  expect(createRedaction).toHaveBeenCalledTimes(1);
  expect(handleTranslate.mock.calls[0][0]).toEqual(["hello"]);
  expect(handleTranslate.mock.calls[0][1].onStreamChunk).toBe(onStreamChunk);
  expect(onStreamChunk.mock.calls).toEqual([
    [{ id: 0, text: "增量译文", isComplete: false }],
    [{ id: 0, text: ["最终译文", "en"], isComplete: true }],
  ]);
  expect(result.trText).toBe("最终译文");

  const cacheKey = getHttpCachePolyfill.mock.calls[0][0];
  expect(new URL(cacheKey).searchParams.get("text")).toBe("hello");
  expect(putHttpCachePolyfill).toHaveBeenCalledWith(
    cacheKey,
    null,
    expect.objectContaining({ trText: "最终译文" })
  );
});

test("restore 抛错时不使翻译失败：保留模型原始译文并记录诊断日志", async () => {
  createRedaction.mockResolvedValue({
    maskedText: MASKED_TEXT,
    restore: jest.fn(async () => {
      throw new Error("restore boom");
    }),
  });
  getBatchQueue.mockImplementation(() => ({
    addTask: jest.fn(async () => [MASKED_RESULT, ""]),
  }));

  const result = await apiTranslate({
    text: PII_TEXT,
    fromLang: "zh-CN",
    toLang: "en",
    apiSetting: getOpenAiApiSetting(),
    useCache: false,
  });

  expect(result.trText).toBe(MASKED_RESULT);
  expect(mockLoggerWarn).toHaveBeenCalledWith(
    "aifw restore failed",
    expect.any(Error)
  );
});
